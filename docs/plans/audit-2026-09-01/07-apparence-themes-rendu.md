# Audit Apparence, thèmes publics, rendu et performance — 2026-09-01

## 1. Résumé exécutif

Périmètre couvert : écran Apparence (galerie + personnalisation), écran Apparence de
l'admin, moteur de skin/tokens (contrat D), les 5 thèmes publics, le rendu de page
(`theme-render.ts`), et la partie « rendu/performance » du lot L3 (`@cogenta/render`).

**Verdict global : les fiches 14/48/49, prises isolément, sont très majoritairement
FAIT** — la galerie, la personnalisation avec aperçu iframe réel, la génération IA
gardée derrière R2/R6/R8, l'identité de marque (footer), le split galerie/personnalisation
des deux écrans (site et admin) sont du vrai code, bien testé, bien câblé. **Mais la
vérification en profondeur (étape 2 de la méthode, jamais sautée) a trouvé un défaut
architectural majeur non documenté dans les fiches consultées** : environ 40 % du
paquet `@cogenta/render` (les répertoires `astro/`, `build/`, `cache/`, `pwa/` — 22
fichiers source, testés) construit l'intégration Astro et le pipeline de build à trois
cibles que L3 demandait, et **n'est appelé par aucune ligne de `@cogenta/cli`** — le
rendu réel (`theme-render.ts`) est un moteur maison, string-based, un seul mode
(Node vivant via `cogenta serve`), zéro build statique, zéro cache de rendu à tags,
zéro PWA. CLAUDE.md l'admet honnêtement pour le pipeline Astro global mais aucun
document consulté ne dit clairement que la mise en cache par tags (critère
d'acceptation explicite de L3) est un module mort.

**Décompte des critères vérifiés (fiches 14, 48, 49, section L12 de L10-cms-complet,
lot L3)** : **31 FAIT, 6 PARTIEL, 5 ABSENT, 6 POINT MORT** sur 48 critères/tâches
distincts examinés.

**Bugs/points morts de gravité P0-P1** : (1) l'« Identité du site » (logo, logo
sombre, favicon, image de partage) de la tâche 4 de la fiche 14 est **entièrement un
point mort** — stockée, éditable, jamais lue par le rendu (favicon codé en dur sur
`DEFAULT_LOGO_PATH`, aucun `<img>` de logo de site nulle part, `shareImageMediaId`
jamais consulté par le SEO) ; (2) le cache de rendu à invalidation par tags
(`@cogenta/render/src/cache/page-cache.ts`) et le pipeline PWA sont du code mort ;
(3) aucune page d'accueil configurable — `/home` reste câblé en dur ; (4) le flux
RSS/Atom (`@cogenta/seo/src/feeds.ts`) existe et n'est jamais servi ; (5) Lighthouse
CI n'existe nulle part dans le dépôt malgré le critère d'acceptation explicite de L3
et L12.

## 2. Ce qui existe réellement

### 2.1 Écran « Apparence » du site (`packages/admin/src/routes/appearance.tsx`, 963 lignes)

Deux vues pilotées par `?view=gallery|customize` (fiche 71, `useSearchParams`) :

- **Galerie** : une carte par thème installé (`theme.availableThemes`), chacune avec
  un aperçu réel (`ThemeGalleryPreview`, iframe à l'échelle sur une page de démo,
  `packages/admin/src/routes/theme-gallery-preview.tsx`), nom, description, version
  et auteur lus depuis le manifeste (fiche 48), bouton « Activer » / « Personnaliser ».
- **Personnalisation** : éditeur de jetons généré depuis `TOKEN_SPECS`/`TOKEN_GROUPS`
  (`@cogenta/render`, ligne 9-12 des imports) — aucun champ inventé —, avertissements
  de contraste AA (`computeContrastWarnings`, lignes 95-121), CSS additionnel, quatre
  sélecteurs de média (logo, logo sombre, favicon, image de partage), carte « Marque »
  (fiche 68, déplacée depuis Réglages), galerie de skins (`@cogenta/plugins`),
  génération IA (candidats, jamais appliqués sans clic), un seul iframe de
  prévisualisation live débounced 300 ms partagé entre édition de jetons et CSS
  additionnel.

Client API : `packages/admin/src/api/theme-client.ts`.

### 2.2 Serveur — `/api/theme` (`packages/api/src/rest/theme-router.ts`, 437 lignes)

`GET /api/theme`, `PUT|DELETE /api/theme/overrides`, `GET /api/theme/skins`,
`POST /api/theme/skins/:id/apply`, `POST /api/theme/generate`,
`POST /api/theme/export`. Toutes les routes exigent `admin`
(`requireAdmin`, ligne 163). La fusion jetons-fichier+overlay est revalidée dans son
ensemble avant écriture (ligne 254-262 : « un overlay partiel qui semble raisonnable
isolément peut casser le contraste »).

### 2.3 Persistance (`packages/schema/src/store/theme-store.ts`, 307 lignes)

