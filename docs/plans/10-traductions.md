# 10 — Traductions et multilingue

> **État** : partiel — le modèle est bon (ADR-0014), l'écran est un sélecteur.
> **Écrans** : `packages/admin/src/collections/translation-switcher.tsx` (95 lignes),
> `packages/admin/src/i18n/`
> **API existante** : `GET .../translations`, `translationOf`, `resolveLocale`,
> `hreflang` réellement rendu par `cogenta serve`
> **Effort** : 4–5 jours
> **ADR requise** : non — ADR-0014 a tranché le modèle

---

## 1. Ce qui existe réellement

Deux choses distinctes qu'il ne faut pas confondre :

**Le multilingue du contenu** (ADR-0014) : une traduction est une **entrée à part
entière** portant `locale` et `translationOf`, pas un champ dupliqué. Conséquences
réelles et voulues : chaque langue a son propre statut, sa propre publication, sa
propre corbeille, ses propres versions. `GET .../translations` renvoie la famille.
Le rendu produit les `hreflang` de la famille (L10).

**La langue de l'interface** (ADR-0019) : `packages/admin/src/i18n/` avec deux locales
livrées, `fr` et `en`, sélectionnables dans les réglages.

Côté écran, `TranslationSwitcher` fait : lister les traductions existantes, aller à
l'une d'elles, et proposer d'en créer une nouvelle en pré-remplissant les valeurs et
en posant `translationOf`.

## 2. Ce que font les CMS de référence

| Fonction | WPML / Polylang | Drupal 11 | Strapi 5 | Cogenta |
|---|---|---|---|---|
| Entrée par langue | ✅ | ✅ | ✅ | ✅ |
| Statut indépendant par langue | ✅ | ✅ | ✅ | ✅ |
| Bascule de langue dans l'éditeur | ✅ | ✅ | ✅ | ✅ |
| **Vue côte à côte source / cible** | ✅ | ✅ | ❌ | ❌ |
| Tableau de bord de traduction (ce qui manque) | ✅ | ✅ | partiel | ❌ |
| Signaler « la source a changé depuis » | ✅ | ✅ | ❌ | ❌ |
| Traduction assistée par IA | plugin | plugin | ✅ | partiel (panneau) |
| Traduction des taxonomies | ✅ | ✅ | ✅ | modèle ✅, écran ❌ |
| Traduction des menus | ✅ | ✅ | ❌ | ✅ (menu par locale) |
| Traduction des médias (alt) | ✅ | ✅ | ❌ | ❌ |
| Colonne langue dans les listes | ✅ | ✅ | ✅ | ❌ |
| URL par langue (`/fr/…`) | ✅ | ✅ | ✅ | ✅ |

## 3. Écarts, classés

### Importants

1. **Pas de tableau de bord de traduction.** « Quelles pages ne sont pas encore
   traduites en anglais ? » n'a aucune réponse dans l'admin. C'est la question
   quotidienne d'un site bilingue.
2. **Pas de signal d'obsolescence.** Si la version française change après la
   traduction anglaise, rien ne le dit. Le modèle a pourtant tout ce qu'il faut :
   chaque entrée a son `updatedAt` et sa famille est connue.
3. **Pas de colonne langue dans les listes de contenu.** Deux traductions du même
   article apparaissent comme deux lignes indiscernables (voir fiche
   [01](01-liste-de-contenu.md), écart 6).
4. **Le texte alternatif des médias n'est pas traduisible.** Un site bilingue sert le
   même `alt` dans les deux langues — un vrai problème d'accessibilité, pas un détail.
5. **Les libellés de termes ne sont saisissables que dans une langue** (voir fiche
   [08](08-taxonomies.md), écart 3) alors que le modèle les indexe par locale.

### Confort

6. Pas de vue côte à côte.
7. Pas de copie « depuis la version française » sur un champ précis.
8. Deux locales d'interface seulement (`fr`, `en`) — correct pour l'instant, mais la
   mécanique doit accepter une contribution.

## 4. Plan de développement

### Tâche 1 — Tableau de bord de traduction

**Fichiers** : nouvelle route `packages/admin/src/routes/translations.tsx`,
`packages/api/src/rest/router.ts` ou une route dédiée.

Une matrice : lignes = entrées d'une collection, colonnes = locales du site, cellules
= état (absente / brouillon / publiée / **obsolète**). Filtrable par collection et par
locale cible. Un clic sur une cellule vide crée la traduction (le chemin que
`TranslationSwitcher` fait déjà, réutilisé).

Côté serveur : une route qui renvoie, par entrée de la locale par défaut, l'état de
chaque traduction. Une jointure sur `translationOf` — pas N requêtes.

**Critère** : voir en un écran les douze pages qui n'existent pas encore en anglais.

### Tâche 2 — Obsolescence

