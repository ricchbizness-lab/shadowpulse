#!/usr/bin/env python3
"""
idf_run.py — Pipeline IDF multi-département, exécution en deux phases.

Phase 1 (sourcing) : fetch API + échantillonnage aléatoire + vérification HTTP
  → stocke le pool de cabinets vérifiés dans pipeline/state/idf_pool.json

Phase 2a (scan10) : scan CTI des 10 premiers cabinets du pool, affiche résultats
Phase 2b (scan50) : scan CTI des 40 restants (après confirmation manuelle)

Usage :
  python idf_run.py sourcing
  python idf_run.py scan10
  python idf_run.py scan50
"""

import argparse
import csv
import json
import os
import random
import sys
import time
from dataclasses import asdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from prospect_pipeline import (
    run as source_dept,
    fetch_page, extract_cabinet,
    verify_domain, guess_domain,
    TRANCHES_API_PARAM, TRANCHES_CIBLES,
    Cabinet,
)
from shadow_pulse_demo import scan_domain
from full_pipeline import flatten_scan, OUTPUT_FIELDS

DEPTS = ["75", "77", "78", "91", "92", "93", "94", "95"]

# Chemins persistants (survivent aux redémarrages de session cloud)
_STATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state")
os.makedirs(_STATE_DIR, exist_ok=True)
POOL_FILE    = os.path.join(_STATE_DIR, "idf_pool.json")
RESULTS_FILE = os.path.join(_STATE_DIR, "idf_results.json")
CSV_FILE     = os.path.join(_STATE_DIR, "idf_results.csv")

RANDOM_SEED = 42
SCAN_TARGET = 50           # cabinets à scanner total
VERIFY_OVERSAMPLE = 5      # on vérifie 5× la cible pour avoir assez de verifie (~20% hit rate)
SCAN_DELAY = 1.0           # secondes entre deux scans CTI


# ─── Sérialisation Cabinet ────────────────────────────────────────────────────

def cab_to_dict(c: Cabinet) -> dict:
    return asdict(c)

def dict_to_cab(d: dict) -> Cabinet:
    return Cabinet(**d)


# ─── Phase 1 : sourcing + vérification ───────────────────────────────────────

def phase_sourcing():
    print(f"\n{'='*65}")
    print(f"  IDF Run — Phase 1 : Sourcing + Vérification")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*65}\n")

    # Étape 1 : fetch complet via API (pas de vérif HTTP, juste pagination)
    print("[ 1/3 ] Fetch API tous départements (sans vérification HTTP) …\n")
    pool_by_dept: dict[str, list[Cabinet]] = {}
    total_api = 0

    for dept in DEPTS:
        cabs = source_dept(
            dept=dept,
            max_results=9999,
            dry_run=False,
            verify_domains=False,   # pas de vérif HTTP ici — juste API
            out_file=None,
            inclure_effectif_inconnu=False,
            hunter_domain_fallback=False,
        )
        pool_by_dept[dept] = cabs
        total_api += len(cabs)
        print(f"  dept {dept} : {len(cabs)} cabinets")

    print(f"\n  Total IDF : {total_api} cabinets (tranches 10-49 sal., NAF 69.20Z)\n")

    # Étape 2 : échantillonnage aléatoire proportionnel
    print("[ 2/3 ] Échantillonnage aléatoire proportionnel …\n")
    random.seed(RANDOM_SEED)
    sample_size = SCAN_TARGET * VERIFY_OVERSAMPLE   # 250
    sample: list[Cabinet] = []

    print(f"  Cible : {SCAN_TARGET} scans → vérification de ~{sample_size} cabinets")
    print(f"  Seed  : {RANDOM_SEED} (reproductible)\n")

    for dept, cabs in pool_by_dept.items():
        # tirage proportionnel à la taille du pool département
        n = max(2, round(len(cabs) / total_api * sample_size))
        n = min(n, len(cabs))
        drawn = random.sample(cabs, n)
        sample.extend(drawn)
        print(f"  {dept} : {len(cabs):>4} cabinets → {n:>3} tirés")

    random.shuffle(sample)  # mélange inter-dépts

    # Déduplique par SIREN — un même cabinet peut avoir des établissements
    # dans plusieurs départements et apparaître dans chaque pool.
    seen_siren: set[str] = set()
    sample_deduped = []
    deduped_count = 0
    for cab in sample:
        if cab.siren not in seen_siren:
            seen_siren.add(cab.siren)
            sample_deduped.append(cab)
        else:
            deduped_count += 1
    if deduped_count:
        print(f"  ⚠ {deduped_count} doublon(s) SIREN inter-département retiré(s)")
    sample = sample_deduped

    print(f"\n  Échantillon total à vérifier : {len(sample)} cabinets\n")

    # Étape 3 : vérification HTTP heuristique (sans Hunter pour préserver crédits)
    print("[ 3/3 ] Vérification HTTP (heuristique, sans Hunter) …\n")
    verified: list[Cabinet] = []
    rejected = 0

    for i, cab in enumerate(sample):
        candidates = guess_domain(cab.nom, cab.siren)
        cab.domaine_guess = candidates[0]
        for domain in candidates:
            if verify_domain(domain):
                cab.domaine_guess = domain
                cab.domaine_confiance = "verifie"
                verified.append(cab)
                break
        else:
            rejected += 1

        if (i + 1) % 25 == 0:
            print(f"  {i+1}/{len(sample)} vérifiés — {len(verified)} verifie jusqu'ici …")
        time.sleep(0.2)

        if len(verified) >= SCAN_TARGET:
            # On a largement assez — inutile de continuer
            print(f"  → {len(verified)} verifie atteints après {i+1} vérifications, arrêt anticipé")
            break

    print(f"\n  Résultat : {len(verified)} domaines vérifiés / {len(sample)} tentés")
    print(f"  Taux     : {100*len(verified)//len(sample)}%")

    # Répartition par département
    from collections import Counter
    dept_dist = Counter(c.departement for c in verified)
    print("\n  Distribution des vérifiés par département :")
    for d in DEPTS:
        print(f"    {d} : {dept_dist.get(d, 0)}")

    # Tronquer à SCAN_TARGET pour le scan
    to_scan = verified[:SCAN_TARGET]
    print(f"\n  Pool final retenu pour scan : {len(to_scan)} cabinets\n")

    with open(POOL_FILE, "w") as f:
        json.dump([cab_to_dict(c) for c in to_scan], f, ensure_ascii=False, indent=2)

    print(f"  Pool sauvegardé → {POOL_FILE}")
    print(f"\n  Lance maintenant : python idf_run.py scan10\n")


