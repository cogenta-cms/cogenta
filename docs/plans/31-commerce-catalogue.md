# 31 — Commerce : catalogue

> **État** : partiel — produits, variantes, prix, stock. Il manque tout ce qui rend un
> catalogue vendeur.
> **Écran** : `packages/admin/src/routes/commerce-products.tsx` (643 lignes)
> **Paquet** : `@cogenta/commerce` (contrat E, ADR-0024)
> **API existante** : `/api/commerce/products`, `/products/{id}/variants`,
> `/variants/{id}`, `/variants/{id}/stock`
> **Effort** : 5–6 jours
> **ADR requise** : non — ADR-0024 a défini le modèle

---

## 1. Ce qui existe réellement

Le modèle est bien posé et il faut le connaître :

- **Contrat E séparé** (ADR-0024) : une commande n'est pas un contenu. Trois décisions
  du contrat A le rendaient impossible — ADR-0014 forkerait une commande par langue,
  ADR-0022 la rendrait restaurable depuis la corbeille, et un brouillon de vente
  n'existe pas.
- **La fiche produit, elle, reste du contrat A** via un `contentRef` optionnel dans les
  deux sens. Le catalogue garde donc texte riche, blocs, SEO, traductions et
  publication programmée sans les réimplémenter. C'est la meilleure idée du lot.
- **Argent toujours en entier d'unité mineure**, taux en points de base — parce que
  SQLite n'a que `REAL` et qu'une colonne décimale ne voudrait pas dire la même chose
  sur les trois moteurs (ADR-0006).
- **Test de concurrence réel** sur le stock : fichier SQLite, deux connexions, vingt
  acheteurs simultanés de cinq unités en obtiennent exactement cinq — avec un
  contre-test qui prouve que la version naïve survend.
- Écran : liste, création, édition, variantes avec SKU / prix / stock / réapprovisionnement.

## 2. Ce que font les CMS de référence

| Fonction | WooCommerce | Shopify | Cogenta |
|---|---|---|---|
| Produit, variantes, SKU, prix, stock | ✅ | ✅ | ✅ |
| **Images produit** | ✅ | ✅ | ❌ |
| **Catégories / collections de produits** | ✅ | ✅ | ❌ (taxonomies non branchées) |
| Prix barré / promotion | ✅ | ✅ | ❌ |
| Poids et dimensions (pour le port) | ✅ | ✅ | ❌ |
| Produits liés / ventes croisées | ✅ | ✅ | ❌ |
| Import / export CSV du catalogue | ✅ | ✅ | ❌ |
| Modification groupée des prix | ✅ | ✅ | ❌ |
| Alerte de stock bas | ✅ | ✅ | ❌ |
| Historique des mouvements de stock | plugin | ✅ | ❌ |
| Produits numériques / téléchargeables | ✅ | ✅ | ❌ |
| Aperçu de la fiche publique | ✅ | ✅ | ❌ |
| Recherche et filtres | ✅ | ✅ | ❌ |

## 3. Écarts, classés

### Bloquants

1. **Pas d'images.** Un catalogue sans photo n'est pas un catalogue. Le `contentRef`
   vers une entrée du contrat A est censé porter cette partie — mais l'écran ne le
   relie à rien : rien ne dit à l'utilisateur qu'il doit créer une entrée éditoriale à
   côté, et rien ne l'y aide.
2. **Le `contentRef` n'est pas exploité par l'écran.** C'est le cœur de la décision
   d'ADR-0024, et il est invisible. On ne peut ni créer la fiche éditoriale depuis le
   produit, ni voir si elle existe, ni l'ouvrir.
3. **Pas de recherche, pas de filtre, pas de pagination.** Même limite que partout
   ailleurs, sur un écran qui atteindra plusieurs milliers de lignes.

### Importants

4. Pas de catégorisation. Les taxonomies d'ADR-0022 existent et conviendraient
   exactement — elles ne sont pas branchées sur le commerce.
5. Pas de poids ni de dimensions, alors que le calcul du port en a besoin (fiche
   [34](34-commerce-reglages-boutique.md)).
6. Pas de promotion sur un produit (le coupon existe, la remise produit non).
7. Pas d'alerte de stock bas.
8. Pas de modification groupée ni d'import CSV : changer 500 prix est impossible.

### Confort

9. Historique des mouvements de stock.
10. Produits liés.
11. Produits numériques.

## 4. Plan de développement

### Tâche 1 — Relier le produit à sa fiche éditoriale

**Fichiers** : `routes/commerce-products.tsx`, `packages/commerce/src/catalog/`.

C'est la tâche la plus rentable, parce qu'elle active une décision déjà prise.

- Afficher l'état du `contentRef` : lié / absent, avec le titre et un lien vers
  l'éditeur.
- Bouton « créer la fiche » qui crée une entrée dans la collection de contenu produit,
  pré-remplie avec le titre, et pose le lien dans les deux sens.
- Dans l'éditeur de contenu, montrer le produit lié et ses prix.
- Images, description riche, SEO : **rien à construire**, ils viennent de la fiche
  éditoriale. Il suffit de la rendre atteignable.

