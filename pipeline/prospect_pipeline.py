#!/usr/bin/env python3
"""
prospect_pipeline.py — Sourcing de cabinets comptables via l'API entreprises.

Source : recherche-entreprises.api.gouv.fr
Filtre  : NAF 69.20Z (expertise comptable)
          Tranches effectif Sirene : "11" = 10-19 sal., "12" = 20-49 sal.
          Filtré côté API (paramètre tranche_effectif_salarie=11,12)
          + whitelist stricte côté client en post-traitement.

Usage :
  python prospect_pipeline.py --dept 78
  python prospect_pipeline.py --dept 75 --max 50
  python prospect_pipeline.py --dept 78 --dry-run
  python prospect_pipeline.py --dept 78 --inclure-effectif-inconnu --out prospects.csv
"""

import argparse
import csv
import os
import re
import sys
import time
from dataclasses import dataclass, asdict, field, fields
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv()

API_BASE = "https://recherche-entreprises.api.gouv.fr/search"
NAF_CODE = "69.20Z"

# Whitelist stricte : seules ces deux chaînes (comparaison exacte) sont acceptées.
# INSEE Sirene : "11" = 10-19 salariés, "12" = 20-49 salariés.
TRANCHES_CIBLES = {"11", "12"}

# L'API accepte plusieurs tranches séparées par une virgule.
TRANCHES_API_PARAM = "11,12"

REQUEST_DELAY = 0.3

TRANCHES_LIBELLES = {
    "00": "0 salarié", "01": "1-2", "02": "3-5", "03": "6-9",
    "11": "10-19", "12": "20-49", "21": "50-99", "22": "100-199",
    "31": "200-249", "32": "250-499", "41": "500-999",
    "42": "1000-1999", "51": "2000-4999", "52": "5000-9999", "53": "10000+",
    "NN": "non renseignée", "": "non renseignée",
}


@dataclass
class Cabinet:
    siren: str
    nom: str
    dirigeant: str
    adresse: str
    code_postal: str
    ville: str
    departement: str
    effectif_tranche: str
    confiance_effectif: str          # "fiable" | "non_renseigne"
    domaine_guess: str
    domaine_verifie: bool
    source_url: str


def guess_domain(nom: str, siren: str) -> list[str]:
    clean = nom.lower()
    clean = re.sub(
        r"\b(cabinet|sarl|sas|sasu|eurl|sci|sc|expert|expertise|comptable|et|associes?|associés?|&)\b",
        "", clean,
    )
    clean = re.sub(r"[^a-z0-9\s-]", "", clean)
    clean = re.sub(r"\s+", "-", clean.strip()).strip("-")
    if not clean or len(clean) < 3:
        clean = f"cabinet-{siren[:6]}"
    return [f"{clean}.fr", f"{clean}.com", f"cabinet-{clean}.fr"]


def verify_domain(domain: str, timeout: int = 5) -> bool:
    for scheme in ("https", "http"):
        try:
            r = requests.get(
                f"{scheme}://{domain}",
                timeout=timeout,
                allow_redirects=True,
                headers={"User-Agent": "ShadowPulse-ProspectPipeline/1.0"},
            )
            if r.status_code < 500:
                return True
        except Exception:
            continue
    return False


def fetch_page(dept: str, page: int, per_page: int = 25,
               tranche_param: Optional[str] = None) -> dict:
    """
    Interroge l'API. tranche_param est passé tel quel à tranche_effectif_salarie
    (ex : "11,12"). L'URL exacte construite est loggable via resp.url.
    """
    params = {
        "activite_principale": NAF_CODE,
        "departement": dept,
        "per_page": per_page,
        "page": page,
        "etat_administratif": "A",
    }
    if tranche_param:
        params["tranche_effectif_salarie"] = tranche_param

    try:
        resp = requests.get(API_BASE, params=params, timeout=10)
        if page == 1:
            print(f"    URL API : {resp.url}")
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as e:
        print(f"[!] Erreur API page {page} : {e.response.status_code} — {e.response.text[:200]}",
              file=sys.stderr)
        return {}
    except Exception as e:
        print(f"[!] Erreur réseau page {page} : {e}", file=sys.stderr)
        return {}


