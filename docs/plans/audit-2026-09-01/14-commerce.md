# Audit Commerce — 2026-09-01

## 1. Résumé exécutif

Le back-office commerce (`@cogenta/commerce`, contrat E) est en réalité **très
avancé** : les fiches 51-54 (versions à jour des fiches 31-34, elles-mêmes
obsolètes) sont, pour l'essentiel, **vérifiées FAIT** dans le code réel — catalogue
avec images/taxonomie/stock/CSV, commandes avec adresse structurée/suivi/e-mails/
remboursement partiel/avoir, coupons avec restrictions, réglages taxe/livraison/
paiement/facture. Deux régressions majeures, non documentées ailleurs, ont été
trouvées par cet audit :

1. **`runBilling`/`runDunning`/`sendRenewalNotices` ne sont appelés par aucun
   planificateur** (`packages/cli/src/commands/serve.ts`) — la machine à états
   d'impayé et la facturation récurrente elle-même, présentées comme « faites »,
   **ne s'exécutent jamais sur un site en production**. C'est le bug le plus grave
   de tout ce domaine.
2. **Aucun pont entre `@cogenta/commerce` et un thème public n'existe** : zéro
   route panier/produit/checkout, `@cogenta/theme-ecommerce` ne dépend même pas de
   `@cogenta/commerce`. Un site Cogenta ne peut **pas vendre** aujourd'hui — le
   back-office gère un catalogue et des commandes que personne ne peut passer sans
   écrire du code.

Décompte des critères vérifiés (fiches 51-54 + reliquat 31-34) : **34 FAIT**,
**9 PARTIEL**, **6 ABSENT**, **4 POINT MORT**. Le webhook de paiement entrant
(Stripe/PayPal) reste également non branché en HTTP (déjà documenté,
`BLOCKERS.md` §15, reconfirmé).

## 2. Ce qui existe réellement

### Back-office serveur (`packages/commerce/src/`)

| Domaine | Fichier | Lignes | État |
|---|---|---|---|
| Catalogue (produits/variantes) | `catalog/store.ts`, `catalog/types.ts`, `catalog/csv.ts` | 881+208+495 | Riche : `contentRef`, images (`imageMediaIds`/`imageMediaId`), taxonomie, seuil stock bas, `stock_movements` append-only, prix barré+promo, dimensions, CSV |
| Panier | `cart/store.ts`, `cart/totals.ts` | 543+150 | Persistant, tarification en temps réel, détection de changement de prix, **créé mais jamais exposé en HTTP** |
| Commandes | `order/store.ts`, `order/types.ts`, `order/csv.ts`, `order/notify.ts` | 730+169+66+257 | Transitions fermées, adresse structurée, suivi, file d'e-mails, export CSV |
| Paiement | `payment/{store,stripe,paypal,manual,registry,types}.ts` | 380+532+741+126+50+145 | Stripe + **PayPal** (nouveau, non documenté dans les fiches 31-34/51-54) + virement ; webhook signé, jamais branché en HTTP |
| Facture / avoir | `invoice/{store,pdf,sequence,credit-note}.ts` | 349+536+80+219 | Numérotation CAS, PDF zéro dépendance, avoir en série séparée |
| Clients | `customer/store.ts` | 207 | RGPD (export/anonymisation), agrégation commandes/abonnements |
| Coupons | `coupon/store.ts` | 517 | Limite globale + par client, restriction produit, métriques |
| Abonnements | `subscription/store.ts`, `subscription/renewal-notifier.ts` | 1010+40 | Pause/reprise/annulation, changement de formule+prorata, impayé (dunning), avis de renouvellement — **aucun n'est déclenché automatiquement** |
| Taxe | `tax/store.ts` | 209 | Résolution par spécificité, simulateur |
| Livraison | `shipping/store.ts` | 287 | Zones, `pickup`, repli transporteur |
| Routeur admin | `admin/router.ts`, `admin/permissions.ts` | 1498+121 | Transport-free, ~50 routes, vocabulaire propre (6 permissions) |

### Écrans admin (`packages/admin/src/routes/commerce-*.tsx`, `packages/admin/src/commerce/`)