**Critère** : créer un produit avec sa fiche, ses photos et sa description, sans jamais
se demander où va quoi.

### Tâche 2 — Recherche, filtres, pagination, actions groupées

**Fichiers** : `packages/commerce/src/admin/router.ts`,
`routes/commerce-products.tsx`.

Recherche par titre, SKU et `handle` ; filtres par statut, catégorie, stock ; tri ;
pagination. Actions groupées : archiver, activer, modifier les prix en pourcentage ou
en montant. Toute modification groupée de prix passe par une **prévisualisation**
avant application — c'est de l'argent.

### Tâche 3 — Catégorisation par les taxonomies

**Fichiers** : `packages/commerce/src/catalog/`, écran.

Réutiliser les taxonomies d'ADR-0022 (arbre en chemin matérialisé, une table par
taxonomie) plutôt que d'inventer des catégories de produits. Le champ `f.taxonomy`
existe ; c'est un travail de branchement, pas de modélisation.

Vigilance permission : les taxonomies utilisent le vocabulaire du contrat A
(`canTerm`), le commerce le sien (`commerce.catalog.write`). Décider explicitement
laquelle gouverne la classification d'un produit — recommandation : le commerce, parce
que c'est le produit qu'on classe.

### Tâche 4 — Stock : seuils, historique, alertes

**Fichiers** : `packages/commerce/src/catalog/`, écran, fiche
[38](38-notifications-et-notices.md).

- Seuil d'alerte par variante, indicateur visuel, filtre « stock bas ».
- Historique des mouvements : qui, quand, combien, pourquoi (vente, retour, correction
  manuelle, réception). Append-only, comme l'historique des commandes.
- Notice et alerte de canal en rupture ou sous le seuil.

**Le test de concurrence existant doit être rejoué** après toute modification du chemin
d'écriture du stock — avec son contre-test, qui est ce qui donne sa valeur au vert.

### Tâche 5 — Attributs physiques et promotions

**Fichiers** : `packages/commerce/src/catalog/`, écran.

- Poids et dimensions par variante, consommés par le calcul du port.
- Prix barré (`compareAtPriceMinor`) et prix promotionnel avec période — en entier
  d'unité mineure, comme tout le reste, sans exception.

### Tâche 6 — Import / export CSV

**Fichiers** : `packages/commerce/src/`, écran.

Import avec correspondance de colonnes et **prévisualisation** (même motif que la
fiche [25](25-import.md)), export du catalogue. C'est le seul chemin praticable pour
migrer depuis WooCommerce ou Shopify, et donc la condition d'adoption.

## 5. Critères d'acceptation

- Un produit a des photos et une description, par sa fiche éditoriale, sans que
  l'utilisateur ait à comprendre le mécanisme.
- Un catalogue de cinq mille références reste utilisable.
- Aucun montant n'est jamais manipulé en nombre à virgule flottante.
- Une modification groupée de prix est prévisualisée avant application.
- Le test de concurrence du stock reste vert, avec son contre-test.
- Chaque route respecte le vocabulaire de permissions du contrat E.

## 6. Tests exigés

- Bout en bout : produit + fiche éditoriale liés dans les deux sens, publiés,
  vérifiés sur la page publique.
- Concurrence : rejouer la suite existante (fichier SQLite réel, deux connexions,
  contre-test naïf).
- Unitaires : arithmétique des promotions en unité mineure, aux bornes.
- Unitaires : import CSV (guillemets, décimales, devises).
- Permissions par rôle sur chaque route, avec le vocabulaire du contrat E — `editor`
  a `commerce.catalog.write` mais **pas** `commerce.order.refund`.
- Intégration trois bases — **jamais exécutée** pour le commerce (Docker
  indisponible, `BLOCKERS.md`).

## 7. Pièges connus

- **`:memory:` donne deux bases sans rapport.** Le test de concurrence utilise un
  fichier, exprès. Ne pas « simplifier ».
- **Aucun montant en flottant, jamais.** ADR-0006 et le choix de l'unité mineure.
- **Le `contentRef` va dans les deux sens.** Un produit supprimé et une entrée à la
  corbeille sont deux choses différentes : ADR-0022 ne s'applique qu'au contrat A.
  Décider ce qu'un produit archivé fait à sa fiche (recommandation : rien, et le
  signaler).
- **Les permissions commerce ne sont pas celles du contenu.** Six permissions,
  volontairement grossières. Ne pas les fondre dans les cinq actions du contrat A.
- **Une modification groupée de prix est irréversible sans historique.** Prévisualiser,
  et journaliser.
- **Les intégrations trois bases du commerce n'ont jamais tourné.** Toute tâche qui
  touche le SQL doit les faire tourner, sous peine de découvrir le problème en
  production.

## 8. Décisions à prendre

- Classification des produits : taxonomies du contrat A (recommandé) ou catégories
  propres au contrat E.
- Produit archivé : que devient sa fiche éditoriale.
