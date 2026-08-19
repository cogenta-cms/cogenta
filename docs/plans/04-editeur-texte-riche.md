# 04 — Éditeur de texte riche

> **État** : partiel — fonctionne, mais moins riche qu'un champ de commentaire.
> **Écrans** : `packages/admin/src/rich-text/` (7 fichiers),
> `packages/admin/src/fields/rich-text-field.tsx`
> **Format** : portable-text (`rich-text/portable-text.ts`), rendu par le bloc `prose`
> du contrat B
> **Effort** : 6–8 jours
> **ADR requise** : oui si le format portable-text doit accueillir de nouveaux types
> de nœud (tableau, image inline)

---

## 1. Ce qui existe réellement

Basé sur Slate (`slate`, `slate-react` — déjà des dépendances), avec conversion vers
et depuis le portable-text (`convert.ts`, `portable-text.ts`).

La barre d'outils (`toolbar.tsx`, 113 lignes) offre exactement :

- **Marques** : `strong`, `em`, `code`. Trois.
- **Blocs** : `paragraph`, `h2`, `h3`, `h4`, `blockquote`, `bullet`, `number`. Sept.
- **Liens** : insérer (saisie d'URL en ligne, `Entrée` valide, `Échap` annule) et
  retirer.

Et rien d'autre. Pas de titre de niveau 1 (choix probablement volontaire : le `h1`
est le titre de la page), pas de barré, pas de souligné, pas d'exposant, pas de
surlignage, pas d'alignement, pas de trait horizontal, pas de bloc de code, pas de
tableau, pas d'image dans le corps du texte, pas d'annuler/rétablir dédié, pas de
commande slash, pas de collage Markdown, pas de vue source.

## 2. Ce que font les CMS de référence

| Fonction | WordPress (Gutenberg) | Strapi 5 | Sanity | Cogenta |
|---|---|---|---|---|
| Gras / italique / code | ✅ | ✅ | ✅ | ✅ |
| Barré, souligné, exposant/indice | ✅ | ✅ | ✅ | ❌ |
| Surlignage, couleur de texte | ✅ | ❌ | ✅ | ❌ |
| Titres h2–h6 | ✅ | ✅ | ✅ | h2–h4 |
| Listes imbriquées | ✅ | ✅ | ✅ | ? à vérifier |
| Bloc de code avec langage | ✅ | ✅ | ✅ | ❌ |
| Tableau | ✅ | ✅ | ✅ | ❌ |
| Image dans le corps du texte | ✅ | ✅ | ✅ | ❌ |
| Lien **vers une entrée interne** (pas une URL) | ✅ | ❌ | ✅ | ❌ |
| Trait horizontal | ✅ | ✅ | ✅ | ❌ |
| Annuler/rétablir dans la barre | ✅ | ✅ | ✅ | ❌ |
| Commandes slash (`/`) | ✅ | ❌ | ✅ | ❌ |
| Collage Markdown / HTML propre | ✅ | ✅ | ✅ | ? |
| Plein écran / mode sans distraction | ✅ | ❌ | ✅ | ❌ |
| Compteur de mots | ✅ | ❌ | ✅ | ❌ |

## 3. Écarts, classés

### Bloquants

1. **Pas d'image dans le corps du texte.** C'est la demande éditoriale numéro un
   d'un CMS. Aujourd'hui, une image ne peut être qu'un bloc du contrat B placé
   *entre* deux blocs `prose` — ce qui est faisable, mais empêche d'illustrer un
   paragraphe précis et complique tout article long.
2. **Pas de collage propre.** Coller depuis Word ou une page web, sans traitement
   explicite, produit soit du texte brut (perte de structure), soit du bruit. À
   vérifier dans `rich-text-editor.tsx` : c'est le premier réflexe de tout rédacteur.

### Importants

3. Pas de tableau — attendu dès qu'il y a des tarifs, des horaires, une comparaison.
4. Pas de lien interne. Coller l'URL d'une page du site à la main casse au premier
   changement de slug ; un lien vers un id d'entrée survivrait au renommage, et la
   table de redirections ne compense qu'après coup.
