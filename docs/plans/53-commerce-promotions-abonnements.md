# 53 — Cogenta Commerce : promotions et abonnements

> **État** : le store d'abonnements gère déjà correctement l'arithmétique de dates
> (31 janvier + 1 mois → 28 février) et la concurrence de coupons, mais
> **`runBilling` n'a aucune gestion d'échec de paiement** — première cause de perte
> de revenu en abonnement, et l'écran n'expose même pas pause/reprise pourtant déjà
> routées côté serveur.
> **Fichiers** : `packages/commerce/src/{coupon,subscription}/store.ts`,
> `packages/admin/src/routes/commerce-{coupons,subscriptions}.tsx`
> **Effort** : 5–6 jours
> **ADR requise** : non — extensions additives du contrat E

---

## 1. Ce qui existe réellement

`coupon/store.ts` (301 lignes) : `kind: percentage|fixed|free_shipping`,
`startsAt`/`endsAt`, `maxRedemptions` **global** (pas par client), compteur
incrémenté par transaction (même motif de concurrence que le stock, déjà
garanti), `check()` renvoie un type discriminé complet. La date de validité et la
limite d'utilisation, que la fiche 33 d'origine marquait « à vérifier », **existent
bien**.

`subscription/store.ts` (501 lignes) : `create`/`read`/`list`/`pause`/`resume`/
`cancel`/`cycles`/`runBilling`. `advancePeriod` gère correctement les fins de mois
irrégulières. **`runBilling` appelle juste `payments.start()` sur chaque échéance
— aucune gestion d'échec** (pas de retry, pas de suspension automatique, pas de
notification). Aucun changement de formule, aucun prorata, aucun avis avant
renouvellement.

`commerce-coupons.tsx` (334 lignes, CRUD + désactivation) est complet.
`commerce-subscriptions.tsx` (179 lignes) : **liste + annulation seulement** — pause/
reprise **non exposées bien que routées** (`POST /subscriptions/{id}/pause|resume`
existent déjà côté serveur).

## 2. Écarts, classés

**Bloquant (abonnements)** : aucune gestion d'impayé ; aucun historique de
facturation visible en écran (le store le fournit via `cycles()`) ; pause/reprise
non exposées malgré route existante.

**Important** : coupon — pas de limite par client, pas de restriction produit/
catégorie, pas de cumul contrôlé ; abonnement — pas de changement de formule/
prorata, pas d'avis avant renouvellement.

**Confort** : génération de codes en lot, promotions automatiques sans code.

## 3. Plan de développement

**Tâche 1 — Écran abonnement complet** : exposer pause/resume/cancel (routes déjà
là), afficher `cycles()` (historique déjà là) — pur travail d'écran, aucune
nouvelle route. **À traiter en premier, quelques heures de travail pour un gain
immédiat.**

**Tâche 2 — Limite par client + restriction produit** : colonne
`maxRedemptionsPerCustomer` + compteur par `(code, customerId)` sur
`coupon_redemptions` (table existante) ; nouvelle table de jointure
`coupon_restrictions`.

**Tâche 3 — Machine à états impayé** : `dunning_attempts` sur `subscriptions` ou
nouvelle table, calendrier configurable (relance J+1/J+3/J+7 → suspension),
idempotence obligatoire (réutiliser le motif `periodKey` unique déjà utilisé par
`billOne`).

**Tâche 4 — Changement de formule** : `changePlan(id, newVariantId, { prorate })`
avec calcul de prorata explicite.

**Tâche 5 — Avis avant renouvellement** : délai configurable, réutilise
`@cogenta/channels`.

**Tâche 6 — Mesure** : agrégats coupons (usages, CA généré, remise consentie) et
abonnements (actifs, MRR, attrition) — agrégation seule, aucune nouvelle donnée.

## 4. Critères d'acceptation

- Pause, reprise et historique de facturation d'un abonnement sont visibles et
  actionnables depuis l'écran.
- Un paiement d'abonnement en échec déclenche une relance planifiée, puis une
  suspension, jamais silencieusement.
- Un coupon peut être limité par client et par produit/catégorie.

## 5. Tests exigés

- Concurrence : coupon avec `maxRedemptionsPerCustomer`, deux tentatives
  simultanées du même client, une seule acceptée.
- Idempotence : `runBilling` rejoué sur une échéance déjà tentée ne double jamais
  la relance ni la facturation.
- Bout en bout : pause → aucune facturation pendant la pause → reprise → reprise de
  la facturation au bon cycle.

## 6. Pièges connus

- L'idempotence de la relance est le piège central — réutiliser `periodKey`,
  jamais réinventer une clé d'unicité parallèle.
- Ne pas suspendre un abonnement sur le premier échec — respecter le calendrier de
  relance avant toute suspension automatique.

## 7. Décisions à trancher

Calendrier de relance par défaut (J+1/J+3/J+7 proposé) — à valider avant
implémentation, configurable ensuite.
