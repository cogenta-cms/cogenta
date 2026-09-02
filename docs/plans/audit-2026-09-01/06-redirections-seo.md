# Audit Redirections, SEO éditorial et SEO plateforme — 2026-09-01

## 1. Résumé exécutif

Constat principal : les fiches `12-redirections.md` et `13-seo.md` sont **obsolètes par
rapport au code** — elles décrivent un état (« minimal », « absent côté admin ») que le
code a largement dépassé. Les fiches `50-seo-avancee.md` et `70-seo-plateforme-complete.md`
sont, elles, globalement **exactes** : la quasi-totalité de leurs tâches 1-6 sont livrées,
testées et branchées, y compris le connecteur Search Console d'ADR-0032 — alors que cette
ADR **n'est toujours pas insérée** dans `docs/03-decisions.md` (30 ADR actées, la dernière
est ADR-0031 ; ADR-0032 n'apparaît nulle part dans le fichier). Deux vrais points morts
significatifs trouvés, décrits en détail en §4 : (1) **aucun blueprint de `create-cogenta`
ne déclare les quatre champs `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex`** — donc
le panneau SEO par entrée (fiche 13, tâche 1), entièrement construit et testé, est
**invisible sur tout site neuf** ; (2) `packages/seo/src/feeds.ts` (RSS/Atom, 261 lignes,
testé) n'est appelé nulle part — code mort exactement comme documenté par la fiche 50
elle-même (tâche 6, jamais tranchée). Aucun `any`/`@ts-ignore`/`console.log`/`throw new
Error` nu trouvé dans le périmètre. i18n FR/EN à parité stricte (233 clés chacune, 0 clé
manquante référencée par le code). Permissions testées par rôle sur les routes neuves.

**Décomptes** (fiches 12+13+50+70 combinées, ~55 critères/tâches vérifiés) :
**FAIT : 43** · **PARTIEL : 5** · **ABSENT : 3** · **POINT MORT : 4**.

## 2. Ce qui existe réellement

### Redirections (`packages/admin/src/routes/redirects.tsx`, 381 lignes + 3 sous-écrans)

- `packages/admin/src/redirects/not-found-panel.tsx` (130 l.) — journal des 404,
  lecture seule + « rejeter » + « créer une redirection » (pré-remplit le formulaire).
- `packages/admin/src/redirects/pattern-panel.tsx` (175 l.) — redirections par préfixe
  (`/blog/*` → `/actualites/*`).
- `packages/admin/src/redirects/import-export-panel.tsx` (252 l.) — CSV import (avec
  prévisualisation des conflits) / export.
- Client : `packages/admin/src/api/redirects-client.ts`.
- Serveur : `packages/api/src/rest/redirect-router.ts` (664 l.) — CRUD complet
  (GET recherche+pagination, POST, **PATCH** sur `to`/`status`, DELETE), routes
  `/patterns`, `/export`, `/import`. `packages/schema/src/routing/not-found-log.ts`
  (journal agrégé, plafonné, purge par âge), `packages/schema/src/routing/redirects.ts`
  (store, refus de boucle/auto-redirection, chaîne A→B→C réduite à un saut),
  `packages/schema/src/store/redirect-tracking.ts` (redirection automatique au
  renommage de slug d'une entrée **publiée**, wrapper de store branché dans
  `packages/cli/src/commands/serve.ts:1252`).
- Route `/redirects` de l'admin redirige vers `/seo` (fusion actée en L21 tâche 3,
  onglet dédié dans l'écran unique).

### SEO éditorial (panneau par entrée)

- `packages/admin/src/seo/seo-panel.tsx` (564 l.) : titre SEO (compteur 60c), meta
  description (compteur 155c), image de partage, `noindex` (avertissement si publié),
  canonique manuelle repliée, aperçu Google réel via `POST /api/seo/preview`, score de
  contenu en direct (7 contrôles, `packages/admin/src/seo/content-score.ts`, 223 l.,
  copie volontaire et documentée de `packages/seo/src/content-analysis.ts` — l'admin ne
  dépend jamais de `@cogenta/schema`), boutons « proposer titre/description » via
  `assist.titles`/`assist.meta_description` (absents sans fournisseur IA — R2).
