# 01 — Liste de contenu

> **État** : partiel — la liste marche, on ne peut presque rien y faire.
> **Écran** : `packages/admin/src/routes/collection-list.tsx` (469 lignes)
> **Écran amont** : `packages/admin/src/routes/collections.tsx` (75 lignes)
> **API existante** : `GET /api/content/{collection}`, `GET /api/search`,
> `DELETE /api/content/{collection}/{id}`
> **Effort** : 4–6 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Vérifié dans `collection-list.tsx` :

- Recherche plein texte, soumise explicitement (pas à chaque frappe) et scopée à la
  collection, via `GET /api/search`. Les résultats remplacent la table.
- Filtre par statut (`draft`/`scheduled`/`published`/`archived`).
- Tri sur **deux colonnes seulement** : `id` et `updatedAt`. `SortField` du contrat A
  n'en connaît que trois (`id`, `createdAt`, `updatedAt`) — `publishedAt` est
  nullable et n'en fait volontairement pas partie.
- Pagination par curseur, avec une pile de curseurs pour le bouton « précédent ».
- Sélection par cases à cocher + **une** action groupée : supprimer.
- Export CSV client, qui exporte ce qui est à l'écran (résultats de recherche
  compris) et jamais un refetch non filtré.
- `canPerform` masque le bouton « nouveau » et la colonne de sélection selon le rôle.

Et l'écran amont, `collections.tsx` : un tableau à **une seule colonne**, le nom.
Pas de compte d'entrées, pas de description, pas de bouton « créer » direct.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Compteurs par statut en onglets (`Tous (42) · Publiés (30)`) | ✅ | ✅ | ✅ | ❌ |
| Édition rapide en ligne (titre, slug, statut, date) | ✅ (Quick Edit) | ❌ | ❌ | ❌ |
| Actions groupées autres que supprimer | ✅ (statut, catégorie, auteur) | ✅ (publier/dépublier) | ✅ (Views Bulk Ops) | ❌ |
| Actions par ligne au survol (voir / modifier / dupliquer / corbeille) | ✅ | ✅ | ✅ | ❌ |
| Colonnes configurables + mémorisées | ✅ (Screen Options) | ✅ | ✅ | ❌ |
| Filtre par date, auteur, taxonomie | ✅ | ✅ | ✅ | ❌ (statut seulement) |
| Nombre d'éléments par page | ✅ | ✅ | ✅ | ❌ (fixe) |
| Vue grille / liste | ✅ (médias) | ❌ | ✅ | ❌ |
| Vue liste par collection avec compteur sur l'écran d'accueil | ✅ | ✅ | ✅ | ❌ |

## 3. Écarts, classés

### Bloquants (obligent à sortir de l'écran)

1. **Aucune action par ligne.** Pour mettre une entrée à la corbeille il faut ouvrir
   l'entrée, ou la cocher et utiliser l'action groupée. Pour la dupliquer il faut
   l'ouvrir. Pour la voir en ligne, il faut l'ouvrir puis cliquer « prévisualiser ».
2. **Aucune action groupée utile.** Publier vingt brouillons demande vingt allers-retours.
   Les routes existent déjà (`POST .../publish`, `.../unpublish`, `.../duplicate`,
   `.../untrash`) : c'est purement une lacune d'écran.
3. **Le titre affiché est deviné.** `titleOf()` prend « la première valeur qui est une
   chaîne » — sur une collection dont le premier champ texte est un sous-titre ou un
   code interne, la liste devient illisible. Aucune façon de le corriger.

### Importants

4. Pas de compteurs par statut : impossible de savoir combien de brouillons attendent.
5. Filtres absents : date, auteur, langue, taxonomie. Sur un site à 2 000 articles,
   la recherche plein texte ne remplace pas un filtre par date.
6. Pas de colonne « langue » alors que le site est multilingue — deux traductions du
   même article apparaissent comme deux lignes indiscernables.
7. `updatedAt` est affiché brut (ISO 8601). Illisible.
8. La corbeille n'est pas atteignable depuis la liste de la collection ; il faut
   passer par l'écran global `/trash` et re-sélectionner la collection.
