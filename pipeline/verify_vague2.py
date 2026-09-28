#!/usr/bin/env python3
"""
verify_vague2.py — Re-vérification fraîche des 7 domaines de la vague 2.

Mesures : SSL (handshake TLS direct), HTTP headers, typosquatting (dnstwist),
          breach (XposedOrNot), MX.

Usage (Windows) :
  py verify_vague2.py
  py verify_vague2.py --no-typo      # sauter dnstwist si non installé
  py verify_vague2.py --no-breach    # sauter XON (quota épuisé)

Dépendances : requests, dnspython  (pip install requests dnspython)
              dnstwist              (pip install dnstwist)
"""

import argparse
import csv
import json
import socket
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone

NM = "non mesuré"   # valeur unique pour tout champ non mesuré

# ─── Cibles ──────────────────────────────────────────────────────────────────

TARGETS = [
    {"domain": "comandex.fr",     "email": "contact@comandex.fr"},
    {"domain": "aaci.fr",         "email": "joel.dechenoix@aaci.fr"},
    {"domain": "bs-experts.fr",   "email": "g.conti@bs-experts.fr"},
    {"domain": "comby.fr",        "email": "b.comby@comby.fr"},
    {"domain": "lamy-experts.fr", "email": "carine.debret@lamy-experts.fr"},
    {"domain": "ipso-facto.fr",   "email": "opoirson@ipso-facto.fr"},
    {"domain": "etchecom.fr",     "email": "l.loureiro@etchecom.fr"},
]

SECURITY_HEADERS = [
    "Strict-Transport-Security",
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
]

XON_URL    = "https://api.xposedornot.com/v1/check-email/{email}"
XON_DELAY  = 2.0   # secondes entre appels

# Catégorisation manuelle des sources XON connues (compléter au besoin)
BREACH_CATEGORIES = {
    "Collection #1": "compilation de credentials",
    "Collection #2-5": "compilation de credentials",
    "LinkedIn": "service grand public",
    "Adobe": "service grand public",
    "Dropbox": "service grand public",
    "Exactis": "agrégateur B2B",
    "Apollo": "agrégateur B2B",
    "Data&Leads": "agrégateur B2B",
    "LeadHunter": "agrégateur B2B",
    "Verifications.io": "agrégateur B2B",
    "Cit0day": "compilation de credentials",
    "AntiPublic": "compilation de credentials",
    "Exploit.in": "compilation de credentials",
    "Facebook": "service grand public",
    "Twitter": "service grand public",
    "MyFitnessPal": "service grand public",
    "Canva": "service grand public",
    "Dubsmash": "service grand public",
    "Wattpad": "service grand public",
    "RedLine": "infostealer",
    "Raccoon": "infostealer",
    "Vidar": "infostealer",
    "META": "infostealer",
}

def breach_category(name: str) -> str:
    for k, v in BREACH_CATEGORIES.items():
        if k.lower() in name.lower():
            return v
    return "inconnu"


# ─── 1. SSL ──────────────────────────────────────────────────────────────────

