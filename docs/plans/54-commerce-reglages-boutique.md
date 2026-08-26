# 54 — Cogenta Commerce : réglages boutique

> **État** : `docs/plans/34-commerce-reglages-boutique.md` est obsolète — elle est
> marquée « absent côté admin » alors qu'elle est **livrée** (taxes par
> spécificité, livraison avec repli, pilotes de paiement testés, facturation).
> C'est le bloc le plus proche de la parité WooCommerce.
> **Fichiers** : `packages/commerce/src/{tax,shipping,payment}/store.ts`,
> `packages/admin/src/routes/commerce-{tax,shipping,payment,settings}.tsx`
> **Effort** : 1–2 jours
> **ADR requise** : non — extension additive d'une union de type existante

---

## 1. Ce qui existe réellement

`tax/store.ts` (209 lignes) : zones pays/région, résolution **par spécificité**
(prouvée), simulateur `POST /tax/simulate` appelant le **même** `resolve()`/
`taxFor()` que le vrai calcul — écran livré. `shipping/store.ts` (280 lignes) :
`flat|by_weight|free`, `freeOverMinor`, pilote transporteur optionnel avec repli sur
tarif stocké en cas d'échec, `POST /shipping/simulate` appelant `available()` réel —
écran livré. Paiement : `GET /payment/drivers` (présence/`configured`, jamais la
clé), `POST /payment/drivers/{name}/test-connection` (appel réel `init`+`health()`)
— écran livré. Réglages généraux + facture via le registre générique de réglages
(ADR-0025, groupe `commerce`) : devise, affichage prix, pays servis, sous-total
minimum, backorder par défaut, chemins CGV/politique de retour (de vraies pages,
pas des champs texte), série de facture/conditions de paiement/langue.

## 2. Ce qui manque réellement encore

Zone de taxe limitée à pays/région (pas de code postal, hors périmètre assumé par
le code lui-même). Pas de retrait en magasin (`SHIPPING_KINDS` n'a pas `pickup`).
Pas de multi-devises (décision produit toujours ouverte). Pas de prévisualisation
de facture réelle dans l'écran réglages (le champ existe, pas la prévisualisation).

## 3. Écarts, classés

Tous **importants/confort** — plus aucun bloquant.

## 4. Plan de développement

**Tâche 1** — `SHIPPING_KINDS` += `pickup` (montée mineure, additive), écran.
**Critère** : un client peut choisir le retrait en magasin à la commande.

**Tâche 2** — Prévisualisation facture réelle sur une commande existante dans
`commerce-settings.tsx`.

**Tâche 3** *(décision produit, pas juste du développement)* — Multi-devises :
documenter la portée v1 (probablement hors périmètre) avant tout code.

**Tâche 4** *(confort)* — Code postal en zone de taxe si un marché cible l'exige
(nouvelle colonne).

## 5. Critères d'acceptation

- Le retrait en magasin est une méthode de livraison disponible.
- Une facture réelle est prévisualisable depuis les réglages.

## 6. Tests exigés

- Simulateur de livraison : `pickup` retourne un coût nul, cohérent avec le calcul
  réel de commande.
- Non-régression : simulateurs taxe/livraison existants restent identiques au
  calcul réel après l'ajout de `pickup`.

## 7. Pièges connus

- Ne pas ajouter `pickup` sans mettre à jour le simulateur — il doit rester le
  même code que le calcul réel, propriété déjà prouvée pour taxe et livraison.

## 8. Décisions à trancher

Multi-devises (tâche 3) — décision produit avant tout développement, probablement
hors périmètre v1.
