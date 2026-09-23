# Shadow Pulse — Pipeline CTI & Prospection

Récapitulatif complet de ce qui a été mis en place, pourquoi, et où en est le projet.

---

## 1. Objectif du projet

Shadow Pulse est un outil B2B de threat intelligence (CTI) et surveillance de surface d'attaque, positionné pour les cabinets d'expertise comptable français de 10 à 50 salariés (NAF 69.20Z), marché initial Île-de-France.

**Positionnement clé :** on vend de la surveillance continue, pas de la remédiation. On détecte et on alerte ; la correction technique reste chez l'hébergeur/DSI du client. Toute la copy et les CTA doivent refléter ça — jamais "on répare pour vous".

**Objectif business immédiat :** décrocher un premier client payant, même à tarif réduit, pour avoir une référence terrain.

---

## 2. Architecture du pipeline

Repo GitHub : `ricchbizness-lab/shadowpulse`, branche `feature/shadow-pulse-pipeline` (isolée de la branche contenant la landing page).

Quatre scripts Python dans `/pipeline/` :

| Script | Rôle |
|---|---|
| `shadow_pulse_demo.py` | Scanner CTI d'un domaine unique : typosquatting (dnstwist), découverte d'emails (Hunter.io), fuites de credentials (XposedOrNot), surface DNS/SSL/headers HTTP |
| `prospect_pipeline.py` | Sourcing de cabinets comptables via l'API publique `recherche-entreprises.api.gouv.fr` (NAF 69.20Z, tranche effectif 10-49 salariés), avec devinage + vérification de domaine web |
| `full_pipeline.py` | Orchestrateur : chaîne sourcing + scan, exporte un CSV trié par score d'exposition |
| `idf_run.py` | Version batch avec état persistant et checkpoints, pour scanner un volume large (ex: tout l'Île-de-France) sans tout reperdre en cas d'interruption |

### Sources de données utilisées

- **Sourcing entreprises :** `recherche-entreprises.api.gouv.fr` — gratuit, sans clé, données SIRENE officielles
- **Découverte d'emails :** Hunter.io — gratuit jusqu'à 50 crédits/mois, `domain-search` (1 crédit/email) + `Domain Finder` en fallback (gratuit) pour deviner un domaine à partir du nom du cabinet
- **Fuites de credentials :** XposedOrNot (remplace HIBP, qui est payant ~4,39$/mois) — gratuit, sans clé, mais limité à 25 requêtes/heure et 100/jour
- **Typosquatting :** dnstwist (local, gratuit)
- **DNS :** Cloudflare DNS-over-HTTPS (cohérent avec le reste de la stack)

---

## 3. Bugs trouvés et corrigés en cours de route

C'est la partie la plus importante à retenir — plusieurs bugs auraient silencieusement faussé les résultats si non détectés.

### 3.1 Filtrage par tranche d'effectif ne fonctionnait pas

Le paramètre `tranche_effectif_salarie` n'était jamais transmis à l'API — le filtrage était fait entièrement côté client avec une comparaison numérique buguée (`int("21") < int("22")` ne veut rien dire pour des codes catégoriels). Résultat : de grosses structures (KPMG, BDO) passaient le filtre. Corrigé : le paramètre est maintenant bien passé à l'API (`tranche_effectif_salarie=11,12`), avec whitelist stricte en filet de sécurité côté client.

### 3.2 Doublons SIREN inter-départements

Une même entité (ex: OPEN CONSEIL) apparaît dans plusieurs recherches par département si elle a des établissements dans plusieurs — l'API retourne une entrée par département où elle a une présence, pas seulement pour le siège. Corrigé : déduplication par SIREN avant vérification de domaine.

### 3.3 Colonne `departement` peu fiable dans les résultats finaux

Après coup, en analysant le CSV final, on a découvert que la colonne `departement` du CSV ne correspond pas toujours à l'adresse réelle du cabinet — 7 cabinets sur le run de 50 étaient en réalité hors Île-de-France (Nantes, Lyon, Colmar, Toulouse, Soissons) malgré une étiquette IDF. Cause probable : l'adresse affichée est celle du siège social, qui peut être ailleurs que l'établissement ayant matché le filtre régional de la recherche. Traité en aval : recalcul du département réel à partir du code postal, exclusion des cabinets hors IDF confirmés.

### 3.4 Faux positifs de domaine deviné

Deux mécanismes de faux positifs identifiés :

- **Réattribution de domaine :** le fallback Hunter Domain Finder a retourné `travex.ru` pour un cabinet français ("A C E V E X") — corrigé par un filtre TLD (`.fr/.com/.eu/.net/.org` uniquement) + un score de similarité nom/domaine, avec un niveau de confiance intermédiaire `hunter_douteux` pour les cas ambigus (exclu du scan automatique par défaut)
- **Nom générique coïncidant avec une marque connue :** "FRANCE EXPERTISE COMPTABLE" → domaine deviné `france.fr`, "STAR EXPERTISE" → `star.fr` (probablement le réseau de transport de Rennes). Ces cas passent les filtres TLD/similarité car lexicalement proches du nom — repérés manuellement, pas encore de garde-fou automatique pour ce cas précis (amélioration possible pour une v2)

### 3.5 Plafond artificiel sur le score de typosquatting

Le calcul de score plafonne la composante typosquatting dès 6 domaines détectés avec MX actif — un cabinet avec 8 domaines squattés obtient le même score qu'un cabinet avec 45. Ça explique un "palier" artificiel où 12 cabinets très différents se retrouvaient au même score (46/100). Identifié, pas encore corrigé — amélioration proposée : passer à une échelle logarithmique plutôt qu'un plafond dur.

### 3.6 Faux signal sur les scores XON (breach checking) élevés

Plusieurs cabinets avec un score de breach élevé (ARICE : 7 fuites, EFCA : 3, TRCC initialement) se sont révélés être majoritairement du bruit une fois la composition analysée : agrégateurs B2B (PeopleDataLabs, Apollo, LinkedIn scraping, BureauvanDijk) plutôt que de vrais dumps de credentials. Méthode établie : toujours décomposer les breaches par nature avant de citer un chiffre en démarchage — un colonne `note_qualite` a été ajoutée au CSV pour tracer cette analyse.

### 3.7 Persistance des résultats en session cloud

Le sandbox Claude Code web repart à froid entre les sessions — un premier run complet de 50 cabinets a été perdu car stocké dans `/tmp` (non persisté) puis dans le repo local (non poussé sur git, donc pas persisté non plus). Corrigé : export CSV téléchargeable directement dans le chat à chaque étape clé, plus de dépendance à la persistance du sandbox. Leçon générale : ne jamais considérer un résultat de scan comme acquis tant qu'il n'est pas soit commité (si non-sensible), soit téléchargé.

### 3.7bis Reconstruction "de mémoire" en session cloud fraîche — piège méthodologique récurrent

Quand une nouvelle session cloud démarre à froid (état perdu, voir 3.7), la tentation est de reconstruire les données manquantes à partir de ce qui a été dit dans la conversation ("d'après le résumé, les cabinets étaient...") plutôt que de revalider depuis la source réelle (API, fichier, scan frais). Deux incidents concrets sur ce projet :

- **CAD+/cadplus.fr :** une session a deviné le domaine par recherche web plutôt que de vérifier le SIREN d'origine, créant une confusion d'identité (deux cabinets homonymes potentiels) qui n'a été tranchée que par une vérification humaine manuelle
- **Régénération des 12 emails IDF :** une session a reconstruit la liste des 12 cabinets "depuis ce qu'elle savait" de la conversation plutôt que depuis le CSV source (fichier absent car gitignoré dans le nouveau container) — le résultat s'est avéré correct cette fois, mais la méthode elle-même est risquée et doit être signalée comme telle, pas silencieusement acceptée

**Règle à appliquer systématiquement :** dans une session fraîche, si une donnée factuelle (SIREN, domaine, score, email) doit être reconstruite depuis la mémoire conversationnelle plutôt que depuis une source vérifiable (fichier, API, nouveau scan), le dire explicitement avant de continuer, et proposer une re-vérification plutôt que de présenter le résultat comme fiable par défaut.

### 3.8 Le proxy réseau du sandbox fausse les dates SSL

Le sandbox cloud intercepte tout le trafic TLS sortant via un proxy (Egress Gateway) qui re-signe les connexions avec son propre certificat, valide 30 jours glissants. Résultat : `scan_ssl()` lisait systématiquement le certificat du proxy au lieu du vrai certificat du domaine ciblé — tous les scans SSL effectués depuis le sandbox (50 cabinets IDF + 4 pilotes) affichaient "29 jours" quel que soit le domaine réel, un pattern qui aurait dû alerter plus tôt (impossible statistiquement que ~54 domaines indépendants expirent tous à la même date).

Corrigé : `scan_ssl()` interroge maintenant les logs Certificate Transparency (crt.sh) plutôt que de lire le certificat directement — cette requête HTTP passe aussi par le proxy, mais le contenu de la réponse n'est pas altéré (seule la couche TLS l'était). Les vraies dates d'expiration vont de +15 à +105 jours d'écart par rapport aux fausses valeurs "29 jours" initiales.

