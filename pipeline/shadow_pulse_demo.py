#!/usr/bin/env python3
"""
shadow_pulse_demo.py — Scan d'exposition d'un domaine cible.

Modules :
  - Typosquatting : dnstwist
  - Emails exposés : Hunter.io API
  - Fuites de credentials : XposedOrNot API (gratuit, sans clé)
  - Surface DNS/SSL/HTTP : DNS-over-HTTPS Cloudflare + requests

Usage :
  python shadow_pulse_demo.py --domain cabinet-exemple.fr
  python shadow_pulse_demo.py --domain cabinet-exemple.fr --json

Variables d'environnement (fichier .env) :
  HUNTER_API_KEY   — clé Hunter.io (optionnelle)

XposedOrNot : aucune clé requise. Quota : 25 req/heure, 100 req/jour.
Throttle interne : 2 s minimum entre chaque appel.
"""

import argparse
import json
import os
import socket
import sys
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

HUNTER_API_KEY = os.environ.get("HUNTER_API_KEY", "")

DOH_URL = "https://cloudflare-dns.com/dns-query"
HUNTER_URL = "https://api.hunter.io/v2/domain-search"
XON_EMAIL_URL = "https://api.xposedornot.com/v1/check-email/{email}"

# Throttle XposedOrNot : 2 s entre appels, quota 25/heure 100/jour.
XON_THROTTLE_SECS = 2.0
_xon_quota_reached = False  # flag module-level pour court-circuiter le batch proprement

RECORD_TYPES = ["A", "MX", "TXT", "NS", "CNAME"]


# ─── DNS-over-HTTPS ───────────────────────────────────────────────────────────

def doh_query(domain: str, rtype: str) -> list[str]:
    """Résoud un enregistrement DNS via Cloudflare DoH (contourne le DNS local)."""
    try:
        resp = requests.get(
            DOH_URL,
            params={"name": domain, "type": rtype},
            headers={"Accept": "application/dns-json"},
            timeout=6,
        )
        resp.raise_for_status()
        data = resp.json()
        return [a["data"] for a in data.get("Answer", [])]
    except Exception:
        return []


def scan_dns(domain: str) -> dict:
    records = {}
    for rtype in RECORD_TYPES:
        results = doh_query(domain, rtype)
        if results:
            records[rtype] = results
    return records


# ─── SSL ─────────────────────────────────────────────────────────────────────

def scan_ssl(domain: str) -> dict:
    """Vérifie que le certificat SSL est valide et récupère son expiration."""
    import ssl
    result = {"has_ssl": False, "expires": None, "days_left": None, "error": None}
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.socket(), server_hostname=domain) as s:
            s.settimeout(6)
            s.connect((domain, 443))
            cert = s.getpeercert()
        not_after = cert.get("notAfter", "")
        if not_after:
            exp = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            days_left = (exp - datetime.now(timezone.utc)).days
            result.update({"has_ssl": True, "expires": not_after, "days_left": days_left})
        else:
            result["has_ssl"] = True
    except ssl.SSLCertVerificationError as e:
        result["error"] = f"Cert invalide : {e}"
    except Exception as e:
        result["error"] = str(e)
    return result


# ─── HTTP Headers ─────────────────────────────────────────────────────────────

SECURITY_HEADERS = [
    "Strict-Transport-Security",
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
]


def scan_http_headers(domain: str) -> dict:
    result = {"reachable": False, "status_code": None, "missing_headers": [], "present_headers": {}}
    for scheme in ("https", "http"):
        try:
            resp = requests.get(
                f"{scheme}://{domain}",
                timeout=8,
                allow_redirects=True,
                headers={"User-Agent": "ShadowPulse-SecurityScanner/1.0"},
            )
            result["reachable"] = True
            result["status_code"] = resp.status_code
            result["final_url"] = resp.url
            for h in SECURITY_HEADERS:
                if h.lower() in {k.lower() for k in resp.headers}:
                    result["present_headers"][h] = resp.headers.get(h)
                else:
                    result["missing_headers"].append(h)
            break
        except Exception:
            continue
    return result


# ─── Typosquatting (dnstwist) ────────────────────────────────────────────────

def scan_typosquatting(domain: str) -> list[dict]:
    """Lance dnstwist en subprocess pour éviter les conflits de threading."""
    import subprocess
    try:
        proc = subprocess.run(
            ["dnstwist", "--registered", "--format", "json", domain],
            capture_output=True, text=True, timeout=60,
        )
        if proc.returncode != 0:
            return [{"error": proc.stderr.strip()}]
        return json.loads(proc.stdout)
    except FileNotFoundError:
        return [{"error": "dnstwist non installé — pip install dnstwist"}]
    except subprocess.TimeoutExpired:
        return [{"error": "Timeout dnstwist (>60s)"}]
    except json.JSONDecodeError:
        return []