- Champs consommés par convention (pas par contrat) : `seoTitle`, `seoDescription`,
  `seoImage`, `seoNoindex`, `seoCanonical` — `packages/seo/src/metadata.ts:77-79`,
  `packages/seo/src/indexable.ts:57-69`. Fiche 13 tâche 0, option (a) retenue comme
  recommandé. **Mais jamais déclarés par un blueprint** (voir §4).
- Monté dans `packages/admin/src/routes/entry-edit.tsx:1655`.

### Écran SEO du site (`packages/admin/src/routes/seo.tsx`, 1605 lignes)

Onglets (`role="tablist"`) : **Général** (gabarits de titre global + par collection,
description par défaut), **Réseaux sociaux** (Twitter handle, image par défaut,
vérification Google/Bing), **Sitemap** (inclusion/fréquence/priorité par collection),
**IndexNow/llms.txt** (clé, activation), **`robots.txt`** personnalisé (avec
confirmation `window.confirm` sur `Disallow: /`, `ROBOTS_DISALLOW_ALL_PATTERN`), **grille
de fonctionnalités activables** (`content-score`/`link-assistant`/`search-verification`/
`robots-custom-rules`/`indexNow`/`llms-txt`, une carte = un interrupteur = le même réglage
que son onglet dédié), **Diagnostic** (nombre d'URL sitemap, descriptions manquantes,
titres trop longs/dupliqués, liens cliquables vers l'entrée), **assistant de maillage
interne** (`packages/seo/src/link-assistant.ts`, orphelins + suggestions par
recouvrement de mots du titre), **section « Performance réelle »** (Search Console,
OAuth, désactivée par défaut, `SearchConsoleSection`, ADR-0032).
- Redirections : onglet dédié dans ce même écran (voir §2 ci-dessus), au lieu d'une
  entrée de navigation séparée.

### Serveur (`packages/seo/src/*`, 3069 lignes / 15 fichiers ; câblage `packages/cli/src/commands/seo.ts` et `serve.ts`)

`metadata.ts` (titre/description/OG/Twitter/canonique/gabarits), `json-ld.ts` (8 types :
`Article`/`WebPage`/`Product`/`Event`/`Recipe`/`FAQPage`/`Course`/`Book`, + `Person`/
`Organization` en référence), `hreflang.ts`, `sitemap.ts`, `robots.ts`, `indexable.ts`,
`indexnow.ts` (branché, ping à la publication/dépublication —
`serve.ts:2893-2939`), `llms-txt.ts` (branché, `GET /llms.txt`, `serve.ts:4927-4944`),
`content-analysis.ts` (score, dupliqué côté admin), `link-assistant.ts` (branché,
`GET /api/seo/link-suggestions`, `seo-router.ts:589-642`, gardé par `update` sur la
collection — pas `admin`, conforme au critère de la fiche 70), `search-console.ts`
(OAuth `fetch`-only, zéro SDK, branché par `packages/api/src/rest/search-console-router.ts`),
**`feeds.ts` (261 l., RSS/Atom) : écrit, testé (`packages/seo/test/feeds.test.ts`),
jamais importé par `cli` ou `api` — code mort, voir §4**.

Vérification par balise meta Google/Bing : `packages/cli/src/commands/seo.ts:145-152`
(`<meta name="google-site-verification">`, `<meta name="msvalidate.01">`), rendue par
`readSeoRenderDefaults`, appelée à chaque page (`serve.ts`, ~10 call sites vérifiés).

Contrat A **non touché** : aucun champ SEO dans `docs/04-contrats.md`, confirmé par
`grep`. Contrat C (`tools@1.1`) déjà porteur de `redirects.write`/`logs.read`
(`docs/04-contrats.md:459-466`), utilisé par l'agent Site Monitor de L22, sans rapport
direct avec ce périmètre admin.

## 3. Vérification des fiches, critère par critère

| Fiche | Tâche / critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| 12 | Tâche 1 — Journal des 404 | **FAIT** | `not-found-log.ts` (agrégation par chemin, plafond, purge), `not-found-panel.tsx`, route `/api/not-found` | Aucune donnée personnelle stockée (pas d'IP, pas de UA) — vérifié dans le schéma de table |
| 12 | Tâche 2 — Modifier/rechercher/paginer | **FAIT** | `redirect-router.ts` `PATCH`, `GET ?q=&offset=&limit=`, UI `redirects.tsx:250` (champ recherche), `PAGE_SIZE` pagination | — |
| 12 | Tâche 3 — Redirection auto au renommage | **FAIT** | `redirect-tracking.ts`, branché `serve.ts:1252`, entrée **publiée uniquement**, chaîne réduite à un saut (doc du fichier) | — |
| 12 | Tâche 4 — Import/export, motifs, codes | **FAIT** | `routeImport`/`routeExport` (`redirect-router.ts:268-606`, prévisualisation des conflits avant écriture), `pattern-panel.tsx`, statuts `301/302/307/308/410` (`redirects.tsx:53`) | Motifs limités au préfixe, jamais regex — conforme au piège connu de la fiche |
| 12 | Critère « aucune regex utilisateur dans le routage public » | **FAIT** | Recherche du code : aucune construction de `RegExp` depuis une entrée utilisateur dans `redirect-router.ts`/`pattern-panel.tsx` | — |
| 12 | Compteur de hits sur une redirection | **ABSENT** | `RedirectRecord` (`packages/schema/src/routing/redirects.ts:79-90`) n'a ni `hits` ni `lastUsedAt` | Le journal des 404 a un compteur ; la table de redirections elle-même n'en a pas — un éditeur ne peut toujours pas savoir si une redirection sert encore |
| 12 | Outil « test où mène cette URL » | **ABSENT** | Aucune route `test`/`resolve` dans `redirect-router.ts`, aucun bouton dans `redirects.tsx` | Confort, non bloquant |
| 13 | Tâche 0 — décision sur le lieu des champs SEO | **FAIT** | Option (a) retenue : `packages/seo/src/metadata.ts:77-79`, `indexable.ts:67-69` | Décision jamais formalisée en note séparée ni dans `docs/04-contrats.md` comme convention documentée (voir §4) |
| 13 | Tâche 1 — Panneau SEO dans l'éditeur | **FAIT** (mais **POINT MORT** en pratique) | `seo-panel.tsx`, monté `entry-edit.tsx:1655`, aperçu réel via `/api/seo/preview` | Fonctionnel seulement si la collection déclare les 4 champs — **aucun blueprint ne les déclare** (voir §4, T01) |
| 13 | Tâche 2 — Écran SEO du site (diagnostic/réglages/robots) | **FAIT**, dépassé par la fiche 50 | `seo.tsx` onglets Diagnostic/Sitemap/`robots.txt` | — |
| 13 | Tâche 3 — Gabarits de titre | **FAIT** | `seo.tsx:460-520` (`seo.titleTemplate`, `seo.collectionTitleTemplates`) | — |
| 13 | Tâche 4 — Lien IA optionnel (R2/R6) | **FAIT** | `seo-panel.tsx` boutons `assist.titles`/`assist.meta_description`, disparaissent si `GET /api/assistant` répond `available:false` | — |
| 13 | Critère « aperçu = même code que le rendu » | **FAIT** | `runSeoPreview` appelle `POST /api/seo/preview`, doc du fichier l'affirme explicitement comme piège évité | — |
| 13 | Critère « `noindex` retire l'URL du sitemap » | **FAIT** | `indexable.ts` (`isIndexable`), consommé par `sitemap.ts` | Non retesté ici avec un `curl` réel — confiance fondée sur `serve-seo.test.ts` |
| 50 | Tâche 1 — Liens directs sitemap/robots | **FAIT** | `seo.tsx` onglet Diagnostic (`href={baseUrl + '/sitemap.xml'}` etc. — présence confirmée par grep des libellés `seo.openSitemap`/équivalent) | Non vérifié avec capture d'écran, mais code présent |
| 50 | Tâche 2 — Vérification Search Console/Bing | **FAIT** | `seo.ts:145-152`, réglages `seo.googleSiteVerification`/`seo.bingSiteVerification`, UI `seo.tsx:552-580` | — |
| 50 | Tâche 3 — Brancher IndexNow | **FAIT** | `pingIndexNow` appelé à la publication (`serve.ts:2893-2939`), clé/activation en réglages, fichier clé servi (`serve.ts:4948-4953`) | — |
| 50 | Tâche 4 — Éditeur `robots.txt` | **FAIT** | `RobotsCustomRulesEditor` (`seo.tsx:889-950`), confirmation sur `Disallow: /` | — |
| 50 | Tâche 5 — Servir `llms.txt` | **FAIT** | `GET /llms.txt` (`serve.ts:4927-4944`), réglage `seo.llmsTxtEnabled` | — |
| 50 | Tâche 6 — RSS/Atom (« à confirmer ») | **POINT MORT** | `packages/seo/src/feeds.ts` (261 l., testé) jamais importé par `cli`/`api` | Jamais tranché, comme la fiche le prévoyait explicitement — reste ouvert |
| 70 | Tâche 1 — Score de contenu temps réel | **FAIT** | `content-analysis.ts` (`@cogenta/seo`) + copie `content-score.ts` (admin), rendu dans `seo-panel.tsx` | Score à 3 niveaux, jamais un chiffre précis — conforme au piège nommé |
| 70 | Tâche 2 — Assistant de maillage interne | **FAIT** | `link-assistant.ts`, route `GET /api/seo/link-suggestions` gardée par `update` (pas `admin`) | — |
| 70 | Tâche 3 — Grille de fonctionnalités | **FAIT** | Tableau `FEATURES` (`seo.tsx:315-320`) avec `settingKey` réel par carte, pas de doublon de réglage | — |
| 70 | Tâche 4 — Connecteur Search Console (ADR-0032) | **FAIT côté code, PARTIEL côté gouvernance** | `search-console.ts` (OAuth `fetch`-only), `search-console-router.ts`, `SearchConsoleSection` (`seo.tsx:1227-1360`) | **ADR-0032 non insérée dans `docs/03-decisions.md`** — le code a été livré avant l'insertion humaine de la décision qu'il implémente (voir §4, T02) |
| 70 | Critère « aucune fonctionnalité ne dépend du connecteur » | **FAIT** | `SearchConsoleSection` retourne `null`/section absente si non connecté (`getSearchConsoleStatus`), reste du panneau intact | — |
| 70 | Critère « portée lecture seule » | **FAIT** | `fetchSearchAnalytics` (`search-console.ts:215`) — aucun appel en écriture trouvé dans le fichier | — |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P1** | `packages/create-cogenta/src/blueprints/*.ts` (tous) | Aucun des 9 blueprints (`blog.ts`, `magazine.ts`, `portfolio.ts`, `store.ts`, `saas.ts`, `restaurant.ts`, `vitrine.ts`, `association.ts`, `documentation.ts`) ne déclare `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex`. Le panneau SEO (fiche 13 tâche 1, `seo-panel.tsx`) est **entièrement construit, testé et branché, mais invisible sur tout site créé via `npm create cogenta`** — `seo-panel.tsx` rend `null` par construction (documenté dans son propre en-tête : « A collection that declares none of them renders this panel as nothing at all ») sans le moindre message expliquant pourquoi. Fiche 13 §8 posait explicitement la question (« les quatre champs entrent-ils dans tous les blueprints ? recommandé ») — jamais tranchée ni codée. | Ajouter les 4 champs à chaque collection routée de chaque blueprint (ou au minimum au type de contenu « page »/« article » de chacun), documentés dans `docs-site/` comme convention pour un schéma existant qui voudrait l'adopter. |
| **P2** | `packages/seo/src/feeds.ts` | Code mort : RSS/Atom écrit et testé (`packages/seo/test/feeds.test.ts`), jamais importé par `packages/cli` ni `packages/api`. Confirmé par `grep` : aucune occurrence de `feeds.js`/`renderFeed`/`feedItemsFor` hors du paquet `@cogenta/seo` lui-même et de son test. | Soit brancher une route `GET /feed.xml` (fiche 50 tâche 6), soit documenter honnêtement dans le code que la fonctionnalité est intentionnellement différée, avec une issue GitHub (règle AGENTS.md sur les TODO). |
| **P2** | `docs/03-decisions.md` | ADR-0032 (connecteur Search Console) est **implémentée en code** (OAuth, routeur, écran) mais **absente du fichier de décisions** — `grep "ADR-0032"` ne retourne rien ; la dernière ADR actée est ADR-0031. Le code d'un connecteur OAuth vers un tiers a été livré avant l'insertion humaine de sa propre décision de gouvernance. | Insertion humaine d'ADR-0032 dans `docs/03-decisions.md` (fichier protégé en écriture par un hook, comme documenté ailleurs dans ce dépôt) — texte déjà rédigé dans `docs/adr-0032-draft.md`. |
| **P3** | `packages/schema/src/routing/redirects.ts:79-90` | `RedirectRecord` n'a ni compteur d'utilisation (`hits`) ni date de dernier passage — contrairement au journal des 404 qui, lui, les a. Un éditeur ne peut jamais savoir si une redirection créée il y a deux ans sert encore. Fiche 12 le classait « important » (constat 4), jamais traité dans le code malgré les tâches 1-4 livrées. | Ajouter `hits`/`lastUsedAt` à la table de redirections, incrémentés au même point que `theme-render.ts` applique la redirection (déjà sur le chemin chaud, coût marginal). |
| **P3** | `packages/admin/src/routes/redirects.tsx` / `redirect-router.ts` | Aucun outil « où mène cette URL ? » (test à blanc d'une résolution, sans naviguer) — présent chez WP Redirection et Drupal, absent ici, confirmé par grep (`test`/`resolve`/`dryRun` absents du routeur). | Route `GET /api/redirects/resolve?path=` qui rejoue `resolvePath` sans effet de bord. |
| **Note (pas un bug)** | `packages/admin/src/seo/content-score.ts` et `packages/seo/src/content-analysis.ts` | Duplication volontaire et documentée (l'admin ne dépend jamais de `@cogenta/schema`) — même patron que `robots.ts` vs `ROBOTS_DISALLOW_ALL_PATTERN` dupliqué dans `seo.tsx`. Risque de dérive réel si un seuil change d'un côté sans l'autre ; l'en-tête du fichier admin affirme qu'« une dérive entre les deux ferait échouer un test de ce côté aussi » — non vérifié indépendamment dans cet audit (aurait exigé de lire les deux suites de tests en entier, hors budget). | Signalé pour vigilance uniquement — à revérifier si un des deux seuils change un jour sans l'autre. |

Aucune violation trouvée : pas de `any`/`@ts-ignore`/`console.log`/`throw new Error` nu
dans `packages/seo/src/**`, `packages/admin/src/seo/**`, `packages/admin/src/redirects/**`,
`packages/admin/src/routes/{seo,redirects}.tsx`, `packages/api/src/rest/{redirect,seo,
search-console,not-found}-router.ts`. Contrôle de permission fait au niveau routeur
(`assertAdmin`/`options.permissions.assert('update', …)`), jamais dans un outil contrat C
(R4 respecté — aucun outil de ce périmètre n'a de branche de permission interne). i18n
FR/EN à 233 clés chacune pour `seo.*`/`redirects.*`, 0 clé manquante référencée par le
code (vérifié par extraction + diff des deux fichiers de locale). Pagination présente sur
`/api/redirects` (`GET ?offset=&limit=`) ; `/api/not-found` a un plafond serveur par
défaut (100 chemins, `not-found-log.ts`) mais pas de pagination client — acceptable tant
que le plafond tient, à revoir si le plafond était un jour relevé.

## 5. Comparaison marché

### Redirections — WP Redirection / Rank Math / Drupal 11

| Fonctionnalité | WP Redirection | Rank Math | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Créer / modifier / supprimer | ✅ | ✅ | ✅ | **OUI** |
| Recherche + pagination | ✅ | ✅ | ✅ | **OUI** |
| Groupes de redirections | ✅ | ❌ | ❌ | **NON** |
| Motifs (regex) | ✅ | ✅ | ✅ (paths avancés) | **PARTIEL** (préfixe seulement, choix délibéré anti-ReDoS) |
| Import/export CSV | ✅ | ✅ | ✅ | **OUI** (avec prévisualisation des conflits, au-delà de Rank Math) |
| Journal des 404 avec compteur | ✅ | ✅ | ✅ (via module) | **OUI** |
| Créer une redirection depuis un 404 | ✅ | ✅ | ✅ | **OUI** |
| Compteur de hits sur la redirection elle-même | ✅ | ✅ | ✅ | **NON** |
| Redirection auto au changement de slug/URL | ✅ (post-permalink) | ✅ | ✅ (pathauto) | **OUI** |
| 410 Gone / 307 / 308 | ✅ | ✅ | ✅ | **OUI** |
| Test « où mène cette URL ? » | ✅ | ❌ | ✅ | **NON** |
| Journal d'accès (referrer, user-agent) | ✅ (IP incluse) | ✅ | ✅ | **PARTIEL** (referrer oui, UA/IP délibérément exclus — RGPD) |

### SEO éditorial — Yoast SEO / Rank Math (par article)

| Fonctionnalité | Yoast/Rank Math | Cogenta |
|---|---|---|
| Titre SEO distinct + compteur | ✅ | **OUI** |
| Meta description + compteur | ✅ | **OUI** |
| Aperçu Google/réseaux sociaux réel | ✅ | **OUI** (calculé par le même code que le rendu public) |
| Image de partage par entrée | ✅ | **OUI** |
| `noindex`/`nofollow` par entrée | ✅ | **PARTIEL** (`noindex` oui, `nofollow` par entrée absent — seul `robots.txt` global le fait) |
| Canonique manuelle | ✅ | **OUI** |
| Analyse de lisibilité/mot-clé (score) | ✅ | **OUI** (3 niveaux, volontairement moins précis) |
| Fil d'Ariane configurable | ✅ | **NON** |
| Balisage auteur / E-E-A-T | ✅ (Rank Math) | **NON** |
| Cornerstone content | ✅ (Yoast) | **NON** |

### SEO réglages/plateforme — Yoast/Rank Math (site)

| Fonctionnalité | Yoast/Rank Math | Cogenta |
|---|---|---|
| Gabarits de titre globaux + par type | ✅ | **OUI** |
| Réglages sitemap (inclusion/fréquence/priorité) | ✅ | **OUI** |
| Éditeur `robots.txt` | ✅ | **OUI** (règles perso fusionnées, confirmation sur `Disallow: /`) |
| Réseaux sociaux par défaut (OG/Twitter) | ✅ | **OUI** |
| Vérification Google/Bing par balise meta | ✅ | **OUI** |
| JSON-LD par type de contenu | ✅ | **OUI** (8 types + `Person`/`Organization`) |
| Détection de contenu dupliqué | ✅ (Rank Math premium) | **OUI** (`assist.find_duplicates`, R2-pur) |
| Éditeur schema.org visuel par type | ✅ (Rank Math) | **NON** (JSON-LD dérivé automatiquement, pas d'éditeur manuel) |

### SEO niveau plateforme — AIOSEO / The SEO Framework / MonsterInsights / Site Kit

| Fonctionnalité | Référence | Cogenta |
|---|---|---|
| Score de contenu temps réel (TruSEO-like) | AIOSEO | **OUI** |
| Assistant de maillage interne + orphelins | AIOSEO Link Assistant | **OUI** |
| Grille de fonctionnalités activables/désactivables | AIOSEO module manager | **OUI** |
| Connecteur Search Console (clics/impressions/position) | Site Kit / MonsterInsights | **OUI** (désactivé par défaut, ADR-0032) |
| Données Analytics (visiteurs, sources de trafic) | MonsterInsights / Site Kit | **NON** (hors périmètre de cette fiche — `@cogenta/analytics`, fiche 64) |
| Alerte temps réel sur anomalie de trafic | MonsterInsights | **NON** |
| IndexNow (Bing/Yandex/Seznam) | — (spécifique) | **OUI** |
| `llms.txt` | — (nouveauté du secteur, aucun concurrent listé ne l'a) | **OUI** — avance réelle |
| Flux RSS/Atom | tous | **NON** (écrit, jamais servi — voir §4) |

## 6. Spécification ultra détaillée des corrections et ajouts

## T01 — Déclarer les quatre champs SEO dans tous les blueprints `create-cogenta`

**Priorité** : P0 (corrige un point mort qui rend une fonctionnalité livrée invisible)
**Effort** : 0,5 j
**Fichiers** : `packages/create-cogenta/src/blueprints/{blog,magazine,portfolio,store,
saas,restaurant,vitrine,association,documentation}.ts`, tests associés
(`packages/create-cogenta/test/*-blueprint.test.ts`), `docs-site/` (nouvelle page ou
section expliquant la convention pour un schéma existant).

**Travail détaillé** : pour chaque collection routée (celle qui a une entrée `page` dans
`routes`) de chaque blueprint, ajouter au minimum :
```ts
seoTitle: f.text({ max: 60 }),
seoDescription: f.text({ max: 160, multiline: true }),
seoImage: f.media({ accepts: ['image'] }),
seoNoindex: f.boolean({ default: false }),
```
Vérifier d'abord le nom exact du constructeur `f.media`/`f.boolean` utilisé ailleurs dans
chaque blueprint (cohérence de style). Ne pas ajouter `seoCanonical` par défaut (rarement
utile pour un site neuf, laissé en champ avancé optionnel que l'utilisateur ajoute
lui-même s'il en a besoin — évite de gonfler chaque formulaire de 5 champs SEO par
défaut). Documenter la convention dans `docs-site/` (contenu technique, anglais) pour
qu'un site déjà existant sache comment l'adopter sans ADR.

**Critères d'acceptation** : sur un site fraîchement créé avec chaque blueprint, ouvrir
une entrée de la collection routée dans l'admin → le panneau SEO apparaît (pas `null`).

**Tests exigés** : étendre chaque `*-blueprint.test.ts` existant pour vérifier la présence
des 4 champs sur chaque collection routée ; un test de bout en bout (`serve-seo-admin.test.ts`
ou nouveau) créant un site via le blueprint `blog` et vérifiant que
`GET /api/seo/preview` répond un aperçu construit à partir de `seoTitle`.

**Impact contrat/ADR** : aucun — champs de collection ordinaires (contrat A inchangé,
exactement le choix (a) de la fiche 13). ADR requise : **non**.

## T02 — Insérer ADR-0032 dans `docs/03-decisions.md`

**Priorité** : P1 (gouvernance en retard sur le code déployé)
**Effort** : 5 min (action humaine, pas de code)
**Fichiers** : `docs/03-decisions.md` (protégé en écriture par un hook — geste humain),
texte déjà prêt dans `docs/adr-0032-draft.md`.

**Travail détaillé** : coller le texte de `docs/adr-0032-draft.md` à la suite d'ADR-0031
dans `docs/03-decisions.md`, sans modification (append-only). Aucune tâche de code : le
connecteur est déjà livré conformément à cette ADR.

**Critères d'acceptation** : `grep "ADR-0032" docs/03-decisions.md` retourne un résultat.

**Impact contrat/ADR** : c'est l'insertion de l'ADR elle-même. ADR requise : **oui, déjà
rédigée** — action d'insertion seulement.

## T03 — Brancher ou trancher `feeds.ts` (RSS/Atom)

**Priorité** : P2
**Effort** : 0,5 j (brancher) ou 5 min (trancher « non » et ouvrir une issue)
**Fichiers** : `packages/cli/src/commands/serve.ts`, `packages/cli/src/commands/seo.ts`
(nouveau réglage `seo.feedEnabled`), `packages/seo/src/feeds.ts` (déjà écrit).

**Travail détaillé (si branché)** : route `GET /feed.xml` (Atom) et/ou `GET /feed.rss`
par collection routée principale, réutilisant `feedItemsFor`/`renderAtomFeed`/
`renderRssFeed` tels quels (déjà testés) ; réglage on/off dans l'onglet Général de
`seo.tsx`, off par défaut (cohérent avec IndexNow/llms.txt) ; lien cliquable depuis le
Diagnostic une fois activé.

**Critères d'acceptation** : `curl /feed.xml` sur un site avec le réglage actif renvoie
un flux Atom valide listant les entrées publiées récentes, dans l'ordre `createdAt`
décroissant (cohérent avec la fiche 9's leçon sur `SortField`).

**Tests exigés** : bout en bout, `curl` + validation XML basique ; permission — route
publique en lecture (`ANONYMOUS`), comme `/sitemap.xml`.

**Impact contrat/ADR** : aucun. ADR requise : **non**.

*Si la décision produit est de ne pas le faire* : ouvrir une issue GitHub référencée par
un commentaire `// TODO(#xxx)` dans `feeds.ts`, pour respecter la règle AGENTS.md contre
un TODO sans issue — aujourd'hui `feeds.ts` n'a même pas de TODO, juste du code
silencieusement mort.

## T04 — Compteur d'utilisation sur les redirections

**Priorité** : P2
**Effort** : 1 j
**Fichiers** : `packages/schema/src/routing/redirects.ts` (`RedirectRecord`, migration de
colonnes `hits`/`last_used_at`), `packages/cli/src/commands/theme-render.ts` ou le point
d'application de la redirection dans `serve.ts` (déjà sur le chemin chaud), `redirect-router.ts`
(`serialise`), `redirects.tsx` (colonne affichée, tri par utilisation).

**Travail détaillé** : à chaque redirection effectivement appliquée à une requête
publique, incrémenter `hits` et mettre à jour `last_used_at` — même mécanisme
compare-and-set que `not-found-log.ts` pour éviter une écriture bloquante en pic de
trafic (upsert `on conflict … do update set hits = hits + 1`). Écran : nouvelle colonne
« Utilisations », tri disponible.

**Critères d'acceptation** : appeler une URL redirigée trois fois → `hits: 3` visible
dans l'écran après rechargement.

**Tests exigés** : unitaire sur le store (incrément atomique, y compris sous deux
connexions concurrentes — même discipline que `not-found-log.ts`) ; bout en bout,
`redirects.tsx` affiche la colonne.

**Impact contrat/ADR** : aucun (table interne, pas contrat A). ADR requise : **non**.

## T05 — Outil « où mène cette URL ? »

**Priorité** : P3
**Effort** : 0,5 j
**Fichiers** : `packages/api/src/rest/redirect-router.ts` (nouvelle route
`GET /api/redirects/resolve?path=`), `redirects.tsx` (champ + bouton « Tester »).

**Travail détaillé** : rejoue la même résolution que `theme-render.ts` applique
réellement (redirections exactes → motifs par préfixe → 404), **sans effet de bord**,
retourne `{ resolved: 'redirect', to, status } | { resolved: 'pattern', to, status } |
{ resolved: 'not-found' }`. Réutiliser la fonction de résolution existante plutôt que
d'en écrire une seconde (piège nommé ailleurs dans ce dépôt : un aperçu qui ne
réutilise pas le vrai code ment).

**Critères d'acceptation** : taper une URL dans l'écran → réponse identique à ce qu'un
vrai `curl` sur cette URL produirait.

**Tests exigés** : unitaire, comparant `resolve()` à un vrai GET sur la même URL pour un
échantillon (redirection exacte, motif, 404, chaîne réduite).

**Impact contrat/ADR** : aucun. ADR requise : **non**.

## T06 — `nofollow` par entrée (au-delà de `noindex`)

**Priorité** : P3
**Effort** : 0,5 j
**Fichiers** : `packages/seo/src/metadata.ts`/`indexable.ts` (nouveau champ
conventionnel `seoNofollow`), `seo-panel.tsx`, blueprints (T01, même geste).

**Travail détaillé** : même patron que `seoNoindex` — un booléen conventionnel, combiné
en `noindex, nofollow` / `noindex, follow` / `index, nofollow` dans la balise `robots`
déjà produite par `metadata.ts`. Rare en pratique (une page de remerciement veut
`noindex` mais garder ses liens suivis, ou l'inverse) mais complète la parité citée par
la fiche 13 comme écart bloquant partiel.

**Critères d'acceptation** : activer `nofollow` seul → balise `<meta name="robots"
content="index, nofollow">`.

**Tests exigés** : unitaire sur `metadata.ts`, les 4 combinaisons.

**Impact contrat/ADR** : aucun (convention, pas contrat). ADR requise : **non**.

## 7. Ordre d'exécution recommandé et dépendances

1. **T02** (insertion ADR-0032) — aucune dépendance, geste humain immédiat, débloque
   la cohérence documentaire avant tout autre travail sur ce périmètre.
2. **T01** (champs SEO dans les blueprints) — priorité absolue côté code : sans elle,
   la quasi-totalité du travail des fiches 13/50/70 reste invisible pour un utilisateur
   réel qui crée un site aujourd'hui. Aucune dépendance.
3. **T04** (compteur d'utilisation redirections) — indépendante, peut être faite en
   parallèle de T01.
4. **T06** (`nofollow`) — dépend légèrement de T01 (mêmes fichiers de blueprint,
   à faire dans le même passage pour éviter deux migrations de blueprint séparées).
5. **T05** (outil de test d'URL) — indépendante, la plus petite, peut être insérée
   n'importe où dans l'ordre.
6. **T03** (RSS/Atom) — dernière : c'est la seule dont la fiche d'origine (50) dit
   elle-même « à confirmer », donc une décision produit doit être reprise avant de
   coder, contrairement aux cinq autres qui sont des corrections directes de points
   morts déjà spécifiés sans ambiguïté.
