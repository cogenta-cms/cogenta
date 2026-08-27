# 51 — Cogenta Commerce : catalogue

> **État** : **FAIT — les 6 tâches.** `contentRef` branché des deux côtés (produit →
> contenu et contenu → produit, cross-link dans l'éditeur d'entrée) ; recherche/tri/
> pagination exposés en bout en bout (store → routeur → écran) ; classification par
> taxonomie (`commerce.catalog.write`, décision tranchée — voir § 7) ; seuil de stock
> bas + historique de mouvement append-only ; prix barré/promo + dimensions ; import/
> export CSV avec correspondance de colonnes par nom et prévisualisation obligatoire.
> Tests réels : SQLite (212 tests `@cogenta/commerce`, 18 tests e2e `@cogenta/cli`,
> 10 tests écran admin) ; Postgres/MySQL/MariaDB écrits dans la même suite de contrat
> mais non exécutés cette session (Docker indisponible).
> **Fichiers** : `packages/commerce/src/catalog/{store,types,csv}.ts`,
> `packages/admin/src/routes/commerce-products.tsx`, `packages/commerce/src/admin/router.ts`
> **Effort** : 6–7 jours
> **ADR requise** : non — extensions additives du contrat E (acté, non figé)

---

## 1. Ce qui existe réellement

`catalog/store.ts` (523 lignes) : `Product { id, handle, title, status, contentRef,
createdAt, updatedAt }`, `Variant { id, productId, sku, title, priceMinor,
currency, onHand, allowBackorder, weightGrams, taxCategory, position }`.
`listProducts` **supporte déjà** `search`/`limit`/`offset`/`status` côté store —
l'écran (`commerce-products.tsx`, 671 lignes) n'expose aucun état de
recherche/filtre, et le routeur admin ne transmet que `q`/`status` en query, pas
`limit`/`offset`. Concurrence de stock testée (fichier SQLite réel + contre-test).

Absent du modèle serveur (pas seulement de l'écran) : images, catégories/taxonomie
liée, prix barré/promo, dimensions (seul le poids existe), produits liés/cross-sell,
groupés, téléchargeables, historique de mouvement de stock, seuil d'alerte bas.

## 2. Écarts, classés

**Bloquant** : pas d'images (le `contentRef` existe mais n'est relié à rien dans
l'écran) ; pas de recherche/filtre/pagination en UI malgré le support serveur ; pas
de catégorisation.

**Important** : pas de dimensions, pas de prix barré, pas de seuil stock bas, pas
d'action groupée/import CSV.

**Confort** : historique de stock, produits liés, produits numériques, groupés.

## 3. Plan de développement

**Tâche 1** — Brancher `contentRef` dans `commerce-products.tsx` + `catalog/
store.ts` (déjà présent en type) : afficher lié/absent, bouton créer, lien croisé
dans l'éditeur de contenu. **Critère** : produit + photos + description sans
confusion.

**Tâche 2** — Exposer `search`/`limit`/`offset`/tri côté routeur (`admin/router.ts`)
et écran, réutilisant le composant de pagination de la fiche 67 ; actions groupées
(prix ± %, archivage) avec prévisualisation obligatoire.

**Tâche 3** — `f.taxonomy` (ADR-0022) branché sur le produit — décider si la
permission gouvernante est `commerce.catalog.write` ou `canTerm` (recommandation :
`commerce.catalog.write`, cohérence avec les autres permissions du domaine).

**Tâche 4** — Colonne(s) `low_stock_threshold` sur `variants`, table
`stock_movements` (append-only : qui/quand/combien/pourquoi), filtre « stock bas ».

**Tâche 5** — Colonnes `compareAtPriceMinor`, `widthMm`/`heightMm`/`depthMm` sur
`variants` ; promo avec période.

**Tâche 6** — Import/export CSV avec correspondance de colonnes + prévisualisation.

## 4. Critères d'acceptation

- Un produit affiche ses photos et sa description via `contentRef`.
- La liste des produits est cherchable, filtrable, paginée et triable.
- Un produit peut être classé dans une catégorie de taxonomie.
- Un seuil de stock bas déclenche une alerte visible.

## 5. Tests exigés

- Contrat : `stock_movements` append-only, jamais modifiable après écriture.
- Concurrence : même suite que la fiche d'origine (deux connexions SQLite-fichier),
  étendue au nouveau seuil de stock bas.
- Permissions : action groupée testée par rôle (`commerce.catalog.write`).

## 6. Pièges connus

- Le stock déjà concurrent-safe ne doit pas être recodé — seul le seuil d'alerte et
  l'historique sont nouveaux, la logique d'écriture atomique reste celle déjà
  prouvée.
- Migrations additives sur `variants` (seuil, dimensions, `compareAtPriceMinor`),
  nouvelle table `stock_movements`, éventuel lien `variant_id → taxonomy_term_id` —
  aucune ne casse le modèle existant.

## 7. Décisions à trancher

**Tranchée** : permission gouvernant la catégorisation produit →
**`commerce.catalog.write`**, pas `canTerm`. Catégoriser un produit est un geste de
catalogue au même titre que son prix ou son stock ; réutiliser `canTerm` du contrat A
aurait couplé le routeur commerce à une seconde couche de permissions sans rapport,
pour un seul champ — et `commerce.catalog.write` est déjà la permission de tout le
reste de l'édition catalogue (prix, stock, taxe, livraison). Le lien produit↔terme
passe par une nouvelle table de jointure (`cogenta_commerce_product_terms`), jamais
une clé étrangère vers la table de termes d'une taxonomie — même raisonnement que
`contentRef`, documenté dans `docs/04-contrats.md` § Contrat E.
