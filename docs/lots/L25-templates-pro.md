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
| Phase 0 — A0a (theme-kit / contrat D / serve) | fait | fusionné dans `main` (`2f0056d`) ; + correctif `THEME_STRINGS` (`6c97591`) : `t` était un bouchon `key => key` pré-existant |
| Phase 0 — A0b (demo-art / ingestion / thème par défaut) | fait | fusionné (`636fbfb`) ; correctif forme `socialLinks` (`9a15376`) |
| Phase 0 — A0c (qualité des visuels) | fait | repris par un agent neuf après le 429, fusionné (`51f17db`) ; vérifié à l'œil : hero saturé + zone de texte calme, produit ombré, couvertures variées |
| Phase 1 vague 1 — blog, saas, restaurant, docs, association | interrompu | limite de session (429) le 2026-09-05 ~04:50, les 5 agents en phase de vérification, **rien de commité**, contexte d'agent intact (reprise par message). Worktrees `.claude/worktrees/agent-<id>` : blog `a129684410a8d6b31` (65 fichiers, 2 614 l. CSS, tests en cours d'exécution) ; saas `ab8e4d78f421802bf` (62 fichiers, 2 561 l. CSS, test blueprint saas vert, lecture des résultats) ; restaurant `ab96e1f3fef3f973f` (61 fichiers, 2 245 l. CSS, `pnpm install` fait, typecheck à lancer) ; docs `aef9c39f68e5d56f4` (62 fichiers, 2 641 l. CSS, changesets puis vérification complète à faire) ; association `adc80a4ea2e91103a` (63 fichiers, 2 238 l. CSS, tests en cours d'écriture — le moins avancé). Ordre de reprise décidé avec l'utilisateur : un agent à la fois — A0c (fait), blog (fait : fusionné `2fac4a4`, revu en direct par la session principale → deux correctifs `f819625` : conteneur de page pour tous les blocs via `:where(.cg-main > [data-block])`, et plus de formulaire de commentaire sous les pages de gabarit — appliqué à tous les blueprints dans `scaffold.ts`), saas (fait : fusionné `407b6cd`, deux bugs partagés corrigés par l'agent — titre UUID des entrées nommées `name` dans `theme-render.ts`, avatar de témoignage non préchargé dans `collectDependencies` — plus, après revue en direct, `b12dfd5` : halos du hero clippés, la page défilait horizontalement), docs (fait : fusionné `c616b4b` ; l'agent a trouvé en direct que la barre latérale desktop était invisible — `<details>` fermé jamais rendu par Chrome, même avec `display` forcé — corrigée par une vraie `<nav>` desktop + `<details>` mobile), **restaurant en cours (2026-09-05 ~09:40)**, puis association |
| Phase 1 vague 2 — entreprise, magazine, portfolio, ecommerce (passes pro) | à faire | |
| Phase 2 — intégration, vérification globale, push | à faire | |

## Annexe — Briefs de la Phase 1 (un agent par ligne du tableau)

Règles communes à tous les briefs, en plus de la section « Ce que tout template partage » :
le paquet suit le squelette de `@cogenta/theme-entreprise` (même `package.json`,
`theme.config.ts` avec les dix-sept blocs, `tokens.json`, `src/styles/{tokens,base,blocks,
archive,theme}.css`, `src/render/{chrome,render-block,term-archive}.ts`, `src/render/blocks/*`,
`test/*` avec `css-color.ts`, `design-system.test.ts`, `font-display.test.ts`,
`isolation.test.ts`, `page.test.ts`, `tokens.test.ts`, un test par bloc) ; il consomme
`theme@1.4` : `renderEntryHeader`/`page.entry` (page d'article), `entryImage` (cartes),
`renderSocialLinks`/`tagline`/`footerNote`/`headerAction` (chrome), `renderIcon`
(grilles de fonctionnalités). Le blueprint correspondant déclare `defaultTheme`, sème les
menus (`header`, `footer`, `header-action`), l'accroche, trois liens sociaux, une note de
pied de page, les médias via `seedDemoMedia` (compositions `demo-art` avec la palette de
sa `STARTING_SKINS`), et publie ses entrées de démo. Les collections gagnent un champ
`coverImage: f.media({ accept: ['image'] })` là où le brief le dit, pour que `entryImage`
ait quelque chose à rendre. Textes de démo en anglais (comme tous les blueprints), sans
« lorem ipsum », crédibles et spécifiques au type de site.

### `theme-blog` — blueprint `blog`
- Identité : blog personnel/professionnel de lecture. Fraunces (titres, `opsz`) + Source Serif
  4 (corps de lecture) + Inter Tight (UI) via Google Fonts. Palette claire, papier chaud très
  léger, accent terracotta ou bleu encre ; sombre : encre profonde, jamais du gris inversé.
- Accueil : `hero` (article vedette : titre, sous-titre, média = couverture) → `collectionList`
  « Latest » (grille 3 col. de cartes avec couverture, rubrique, date, temps de lecture) →
  `featureGrid` « Topics » (icônes) → `quote` (citation d'un lecteur, avatar) →
  `collectionList` « From the archive » (liste éditoriale) → `cta` newsletter (« Get the
  weekly letter », deux actions) → `logoStrip` « As featured in » → `faq` « About this blog ».
- Article : `renderEntryHeader` (rubriques, titre, extrait, date longue, auteur, temps de
  lecture, couverture 16:9), colonne de lecture 65ch, citations soignées, typographie de
  lecture. (`renderPage` est synchrone : pas de « articles liés » dynamiques dans le thème.)
- Blueprint : `post.coverImage`, 8 articles publiés avec couvertures (`coverArt`, 8 seeds),
  `category` avec 4 termes, `tag` avec 8, auteur = admin.

### `theme-saas` — blueprint `saas`
- Identité : Linear/Stripe/Vercel. Inter Tight ou Manrope + JetBrains Mono. Fond très clair
  avec halos de dégradé (mesh) derrière le hero ; accent violet-bleu ; sombre quasi noir avec
  lueurs. Boutons pleins arrondis 10px, bordures 1px translucides.
- Accueil : `hero` (eyebrow « Now in public beta », titre, sous-titre, média = `heroArt`
  mesh, 2 actions) → `logoStrip` (« Trusted by ») → `featureGrid` 6 items avec `renderIcon` →
  `mediaFigure` (visuel produit large, ratio 16:9, légende) → `statCounter` 4 chiffres →
  `testimonial` ×1 puis `quote` → `pricingTable` 3 paliers (milieu `highlighted`) →
  `faq` 6 questions → `cta` final pleine largeur sur fond accent.
- Blueprint : `feature` gagne `icon: f.text` et `coverImage` ; 6 features ; `page` home/pricing/
  about ; menus : Product, Pricing, Docs, Blog, Company ; `header-action` « Start free ».

### `theme-restaurant` — blueprint `restaurant`
- Identité : élégance sombre par défaut (Divi/Astra Restaurant), Cormorant Garamond (titres)
  + Jost (corps). Palette charbon + crème + accent cuivre/vin ; clair : crème chaude.
- Accueil : `hero` plein cadre (média = composition chaude, `heroArt` variante « warm »,
  titre du restaurant, action « Reserve a table ») → `prose` court (« Our story ») →
  `collectionList` « The menu » sur `menu_item` groupé visuellement par `category` (le thème
  rend `price` aligné à droite avec points de conduite, `description` en italique) →
  `gallery` 6 images (masonry) → `stats` (« Since 1994 », « 3 chefs », « 120 seats ») →
  `testimonial` → `accordion` « Hours & location » (horaires, adresse, parking) →
  `embed` carte (provider `other`, URL OpenStreetMap) → `cta` « Book now / Call us ».
- Blueprint : `menu_item.photo` (media) ; 12 plats sur 4 catégories ; `header-action`
  « Reserve ».

### `theme-docs` — blueprint `documentation`
- Identité : Docusaurus/GitBook. IBM Plex Sans + IBM Plex Mono. Neutre bleu-gris, accent
  bleu ; sombre ardoise. Densité d'information, lisibilité du code.
- Accueil : `hero` (titre, sous-titre, actions « Get started » / « API reference ») →
  `featureGrid` « Start here » 3–6 cartes avec icônes et liens → `collectionList`
  « Guides » (liste ordonnée par `createdAt asc`, groupée par `section` par le thème) →
  `prose` « Quick install » avec bloc de code → `faq` → `cta` « Contribute on GitHub ».
- Page doc : mise en page à deux colonnes **CSS-only** — barre latérale de navigation à
  gauche construite par le thème depuis une `collectionList` **semée dans chaque page doc**
  (limite 100, tri `createdAt asc`) que le thème rend en `<nav aria-label="Documentation">`
  collant ; contenu à droite en 72ch ; fil d'Ariane (section › titre) ; blocs `prose` avec
  `pre/code` stylés, `kbd`, tableaux. Mobile : la barre devient un `<details>`.
- Blueprint : 10 pages doc sur 3 sections avec un vrai contenu technique de démo (install,
  configure, deploy…), `order` cohérent.

### `theme-association` — blueprint `association`
- Identité : chaleureux, humain (Astra Charity). Nunito (titres, arrondi) + Source Sans 3.
  Vert profond ou orange soleil en accent, beige clair ; sombre : vert forêt.
- Accueil : `hero` (cause, média = `heroArt` « warm », actions « Donate » / « Volunteer ») →
  `stats` chiffres d'impact 4 items → `featureGrid` « What we do » 3 programmes (icônes) →
  `collectionList` « Upcoming events » sur `event` (cartes avec date en grand bloc
  jour/mois, lieu, image) → `gallery` 6 → `testimonial` (bénévole) → `logoStrip`
  « Our partners » → `cta` don pleine largeur → `faq` « How to help ».
- Blueprint : `event.coverImage` ; 6 événements datés dans le futur (calculés au scaffold :
  `now + n jours`) ; `header-action` « Donate ».

### `theme-entreprise` — blueprint `vitrine` (passe pro)
- Garder l'identité (vert forêt, KPI). Ajouter : hero deux colonnes texte/visuel avec
  `heroArt`, bandeau `logoStrip` sous le hero, cartes de services avec `renderIcon`, section
  témoignages avec avatars (`avatarArt`), `cta` finale, pied de page 4 colonnes, menu
  mobile CSS-only, en-tête collant avec `headerAction` « Get a quote ».
- Blueprint `vitrine` : `service` gagne `icon` + `coverImage`, `testimonial` gagne `avatar`
  (media) ; accueil 11 blocs : hero, logoStrip, featureGrid (services), stats, mediaFigure,
  collectionList (services), testimonial, quote, faq, cta, prose (about).

### `theme-magazine` — blueprint `magazine` (passe pro)
- Garder Fraunces + Public Sans. Ajouter : manchette sombre avec date du jour et rubriques
  en barre secondaire (les `headerNav`), une « une » = `hero` avec couverture, puis
  `collectionList` « Top stories » où **la première carte est mise en avant** (grande, image
  16:9), les suivantes en grille ; `renderEntryHeader` avec rubrique en surtitre rouge
  journal ; pied de page dense 4 colonnes.
- Blueprint : `article.coverImage` ; 12 articles sur 4 sections ; accueil 9 blocs.

### `theme-portfolio` — blueprint `portfolio` (passe pro)
- Garder brutaliste-éditorial violet. Ajouter : grille de projets **avec couvertures** plein
  cadre (survol : légère montée + révélation), hero display géant avec média, section
  « Selected work » = `collectionList` (layout `grid`), `stats` (années, projets, prix),
  `logoStrip` clients, `cta` « Let's talk », page projet avec `renderEntryHeader`
  (titre, couverture, extrait = `summary`).
- Blueprint : `project.coverImage` ; 8 projets avec `coverArt` variés.

### `theme-ecommerce` — blueprint `store` (passe pro ; A0b a déjà câblé le blueprint)
- Ajouter : bannière hero avec `heroArt`, tuiles de catégories (`gallery` avec légendes,
  `featureGrid` n'ayant pas de média), grille produits avec `entryImage`, prix formaté
  (`Intl.NumberFormat` avec la locale ; la devise n'est pas accessible au thème : afficher
  la valeur telle que le blueprint la sème), badge « Out of stock » depuis `inStock`, bande
  promo `cta`, `logoStrip` badges de confiance, pied de page newsletter/colonnes.