**Fichiers** : sérialisation de `/translations`, `translation-switcher.tsx`,
tableau de bord de la tâche 1.

Une traduction est **obsolète** quand la source a été modifiée après elle. Deux
définitions possibles :

- **(a)** `source.updatedAt > traduction.updatedAt` — immédiat, sans rien stocker,
  mais bruyant : corriger une virgule dans la source marque tout obsolète.
- **(b)** Mémoriser, sur la traduction, la version de la source dont elle a été tirée,
  puis comparer les numéros de version. Plus juste, mais demande un champ → **ADR**,
  contrat A figé.

Recommandation : livrer **(a)**, formulé honnêtement (« la source a été modifiée
depuis »), et ne passer à (b) que si le bruit devient réellement gênant. Un signal
imparfait mais gratuit bat un signal parfait qui n'existe pas.

**Critère** : modifier la version française d'une page marque sa version anglaise
comme « source modifiée depuis », dans l'éditeur et dans le tableau de bord.

### Tâche 3 — Langue dans les listes et l'éditeur

**Fichiers** : `routes/collection-list.tsx`, `routes/entry-edit.tsx`,
`routes/trash.tsx`.

- Colonne langue, filtre par langue, dans toutes les listes.
- Dans l'éditeur, remonter le sélecteur de traduction dans la barre latérale (fiche
  [02](02-editeur-d-entree.md) tâche 1) plutôt que de le laisser en bas de page.
- Indiquer clairement, sur une traduction, quelle entrée est la source.

### Tâche 4 — Vue côte à côte

**Fichiers** : `routes/entry-edit.tsx`, nouveau
`packages/admin/src/collections/side-by-side.tsx`.

Un mode d'édition qui affiche, à gauche, le champ de la source en lecture seule, à
droite le champ de la traduction. Un bouton « copier depuis la source » par champ.
Uniquement pour les champs texte et texte riche ; les autres restent dans le
formulaire normal.

Interaction avec les panneaux d'assistant IA : le panneau de rédaction sait déjà
traduire (`siteLocales` lui est passé). En vue côte à côte, il devrait proposer
« traduire depuis la source » champ par champ — et, comme partout ailleurs, ne rien
appliquer sans un clic explicite (R6).

### Tâche 5 — Traduire ce qui n'est pas une entrée

**Fichiers** : `packages/admin/src/media/media-detail.tsx`, `routes/taxonomies.tsx`.

- **Médias** : `alt` et la justification décorative par locale. Vérifier le modèle de
  `MediaStore` — s'il ne porte qu'une chaîne, c'est une évolution serveur à chiffrer.
  Le rendu doit alors choisir l'`alt` de la locale de la page, avec repli sur la
  locale par défaut.
- **Termes** : un champ de libellé par locale (fiche [08](08-taxonomies.md) tâche 1),
  le modèle le permet déjà.

## 5. Critères d'acceptation

- On sait, en un écran, ce qui reste à traduire.
- Une traduction dont la source a changé est signalée.
- Chaque liste de contenu montre la langue.
- Une image a un texte alternatif dans chaque langue du site.
- Le `hreflang` rendu reste correct après ces changements (L10 l'a branché — ne pas
  régresser).

## 6. Tests exigés

- Bout en bout : créer une traduction, modifier la source, vérifier le signal
  d'obsolescence.
- Bout en bout : vérifier que les `hreflang` de la famille sont toujours corrects
  après création d'une troisième langue.
- Unitaires : la matrice de traduction sur une famille incomplète (source publiée,
  une traduction en brouillon, une absente).
- Permissions : un rôle qui ne lit pas une locale ne la voit pas dans la matrice.

## 7. Pièges connus

- **Une traduction est une entrée.** Elle a sa corbeille, son statut, ses versions.
  ADR-0022 précise que `delete()` conserve le `translation_of` des traductions,
  exprès. Ne jamais construire un écran qui traite une famille comme un seul objet
  qu'on publierait d'un bloc — ce serait revenir sur ADR-0014.
- **La matrice est un `N × M`.** Sur mille entrées et cinq langues, la construire
  côté client par requêtes successives est un désastre. Une requête serveur, une
  jointure.
- **Le signal d'obsolescence (a) est bruyant.** Le formuler comme un fait (« source
  modifiée le … ») et non comme un verdict (« traduction périmée ») ; sinon on
  apprend à l'ignorer.
- **L'`alt` par locale change une interface publique** (`MediaAsset`). Changement
  cassant pour tout client headless qui le lit — changeset et note de migration.

## 8. Décisions à prendre

- Obsolescence : (a) comparaison d'`updatedAt` — recommandé — ou (b) version de source
  mémorisée (ADR contrat A).
- `alt` multilingue : évolution du `MediaStore`, et repli quand la locale manque.
