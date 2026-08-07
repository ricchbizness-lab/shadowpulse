#!/usr/bin/env python3
"""
full_pipeline.py — Orchestrateur ShadowPulse.

Enchaîne :
  1. prospect_pipeline  → liste de cabinets comptables avec domaine vérifié
  2. shadow_pulse_demo  → scan d'exposition pour chaque cabinet
  3. Export CSV trié par score d'exposition décroissant (le plus exposé en premier)

Usage :
  python full_pipeline.py --dept 78
  python full_pipeline.py --dept 75 --max 50 --out results_paris.csv
  python full_pipeline.py --dept 78 --dry-run   # prospecting seulement, pas de scan

Variables d'environnement requises (fichier .env) :
  HUNTER_API_KEY
  HIBP_API_KEY
"""

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone
from dataclasses import asdict

from dotenv import load_dotenv

load_dotenv()

# Import des modules du pipeline
sys.path.insert(0, os.path.dirname(__file__))
from prospect_pipeline import run as run_prospecting, Cabinet
from shadow_pulse_demo import scan_domain


OUTPUT_FIELDS = [
    # Identité cabinet
    "siren", "nom", "dirigeant", "adresse", "code_postal", "ville", "departement",
    "effectif_tranche", "confiance_effectif", "domaine_guess", "domaine_confiance", "source_url",
    # Résultats scan
    "exposure_score",
    "ssl_ok", "ssl_days_left", "ssl_error",
    "http_reachable", "http_status", "missing_headers_count",
    "typosquatting_count",
    "hunter_emails_count",
    "xon_breach_count", "xon_breaches", "xon_checked_email",
    "scanned_at",
    "note_qualite",   # annotation manuelle optionnelle — ne jamais auto-remplir
]


def flatten_scan(cab: Cabinet, scan: dict) -> dict:
    """Aplatit les résultats de scan pour l'export CSV."""
    row = asdict(cab)

    row["exposure_score"] = scan.get("exposure_score", 0)
    row["scanned_at"] = scan.get("scanned_at", "")

    ssl = scan.get("ssl", {})
    row["ssl_ok"] = ssl.get("has_ssl", False)
    row["ssl_days_left"] = ssl.get("days_left", "")
    row["ssl_error"] = ssl.get("error", "")

    http = scan.get("http", {})
    row["http_reachable"] = http.get("reachable", False)
    row["http_status"] = http.get("status_code", "")
    row["missing_headers_count"] = len(http.get("missing_headers", []))

    typo = [t for t in scan.get("typosquatting", []) if isinstance(t, dict) and "error" not in t]
    row["typosquatting_count"] = len(typo)

    hunter = scan.get("hunter", {})
    row["hunter_emails_count"] = hunter.get("total_emails", "") if "error" not in hunter else "N/A"

    xon = scan.get("xon", {})
    if xon.get("error") == "quota_horaire":
        row["xon_breach_count"] = "quota_atteint"
        row["xon_breaches"] = ""
        row["xon_checked_email"] = ""
    elif "error" in xon:
        row["xon_breach_count"] = "N/A"
        row["xon_breaches"] = ""
        row["xon_checked_email"] = xon.get("checked_email", "")
    else:
        row["xon_breach_count"] = xon.get("breach_count", 0)
        row["xon_breaches"] = "|".join(xon.get("breaches", []))
        row["xon_checked_email"] = xon.get("checked_email", "")

    row["note_qualite"] = ""   # vide par défaut — annotation manuelle uniquement

    return {k: row[k] for k in OUTPUT_FIELDS}


