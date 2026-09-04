# L25 — Templates professionnels par type de site

> Demandé en direct par l'utilisateur le 2026-09-05, en mode **full autonomie** explicite
> (« si les tokens de session finissent, tu attends, dès que la session reset tu
> continues »). Ce document est la source de vérité de reprise : la table « État
> d'avancement » en fin de fichier est mise à jour à chaque étape franchie.

## Le constat

L23 a livré quatre thèmes (`portfolio`, `magazine`, `ecommerce`, `entreprise`) plus
`canonical`. Chacun est un vrai paquet (~2 400 lignes de CSS, dix-sept blocs, ~200 tests),
et pourtant **un site fraîchement créé par `npm create cogenta` ne ressemble jamais à un
site pro**, quel que soit le type choisi. Quatre causes, toutes vérifiées dans le code :

1. **`create-cogenta` n'active jamais un thème par type de site.** Tout site démarre sur
   `@cogenta/theme-canonical` (`scaffold.ts` ne connaît que lui ; `cogenta_theme.active_theme`
   n'est jamais écrit). Le thème `ecommerce` existe, mais un blueprint `store` ne l'utilise pas.
2. **Les pages d'accueil semées sont maigres.** `vitrine` (le plus riche) place six blocs ;
   un template de démarrage WordPress (Astra Sites, Kadence Starter, Divi Layouts) en
   place dix à quatorze, et surtout **avec des visuels**.
3. **Aucun visuel nulle part.** Aucun blueprint ne sème un média : `hero.media` reste vide,
   `article.coverImage` reste vide, et aucun thème ne rend l'image d'une entrée dans une
   carte de `collectionList` — `@cogenta/theme-kit` n'a même pas d'aide `entryImage()`.
4. **Le chrome est minimal.** `ChromeInput` (`theme@1.3`) ne transporte que la navigation,
   la marque et le crédit Cogenta : pas d'accroche, pas de liens sociaux, pas de colonnes
   de pied de page, pas de bouton d'action dans l'en-tête — tout ce qui fait un footer pro.
5. **Cinq types de site sur neuf n'ont pas de thème dédié** : `blog`, `documentation`,
   `association`, `restaurant`, `saas`.

## Décisions prises (autonomie, à signaler dans le rapport)

### D1 — Les visuels de démonstration sont générés procéduralement, en PNG, sans dépendance

Un template pro exige des images. Trois voies ont été testées **réellement** avant de choisir :

- **SVG semé comme média** — refusé par l'API : `MEDIA_TYPE_REJECTED`, « SVGs are refused
  by default (ADR-0017) until a reviewed sanitizer exists ». Une décision actée ne se
  contourne pas.
- **SVG rastérisé par `wasm-vips` au scaffold** — le binding expose `svgloadBuffer` mais
  l'opération n'est pas compilée dans le build embarqué (`no such operation svgload_buffer`,
  vérifié sur wasm-vips 8.18.3). `sharp` a librsvg mais est un pair optionnel (R10) : en faire
  le chemin principal des visuels de démo casserait exactement les hôtes que R10 protège.
- **Photos tierces** — pas de source dont la licence soit vérifiable hors ligne, et un paquet
  npm qui embarque 5 Mo de photos pour un installeur est hors de question.

**Retenu** : un module `demo-art` dans `create-cogenta` — un encodeur PNG minimal
(`node:zlib` + CRC32, ~80 lignes) et un rendu par champs de distance signés (dégradés
multi-points, halos, formes géométriques anticrénelées, grain discret). Chaque blueprint
décrit ses visuels comme des **compositions** (palette + formes), rendues au scaffold en
1600×1000 puis ingérées par le vrai pipeline média (variantes redimensionnées + WebP,
comme n'importe quel téléversement). Style volontairement abstrait — le registre visuel des
templates SaaS/agence/portfolio modernes — et non des « fausses photos ». **Renoncement
assumé** : un restaurant de démonstration n'aura pas de photo de plat ; il aura une
composition chaude et élégante que le propriétaire remplace en un clic. Texte d'ADR prêt à
insérer plus bas (ADR-0032 ; `docs/03-decisions.md` est protégé en écriture).

### D2 — `theme@1.4`, strictement additif

`ChromeInput` gagne quatre champs **optionnels** : `tagline`, `social` (liste de
`{ label, href }`), `footerNote`, `headerAction` (`{ label, href }`). Un thème `1.3` ignore
ces champs et rend exactement comme avant ; un hôte qui ne les renseigne pas obtient le
rendu antérieur. `@cogenta/theme-kit` gagne `entryImage(entry, ctx)` (aide, pas contrat :
lit `coverImage`/`cover`/`image`/`featuredImage`/`photo`/`thumbnail`/`seoImage` dans cet
ordre) et `renderSocialLinks()`. Côté réglages, deux clés nouvelles dans le registre
existant : `general.socialLinks` (JSON) et `general.footerNote` (texte) —
`general.tagline` existe déjà (« Accroche »).

### D3 — Un thème dédié par type de site, jamais un recolorage

Cinq paquets nouveaux (`@cogenta/theme-blog`, `-docs`, `-association`, `-restaurant`,
`-saas`) construits comme en L23 : un agent par thème, en worktree isolé, dix-sept blocs,
chrome propre, archive de terme, zéro JavaScript client, zéro couleur littérale, mode sombre
conçu, WCAG AA vérifié par test de contraste, aucune dépendance npm nouvelle. Les quatre
thèmes L23 reçoivent une **passe pro** (chrome riche, cartes avec image, hero avec média,
pied de page en colonnes, menu mobile CSS-only) sans changer leur identité.

### D4 — Un blueprint = thème par défaut + palette + page d'accueil riche + visuels + menus

`create-cogenta` écrit `cogenta_theme.active_theme` selon le blueprint, ajoute le paquet
de thème aux dépendances du site généré, sème 8 à 12 blocs sur la page d'accueil, des
entrées de démo avec image de couverture, les menus d'en-tête/pied de page, l'accroche et
les liens sociaux de démo. `blank` reste vierge (canonical, aucune démo).

## Références de design (inspiration, jamais copie)

| Type | Thème | Inspiration WordPress | Signature visuelle |
|---|---|---|---|
| `vitrine` | `entreprise` (passe pro) | Astra « Business Agency », Kadence « Corporate », GeneratePress « Agency » | Hero texte gauche / visuel droite, bandeau de logos de confiance, services en grille avec icônes, bande de chiffres clés, témoignages, CTA pleine largeur, footer 4 colonnes |
| `blog` | `blog` (nouveau) | Kadence « Blog », Neve « Blogger », GeneratePress « Journal », Ghost « Casper » | Article vedette plein cadre avec couverture, grille de derniers articles avec couvertures, lecture large et aérée (65ch), bloc newsletter, bio d'auteur, typographie serif de lecture |
| `magazine` | `magazine` (passe pro) | Newspaper, Newsmag, Hueman, Kadence « News » | Manchette sombre, une majeure + grille de secondaires, rails de rubriques, bandeau « tendances », colonnes denses |
| `portfolio` | `portfolio` (passe pro) | Uncode, Salient, Kalium, Astra « Photographer » | Grille de projets plein cadre avec couvertures, survol qui révèle, titrage display très grand, à propos + services, CTA |
| `documentation` | `docs` (nouveau) | Docsy, Docusaurus « classic », GitBook, Astra « Docs » | Accueil avec recherche mise en avant et cartes « démarrer », page doc avec barre latérale de navigation (CSS-only), blocs de code soignés, précédent/suivant, fil d'Ariane |
| `association` | `association` (nouveau) | Astra « Charity », « NGO », Kadence « Nonprofit », Divi « Charity » | Hero chaleureux sur une cause, chiffres d'impact, cartes d'événements datées, CTA « faire un don », bénévoles/témoignages, galerie |
| `restaurant` | `restaurant` (nouveau) | Astra « Restaurant », Divi « Restaurant », Neve « Bistro », OceanWP « Cafe » | Hero sombre et élégant, sections de carte avec prix alignés (points de conduite), horaires + réservation, galerie, témoignages, plan (embed) |
| `saas` | `saas` (nouveau) | Astra « SaaS », Kadence « Startup », et l'esthétique Linear / Stripe / Vercel | Hero à dégradé avec visuel produit, bandeau de logos, grille de fonctionnalités avec icônes, chiffres, tableau de prix, FAQ accordéon, témoignages, CTA |
| `store` | `ecommerce` (passe pro) | Astra « Shop », WooCommerce Storefront, Botiga, Shopify « Dawn » | Bannière hero avec image, tuiles de catégories, grille produits avec image/prix/badge, bande promo, badges de confiance, newsletter |

Ce que **tout** template partage, parce que c'est ce qui distingue un thème pro d'une
démo : en-tête collant avec logo + navigation + bouton d'action et menu mobile CSS-only
(`<details>`/checkbox, jamais de JS) ; pied de page en colonnes (marque + accroche, liens,
réseaux sociaux, crédit) ; page d'article avec surtitre, date lisible, image de couverture,
temps de lecture, typographie de lecture ; archives de terme cohérentes ; états `:hover`/
`:focus-visible` soignés ; `prefers-reduced-motion` respecté ; `light-dark()` + `oklch(from…)`
pour un mode sombre conçu (technique de L23) ; mobile-first, testé à 360, 768, 1280 px.

## Périmètre par phase

### Phase 0 — Fondations (deux agents en parallèle, worktrees)

**A0a — theme-kit / contrat D / serve / réglages**
- `packages/theme-kit` : `entryImage()`, `renderSocialLinks()`, `ChromeInput` 1.4.
- `packages/schema` : clés `general.socialLinks`, `general.footerNote` dans le registre.
- `packages/cli` (`serve.ts`) : renseigne `tagline`/`social`/`footerNote`/`headerAction`
  depuis les réglages ; `headerAction` = premier lien d'un menu à l'emplacement
  `header-action` s'il existe, sinon absent.
- `docs/04-contrats.md` § Contrat D : `theme@1.4`, additif. Changesets.
- `packages/theme-canonical` : consomme les nouveaux champs (le thème de référence doit
  montrer l'exemple) ; tests.

**A0b — visuels procéduraux / ingestion média / thème par défaut**
- `packages/create-cogenta/src/demo-art/` : `png.ts` (encodeur), `render.ts` (SDF),
  `compositions.ts` (presets par palette). Test : chaque preset produit un PNG valide que
  `sniffImageFormat` reconnaît et que `wasm-vips` charge.
- `packages/api` : extraire du routeur média une fonction `ingestMediaUpload()` réutilisée
  par le routeur (comportement identique, tests existants verts) et par `create-cogenta`.
- `packages/create-cogenta` : `seedDemoMedia()` (rend + ingère, retourne les ids),
  `BlueprintContentPack` gagne `defaultTheme`, `menus`, `siteSettings` ; `scaffold.ts` écrit
  `active_theme`, ajoute la dépendance du thème au `package.json` généré, sème menus et
  réglages. `blank` inchangé (test : octet pour octet identique à avant).

### Phase 1 — Neuf agents (deux vagues : 5 puis 4), un par type de site

Chaque agent : le thème (nouveau ou passe pro) **et** le blueprint correspondant (page
d'accueil riche, entrées de démo avec couvertures, compositions visuelles, menus, accroche,
liens sociaux, thème par défaut). Vérification obligatoire avant de rendre la main :
`typecheck`, `test`, `build` du/des paquets, puis **scaffold réel** d'un site avec ce
blueprint (`create-cogenta` en `--yes`), `cogenta serve`, et captures d'écran à 360/768/1280
de l'accueil, d'une entrée et d'une archive — regardées, pas seulement prises.

### Phase 2 — Intégration (session principale)

Registre des thèmes (`theme-registry.ts`), galerie Apparence, `docs-site` (guide des
thèmes), `README`, changesets, `pnpm turbo run build/typecheck/test --force`, scaffold des
neuf blueprints et capture d'écran de chaque accueil, corrections, commits par thème,
push.

## Critères d'acceptation

- [ ] `npm create cogenta` avec chaque blueprint produit un site dont l'accueil compte
      8 à 12 sections avec visuels, un en-tête et un pied de page complets, et le thème
      dédié actif **sans aucune action dans l'admin**.
- [ ] Chaque thème : dix-sept blocs, chrome 1.4, archive de terme, zéro `<script>`, zéro
      couleur littérale (test), contraste AA en clair et en sombre (test), aucune dépendance
      npm nouvelle, tests ≥ 150.
- [ ] Un thème `1.3` existant continue de rendre sans changement contre `cogenta serve`
      (test de non-régression sur `ChromeInput` sans les champs 1.4).
- [ ] Le blueprint `blank` produit un site octet pour octet identique à avant L25.
- [ ] `demo-art` : zéro dépendance, PNG valides, rendu d'une composition < 2 s.
- [ ] `pnpm turbo run build typecheck test --force` vert sur tout l'espace de travail.
- [ ] Changesets pour chaque paquet publié touché ; contrat D documenté ; ADR-0032 rédigée.

## Pièges connus

- **ADR-0017** : jamais de SVG dans le pipeline média, même « sûr ».
- **R9** : polices via Google Fonts `@import` uniquement (comme L23), jamais un paquet.
- **Contrat B figé** : aucun bloc nouveau ; un menu de restaurant est un `collectionList`
  sur une collection `dish` avec `price`, rendu par le thème, pas un bloc `menu`.
- **`collectionList` trie sur `id`/`createdAt`/`updatedAt` seulement** (`SortField`), jamais
  `publishedAt` — le bug trouvé post-L9 se reproduira sinon.
- **Worktrees** : branche depuis `origin/main` poussé ; jamais `git stash` dans un worktree
  parallèle (`refs/stash` est partagé) ; disque à 95 % — pas plus de cinq worktrees vivants.
- **Typecheck en cache** : après fusion manuelle, toujours `--force`.
- **Le thème lit la face publiée** : une entrée semée en brouillon n'apparaît pas dans une
  `collectionList` — les entrées de démo d'un template sont **publiées** (contrairement à
  L19 où le contenu généré par un modèle reste en brouillon : ici c'est du contenu de
  démonstration écrit par le projet, `provenance: 'human'`, pas la sortie d'un modèle).

## ADR-0032 — prête à insérer (fichier protégé)

```markdown
## ADR-0032 — Les visuels de démonstration sont générés procéduralement, en PNG, sans dépendance

**Statut** : Proposé (rédigée par L25, à insérer par l'humain)

**Contexte** — Un template de site n'est crédible qu'avec des visuels, et les blueprints
n'en semaient aucun. Trois voies ont été testées et écartées : le SVG semé comme média est
refusé par l'API (ADR-0017), la rastérisation SVG par `wasm-vips` n'existe pas dans le build
embarqué (`svgload` absent, vérifié), et `sharp` — qui saurait le faire — est un pair
optionnel dont R10 interdit de faire le chemin principal. Des photos tierces poseraient un
problème de licence invérifiable et de poids de paquet.

**Décision** — `create-cogenta` génère ses visuels de démonstration lui-même : un encodeur
PNG minimal sur `node:zlib` et un rendu procédural (dégradés, halos, formes anticrénelées,
grain) décrit par des compositions par blueprint, ingéré ensuite par le pipeline média
ordinaire. Zéro dépendance, zéro asset binaire dans le paquet.

**Justification** — Le registre visuel abstrait est celui des templates SaaS, agence et
portfolio modernes ; il vieillit bien, se remplace en un clic, et ne peut violer aucune
licence. Le rendu tient en quelques secondes au scaffold, une fois pour toutes.

**Conséquences** — Les blueprints décrivent des compositions, pas des fichiers. Le pipeline
média reçoit du PNG et produit les variantes comme pour un téléversement humain.

**Renoncement assumé** — Aucune photo réaliste : un restaurant de démo n'a pas de photo de
plat. C'est le prix de « zéro dépendance et zéro licence », payé en connaissance de cause.

**Écarté** — SVG (ADR-0017) ; `sharp` en chemin principal (R10) ; photos embarquées
(licence, poids) ; images générées par IA au scaffold (R2 : le CMS marche sans clé).
```

## État d'avancement (mis à jour à chaque étape)

| Étape | État | Notes |
|---|---|---|
| Diagnostic et décisions | fait | 2026-09-05 |
| Nettoyage disque (worktrees fusionnés) | fait | seuls les worktrees sans commit unique et propres |
| Phase 0 — A0a (theme-kit / contrat D / serve) | à faire | |
| Phase 0 — A0b (demo-art / ingestion / thème par défaut) | à faire | |
| Phase 1 vague 1 — blog, saas, restaurant, docs, association | à faire | |
| Phase 1 vague 2 — entreprise, magazine, portfolio, ecommerce (passes pro) | à faire | |
| Phase 2 — intégration, vérification globale, push | à faire | |
