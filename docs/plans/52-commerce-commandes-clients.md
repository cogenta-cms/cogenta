# 52 — Cogenta Commerce : commandes et clients

> **Constat le plus important de toute l'analyse commerce** : le modèle de commande
> **n'a aucune adresse postale structurée** — seulement `shippingCountry`/
> `shippingRegion` (deux chaînes libres). Aucune des quatre fiches d'origine
> (31-34) ne le relevait explicitement. C'est un trou bloquant pour toute
> expédition réelle, à traiter en priorité dans cette fiche.
> **Fichiers** : `packages/commerce/src/{order,payment,invoice,customer}/*`,
> `packages/admin/src/routes/commerce-order{s,-detail}.tsx`
> **Effort** : 7–9 jours
> **ADR requise** : non — extensions additives du contrat E

---

## 1. Ce qui existe réellement

`order/store.ts` (514 lignes, table de transitions fermée `pending→paid→shipped→
delivered`, plus `cancelled`/`refunded` terminaux, `assertTransition` compilateur-
forcé). `payment/store.ts` (380 lignes) : `start`/`settle`/`fail`/`poll`/`refund`
(**remboursement partiel déjà supporté côté store**), `listRefunds`,
`handleWebhook`. `payment/stripe.ts` (532 lignes, fetch natif, signature en temps
constant), `payment/manual.ts` (virement dégradé). `invoice/store.ts` +
`invoice/pdf.ts` (numérotation séquentielle par compare-and-set, zéro dépendance
PDF). `customer/store.ts` (163 lignes) : `ensure`/`read`/`readByEmail`/`link`/
`list(search, limit)` — route liste avec recherche existe, **aucune route détail
`GET /customers/{id}`**, aucun écran.

**Absent du routeur admin** (vérifié route par route) : commande manuelle, aucune
modification de commande, aucune note, aucun détail client, aucun avoir/note de
crédit, aucun e-mail transactionnel/journal, aucun export comptable, **aucune
adresse postale structurée nulle part**.

## 2. Écarts, classés

**Bloquant** :
1. Aucune adresse de livraison structurée — bloque toute étiquette d'expédition
   réelle.
2. Aucun e-mail transactionnel (aucune route, aucun modèle, `@cogenta/channels` a
   l'adaptateur mais n'est pas câblé ici).
3. Pas de fiche client détaillée (route liste existe, détail non).
4. Pas de numéro de suivi.

**Important** : remboursement partiel non exposé en écran (store prêt) ; pas de
commande manuelle ni modification pré-paiement ; pas d'avoir/note de crédit ; pas
d'export comptable ; filtres de liste limités.

## 3. Plan de développement

**Tâche 1 — Adresse structurée** *(priorité)* : nouveaux champs sur `orders`
(`shippingAddressLine1/2`, `shippingCity`, `shippingPostalCode`,
`shippingRecipient`, `shippingPhone`) — préalable à toute étiquette/suivi.

**Tâche 2 — E-mails transactionnels** : réutiliser l'adaptateur e-mail de
`@cogenta/channels`, modèles éditables, file avec reprise, journal visible sur la
commande.

**Tâche 3 — Fiche client** : `GET /customers/{id}` + agrégation commandes/dépense/
abonnements, export RGPD/anonymisation.

**Tâche 4 — Expédition/suivi** : colonnes `trackingCarrier`/`trackingNumber`/
`trackingUrl`/`shippedAt` sur `orders` ou nouvelle table `order_shipments` pour
l'expédition partielle par lignes.

**Tâche 5 — Commande manuelle + modification pré-paiement**, verrouillée après
`paid`.

**Tâche 6 — Remboursement partiel** : écran (choix lignes/montant, motif
obligatoire) branché sur `payments.refund` existant. Avoir : nouvelle série de
numérotation réutilisant le compare-and-set d'`invoice/store.ts`.

**Tâche 7 — Filtres avancés + export comptable CSV** (format à figer et
documenter).

## 4. Critères d'acceptation

- Une commande porte une adresse de livraison complète et structurée.
- Une confirmation de commande et une notification d'expédition partent
  automatiquement.
- Un remboursement partiel est possible depuis l'écran, motif obligatoire.
- Une fiche client agrège ses commandes et son historique.

## 5. Tests exigés

- Migration : nouveaux champs d'adresse, testés up/down/up sur les trois dialectes.
- Bout en bout : commande → confirmation e-mail → expédition → notification.
- Contrat : remboursement partiel ne dépasse jamais le montant payé (garde déjà
  présente côté store, à tester depuis l'écran).
- Permissions : `commerce.order.refund` distinct de `commerce.order.write`, testé
  par rôle.

## 6. Pièges connus

- L'adresse structurée doit être ajoutée **avant** tout travail d'étiquette
  d'expédition — sinon la tâche 4 devrait être refaite.
- Ne pas dupliquer la logique de remboursement déjà écrite dans `payment/store.ts`
  — l'écran appelle l'existant, il ne réimplémente rien.

## 7. Décisions à trancher

Format de l'export comptable (tâche 7) — à figer et documenter avant
l'implémentation.