9. La sélection est perdue au changement de page — comportement correct, mais rien
   ne le dit.

### Confort

10. Colonnes non configurables, non mémorisées.
11. Taille de page fixe.
12. Pas de vue grille pour les collections à vignette (produits, portfolio).
13. Export CSV sans choix de colonnes, et pas d'export Excel.

## 4. Plan de développement

### Tâche 1 — Un titre qui n'est plus deviné

**Fichiers** : `packages/schema/src/types.ts` (lecture), `packages/api/src/rest/…`
(sérialisation de `/api/schema`), `packages/admin/src/schema/types.ts`,
`collection-list.tsx`, `trash.tsx`, `global-search.tsx`.

Le contrat A **n'a pas** de notion de « champ titre ». Trois options, par ordre de
préférence :

- **(a)** Utiliser `collection.admin?.titleField` s'il existe déjà dans le bloc `admin`
  du contrat A ; vérifier avant de coder. Si oui : rien à figer, juste à lire.
- **(b)** Sinon, convention déterministe et documentée : premier champ dont le nom est
  `title`, `name` ou `label`, sinon premier champ `text` **déclaré** (pas la première
  valeur trouvée), sinon l'id. `trash.tsx` applique déjà cette logique-là ; la
  factoriser dans `packages/admin/src/schema/title.ts` et l'utiliser partout.
- **(c)** Ajouter `titleField` au bloc `admin` du contrat A → **ADR requise**, contrat A
  figé. À ne faire que si (a) et (b) échouent en pratique.

**Critère** : une collection dont le premier champ texte est `internalCode` affiche
son vrai titre dans la liste, la corbeille et la recherche globale, sans changer le
schéma.

### Tâche 2 — Actions par ligne

**Fichiers** : `collection-list.tsx`, `packages/admin/src/api/content-client.js`
(déjà pourvu : `duplicateEntry`, `publishEntry`, `unpublishEntry`, `deleteEntry`).

Une colonne d'actions, chacune gardée par le `canPerform` correspondant :

| Action | Permission | Appel |
|---|---|---|
| Modifier | `update` | navigation |
| Voir | `read` | `POST .../preview` puis ouverture du lien |
| Dupliquer | `create` | `POST .../duplicate` |
| Publier / Dépublier | `publish` | `POST .../publish` / `.../unpublish` |
| Mettre à la corbeille | `delete` | `DELETE …` |

Après une action, recharger la page courante — jamais deviner le nouvel état
localement (le serveur détient la table de transitions).

**Critère** : mettre un article à la corbeille depuis la liste, sans ouvrir l'entrée,
et le retrouver dans `/trash`.

### Tâche 3 — Actions groupées réelles

**Fichiers** : `collection-list.tsx`.

Ajouter, sur la sélection : publier, dépublier, mettre à la corbeille, dupliquer.
Boucle de `Promise.allSettled` (pas `Promise.all` : un refus sur une ligne ne doit pas
faire perdre le résultat des autres), puis un rapport nommant chaque échec avec son
message serveur. **Une confirmation modale** avant toute action groupée destructive,
nommant le nombre exact de lignes.

**Critère** : sélectionner cinq brouillons dont un que le rôle ne peut pas publier →
quatre passent, le cinquième est nommé avec la raison, rien n'est silencieux.

### Tâche 4 — Compteurs par statut

**Fichiers** : `packages/api/src/rest/router.ts` ou `content-service.ts`,
`collection-list.tsx`.

Le plus honnête est un vrai comptage côté serveur : `GET /api/content/{c}?counts=1`
renvoyant `{ counts: { draft: 12, published: 30, … } }` en plus de la page. Cinq
`SELECT count(*)` groupés, ou un seul `GROUP BY status`. **Ne pas** compter côté
client sur la page courante : le chiffre serait faux dès la deuxième page.

Rendus en onglets filtrants, avec `aria-current` sur l'onglet actif.

**Critère** : le total des onglets égale le nombre réel de lignes en base, corbeille
exclue (cohérent avec ADR-0022 : `deletedAt is null` par défaut).