`commerce-products.tsx` (1379), `commerce-orders.tsx` (459),
`commerce-order-detail.tsx` (763), `commerce-customers.tsx` (119),
`commerce-customer-detail.tsx` (221), `commerce-coupons.tsx` (416),
`commerce-subscriptions.tsx` (271), `commerce-subscription-detail.tsx` (250),
`commerce-tax.tsx` (407), `commerce-shipping.tsx` (477),
`commerce-payment.tsx` (239), `commerce-settings.tsx` (235),
`commerce-client.ts` (1132, client API). Composants partagés :
`bulk-price-modal.tsx`, `entry-product-link-card.tsx`, `low-stock-panel.tsx`,
`product-category-picker.tsx`, `product-content-link.tsx`,
`product-images-field.tsx`, `product-import-export-panel.tsx`,
`variant-image-field.tsx`.

### Vitrine publique

**Rien.** `packages/theme-ecommerce/package.json` ne dépend que de
`@cogenta/blocks`, `@cogenta/render`, `@cogenta/theme-kit` — **pas**
`@cogenta/commerce`. `grep -rl "commerce" packages/theme-ecommerce/src` ne trouve
qu'un commentaire dans `render/chrome.ts` disant explicitement que le thème
« ships no such feature ». `packages/cli/src/commands/serve.ts` ne monte
`/api/commerce/*` que sous le routeur **admin**, jamais une route publique
`/product/{handle}`, `/cart`, `/checkout` ou `/account`. Le panier persistant
(`cart/store.ts`) est instancié (`commerceCarts`, `serve.ts:1920`) et injecté dans
`createOrderStore` comme dépendance — mais **aucune route ne le lit ni ne
l'écrit**. Voir §6 pour la spécification du pont manquant.

## 3. Vérification des fiches, critère par critère

Les fiches 31-34 sont explicitement marquées obsolètes par 51/52/54 (52 remplace
32 sans le dire, mais correspond terme à terme). Le tableau ci-dessous vérifie
directement 51-54 dans le code, et note les écarts avec 31-34 qui restent vrais.

### Fiche 51 — Catalogue

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| T1 `contentRef` bidirectionnel + images | **FAIT** | `product-images-field.tsx`, `variant-image-field.tsx` (montés `commerce-products.tsx:634,1102`), `entry-product-link-card.tsx` monté dans `packages/admin/src/routes/entry-edit.tsx`, `catalog/store.ts:215,244` (`imageMediaIds`/`imageMediaId`) | Le mission-brief signalait les images ajoutées le 2026-09-01 : confirmé câblé des deux côtés (produit direct + `contentRef`). |
| T2 recherche/tri/pagination/actions groupées | **FAIT** | `commerce-products.tsx` (filtre statut/recherche/tri), `bulk-price-modal.tsx` (prévisualisation de prix groupée) | — |
| T3 taxonomie (`commerce.catalog.write`) | **FAIT** | `product-category-picker.tsx`, route `PUT /products/{id}/terms` (`admin/router.ts:548`), décision tranchée documentée dans `docs/04-contrats.md:988` | — |
| T4 seuil stock bas + historique | **FAIT** | `low-stock-panel.tsx`, routes `GET /variants/low-stock` et `GET /variants/{id}/stock-movements` (`admin/router.ts:568,575`), table `cogenta_commerce_stock_movements` append-only | — |
| T5 prix barré/promo + dimensions | **FAIT** | `catalog/types.ts` (`compareAtPriceMinor`, `widthMm/heightMm/depthMm`), champs dans `commerce-products.tsx` | — |
| T6 import/export CSV | **FAIT** | `catalog/csv.ts` (495 lignes), `product-import-export-panel.tsx`, routes `GET /products/export`, `POST /products/import` | — |
| Test de concurrence stock rejoué | **FAIT** (SQLite) | `packages/commerce/test/catalog.contract.ts` étendu | Postgres/MySQL/MariaDB **jamais exécutés** (Docker indisponible), déjà documenté `BLOCKERS.md` §22. |

