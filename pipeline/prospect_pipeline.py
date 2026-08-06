#!/usr/bin/env python3
"""
prospect_pipeline.py — Sourcing de cabinets comptables via l'API entreprises.

Source : recherche-entreprises.api.gouv.fr
Filtre  : NAF 69.20Z (expertise comptable), tranche effectif 21 (10-19 sal.)
          et 22 (20-49 sal.), filtrable par département.

Usage :
  python prospect_pipeline.py --dept 78
  python prospect_pipeline.py --dept 75 --max 50
  python prospect_pipeline.py --dept 78 --dry-run      # affiche sans écrire CSV
  python prospect_pipeline.py --dept 78 --out prospects.csv
"""

import argparse
import csv
import os
import re
import sys
import time
from dataclasses import dataclass, asdict, fields
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv()

API_BASE = "https://recherche-entreprises.api.gouv.fr/search"

# NAF 69.20Z = Activités comptables
NAF_CODE = "69.20Z"

# Tranches d'effectif Sirene : 21=10-19, 22=20-49
# On prend aussi 11 (1-2), 12 (3-5), 20 (10-19) pour couvrir les petites structures
# La doc officielle : https://www.insee.fr/fr/information/6439600
EFFECTIF_TRANCHES = ["11", "12", "21", "22"]

# Délai entre requêtes pour respecter le rate-limit de l'API
REQUEST_DELAY = 0.3


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
    domaine_guess: str
    domaine_verifie: bool
    source_url: str


def guess_domain(nom: str, siren: str) -> list[str]:
    """
    Génère des candidats de domaine à partir du nom du cabinet.
    Logique simple et conservative : on ne génère que des patterns courants.
    """
    # Nettoyage
    clean = nom.lower()
    clean = re.sub(r"\b(cabinet|sarl|sas|sasu|eurl|sci|sc|expert|expertise|comptable|et|associes?|associés?|&)\b", "", clean)
    clean = re.sub(r"[^a-z0-9\s-]", "", clean)
    clean = re.sub(r"\s+", "-", clean.strip())
    clean = clean.strip("-")

    if not clean or len(clean) < 3:
        clean = f"cabinet-{siren[:6]}"

    candidates = [
        f"{clean}.fr",
        f"{clean}.com",
        f"cabinet-{clean}.fr",
    ]
    return candidates


def verify_domain(domain: str, timeout: int = 5) -> bool:
    """Retourne True si le domaine répond en HTTP/HTTPS (site existant)."""
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


def fetch_page(dept: str, page: int, per_page: int = 25) -> dict:
    """Interroge l'API recherche-entreprises pour une page de résultats."""
    params = {
        "activite_principale": NAF_CODE,
        "departement": dept,
        "per_page": per_page,
        "page": page,
        "etat_administratif": "A",  # uniquement les entreprises actives
    }
    try:
        resp = requests.get(API_BASE, params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as e:
        print(f"[!] Erreur API page {page} : {e.response.status_code} — {e.response.text[:200]}", file=sys.stderr)
        return {}
    except Exception as e:
        print(f"[!] Erreur réseau page {page} : {e}", file=sys.stderr)
        return {}


def extract_cabinet(result: dict, dept: str) -> Optional[Cabinet]:
    """Extrait les champs utiles d'un résultat API."""
    try:
        siren = result.get("siren", "")
        nom = result.get("nom_complet") or result.get("nom_raison_sociale", "")
        if not nom:
            return None

        # Dirigeant principal (premier de la liste)
        dirigeants = result.get("dirigeants", [])
        if dirigeants:
            d = dirigeants[0]
            dirigeant = f"{d.get('prenoms', '')} {d.get('nom', '')}".strip()
        else:
            dirigeant = ""

        # Adresse du siège
        siege = result.get("siege", {})
        adresse = siege.get("adresse", "") or siege.get("libelle_voie", "")
        code_postal = siege.get("code_postal", "")
        ville = siege.get("libelle_commune", "")

        # Tranche effectif
        tranche = result.get("tranche_effectif_salarie") or siege.get("tranche_effectif_salarie", "")

        return Cabinet(
            siren=siren,
            nom=nom,
            dirigeant=dirigeant,
            adresse=adresse,
            code_postal=code_postal,
            ville=ville,
            departement=dept,
            effectif_tranche=tranche,
            domaine_guess="",
            domaine_verifie=False,
            source_url=f"https://annuaire-entreprises.data.gouv.fr/entreprise/{siren}",
        )
    except Exception as e:
        print(f"[!] Erreur extraction : {e}", file=sys.stderr)
        return None


def run(dept: str, max_results: int = 200, dry_run: bool = False,
        verify_domains: bool = True, out_file: Optional[str] = None) -> list[Cabinet]:

    print(f"[*] Sourcing cabinets comptables — département {dept} (NAF {NAF_CODE})")
    print(f"    Mode : {'DRY-RUN' if dry_run else 'production'} | max={max_results}")

    cabinets: list[Cabinet] = []
    page = 1
    per_page = 25
    total_seen = 0

    while len(cabinets) < max_results:
        data = fetch_page(dept, page, per_page)
        if not data:
            break

        results = data.get("results", [])
        total_api = data.get("total_results", 0)

        if page == 1:
            print(f"    API : {total_api} résultat(s) disponible(s)")

        if not results:
            break

        for r in results:
            if len(cabinets) >= max_results:
                break
            cab = extract_cabinet(r, dept)
            if cab:
                # Post-filtrage : garder uniquement les tranches 10-49 salariés
                # Tranches Sirene : 11=1-2, 12=3-5, 21=10-19, 22=20-49, 31=50-99 …
                # On inclut aussi les tranches inconnues/vides pour ne pas trop filtrer
                if cab.effectif_tranche and cab.effectif_tranche not in ("", "NN") and \
                   int(cab.effectif_tranche) > 22:
                    continue
                cabinets.append(cab)
            total_seen += 1

        # Pagination : arrêt si on a tout récupéré
        if total_seen >= total_api or len(results) < per_page:
            break

        page += 1
        time.sleep(REQUEST_DELAY)

    print(f"    {len(cabinets)} cabinet(s) extrait(s)")

    # Devinage et vérification de domaine
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
        # En dry-run : on génère juste les candidats sans vérification réseau
        for cab in cabinets:
            candidates = guess_domain(cab.nom, cab.siren)
            cab.domaine_guess = candidates[0]

    # Affichage dry-run
    if dry_run:
        print(f"\n{'─'*70}")
        print(f"  DRY-RUN — {len(cabinets)} cabinets (dept {dept})")
        print(f"{'─'*70}")
        for cab in cabinets[:20]:
            print(f"  {cab.nom[:40]:<40} | {cab.code_postal} {cab.ville[:20]:<20} | {cab.domaine_guess}")
        if len(cabinets) > 20:
            print(f"  … et {len(cabinets) - 20} autres")
        print(f"{'─'*70}\n")
        return cabinets

    # Export CSV
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
    parser.add_argument("--out", default="prospects.csv", help="Fichier CSV de sortie (défaut: prospects.csv)")
    args = parser.parse_args()

    run(
        dept=args.dept,
        max_results=args.max,
        dry_run=args.dry_run,
        verify_domains=not args.no_verify,
        out_file=None if args.dry_run else args.out,
    )


if __name__ == "__main__":
    main()