5. Pas de bloc de code (pour un CMS dont le public inclut des développeurs).
6. Pas de barré ni de surlignage (relecture, corrections).
7. Pas d'annuler/rétablir visible : `Ctrl+Z` marche sans doute via Slate, mais rien
   ne le montre et il n'y a pas de bouton.

### Confort

8. Commandes slash.
9. Plein écran.
10. Compteur de mots et de caractères.
11. Alignement de paragraphe.

## 4. Plan de développement

### Tâche 0 — Décider ce que le portable-text a le droit de porter

**À faire avant toute ligne de code.** Le portable-text de ce projet est un format
stocké, et R3 dit qu'un bloc ne stocke jamais de HTML. Trois questions à trancher, et
la réponse détermine si une ADR est nécessaire :

1. Une image inline est-elle un **nœud du portable-text** (référence d'asset dans le
   flux) ou un **bloc frère** du contrat B ? Si c'est un nœud, le format évolue.
2. Un tableau est-il un nœud, ou un bloc `table` du contrat B ? Le contrat B est figé
   : ajouter un bloc exige une RFC (`AGENTS.md`). Un nœud portable-text, lui, reste
   dans le champ `richText`.
3. Un lien interne est-il un `mark` avec `entryId` au lieu de `href` ?

Recommandation, à valider : **image et lien interne comme nœuds/marques du
portable-text** (ils appartiennent au flux du texte, pas à la mise en page de la
page) ; **tableau comme bloc du contrat B** (c'est une structure de page, elle a
besoin d'une largeur, d'un en-tête, d'un défilement propre — exactement ce qu'un bloc
sait déclarer). Cette répartition évite d'ouvrir les deux contrats à la fois.

**Livrable** : une ADR décrivant le portable-text de Cogenta et ce qu'il accepte,
avec la note de migration correspondante — parce que le renderer (`@cogenta/render`,
`@cogenta/theme-canonical`) devra savoir rendre les nouveaux nœuds.

### Tâche 1 — Marques et blocs manquants

**Fichiers** : `rich-text/commands.ts`, `rich-text/toolbar.tsx`,
`rich-text/portable-text.ts`, `rich-text/slate-types.ts`, et le renderer côté
`@cogenta/render`/`@cogenta/theme-canonical`.

Ajouter : barré (`del`), surlignage (`mark`), exposant/indice si le format les
accepte, trait horizontal, bloc de code avec langage. Chaque ajout est **inutile tant
que le renderer ne sait pas le rendre** : faire les deux dans la même tâche, avec le
snapshot de rendu mis à jour dans le même commit.

Réorganiser la barre en groupes (texte / paragraphe / insertion) avec séparateurs, et
des icônes plutôt que des libellés textuels — la barre actuelle est une rangée de
boutons-mots.

**Critère** : chaque nouvelle marque apparaît dans le HTML produit par le vrai
renderer, vérifié par snapshot, pas seulement dans l'éditeur.

### Tâche 2 — Le lien interne

**Fichiers** : `rich-text/commands.ts`, `rich-text/toolbar.tsx`, réutilisation de
`EntryPicker` (fiche [03](03-champs-de-formulaire.md) tâche 1).

Le bouton « lien » ouvre deux onglets : URL externe (l'existant) et entrée interne
(le sélecteur). Un lien interne stocke `{ entryId, collection }` et **jamais** une
URL. Le renderer résout l'URL au moment du rendu, par le même `buildPath` que le
reste, en tenant compte de la locale de la page.

Cas à traiter explicitement : l'entrée liée est un brouillon (avertir dans
l'éditeur), l'entrée liée est à la corbeille (avertir, et le renderer doit décider —
lien mort ou texte simple ; recommander : texte simple, jamais un 404).

**Critère** : renommer le slug d'une page ne casse aucun lien interne pointant vers
elle.

### Tâche 3 — Image dans le texte

**Fichiers** : selon la décision de la tâche 0 ; réutilisation de `MediaPicker`
(fiche [03](03-champs-de-formulaire.md) tâche 3).

Insertion via la barre d'outils **et** via glisser-déposer d'un fichier dans
l'éditeur (téléversement immédiat, en réutilisant `UploadForm` — donc la règle
d'alternative textuelle obligatoire s'applique de la même manière, sans être
recodée). Légende facultative, alignement, largeur. Le rendu passe par `/_image` avec
`srcset`, comme les images de bloc — jamais une balise `<img>` bricolée.

