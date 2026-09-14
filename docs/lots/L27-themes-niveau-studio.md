# L27 — Les dix thèmes au niveau d'un studio de design

> Demandé en direct par l'utilisateur le 2026-09-13 au soir, en **full autonomie**
> (« je pars dormir »), après avoir parcouru la galerie Apparence : « ces thèmes sont
> extrêmement basiques, il faut les améliorer un après l'autre, pas à pas […] des thèmes
> ultra pro, zéro dégradé, zéro pattern de l'IA (il faut absolument éviter qu'on sache que
> c'est un thème généré par l'IA), vraiment vraiment pro. J'ai bien dit tous les thèmes ».
> Ce document est la source de vérité de reprise : la table « État d'avancement » en fin de
> fichier est mise à jour à chaque thème fusionné.

## Le constat (vérifié sur de vrais sites, pas sur les tests)

Les neuf blueprints ont été scaffoldés pour de vrai et capturés dans Chrome (bureau et
mobile, clair et sombre). Les tests des dix thèmes sont verts ; les pages ne sont pas
professionnelles. Causes, par ordre d'impact :

1. **Aucun thème n'avait jamais chargé sa police** (corrigé en ouverture de lot, `2b5a543`).
   `cogenta serve` servait la feuille du skin avant celle du thème : l'`@import` Google Fonts
   arrivait après une règle, et un navigateur ignore un tel `@import`. Vérifié dans Chrome :
   `document.fonts` vide sur tous les thèmes, tout en police système. `joinStyles` remonte
   désormais les `@import` distants en tête (test ajouté).
2. **La typographie et la couleur d'un thème vivent dans le skin, pas dans le thème.** Un
   thème lit `--cogenta-font-*`/`--cogenta-color-*` ; un skin les définit toujours. Donc :
   si le skin de départ d'un blueprint ne nomme pas la police du thème, elle n'est jamais
   utilisée (cas de `magazine` : titres en Georgia) ; et **changer de thème dans l'admin
   garde le skin du site** — les dix cartes de la galerie ont la même palette vert sauge et
   la même police, d'où l'impression de dix fois le même thème.
3. **Des motifs visuels typiques des gabarits générés** : formes décoratives (disque, rectangle
   décalé) derrière le hero et les images, badge en pilule au-dessus du titre, tuiles d'icônes
   pastel sur des cartes identiques en 3 colonnes, accent indigo/violet, bandeau de chiffres
   dans une boîte colorée arrondie, apparition en fondu au défilement (qui laisse aussi des
   sections entièrement blanches sur toute capture pleine page et dans les aperçus).
4. **Des actifs de démo qui trahissent la génération** : sur les 70 photos bundlées (L25 D6),
   plusieurs portent du texte inventé illisible (« Anlytart », « Tife go blog », panneaux
   « Alcrinal Wat », dos de livres, carton « crunale ») ; des logos de confiance réduits à
   des formes grises factices ; des vignettes de cartes en compositions abstraites
   (`demo-art`) là où l'œil attend une photo ; un « visuel produit » SaaS fait d'un trait et
   d'un demi-disque.
5. **Du texte de démo « méta »** : « scaffolded by create-cogenta », « Lines of JavaScript
   shipped: 0 », « Every section above is normal editable content », une accroche « A site
   that looks like yours » dans la galerie ; et une écriture marketing à tirets cadratins en
   rafale et constructions « pas X, mais Y » — signatures d'un texte généré.
6. **Aucun rythme vertical** : des blocs collés les uns aux autres (FAQ contre tarifs, CTA
   contre FAQ), des titres de section désalignés de leur contenu, des espacements différents
   d'une section à l'autre.
7. **Galerie Apparence** : l'aperçu est une page synthétique sans image ni vraie mise en
   page (« A site that looks like yours », badge « Preview »), rendue dans le skin du site.

## La charte « studio » (contraignante pour les dix thèmes)

Un thème est terminé quand un designer professionnel ne pourrait pas deviner qu'il est sorti
d'un générateur — jugé **sur captures d'un vrai site**, jamais sur les seuls tests.

### Interdits (tous des défauts bloquants)