def extract_cabinet(result: dict, dept: str) -> Optional[Cabinet]:
    try:
        siren = result.get("siren", "")
        nom = result.get("nom_complet") or result.get("nom_raison_sociale", "")
        if not nom:
            return None

        dirigeants = result.get("dirigeants", [])
        if dirigeants:
            d = dirigeants[0]
            dirigeant = f"{d.get('prenoms', '')} {d.get('nom', '')}".strip()
        else:
            dirigeant = ""

        siege = result.get("siege", {})
        adresse = siege.get("adresse", "") or siege.get("libelle_voie", "")
        code_postal = siege.get("code_postal", "")
        ville = siege.get("libelle_commune", "")
        tranche = result.get("tranche_effectif_salarie") or siege.get("tranche_effectif_salarie") or ""

        return Cabinet(
            siren=siren,
            nom=nom,
            dirigeant=dirigeant,
            adresse=adresse,
            code_postal=code_postal,
            ville=ville,
            departement=dept,
            effectif_tranche=tranche,
            confiance_effectif="",   # rempli par run()
            domaine_guess="",
            domaine_verifie=False,
            source_url=f"https://annuaire-entreprises.data.gouv.fr/entreprise/{siren}",
        )
    except Exception as e:
        print(f"[!] Erreur extraction : {e}", file=sys.stderr)
        return None


