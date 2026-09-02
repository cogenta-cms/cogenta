# Audit Installeur / CLI / Blueprints / Documentation / Hébergement mutualisé / Flotte / Publication — 2026-09-01

## 1. Résumé exécutif

Domaine vaste et globalement **solide côté mécanique** (installeur, CLI, blueprints,
documentation versionnée, hygiène des secrets) mais avec **un angle mort majeur** : le
paquet `@cogenta/fleet` (lot L8, « le plan de contrôle multi-sites »), donné pour
terminé dans `CLAUDE.md` avec 11/11 tâches et une suite de tests d'isolation, n'a
**strictement aucun point d'entrée exécutable** — ni commande CLI, ni route serveur, ni
processus « plan de contrôle », ni dépendance depuis un autre paquet du monorepo. Le
composant admin `packages/admin/src/fleet/dashboard.tsx` lui-même l'admet dans son
propre commentaire (« no live `@cogenta/fleet` backend wired anywhere »). C'est un
paquet-bibliothèque testé en vase clos, jamais relié à quoi que ce soit qu'un opérateur
puisse lancer.

Décompte des critères vérifiés dans ce document (fiches L9, L8, 66, 69, + points de
mission) : **18 FAIT**, **9 PARTIEL**, **6 ABSENT**, **3 POINT MORT**.

Second constat notable : `docs/versionnement.md` et `docs/06-lots.md` sont
**significativement obsolètes** — le premier affirme que « tous les `package.json` de
`packages/*` portent aujourd'hui `0.0.0` » et que « rien n'est encore publié sur le
registre npm » alors que `@cogenta/api` est en `1.1.0`, `@cogenta/core`/`@cogenta/cli`
en `0.4.0` et que CLAUDE.md documente une vraie publication npm réelle depuis plusieurs
sessions ; le second (« la » roadmap publique, selon `versionnement.md`) s'arrête à L9 et
ne mentionne ni L10-L24 ni les 69 fiches de `docs/plans/`.

Troisième constat, positif cette fois : la discipline changeset est **respectée** — les
27 paquets publics modifiés depuis le 2026-08-20 ont chacun au moins un changeset
en attente parmi les 91 fichiers de `.changeset/`. Le vrai problème n'est pas l'absence
de changeset mais l'absence de **publication** : 91 changesets en attente suggèrent
qu'aucune « Version Packages PR » n'a été mergée depuis longtemps, cohérent avec le
blocage humain déjà documenté (Trusted Publisher OIDC configuré pour seulement 2 des
~26 paquets publics sur npmjs.com).

Deux bugs concrets et réparables trouvés dans `docs/hebergement-mutualise.md`/le
scaffold : le `package.json` généré par `create-cogenta` n'a toujours ni script
`start` ni champ `engines`, ce qui rend le déploiement Passenger décrit par le guide
non prêt à l'emploi tel quel ; et à l'inverse, la lacune « pas de commande CLI pour
drainer la file de jobs via cron » que ce même guide signale est **aujourd'hui
obsolète** — tout le travail périodique (file de jobs planifiée, purge de corbeille,
purge RGPD des formulaires, tâches planifiées) tourne désormais sur les `setInterval`
internes de `cogenta serve`, donc aucune entrée cron externe n'est structurellement
requise tant que le processus Passenger reste vivant.

Import : seul WordPress a un importeur dédié et une commande CLI ; CSV/JSON/RSS
existent (fiche 65, admin uniquement, pas de commande CLI) ; **Ghost et Markdown avec
frontmatter, annoncés par L9, n'ont jamais été construits.**

## 2. Ce qui existe réellement

### CLI (`packages/cli/src/index.ts`, `packages/cli/src/commands/*.ts`)

Dispatch entièrement lisible dans `packages/cli/src/index.ts` (469 lignes). Commandes
réellement câblées, avec sous-commandes : `doctor`, `migrate {status,up,down}`,
`users {create,reset-password}`, `import {wordpress,content}`, `export`, `backup
{create,list}`, `restore {preview,apply}`, `update {check,apply,history}`, `generate
{types}`, `links {check}`, `skin {list,validate,apply,generate}`, `roles {export}`,
`serve`/`dev`, `mcp`, `channels`. Le texte `USAGE` (lignes 52-130 de `index.ts`) **dit
lui-même** honnêtement lesquelles sont différées : « build, deploy, theme, agent, and
generate schema/generate migrations… see CLAUDE.md for why each is deferred rather
than stubbed » — pas un oubli, une décision documentée et rendue visible dans l'aide
CLI elle-même, ce qui est la bonne pratique.

`cogenta doctor` (`packages/cli/src/commands/doctor.ts`) vérifie : `database`,
`cache`, `storage`, `rateLimit` (les quatre registres de `@cogenta/core`), présence/
absence d'un fournisseur LLM (note R2 explicite), avertissement SQLite pour une flotte,
`COGENTA_STORAGE_SIGNING_KEY`, `COGENTA_PREVIEW_SIGNING_KEY`, version Node (`node:sqlite`
requiert ≥22.13). **Il ne vérifie jamais le driver `vector`** (`packages/core/src/config/
schema.ts` ligne 341, ajouté par L18) ni le driver `imageGeneration` (ligne 340,
également L18) — ces deux registres existent (`packages/agents/src/rag/vector/index.ts`
`createVectorRegistry`, `packages/agents/src/providers/image/registry.ts`) mais aucun
`check('vector', …)`/`check('imageGeneration', …)` n'est jamais appelé dans
`doctor.ts` : un site avec un `vector.driver` cassé (ex. `pgvector` mal configuré) ne
le découvre qu'au premier appel de l'assistant, jamais via `cogenta doctor`.

`cogenta backup`/`restore` (`packages/cli/src/commands/backup.ts`, 340 lignes) : réel —
`createSiteBackup` sérialise toutes les tables, `previewRestore`/`applyRestore` sont de
vraies fonctions testées ; chiffrement par `--passphrase` disponible aux deux bouts.
`restore apply` est **volontairement CLI-only** (commentaire « CLI only (fiche 26) » —
pas d'exposition REST, cohérent avec le caractère destructeur de l'opération).

`cogenta update` (`packages/cli/src/commands/update.ts`) : ne compare que
**`@cogenta/core` et `@cogenta/cli`** (`installedPackages()`, lignes 54-59) — pas les
17 autres paquets publiés qu'un site peut avoir installés (thèmes, `@cogenta/commerce`,
etc.). `apply` crée un point de restauration avant d'agir (`createSiteBackup`
réutilisé), détecte un risque de rupture de contrat par lecture du changelog publié
(`contractRisk`), exige `--confirm-breaking` pour passer outre. Réutilisé à l'identique
par l'écran admin `updates.tsx` via `../update/index.js` — un seul chemin logique pour
les deux surfaces, pas une duplication.