def run(dept: str, max_cabinets: int = 100, dry_run: bool = False,
        out_file: str = "full_results.csv", scan_delay: float = 2.0,
        hunter_domain_fallback: bool = False,
        inclure_douteux: bool = False) -> None:

    print(f"\n{'='*65}")
    print(f"  ShadowPulse Full Pipeline — dept {dept}")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*65}\n")

    # ── Étape 1 : Prospecting ──────────────────────────────────────────────────
    print("[ ÉTAPE 1 ] Sourcing des cabinets comptables …\n")
    cabinets = run_prospecting(
        dept=dept,
        max_results=max_cabinets,
        dry_run=False,
        verify_domains=True,
        out_file=None,
        hunter_domain_fallback=hunter_domain_fallback,
    )

    if not cabinets:
        print("[!] Aucun cabinet trouvé — vérifier le département ou la connectivité.")
        return

    # En dry-run : on s'arrête après le prospecting
    if dry_run:
        print(f"\n[DRY-RUN] {len(cabinets)} cabinet(s) sourcés, scan désactivé.")
        verified = [c for c in cabinets if c.domaine_confiance != "a_verifier"]
        print(f"          {len(verified)} avec domaine trouvé (seraient scannés en prod)\n")
        for c in verified[:10]:
            print(f"  → {c.nom[:45]:<45} {c.domaine_guess}  [{c.domaine_confiance}]")
        return

    # ── Étape 2 : Scan d'exposition ────────────────────────────────────────────
    CONFIANCES_SCAN = {"verifie", "verifie_hunter"}
    if inclure_douteux:
        CONFIANCES_SCAN.add("hunter_douteux")

    to_scan = [c for c in cabinets if c.domaine_confiance in CONFIANCES_SCAN]
    douteux_skipped = [c for c in cabinets if c.domaine_confiance == "hunter_douteux" and not inclure_douteux]

    print(f"\n[ ÉTAPE 2 ] Scan d'exposition — {len(to_scan)} domaine(s) éligible(s)")
    if douteux_skipped:
        print(f"            ⏭ {len(douteux_skipped)} domaine(s) 'hunter_douteux' exclus du scan automatique :")
        for c in douteux_skipped:
            print(f"              {c.nom[:40]} → {c.domaine_guess}  (relancer avec --inclure-douteux après revue)")
    print()

    if not to_scan:
        print("[!] Aucun domaine vérifié à scanner.")
        return

    rows = []
    for i, cab in enumerate(to_scan, 1):
        print(f"  [{i}/{len(to_scan)}] {cab.nom[:40]} → {cab.domaine_guess}")
        try:
            scan = scan_domain(cab.domaine_guess)
            row = flatten_scan(cab, scan)
            rows.append(row)
            print(f"        Score : {scan.get('exposure_score', '?')}/100")
        except Exception as e:
            print(f"        [!] Erreur scan : {e}")
        time.sleep(scan_delay)

    # ── Étape 3 : Export CSV trié ───────────────────────────────────────────────
    rows.sort(key=lambda r: r.get("exposure_score", 0), reverse=True)

    print(f"\n[ ÉTAPE 3 ] Export → {out_file} ({len(rows)} lignes, trié par score décroissant)")

    with open(out_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n{'='*65}")
    print(f"  Terminé — {len(rows)} cabinet(s) scannés")
    if rows:
        top = rows[0]
        print(f"  Top prospect : {top['nom']} ({top['domaine_guess']}) — score {top['exposure_score']}/100")
    print(f"{'='*65}\n")
    print(f"  RAPPEL RGPD : {out_file} contient des données personnelles.")
    print(f"  Conserver ce fichier ≤ 3 ans, base légale = intérêt légitime (B2B).")
    print()


def main():
    parser = argparse.ArgumentParser(description="ShadowPulse — pipeline complet de prospection CTI")
    parser.add_argument("--dept", required=True, help="Département (ex: 78, 75, 92)")
    parser.add_argument("--max", type=int, default=100, help="Nombre max de cabinets à sourcer (défaut: 100)")
    parser.add_argument("--dry-run", action="store_true", help="Prospecting seulement, sans scan ni export")
    parser.add_argument("--out", default="full_results.csv", help="Fichier CSV de sortie (défaut: full_results.csv)")
    parser.add_argument("--delay", type=float, default=2.0, help="Délai (s) entre scans (défaut: 2.0)")
    parser.add_argument("--hunter-domain-fallback", action="store_true",
                        help="Fallback Hunter.io pour les cabinets sans domaine heuristique (⚠ 1 crédit/cabinet)")
    parser.add_argument("--inclure-douteux", action="store_true",
                        help="Inclure les domaines 'hunter_douteux' dans le scan (défaut: exclus — revue manuelle requise d'abord)")
    args = parser.parse_args()

    run(
        dept=args.dept,
        max_cabinets=args.max,
        dry_run=args.dry_run,
        out_file=args.out,
        hunter_domain_fallback=args.hunter_domain_fallback,
        inclure_douteux=args.inclure_douteux,
        scan_delay=args.delay,
    )


if __name__ == "__main__":
    main()