def run(dept: str, max_results: int = 200, dry_run: bool = False,
        verify_domains: bool = True, out_file: Optional[str] = None,
        inclure_effectif_inconnu: bool = False) -> list[Cabinet]:

    print(f"[*] Sourcing cabinets comptables — département {dept} (NAF {NAF_CODE})")
    print(f"    Mode : {'DRY-RUN' if dry_run else 'production'} | max={max_results}")
    print(f"    Filtres API : tranche_effectif_salarie={TRANCHES_API_PARAM}")
    print(f"    Effectifs inconnus (NN) : {'inclus' if inclure_effectif_inconnu else 'exclus'}")

    # ── Phase 1 : récupération des tranches cibles via l'API ──────────────────
    cabinets: list[Cabinet] = []
    page = 1
    per_page = 25
    total_seen = 0

    while len(cabinets) < max_results:
        data = fetch_page(dept, page, per_page, tranche_param=TRANCHES_API_PARAM)
        if not data:
            break

        results = data.get("results", [])
        total_api = data.get("total_results", 0)
        if page == 1:
            print(f"    API : {total_api} résultat(s) dans les tranches 11+12")

        if not results:
            break

        for r in results:
            if len(cabinets) >= max_results:
                break
            cab = extract_cabinet(r, dept)
            if not cab:
                total_seen += 1
                continue

            # Whitelist stricte côté client — filet de sécurité au cas où
            # l'API retournerait un résultat hors tranche.
            if cab.effectif_tranche in TRANCHES_CIBLES:
                cab.confiance_effectif = "fiable"
                cabinets.append(cab)
            # Les autres tranches sont rejetées silencieusement ici.
            total_seen += 1

        if total_seen >= total_api or len(results) < per_page:
            break
        page += 1
        time.sleep(REQUEST_DELAY)

    # ── Phase 2 (optionnelle) : effectifs inconnus ────────────────────────────
    if inclure_effectif_inconnu and len(cabinets) < max_results:
        print(f"[*] Récupération des effectifs inconnus (NN) …")
        # On requête SANS filtre de tranche, puis on ne garde que les NN.
        page2 = 1
        total_seen2 = 0
        nn_count = 0
        siren_deja_vus = {c.siren for c in cabinets}

        while len(cabinets) < max_results:
            data2 = fetch_page(dept, page2, per_page, tranche_param=None)
            if not data2:
                break
            results2 = data2.get("results", [])
            total_api2 = data2.get("total_results", 0)
            if not results2:
                break

            for r in results2:
                if len(cabinets) >= max_results:
                    break
                cab = extract_cabinet(r, dept)
                if not cab or cab.siren in siren_deja_vus:
                    total_seen2 += 1
                    continue
                if cab.effectif_tranche in ("", "NN", None):
                    cab.effectif_tranche = "NN"
                    cab.confiance_effectif = "non_renseigne"
                    cabinets.append(cab)
                    siren_deja_vus.add(cab.siren)
                    nn_count += 1
                total_seen2 += 1

            if total_seen2 >= total_api2 or len(results2) < per_page:
                break
            page2 += 1
            time.sleep(REQUEST_DELAY)

        print(f"    {nn_count} cabinet(s) NN ajouté(s)")

    fiables = sum(1 for c in cabinets if c.confiance_effectif == "fiable")
    inconnus = sum(1 for c in cabinets if c.confiance_effectif == "non_renseigne")
    print(f"    Total : {len(cabinets)} cabinets ({fiables} fiables / {inconnus} effectif inconnu)")

    # ── Devinage et vérification de domaine ───────────────────────────────────
    if verify_domains and not dry_run:
        print(f"[*] Vérification des domaines ({len(cabinets)} cabinets) …")
        for i, cab in enumerate(cabinets):
            candidates = guess_domain(cab.nom, cab.siren)
            cab.domaine_guess = candidates[0]
            for domain in candidates:
                if verify_domain(domain):
                    cab.domaine_guess = domain
                    cab.domaine_verifie = True
                    break
            if (i + 1) % 10 == 0:
                print(f"    {i+1}/{len(cabinets)} vérifiés …")
            time.sleep(0.2)
        verified = sum(1 for c in cabinets if c.domaine_verifie)
        print(f"    {verified}/{len(cabinets)} domaine(s) vérifié(s)")
    elif dry_run:
        for cab in cabinets:
            cab.domaine_guess = guess_domain(cab.nom, cab.siren)[0]

    # ── Affichage dry-run ─────────────────────────────────────────────────────
    if dry_run:
        print(f"\n{'─'*75}")
        print(f"  DRY-RUN — {len(cabinets)} cabinets (dept {dept})")
        print(f"{'─'*75}")
        for cab in cabinets[:20]:
            lib = TRANCHES_LIBELLES.get(cab.effectif_tranche, cab.effectif_tranche)
            print(f"  {cab.nom[:38]:<38}  {cab.code_postal} {cab.ville[:18]:<18}  {cab.effectif_tranche} ({lib:<7})  {cab.confiance_effectif}")
        if len(cabinets) > 20:
            print(f"  … et {len(cabinets) - 20} autres")
        print(f"{'─'*75}\n")
        return cabinets

    # ── Export CSV ────────────────────────────────────────────────────────────
    if out_file and cabinets:
        fieldnames = [f.name for f in fields(Cabinet)]
        with open(out_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows([asdict(c) for c in cabinets])
        print(f"[+] Export : {out_file} ({len(cabinets)} lignes)")

    return cabinets


def main():
    parser = argparse.ArgumentParser(description="ShadowPulse — sourcing de cabinets comptables")
    parser.add_argument("--dept", required=True, help="Code département (ex: 78, 75, 92)")
    parser.add_argument("--max", type=int, default=200, help="Nombre max de cabinets (défaut: 200)")
    parser.add_argument("--dry-run", action="store_true", help="Aperçu sans vérification ni export")
    parser.add_argument("--no-verify", action="store_true", help="Ne pas vérifier les domaines")
    parser.add_argument("--out", default="prospects.csv", help="Fichier CSV de sortie")
    parser.add_argument("--inclure-effectif-inconnu", action="store_true",
                        help="Inclure les structures sans effectif Sirene (NN), marquées confiance_effectif=non_renseigne")
    args = parser.parse_args()

    run(
        dept=args.dept,
        max_results=args.max,
        dry_run=args.dry_run,
        verify_domains=not args.no_verify,
        out_file=None if args.dry_run else args.out,
        inclure_effectif_inconnu=args.inclure_effectif_inconnu,
    )


if __name__ == "__main__":
    main()