### Installeur (`packages/create-cogenta/src/*`)

`index.ts`/`wizard.ts`/`scaffold.ts` orchestrent : vérification d'environnement
(`environment.ts`), questions (`prompts.ts`), génération de skin (`skin-flow.ts`,
`skin-preview.ts`, `starting-skins.ts`), étape document→plan de site optionnelle
(`document-step.ts`, `plan-flow.ts`, L19), écriture du site (`scaffold.ts`),
récapitulatif (`recap.ts`), réinitialisation du playground (`playground-reset.ts`).

10 blueprints déclarés dans `blueprints/registry.ts`, **tous `available: true`** :
`blank`, `vitrine`, `blog`, `magazine`, `portfolio`, `documentation`, `association`,
`restaurant`, `saas`, `store`. Chacun a son propre fichier
(`blueprints/{id}.ts`) avec ses propres collections `defineCollection`/`f.*` et son
propre test dédié (`packages/create-cogenta/test/*-blueprint.test.ts`, 118 `it(` au
total dans `test/`).

**Aucun blueprint ne déclare `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex`**
(`grep` vide sur `packages/create-cogenta/src/blueprints/*.ts`) — alors que ces champs
existent au contrat A et sont consommés par `@cogenta/seo` (fiche 13). **Aucun
blueprint n'utilise `defineTaxonomy()`** — le blueprint `blog` modélise toujours
`category`/`tag` comme deux `defineCollection` reliées par `f.relation` (`blog.ts`
lignes 27-59, 77-78), exactement la forme qu'avait le contrat A **avant** L13
(`schema@2.0`, taxonomies natives à chemin matérialisé) ; aucune migration de ces
blueprints vers `f.taxonomy()` n'a jamais eu lieu, alors que L13 est terminé depuis
longtemps et que `defineTaxonomy()` existe précisément pour ce cas d'usage.

`.env` généré avec `mode: 0o600` (`scaffold.ts` ligne 267) — **corrigé**, contrairement
à ce qu'une note plus ancienne laissait supposer. `database.url` avec identifiants en
clair n'est **toujours pas** dans `SECRET_KEYS` (`packages/core/src/config/env.ts`),
mais c'est une décision documentée et assumée (`secret-hygiene.ts`, commentaire complet)
: un refus dur casserait tout site SQLite/Postgres-sans-mot-de-passe légitime : à la
place, `buildSecretHygieneReport()` détecte une URL avec identifiants réels
(`urlHasEmbeddedCredentials`) et un `.env` lisible par d'autres (`hasGroupOrOtherRead`),
et **surface** les deux dans l'écran admin `ops-settings.tsx` (lignes 230-256) via
`GET` d'ops-status — jamais un blocage, jamais un silence.

`packageJsonContents()` (`scaffold.ts` lignes 184-201) **n'écrit toujours ni
`scripts.start` ni `engines`** — seulement `name`/`version`/`private`/`type`/
`dependencies`. Confirmé toujours vrai : lacune citée dans
`docs/hebergement-mutualise.md` et jamais corrigée.

### Blueprints — contenu (`packages/create-cogenta/src/blueprints/`)

`content-pack.ts`/`content-packs.ts` fournissent le mécanisme générique de contenu de
démonstration par blueprint ; chaque blueprint fournit ses propres entrées (voir
`blog.ts` lignes 145-330 pour un exemple complet — articles, catégories, étiquettes,
page d'accueil, tout marqué éditable).

### Documentation (`docs-site/`, `docs/`, `/admin/documentation`)

`docs-site/content/` : deux arborescences, `functional/` (8 pages, fr) et
`technical/` (6 pages, en) + `index.md` racine — conforme à L22 tâche 7. Générateur
`docs-site/build/generate.mjs` : Markdown→HTML maison (pas de nouvelle dépendance
lourde), zippe les vrais dossiers `examples/theme-starter`/`examples/plugin-starter`
en téléchargements réels via `@cogenta/export`'s `zip-writer.ts` (R9 — réutilisation,
pas une bibliothèque de zip ajoutée), tague chaque page avec
`Documentation correcte pour Cogenta v${COGENTA_VERSION}` lu depuis le vrai
`package.json` de `@cogenta/core`. Publié par `.github/workflows/docs-site.yml`
(déclenché sur push vers `docs-site/**`, GitHub Pages).

Admin : `packages/admin/src/routes/documentation.tsx` (276 lignes) +
`documentation-docs.tsx` (129, sert le même Markdown que `docs-site/content/`) +
`documentation-flows.tsx` (182, guides pas-à-pas). `documentation-docs.tsx` ligne 123
affiche le même `versionNote` que le site statique — une seule source, deux
consommateurs, exactement ce que L22 tâche 7 exigeait.

**`pnpm docs:check`** (`scripts/check-docs-examples.mjs`) tourne réellement en CI
(`.github/workflows/ci.yml` ligne 34) et compare chaque bloc de code de
`docs/getting-started.md` à `examples/getting-started/` — la règle « la documentation
qui pourrit » de L9 est concrètement appliquée, pas seulement énoncée.

`docs/getting-started.md` ligne 27 : « a site type ("blank" or "blog" — more
blueprints are coming) » — **obsolète**, 10 blueprints existent et sont tous
`available: true` depuis plusieurs lots.

`docs/hebergement-mutualise.md` : honnête sur son propre statut (« documenté, pas
encore testé sur un vrai hébergement » — bandeau en tête de fichier), checklist à 8
cases, **aucune cochée**. Les deux lacunes qu'il signale lui-même sont : (1)
`packageJsonContents` sans `start`/`engines` — **toujours vraie**, voir ci-dessus ; (2)
« aucune commande CLI pour drainer la file de jobs via cron » — **obsolète**, voir
§4.

`docs/versionnement.md` : périmé sur l'état de publication (voir résumé exécutif).

`docs/06-lots.md` : s'arrête à L9, ne mentionne ni L10-L24 ni les fiches 01-69 — le
même symptôme que la fiche 69 elle-même documente pour `CLAUDE.md`, mais 06-lots.md
n'est *pas* dans le périmètre de correction de la fiche 69 (qui ne cite que
`CLAUDE.md`, `00-vision.md`, `02-architecture.md`, `plans/README.md`).

### Gouvernance (racine du dépôt)