- Tout dégradé (`gradient(`), halo, lueur, flou décoratif, `backdrop-filter`, verre dépoli,
  bordure ou texte en dégradé, voile en dégradé sur image (D5 de L25, maintenu).
- Formes décoratives sans fonction : disques, blobs, rectangles décalés derrière une image,
  motifs de fond « pour remplir ».
- Badge en pilule au-dessus d'un titre de hero (« Now in public beta », « Est. 2011 ») — un
  surtitre reste permis s'il est typographique (petites capitales, filet).
- Tuiles d'icônes pastel ; grilles de cartes identiques par défaut ; tout centré par défaut.
- Accent indigo/violet par défaut ; plus d'une couleur d'accent ; accent sur plus d'environ
  10 % de la surface.
- Ombre portée sur les photos ; coins très arrondis partout ; `hover` qui soulève chaque carte.
- Apparition au défilement (`animation-timeline: view()`, fondu à l'entrée) : aucune.
  Transitions ≤ 150 ms sur couleur/soulignement seulement ; `prefers-reduced-motion` respecté.
- Polices-signatures des gabarits générés : Inter, Poppins, Plus Jakarta Sans, Space Grotesk,
  DM Sans, Manrope, Outfit, Sora, Nunito.
- Texte de démo méta (Cogenta, scaffold, « demo », « editable ») ; mots creux (seamless,
  unlock, elevate, empower, supercharge, streamline, cutting-edge, robust, leverage) ;
  tirets cadratins en série (au plus un par paragraphe) ; « pas X, mais Y » ; titres en
  question rhétorique ; points d'exclamation.
- Toute image contenant du texte illisible ou inventé, une main ou un visage incohérent ;
  toute composition abstraite là où un lecteur attend une photo, un logo ou une interface.

### Exigences

- **Typographie** : deux familles au plus (plus une mono si le type de site l'exige), une
  échelle réelle, interlettrage serré sur les grands titres, `text-wrap: balance` sur les
  titres et `pretty` sur les paragraphes, chiffres tabulaires pour prix et statistiques,
  guillemets typographiques, mesure de 60 à 75 caractères. La police du thème est **déclarée
  dans son `tokens.json` et dans le skin de départ de son blueprint**, et vérifiée chargée
  (`fonts loaded` du banc de captures).
- **Grille** : 12 colonnes sur bureau, largeur maximale explicite, gouttières constantes ;
  titres de section alignés sur le bord de leur contenu ; asymétrie voulue plutôt que symétrie
  par défaut.
- **Rythme vertical** : une échelle unique d'espacement de section, appliquée à tout bloc ;
  jamais deux blocs collés ; séparateurs par espace ou filet, pas par boîte colorée.
- **Couleur** : des neutres qui portent le design, un accent unique et rare ; un mode sombre
  conçu (surfaces, filets, images) et vérifié en capture, pas seulement par le test de
  contraste ; zéro couleur littérale dans les CSS ; AA calculé en clair et en sombre.
- **Images** : ratios constants par contexte, `object-fit: cover`, légendes quand le contexte
  est éditorial, coins nets ou très légèrement adoucis selon l'identité.
- **Chrome** : un en-tête et un pied de page qui ressemblent à ceux d'une vraie organisation
  (colonnes, mentions légales avec © année et nom, réseaux sociaux avec de vraies icônes).
- **Contenu de démo** : spécifique, chiffré, crédible, en anglais ; il nomme l'entreprise du
  site (`SeedContext.siteName`, ajouté en ouverture de lot) plutôt qu'un nom de fiction figé ;
  aucune statistique qui parle de Cogenta.
- **Tout bloc a un rendu digne** : une `collectionList` vide affiche un état vide pensé ; un
  bloc sans image ne laisse pas de trou ; aucune zone blanche géante.

### Actifs de démo

- **Photos** : audit des photos bundlées du blueprint ; une photo à texte inventé est
  recadrée pour l'éliminer ou retirée (jamais laissée). Aucune nouvelle source photo externe
  dans ce lot : une licence vérifiable hors ligne manque toujours (L25 D1), c'est un gap
  assumé et signalé.
- **Logos** : des wordmarks fictifs rendus **une fois**, hors produit, avec des polices sous
  licence OFL (dépôt `google/fonts`), en PNG monochrome, commités comme les photos de L25 D6
  (`assets/logos/<blueprint>/`). Aucune dépendance n'entre dans le produit.
- **Interfaces** : une capture produit (SaaS, tableau de bord de conseil, documentation) est
  une maquette d'interface nette rendue une fois avec de vraies polices, commitée, jamais une
  photo générée d'écran.
- `demo-art` reste le repli quand aucun fichier n'existe, jamais le choix pour une vignette
  de carte ou un logo.

## Direction de design par thème

Chaque thème a une identité propre ; aucune police d'affichage n'est partagée entre deux
thèmes. Un agent peut remplacer une police par une meilleure **si elle n'est réservée par
aucun autre thème** et le signale.

| Thème | Blueprint (fiction) | Registre et références | Polices (Google Fonts, OFL) | Signature |
|---|---|---|---|---|
| `entreprise` | `vitrine` — cabinet de conseil | Conseil haut de gamme : McKinsey, Bain, mise en page des études de cas de Pentagram | Newsreader (titres) + Hanken Grotesk (texte, UI) | Hero typographique sur grille 12 col sans badge ; photo recadrée franc ; services en liste numérotée à filets, pas en cartes à icônes ; chiffres clés en ligne typographique entre filets ; études de cas en rangées image/texte ; wordmarks clients en niveaux de gris ; grande citation serif ; FAQ en deux colonnes (titre collant à gauche) ; bandeau d'appel à l'action en encre ; pied avec adresses des bureaux |
| `blog` | `blog` — publication personnelle | Craig Mod, Robin Sloan, Stratechery, Ghost « Journal » | Literata (texte et titres, tailles optiques) + Figtree (UI, méta) | Article vedette en grand titre + image 3:2 ; « Latest » en index éditorial (date en marge, titre, chapeau) avec quelques images ; archives par année ; lecture 68ch ; newsletter en encadré à filet ; pied minimal |
| `magazine` | `magazine` — magazine d'actualité | The Guardian, The Atlantic, Monocle | Fraunces (titres) + Source Serif 4 (texte) + Libre Franklin (surtitres, nav) | Manchette datée, rubriques en capitales espacées, filets doubles ; une asymétrique (image 8/12 + brèves 4/12) ; grille dense à filets verticaux, zéro carte arrondie ; article à titre énorme, chapeau italique, image pleine largeur avec légende et crédit |
| `portfolio` | `portfolio` — studio de design | Pentagram, Collins, Koto | Archivo (axe de largeur pour les titres) | Noir et blanc stricts + un signal (orange international ou jaune), jamais violet ; nom du studio très grand ; grille de projets asymétrique plein cadre sans coins ronds ; légende client / discipline / année ; page projet avec fiche technique en colonnes ; contact en très grand lien |
| `ecommerce` | `store` — objets durables | Aesop, Muji, Hay, Everlane | Albert Sans | Sable minéral, encre, terre cuite discrète ; bannière photo pleine largeur ; catégories en tuiles photo carrées ; grille produits 4 col, photos 4:5 sur fond neutre, prix en chiffres tabulaires, « Sold out » en texte discret ; engagements en ligne de texte à filets ; histoire de marque en split image/texte |
| `restaurant` | `restaurant` — bistrot contemporain | Septime, Gramercy Tavern, Le Bernardin | Cormorant Garamond (titres) + Karla (texte, labels) | Hero photo plein écran, nom en serif léger, une seule action « Reserve » ; accueil court centré ; carte en deux colonnes à points de conduite, sections en petites capitales ; bande de photos de plats ; horaires et adresse en tableau typographique ; citation de presse |
| `saas` | `saas` — logiciel B2B | Basecamp, Plausible, Fly.io, Resend, Linear sans dégradé | Geist + Geist Mono | Blanc et gris structurés, encre quasi noire, accent bleu signal (jamais violet) ; capture produit nette dans un cadre à filet 1 px ; bandeau de wordmarks ; fonctionnalités 3×2 sans tuiles ; « comment ça marche » en 3 étapes numérotées ; tarifs en tableau à filets ; FAQ en deux colonnes ; pied riche en colonnes |
| `association` | `association` — association de quartier | charity: water, MSF, Wikimedia | Bricolage Grotesque (titres) + Source Sans 3 (texte) | Blanc cassé chaud, encre, vert profond, jaune signal réservé au don ; hero photo avec cause directe et deux actions ; chiffres d'impact avec phrase de contexte ; programmes en rangées image/texte ; événements en liste datée à bloc de date typographique ; partenaires en wordmarks |
| `docs` | `documentation` — documentation technique | Stripe Docs, Tailwind docs, MDN | IBM Plex Sans + IBM Plex Mono | Accueil avec recherche large et cartes « démarrer » à filets ; guides en colonnes de liens ; page doc à navigation latérale, fil d'Ariane, blocs de code avec nom de fichier, encadrés, précédent/suivant |
| `canonical` | `blank` et galerie | WordPress Twenty Twenty-Four, rigueur du design system GOV.UK | Instrument Sans + Instrument Serif (accents) | Le défaut exemplaire : sobriété absolue, typographie irréprochable, grille claire, chaque bloc à son meilleur sans identité sectorielle |

## Ordre de travail (séquentiel, un thème à la fois)

1. Ouverture (fait par la session principale) : polices hoistées (`2b5a543`),
   `SeedContext.siteName`, banc `scripts/theme-snapshots.mjs`, ce document.
2. Un thème à la fois, dans cet ordre : `entreprise`, `blog`, `magazine`, `portfolio`,
   `ecommerce`, `restaurant`, `saas`, `association`, `docs`, `canonical`. Un agent par thème,
   dans son propre worktree, qui possède le paquet du thème, son blueprint, ses actifs et son
   skin de départ.
3. Pour chaque thème, la session principale **rejoue elle-même** le banc de captures sur la
   branche de l'agent, regarde, renvoie des corrections précises si le niveau n'y est pas,
   puis fusionne dans `main`, pousse, et met à jour la table ci-dessous.
4. Clôture : l'identité d'un thème suit sa sélection (galerie rendue avec les jetons propres
   de chaque thème ; à la sélection, proposer d'appliquer la palette et la typographie du
   thème — action humaine, R6) ; page d'aperçu de la galerie refaite ; `pnpm turbo run build
   typecheck test --force` ; captures finales des neuf sites.

## Protocole de vérification (par thème)

1. Avant : `node scripts/theme-snapshots.mjs --blueprint <id> --out <dir>/before`.
2. Après chaque itération : même commande vers `<dir>/after-N`, en regardant **chaque bande**
   d'accueil, d'entrée et d'archive, bureau et mobile, clair, plus l'accueil sombre ; le
   rapport doit montrer les polices du thème chargées, `overflowX=0`, `broken=0`, un seul
   `h1`, aucun script autre que ceux de `cogenta serve`.
3. Auto-revue écrite contre chaque interdit et chaque exigence de la charte, avec preuve.
4. `pnpm -F <thème> typecheck test build`, `pnpm -F create-cogenta typecheck` et tests du
   blueprint, `pnpm -F @cogenta/cli typecheck`, `biome check` sur les fichiers touchés.
5. Garde-fous conservés ou réécrits, jamais supprimés : 17 blocs, zéro `gradient(`, zéro
   couleur littérale, contraste AA clair et sombre, zéro `<script>`/`on*` émis par le thème,
   rendu sans les champs `theme@1.4`. Nouveau garde-fou : zéro `animation-timeline`.

## Pièges connus

- `theme-kit` se reconstruit (`pnpm -F @cogenta/theme-kit build`) après toute modification.
- Contrat B figé (17 blocs), contrat D `theme@1.4` : aucun bloc nouveau, aucune rupture.
- `collectionList.sort.field` : `id`/`createdAt`/`updatedAt` seulement.
- Les entrées de démo d'un template sont **publiées** (sinon absentes des listes).
- `@import` distant : autorisé seulement pour Google Fonts ; `cogenta serve` le remonte.
- Worktrees : jamais `git stash` ; `pnpm install --offline` pour lier ; typecheck `--force`
  après toute fusion manuelle.
- Un agent tué par un 429 se reprend par un agent neuf pointé sur le **même** worktree.
- Consommer les changesets et pousser déclenche une publication npm : **jamais** sans
  confirmation explicite de l'utilisateur. Pousser des commits qui *ajoutent* des changesets
  ne publie rien.

## État d'avancement

| Étape | État | Notes |
|---|---|---|
| Diagnostic sur neuf sites réels | fait | 2026-09-13, captures de référence |
| Polices jamais chargées | fait | `2b5a543`, test `theme-css.test.ts` |
| `SeedContext.siteName`, banc de captures, charte | fait | `f7726ee`, assets PNG `3594666` |
| Icônes sociales méconnaissables (6 plateformes, tous thèmes) | fait | `cbfcc6d`, tracés Simple Icons CC0 |
| Archives sans accroche/note/réseaux ; temps de lecture absent des corps en blocs | fait | `fd13b07`, `f324360`, remontés par les agents entreprise et magazine |
| Contrat D `theme@1.5` : `PageEntryMeta.fields` (prix, stock d'une fiche produit) | fait | `e5126ed`, revu CONFORME par `contract-guardian` |
| `entreprise` (vitrine) | fait | `9102637`..`005cdb8` — Newsreader + Hanken Grotesk, grille 12 col, services en liste numérotée à filets, études de cas (nouvelle collection `case_study` + taxonomie `sector`), wordmarks clients rendus en OFL, graphique « exhibit » à la place de la photo à texte inventé, menu mobile plein écran ; 298 tests. Revu en captures par la session principale, une passe de finitions (soulignements, flèches orphelines, menu) |
| `blog` | fait | Literata + Figtree, marge de 3 colonnes pour dates et libellés, « Latest » en index éditorial daté (image seulement quand l'entrée en a une), dix essais réels dont trois de 900 à 1 000 mots, six photos à texte inventé supprimées, « As featured in » retiré ; 284 tests. Revu en captures, fusionné sans reprise. Gap : l'inscription à la lettre ne propose que le flux (un formulaire exigerait `@cogenta/forms` dans le blueprint) |
| `magazine` | fait | Fraunces + Source Serif 4 + Libre Franklin, manchette datée entre filets doubles, une asymétrique 8/4, rails de rubriques, « Most read » numéroté, article à légende et crédit ; rubriques et auteurs en vraies taxonomies, 18 articles (7 164 mots) ; les 12 photos d'origine retirées ou recadrées ; 334 tests. Revu en captures, fusionné sans reprise |
| `portfolio` | fait | Archivo seul (axe de largeur pour les titres), noir et blanc + orange signal sur trois détails, grille de projets asymétrique à légendes client · discipline · année, fiche technique en colonnes ; les 9 photos générées à texte inventé et les clients « Contoso/Fabrikam » remplacés par 27 pièces graphiques rendues avec des polices OFL (affiches, identité, rapport annuel, signalétique, couvertures, écrans d'app, packaging) pour 8 clients inventés ; 345 tests. Revu en captures, fusionné sans reprise |
| `ecommerce` (store) | fait | Albert Sans seul, sable minéral et encre, terre cuite réservée à trois détails ; bandeau photo, tuiles de catégories, grille 4:5 à prix tabulaires, engagements en une ligne à filets ; fiche produit avec colonne d'infos collante (prix, stock, détails, entretien) lue depuis `theme@1.5` `fields`, action honnête « Order by email » (aucun faux panier) ; photos retouchées pour retirer lettrages inventés et mannequin ; 356 tests. Revu en captures, fusionné sans reprise. Reste : la veste « flotte » encore sur son fond |
| `restaurant` | fait | Cormorant Garamond + Karla, crème et charbon, laiton réservé aux petites capitales ; photo pleine largeur puis nom en serif léger dessous (jamais de texte sur photo), carte typographique à points de conduite et prix tabulaires, fiche plat lue depuis `theme@1.5` `fields`, réservations honnêtes (téléphone, e-mail, page explicative) ; nom du restaurant = nom du site ; 4 photos défaillantes retirées ; 353 tests. Revu en captures, fusionné sans reprise |
| `saas` | à faire | |
| `association` | à faire | |
| `docs` (documentation) | à faire | |
| `canonical` | à faire | |
| Identité de thème à la sélection, galerie, vérification finale | à faire | |
