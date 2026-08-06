#!/usr/bin/env python3
"""
shadow_pulse_demo.py — Scan d'exposition d'un domaine cible.

Modules :
  - Typosquatting : dnstwist
  - Emails exposés : Hunter.io API
  - Fuites de credentials : Have I Been Pwned API
  - Surface DNS/SSL/HTTP : DNS-over-HTTPS Cloudflare + requests

Usage :
  python shadow_pulse_demo.py --domain cabinet-exemple.fr
  python shadow_pulse_demo.py --domain cabinet-exemple.fr --json

Variables d'environnement requises (fichier .env) :
  HUNTER_API_KEY   — clé Hunter.io
  HIBP_API_KEY     — clé Have I Been Pwned
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
HIBP_API_KEY = os.environ.get("HIBP_API_KEY", "")

DOH_URL = "https://cloudflare-dns.com/dns-query"
HUNTER_URL = "https://api.hunter.io/v2/domain-search"
HIBP_DOMAIN_URL = "https://haveibeenpwned.com/api/v3/breacheddomain/{domain}"

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


# ─── Have I Been Pwned ───────────────────────────────────────────────────────

def scan_hibp(domain: str) -> dict:
    if not HIBP_API_KEY:
        return {"error": "HIBP_API_KEY non configurée"}
    try:
        resp = requests.get(
            HIBP_DOMAIN_URL.format(domain=domain),
            headers={
                "hibp-api-key": HIBP_API_KEY,
                "User-Agent": "ShadowPulse-SecurityScanner/1.0",
            },
            timeout=10,
        )
        if resp.status_code == 404:
            return {"breaches": [], "breach_count": 0}
        resp.raise_for_status()
        breaches = resp.json()
        return {"breach_count": len(breaches), "breaches": list(breaches.keys())}
    except requests.HTTPError as e:
        return {"error": f"HIBP API {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"error": str(e)}


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

    # Fuites HIBP
    hibp = results.get("hibp", {})
    breach_count = hibp.get("breach_count", 0)
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

    if HIBP_API_KEY:
        print("    Have I Been Pwned …")
        results["hibp"] = scan_hibp(domain)

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

    hibp = r.get("hibp", {})
    if "error" not in hibp:
        bc = hibp.get("breach_count", 0)
        print(f"\n  HIBP : {bc} fuite(s) — {hibp.get('breaches', [])}")

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