Une ligne (`cogenta_theme`, id fixe `'site'`) : `tokenOverrides`, `additionalCss`,
`logoMediaId`, `logoDarkMediaId`, `faviconMediaId`, `shareImageMediaId`,
`activeTheme`. Lue à chaque requête (`theme-wiring.ts`'s `computeEffectiveStyles`),
jamais mise en cache entre requêtes — un changement s'applique à la page suivante,
sans redémarrage.

### 2.4 Rendu (`packages/cli/src/commands/theme-render.ts`, `theme-wiring.ts`, `theme-registry.ts`, `theme-css.ts`)

`theme-registry.ts` résout un thème par nom depuis `BUILTIN_THEMES` (5 paquets
statiquement listés en dépendance de `@cogenta/cli`, mémoïsés, repli sur
`@cogenta/theme-canonical`). `theme-render.ts` (le plus gros fichier du domaine)
construit le HTML complet d'une page : chrome (header/footer par thème via
`renderChrome`), SEO (`@cogenta/seo`), blocs (via `@cogenta/blocks`'s registre),
commentaires (`renderCommentsSection`). `theme-css.ts` minifie et joint
skin+additionalCss+CSS propre au thème.

### 2.5 Contrat D (`packages/render/src/theme/manifest.ts`)

`theme@1.2` (fiche 48) : `name`, `version`, `description?`, `author?`, `engine`,
`blocks`, `implements`, `collections`, `runtime`, `tokens`, `a11y?`. Zod schema avec
`exactOptionalPropertyTypes` correctement géré. Isolation vérifiée par
`packages/render/src/theme/verify/{forbidden,scan-file,scanner,verify-theme}.ts` —
voir §4 pour son câblage réel.

### 2.6 Les 5 thèmes publics

`@cogenta/theme-{canonical,portfolio,magazine,ecommerce,entreprise}` : chacun déclare
17 blocs (`blocks@2.0`), `version: '1.1.0'`, `description`/`author: 'Cogenta'`
(fiche 48 tâche 2, vérifié sur les 5). Chacun utilise `light-dark()`/`oklch(from…)`
dans `src/styles/tokens.css` pour un mode sombre réel (pas une inversion mécanique).
Chacun a un `src/styles/base.css` stylant désormais `cg-search__*`/`cg-form`/
`cg-comments` (voir §4, régression de L20 corrigée depuis).

**Implémentation réelle** : `src/render/blocks/*.ts` (arbres `HtmlElement` construits
en TypeScript pur, via `@cogenta/theme-kit`) — **pas** les fichiers `src/blocks/*.astro`
présents dans chaque thème, qui ne sont consommés que par les tests d'isolation
statique (`test/isolation.test.ts`) et par les fixtures de `@cogenta/render`. Voir §4.

### 2.7 Apparence de l'admin (`packages/admin/src/routes/admin-appearance.tsx`, 423 lignes)

Système entièrement séparé (fiche 49, déjà scindé galerie/personnalisation).
`AdminThemePreview` (`packages/admin/src/theme/admin-theme-preview.tsx`) rend un vrai
mini-panneau scoppé (composants `Button`/`Card` réels dans un conteneur aux variables
CSS du gabarit en cours d'édition), appliqué en direct avant enregistrement — jamais
en touchant `<head>` global. Deux gabarits (`NIGHTOPS`, `ATELIER`,
`packages/schema/src/store/admin-theme-templates.ts`).

### 2.8 `@cogenta/render` — vue d'ensemble par sous-module et statut de câblage

| Sous-module | Rôle (L3) | Câblé dans `@cogenta/cli` ? |
|---|---|---|
| `theme/` | manifeste, isolation, chargement | Oui (`theme-registry.ts`) |
| `skin/` | tokens, validation, rendu CSS | Oui (`theme-wiring.ts`, `theme-router.ts`) |
| `content/`, `context/` | `RenderContext`, client de contenu | Oui (via `@cogenta/theme-kit`) |
| `images/` | variantes, srcset, repli WASM | Oui (`theme-render.ts`, `media-images.ts`) |
| `astro/` | intégration Astro | **Non — aucun appelant** |
| `build/` | trois cibles de build (statique/SSR/edge) | **Non — aucun appelant** |
| `cache/` | cache de rendu à invalidation par tags | **Non — aucun appelant** |
| `pwa/` | manifest, service worker | **Non — aucun appelant** |
| `docs/` | rendu Markdown (docs-site, L22) | Oui (câblage séparé, hors périmètre) |

## 3. Vérification des fiches, critère par critère

### Fiche 14 — Apparence et thème

| Tâche/critère | Verdict | Preuve | Écart |
|---|---|---|---|
| Tâche 0 — décision file vs base | FAIT (option b) | `theme-store.ts` (DB), `theme-wiring.ts` `computeEffectiveStyles` (overlay live) | **Aucune ADR courte insérée** malgré la recommandation explicite de la fiche (`docs/03-decisions.md` s'arrête à ADR-0031, aucune ne porte sur ce sujet) |
| Tâche 1 — écran Apparence (thème actif + liste skins) | FAIT | `appearance.tsx` vue galerie, `theme-router.ts` `GET /api/theme` | — |
| Tâche 2 — personnalisation avec aperçu réel (iframe sur rendu serveur) | FAIT | `POST /api/theme/preview` via `computePreviewStyles` (`theme-wiring.ts`), iframe `srcDoc` (`appearance.tsx` L945-950) | Aperçu = feuille de style seule, pas un vrai document HTML de page (voir §4, différent du builder L16 qui rend un vrai `<body>`) |
| Tâche 3 — génération IA (2-5 candidats) | FAIT | `theme-router.ts` `POST /api/theme/generate` + `generateSkinCandidates`, R2 (`options.generator` optionnel), R6 (candidats jamais appliqués), R8 (description passée en paramètre, pas en prompt système — non revérifié ici, déjà couvert par L19) | — |
| Tâche 4 — identité du site (logo, logo sombre, favicon, image de partage) | **POINT MORT** | UI complète (`appearance.tsx` L695-793), stockage complet (`theme-store.ts`), **zéro lecture côté rendu** (`grep logoMediaId	faviconMediaId	shareImageMediaId` dans `theme-render.ts`/`serve.ts`/`theme-wiring.ts` : 0 résultat) | Favicon codé en dur sur `DEFAULT_LOGO_PATH` (`theme-render.ts` L696) ; aucun logo de site dans le chrome (`ChromeInput` n'a même pas de champ logo, `theme-kit/src/chrome.ts` L24-39) ; `shareImageMediaId` jamais lu par `seoMedia`/`fallbackImageFor` (`seo.ts`) qui utilise un champ totalement différent (`seo.defaultSocialImageUrl`, texte libre, écran SEO) |
| Tâche 5a — page d'accueil configurable | **ABSENT** | `theme-render.ts` L351 : `DEFAULT_HOME_PATH = '/home'`, aucun réglage `homePage`/`homeEntry` nulle part dans le dépôt (`grep -rl homePage` : 0 résultat) | Reste le repli en dur documenté depuis L9/L10, jamais corrigé malgré fiche 14 §3 point 4 |
| Tâche 5b — CSS additionnel | FAIT | `theme-router.ts` `checkAdditionalCss`, `theme-wiring.ts` (CSS servi en feuille externe jointe, jamais en `<style>` inline — respecte la CSP sans l'assouplir) | — |
| Critère : jamais de jeton hors contrat D | FAIT | `TOKEN_SPECS`/`TOKEN_GROUPS` généré depuis `@cogenta/render`, pas de champ écrit à la main dans `appearance.tsx` | — |
| Critère : contraste AA avec avertissement | FAIT | `computeContrastWarnings` (`appearance.tsx` L95-121), réutilise `CONTRAST_PAIRS`/`meetsContrastAa` de `@cogenta/render` | — |
| Critère : R2 (section IA disparaît sans fournisseur) | FAIT | `theme.aiAvailable && (...)` (`appearance.tsx` L848) | — |
| Critère : permissions admin seulement | FAIT | `requireAdmin` sur toutes les routes `/api/theme/*` | — |

### Fiche 48 — Métadonnées de thème et bouton Personnaliser

| Tâche | Verdict | Preuve |
|---|---|---|
| Tâche 1 — `description`/`author` optionnels au manifeste | FAIT | `packages/render/src/theme/manifest.ts` L28-38, Zod `.optional()`, test de compat implicite (`exactOptionalPropertyTypes` géré L79-87) |
| Tâche 2 — les 5 `theme.config.ts` déclarent `description`/`author` | FAIT | vérifié sur les 5 fichiers (`version: '1.1.0'`, `author: 'Cogenta'`, `description: '...'`) |
| Tâche 3 — `theme-registry.ts` lit depuis le manifeste, plus de duplication | FAIT | `availableThemes()` (`theme-registry.ts` L133-145) lit `manifest.description`/`manifest.version`/`manifest.author`, repli sur `theme.label` |
| Tâche 4 — `GET /api/theme` gagne `version`/`author`/`description` | FAIT | `AvailableThemeLike` (`theme-router.ts` L55-64), champ `availableThemes` renvoyé tel quel dans `GET /api/theme` |
| Tâche 5 — écran scindé galerie/personnalisation + bouton Personnaliser | FAIT | `appearance.tsx` `view` (`?view=gallery	customize`), bouton conditionnel L590-599 |
| Tâche 6 — mise à jour `docs/04-contrats.md`/fiche 14 | FAIT | `docs/04-contrats.md` §Contrat D en-tête daté 2026-08-28, mentionne explicitement `theme@1.2` et les deux champs |
| Critère : thème tiers sans description/author reste propre | FAIT | repli `manifest.description ?? theme.label`, `author: null` accepté par le type `AvailableThemeInfo` |

### Fiche 49 — Apparence de l'admin

| Tâche | Verdict | Preuve |
|---|---|---|
| Tâche 1 — scinder galerie/personnalisation | FAIT | `admin-appearance.tsx` `view: 'gallery'	'customize'`, bouton Personnaliser/Choisir |
| Tâche 2 — aperçu réel (mini-panneau scoppé) | FAIT | `AdminThemePreview` (`packages/admin/src/theme/admin-theme-preview.tsx`), rend de vrais composants `Button`/`Card` |
| Tâche 3 — aperçu live avant enregistrement, jamais sur `<head>` global | FAIT | `admin-appearance.tsx` L233-237 : `<AdminThemePreview template={activeTemplate} overrides={overrides} />` avec l'état local `overrides`, pas `AdminThemeProvider.refresh()` |
| Tâche 4 (optionnelle) — champ `version` de gabarit | ABSENT | non implémenté, mais explicitement marquée optionnelle par la fiche elle-même — pas un écart |
| Critère : la galerie ne montre plus les contrôles | FAIT | vue `gallery` ne rend que `AdminThemePreview` + nom/description + bouton |
| Critère : modifications visibles avant sauvegarde | FAIT | voir tâche 3 |
| Non-régression : `refresh()` applique le thème réel après enregistrement | FAIT (pas revérifié par exécution, lu dans `save()` L98-111 : `await refresh()` après `setAdminTheme`) | — |

### L3 — Rendu (lot fondateur, périmètre le plus large)

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 1. Intégration Astro, chargement thème actif | **ABSENT (abandonné)** | `theme-registry.ts` n'importe jamais Astro ; le rendu réel est `theme-render.ts`, un moteur de gabarits en chaînes de caractères | Décision honnêtement documentée pour le pipeline global (CLAUDE.md, notes L9/L10 « en attendant un vrai pipeline Astro »), mais jamais formalisée en ADR ni en mise à jour de `docs/lots/L3-rendu.md` |
| 2. `RenderContext` + client à jeton restreint | FAIT | `@cogenta/theme-kit`, `ContentClient` HTTP (ADR-0016) | — |
| 3. Vérification d'installation (imports interdits) | **POINT MORT** (existe, jamais appelé en production) | `packages/render/src/theme/verify/verify-theme.ts` exporte `verifyTheme`/`inspectTheme`, appelé uniquement par `packages/plugins/src/registries/themes.ts` (jamais atteint depuis `cogenta serve`, aucun écran d'installation de thème tiers n'existe côté admin) et par les tests (`hostile-theme.test.ts`) | Les 5 thèmes intégrés ne passent jamais ce scanner à l'exécution (confiance de fait, jamais vérifiée automatiquement) |
| 4. Thème canonique, 12 (puis 17) blocs | FAIT | `@cogenta/theme-canonical`, `implements` liste 17 blocs (`blocks@2.0`) | — |
| 5. Système de tokens/variables CSS | FAIT | `renderSkin` (`@cogenta/render`), une feuille unique | — |
| 6. Validation skin (contraste, échelle, complétude) | FAIT | `validateSkin`, réutilisé par `theme-router.ts` et `appearance.tsx` | — |
| 7. Changement de skin à chaud | FAIT | `computeEffectiveStyles`, aucun build, lu à chaque requête | — |
| 8. Pipeline images (variantes, srcset, focal, WASM) | FAIT | L10, `describeMedia`, câblé dans `theme-render.ts` | — |
| 9-11. Cibles statique/SSR/edge | **ABSENT** | `packages/render/src/build/` (existe) jamais appelé ; un seul mode réel : `cogenta serve` (Node vivant) | `cogenta build` reste une commande différée sans stub (confirmé, `docs/lots/L9-ecosysteme.md` liste `cogenta build` en commande documentée-non-livrée) |
| 12. Refus de build sur besoin runtime non satisfait | **ABSENT** | aucun mécanisme de refus, puisqu'il n'y a pas de build | dépend directement de 9-11 |
| 13. Cache de rendu à invalidation par tags | **POINT MORT** | `packages/render/src/cache/page-cache.ts` (228 lignes, testé — `packages/render/test/cache/render-cache.test.ts`), zéro appelant dans `@cogenta/cli` | Le cache réellement en production est `Cache-Control: s-maxage=<pageMaxAge>` (`http-security.ts` L49-51) — un TTL HTTP/CDN, **pas** une invalidation par tags au moment de la publication ; critère d'acceptation L3 explicite (« publier un contenu invalide exactement les pages concernées ») non tenu |
| 14. Socle SEO complet | PARTIEL | sitemap/robots/canonique/OG/Twitter/JSON-LD : FAIT (L10) ; **RSS/Atom : POINT MORT** (`packages/seo/src/feeds.ts` exporte `renderRssFeed`/`renderAtomFeed`, zéro appelant dans `@cogenta/cli`) ; `llms.txt`/ping IndexNow : non trouvés | Confirme le constat déjà fait par `docs/lots/L20-audit-admin-complet.md` §3.9 (« Aucun flux RSS/Atom ») — **toujours vrai à ce jour**, alors que d'autres bugs relevés au même endroit (search/forms/commentaires non stylés) ont depuis été corrigés |
| 15. PWA | **POINT MORT** | `packages/render/src/pwa/{manifest,service-worker,build,client}.ts`, testé (`packages/render/test/pwa/`), zéro appelant dans `@cogenta/cli` | — |
| 16. Passe accessibilité/perf thème canonique | PARTIEL | skip-link, `prefers-reduced-motion`, `prefers-color-scheme` présents (confirmé L20 §3.9) ; **Lighthouse jamais mesuré en CI** (voir critère dédié ci-dessous) | — |
| Critère : blog du créateur en production sur Cogenta | Non vérifiable depuis ce dépôt | — | hors périmètre d'audit statique |
| Critère : Lighthouse 100/100/100/100 en CI | **ABSENT** | aucune trace de Lighthouse CI dans `.github/`, `package.json` racine, ou tout script du dépôt (recherche `lighthouse` insensible à la casse) | Repris tel quel comme dette par L12 (« mesure réelle Lighthouse en CI... actuellement non vérifiée automatiquement ») — **toujours vrai** |
| Critère : changer de skin < 1s, aucun build | FAIT | lecture DB + calcul de feuille CSS à chaque requête, aucune étape de build | — |
| Critère : thème hostile refusé à l'installation | PARTIEL | le scanner fonctionne (testé), mais n'est jamais invoqué sur le chemin réel d'activation d'un thème intégré (voir tâche 3 ci-dessus) | — |
| Critère : build statique + `runtime:server` refuse | **ABSENT** | pas de build statique du tout | — |
| Critère : skin au contraste insuffisant refusé | FAIT | `validateTokens` appelé avant toute écriture (`theme-router.ts` L254-262) | — |

### Section L12 (`docs/lots/L10-cms-complet.md`) — Thème public : refonte visuelle et performance

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 1. Système de tokens visuel | FAIT | contrat D §Tokens de skin, un seul ensemble fermé pour les 5 thèmes | — |
| 2. Refonte des blocs existants (typographie, dark mode réel) | FAIT | `light-dark()`/`oklch(from…)` dans les 5 thèmes, vérifié par grep | — |
| 3. Nouveaux blocs (nav riche, footer, témoignages, tarification, équipe, newsletter, recherche) | PARTIEL | `testimonial`, `pricingTable`, `accordion`, `statCounter`, `logoStrip` existent au vocabulaire (`blocks@2.0`, 17 blocs) ; **nav riche/méga-menu, footer structuré en bloc, équipe et newsletter n'apparaissent pas dans la liste `implements`** | Le lot listait 7 familles, 5 semblent couvertes par les 5 nouveaux blocs de `blocks@2.0`, mais « équipe » et « newsletter » n'ont pas de bloc dédié identifiable |
| 4. Sections réutilisables | FAIT (par un autre mécanisme) | Fiche 43 (« Cogenta Page Builder ») a livré une bibliothèque de motifs (`cogenta_patterns`, `packages/schema/src/store/pattern-tables.ts`) — pas la mécanique décrite littéralement par L12, mais un équivalent fonctionnel dans l'esprit des « reusable blocks » WordPress | — |
| 5. Performance (minification, srcset, polices, Lighthouse CI) | **PARTIEL/ABSENT** | minification CSS : FAIT (`minifyCss`, `theme-css.ts`) ; srcset : FAIT (L10) ; **préchargement de polices : ABSENT** (aucun `<link rel="preload">`/`rel="preconnect"` trouvé dans `theme-render.ts` ; les polices sont chargées via `@import url(...)` dans le CSS du thème — bloquant, pas préchargé) ; `font-display: swap` : présent seulement dans `theme-portfolio` (les 4 autres thèmes n'ont pas ce littéral dans leur CSS) ; **Lighthouse CI : ABSENT** | — |
| 6. Passe de contenu sur les 9 blueprints | Non vérifié (hors fichiers de ce domaine — `create-cogenta`) | — | — |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P0** | `packages/cli/src/commands/theme-render.ts:696` vs `packages/schema/src/store/theme-store.ts` (`faviconMediaId`) | Le favicon choisi dans « Apparence → Identité du site » est enregistré mais **jamais lu** : `<link rel="icon">` pointe en dur sur `DEFAULT_LOGO_PATH` (le logo Cogenta lui-même). Un site qui a défini son propre favicon continue de servir celui de Cogenta à tout visiteur. | Lire `theme.overrides.faviconMediaId` (déjà disponible via `options.store`/`ThemeOverridesState` transmis à `theme-render.ts`), résoudre en `/_image?id=…` (endpoint public existant, L10) avec repli sur `DEFAULT_LOGO_PATH` |
| **P0** | `packages/theme-kit/src/chrome.ts:24-39` (`ChromeInput`) | Aucun champ logo dans `ChromeInput` : le logo/logo sombre choisi dans l'admin n'atteint jamais le header d'un thème, quel que soit le thème actif. | Ajouter `logoUrl?`/`logoDarkUrl?` à `ChromeInput` (ajout mineur, contrat D `ctx`-adjacent — à vérifier si `ChromeInput` est bien du contrat D ou seulement de `@cogenta/theme-kit` interne) |
| **P1** | `packages/cli/src/commands/seo.ts:113-119` (`fallbackImageFor`) vs `theme-store.ts` (`shareImageMediaId`) | L'image de partage par défaut choisie dans Apparence n'est jamais utilisée par le SEO — le vrai mécanisme de repli lit `seo.defaultSocialImageUrl`, un champ texte séparé de l'écran SEO. Deux champs concurrents pour le même besoin, un seul vivant. | Soit brancher `shareImageMediaId` comme source de `fallbackImageFor` (priorité sur `defaultSocialImageUrl` ou l'inverse — décision produit à trancher), soit retirer le sélecteur mort de `appearance.tsx` et documenter que l'image par défaut se règle depuis l'écran SEO |
| **P1** | `packages/render/src/cache/page-cache.ts` (228 lignes, testé) | Code mort : aucun appelant dans `@cogenta/cli`. Le critère d'acceptation L3 « publier un contenu invalide exactement les pages concernées, pas tout le cache » n'est vérifié par aucun test d'intégration bout en bout parce que le mécanisme n'existe pas en production — seul un TTL HTTP (`s-maxage`) joue ce rôle aujourd'hui. | Décision produit à trancher : (a) câbler `page-cache.ts` dans `theme-render.ts`/`serve.ts`, ou (b) supprimer le module et documenter que la stratégie retenue est TTL+CDN, jamais tag-based — actuellement ni l'un ni l'autre |
| **P1** | `packages/seo/src/feeds.ts` (`renderRssFeed`/`renderAtomFeed`, testé) | Code mort, zéro route `/rss.xml`/`/atom.xml` dans `serve.ts`. Toujours vrai depuis le constat de `docs/lots/L20-audit-admin-complet.md` §3.9. | Ajouter deux routes publiques dans `serve.ts`, réutilisant `feedItemsFor`/`renderRssFeed`/`renderAtomFeed` déjà écrits et testés — effort faible, gain de parité WordPress/Ghost immédiat |
| **P1** | `packages/render/src/pwa/*.ts` (5 fichiers, testés) | Code mort : manifest PWA, service worker jamais servis par `cogenta serve`. | Décision produit : livrer ou retirer — actuellement ni l'un ni l'autre, et `docs/lots/L3-rendu.md` liste toujours la PWA comme critère du lot |
| **P1** | `packages/cli/src/commands/theme-render.ts:351` (`DEFAULT_HOME_PATH`) | Aucun réglage de page d'accueil n'existe (`grep -rl homePage` : 0 résultat dans tout le dépôt) — `/` retente systématiquement `/home` en dur. Un site sans entrée `page` de slug `home` n'a pas de page d'accueil possible sans connaître ce détail d'implémentation. | Fiche 14 tâche 5a, jamais faite — ajouter un réglage `theme.overrides.homeEntryId` (ou similaire) au même store que le reste des overrides |
| **P2** | Aucune ADR insérée | La fiche 14 tâche 0 recommandait explicitement « une ADR courte » pour distinguer les overlays de thème (base) du schéma protégé par ADR-0010. `docs/03-decisions.md` s'arrête à ADR-0031, aucune ne traite ce sujet. | Rédiger et remettre à l'humain (fichier protégé en écriture), même geste que les autres ADR de ce projet |
| **P2** | `packages/render/src/theme/verify/verify-theme.ts` | Le scanner d'isolation (imports interdits `node:fs`, etc.) n'est jamais exécuté sur le chemin réel d'activation d'un des 5 thèmes intégrés — seulement testé contre des fixtures hostiles et branché dans le registre `@cogenta/plugins` (jamais atteint, aucun écran d'installation de thème tiers n'existe). Le critère d'acceptation L3 « un thème qui importe `node:fs` est refusé à l'installation » n'est donc vrai qu'en théorie pour les thèmes livrés avec Cogenta. | Ajouter un test qui fait tourner `verifyTheme` contre les 5 paquets `theme-*` réels (garde-fou peu coûteux, capture toute régression future même sans marketplace tiers) |
| **P2** | `packages/render/src/astro/*.ts`, `packages/render/src/build/*.ts` | Le paquet contient toute l'infrastructure Astro/build à trois cibles que L3 demandait ; rien n'y renvoie depuis `@cogenta/cli`. `docs/lots/L3-rendu.md` n'a jamais été mis à jour pour refléter l'abandon de cette approche (contrairement à la fiche 14, qui a un bandeau « Mise à jour » explicite). | Mettre à jour `docs/lots/L3-rendu.md` avec le même type de bandeau que la fiche 14, ou retirer le code mort si la décision est définitivement actée |
| **P2** | Polices : `@import url(...)` dans chaque `tokens.css`, aucun `<link rel="preconnect"	preload">` dans `theme-render.ts` | Chargement de police bloquant plutôt que préchargé — régression de performance nommée comme critère explicite par L12 (« Préchargement des polices, `font-display: swap` »). `font-display: swap` n'est présent que dans `theme-portfolio`. | Ajouter les balises `<link rel="preconnect" href="https://fonts.googleapis.com">` etc. dans `theme-render.ts`, et `font-display: swap` dans les `@font-face`/`@import` des 4 thèmes qui ne l'ont pas |
| **P2** | Aucune trace de Lighthouse CI | `grep -ri lighthouse` sur `.github/`, `package.json` racine : rien d'automatisé. Critère d'acceptation explicite de L3 et de L12. | Ajouter un job CI Lighthouse sur au moins un blueprint représentatif, avec seuil qui fait échouer la build — matches la recommandation déjà écrite dans L12 |
| **P3** | `packages/admin/src/routes/appearance.tsx:944-954` (iframe de personnalisation) vs `packages/admin/src/builder/viewports.js` (page builder) | L'aperçu de personnalisation de thème n'a qu'une seule largeur fixe (`w-full`, `h-[70vh]`) — pas de bascule desktop/tablette/mobile, alors que le composant existe déjà et est réutilisé ailleurs (page builder, fiche L16). Le Customizer WordPress et Shopify Theme Editor ont tous deux ce bascule. | Réutiliser `VIEWPORTS`/`Viewport` du page builder pour la même iframe |
| **P3** | `packages/admin/src/routes/appearance.tsx:944-950` | L'aperçu envoie une feuille de style seule (`previewHtml` reçoit `{html}` de `POST /api/theme/preview`, en réalité un document minimal, pas un vrai rendu de page avec du contenu réel) — moins fidèle que l'aperçu du page builder (L16), qui rend une vraie entrée. À confirmer précisément par lecture de `computePreviewStyles` : la fonction ne renvoie qu'une feuille CSS, pas un corps de page — `previewHtml` est donc probablement un document synthétique, pas une page démonstrative avec du contenu représentatif. | Vérifier que l'aperçu montre un vrai gabarit avec des blocs représentatifs (comme `ThemeGalleryPreview` le fait pour la galerie), pas seulement des couleurs sur fond vide |
| Confirmé corrigé depuis L20 | — | `docs/lots/L20-audit-admin-complet.md` §1 points 8-9 (page recherche/formulaires/commentaires non stylés) — **vérifié corrigé** : les 5 thèmes stylent désormais `cg-search__*`, `cg-form`, `cg-comments` dans leur `base.css`. | — |
| Confirmé corrigé depuis L20 | — | §3.9 « JSON-LD `BlogPosting` sans `author`/`datePublished`/`image` » — **vérifié corrigé** : `packages/seo/src/json-ld.ts` peuple les trois (L271-333). | — |

## 5. Comparaison marché

### WordPress Customizer

| Fonction | Cogenta | Détail |
|---|---|---|
| Identité (titre, slogan, logo, icône du site) | PARTIEL | Titre/slogan : écran Réglages (hors périmètre). Logo/icône : **champs présents, jamais rendus** (§4, P0) |
| Couleurs / typographie avec aperçu direct | OUI | éditeur de jetons + aperçu iframe débouncé |
| Menus (emplacements) | Hors périmètre de ce domaine (écran Menus séparé) | — |
| Widgets (zones latérales/pied de page) | NON | aucune notion de zone nommée dans le contrat A/B — Cogenta choisit délibérément « tout est un bloc dans une zone de contenu », pas des widgets indépendants par emplacement de gabarit |
| Page d'accueil statique / derniers articles | NON | aucun réglage — `/home` en dur (§4) |
| CSS additionnel | OUI | `appearance.tsx`, servi en feuille externe (respecte la CSP) |
| Aperçu responsive (desktop/tablette/mobile) | NON | absent de l'écran Apparence (présent ailleurs dans l'admin, page builder — §4 P3) |
| Publier / Enregistrer brouillon | PARTIEL | Save immédiat en base (pas de brouillon distinct — cohérent avec le modèle overlay live) |

### Site Editor / FSE (WordPress moderne)

| Fonction | Cogenta | Détail |
|---|---|---|
| Styles globaux : typographie/couleurs/mise en page | OUI | jetons du contrat D |
| Styles par bloc | NON | un skin s'applique globalement, pas de surcharge par instance de bloc |
| Modèles nommés (accueil, article, archive, 404, recherche) | PARTIEL | 404 : géré comme entrée de contenu classique (réglage `notFoundPath`, L14). Recherche : page dédiée générique, chrome thémé mais corps non délégué au thème (§3, `search-page.ts`). **Archive/auteur : ABSENT** — pas de mécanisme de gabarit par taxonomie/auteur, seulement le bloc `collectionList` posé manuellement dans une page |
| Parties gabarit réutilisables (header/footer) | PARTIEL | `renderChrome(input)` par thème (fiche 23/L23) — un seul chrome par thème, pas de bibliothèque de variantes de header |

### Astra / GeneratePress / Kadence

| Fonction | Cogenta | Détail |
|---|---|---|
| Constructeur de header (méga-menu, éléments multiples) | NON | `ChromeInput` a un seul `headerNav` plat, pas de méga-menu |
| Constructeur de pied de page | NON | idem, `footerNav` plat |
| Mise en page article (largeur, sidebar) | NON | pas de notion de sidebar dans le contrat |
| Boutons (styles nommés) | NON | pas de bibliothèque de styles de composants exposée à l'admin |
| Fil d'Ariane | Existe côté bloc (non vérifié dans ce domaine — dépend du vocabulaire contrat B) | — |
| Bouton retour en haut | NON | non trouvé dans le chrome des 5 thèmes |
| Options de performance (désactiver Emoji, etc.) | Sans objet | Cogenta n'a pas cette dette (zéro JS client des thèmes, R3/L3) |

### Shopify Theme Editor

| Fonction | Cogenta | Détail |
|---|---|---|
| Sections/blocs avec réglages par section | PARTIEL | contrat B est un vocabulaire fixe et fermé (RFC requise pour l'étendre) — pas de réglages libres par instance de bloc au-delà de ses propres champs |
| Aperçu par appareil | NON | (§4 P3) |
| Bibliothèque de thèmes avec achat/installation | PARTIEL | modèle existe (`@cogenta/plugins`), **aucun écran** (confirmé, cohérent avec le constat déjà connu de la fiche 14 elle-même) |
| Dupliquer un thème pour l'éditer | NON | pas de fork de thème depuis l'admin |

### Ghost

| Fonction | Cogenta | Détail |
|---|---|---|
| Réglages de design (couleurs d'accent, police) | OUI | jetons |
| Injection de code (head/footer) | PARTIEL | CSS additionnel seulement, pas d'injection HTML/JS arbitraire dans `<head>`/avant `</body>` — cohérent avec R3/isolation du thème, différence assumée pas un manque |
| Flux RSS natif | **NON** | `feeds.ts` existe, jamais servi (§4 P1) |
| Membres/newsletter | Hors périmètre (contrat commerce/formulaires) | — |

## 6. Spécification ultra détaillée des corrections et ajouts

### T01 — Brancher l'identité du site (logo, logo sombre, favicon, image de partage) au rendu réel

**Priorité** : P0. **Effort** : 1,5 j. **ADR requise** : non (aucun nouveau champ,
juste consommer ce qui existe déjà en base et au contrat D — le seul ajout touche
`ChromeInput`, interne à `@cogenta/theme-kit`, jamais publié comme contrat D lui-même
puisque le contrat D documente `RenderContext`, pas `ChromeInput`).

**Fichiers à toucher** :
- `packages/theme-kit/src/chrome.ts` — ajouter `logoUrl?: string`, `logoDarkUrl?: string`
  à `ChromeInput`.
- `packages/cli/src/commands/theme-render.ts` — dans la construction de
  `<link rel="icon">` (L696), résoudre `overrides.faviconMediaId` en URL via
  l'endpoint public `/_image?id=…&w=64` (déjà existant, L10), repli sur
  `DEFAULT_LOGO_PATH` si `null`. Passer `logoUrl`/`logoDarkUrl` résolus de la même
  façon à `renderChrome`.
- Chaque thème (`packages/theme-{canonical,portfolio,magazine,ecommerce,entreprise}/
  src/render/chrome.ts` ou équivalent) — afficher `input.logoUrl` dans le header s'il
  est fourni, repli sur le nom du site en texte (comportement actuel) sinon. Le choix
  entre logo clair/sombre se fait en CSS (`<picture>`/`prefers-color-scheme` ou une
  classe conditionnelle), jamais côté serveur (le serveur ne connaît pas le thème visuel
  du visiteur).
- `packages/cli/src/commands/seo.ts` — `fallbackImageFor` : décider si
  `shareImageMediaId` prime sur `seo.defaultSocialImageUrl`, ou si le sélecteur de
  `appearance.tsx` doit plutôt être retiré au profit du champ SEO déjà câblé (moins de
  travail, cohérent avec le principe « une seule place » que la fiche 14 elle-même
  demande pour l'identité visuelle — **décision produit à trancher avant de coder**,
  documentée comme telle).

**Travail détaillé** :
1. `theme-render.ts` lit déjà `overrides` (`ThemeOverridesState`) pour construire le
   CSS — passer les 3 champs restants (`logoMediaId`, `logoDarkMediaId`,
   `faviconMediaId`) au même point d'entrée que celui qui construit le HTML de tête.
2. Résolution en URL publique : réutiliser `describeMedia`/`imageEndpoint` déjà
   présents dans `theme-render.ts` pour l'OG image — même fonction, mêmes garanties
   (kind === 'image' uniquement).
3. i18n : aucun nouveau texte admin (les libellés existent déjà) ; vérifier qu'aucune
   régression n'apparaît sur `appearance.brandingNote` qui pourrait laisser croire que
   la carte Identité n'a pas d'effet.

**Critères d'acceptation** :
- Un `admin` choisit un favicon dans Apparence → Identité, enregistre → `curl -I` la
  page d'accueil publique montre `<link rel="icon">` pointant vers l'asset choisi, pas
  `DEFAULT_LOGO_PATH`.
- Idem pour le logo dans le header d'au moins 2 thèmes différents.
- Un site qui n'a jamais rien réglé continue de servir `DEFAULT_LOGO_PATH`/le nom du
  site en texte, sans régression.

**Tests exigés** :
- Bout en bout (`packages/cli/test/serve-theme.test.ts`) : enregistrer un
  `faviconMediaId`, requêter `/`, vérifier le `<link rel="icon">`.
- Composant : `appearance.tsx` — vérifier que la note de provenance mentionne
  désormais un effet réel (pas de changement de comportement UI attendu, seulement
  non-régression).

### T02 — Page d'accueil configurable

**Priorité** : P1. **Effort** : 1 j. **ADR requise** : non (overlay de thème, même
famille que le reste des réglages de `theme-store.ts`, aucun contrat touché).

**Fichiers** : `packages/schema/src/store/theme-store.ts` (nouveau champ
`homeEntryId: string | null` dans `ThemeOverridesState`/`SetThemeOverridesInput`,
migration additive sur `cogenta_theme`), `packages/api/src/rest/theme-router.ts`
(exposer/accepter le champ), `packages/cli/src/commands/theme-render.ts` (résoudre
`homeEntryId` avant le repli `/home` codé en dur, L351), `packages/admin/src/routes/
appearance.tsx` (un sélecteur d'entrée — réutiliser le composant de sélection de
contenu déjà utilisé ailleurs dans l'admin, par exemple dans le champ `relation`).

**Critères d'acceptation** : un site sans page de slug `home` peut choisir une page
existante comme accueil et `/` la sert ; le comportement par défaut (`/home`) reste
inchangé pour un site qui n'a jamais réglé ce champ.

**Tests exigés** : bout en bout, `curl /` avec et sans réglage.

### T03 — Servir RSS/Atom

**Priorité** : P1. **Effort** : 0,5 j (le rendu est déjà écrit et testé). **ADR
requise** : non.

**Fichiers** : `packages/cli/src/commands/serve.ts` — deux routes `GET /feed.xml` (ou
`/rss.xml`) et `GET /atom.xml`, réutilisant `feedItemsFor`/`renderRssFeed`/
`renderAtomFeed` de `@cogenta/seo`, avec la même lecture ANONYMOUS que
`sitemap.xml`/`robots.txt` (L10). `<link rel="alternate" type="application/rss+xml">`
dans `<head>` (`theme-render.ts`).

**Critères d'acceptation** : `curl /feed.xml` sur un site avec du contenu publié
renvoie un flux RSS valide ; la balise `<link>` pointe dessus dans le `<head>` de la
page d'accueil.

**Tests exigés** : bout en bout, validation XML basique.

### T04 — Trancher le sort du cache de rendu à tags et du PWA (code mort)

**Priorité** : P1 (décision), P2 (implémentation si retenue). **Effort** : 0,5 j pour
la décision + mise à jour de `docs/lots/L3-rendu.md` ; 3-5 j si câblage effectif choisi
pour le cache de rendu ; 2-3 j si câblage effectif choisi pour la PWA. **ADR requise** :
non pour retirer/documenter, **oui** si le cache de rendu est câblé en production avec
un comportement de purge différent de l'actuel TTL (changement de comportement observable
pour un opérateur qui compte sur `pageMaxAge`).

**Travail détaillé (option retrait/documentation, recommandée à court terme)** :
mettre à jour `docs/lots/L3-rendu.md` avec un bandeau équivalent à celui de la fiche 14
(« Mise à jour... ») expliquant que l'intégration Astro/build à trois cibles/cache à
tags/PWA n'a pas été retenue, au profit de `cogenta serve` en Node vivant avec TTL HTTP.
Ne pas supprimer le code tout de suite (R9 : le retirer sans un remplacement clair est
une régression documentaire, pas un progrès) — mais retirer les deux modules du
`README`/`package.json` `exports` si des symboles y sont publiés sans jamais être
utilisés, pour ne pas laisser un consommateur externe s'appuyer dessus par erreur.

**Critères d'acceptation** : `docs/lots/L3-rendu.md` reflète l'architecture réelle ;
aucun symbole mort n'est présenté comme une fonctionnalité active dans la documentation
publique (`docs-site/`).

### T05 — Préchargement des polices et `font-display: swap` sur les 5 thèmes

**Priorité** : P2. **Effort** : 1 j. **ADR requise** : non.

**Fichiers** : `packages/cli/src/commands/theme-render.ts` (ajouter
`<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>` et
`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` dans le
`<head>` quand le thème actif déclare charger des polices Google Fonts — ou plus
simplement, systématiquement, coût nul si la police n'est pas utilisée), et
`packages/theme-{canonical,magazine,ecommerce,entreprise}/src/styles/tokens.css`
(ajouter `font-display: swap` là où `theme-portfolio` l'a déjà).

**Critères d'acceptation** : Lighthouse (mesure manuelle en attendant T06) ne signale
plus de police bloquante sans `font-display`.

### T06 — Lighthouse CI sur au moins 3 blueprints

**Priorité** : P2. **Effort** : 2 j. **ADR requise** : non.

**Travail détaillé** : job GitHub Actions dédié, `@lhci/cli` (à faire auditer par
`deps-auditor` avant ajout — nouvelle dépendance directe, R9), seuils
Performance/Accessibility ≥ 90 comme le demande L12, échec de build en cas de
régression. Réutiliser les blueprints déjà scaffoldés par `create-cogenta` pour
générer 3 sites réels (blog, portfolio, boutique) avant la mesure.

### T07 — Vérifier les 5 thèmes intégrés contre le scanner d'isolation contrat D

**Priorité** : P2. **Effort** : 0,5 j. **ADR requise** : non.

**Fichiers** : nouveau test dans chaque paquet `theme-*` (ou un test partagé dans
`packages/cli/test/`), appelant `verifyTheme`/`inspectTheme` (`@cogenta/render`)
contre les sources réelles du paquet. **Critère d'acceptation** : les 5 thèmes passent
la vérification sans modification (attendu, puisqu'ils sont de confiance) — le test
sert de garde-fou pour une régression future, pas une correction d'un bug actuel.

### T08 — Réutiliser le sélecteur de largeur d'aperçu (page builder) dans l'écran Apparence

**Priorité** : P3. **Effort** : 0,5 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/routes/appearance.tsx` (importer `VIEWPORTS`/
`Viewport` depuis `packages/admin/src/builder/viewports.js`, appliquer la même
technique `transform: scale()`/largeur fixe que `PreviewFrame` à l'iframe de
personnalisation).

### T09 — Rédiger et remettre l'ADR courte sur les overlays de thème (fiche 14 tâche 0)

**Priorité** : P3 (rattrapage documentaire). **Effort** : 0,25 j. **ADR requise** :
oui — texte à produire, à remettre à l'humain pour insertion (`docs/03-decisions.md`
protégé en écriture).

### T10 — Décider du sort des blocs manquants du L12 (nav riche/méga-menu, footer structuré en bloc, équipe, newsletter)

**Priorité** : P3. **Effort** : à chiffrer une fois la décision prise. **ADR requise**
: **oui** si un nouveau bloc de vocabulaire est ajouté (contrat B figé, RFC requise —
déjà la règle suivie par `blocks@2.0`/ADR-0030). Noté ici pour mémoire, hors périmètre
de correction immédiate : `headerNav`/`footerNav` restent plats (pas de méga-menu) et
aucun bloc `team`/`newsletter` n'existe dans `blocks@2.0` malgré la demande explicite
de L12.

## 7. Ordre d'exécution recommandé et dépendances

1. **T01** (identité du site) — le point mort le plus visible pour un utilisateur
   final, aucune dépendance, gain immédiat.
2. **T03** (RSS/Atom) — code déjà écrit et testé, effort minimal, parité concurrentielle
   immédiate (Ghost/WordPress).
3. **T02** (page d'accueil configurable) — indépendant, complète la tâche 4-5 de la
   fiche 14.
4. **T09** (ADR overlays de thème) — rattrapage documentaire, à faire dès que possible
   pour ne pas accumuler la dette (aucune dépendance technique).
5. **T04** (trancher cache de rendu/PWA) — décision produit à prendre avant tout autre
   travail de performance, parce qu'elle conditionne si T05/T06 mesurent un système
   TTL simple ou un système à cache de tags plus complexe.
6. **T05** (polices) puis **T06** (Lighthouse CI) — dans cet ordre, pour que la CI
   mesure un état déjà amélioré plutôt que de capturer une régression connue dès son
   premier run.
7. **T07** (scanner d'isolation sur les 5 thèmes) — indépendant, peut être fait à tout
   moment, faible risque.
8. **T08** (aperçu responsive dans Apparence) — confort, aucune dépendance.
9. **T10** (blocs manquants L12) — nécessite une RFC contrat B avant tout code ; à
   traiter comme un lot à part si retenu, pas une correction ponctuelle.
