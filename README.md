# ShadowPulse

Landing page React/Vite + pipeline CTI Python pour la prospection de cabinets comptables en Île-de-France.

## Branches

| Branche | Rôle |
|---|---|
| `claude/git-ux-ui-design-pro-rmvd0w` | **Branche de déploiement** — tout push ici publie le site via GitHub Actions |
| `feature/shadow-pulse-pipeline` | Développement pipeline Python (CTI, enrichissement email) — ne déclenche pas le déploiement |

> **Attention rebase :** Le workflow `.github/workflows/deploy.yml` contient le nom de la branche de déploiement en dur dans le trigger `on.push.branches`. GitHub lit ce champ depuis le commit poussé — si un rebase depuis `feature/shadow-pulse-pipeline` écrase ce fichier, les déploiements s'arrêtent silencieusement. Vérifier après tout rebase inter-branches.

## Site

URL : [etude.shadowpulse.fr](https://etude.shadowpulse.fr)

Déploiement : GitHub Pages via `actions/deploy-pages` (source = GitHub Actions, configuré dans Settings > Pages).

## Pipeline

Voir `pipeline/README.md` pour le détail des commandes IDF (sourcing, scan, enrichissement email).

Les fichiers `pipeline/state/*.json` et `pipeline/state/*.csv` sont gitignorés (données personnelles — SIREN, noms, emails).