**Limite du nouveau système :** certains domaines (AUDITEC, SUD EXPERTISE & AUDIT) n'ont aucun enregistrement dans les CT logs — probablement un certificat CDN/wildcard non indexé sous le nom de domaine racine. Le code distingue maintenant 3 cas : `True` (cert trouvé, jours restants fiables), `False` (dernier cert CT trouvé mais expiré), `"unindexed"` (TCP 443 ouvert donc HTTPS répond, mais rien dans les CT logs — situation réellement indéterminée, ne jamais affirmer "pas de SSL" dans ce cas).

**Leçon générale :** dans un environnement sandbox avec proxy réseau, ne jamais faire confiance à une donnée réseau "trop belle pour être vraie" (valeur identique sur des dizaines d'entités indépendantes) sans vérifier via une source hors du sandbox (ici, CT logs publics) ou un outil externe indépendant.

### 3.9 Désynchronisation silencieuse de shadow_pulse_demo.py entre branches

Ce projet utilise deux branches actives avec des périmètres distincts :
- `feature/shadow-pulse-pipeline` → code pipeline (idf_run.py, full_pipeline.py, shadow_pulse_demo.py)
- `claude/git-ux-ui-design-pro-rmvd0w` → landing page en production + fix SSL CT logs

Le fix CT logs (3.8) a été commité en premier sur `claude/git-ux-ui-design-pro-rmvd0w` (commits eae9328 + 7541052, 10 et 16 sept. 2026), mais **pas propagé à `feature/shadow-pulse-pipeline`** qui est restée sur l'ancienne `ssl.wrap_socket()`. Résultat : `idf_run.py scan10` a produit `ssl_ok=False` pour 5 cabinets avec SSL actif (adexco.fr 16j, acofex.fr 35j, extentis.com 145j) et 2 unindexed — tous au même score artificiel de 44/100.

Corrigé le 23 sept. 2026 (commit ccb3c8b puis resync final) : les deux branches utilisent maintenant la même version de `scan_ssl()` basée sur crt.sh, avec 4 états distincts (`True`/`False`/`"unindexed"`/`"unreachable"`/`None`). `compute_exposure_score()` traite désormais `None` (erreur crt.sh) comme "indéterminé" (0 pts SSL) plutôt que comme "absent" (20 pts).

**Règle à appliquer systématiquement à chaque futur fix de `shadow_pulse_demo.py` :**

1. Appliquer le fix sur `feature/shadow-pulse-pipeline` (branche source pipeline)
2. Vérifier immédiatement la divergence : `git log --oneline feature/shadow-pulse-pipeline...claude/git-ux-ui-design-pro-rmvd0w -- pipeline/shadow_pulse_demo.py`
3. Si divergence détectée : propager vers l'autre branche dans le même commit ou le suivant — ne jamais laisser passer plus d'un commit de délai
4. En début de session sur ce projet, relancer cette commande en priorité avant tout travail sur le pipeline

---

## 4. Méthodologie de qualification retenue

1. **Sourcing** → filtré NAF + effectif + département
2. **Matching domaine** → 3 niveaux de confiance : `verifie` (heuristique + vérif TCP), `verifie_hunter` (fallback Hunter validé par TLD+similarité), `hunter_douteux` (exclu du scan automatique, review manuelle requise)
3. **Scan CTI** → score d'exposition composite (typosquat + SSL + headers + breaches)
4. **Vérification qualité** → avant tout usage en outreach : checker la composition des breaches (agrégateur vs vrai dump), le ratio typosquat MX-actif/total, et la cohérence géographique réelle (département déduit du code postal, pas de la colonne brute)
5. **Filtrage final pour outreach** → seuls les cabinets avec : email exploitable trouvé, localisation IDF confirmée, domaine fiable, signal de score honnête

---

## 5. État actuel (dernier run complet)

- **50 cabinets scannés** sur l'échantillon Île-de-France (départements 75/77/78/91/92/93/94/95)
- **12 exploitables pour l'outreach** après vérification complète (24% du lot) :
  - 6 "propres" (Tier 1) : EFFIGEST, AUDITEC, DXCO, FIPARCO, DCF EXPERTISE, FINACOOP
  - 3 "propres" (Tier 2) : SUD EXPERTISE & AUDIT, EXPERFINANCE & ASSOCIES, GROUPE LEGRAND
  - 2 "nuancés" (Tier 3, breach réel mais à formuler prudemment) : EFCA, IDEC
  - 1 (Tier 4) : AVEXXENS
- + 3-4 cabinets d'un run pilote précédent (département 78 seul) : CAD+, COMANDEX, CIKLEA, BM&A (nuancé)
- Soit **~16 contacts au total**, cohérent avec l'objectif initial de calibrage manuel (15-20 contacts avant automatisation)
- **Goulot d'étranglement actuel :** la découverte d'email (Hunter), pas le scan CTI — 29 cabinets sur 50 n'ont aucun email exploitable trouvé
- **Fichier de référence :** `idf_results_verifie.csv` (contient toutes les colonnes de diagnostic : département réel, cohérence IDF, faux positifs de domaine, tier d'outreach).
- **Emails rédigés et vérifiés (16/16) :** les 12 cabinets IDF + les 4 pilotes (CAD+/cadplus.fr, COMANDEX, CIKLEA, BM&A) ont chacun un draft finalisé, avec dates SSL réelles (post-correction du bug proxy, point 3.8) et formulation prudente sur les breaches/typosquat. CAD+ confirmé = `cadplus.fr` (SIREN 794700211, Paris 75013, David Sanglier) après vérification humaine manuelle — pas le domaine `cad.fr` utilisé dans un tout premier test exploratoire non retenu.
- **Décision de priorisation (envoi en 2 vagues) :** pour cette première vague, ne cibler que les cabinets avec un signal réellement urgent (SSL qui expire bientôt, ou absence/indétermination SSL, ou headers massivement absents) — mettre de côté ceux dont le seul signal restant est "SSL sain, à surveiller" (FINACOOP 93j, DXCO 69j, FIPARCO 70j, GROUPE LEGRAND 73j, AVEXXENS 134j), moins percutants en accroche. Ces 5 rejoignent une vague 2 ultérieure plutôt que d'être envoyés maintenant avec un signal dilué.

---

## 6. Décisions stratégiques prises

### Canal de prospection

- **Email à froid** = canal principal (scalable, ne dépend pas d'un profil personnel fort)
- **LinkedIn du commercial de l'équipe** = canal d'appui (connexions ciblées, retargeting), pas de volume
- **Téléphone** = accélérateur sur leads chauds uniquement, jamais en volume à froid

### Conformité

- Ligne de désinscription obligatoire dans chaque email ("répondez STOP") — exigence légale B2B (art. L.34-5 CPCE)
- Pas de citation de chiffre brut de breach sans avoir vérifié la composition au préalable
- Pas de citation de chiffre brut de typosquatting sans avoir vérifié le ratio MX-actif

### Positionnement email

Le CTA doit toujours pointer vers "surveillance continue dans le temps", jamais "on corrige pour vous" — cohérent avec le modèle économique réel (abonnement récurrent, pas audit ponctuel).

---

## 7. Sécurité & hygiène du repo

- Branche `feature/shadow-pulse-pipeline` isolée de la branche contenant la landing page en production
- `.env` pour les clés API (Hunter), jamais en argument CLI en clair, jamais commité
- `.gitignore` couvre `.env`, `__pycache__/`, `*.pyc`, `*.csv`, ET `pipeline/state/*.json` (données personnelles : SIREN, noms, emails — ne doivent jamais entrer dans l'historique git)
- Hook pre-commit grep les patterns de clés API évidents avant tout commit
- Protection de branche GitHub native non disponible sur ce plan (repo privé + compte Free = rulesets non appliqués) — compensé par une discipline de prompt explicite envers Claude Code ("ne push jamais directement sur la branche par défaut sans validation")

---

## 8. Ce qui reste à faire

1. **Envoyer la vague 1** (cabinets à signal urgent uniquement, voir section 5) manuellement, par petits lots (pas tout le même jour)
2. **Vague 2** (FINACOOP, DXCO, FIPARCO, GROUPE LEGRAND, AVEXXENS — signal SSL sain) à traiter après la vague 1, éventuellement avec un angle différent (pas l'urgence SSL, plutôt les headers ou le principe de surveillance continue)
3. **Point de calibrage** après les 5-8 premiers envois : ajuster objet/accroche/CTA selon les taux de réponse réels
4. **Mettre à jour le workflow n8n** (`n8n_outreach_workflow.json`) avec le template email validé une fois calibré
5. **Élargir la couverture email** si besoin de scaler au-delà de ces 16 — c'est le vrai facteur limitant actuel, pas le scan CTI
6. **Corriger le plafond typosquatting** (point 3.5) avant un usage à plus grand volume
7. **Ajouter un garde-fou** contre les domaines devinés trop génériques coïncidant avec des marques connues (point 3.4)
8. **Envisager GitHub Pro** (4$/mois) si l'équipe s'agrandit, pour activer la vraie protection de branche

---

*Document généré pour référence — reflète l'état du projet à la date de rédaction. Le pipeline continue d'évoluer, ce README est un instantané, pas une source de vérité vivante (le code sur `feature/shadow-pulse-pipeline` fait foi).*
