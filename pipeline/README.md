# ShadowPulse Pipeline

Pipeline de prospection CTI pour cabinets d'expertise comptable (NAF 69.20Z, Île-de-France).

## Architecture

```
prospect_pipeline.py   → sourcing API gouvernementale → liste de cabinets + domaines
shadow_pulse_demo.py   → scan d'exposition d'un domaine (DNS, SSL, HTTP, typosquatting, emails, HIBP)
full_pipeline.py       → orchestrateur : chain les deux, exporte CSV trié par score
```

## Setup

### 1. Dépendances Python

```bash
cd pipeline/
pip install -r requirements.txt
```

### 2. Clés API

Copier `.env.example` en `.env` et renseigner les valeurs :

```bash
cp .env.example .env
# Éditer .env avec vos clés
```

| Variable | Source | Gratuit ? |
|---|---|---|
| `HUNTER_API_KEY` | https://hunter.io/api-keys | Oui (25 req/mois) |
| `HIBP_API_KEY` | https://haveibeenpwned.com/API/Key | Non (~3,50 USD/mois) |

Les scripts fonctionnent sans clés API — les modules Hunter et HIBP sont simplement ignorés.

### 3. Hook pre-commit (recommandé)

Activer le hook qui bloque les commits contenant des clés API :

```bash
git config core.hooksPath .githooks
```

Pour vérifier :
```bash
git config core.hooksPath   # doit afficher ".githooks"
```

---

## Usage

### prospect_pipeline.py — Sourcing de cabinets

```bash
# Aperçu rapide — département 78, sans écriture CSV
python prospect_pipeline.py --dept 78 --dry-run

# Production — département 75, max 100 cabinets, export CSV
python prospect_pipeline.py --dept 75 --max 100 --out prospects_paris.csv

# Sans vérification de domaine (plus rapide)
python prospect_pipeline.py --dept 92 --no-verify
```

**Colonnes CSV** : siren, nom, dirigeant, adresse, code_postal, ville, departement, effectif_tranche, domaine_guess, domaine_verifie, source_url

### shadow_pulse_demo.py — Scan d'un domaine

```bash
# Rapport lisible
python shadow_pulse_demo.py --domain cabinet-exemple.fr

# JSON brut (pour intégration)
python shadow_pulse_demo.py --domain cabinet-exemple.fr --json
```

**Modules activés** :
- DNS (A, MX, TXT, NS, CNAME via Cloudflare DoH)
- SSL (validité, expiration)
- HTTP (headers de sécurité manquants)
- Typosquatting (dnstwist — domaines enregistrés ressemblants)
- Emails indexés (Hunter.io — si clé configurée)
- Fuites credentials (HIBP — si clé configurée)

**Score d'exposition** : 0–100 (plus élevé = plus exposé = meilleur prospect)

### full_pipeline.py — Pipeline complet

```bash
# Dry-run : prospecting seulement, sans scan ni export
python full_pipeline.py --dept 78 --dry-run

# Production : 50 cabinets du 92, export trié par score
python full_pipeline.py --dept 92 --max 50 --out results_hauts-de-seine.csv

# Avec délai réduit entre scans (attention aux rate-limits)
python full_pipeline.py --dept 78 --delay 1.0
```

**Colonnes CSV** : toutes les colonnes prospects + exposure_score, ssl_ok, ssl_days_left, http_reachable, missing_headers_count, typosquatting_count, hunter_emails_count, hibp_breach_count, hibp_breaches, scanned_at

---

## Réseau requis

| Service | URL | Usage |
|---|---|---|
| API Entreprises | `recherche-entreprises.api.gouv.fr` | Sourcing cabinets |
| Cloudflare DoH | `cloudflare-dns.com` | Résolution DNS |
| Hunter.io | `api.hunter.io` | Découverte emails |
| HIBP | `haveibeenpwned.com` | Fuites credentials |

---

## RGPD

> **Les fichiers CSV générés contiennent des données personnelles** (noms de dirigeants, adresses, emails professionnels). Durée de conservation recommandée : ≤ 3 ans. Base légale : intérêt légitime (prospection B2B, art. 6.1.f RGPD). Ne pas partager ces fichiers sans évaluation préalable des destinataires. Les fichiers `*.csv` sont exclus du git via `.gitignore`.