### Tâche 5 — Filtres avancés

**Fichiers** : `packages/api/src/rest/query.ts` (parsing), `filter.ts`,
`collection-list.tsx`.

Vérifier d'abord ce que `parseListQuery` accepte déjà — le contrat A a un filtre. Puis
exposer dans l'écran : plage de dates (`updatedAt` entre X et Y), langue, et
taxonomie quand la collection déclare un champ `taxonomy`. Les filtres actifs sont
reflétés dans l'URL (`?status=draft&locale=fr`), pour qu'un filtre soit partageable et
que le bouton retour du navigateur fonctionne.

**Critère** : un lien collé dans un chat rouvre exactement la même liste filtrée.

### Tâche 6 — Colonnes, densité, pagination

**Fichiers** : `collection-list.tsx`, nouveau `packages/admin/src/lib/table-prefs.ts`.

- Choix des colonnes parmi les champs déclarés de la collection, mémorisé en
  `localStorage` par collection (jamais côté serveur : c'est une préférence d'écran,
  pas une donnée du site).
- Taille de page : 20 / 50 / 100.
- Dates formatées avec `Intl.DateTimeFormat` dans la langue de l'interface, avec le
  timestamp ISO en `title` pour ne rien perdre.

**Critère** : ajouter une colonne, recharger la page, elle est toujours là.

### Tâche 7 — L'écran d'accueil des collections

**Fichiers** : `collections.tsx`.

Passer d'un tableau à une colonne à une grille de cartes : libellé, description si
le contrat A en porte une, **compteur d'entrées** (réutilise la tâche 4), date de la
dernière modification, et deux boutons — « Voir tout » et « Nouveau » (ce dernier
seulement si `canPerform('create')`).

**Critère** : depuis `/collections`, créer un article en un clic.

## 5. Critères d'acceptation

- Un éditeur publie dix brouillons sans ouvrir une seule entrée.
- Aucune ligne n'affiche un titre qui n'est pas le titre.
- Chaque bouton présent à l'écran correspond à une permission que l'acteur a
  réellement ; aucun ne conduit à un 403.
- Un filtre est partageable par URL.
- L'échec d'une action groupée nomme la ligne et la raison.

## 6. Tests exigés

- Unitaires : résolution du titre (tâche 1) sur cinq formes de collection, y compris
  celle où aucun champ texte n'est déclaré.
- Composant : chaque action de ligne masquée pour le rôle qui ne l'a pas
  (`viewer` ne voit ni publier ni corbeille).
- Composant : action groupée partiellement refusée → rapport listant l'échec.
- Bout en bout (`packages/cli/test/`) : contre un vrai serveur, publier deux entrées
  par action groupée et vérifier en base qu'elles sont `published`.
- Permissions par rôle sur `?counts=1` : un rôle qui ne lit pas les brouillons ne
  doit pas apprendre combien il y en a.

## 7. Pièges connus

- **Le compteur fuit de l'information.** Renvoyer `draft: 12` à un rôle qui ne peut
  pas lire les brouillons révèle leur existence. Le comptage doit passer par la même
  couche de permission que la liste, pas à côté.
- **`Promise.all` sur une action groupée** abandonne les résultats acquis dès le
  premier refus. `allSettled`, toujours.
- **La pile de curseurs** (`cursorStack`) casse si un filtre change sans être remise
  à `[undefined]`. Le code actuel le fait pour le statut et le tri ; tout nouveau
  filtre doit le faire aussi.
- **L'export CSV** exporte la page courante, pas la collection. C'est un choix
  documenté dans le code ; s'il change, le dire à l'écran plutôt que de télécharger
  silencieusement 2 000 lignes.

## 8. Décisions à prendre

- **Champ titre** : trancher entre (a), (b) et (c) de la tâche 1 **avant** de coder.
  (c) impose une ADR et une montée de `schema@2.1`.
- **Comptage** : accepter le coût d'un `GROUP BY status` par chargement de liste, ou
  le mettre en cache. Mesurer avant d'optimiser (règle du projet).