# ─── Phase 2 : scan CTI ───────────────────────────────────────────────────────

def _load_pool() -> list[Cabinet]:
    if not os.path.exists(POOL_FILE):
        print(f"[!] Pool non trouvé ({POOL_FILE}) — lance d'abord : python idf_run.py sourcing")
        sys.exit(1)
    with open(POOL_FILE) as f:
        return [dict_to_cab(d) for d in json.load(f)]

def _load_results() -> list[dict]:
    if not os.path.exists(RESULTS_FILE):
        return []
    with open(RESULTS_FILE) as f:
        return json.load(f)

def _save_results(rows: list[dict]):
    with open(RESULTS_FILE, "w") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

def _export_csv(rows: list[dict]):
    """Exporte toutes les colonnes OUTPUT_FIELDS triées par score décroissant."""
    sorted_rows = sorted(rows, key=lambda r: r.get("exposure_score", 0), reverse=True)
    with open(CSV_FILE, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(sorted_rows)
    print(f"\n  CSV exporté → {CSV_FILE}  ({len(sorted_rows)} lignes)")


def phase_scan(start: int, end: int, label: str):
    pool = _load_pool()
    done_results = _load_results()
    already_scanned = {r["siren"] for r in done_results}

    seen = set(already_scanned)
    batch = []
    for c in pool[start:end]:
        if c.siren not in seen:
            seen.add(c.siren)
            batch.append(c)

    print(f"\n{'='*65}")
    print(f"  IDF Run — {label} (cabinets {start+1}–{end})")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*65}\n")

    if not batch:
        print("  Tous ces cabinets ont déjà été scannés.\n")
        return

    new_rows = []
    for i, cab in enumerate(batch, 1):
        print(f"  [{start+i}/{end}] {cab.nom[:40]} (dept {cab.departement}) → {cab.domaine_guess}")
        try:
            scan = scan_domain(cab.domaine_guess)
            row = flatten_scan(cab, scan)
            new_rows.append(row)
            print(f"        Score : {scan.get('exposure_score','?')}/100")
        except Exception as e:
            print(f"        [!] Erreur : {e}")
        if i < len(batch):
            time.sleep(SCAN_DELAY)

    # S'assurer que note_qualite existe sur tous les résultats antérieurs
    for r in done_results:
        r.setdefault("note_qualite", "")

    all_results = done_results + new_rows
    _save_results(all_results)
    _export_csv(all_results)

    # Affichage tableau récap
    sorted_rows = sorted(all_results, key=lambda r: r.get("exposure_score", 0), reverse=True)
    print(f"\n  ── Résultats cumulés ({len(all_results)} scans) ──\n")
    print(f"  {'NOM':<28} {'DEPT'} {'DOMAINE':<22} {'CONF':<16} {'SCORE':>5} {'XON':>4}  NOTE")
    print("  " + "─" * 95)
    for r in sorted_rows:
        xon = r.get("xon_breach_count", "—")
        note = r.get("note_qualite", "")
        note_display = ("⚠ " + note[:40]) if note else ""
        print("  {:<28} {:>4} {:<22} {:<16} {:>5} {:>4}  {}".format(
            r["nom"][:27], r["departement"], r["domaine_guess"][:21],
            r["domaine_confiance"], r["exposure_score"], str(xon), note_display))

    print()


# ─── CLI ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=["sourcing", "scan10", "scan50"])
    args = parser.parse_args()

    print(f"\n  [CONFIG] Persistance → {_STATE_DIR}")
    print(f"           Pool      → {POOL_FILE}")
    print(f"           Résultats → {RESULTS_FILE}")
    print(f"           CSV       → {CSV_FILE}\n")

    if args.phase == "sourcing":
        phase_sourcing()
    elif args.phase == "scan10":
        phase_scan(0, 10, "Scan pilote — 10 premiers")
    elif args.phase == "scan50":
        phase_scan(10, 50, "Scan complet — 40 restants")