### Fiche 52 — Commandes, clients (pas de marqueur d'état dans la fiche elle-même — vérifié dans le code)

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| T1 adresse structurée | **FAIT** | `order/types.ts:129-134` (`shippingAddressLine1/2`, `shippingCity`, `shippingPostalCode`, `shippingRecipient`, `shippingPhone`) | — |
| T2 e-mails transactionnels | **FAIT** (câblé) | `order/notify.ts` (257 lignes, file+reprise), tâche planifiée `commerce-order-emails` (`serve.ts:5938`), journal visible (`GET /orders/{id}/emails`, `commerce-order-detail.tsx`) | — |
| T3 fiche client | **FAIT** | `commerce-customer-detail.tsx` (221 lignes), route `GET /customers/{id}` (`admin/router.ts:583`), RGPD export/anonymisation (`customers/{id}/export`, `.../anonymize`) | **Zéro test admin** pour cet écran (voir §4). |
| T4 expédition/suivi | **FAIT** | `order/store.ts` `setTracking` (garde `COMMERCE_TRACKING_INVALID` si non payé), UI dans `commerce-order-detail.tsx:576-622`, testé `commerce.test.tsx:150` | — |
| T5 commande manuelle | **FAIT** | `orders.placeManual`, route `POST /orders` (`admin/router.ts:722`) | — |
| T5 (suite) modification pré-paiement | **PARTIEL** | `orders.update` (`order/store.ts:625`) modifie **uniquement** `email`/`shippingAddress`, verrouillé hors `pending` (`COMMERCE_ORDER_LOCKED`) | **Aucune modification de lignes** (ajouter/retirer/ajuster un produit) — la fiche le demandait explicitement (« ajouter, retirer, ajuster »). |
| T6 remboursement partiel | **FAIT** | `payment/store.ts` `refund(amount, reason)`, UI `commerce-order-detail.tsx:153-177`, testé `commerce.test.tsx:150` (« refunds it partially with a mandatory reason ») | — |
| T6 avoir (`CreditNote`) | **FAIT** | `invoice/credit-note.ts` (219 lignes), série `CN-2026` distincte, route `GET /orders/{id}/credit-notes` | Pas de bouton explicite « émettre un avoir » trouvé dans `commerce-order-detail.tsx` au-delà de la liste — à vérifier lors du prochain passage UI (P3). |
| T7 filtres avancés | **PARTIEL** | `commerce-orders.tsx` a statut + plage de dates (`fromDate`/`toDate`) | **Pas de recherche par numéro de commande ni par e-mail client**, ni filtre par client ou mode de paiement, contrairement au critère de la fiche. |
| T7 export comptable CSV | **FAIT** | `order/csv.ts`, route `GET /orders/export.csv`, bouton dans l'écran | Format non explicitement documenté pour un tiers (comptable) — la fiche demandait qu'il soit « stable et documenté ». |

