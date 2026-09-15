# L30 — Zones de widgets, comme sur WordPress

> Demandé en direct le 2026-09-15 : « il faut qu'on l'implémente comme sur WordPress, c'est-à-dire
> on définit sur l'admin et ça s'affiche sur le thème, peu importe le thème ça s'adapte, qu'on
> puisse cacher, afficher… bref comme sur WordPress, les fonctionnalités les plus complètes
> possible ». Mode de travail : autonomie. Ce document est la source de vérité de reprise.

## Le constat

Un thème ne reçoit aujourd'hui que des éléments fixes (menus `primary`/`footer`, bouton d'en-tête,
accroche, réseaux, note de pied) et une liste de blocs par page. Rien ne permet de placer, depuis
l'admin, un contenu répété sur tout le site dans une barre latérale ou des colonnes de pied de page.
Aucune ADR ne l'exclut : c'est un manque, pas une décision.

## Décisions (autonomie, signalées dans le rapport)

### D1 — Un nouveau paquet `@cogenta/widgets`

Le vocabulaire des widgets (types, réglages, validation), les règles de visibilité (fonction pure),
les zones standard, et le stockage (`cogenta_widgets`, même forme que les menus). Il ne dépend que
de `@cogenta/core`. **Ce n'est pas le contrat B** : un widget n'est pas un bloc de page, son
vocabulaire est fermé mais distinct, et le contrat B figé n'est pas touché. Première publication :
Trusted Publisher OIDC à configurer par l'humain.

### D2 — Des zones standard que tout thème reçoit

| Zone | Rôle |
|---|---|
| `sidebar` | barre latérale des articles, archives et recherche |
| `footer-1` à `footer-4` | colonnes au-dessus du pied de page |
| `content-before` | bandeau en tête de contenu |
| `content-after` | après le contenu d'un article ou d'une page |

Un thème peut en déclarer d'autres (export `widgetAreas` de son module). **Peu importe le thème,
ça s'adapte** : l'hôte résout les widgets, les passe au thème sous forme de modèles de vue déjà
calculés (`PageContent.widgets`, `ChromeInput.widgets`, contrat D `theme@1.6`, additif), et
`@cogenta/theme-kit` fournit le rendu par défaut (`renderWidgetArea`). Un thème qui déclare ses
zones les place lui-même ; un thème qui n'en déclare aucune (thème local, thème généré) les reçoit
placées par l'hôte : bandeaux avant et après le contenu, colonnes au-dessus du pied, barre latérale
empilée après le contenu — jamais une mise en page cassée. Une feuille plancher de poids nul
(`:where()`, jetons du skin uniquement) donne une présentation lisible à un thème qui ne stylise pas.

### D3 — Le vocabulaire, le plus complet possible sans HTML libre

- **Contenu** : texte riche, titre et texte d'appel à l'action, image (légende, lien), galerie,
  vidéo ou intégration, citation, liste de liens, coordonnées (adresse, téléphone, e-mail,
  horaires), présentation (image, titre, texte).
- **Dynamiques** : dernières entrées (collection, nombre, date, chapô, vignette, filtre de terme),
  entrées liées (mêmes termes que l'entrée affichée), les plus lues (statistiques du site),
  termes d'une taxonomie (liste avec compteurs, hiérarchie, ou menu déroulant), nuage de termes,
  archives par mois ou par année, derniers commentaires, recherche, menu, réseaux sociaux,
  formulaire, table des matières de l'entrée affichée, calendrier des publications.
- **Pas de « HTML personnalisé »** : R3 interdit de stocker du HTML. C'est le seul widget
  WordPress volontairement absent ; l'écran le dit.

Les archives par mois ont besoin de pages : l'hôte sert `/archive/:year/:month?` avec le rendu
d'archive du thème (`renderTermArchive`, déjà en contrat D).

### D4 — Visibilité, comme les extensions de visibilité WordPress

Chaque widget : activé ou masqué (conservé), et des règles cumulables :
- **pages** : partout, seulement ou sauf sur — accueil, entrées d'une collection (ou certaines),
  archives d'une taxonomie (ou certains termes), archives par date, recherche, pages d'un slug ;
- **public** : tout le monde, visiteurs non connectés, personnes connectées ;
- **appareils** : bureau, tablette, mobile (attributs rendus, média queries dans la feuille plancher) ;
- **période** : à partir de, jusqu'à ;
- **langues**.

La page est déjà `private, no-store` pour une requête authentifiée : une règle « connectés » ne
fuit donc jamais dans un cache partagé.

### D5 — L'écran « Widgets » dans Apparence

Zones du thème actif, glisser-déposer dans une zone et d'une zone à l'autre (avec boutons nommés
équivalents, jamais seulement au glisser), bibliothèque avec recherche, panneau de réglages par type,
éditeur de visibilité, dupliquer, masquer, supprimer, zone « Widgets inactifs » pour ce qu'un
changement de thème laisse sans zone (rien n'est perdu), aperçu réel dans un iframe. Réservé à
`admin`, journalisé.

### D6 — Tout ce qui existe déjà les connaît

Sauvegarde et restauration, données d'exemple (chaque démo remplit ses zones ; « conserver »
ajoute, « réinitialiser » remplace), les dix thèmes natifs placent les zones dans leur propre mise
en page.

## Ordre de travail

1. `@cogenta/widgets` : types, validation, visibilité, zones, stockage, tests SQLite réels.
2. Contrat D `theme@1.6` : modèles de vue, `renderWidgetArea`, feuille plancher ; doc du contrat.
3. API `/api/widgets` (CRUD, déplacement, réordonnancement, duplication), permissions par rôle.
4. Résolution par l'hôte (contexte de requête, visibilité, données), placement de repli, routes
   d'archives par date, tests de bout en bout.
5. Écran admin Widgets.
6. Magazine puis les neuf autres thèmes : placement natif et styles.
7. Données d'exemple, sauvegarde, import ; vérification réelle en captures.

## État d'avancement

| Étape | État | Notes |
|---|---|---|
| Conception | fait | 2026-09-15 |
| 1. Paquet `@cogenta/widgets` | à faire | |
| 2. Contrat D `theme@1.6` | à faire | |
| 3. API | à faire | |
| 4. Résolution hôte | à faire | |
| 5. Écran admin | à faire | |
| 6. Thèmes | à faire | |
| 7. Données, sauvegarde, vérification | à faire | |
