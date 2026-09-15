# L29 — Magazine, parfait en usage réel

> Demandé en direct le 2026-09-15 : « Le design des thèmes est noté 5/10, il faut vraiment
> pousser. Commence par magazine : quand on importe, que ce soit parfait ; quand l'IA
> personnalise, que ce soit parfait ; bref, quand on l'utilise, que ce soit parfait. »
> Mode de travail : autonomie. Ce document est la source de vérité de reprise.

## Méthode

Un thème ne se juge plus sur la démo scaffoldée seule, qui était déjà propre. Il se juge sur
les situations d'usage, capturées pour de vrai (`scripts/theme-snapshots.mjs`, bureau et
mobile, clair et sombre) :

1. la démo neuve ;
2. les données d'exemple importées sur un site existant (L28, conserver et réinitialiser) ;
3. une personnalisation par l'IA : trois skins de la forme exacte de ce que produit le
   Theme Creator (`--skin`, nouvelle option du banc) ;
4. le nom de site réel de la personne (« Local Playground ») et son contenu, pas la fiction ;
5. les pages que l'hôte rend et que le thème doit habiller (recherche, formulaires, commentaires).

## Constats du 2026-09-15 (captures réelles)

| # | Situation | Défaut |
|---|---|---|
| C1 | Personnalisation IA | **Les polices choisies par l'IA ne sont jamais chargées.** Le Theme Creator écrit `'Playfair Display', Georgia, serif` dans `font.serif` ; aucune feuille ne l'importe, le navigateur retombe sur Georgia/Times. C'est la cause principale de l'aspect « bas de gamme » d'un thème personnalisé, et elle touche les dix thèmes. |
| C2 | Personnalisation IA | Le générateur de skin ne sait pas quelles familles sont disponibles : il invente des noms, au hasard de ce qu'il connaît. |
| C3 | Recherche | La page `/search` n'est pas habillée par Magazine : titre collé au bord gauche hors grille, résultats réduits à un titre souligné, sans rubrique, date ni chapô. |
| C4 | Article | La colonne de lecture occupe la moitié gauche d'une zone dont l'en-tête est deux fois plus large : un grand vide à droite, une page déséquilibrée. |
| C5 | Page statique | « 2 min read » et lettrine sur la page À propos : ce sont des marques d'article, pas de page. |
| C6 | Accueil | Titres de la colonne de droite cassés court (`text-wrap: balance` sur une mesure trop étroite), lignes creuses. |
| C7 | Mobile | La rangée Opinion déborde en carrousel horizontal sans indice de défilement : on lit une coupure (« GRAHA… »), pas un carrousel. |

## Décisions

- **D1 — Les polices suivent le skin.** `@cogenta/render` porte un catalogue fermé de familles
  Google Fonts vérifiées (URL `css2` testée une par une) ; la feuille du skin importe les
  familles du catalogue qu'elle nomme, et `joinStyles` n'importe pas deux fois une famille que
  le thème charge déjà. Une famille hors catalogue reste permise (pile système, police
  auto-hébergée) et simplement non chargée.
- **D2 — Le générateur de skin reçoit ce catalogue**, par rôle (titrage, texte, interface,
  chasse fixe), et une consigne : choisir dans la liste, toujours finir la pile par un repli
  générique.
- **D3 — La recherche de l'hôte donne à chaque résultat ce qu'une page d'archive donne déjà**
  (rubrique, date, chapô) ; chaque thème l'habille.
- **D4 — Magazine corrige C3 à C7**, vérifié sur les cinq situations de la méthode.

## État d'avancement

| Étape | État | Notes |
|---|---|---|
| Captures de référence et constats | fait | 2026-09-15 |
| D1 polices du skin | à faire | |
| D2 catalogue dans le générateur | à faire | |
| D3 recherche enrichie | à faire | |
| D4 Magazine | à faire | |
| Vérification des cinq situations | à faire | |
