# 41 — Taxonomies : sous-catégories depuis l'éditeur

> **État** : l'écran Taxonomies dédié gère déjà les sous-catégories correctement —
> le trou est ailleurs, dans la création rapide de terme depuis l'éditeur d'entrée.
> **Fichiers** : `packages/admin/src/fields/taxonomy-field.tsx`,
> `packages/admin/src/api/taxonomy-client.ts`
> **Effort** : 0,5–1 jour
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Contrairement à `docs/plans/08-taxonomies.md` (qui décrit un écran sans édition ni
déplacement — obsolète), `packages/admin/src/routes/taxonomies.tsx` a déjà un vrai
arbre, une modale d'édition et un sélecteur de parent complet :
`packages/admin/src/taxonomies/term-form-modal.tsx` (radio boutons imbriqués,
exclut le terme et ses descendants, refuse les cycles). L'API
(`packages/api/src/rest/taxonomy-router.ts`) supporte `PATCH`, `POST .../move`,
`DELETE ?cascade=`.

**Le trou réel** est dans `packages/admin/src/fields/taxonomy-field.tsx`, fonction
`createQuickTerm` (lignes 108-129) : la création rapide de terme depuis le champ
taxonomie de l'éditeur d'entrée appelle `createTerm(token, taxonomy, { slug,
labels })` **sans jamais transmettre `parent`** — tout terme créé depuis ce
raccourci atterrit forcément à la racine, quelle que soit la catégorie sélectionnée
au moment de la création. C'est très probablement le geste que l'utilisateur a
tenté.

## 2. Diagnostic

Bug ciblé, pas une fonctionnalité à construire : `taxonomy-client.ts::createTerm`
accepte déjà `parent` dans son type d'entrée (le formulaire dédié l'utilise) — il
suffit de le transmettre depuis le raccourci de l'éditeur.

## 3. Plan de développement

### Tâche 1 — Sélecteur de parent dans la création rapide

**Fichiers** : `taxonomy-field.tsx`.

Ajouter au minimum un sélecteur simple (parent = terme actuellement sélectionné
dans le champ au moment du clic « créer »), au mieux un petit sélecteur d'arbre
identique en esprit à celui de la modale dédiée — et le transmettre à `createTerm`.

**Critère** : créer « Local » sous « Actualités » depuis l'éditeur d'article,
sans passer par l'écran Taxonomies.

### Tâche 2 — Vérification du client

**Fichiers** : `taxonomy-client.ts`.

Confirmer que `createTerm` transmet bien `parent` jusqu'à la route (déjà probable
vu son usage par `term-form-modal.tsx`, à vérifier par lecture avant de coder).

## 4. Critères d'acceptation

- Un terme créé depuis l'éditeur d'entrée, sous un parent affiché à l'écran au
  moment de la création, apparaît au bon endroit dans l'arbre.
- Aucune régression sur la création rapide sans parent (racine), comportement
  actuel préservé quand aucun parent n'est en contexte.

## 5. Tests exigés

- Composant : la création rapide avec un parent en contexte envoie bien `parent`
  à l'API.
- Bout en bout : terme créé depuis l'éditeur, retrouvé au bon niveau dans l'écran
  Taxonomies.

## 6. Pièges connus

- Le formulaire de création rapide reste volontairement minimal (pas de doublon du
  sélecteur d'arbre complet) — ne pas sur-construire un second `term-form-modal.tsx`
  dans ce contexte.

## 7. Décisions à prendre

Aucune.
