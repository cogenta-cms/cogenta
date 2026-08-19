# 07 — Corbeille

> **État** : minimal — le modèle serveur est excellent, l'écran est une table nue.
> **Écran** : `packages/admin/src/routes/trash.tsx` (217 lignes)
> **API existante** : `?trashed=only`, `POST .../untrash`, `POST .../purge`,
> `purgeExpired()`
> **Effort** : 2–3 jours
> **ADR requise** : non — ADR-0022 a déjà tout tranché

---

## 1. Ce qui existe réellement

Le modèle serveur (ADR-0022, `schema@2.0`) est solide et il faut le connaître avant
de toucher l'écran :

- `deletedAt` est **orthogonal à `status`**. Une entrée publiée mise à la corbeille
  reste `published`, et `untrash()` la rend telle quelle.
- `delete()` ne détruit **rien** : versions, blocs, lignes de jointure et le
  `translation_of` des traductions restent en place. C'est la seule façon dont
  `untrash()` peut rendre exactement ce qui a été pris.
- `purge()` est le seul vrai `DELETE`. `purgeExpired()` balaie ce qui a dépassé
  `trash.retainDays` (30 par défaut).
- Toute lecture filtre `deletedAt is null` par défaut ; `trashed: 'include'|'only'`
  est l'opt-in.
- `restrict` est réimplémenté en code applicatif, avec un message qui **nomme** ce qui
  bloque.

L'écran, lui : un `<select>` de collection, une table de quatre colonnes, deux boutons
par ligne (restaurer, purger), et un `globalThis.confirm()` avant la purge.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Cogenta |
|---|---|---|---|
| Corbeille par type de contenu | ✅ | ✅ (module) | ✅ |
| **Toutes collections d'un coup** | ✅ | ✅ | ❌ |
| Restauration groupée | ✅ | ✅ | ❌ |
| « Vider la corbeille » | ✅ | ✅ | ❌ |
| Date de suppression lisible + délai restant | ✅ | ✅ | ❌ (ISO brut) |
| **Qui a supprimé** | ❌ | ✅ | ❌ |
| Recherche dans la corbeille | ✅ | ✅ | ❌ |
| Pagination | ✅ | ✅ | ❌ (limite 50 en dur) |
| Purge automatique visible / configurable | ✅ (30 j) | ✅ | serveur seulement |
| Message clair quand la restauration est bloquée | partiel | ✅ | ✅ (serveur) |

## 3. Écarts, classés

### Importants

1. **Une collection à la fois.** « Qu'est-ce qui a été supprimé cette semaine ? » n'a
   pas de réponse : il faut passer les collections une par une.
2. **Aucune action groupée**, ni restauration ni purge. Vider une corbeille de deux
   cents entrées, c'est deux cents clics et deux cents `confirm()`.
3. **`limit: 50` en dur, sans pagination.** Au-delà, le reste est simplement
   invisible — et rien ne le dit.
4. **Le délai avant purge automatique n'est pas montré.** `trash.retainDays` vaut 30
   par défaut : l'écran doit dire « purgée automatiquement dans 12 jours », sinon
   personne ne sait que la corbeille se vide toute seule.
5. **`deletedAt` est affiché brut**, et il n'y a pas de « qui ».

### Confort

6. Pas de recherche.
7. Pas de tri.
8. `globalThis.confirm()` plutôt que la modale du design system — incohérent avec le
   reste de l'admin, et non stylable.

## 4. Plan de développement

### Tâche 1 — Vue toutes collections

**Fichiers** : `routes/trash.tsx`.

Remplacer le `<select>` exclusif par : un onglet « Tout » (par défaut) plus un onglet
par collection avec son compteur. « Tout » lance un `listEntries(…, { trashed: 'only' })`
par collection éligible, en parallèle, et fusionne en triant par `deletedAt`
décroissant. Une colonne « collection » apparaît alors.

Attention : la fusion côté client casse la pagination par curseur. Deux options —
limiter « Tout » aux N plus récents en le disant clairement, ou ajouter une route
serveur `GET /api/trash` qui fait l'union. La seconde est plus propre ; la première
est livrable tout de suite. Commencer par la première, avec le message honnête.

**Critère** : voir en un écran tout ce qui a été supprimé, toutes collections
confondues, trié par date.

### Tâche 2 — Actions groupées et « vider »

**Fichiers** : `routes/trash.tsx`.

- Cases à cocher, « tout sélectionner sur cette page ».
- « Restaurer la sélection » : `Promise.allSettled`, rapport nommant chaque échec
  avec son message serveur — et c'est précisément là que le message de `restrict`
  d'ADR-0022 devient précieux, parce qu'il nomme ce qui bloque.