`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `security.txt`,
`.github/ISSUE_TEMPLATE/{bug,rfc}.yml` + `config.yml`, `.github/pull_request_template.md`,
`docs/rfc/README.md` + 2 RFC réelles (0001, 0002) — tous présents. CLA : `CONTRIBUTING.md`
ligne 95-99 renvoie à ADR-0012 et dit explicitement « The CLA text and the signing flow
are not live yet » — honnête, pas un fichier manquant par erreur.

### Flotte (`packages/fleet/src/*`, écran admin)

`packages/fleet/src/{enrollment,agent,control,inventory,rollout,reporting,alerts}` —
paquet complet, `exports` propre (`dist/index.js`). **`@cogenta/fleet` n'apparaît comme
dépendance dans AUCUN `package.json` du monorepo** (vérifié : `admin`, `cli`, `api`,
`create-cogenta` ne le déclarent pas). Aucune commande `cogenta fleet`, aucun routeur
serveur, aucun `bin` séparé pour un « plan de contrôle ». Les deux seules occurrences
du mot « fleet » dans `packages/cli/src/commands/` sont des faux positifs de langage
courant (« load-balanced `cogenta serve` fleet », « not for a fleet ») sans rapport
avec le paquet.

`packages/admin/src/fleet/dashboard.tsx` (147 lignes) : `FleetDashboard`, composant
React fonctionnel, testé isolément (`packages/admin/test/fleet/dashboard.test.tsx`),
filtre/groupe/cherche par client et niveau de risque — respecte bien le piège connu de
L8 (« inutilisable au-delà de vingt sites »). Son propre commentaire de tête (lignes
28-42) l'admet : « no live `@cogenta/fleet` backend wired anywhere in this codebase yet
(no control plane is deployed) ». **Jamais importé par aucune route, aucun item de
nav** (`grep` sur `nav-items.ts`, `app.tsx`, tout `routes/*.tsx` : zéro résultat en
dehors du fichier lui-même et de son test).

`docs/plans/README.md` (« Ce que cet ensemble ne couvre pas ») confirme que la
vague 2 n'a délibérément pas touché la flotte : « `@cogenta/fleet` existe et a son
propre écran ; ce n'est pas une fonctionnalité de la console d'un site » — ce qui
suppose l'existence d'un second produit (le plan de contrôle) qui, en pratique,
**n'existe pas en tant qu'application exécutable**.

### `@cogenta/project-site`

Package privé, dogfooding réel (`@cogenta/blocks`/`@cogenta/schema`/
`@cogenta/theme-canonical`), explicitement non déployé par ce dépôt (« deployment is out
of scope » dans son propre `package.json`). Utilise encore `@cogenta/theme-canonical`
seul — n'a jamais été mis à jour pour piocher dans les 4 nouveaux thèmes de L23 (mineur,
aucun critère d'acceptation ne l'exige).

### Import (`packages/import/src/*`)

`IMPORT_SOURCES = ['wordpress', 'csv', 'json', 'rss']` (`tracking.ts` ligne 28).
WordPress : `wordpress/{analyze,collections,content-convert,import,…}.ts` — complet,
rapport de conversion réel (`ContentConversionResult`), câblé en CLI
(`cogenta import wordpress`). CSV/JSON/RSS (`csv-import.ts`, `json-import.ts`,
`feed.ts`, `generic-import.ts`, fiche 65) : **admin uniquement**, aucune sous-commande
CLI (`ImportSubcommand = 'wordpress'`, seule valeur du type dans `import.ts`).
**Ghost et Markdown-avec-frontmatter, annoncés explicitement par L9 (« Puis Ghost
(JSON), puis Markdown avec frontmatter »), n'ont jamais été construits** — aucun
fichier `ghost*`/`markdown*` dans `packages/import/src`.

## 3. Vérification des fiches, critère par critère

| Fiche | Tâche / critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| L9 | Assistant d'installation, <60 s, 9× Entrée | PARTIEL | `create-cogenta/test/{index,wizard,scaffold}.test.ts`, `--yes` géré (`index.ts`) | Pas de test e2e chronométré réel ; couverture par unit/integration cross-OS (`ci.yml` matrice ubuntu/ubuntu-arm/macos/windows) mais aucune assertion « <60s » |
| L9 | `--yes`/`--config` non-interactifs | FAIT | `create-cogenta/src/index.ts`, `document-step.ts` (R2 : sans LLM, l'étape document n'est jamais posée même avec `--config documents:[...]`) | — |
| L9 | Génération de skin par IA, validation dure, 3 tentatives | FAIT | `skin-flow.ts`, `skin-validation-corpus.test.ts` | — |
| L9 | 8 blueprints listés (vitrine, blog, magazine, portfolio, documentation, association, restaurant, SaaS) | FAIT (+1) | `blueprints/registry.ts` — 9 nommés + `blank` | `store` (boutique) ajouté en plus, cohérent avec L15 commerce |
| L9 | Blueprint = modèle de contenu + skin + agents préconfigurés + démo + pages types | PARTIEL | `blueprints/*.ts`, `starting-skins.ts` | Aucun blueprint ne pré-configure d'agent (`packages/agents-builtin` jamais référencé depuis `create-cogenta/src`) ; aucun ne déclare `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex` ; `blog` n'utilise pas `defineTaxonomy()` malgré schema@2.0 |
| L9 | Import WordPress avec rapport, redirections préservées | FAIT | `wordpress/import.ts`, `wordpress/content-convert.ts`, `ContentConversionResult` | — |
| L9 | Import Ghost (JSON) | ABSENT | `grep` vide dans `packages/import/src` | Jamais commencé |
| L9 | Import Markdown+frontmatter | ABSENT | idem | Jamais commencé |
| L9 | CLI complet (`dev/build/generate/migrate/doctor/backup/upgrade/deploy/import/theme/skin/agent`) | PARTIEL | `packages/cli/src/index.ts` USAGE lignes 52-93 | `build`, `deploy`, `theme`, `agent`, `upgrade` (fusion migrations+update), `generate schema/migrations` explicitement différés — **documenté dans l'aide CLI elle-même**, pas un oubli caché |
| L9 | `cogenta doctor` complet | PARTIEL | `doctor.ts` lignes 139-193 | Vérifie `database`/`cache`/`storage`/`rateLimit`, jamais `vector`/`imageGeneration` (config existants depuis L18) |
| L9 | `cogenta doctor` diagnostique 3 pannes différentes | FAIT | `packages/cli/test/doctor.test.ts` — champ de config invalide, clé de prévisualisation absente/trop courte, driver non sélectionnable | — |
| L9 | Profil mutualisé testé sur cPanel réel | ABSENT (assumé) | `docs/hebergement-mutualise.md` bandeau + checklist 0/8 | Accès humain non disponible, honnêtement documenté, pas du travail en attente |
| L9 | Doc fonctionnelle + technique + architecture (SVG animés) | PARTIEL | `docs-site/content/{functional,technical}/*.md` | Pas de SVG animés trouvés dans `docs-site/content/technical/architecture.md` (texte seul, `grep -c svg` à vérifier plus finement si repris) |
| L9 | Tout exemple de code exécuté en CI | FAIT | `scripts/check-docs-examples.mjs`, `ci.yml` ligne 34 | — |
| L9 | Gouvernance (CONTRIBUTING/CoC/SECURITY/security.txt/templates/RFC/roadmap/CLA) | PARTIEL | racine du dépôt, `docs/rfc/` | Tout présent sauf CLA (honnêtement « pas encore live », ADR-0012) ; roadmap (`06-lots.md`) périmée (s'arrête à L9) |
| L8 | Appairage jeton à usage unique, clés Ed25519 | FAIT (déclaré, non revérifié ici) | `packages/fleet/src/enrollment/` | Non ré-audité en détail — hors du problème principal (aucun point d'entrée) |
| L8 | Push-only, plan de contrôle jamais de connexion entrante | FAIT (déclaré) | `packages/fleet/src/agent/` | idem |
| L8 | Tableau de bord trié par risque, pas alphabétique | FAIT (composant) / **POINT MORT** (intégration) | `packages/admin/src/fleet/dashboard.tsx` | Composant correct isolément ; jamais monté dans l'admin, jamais alimenté par une vraie source de données |
| L8 | Mises à jour par vagues, arrêt sur échec | FAIT (déclaré, jamais atteignable en pratique) | `packages/fleet/src/rollout/` | Aucun moyen pour un opérateur de déclencher une campagne réelle — pas de CLI, pas de route |
| L8 | Isolation mémoire agent inter-site | FAIT (déclaré) | `packages/fleet/test/isolation/` (cité par CLAUDE.md) | Non ré-exécuté ici |
| L8 | Critère global : « aucune donnée ne traverse la frontière entre deux sites » | **POINT MORT** | — | Le critère est vérifié en test unitaire mais n'a aucune façon d'être exercé en conditions réelles : il n'existe aucun processus « plan de contrôle » à attaquer |
| 66 | Écran Mises à jour autonome, extrait de `ops-settings.tsx` | FAIT | `packages/admin/src/routes/updates.tsx` existe, `nav-items.ts` a une entrée dédiée | Vérifié par grep de présence du fichier ; câblage nav confirmé (`updates.tsx` séparé, `ops-settings.tsx` ne garde que CORS/CSP/HSTS/webhooks selon les fichiers lus) |
| Mission | `database.url` absent de `SECRET_KEYS` | FAIT (statu quo assumé) | `packages/core/src/config/secret-hygiene.ts` | Décision documentée, pas un oubli : détection + affichage plutôt que refus dur, pour ne pas casser SQLite/Postgres sans mot de passe |
| Mission | `.env` sans mode restrictif | **CORRIGÉ** (n'est plus vrai) | `scaffold.ts` ligne 267, `mode: 0o600` | La note de suivi antérieure est obsolète, à mettre à jour dans tout document qui la répète encore |
| Mission | Paquets publiés modifiés sans changeset (depuis 2026-08-20) | AUCUN | `.changeset/*.md` (91 fichiers) vs `git log --name-only` | Diff vide — voir méthode en §1 |
| 69 | `docs/06-lots.md` à jour | ABSENT (hors périmètre strict de la fiche 69, mais même symptôme) | `docs/06-lots.md` s'arrête à L9 | Non couvert par la liste de fichiers de la fiche 69 elle-même — angle mort de la fiche 69 |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P0** | `packages/fleet/` (paquet entier) + `packages/admin/src/fleet/dashboard.tsx` | Le paquet de contrôle de flotte (L8, 11/11 tâches déclarées faites) n'est dépendance d'aucun autre `package.json` du monorepo, n'a aucune commande CLI, aucune route serveur, aucun processus de plan de contrôle. Le composant de tableau de bord admin existe mais n'est monté nulle part (aucune entrée `nav-items.ts`, aucune route). C'est une bibliothèque testée en vase clos, pas une fonctionnalité livrée. | Voir T01 en §6 |
| P1 | `docs/versionnement.md` §1 | Affirme « tous les `package.json` de `packages/*` portent `0.0.0` » et « rien n'est encore publié sur npm », alors que `@cogenta/api` est en `1.1.0`, `@cogenta/core`/`@cogenta/cli` en `0.4.0`, et que CLAUDE.md documente une publication npm réelle en cours depuis plusieurs sessions | Voir T02 |
| P1 | `docs/06-lots.md` | Roadmap publique désignée par `versionnement.md` comme LA référence, mais s'arrête à L9 — L10 à L24 et les 69 fiches de `docs/plans/` sont absents | Voir T03 |
| P1 | `packages/create-cogenta/src/scaffold.ts:184-201` (`packageJsonContents`) | Le `package.json` scaffoldé n'a ni `scripts.start` ni `engines` — un déploiement Passenger tel que documenté par `docs/hebergement-mutualise.md` §6 ne peut pas démarrer sans qu'un opérateur ajoute ce script à la main | Voir T04 |
| P2 | `packages/cli/src/commands/doctor.ts` | Aucun `check('vector', …)` ni `check('imageGeneration', …)` malgré l'existence de ces deux sections de config (`config/schema.ts` lignes 340-341, L18) et de leurs registres (`createVectorRegistry`, image driver registry) | Voir T05 |
| P2 | `docs/hebergement-mutualise.md` (section « Séquence de déploiement » étape 7, et le paragraphe « File de jobs ») | Documente une lacune (« aucune commande CLI pour drainer la file de jobs via cron ») qui n'est plus le modèle réel : `runServe` draine désormais tout le travail périodique (file de jobs, purge de corbeille, purge RGPD des formulaires, tâches planifiées) via ses propres `setInterval` internes (commentaire explicite `packages/cli/src/commands/serve.ts:5282`, « `setInterval` *is* the cron a hosted deployment with no worker would use ») tant que le process Passenger reste vivant | Voir T06 |
| P2 | `packages/cli/src/commands/update.ts:54-59` | `cogenta update check/apply` ne compare que `@cogenta/core`/`@cogenta/cli` — les 15+ autres paquets `@cogenta/*` qu'un site installe (thème actif, `@cogenta/commerce`, etc.) ne sont jamais vérifiés | Voir T07 |
| P2 | `packages/import/src/*`, `packages/cli/src/commands/import.ts:17` | CSV/JSON/RSS (fiche 65) existent mais sont admin-only ; `ImportSubcommand` CLI ne connaît que `'wordpress'` — pas de parité CLI/admin pour ces trois sources | Voir T08 |
| P3 | `docs/getting-started.md:27` | « a site type ("blank" or "blog" — more blueprints are coming) » — obsolète, 10 blueprints existent | Voir T09 |
| P3 | Blueprints `create-cogenta` | Aucun ne déclare `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex` ; `blog.ts` modélise `category`/`tag` en `defineCollection`+`relation` au lieu de `defineTaxonomy()`/`f.taxonomy()` (schema@2.0, L13) | Voir T10 |
| P3 | `packages/import/src/index.ts` | Ghost et Markdown+frontmatter annoncés par L9, jamais construits | Voir T11 |
| — (constat, pas un bug) | `.changeset/` (91 fichiers en attente) | Publication npm bloquée par un accès humain (Trusted Publisher OIDC non configuré au-delà de 2 paquets), pas par un défaut de code — `scripts/publish-changed.mjs` est déjà un mécanisme correct et testé | Rien à coder ; signaler à l'humain (cf. règle des trois cas d'arrêt) |

Aucun `any`/`@ts-ignore`/`console.log`/`throw new Error` nu trouvé dans le code lu pour
ce domaine (`packages/cli/src/commands/*.ts`, `packages/create-cogenta/src/*.ts`,
`docs-site/build/generate.mjs`). Aucun contrôle de permission dans un outil (R4) — la
CLI n'expose pas d'outils contrat C. Aucune fonctionnalité **obligatoire** de ce domaine
ne dépend d'une clé IA : la génération de skin/le plan de site se dégradent proprement
(skin par défaut, étape document jamais posée) sans fournisseur configuré (R2 respectée,
vérifiée par grep des messages `SITE_PLAN_NO_PROVIDER` déjà connus de L19).

## 5. Comparaison marché

### WordPress (installeur 5 minutes + wp-cli)

| Fonctionnalité WordPress | Cogenta | Détail |
|---|---|---|
| Installeur web 5 minutes | OUI | `npm create cogenta`, <60s visé, non chronométré en CI |
| `wp core download/install/verify-checksums` | PARTIEL | `create-cogenta` scaffold + `migrate up` ; pas de vérification d'intégrité de paquet |
| `wp plugin install/activate/update/list` | PARTIEL | `@cogenta/plugins` gère install/permissions (L7) ; pas de sous-commande CLI dédiée `cogenta plugin` (à vérifier hors de ce domaine, écran admin existe) |
| `wp theme install/activate` | PARTIEL | Sélecteur de thème dans l'écran Apparence (L23) ; pas de commande CLI `cogenta theme` (différée, documentée) |
| `wp db export/import/query/optimize` | PARTIEL | `cogenta backup create`/`restore` couvrent export/import complet ; pas de `query` interactif ni d'`optimize` dédié |
| `wp user create/update/list/meta` | PARTIEL | `cogenta users create/reset-password` ; pas de `list`/`meta` en CLI (existe côté admin/API, hors CLI) |
| `wp search-replace` | ABSENT | Aucun équivalent CLI trouvé dans ce domaine |
| `wp cron event list/run/schedule` | PARTIEL | Tâches planifiées existent (`ScheduledTaskRegistry`, écran admin) ; aucune commande CLI pour lister/forcer une exécution |
| `wp media regenerate` | ABSENT | Pas de commande CLI pour régénérer les variantes d'image après coup |
| Mises à jour auto | PARTIEL | `cogenta update check/apply` (core+cli seulement, restore point automatique) ; pas d'auto-update planifié |
| Multisite | NON | `@cogenta/fleet` vise ce rôle mais n'est reliable à rien (voir §4 P0) |
| `wp doctor`/`wp-cli checksum` | PARTIEL | `cogenta doctor` couvre drivers+env+Node, mais pas de vérification d'intégrité de fichiers |

### Strapi CLI

| Fonctionnalité Strapi | Cogenta | Détail |
|---|---|---|
| `strapi new` (scaffold interactif) | OUI | `npm create cogenta` |
| `strapi generate` (api/content-type/controller/policy) | NON | ADR-0010 interdit un éditeur de schéma en production ; en dev, le schéma reste un fichier TS écrit à la main, pas un générateur CLI |
| `strapi develop/start/build` | PARTIEL | `cogenta dev`/`serve` existent ; `build` (vers une cible statique/Astro) explicitement différé |
| `strapi export/import/transfer` (entre environnements) | PARTIEL | `cogenta export`/`import content` couvrent export/import NDJSON d'un même site ; pas de `transfer` direct entre deux environnements distants |
| `strapi admin:create-user/reset-password` | OUI | `cogenta users create`/`reset-password` |
| `strapi console` (REPL) | NON | Aucun équivalent |

### Ghost CLI

| Fonctionnalité Ghost-CLI | Cogenta | Détail |
|---|---|---|
| `ghost install`/`setup` | OUI | `npm create cogenta` |
| `ghost update` | PARTIEL | `cogenta update` (2 paquets seulement, voir P2 ci-dessus) |
| `ghost backup` | OUI | `cogenta backup create` |
| `ghost start/stop/restart` (gestion de process) | NON | Cogenta ne gère pas son propre superviseur de process — délégué à Passenger/systemd/pm2 selon le profil, cohérent avec l'absence de VPS dédié géré |
| `ghost doctor` | PARTIEL | `cogenta doctor`, périmètre plus étroit (pas de vérif de process manager, de port, de permissions fichier globales) |
| `ghost log` | ABSENT | Pas de commande CLI de consultation de logs (l'observabilité L22 a un écran admin, pas de CLI) |

### drush (Drupal)

| Fonctionnalité drush | Cogenta | Détail |
|---|---|---|
| `site-install` | OUI | `create-cogenta` |
| `updatedb`/`updb` | PARTIEL | `cogenta migrate up` (équivalent direct) |
| `config-export`/`config-import` (cex/cim) | NON | Pas de mécanisme de config-as-code exportable/réimportable au-delà du fichier `cogenta.config.mjs` lui-même (déjà versionné par nature) |
| `cache-rebuild` (cr) | ABSENT | Pas de commande CLI de purge de cache explicite |
| `user-create`/`user-role-add` | OUI | `cogenta users create --roles` |
| `sql-dump`/`sql-sync` | PARTIEL | `cogenta backup`/`restore` couvrent le dump complet, pas un `sql-sync` distant-à-distant |
| `watchdog-show` (logs) | ABSENT | idem Ghost `log` |
| `pm-enable/disable` (modules) | PARTIEL | Écran admin plugins (L7) ; pas de commande CLI |
| `core-requirements` (doctor) | OUI | `cogenta doctor` |

### Astro / Next.js (`create`, `dev/build/preview`)

| Fonctionnalité | Cogenta | Détail |
|---|---|---|
| `npm create astro@latest` interactif | OUI | `npm create cogenta` |
| `dev` | OUI | `cogenta dev` (schéma inscriptible, ADR-0010) |
| `build` (statique/SSR) | NON | Explicitement différé (pipeline Astro annoncé depuis L3, jamais construit — `cogenta serve` fait du SSR à la volée) |
| `preview` | NON | Pas de mode preview de build séparé — cohérent avec l'absence de `build` |
| `astro check`/`next lint` | PARTIEL | `pnpm typecheck`/`pnpm lint` existent au niveau monorepo, pas une commande `cogenta check` par site |

### ManageWP / MainWP (flotte)

| Fonctionnalité | Cogenta | Détail |
|---|---|---|
| Tableau de bord multi-sites groupé par client | **NON en pratique** | Composant `FleetDashboard` existe et fait exactement ça visuellement, mais rien ne l'alimente ni ne l'affiche à un opérateur — voir §4 P0 |
| Mises à jour groupées | **NON en pratique** | `packages/fleet/src/rollout/` logique déclarée testée, aucun déclencheur réel |
| Sauvegardes centralisées | NON | Chaque site sauvegarde localement (`cogenta backup`) ; rien ne centralise ni ne vérifie depuis un plan de contrôle |
| Surveillance de disponibilité | **NON en pratique** | `packages/fleet/src/agent/` émet de la télémétrie en théorie ; aucun processus ne l'envoie ni ne la reçoit |
| Rapports client mensuels | **NON en pratique** | `packages/fleet/src/reporting/` existe, jamais déclenché |
| Marque blanche pour l'agence | NON | Cogenta a une marque blanche **par site** (logo, L21/L24) mais aucune couche « agence supervisant plusieurs clients » n'est atteignable |
| Suivi de certificats/domaines | ABSENT | Non trouvé même dans `packages/fleet/src/inventory/` (à confirmer si un autre domaine d'audit couvre la partie serveur HTTPS elle-même) |

## 6. Spécification ultra détaillée des corrections et ajouts

## T01 — Donner un point d'entrée réel à `@cogenta/fleet`

**Priorité** : P0. **Effort** : 3-5 j. **ADR requise** : non (le paquet et son modèle
de données existent déjà, ADR-0003 déjà actée — il s'agit de câblage, pas de nouvelle
décision d'architecture).

**Fichiers à toucher** : nouveau `packages/cli/src/commands/fleet-control.ts` (ou
paquet séparé `@cogenta/fleet-server` si le plan de contrôle doit être un processus
distinct de tout site — à trancher en écrivant, cohérent avec ADR-0003 « le plan de
contrôle est un observateur, pas un site »), `packages/cli/src/index.ts` (nouvelle
commande, ex. `cogenta fleet-control serve`/`cogenta fleet enroll` côté site),
`packages/admin/src/shell/nav-items.ts`, nouvelle route admin
`packages/admin/src/routes/fleet.tsx` montant `FleetDashboard`, `packages/api/src/rest/
fleet-router.ts` (nouveau, expose l'ingestion de télémétrie et la lecture de risque).

**Travail détaillé** :
1. Décider où vit le processus « plan de contrôle » — une nouvelle commande CLI
   (`cogenta fleet-control serve`, séparée de `cogenta serve` d'un site ordinaire,
   cohérent avec `cogenta channels` qui tourne déjà dans son propre process pour ne
   jamais dupliquer une connexion persistante) est le choix le plus proche de ce que le
   monorepo fait déjà.
2. Côté site : une commande d'appairage (`cogenta fleet enroll --token <jeton>`) qui
   consomme `packages/fleet/src/enrollment/` pour écrire les clés Ed25519 générées,
   et un déclenchement de push de télémétrie sur le même `setInterval` que le reste
   (`runServe`, cohérent avec le principe « le site pousse »).
3. Côté plan de contrôle : un routeur REST minimal (`fleet-router.ts`) qui appelle
   `packages/fleet/src/control/` pour l'ingestion, monte `FleetDashboard` avec de
   vraies données au lieu de `sites: []`.
4. Déclarer `@cogenta/fleet` comme dépendance réelle de `@cogenta/cli` et/ou
   `@cogenta/api` (actuellement absent de tout `package.json`).

**Critères d'acceptation** : un site scaffoldé peut s'appairer à un plan de contrôle
réellement démarré (`cogenta fleet-control serve`) via une commande CLI documentée
dans `USAGE` ; `FleetDashboard` affiche des données réelles issues d'un vrai
appairage, pas un tableau vide ; le test d'isolation existant (`packages/fleet/test/
isolation/`) est rejoué contre le nouveau câblage, pas seulement contre les stores nus.

**Tests exigés** : e2e — deux sites simulés s'appairent à un plan de contrôle réel,
poussent de la télémétrie, le tableau de bord la reflète ; test de résilience —
plan de contrôle éteint, le site continue de fonctionner (déjà un critère L8, à
revérifier en conditions de câblage réel plutôt qu'en isolation).

**Impact contrat/ADR** : aucun contrat A/B/C/D touché. Cohérent avec ADR-0003 déjà
actée. Si le processus « plan de contrôle » doit être un second binaire distinct de
`@cogenta/cli`, envisager un nouveau paquet `@cogenta/fleet-server` — décision produit
mineure, pas une ADR.

## T02 — Corriger `docs/versionnement.md`

**Priorité** : P1. **Effort** : 1 h. **ADR requise** : non.

**Fichiers** : `docs/versionnement.md` §1.

**Travail** : remplacer « tous les `package.json` de `packages/*` portent aujourd'hui
`0.0.0` » et « rien n'est encore publié sur le registre npm public » par un état réel
— lister au moins les versions actuelles de `@cogenta/core` (0.4.0), `@cogenta/cli`
(0.4.0), `@cogenta/api` (1.1.0), `create-cogenta` (0.2.1), et mentionner les 91
changesets en attente de publication (voir T03bis) ainsi que le blocage OIDC restant.

**Critère d'acceptation** : le document ne contredit plus l'état réel de
`packages/*/package.json` ni CLAUDE.md.

**Tests exigés** : aucun (documentation).

## T03 — Mettre à jour ou déprécier `docs/06-lots.md` comme roadmap publique

**Priorité** : P1. **Effort** : 0,5-1 j. **ADR requise** : non.

**Fichiers** : `docs/06-lots.md`, `docs/versionnement.md` (le lien « roadmap
publique »).

**Travail** : soit étendre `docs/06-lots.md` avec L10-L24 (lourd, redondant avec
CLAUDE.md), soit — option recommandée, cohérente avec l'esprit de la fiche 69 —
remplacer sa mention dans `versionnement.md` par un renvoi vers `CLAUDE.md` (État
courant) et `docs/plans/README.md` (fiches), et ajouter en tête de `06-lots.md` un
bandeau du même type que celui que fiche 69 recommande pour `docs/plans/README.md` :
« couvre L0-L9 seulement ; L10-L24 et les fiches 01-69 sont dans CLAUDE.md / docs/plans/ ».

**Critère d'acceptation** : un lecteur de `versionnement.md` qui suit le lien
« roadmap publique » n'aboutit pas sur un document qui semble complet mais s'arrête à
35 % du travail réellement livré.

**Tests exigés** : aucun (documentation).

## T04 — `packageJsonContents` : ajouter `scripts.start` et `engines`

**Priorité** : P1. **Effort** : 2-3 h. **ADR requise** : non.

**Fichiers** : `packages/create-cogenta/src/scaffold.ts` (fonction
`packageJsonContents`, lignes 184-201), `packages/create-cogenta/test/scaffold.test.ts`.

**Travail** : ajouter `"scripts": { "start": "cogenta serve" }` et
`"engines": { "node": ">=22.13" }` (cohérent avec la vérification déjà faite par
`doctor.ts` ligne 189 et par `environment.ts` de l'installeur lui-même) à l'objet
`pkg` construit par `packageJsonContents`.

**Critères d'acceptation** : un `package.json` scaffoldé contient `scripts.start` et
`engines.node` ; `docs/hebergement-mutualise.md` peut retirer sa mention de lacune à ce
sujet une fois vérifié.

**Tests exigés** : test unitaire sur `packageJsonContents` (ou `scaffold.test.ts`) qui
vérifie la présence des deux champs.

## T05 — `cogenta doctor` : vérifier les drivers `vector` et `imageGeneration`

**Priorité** : P2. **Effort** : 3-4 h. **ADR requise** : non.

**Fichiers** : `packages/cli/src/commands/doctor.ts` (imports + boucle de `check(...)`
lignes 139-145).

**Travail** : importer `createVectorRegistry` (`@cogenta/agents` — vérifier l'absence
de cycle de dépendance `cli`→`agents`, déjà présent ailleurs dans `cli`, ex.
`assistant.ts`/`tools.ts`) et l'éventuel registre `imageGeneration` ; ajouter
`await check('vector', () => createVectorRegistry(...).select(config.vector))` et
l'équivalent pour `imageGeneration` **seulement si `config.imageGeneration` est
défini** (section optionnelle — ne pas faire échouer `doctor` pour un site qui n'a pas
activé la génération d'images, cohérent avec R2/l'esprit du reste du fichier qui
traite le LLM comme une note, pas un `problem`, quand absent).

**Critères d'acceptation** : un site avec `vector.driver: 'pgvector'` mal configuré
échoue `cogenta doctor` avec un message actionnable, avant le premier appel réel de
l'assistant.

**Tests exigés** : deux nouveaux cas dans `doctor.test.ts` (vector cassé, vector
absent = pas de problème puisqu'un défaut mémoire existe).

## T06 — Réviser `docs/hebergement-mutualise.md` sur la file de jobs/cron

**Priorité** : P2. **Effort** : 1-2 h. **ADR requise** : non.

**Fichiers** : `docs/hebergement-mutualise.md` (paragraphe « File de jobs » et étape 7
de la séquence de déploiement).

**Travail** : remplacer la « lacune réelle constatée » par l'état réel du code —
`runServe` draine tout le travail périodique via ses propres `setInterval` tant que le
processus Passenger reste vivant (citer `packages/cli/src/commands/serve.ts:5282` et
son commentaire « `setInterval` *is* the cron a hosted deployment with no worker would
use »). Nuancer plutôt que retirer entièrement l'étape 7 : le risque réel n'est plus
« aucun mécanisme de cron n'existe » mais « un recyclage de processus Passenger
suspend tous les timers jusqu'au prochain contact » — un point qui mérite d'être
noté explicitement s'il ne l'est pas déjà ailleurs dans le document (relire la
section « Limites mémoire et recyclage des processus » à cette lumière).

**Critères d'acceptation** : le document ne prescrit plus une commande CLI de
drainage manquante qui n'est plus nécessaire dans l'architecture actuelle.

**Tests exigés** : aucun (documentation) — mais si la section « recyclage »
révèle un vrai trou (perte de tick pendant un recyclage prolongé), le signaler comme
item séparé plutôt que de le corriger silencieusement dans la doc.

## T07 — `cogenta update` : couvrir les paquets installés au-delà de core/cli

**Priorité** : P2. **Effort** : 1-1,5 j. **ADR requise** : non.

**Fichiers** : `packages/cli/src/commands/update.ts` (`installedPackages()`),
`packages/cli/src/update/index.ts`.

**Travail** : lire le `package.json` du site scaffoldé (déjà accessible via `cwd`)
pour lister tous les `dependencies` `@cogenta/*` réellement installées (thème actif,
`@cogenta/commerce` si présent, etc.) plutôt que la liste figée à deux entrées ;
comparer chacune contre npm comme le fait déjà `checkForUpdates` pour core/cli.
Attention à ne pas casser le comportement existant pour un site qui n'a que
core+cli+theme-canonical (cas le plus courant) — le test de contrat risque déjà
existant (scan de changelog) doit s'appliquer à chaque paquet listé, pas seulement
aux deux historiques.

**Critères d'acceptation** : un site avec `@cogenta/theme-portfolio` installé voit
`cogenta update check` le signaler s'il a une mise à jour disponible.

**Tests exigés** : test avec un site scaffoldé de dépendances additionnelles
(`package.json` de test avec 3+ `@cogenta/*`), vérifiant que `update check` les
liste toutes.

## T08 — Exposer CSV/JSON/RSS en CLI (parité avec l'admin)

**Priorité** : P2. **Effort** : 1 j. **ADR requise** : non.

**Fichiers** : `packages/cli/src/commands/import.ts` (`ImportSubcommand`),
`packages/cli/src/index.ts` (dispatch), réutilisation de `analyzeGeneric`/`applyGeneric`/
`analyzeJson`/`applyJson`/`csvToRecords`/`feedToRecords` déjà exportés par
`@cogenta/import`.

**Travail** : étendre `ImportSubcommand` à `'wordpress' | 'csv' | 'json' | 'rss'`,
brancher chaque sous-commande sur les fonctions déjà existantes et déjà testées côté
admin — aucune nouvelle logique métier, uniquement un second point d'entrée pour ce
qui existe déjà (même discipline que fiche 66 : extraction/câblage, pas de
réinvention).

**Critères d'acceptation** : `cogenta import csv <file.csv>` et `cogenta import json
<file.json>` fonctionnent en ligne de commande avec le même rapport que l'écran admin.

**Tests exigés** : un test CLI par source, réutilisant les fixtures déjà présentes
pour les tests admin de fiche 65 si elles existent.

## T09 — `docs/getting-started.md` : corriger la liste de blueprints

**Priorité** : P3. **Effort** : 15 min. **ADR requise** : non.

**Fichiers** : `docs/getting-started.md` ligne 27.

**Travail** : remplacer « ("blank" or "blog" — more blueprints are coming) » par la
liste réelle des 10 blueprints (`blank`, `vitrine`, `blog`, `magazine`, `portfolio`,
`documentation`, `association`, `restaurant`, `saas`, `store`) ou un renvoi vers
`blueprints/registry.ts`/la doc fonctionnelle correspondante, sans lister chaque nom en
dur pour éviter une nouvelle dérive au prochain blueprint ajouté.

**Critères d'acceptation** : le texte ne sous-vend plus une fonctionnalité déjà livrée
depuis plusieurs lots. Ce bloc de code étant vérifié par `docs:check`, s'assurer que la
modification ne casse pas la comparaison avec `examples/getting-started/` (texte libre
hors bloc de code, donc a priori non concerné par le script).

**Tests exigés** : `pnpm docs:check` doit rester vert après la modification.

## T10 — Faire évoluer les blueprints vers `defineTaxonomy()`/`f.taxonomy()` et ajouter les champs SEO

**Priorité** : P3. **Effort** : 1-1,5 j. **ADR requise** : non (usage d'un mécanisme
de contrat A déjà figé et déjà mineur — `schema@2.0` — pas une extension de contrat).

**Fichiers** : `packages/create-cogenta/src/blueprints/blog.ts` (et tout autre
blueprint avec un couple catégorie/étiquette similaire — vérifier `magazine.ts`,
`vitrine.ts`), `packages/create-cogenta/src/blueprint-defaults.ts` si les champs SEO
doivent être ajoutés de façon centralisée à toutes les collections routées plutôt que
blueprint par blueprint.

**Travail** :
1. Remplacer `category`/`tag` en `defineCollection`+`f.relation` par
   `defineTaxonomy()` + `f.taxonomy({ of, many })` dans `blog.ts` (et équivalents) —
   attention : ceci change la forme des données de démonstration semées
   (`content-pack.ts`) et les tests de blueprint associés, à mettre à jour dans le
   même mouvement.
2. Ajouter `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex` aux champs des
   collections routées (`post`, `page`, et tout blueprint équivalent) — champs déjà
   consommés par `@cogenta/seo` (fiche 13), donc un simple ajout de déclaration de
   champ, pas une nouvelle fonctionnalité.

**Critères d'acceptation** : un site scaffoldé avec le blueprint `blog` a une vraie
taxonomie `category`/`tag` (chemin matérialisé, profondeur, `many: true` par défaut)
et des champs SEO éditables dès l'installation, sans configuration manuelle
supplémentaire.

**Tests exigés** : `blog-blueprint.test.ts` et voisins mis à jour ; vérifier que le
rendu du thème canonique (et des 4 thèmes L23) consomme correctement des taxonomies
plutôt que des relations à cet endroit — risque de régression visuelle si un thème
attend spécifiquement la forme `relation`.

**Impact contrat/ADR** : aucun — usage direct de contrat A `schema@2.0`, déjà figé et
déjà en place depuis L13. Signaler quand même à `contract-guardian` avant fusion,
par discipline (changement de forme de données d'un blueprint publié).

## T11 — Importeurs Ghost et Markdown+frontmatter

**Priorité** : P3. **Effort** : 3-5 j (Ghost, format JSON documenté et stable) + 2-3 j
(Markdown+frontmatter, plus simple). **ADR requise** : non.

**Fichiers** : nouveau `packages/import/src/ghost/*.ts` (même structure que
`wordpress/`), nouveau `packages/import/src/markdown/*.ts`, extensions de
`packages/import/src/index.ts`, `packages/import/src/tracking.ts`
(`IMPORT_SOURCES`), `packages/cli/src/commands/import.ts`.

**Travail** : suivre le même gabarit que WordPress — `analyze*` (aperçu/rapport de
conversion), `import*` (application), mapping de champs réutilisant
`mapping.ts`/`proposeFieldMapping` déjà générique. Le piège connu de L9 s'applique
identiquement : « l'import est un marais » — construire sur des exports Ghost et des
corpus Markdown réels, pas des fixtures propres fabriquées pour l'occasion (même
discipline que `packages/create-cogenta`'s corpus PDF/DOCX de L19, généré par des
outils tiers réels plutôt qu'écrit par la main qui teste).

**Critères d'acceptation** : un export Ghost JSON réel s'importe avec un rapport de
conversion nommé (article/page/tag/auteur/media), symétrique à WordPress. Un dossier
Markdown avec frontmatter s'importe en préservant le frontmatter mappé aux bons champs
de contrat A.

**Tests exigés** : intégration avec au moins un export Ghost réel et un corpus
Markdown varié (encodages, frontmatter incomplet, liens relatifs).

## 7. Ordre d'exécution recommandé et dépendances

1. **T02, T03, T09** (documentation pure, aucune dépendance, quelques heures au
   total) — à faire en premier, aucun risque de régression.
2. **T04** (`scripts.start`/`engines`) — indépendant, rapide, débloque une vérification
   plus honnête de `docs/hebergement-mutualise.md` (à faire juste après, T06).
3. **T06** (révision doc cron) — dépend d'avoir lu/compris T04 pour ne pas mélanger les
   deux lacunes dans la même passe de relecture.
4. **T05** (doctor vector/imageGeneration) — indépendant, petite taille.
5. **T07, T08** — indépendants l'un de l'autre, tous deux du câblage pur (aucune
   nouvelle logique métier), peuvent être menés en parallèle dans deux worktrees.
6. **T10** — à faire après T08 seulement si un blueprint importé (WordPress avec
   catégories) doit rester cohérent avec la nouvelle forme taxonomique des blueprints
   natifs ; sinon indépendant. Vérifier l'impact sur le rendu des thèmes avant de
   fusionner (risque de régression visuelle identifié).
7. **T11** — le plus gros morceau, à traiter en dernier ou en parallèle dédié ; aucune
   dépendance avec le reste de cette liste.
8. **T01** — à part, le plus gros effort et la seule décision d'architecture
   (processus séparé ou non) de tout ce document ; ne bloque aucune autre tâche de
   cette liste et n'est bloqué par aucune d'elles, mais mérite d'être signalé et
   discuté avec l'humain avant d'être entamé compte tenu de sa taille et du fait qu'il
   ressuscite un lot entier (L8) considéré clos.
