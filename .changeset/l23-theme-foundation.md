---
"@cogenta/schema": minor
"@cogenta/api": minor
"@cogenta/cli": minor
"@cogenta/theme-canonical": minor
---

Fiche L23 (le thème unique, enfin réel) — l'infrastructure qui rend un second
thème de site public installable, sans laquelle le reste du lot (les thèmes
eux-mêmes, l'écran de sélection) n'aurait rien à brancher.

**Le vrai verrou, précisément nommé** : `cogenta serve` importait
`@cogenta/theme-canonical` de façon statique dans `theme-render.ts` — `renderPage`
et, plus contraignant encore, le `<header>`/`<footer>` du site étaient
littéralement écrits en dur dans le CLI, aux classes CSS de ce seul thème.
Un second thème ne pouvait donc pas simplement fournir d'autres blocs : il
lui fallait aussi un point d'extension pour sa propre bannière, qui
n'existait pas.

**Nouveau paquet `@cogenta/theme-kit`** : le contrat partagé qu'un thème
implémente (`RenderContext`, l'arbre HTML sans échappatoire `raw()`, le texte
riche, la section de commentaires, les aides d'entrée, `PageContent`, et les
nouveaux types `ChromeInput`/`ChromeResult` du point d'extension) — sorti de
`@cogenta/theme-canonical`, qui portait depuis L3 un commentaire s'excusant
déjà que ce code soit une « maison temporaire ». Une seule copie, revue une
fois, au lieu d'une copie par thème qui aurait fini par diverger — en
particulier `ImageSource`/`ImageOptions` gagnent au passage `kind`/`poster`
(contract D `theme@1.1`, déjà utilisé par `describeMedia` mais jamais exposé
au thème lui-même) : le premier vrai support d'une vidéo en `hero`/
`mediaFigure`, gratuit pour tous les thèmes à la fois. `@cogenta/theme-canonical`
réexporte tout à l'identique — sa propre surface publique ne change pas.

**Le registre de thèmes** (`@cogenta/cli`, `theme-registry.ts`) : une
résolution par nom, mémoïsée, repliant tout nom absent ou inconnu sur
`@cogenta/theme-canonical` plutôt que de refuser de servir (R1/R2).

**Le point d'extension chrome** : `theme.renderChrome(input)` remplace le
gabarit figé — chaque thème dessine désormais son propre en-tête/pied de
page ; `cogenta serve` ne fait plus que résoudre la navigation et la mention
de marque (toujours de sa responsabilité, jamais celle d'un thème) et les
transmet. `@cogenta/theme-canonical` gagne ce `renderChrome`, produisant un
HTML strictement identique à l'ancien gabarit — aucune régression visuelle
pour un site existant.

**Sélection en direct, sans redémarrage** : `cogenta_theme` (la même table
que les réglages d'apparence) gagne une colonne `active_theme`, ajoutée en
place à une table existante (le même geste que `menu-tables.ts` avait déjà
fait pour `location`) — une base déjà provisionnée n'est jamais perdue.
`GET/PUT /api/theme` connaît désormais la liste des thèmes installés et
refuse un nom que cette instance ne sait pas résoudre (`THEME_NOT_FOUND`,
404, nouveau dans la table de statuts). La feuille de style du thème actif
est mémoïsée par nom (`createThemeCssResolver`) : changer de thème depuis
l'écran d'apparence prend effet à la prochaine page vue, exactement la même
promesse que la personnalisation de couleurs tient déjà.

**Vérifié de bout en bout** : le thème canonique sert un document identique
à l'ancien via `renderPageChrome`/`renderEntryPage` (472 tests `@cogenta/cli`,
dont `serve.test.ts`/`serve-builder.test.ts` — la fidélité octet pour octet
du constructeur de page L16 tient toujours), 121/121 `@cogenta/theme-canonical`,
652/652 `@cogenta/schema`, 1052/1052 `@cogenta/api`. `pnpm turbo run typecheck`
et `pnpm turbo run build` : 52/52 et 27/27 tâches, espace de travail entier.

Ce lot n'ajoute encore aucun second thème installable — c'est la matière du
prochain changeset. Sans cette fondation, un second thème n'aurait eu nulle
part où brancher sa propre bannière.