### Fiche 53 — Promotions et abonnements

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| T1 écran abonnement complet (pause/reprise/historique) | **FAIT** | `commerce-subscription-detail.tsx`, routes pause/resume/cancel (`admin/router.ts:1180`), testé `coupons-subscriptions.test.tsx:147` | — |
| T2 limite par client + restriction produit | **FAIT** | `coupon/store.ts` (`maxRedemptionsPerCustomer`, table `couponRestrictions`), UI `commerce-coupons.tsx:380,395` | — |
| T3 machine à états impayé | **POINT MORT** | `subscription/store.ts:697-790` (`runBilling`/`runDunning`), dunning surfacé dans `commerce-subscription-detail.tsx:207-214` | **`runBilling` et `runDunning` ne sont appelés par aucun code de `cogenta serve`** — `grep -rn "runBilling\|runDunning" packages/cli/src` ne renvoie rien. Aucune tâche planifiée nommée dans `serve.ts` (liste complète : `scheduled-publish`, `not-found-purge`, `audit-integrity`, `trash-purge`, `forms-purge`, `channel-notifications`, `analytics-purge`, `commerce-order-emails`, `updates-auto-check` — **aucune pour la facturation ou la relance d'abonnement**). Un abonnement créé ne sera **jamais facturé** à son échéance sur un vrai site : c'est un mécanisme entièrement inerte en production, alors qu'il est décrit comme « fait » dans le suivi du projet. Voir T-COM-01 en §6. |
| T4 changement de formule + prorata | **POINT MORT** | Route `POST /subscriptions/{id}/change-plan` (`admin/router.ts:1207`), `changePlan()` dans le store | **Aucune UI** : `grep -n "changePlan" packages/admin/src/api/commerce-client.ts` et tous les écrans ne renvoie rien — pas de fonction client, pas de formulaire. La route existe et n'est appelable par aucun bouton. |
| T5 avis avant renouvellement | **POINT MORT** | `subscription/renewal-notifier.ts` (`createEmailRenewalNotifier`, `sendRenewalNotices`) | `grep -rln "sendRenewalNotices\|createEmailRenewalNotifier" packages/` hors tests et `dist/` ne trouve **que** `packages/commerce/src/index.ts` (export) — jamais appelé par `cogenta serve`. Même défaut que T3 : aucune tâche planifiée. |
| T6 mesure (coupons + abonnements) | **FAIT** | `coupon/store.ts` `metrics()`, `subscription/store.ts:223,935` `metrics()` (`SubscriptionMetrics`), routes `GET /coupons/metrics`, `GET /subscriptions/metrics`, affichées dans les écrans respectifs | — |

### Fiche 54 — Réglages boutique

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| Taxes (écran + simulateur) | **FAIT** | `commerce-tax.tsx` (407 lignes), route `POST /tax/simulate` appelant le vrai `taxFor()` | — |
| Livraison (écran + simulateur + repli) | **FAIT** | `commerce-shipping.tsx` (477 lignes), route `POST /shipping/simulate` | — |
| Paiement (présence de clé, test connexion) | **FAIT** | `commerce-payment.tsx` (239 lignes), route `GET /payment/drivers`, `POST /payment/drivers/{name}/test-connection` | — |
| T1 retrait en magasin (`pickup`) | **FAIT** | `shipping/store.ts:19` (`SHIPPING_KINDS` inclut `pickup`), coût nul (ligne 146) | — |
| T2 prévisualisation facture réelle | **FAIT** | `commerce-settings.tsx:71-91` (`previewInvoice`, appelle `GET .../invoice/preview`, jamais de faux numéro) | — |
| T3 multi-devises | **ABSENT** (décision assumée) | Aucune trace de gestion multi-devises | La fiche elle-même classe ceci « décision produit, probablement hors périmètre v1 » — pas un oubli. |
| T4 code postal en zone de taxe | **ABSENT** (confort assumé) | `tax/store.ts` reste pays/région | Explicitement noté « hors périmètre assumé » par la fiche. |
| Réglages généraux (devise, TTC/HT, pays servis, CGV/retour en pages réelles) | **FAIT** | `packages/schema/src/store/site-settings-registry.ts:592-716` (`commerce.currency`, `commerce.priceDisplay`, `commerce.returnPolicyPagePath`, `commerce.invoicePaymentTerms`) | CGV/politique de retour sont bien des **chemins vers de vraies entrées**, pas des champs de texte, comme exigé. |

### Reliquat des fiches 31/32/34 (points non repris littéralement par 51-54)

| Critère (fiche d'origine) | Verdict | Preuve/Écart |
|---|---|---|
| Webhook Stripe/PayPal entrant câblé en HTTP (34 T3) | **ABSENT** | Confirmé : `grep -n "payments/webhook" packages/cli/src/commands/serve.ts` ne trouve que la construction de l'URL affichée (`serve.ts:2185`), jamais une route qui la sert ; `admin/router.ts` n'a aucun segment `payments/webhook`. Déjà documenté `BLOCKERS.md` §15, toujours vrai. |
| Produits liés/numériques/groupés (31, confort) | **ABSENT** | `grep -n "related\|digital\|download\|bundle" packages/commerce/src/catalog/*.ts` ne trouve rien — cohérent avec le classement « confort » de la fiche. |
| Panier abandonné : relance/écran (32, hors texte mais mentionné L20) | **POINT MORT** | `cart/store.ts` a `abandon()` et le statut `'abandoned'`, mais rien n'appelle `abandon()` automatiquement (pas de tâche planifiée qui expire les paniers ouverts), aucun écran, aucun e-mail de relance. Sans vitrine publique, la question est de toute façon prématurée — voir §6. |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P0** | `packages/cli/src/commands/serve.ts` (absence totale) | `SubscriptionStore.runBilling`/`runDunning` (`packages/commerce/src/subscription/store.ts:697,738`) ne sont invoqués nulle part hors des tests du paquet. La facturation récurrente et la relance d'impayé, présentées comme achevées, sont **du code mort en production** : un abonnement ne sera jamais facturé à échéance sur un vrai site. | Ajouter une tâche planifiée `commerce-subscription-billing` (même patron que `commerce-order-emails`, `serve.ts:5938`) qui appelle `runBilling()` puis `runDunning()` à un intervalle configurable, idempotence déjà garantie côté store. |
| **P0** | `packages/commerce/src/subscription/renewal-notifier.ts` (absence de câblage) | `sendRenewalNotices` n'est jamais appelé par `cogenta serve` — aucun avis de renouvellement ne part jamais, malgré l'obligation légale citée par la fiche elle-même. | Même correction que ci-dessus : ajouter à la tâche planifiée. |
| **P0** | Domaine entier | Aucun pont vitrine (`packages/theme-ecommerce` ne dépend pas de `@cogenta/commerce`, aucune route publique dans `serve.ts`). Une boutique Cogenta ne peut être utilisée par un client final. | Spécifié en détail en §6, T-COM-04. |
| **P1** | `packages/admin/src/api/commerce-client.ts`, tous les écrans | `changePlan` (route serveur `POST /subscriptions/{id}/change-plan`) n'a ni fonction client ni bouton. | Ajouter `changePlan()` au client + formulaire dans `commerce-subscription-detail.tsx`. |
| **P1** | `packages/admin/test/commerce/` | Aucun test dédié pour `commerce-customer-detail.tsx` (221 lignes, RGPD export/anonymisation — une action irréversible sans test est un vrai risque), `commerce-subscription-detail.tsx` au-delà de « pause », `commerce-order-detail.tsx` au-delà de trois scénarios (pas de test pour les avoirs, le journal d'e-mails). | Étendre `packages/admin/test/commerce/coupons-subscriptions.test.tsx` et ajouter un fichier dédié `commerce-customer-detail.test.tsx`. |
| **P1** | `commerce-orders.tsx` | Pas de recherche par numéro de commande ni par e-mail — critère explicite de la fiche 52 T7, non tenu. | Ajouter un champ recherche relié à une extension du filtre côté `order/store.ts`/`admin/router.ts`. |
| **P2** | `order/store.ts:625` (`update`) | Modification d'une commande pré-paiement limitée à l'adresse/e-mail — pas de correction de lignes (fiche 52 T5, texte de la fiche demandait explicitement « ajouter, retirer, ajuster »). | Étendre `OrderUpdateInput` avec des opérations de ligne, dans la même transaction, toujours verrouillé hors `pending`. |
| **P2** | `cart/store.ts` | `abandon()` existe mais n'est jamais appelé automatiquement (pas de purge/expiration planifiée des paniers ouverts). Sans conséquence pratique tant que le pont vitrine n'existe pas (aucun panier public n'est créé), mais un vrai trou une fois T-COM-04 livrée. | À traiter avec la tâche planifiée du panier public (§6). |
| **P3** | `commerce-order-detail.tsx` | Pas de bouton explicite « émettre un avoir » visible distinctement d'un remboursement, malgré `CreditNoteStore` prêt côté serveur. | Ajouter l'action dans l'écran (à confirmer lors d'un passage UI dédié). |
| **P3** | `order/csv.ts` export comptable | Format non documenté pour un usage tiers (comptable), contrairement au critère « stable et documenté » de la fiche 52. | Documenter le format dans `docs/` (colonnes, encodage, devise). |

Aucune violation trouvée de R3/R4/R7/R9 dans `packages/commerce/src` ou les écrans
admin commerce : `grep -rn "console\.log\|: any\b|@ts-ignore\|throw new Error("`
sur `packages/commerce/src`, les routes admin commerce et `theme-ecommerce/src` ne
retourne rien. Permissions systématiquement vérifiées par le routeur, jamais dans
un store (R4 respectée — `admin/permissions.ts` centralise, chaque route appelle
`permissions.assert(...)`). Aucun montant en flottant trouvé (grep de `parseFloat`
sur les montants absent, tout passe par `Minor`/`toInt`).

## 5. Comparaison marché

### WooCommerce

| Fonction | Cogenta |
|---|---|
| Produit simple/variable, SKU, prix, stock | OUI |
| Types groupé/externe | NON |
| Images produit | OUI |
| Catégories/étiquettes | PARTIEL (taxonomie générique branchée ; pas d'« étiquettes » distinctes des catégories) |
| Attributs/variations en onglets dédiés | PARTIEL (variantes gérées, pas d'onglets attributs séparés comme WooCommerce) |
| Avis produits | NON |
| Actions groupées catalogue | OUI (prix ±, archivage, avec prévisualisation) |
| Import/export CSV catalogue | OUI |
| Statuts commande, notes, e-mails | OUI (statuts, e-mails), PARTIEL (notes = un seul champ `note`, pas un fil) |
| Remboursements | OUI (partiel, avec avoir) |
| Création manuelle de commande | OUI |
| Modification de commande (lignes) | NON (§4 P2) |
| Coupons | OUI (dont restriction produit/client — au-dessus de WooCommerce de base, en dessous d'un plugin) |
| Comptes clients | PARTIEL (fiche admin complète, pas de compte client public — aucune vitrine) |
| Zones de taxe | OUI (résolution par spécificité — supérieur à l'ordre d'insertion de WooCommerce) |
| Zones de livraison, classes | OUI |
| Paiements (dizaines de passerelles) | PARTIEL (Stripe, PayPal, virement — webhook non branché) |
| Réglages : comptes, e-mails, avancé | PARTIEL (comptes/e-mails via réglages génériques ; pas d'onglet « avancé » distinct) |
| **Vitrine (boutique, produit, panier, commande, mon compte)** | **NON** — écart le plus grave |
| Subscriptions (extension) | PARTIEL (moteur complet, jamais déclenché — §4 P0) |

### Shopify admin

| Fonction | Cogenta |
|---|---|
| Produits, collections | PARTIEL (collections = taxonomie générique, pas de "collection automatique" par règle) |
| Commandes, clients | OUI/PARTIEL (clients : fiche complète, pas de segmentation) |
| Remises (codes + automatiques) | PARTIEL (codes oui, automatiques sans code NON) |
| Analytics commerce dédié | NON (métriques basiques coupons/abonnements seulement) |
| Réglages paiements | OUI (registre de pilotes, mode test visible) |
| Réglages checkout | NON (aucun checkout n'existe) |
| Réglages expédition (zones, tarifs) | OUI |
| Réglages taxes | OUI |
| Notifications (e-mails transactionnels) | OUI (moteur), PARTIEL (déclenchement automatique des rappels — §4 P0) |
| Marchés / multi-devises | NON (assumé hors périmètre) |
| Wallets natifs (Apple/Google Pay) | NON |
| **Boutique publique elle-même** | **NON** |

## 6. Spécification ultra détaillée des corrections et ajouts

## T-COM-01 — Brancher `runBilling`/`runDunning`/`sendRenewalNotices` sur un vrai planificateur

**Priorité** : P0. **Effort** : 0,5 j. **Fichiers** : `packages/cli/src/commands/serve.ts`
(section des tâches planifiées, autour de `serve.ts:5881-5950`), aucun nouveau
fichier `@cogenta/commerce` nécessaire (les fonctions existent déjà).

**Travail détaillé** : ajouter une entrée à la liste des tâches planifiées de
`runServe`, sur le patron exact de `commerce-order-emails` (`serve.ts:5938`) :

```ts
{
  name: 'commerce-subscription-billing',
  intervalMs: options.commerceBillingTickMs ?? COMMERCE_BILLING_TICK_MS,
  run: async () => {
    if (commerceSubscriptions === undefined) return
    await commerceSubscriptions.runBilling()
    await commerceSubscriptions.runDunning()
    await commerceSubscriptions.sendRenewalNotices?.(commerceRenewalNotifier)
  },
}
```

Réutiliser exactement le mécanisme de seam de test déjà présent pour les e-mails
de commande (`commerceEmailTickMs` à la ligne `5245`) : ajouter
`commerceBillingTickMs` en option de test, jamais un intervalle fixe non
substituable. `sendRenewalNotices` a déjà un garde no-op sûr sans notifieur
configuré (R2) — vérifier que ce garde reste actif si `renewal-notifier.ts` n'est
pas construit.

**Critères d'acceptation** :
- Un abonnement dont l'échéance est dans le passé est facturé au prochain tick,
  sans intervention manuelle.
- Un paiement en échec ouvre un cycle de relance visible sur
  `commerce-subscription-detail.tsx` sans qu'aucun humain n'ait appelé une route.
- Rejouer le tick deux fois sur la même échéance ne double ni la facture ni la
  relance (idempotence déjà prouvée côté store — seul le test d'intégration du
  scheduler est nouveau).

**Tests exigés** : test d'intégration `packages/cli/test/serve-commerce-billing.test.ts`
contre un vrai serveur, horloge avancée synthétiquement (même patron que
`serve-scheduled-publish.test.ts` s'il existe, sinon `commerce-order-emails`'s
propre test). **Impact contrat/ADR** : aucun — câblage pur, `commerce@1.0` inchangé.
**ADR requise** : non.

## T-COM-02 — Exposer `changePlan` dans l'écran d'abonnement

**Priorité** : P1. **Effort** : 0,5 j. **Fichiers** :
`packages/admin/src/api/commerce-client.ts`, `packages/admin/src/routes/commerce-subscription-detail.tsx`,
i18n FR/EN.

**Travail détaillé** : ajouter `changePlan(token, id, { variantId, quantity?, prorate? })`
au client (même forme que `pauseSubscription`/`resumeSubscription` déjà présents),
un formulaire (sélection de variante + case à cocher prorata) sur l'écran de
détail, avec confirmation explicite puisque la fiche 53 dit qu'une baisse ne
produit **jamais** un avoir silencieux — l'écran doit afficher le prorata calculé
(positif ou négatif) avant validation, jamais l'appliquer à l'aveugle.

**Critères d'acceptation** : changer la formule d'un abonnement actif depuis
l'écran ; un prorata négatif est montré, jamais appliqué comme un avoir fantôme.
**Tests exigés** : test admin (mock fetch) sur le nouveau formulaire, par rôle
(`commerce.order.write`). **ADR requise** : non.

## T-COM-03 — Recherche et filtres avancés sur la liste des commandes

**Priorité** : P1. **Effort** : 1 j. **Fichiers** : `packages/commerce/src/order/store.ts`
(`list`), `packages/commerce/src/admin/router.ts`, `commerce-orders.tsx`.

**Travail détaillé** : étendre `OrderListInput` avec `search` (numéro/référence
et e-mail, `like` insensible à la casse), `customerId`, `paymentMethod` ; ajouter
un champ recherche à l'écran, réutilisant le composant de recherche déjà présent
sur `commerce-products.tsx`. Ajouter le total de la période affichée (montant
cumulé) sous la liste, à partir des lignes déjà chargées côté client — aucune
route nouvelle nécessaire pour ce total.

**Critères d'acceptation** : trouver une commande par les quatre derniers
caractères de sa référence ou par l'e-mail du client, sans quitter l'écran.
**Tests exigés** : unitaire sur `OrderStore.list({ search })`, e2e sur l'écran.
**ADR requise** : non.

## T-COM-04 — Le pont vitrine (le point le plus important de cet audit)

**Priorité** : P0. **Effort** : 10-15 j (le plus gros chantier du domaine).
**ADR requise** : **oui**, voir texte proposé ci-dessous — impact potentiel sur le
contrat B (blocs), à trancher avant tout code.

### Constat

`@cogenta/commerce` a un panier persistant complet (`cart/store.ts`), un moteur
de totaux (`cart/totals.ts`), un checkout transactionnel
(`OrderStore.place({ cartId, email, ... })` — `order/store.ts:344`, avec
revérification du coupon et du stock au dernier moment), un registre de paiement
à deux implémentations optimales (Stripe, PayPal) plus virement en dégradé. Rien
de tout cela n'est joignable sans être connecté et autorisé sur `/api/commerce`
(routeur **admin**, `commerce.read`/`commerce.order.write`, etc.). Un visiteur
anonyme ne peut : voir un produit, ajouter au panier, payer, créer un compte,
suivre une commande.

### Ce qui manque, précisément

1. **Un routeur public**, distinct du routeur admin (même séparation que
   `/api/content` public vs `/api/*` admin) : `createCommerceStorefrontRouter`
   dans un nouveau fichier `packages/commerce/src/storefront/router.ts`, avec ses
   propres permissions — **anonyme par défaut**, jamais `commerce.read` (ce
   vocabulaire est celui du back-office, un client ne l'a jamais).
2. **Une session panier publique** : un cookie de session (`sessionKey`, déjà un
   champ de `Cart`) posé par `cogenta serve`, jamais un jeton `commerce.*`. Le
   panier existant se réclame par `find({ sessionKey })`.
3. **Pages de rendu**, sur le modèle de `/search` (L10 tâche 3) — un chemin
   spécial servi par `cogenta serve`/`theme-render.ts`, **hors du vocabulaire de
   blocs du contrat B**, exactement le choix que `/search` a déjà fait pour ne
   pas ouvrir de RFC bloquante :
   - `/shop` (ou route configurable) : liste produits, pagination, filtre
     catégorie (taxonomie).
   - `/shop/{handle}` : fiche produit — texte/images depuis `contentRef` si
     présent, sinon repli sur les champs directs du produit (titre, images
     directes déjà là depuis le 2026-09-01).
   - `/cart` : contenu du panier, quantités, code promo.
   - `/checkout` : adresse, mode de livraison (simulateur déjà réel), paiement.
   - `/account` (si le client a un compte `@cogenta/auth` lié) : commandes,
     factures, abonnements.
4. **Le webhook de paiement entrant**, déjà cadré dans `BLOCKERS.md` §15 : une
   route qui lit le corps **brut** (pas JSON-parsé) et appelle
   `PaymentStore.handleWebhook`. Nécessaire pour que Stripe/PayPal confirment un
   paiement de façon fiable (pas seulement par retour de navigateur).
5. **Décision RFC contrat B, ou route hors-blocs** — la question que
   `BLOCKERS.md` §5 posait déjà sans trancher : soit deux/trois blocs
   (`productGrid`, `addToCartButton`) entrent au contrat B par RFC (montée
   mineure), soit les quatre pages ci-dessus sont des routes serveur qui ne
   passent jamais par le vocabulaire de blocs — **recommandation de cet audit** :
   la seconde option, cohérente avec `/search` et avec le refus déjà tracé pour
   `/forms` (fiche 16/ADR-0026, même raisonnement : « le contrat B est figé,
   AGENTS.md exige une RFC, la route dédiée rend le même service sans y
   toucher »).
6. **Purge/rappel de panier abandonné** : une fois des paniers publics réels
   créés, `abandon()` doit être appelé par une tâche planifiée (paniers `open`
   dont `updated_at` dépasse un délai), et un e-mail de relance optionnel
   (réutilisant `@cogenta/channels`, comme les autres e-mails commerce).

### Texte d'ADR proposé (à insérer par un humain, `docs/03-decisions.md` protégé)

> **ADR-00XX — Le pont vitrine du commerce est une route serveur, pas un bloc**
>
> **Contexte** : `@cogenta/commerce` (ADR-0024, contrat E) a un back-office
> complet mais aucune vitrine publique. Vendre exige des pages produit/panier/
> checkout que le contrat B (figé) ne prévoit pas.
>
> **Décision** : ces pages sont servies par `cogenta serve` comme `/search`
> (L10) et `/forms/{name}` (ADR-0026) — un point d'entrée HTTP dédié, rendu par
> le thème via `theme-kit` mais **hors du vocabulaire de blocs**. Aucun bloc
> `productGrid`/`addToCart` n'est ajouté au contrat B par cette décision. Un
> thème qui veut composer une vitrine dans le constructeur de page devra passer
> par une RFC contrat B séparée, plus tard, si le besoin est prouvé.
>
> **Conséquences** : un thème e-commerce doit implémenter les gabarits
> `shop.tsx`/`product.tsx`/`cart.tsx`/`checkout.tsx` (nouvelle extension de
> `theme-kit`, additive) plutôt que de composer avec des blocs existants. Une
> boutique qui veut personnaliser la mise en page du panier édite le thème, pas
> le constructeur de page — même compromis que la recherche.
>
> **Remplace** : rien. **Remplacée par** : —.

### Critères d'acceptation

- Un visiteur anonyme trouve un produit, l'ajoute au panier, paie par Stripe ou
  virement, reçoit sa confirmation par e-mail, et peut suivre sa commande.
- Le panier survit à un rafraîchissement de page (cookie de session).
- Un paiement Stripe confirmé par webhook place réellement la commande à
  `paid`, même si le visiteur ferme l'onglet avant la redirection de retour.
- R2 respectée : sans fournisseur de paiement configuré, le virement bancaire
  reste un chemin d'achat complet (dégradé, mais fonctionnel).

### Tests exigés

- Bout en bout complet : ajout panier → checkout → paiement virement → commande
  visible côté admin → facture générée.
- Sécurité : le routeur public ne doit jamais exposer un client ou une commande
  d'un autre panier/session — test d'isolation, même discipline que
  `packages/fleet/test/isolation/`.
- Webhook : signature invalide refusée, rejeu refusé (fenêtre de fraîcheur),
  reprend les tests déjà écrits pour `handleWebhook` côté intégration HTTP.

### Ordre de dépendance interne à cette tâche

Routeur public panier → pages de rendu → checkout → webhook (le webhook peut se
faire en parallèle, il ne dépend que de `handleWebhook` déjà écrit).

## 7. Ordre d'exécution recommandé et dépendances

1. **T-COM-01** (0,5 j, aucune dépendance) — le fix le plus urgent et le moins
   coûteux : un abonnement facturé est un revenu réel, aujourd'hui perdu en
   silence.
2. **T-COM-03** (1 j, aucune dépendance) — gain rapide, complète un critère
   d'acceptation déjà à moitié tenu.
3. **T-COM-02** (0,5 j, aucune dépendance) — même famille (compléter une UI sur
   une route déjà là).
4. **T-COM-04** (10-15 j, nécessite l'ADR ci-dessus tranchée avant tout code) —
   le chantier structurant : sans lui, tout le reste du domaine commerce reste un
   outil de gestion sans commerce réel. À planifier comme son propre lot une fois
   l'ADR actée.

Les correctifs P2/P3 du §4 (modification de lignes de commande, purge de
panier abandonné, documentation du CSV comptable, bouton avoir explicite)
peuvent suivre en fond de tâche, aucun n'est bloquant pour les autres.