- « Supprimer définitivement la sélection » : modale du design system, nommant le
  nombre exact et rappelant que c'est irréversible. Saisie du mot de confirmation
  au-delà de dix éléments.
- « Vider la corbeille de cette collection » : même modale, avec le compte total.

**Critère** : restaurer quinze entrées d'un coup, dont une bloquée par une relation
`restrict` — quatorze passent, la quinzième est nommée avec la phrase du serveur.

### Tâche 3 — Dates, délais, auteur

**Fichiers** : `routes/trash.tsx`, `packages/api/src/content/serialise.ts` si le
« qui » manque, `packages/api` pour exposer `trash.retainDays`.

- `deletedAt` en date relative (« il y a 3 jours ») avec l'ISO en `title`.
- Colonne « purge automatique dans N jours », calculée depuis `retainDays`. Il faut
  donc que l'admin connaisse cette valeur : l'exposer dans `/api/schema` par
  collection (elle y est déjà déclarée : `collection.trash !== false` est déjà lu par
  cet écran) ou dans l'état d'exploitation.
- Colonne « supprimée par », si `deletedBy` existe côté store. S'il n'existe pas, ne
  pas l'inventer : le journal d'audit porte l'information et un lien vers l'entrée
  d'audit correspondante est une réponse honnête.

**Critère** : l'écran dit combien de jours il reste avant la disparition définitive.

### Tâche 4 — Pagination, recherche, tri

**Fichiers** : `routes/trash.tsx`.

Réutiliser la mécanique de pile de curseurs de `collection-list.tsx` plutôt que d'en
écrire une deuxième. Recherche par titre côté client sur la page courante, en le
disant (une recherche serveur dans la corbeille demanderait que
`withSearchIndexing` indexe le supprimé — ce qu'il ne fait probablement pas, à
vérifier avant de promettre autre chose).

### Tâche 5 — Purge automatique visible

**Fichiers** : `routes/trash.tsx`, fiche [28](28-taches-planifiees.md).

Un bandeau : « La corbeille se vide automatiquement après 30 jours. Dernier balayage :
il y a 4 heures. » `purgeExpired()` existe ; il faut savoir s'il est réellement
planifié par `cogenta serve` — si non, c'est un vrai constat à remonter, pas un détail
d'affichage.

## 5. Critères d'acceptation

- Une entrée publiée restaurée redevient publiée (ADR-0022) — vérifié par test, pas
  supposé.
- On voit tout ce qui a été supprimé sans changer de collection.
- Une restauration bloquée nomme ce qui bloque.
- Rien n'est purgé sans une confirmation qui dit le nombre exact.
- L'écran dit quand la purge automatique aura lieu.
- Un rôle sans `delete` ne voit aucune de ces collections (comportement actuel, à ne
  pas régresser).

## 6. Tests exigés

- Bout en bout : mettre à la corbeille une entrée **publiée**, la restaurer, vérifier
  `status === 'published'` et `deletedAt === null`.
- Bout en bout : restauration groupée partiellement refusée par `restrict`.
- Bout en bout : `purge` détruit vraiment (relire → 404).
- Composant : la modale de purge affiche le nombre exact.
- Permissions par rôle : `viewer` ne voit pas l'écran ; `editor` sans `delete` sur une
  collection ne voit pas cette collection.

## 7. Pièges connus

- **Ne jamais traiter la corbeille comme un statut.** C'est l'erreur qu'ADR-0022 a
  explicitement évitée. Un filtre « corbeille » dans le `<select>` de statut de la
  liste de contenu serait une régression de modèle, pas une commodité.
- **La restauration groupée peut échouer partiellement** — c'est normal et attendu
  (`restrict`). Le rapport est la fonctionnalité, pas un cas d'erreur.
- **`limit: 50` en dur** doit disparaître au profit d'une vraie pagination, sinon la
  vue « Tout » de la tâche 1 hérite du même mensonge silencieux, multiplié par le
  nombre de collections.
- **`purgeExpired()` est destructif et automatique.** Avant d'en faire la publicité à
  l'écran, vérifier qu'il tourne vraiment — annoncer une purge qui n'a pas lieu est
  pire que le silence.
- **`siblings` de `createContentStore` est optionnelle** (pragmatisme documenté
  d'ADR-0022) : sans elle, seules les auto-références sont vues par le contrôle
  `restrict`. `cogenta serve` passe l'ensemble complet — un test qui monterait un
  store sans `siblings` obtiendrait un comportement différent et ce n'est pas un bug.

## 8. Décisions à prendre

- Vue « Tout » : fusion client bornée (rapide) ou route `GET /api/trash` (propre).
- « Supprimée par » : nouveau champ store, ou lien vers le journal d'audit
  (recommandé — aucun contrat touché).