**Critère** : déposer une photo au milieu d'un paragraphe, publier, et voir dans le
HTML servi un `srcset` réel et un `alt` non vide.

### Tâche 4 — Collage, annuler/rétablir, confort

**Fichiers** : `rich-text/rich-text-editor.tsx`, `with-inlines.ts`.

- **Collage** : normaliser le HTML collé vers le portable-text (titres, listes, gras,
  italique, liens conservés ; tout le reste aplati). Le Markdown collé est converti.
  Un test avec du HTML réel de Word et de Google Docs — pas un fragment inventé.
- **Annuler / rétablir** dans la barre, avec l'état désactivé quand il n'y a rien à
  faire.
- **Compteur** de mots et de caractères sous l'éditeur.
- **Plein écran** (une classe CSS, pas une bibliothèque).

**Critère** : coller trois paragraphes depuis Google Docs conserve les titres et les
liens, et n'introduit aucun style en ligne (R3).

### Tâche 5 — Commandes slash

**Fichiers** : `rich-text/` (nouveau `slash-menu.tsx`).

Taper `/` en début de ligne ouvre un menu filtrable des insertions disponibles
(titre, liste, citation, code, image, tableau, trait). Navigation aux flèches,
`Entrée` insère, `Échap` ferme. Recherche insensible à la casse **et aux accents** —
le builder de L16 le fait déjà pour son panneau d'insertion, réutiliser sa
normalisation plutôt que d'en écrire une deuxième.

**Critère** : insérer une citation sans toucher la souris.

## 5. Critères d'acceptation

- Tout ce que l'éditeur permet de saisir est réellement rendu par le thème — vérifié
  par snapshot, jamais supposé.
- Aucun HTML ni CSS n'entre dans la valeur stockée (R3).
- Un lien interne survit au renommage du slug de sa cible.
- Un collage depuis un traitement de texte conserve la structure et rien d'autre.
- L'éditeur reste entièrement opérable au clavier, barre d'outils comprise.

## 6. Tests exigés

- Unitaires sur `convert.ts` : aller-retour Slate ↔ portable-text pour chaque nouveau
  nœud, sans perte.
- Unitaires sur le collage, avec du HTML réel extrait de Word et de Google Docs.
- Snapshot de rendu côté `@cogenta/theme-canonical` pour chaque nouveau nœud.
- Composant : le sélecteur d'entrée du lien interne signale un brouillon.
- Accessibilité : `role="toolbar"` correct, navigation aux flèches, `aria-pressed`
  sur les bascules (déjà en place pour l'existant — ne pas régresser).

## 7. Pièges connus

- **Ajouter à l'éditeur sans ajouter au renderer** produit du contenu qui disparaît à
  la publication. C'est le piège numéro un ; d'où la règle « même tâche, même
  commit ».
- **Le portable-text est un format stocké.** Tout nœud nouveau doit être ignoré
  proprement par un renderer plus ancien, pas le faire planter.
- **Slate normalise agressivement.** Un nœud personnalisé mal déclaré dans
  `slate-types.ts` est silencieusement supprimé au premier rendu ; le test
  d'aller-retour est le seul filet.
- **R3 est facile à violer sans le voir** : un « surlignage » implémenté comme un
  attribut `style` est du CSS stocké. Ce doit être une marque sémantique que le thème
  interprète.
- **Le tableau est un piège de périmètre.** Un vrai éditeur de tableau (fusion,
  en-têtes, redimensionnement) est un projet à lui seul. Commencer par un tableau
  simple : en-tête optionnel, ajout/suppression de ligne et de colonne, rien de plus.
- **R9** : aucune bibliothèque d'éditeur supplémentaire. Slate est déjà là ; on
  n'ajoute ni TipTap, ni Lexical, ni ProseMirror.

## 8. Décisions à prendre

- **ADR sur le portable-text** (tâche 0) : ce que le format accepte, et la
  répartition nœud portable-text / bloc contrat B. C'est le blocage à lever en
  premier.
- **Tableau** : RFC contrat B si on en fait un bloc.