# ─── Hunter.io ───────────────────────────────────────────────────────────────

def scan_hunter(domain: str) -> dict:
    if not HUNTER_API_KEY:
        return {"error": "HUNTER_API_KEY non configurée"}
    try:
        resp = requests.get(
            HUNTER_URL,
            params={"domain": domain, "api_key": HUNTER_API_KEY, "limit": 10},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json().get("data", {})
        return {
            "total_emails": data.get("total", 0),
            "emails": [
                {"email": e["value"], "type": e.get("type"), "confidence": e.get("confidence")}
                for e in data.get("emails", [])
            ],
            "pattern": data.get("pattern"),
        }
    except requests.HTTPError as e:
        return {"error": f"Hunter API {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"error": str(e)}


# ─── Email guess + SMTP verify ───────────────────────────────────────────────

import random
import smtplib
import string
import unicodedata

import dns.resolver

SMTP_TIMEOUT   = 8    # secondes par connexion
SMTP_DELAY     = 1.5  # secondes entre deux checks (anti-throttle)
SMTP_HELO      = "shadowpulse.fr"
SMTP_FROM      = "verify@shadowpulse.fr"


def _normalize(s: str) -> str:
    """Minuscules + suppression accents + garde lettres/chiffres/tirets."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def _parse_dirigeant(dirigeant: str) -> tuple[str, str]:
    """
    Extrait (prénom, nom) depuis le champ dirigeant API.
    Format habituel : 'PRENOM NOM' ou 'PRENOM NOM (NOM_NAISSANCE)'.
    """
    # Retire la partie entre parenthèses (nom de naissance)
    base = dirigeant.split("(")[0].strip()
    parts = base.split()
    if len(parts) == 0:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    # Convention API : PRENOMS d'abord, NOM en dernier
    # Heuristique : si tout en majuscules (cas API), 1er token = prénom, reste = nom
    prenom = _normalize(parts[0])
    nom    = _normalize(parts[-1])
    return prenom, nom


def generate_email_patterns(dirigeant: str, domaine: str) -> list[str]:
    """
    Génère les patterns d'email les plus probables pour un dirigeant.
    Ordre décroissant de fréquence en France B2B.
    """
    prenom, nom = _parse_dirigeant(dirigeant)
    if not prenom or not nom:
        return []
    p, n = prenom, nom
    p1 = p[0] if p else ""
    n1 = n[0] if n else ""
    candidates = [
        f"{p}.{n}@{domaine}",       # prenom.nom  (le plus commun)
        f"{p1}.{n}@{domaine}",      # p.nom
        f"{p}@{domaine}",           # prenom
        f"{p}{n}@{domaine}",        # prenomnom
        f"{p1}{n}@{domaine}",       # pnom
        f"{n}.{p}@{domaine}",       # nom.prenom
        f"{n}@{domaine}",           # nom seul
        f"contact@{domaine}",       # fallback générique
    ]
    # Déduplique en préservant l'ordre
    seen, unique = set(), []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)
    return unique


def _get_mx(domaine: str) -> str | None:
    """Retourne le MX de plus haute priorité ou None."""
    try:
        records = dns.resolver.resolve(domaine, "MX", lifetime=5)
        best = sorted(records, key=lambda r: r.preference)[0]
        return str(best.exchange).rstrip(".")
    except Exception:
        return None


def _smtp_probe(mx: str, email: str) -> str:
    """
    Sonde SMTP RCPT TO sans envoyer.
    Retourne : 'accepted' | 'rejected' | 'inconclusive'
    """
    try:
        with smtplib.SMTP(timeout=SMTP_TIMEOUT) as s:
            s.connect(mx, 25)
            s.ehlo(SMTP_HELO)
            code_from, _ = s.docmd("MAIL FROM:", f"<{SMTP_FROM}>")
            if code_from not in (250, 251):
                return "inconclusive"
            code_rcpt, _ = s.docmd("RCPT TO:", f"<{email}>")
            s.quit()
            if code_rcpt in (250, 251):
                return "accepted"
            if code_rcpt in (550, 551, 552, 553, 554, 450, 451, 452):
                return "rejected"
            return "inconclusive"
    except Exception:
        return "inconclusive"


def _is_catchall(mx: str, domaine: str) -> bool:
    """
    Détecte un domaine catch-all en testant une adresse aléatoire.
    Si le serveur accepte un email manifestement invalide → catch-all.
    """
    rand_local = "zzz_" + "".join(random.choices(string.ascii_lowercase, k=10)) + "_test"
    probe_addr = f"{rand_local}@{domaine}"
    result = _smtp_probe(mx, probe_addr)
    return result == "accepted"


def guess_and_verify_email(dirigeant: str, domaine: str) -> dict:
    """
    Génère les patterns d'email probables pour un dirigeant et vérifie via SMTP.

    Retourne un dict avec :
      email_guess     : adresse retenue (ou None)
      email_confiance : 'email_haute' | 'email_catchall' | 'email_invalid' | 'email_inconclusive'
      email_pattern   : pattern utilisé (ex: 'prenom.nom')
    """
    patterns = generate_email_patterns(dirigeant, domaine)
    if not patterns:
        return {"email_guess": None, "email_confiance": "email_inconclusive", "email_pattern": None}

    mx = _get_mx(domaine)
    if not mx:
        return {"email_guess": None, "email_confiance": "email_inconclusive", "email_pattern": None}

    # Détection catch-all (1 probe supplémentaire)
    time.sleep(SMTP_DELAY)
    catchall = _is_catchall(mx, domaine)

    # On teste les patterns dans l'ordre jusqu'au premier 'accepted'
    for candidate in patterns:
        time.sleep(SMTP_DELAY)
        result = _smtp_probe(mx, candidate)

        if result == "accepted":
            # Extraire le pattern depuis l'adresse
            local = candidate.split("@")[0]
            confiance = "email_catchall" if catchall else "email_haute"
            return {
                "email_guess": candidate,
                "email_confiance": confiance,
                "email_pattern": local,
            }
        if result == "rejected":
            continue
        # inconclusive : on arrête pour ce domaine, pas fiable
        return {"email_guess": None, "email_confiance": "email_inconclusive", "email_pattern": None}

    # Aucun pattern accepté
    return {"email_guess": None, "email_confiance": "email_invalid", "email_pattern": None}


# ─── XposedOrNot ─────────────────────────────────────────────────────────────

def xon_check_email(email: str) -> dict:
    """
    Vérifie si un email apparaît dans des fuites publiques via XposedOrNot.
    Quota : 25 req/heure, 100 req/jour — aucune clé requise.
    Throttle appelant : respecter XON_THROTTLE_SECS entre appels successifs.

    Retourne :
      {"breaches": [...], "breach_count": N}   si des fuites trouvées
      {"breaches": [], "breach_count": 0}       si rien trouvé
      {"error": "quota_horaire"}                si HTTP 429
      {"error": "<message>"}                    si autre erreur
    """
    global _xon_quota_reached
    if _xon_quota_reached:
        return {"error": "quota_horaire"}
    try:
        resp = requests.get(
            XON_EMAIL_URL.format(email=email),
            headers={"User-Agent": "ShadowPulse-SecurityScanner/1.0"},
            timeout=10,
        )
        if resp.status_code == 429:
            _xon_quota_reached = True
            print("\n[!] Plafond horaire XposedOrNot atteint — relance dans 1h. "
                  "Scans suivants ignorés pour ce module.", file=sys.stderr)
            return {"error": "quota_horaire"}
        resp.raise_for_status()
        data = resp.json()
        if "Error" in data:
            return {"breaches": [], "breach_count": 0}
        # breaches est [[nom1, nom2, ...]] — le sous-tableau est toujours à l'index 0
        breach_names = data.get("breaches", [[]])[0] if data.get("breaches") else []
        return {"breaches": breach_names, "breach_count": len(breach_names)}
    except requests.HTTPError as e:
        return {"error": f"XON API {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"error": str(e)}


def scan_xon(domain: str, hunter_result: dict) -> dict:
    """
    Checke UN SEUL email par domaine (le premier de la liste Hunter, s'il existe)
    pour préserver le quota de 25 req/heure sur un run multi-cabinets.
    Applique le throttle XON_THROTTLE_SECS avant l'appel.
    """
    if _xon_quota_reached:
        return {"error": "quota_horaire", "skipped": True}

    emails = hunter_result.get("emails", [])
    if not emails:
        return {"breaches": [], "breach_count": 0, "checked_email": None, "note": "aucun email Hunter disponible"}

    target = emails[0]["email"]
    time.sleep(XON_THROTTLE_SECS)
    result = xon_check_email(target)
    result["checked_email"] = target
    return result


# ─── Score d'exposition ───────────────────────────────────────────────────────

def compute_exposure_score(results: dict) -> int:
    """
    Score de 0 à 100 — plus il est élevé, plus le domaine est exposé.
    Utilisé pour trier les prospects dans full_pipeline.py.
    """
    score = 0

    # SSL absent ou expirant bientôt
    ssl = results.get("ssl", {})
    if ssl.get("error") or not ssl.get("has_ssl"):
        score += 20
    elif ssl.get("days_left") is not None and ssl["days_left"] < 30:
        score += 10

    # Headers de sécurité manquants (max 24 pts : 4 pts × 6 headers)
    http = results.get("http", {})
    score += len(http.get("missing_headers", [])) * 4

    # Fuites XposedOrNot
    xon = results.get("xon", {})
    breach_count = xon.get("breach_count", 0)
    if breach_count > 0:
        score += min(20, breach_count * 5)

    # Typosquatting enregistrés
    typo = results.get("typosquatting", [])
    registered = [t for t in typo if isinstance(t, dict) and "error" not in t]
    score += min(12, len(registered) * 2)

    # Pas de site web accessible
    if not http.get("reachable"):
        score += 8

    return min(100, score)


# ─── Main ─────────────────────────────────────────────────────────────────────

def scan_domain(domain: str) -> dict:
    print(f"[*] Scan de {domain} …")
    results = {
        "domain": domain,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }

    print("    DNS …")
    results["dns"] = scan_dns(domain)

    print("    SSL …")
    results["ssl"] = scan_ssl(domain)

    print("    HTTP headers …")
    results["http"] = scan_http_headers(domain)

    print("    Typosquatting (dnstwist) …")
    results["typosquatting"] = scan_typosquatting(domain)

    if HUNTER_API_KEY:
        print("    Hunter.io …")
        results["hunter"] = scan_hunter(domain)
        time.sleep(0.5)

    print("    XposedOrNot …")
    results["xon"] = scan_xon(domain, results.get("hunter", {}))

    results["exposure_score"] = compute_exposure_score(results)
    return results


def print_report(r: dict) -> None:
    print(f"\n{'='*60}")
    print(f"  RAPPORT D'EXPOSITION — {r['domain']}")
    print(f"  Scanné le : {r['scanned_at']}")
    print(f"{'='*60}")

    print(f"\n  Score d'exposition : {r['exposure_score']}/100")

    ssl = r.get("ssl", {})
    if ssl.get("has_ssl"):
        print(f"\n  SSL : OK — expire dans {ssl.get('days_left')} jours ({ssl.get('expires')})")
    else:
        print(f"\n  SSL : ABSENT ou ERREUR — {ssl.get('error', 'N/A')}")

    http = r.get("http", {})
    if http.get("reachable"):
        print(f"\n  HTTP : {http['status_code']} — {http.get('final_url')}")
        missing = http.get("missing_headers", [])
        if missing:
            print(f"  Headers manquants ({len(missing)}) : {', '.join(missing)}")
    else:
        print("\n  HTTP : site inaccessible")

    typo = [t for t in r.get("typosquatting", []) if isinstance(t, dict) and "error" not in t]
    print(f"\n  Typosquatting : {len(typo)} domaine(s) enregistré(s) détecté(s)")
    for t in typo[:5]:
        print(f"    - {t.get('domain')} ({t.get('fuzzer')})")

    hunter = r.get("hunter", {})
    if "error" not in hunter:
        print(f"\n  Hunter.io : {hunter.get('total_emails', 0)} email(s) indexé(s)")

    xon = r.get("xon", {})
    if xon.get("error") == "quota_horaire":
        print(f"\n  XposedOrNot : quota horaire atteint — module ignoré")
    elif "error" not in xon:
        bc = xon.get("breach_count", 0)
        email_checked = xon.get("checked_email") or "—"
        print(f"\n  XposedOrNot : {bc} fuite(s) pour {email_checked} — {xon.get('breaches', [])[:5]}")

    print(f"\n{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(description="ShadowPulse — scan d'exposition d'un domaine")
    parser.add_argument("--domain", required=True, help="Domaine à scanner (ex: cabinet-exemple.fr)")
    parser.add_argument("--json", action="store_true", help="Sortie JSON brute")
    args = parser.parse_args()

    results = scan_domain(args.domain)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        print_report(results)


if __name__ == "__main__":
    main()