def _ssl_direct(domain: str) -> dict:
    """Handshake TLS direct, SNI. Ne passe par aucun proxy."""
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((domain, 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert()
        not_after_str = cert.get("notAfter", "")
        not_after = datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        days_left = (not_after - datetime.now(timezone.utc)).days
        issuer_parts = {k: v for tup in cert.get("issuer", []) for k, v in tup}
        issuer = issuer_parts.get("organizationName", issuer_parts.get("commonName", "?"))
        return {
            "ssl_source": "tls_direct",
            "ssl_ok": True,
            "ssl_not_after": not_after.strftime("%Y-%m-%d"),
            "ssl_days_left": days_left,
            "ssl_issuer": issuer,
            "ssl_error": "",
        }
    except ssl.SSLCertVerificationError as e:
        return {"ssl_source": "tls_direct", "ssl_ok": False,
                "ssl_not_after": NM, "ssl_days_left": NM,
                "ssl_issuer": NM, "ssl_error": f"cert invalide: {e}"}
    except (OSError, ssl.SSLError) as e:
        return {"ssl_source": "tls_direct", "ssl_ok": NM,
                "ssl_not_after": NM, "ssl_days_left": NM,
                "ssl_issuer": NM, "ssl_error": str(e)}


def _ssl_ctlog(domain: str, retries: int = 3) -> dict:
    """Secondaire : crt.sh CT logs."""
    url = f"https://crt.sh/?q={domain}&output=json"
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "verify_vague2/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                certs = json.loads(resp.read())
            now = datetime.now(timezone.utc)
            active = []
            for c in certs:
                try:
                    na = datetime.strptime(c["not_after"], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
                    if na > now:
                        active.append((na, c))
                except Exception:
                    pass
            if not active:
                return {"ctlog_has_active": False, "ctlog_not_after": NM,
                        "ctlog_days_left": NM, "ctlog_issuer": NM}
            active.sort(key=lambda x: x[0], reverse=True)
            best_na, best = active[0]
            days = (best_na - now).days
            return {
                "ctlog_has_active": True,
                "ctlog_not_after": best_na.strftime("%Y-%m-%d"),
                "ctlog_days_left": days,
                "ctlog_issuer": best.get("issuer_name", "?")[:80],
            }
        except Exception as e:
            if attempt < retries:
                time.sleep(2 ** attempt)
            else:
                return {"ctlog_has_active": NM, "ctlog_not_after": NM,
                        "ctlog_days_left": NM, "ctlog_issuer": NM,
                        "ctlog_error": str(e)}
    return {}


def measure_ssl(domain: str) -> dict:
    direct = _ssl_direct(domain)
    ctlog  = _ssl_ctlog(domain)
    return {**direct, **ctlog}


# ─── 2. HTTP headers ─────────────────────────────────────────────────────────

def measure_headers(domain: str) -> dict:
    import urllib.request as ur
    import urllib.error
    url = f"https://{domain}"
    try:
        req = ur.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with ur.urlopen(req, timeout=12) as resp:
            status = resp.status
            headers = {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as e:
        status = e.code
        headers = {k.lower(): v for k, v in e.headers.items()}
    except Exception as e:
        return {
            "http_status": NM,
            "http_error": str(e),
            **{f"hdr_{h.lower().replace('-','_')}": NM for h in SECURITY_HEADERS},
            "missing_headers": NM,
        }

    result = {"http_status": status, "http_error": ""}
    if status in (403, 500, 502, 503, 504):
        result["http_warning"] = f"statut {status} — mesure peu fiable"

    missing = []
    for h in SECURITY_HEADERS:
        present = h.lower() in headers
        key = f"hdr_{h.lower().replace('-','_')}"
        result[key] = "présent" if present else "absent"
        if not present:
            missing.append(h)
    result["missing_headers"] = "|".join(missing) if missing else ""
    result["missing_headers_count"] = len(missing)
    return result


# ─── 3. Typosquatting ────────────────────────────────────────────────────────

def _dnstwist_run(domain: str) -> list:
    """
    Lance dnstwist via le module Python (import direct).
    Si le module est absent, lève RuntimeError bruyamment — jamais 0 en silence.
    """
    try:
        import dnstwist
    except ImportError:
        raise RuntimeError(
            "dnstwist non trouvé. Installe-le : pip install dnstwist\n"
            "Ou relance avec --no-typo pour sauter cette étape."
        )
    try:
        fuzz = dnstwist.Fuzzer(domain)
        fuzz.generate()
        fuzz.permutations(registered=True)
        return fuzz.domains
    except Exception as e:
        raise RuntimeError(f"dnstwist.Fuzzer a échoué : {e}")


def _has_mx(domain: str) -> bool:
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX", lifetime=5)
        return len(answers) > 0
    except Exception:
        return False


def measure_typosquatting(domain: str, skip: bool = False) -> dict:
    if skip:
        return {"typo_status": "sauté (--no-typo)", "typo_count": NM,
                "typo_registered": NM, "typo_mx_list": NM}
    try:
        domains = _dnstwist_run(domain)
    except RuntimeError as e:
        return {"typo_status": f"non mesuré — {e}", "typo_count": NM,
                "typo_registered": NM, "typo_mx_list": NM}

    registered = [d for d in domains if d.get("dns-a") or d.get("dns-aaaa") or d.get("dns-ns")]
    mx_active = [d["domain"] for d in registered if _has_mx(d["domain"])]
    return {
        "typo_status": "mesuré",
        "typo_count": len(registered),
        "typo_registered": "|".join(d["domain"] for d in registered[:20]),
        "typo_mx_list": "|".join(mx_active) if mx_active else "",
    }


# ─── 4. XON breach ───────────────────────────────────────────────────────────

_xon_quota = False

def measure_breach(email: str, skip: bool = False) -> dict:
    global _xon_quota
    if skip:
        return {"breach_status": "sauté (--no-breach)", "breach_count": NM, "breaches": NM}
    if _xon_quota:
        return {"breach_status": "quota atteint (429)", "breach_count": NM, "breaches": NM}

    url = XON_URL.format(email=email)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "verify_vague2/1.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read())
        breaches_raw = data.get("breaches", [])
        if not breaches_raw:
            return {"breach_status": "mesuré", "breach_count": 0, "breaches": ""}
        # XON retourne soit une liste de noms, soit une liste de dicts
        details = []
        for b in breaches_raw:
            name = b if isinstance(b, str) else b.get("breachID", str(b))
            cat  = breach_category(name)
            details.append(f"{name} [{cat}]")
        return {
            "breach_status": "mesuré",
            "breach_count": len(details),
            "breaches": "|".join(details),
        }
    except urllib.error.HTTPError as e:
        if e.code == 429:
            _xon_quota = True
            return {"breach_status": "quota atteint (429)", "breach_count": NM, "breaches": NM}
        if e.code == 404:
            # XON retourne 404 quand l'email n'est dans aucun breach
            return {"breach_status": "mesuré", "breach_count": 0, "breaches": ""}
        return {"breach_status": f"non mesuré — HTTP {e.code}", "breach_count": NM, "breaches": NM}
    except Exception as e:
        return {"breach_status": f"non mesuré — {e}", "breach_count": NM, "breaches": NM}


# ─── 5. MX ───────────────────────────────────────────────────────────────────

def measure_mx(domain: str) -> dict:
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX", lifetime=8)
        records = sorted(
            [(r.preference, str(r.exchange).rstrip(".")) for r in answers],
            key=lambda x: x[0],
        )
        return {
            "mx_status": "mesuré",
            "mx_records": "|".join(f"{pref} {ex}" for pref, ex in records),
        }
    except ImportError:
        # Fallback sans dnspython
        try:
            import subprocess
            out = subprocess.check_output(
                ["nslookup", "-type=MX", domain], timeout=8,
                stderr=subprocess.DEVNULL, text=True,
            )
            lines = [l for l in out.splitlines() if "mail exchanger" in l.lower()]
            return {
                "mx_status": "mesuré (nslookup)",
                "mx_records": "|".join(lines[:5]),
            }
        except Exception as e:
            return {"mx_status": f"non mesuré — {e}", "mx_records": NM}
    except Exception as e:
        return {"mx_status": f"non mesuré — {e}", "mx_records": NM}


# ─── Affichage terminal ───────────────────────────────────────────────────────

def print_report(t: dict, r: dict) -> None:
    sep = "─" * 65
    print(f"\n{sep}")
    print(f"  {t['domain']}  ({t['email']})")
    print(sep)

    # SSL
    ssl_ok = r.get("ssl_ok")
    if ssl_ok is True:
        print(f"  SSL  ✓  expire {r['ssl_not_after']}  ({r['ssl_days_left']}j)  — {r['ssl_issuer']}")
    elif ssl_ok is False:
        print(f"  SSL  ✗  cert invalide — {r.get('ssl_error','')}")
    else:
        print(f"  SSL  ?  non mesuré — {r.get('ssl_error','')}")
    ctlog_ok = r.get("ctlog_has_active")
    if ctlog_ok is True:
        print(f"       CT logs : actif jusqu'au {r['ctlog_not_after']} ({r['ctlog_days_left']}j)")
    elif ctlog_ok is False:
        print(f"       CT logs : aucun cert actif trouvé")
    else:
        print(f"       CT logs : {NM}  {r.get('ctlog_error','')}")

    # Headers
    status = r.get("http_status", NM)
    warn   = r.get("http_warning", "")
    print(f"\n  HTTP {status}  {warn}")
    missing = r.get("missing_headers_count", NM)
    if missing != NM:
        print(f"  Headers manquants : {missing}/6  — {r.get('missing_headers','')}")
        for h in SECURITY_HEADERS:
            key = f"hdr_{h.lower().replace('-','_')}"
            val = r.get(key, NM)
            mark = "✓" if val == "présent" else ("?" if val == NM else "✗")
            print(f"    {mark}  {h}")
    else:
        print(f"  Headers : {NM}  — {r.get('http_error','')}")

    # Typosquatting
    print(f"\n  Typo  {r.get('typo_status', NM)}")
    if r.get("typo_count") != NM:
        print(f"    Enregistrés : {r['typo_count']}")
        mx_list = r.get("typo_mx_list", "")
        if mx_list:
            print(f"    Avec MX actif : {mx_list}")
        else:
            print(f"    Avec MX actif : aucun")

    # Breach
    print(f"\n  Breach  {r.get('breach_status', NM)}")
    bc = r.get("breach_count", NM)
    if bc != NM:
        print(f"    {bc} breach(es)  —  {r.get('breaches','') or 'aucun'}")

    # MX
    print(f"\n  MX  {r.get('mx_status', NM)}")
    if r.get("mx_records") != NM:
        print(f"    {r['mx_records']}")


# ─── Export CSV ──────────────────────────────────────────────────────────────

CSV_FIELDS = [
    "domain", "email", "scanned_at",
    # SSL direct
    "ssl_ok", "ssl_not_after", "ssl_days_left", "ssl_issuer", "ssl_error", "ssl_source",
    # CT logs
    "ctlog_has_active", "ctlog_not_after", "ctlog_days_left", "ctlog_issuer",
    # HTTP
    "http_status", "http_warning",
    "hdr_strict_transport_security", "hdr_content_security_policy",
    "hdr_x_frame_options", "hdr_x_content_type_options",
    "hdr_referrer_policy", "hdr_permissions_policy",
    "missing_headers", "missing_headers_count",
    # Typo
    "typo_status", "typo_count", "typo_registered", "typo_mx_list",
    # Breach
    "breach_status", "breach_count", "breaches",
    # MX
    "mx_status", "mx_records",
]


def export_csv(rows: list, ts: str) -> str:
    filename = f"verify_vague2_{ts}.csv"
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return filename


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Vérification fraîche vague 2")
    parser.add_argument("--no-typo",   action="store_true", help="Sauter dnstwist")
    parser.add_argument("--no-breach", action="store_true", help="Sauter XON")
    args = parser.parse_args()

    ts = datetime.now().strftime("%Y%m%d_%H%M")
    print(f"\n{'='*65}")
    print(f"  verify_vague2  —  {len(TARGETS)} domaines  —  {ts}")
    print(f"{'='*65}")

    rows = []
    for t in TARGETS:
        domain = t["domain"]
        email  = t["email"]
        print(f"\n  Scan : {domain} …")

        row = {"domain": domain, "email": email, "scanned_at": ts}

        print("    SSL …")
        row.update(measure_ssl(domain))

        print("    HTTP headers …")
        row.update(measure_headers(domain))

        print("    Typosquatting …")
        row.update(measure_typosquatting(domain, skip=args.no_typo))

        print(f"    Breach ({email}) …")
        row.update(measure_breach(email, skip=args.no_breach))
        if not args.no_breach:
            time.sleep(XON_DELAY)

        print("    MX …")
        row.update(measure_mx(domain))

        print_report(t, row)
        rows.append(row)

    # Tableau récap
    print(f"\n\n{'='*65}")
    print(f"  RÉCAP — {ts}")
    print(f"{'='*65}")
    hdr = f"  {'DOMAINE':<22} {'SSL':>4} {'JOURS':>5} {'HDR':>4} {'TYPO':>5} {'MX':>4} {'BREACH':>6}"
    print(hdr)
    print("  " + "─" * 60)
    for row in rows:
        ssl_d = row.get("ssl_days_left", NM)
        ssl_s = f"{ssl_d}j" if ssl_d != NM else NM
        ssl_ok = "✓" if row.get("ssl_ok") is True else ("✗" if row.get("ssl_ok") is False else "?")
        mh    = row.get("missing_headers_count", NM)
        hdr_s = f"{mh}/6" if mh != NM else NM
        typo  = row.get("typo_count", NM)
        mx_s  = "✓" if (row.get("mx_records", NM) not in (NM, "")) else "?"
        bc    = row.get("breach_count", NM)
        bc_s  = str(bc) if bc != NM else NM
        print(f"  {row['domain']:<22} {ssl_ok:>4} {ssl_s:>5} {hdr_s:>4} {str(typo):>5} {mx_s:>4} {bc_s:>6}")

    # Export CSV
    csv_file = export_csv(rows, ts)
    print(f"\n  CSV → {csv_file}\n")


if __name__ == "__main__":
    main()
