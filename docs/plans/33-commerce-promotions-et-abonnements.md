# 33 — Commerce : promotions et abonnements

> **État** : partiel — les coupons sont complets, les abonnements sont une liste avec
> un bouton d'annulation.
> **Écrans** : `routes/commerce-coupons.tsx` (334),
> `routes/commerce-subscriptions.tsx` (179)
> **API existante** : `/coupons`, `/subscriptions`
> **Effort** : 3–4 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

**Coupons** : `CouponStore` et les routes `/coupons/*` portaient déjà tout le modèle ;
seul l'écran manquait, et il a été livré. Code, type de remise, valeur, devise,
sous-total minimum.

**Abonnements** : `SubscriptionStore` a une arithmétique de dates soignée et testée —
31 janvier + 1 mois donne le 28 février, pas le 3 mars. C'est exactement le genre de
détail qui produit des facturations fausses quand il est bâclé. Il a été branché dans
`cogenta serve` pour la première fois en même temps que son écran, et **seule
l'annulation est exposée** — la seule action que le cahier des charges de l'écran
demandait.

## 2. Ce que font les CMS de référence

| Fonction | WooCommerce | Shopify | Cogenta |
|---|---|---|---|
| Coupon montant / pourcentage | ✅ | ✅ | ✅ |
| Minimum d'achat | ✅ | ✅ | ✅ |
| **Date de validité** | ✅ | ✅ | ? à vérifier |
| **Limite d'utilisation** (globale, par client) | ✅ | ✅ | ? à vérifier |
| Restriction produit / catégorie | ✅ | ✅ | ❌ |
| Livraison offerte | ✅ | ✅ | ❌ |
| Génération de codes en lot | plugin | ✅ | ❌ |
| Statistiques d'utilisation | ✅ | ✅ | ❌ |
| Promotions automatiques (sans code) | plugin | ✅ | ❌ |
| Abonnement : mettre en pause | plugin | ✅ | ❌ |
| Abonnement : changer de formule | plugin | ✅ | ❌ |
| Abonnement : relance d'impayé | plugin | ✅ | ❌ |
| Abonnement : historique de facturation | plugin | ✅ | ❌ |
| Abonnement : avis d'expiration de carte | plugin | ✅ | ❌ |

## 3. Écarts, classés

### Bloquants (côté abonnements)

1. **Pas de gestion d'impayé.** Un abonnement dont le paiement échoue n'a aucun
   traitement : ni relance, ni suspension, ni notification. C'est la première cause de
   perte de revenu sur un modèle par abonnement, et c'est aussi ce qui distingue une
   fonctionnalité d'abonnement d'une simple table de dates.
2. **Pas d'historique de facturation par abonnement.** On ne sait pas ce qui a été
   facturé, ni quand.

### Importants

3. **Vérifier la validité et les limites d'utilisation des coupons.** Si elles
   manquent, un code partagé publiquement est utilisable indéfiniment par n'importe
   qui — un vrai risque financier.
4. Pas de restriction produit/catégorie sur un coupon.
5. Pas de pause ni de changement de formule sur un abonnement.
6. Pas de statistiques d'utilisation des coupons : impossible de mesurer une campagne.
7. Pas d'avis avant renouvellement (obligatoire dans plusieurs juridictions).

### Confort

8. Génération de codes en lot.
9. Promotions automatiques sans code.

## 4. Plan de développement

### Tâche 1 — Vérifier et compléter les garde-fous des coupons

**Fichiers** : `packages/commerce/src/coupon/`, `routes/commerce-coupons.tsx`.

**Vérifier d'abord** ce que `CouponStore` porte déjà. Ce qui doit exister, faute de
quoi c'est prioritaire :

- date de début et de fin ;
- limite d'utilisation globale et par client ;
- compteur d'utilisations, avec incrément **dans la transaction qui applique la
  remise** — sinon deux commandes simultanées consomment la même dernière utilisation
  (exactement le problème que le test de concurrence du stock a déjà traité une fois
  dans ce paquet : reprendre son motif).

Écran : état (active / expirée / épuisée), compteur, période.

**Critère** : un coupon à usage unique utilisé simultanément par deux acheteurs n'est
accepté qu'une fois — prouvé par un test de concurrence réel avec contre-test.

### Tâche 2 — Restrictions et types de remise

**Fichiers** : `packages/commerce/src/coupon/`, moteur de totaux, écran.

Restriction par produit, variante ou catégorie ; livraison offerte comme type de
remise à part entière ; cumul autorisé ou non entre coupons.

Le moteur de totaux existe : ces règles s'y ajoutent, elles ne se recalculent pas dans
l'écran.

### Tâche 3 — Cycle de vie complet d'un abonnement

**Fichiers** : `packages/commerce/src/subscription/`, `admin/router.ts`, écran.

Actions : mettre en pause (avec reprise à une date), reprendre, changer de formule
(avec prorata), changer la date de facturation, modifier la quantité, annuler à la fin
de la période **ou** immédiatement (deux choses différentes, à distinguer à l'écran).

Détail d'un abonnement : formule, montant, périodicité, prochaine facturation,
historique complet des facturations avec leur résultat, moyen de paiement.

### Tâche 4 — Impayés

**Fichiers** : `packages/commerce/src/subscription/`, `payment/`, fiches
[28](28-taches-planifiees.md) et [38](38-notifications-et-notices.md).

Une machine à états explicite : échec → relance à J+1, J+3, J+7 → suspension →
annulation. Chaque étape configurable, chaque étape notifiée au client et au
commerçant.

Écran : liste des abonnements en impayé, avec le nombre de tentatives et la prochaine.

C'est une tâche planifiée : elle dépend du registre de la fiche 28, et elle doit être
**idempotente** — une relance envoyée deux fois parce que le processus a redémarré est
un incident client.

### Tâche 5 — Avis avant renouvellement et fin de moyen de paiement

**Fichiers** : `packages/commerce/src/subscription/`, `@cogenta/channels`.

- Avis avant renouvellement (délai configurable). Obligatoire dans plusieurs
  juridictions pour un abonnement reconduit tacitement ; un défaut sûr vaut mieux
  qu'une option qu'on oublie.
- Avis d'expiration prochaine du moyen de paiement, quand le pilote la connaît.

### Tâche 6 — Mesure

**Fichiers** : écrans, `admin/router.ts`.

Coupons : utilisations, chiffre d'affaires généré, remise consentie.
Abonnements : nombre d'actifs, revenu récurrent, taux d'attrition, durée de vie
moyenne.

Ces chiffres ne demandent aucune donnée nouvelle : ils s'agrègent depuis les commandes
et les abonnements existants.

## 5. Critères d'acceptation

- Un coupon à usage unique ne s'utilise qu'une fois, même sous concurrence.
- Un coupon expiré est refusé par le serveur, pas seulement masqué par l'écran.
- Un abonnement se met en pause, change de formule et s'annule de deux façons
  distinctes.
- Un impayé déclenche une suite de relances configurable et idempotente.
- Un renouvellement est annoncé à l'avance.
- Toute arithmétique reste en entier d'unité mineure.

## 6. Tests exigés

- Concurrence réelle sur le compteur d'utilisation d'un coupon, avec contre-test naïf.
- Unitaires : arithmétique de dates aux cas durs — 31 janvier, années bissextiles,
  changements d'heure (la suite existante est le point de départ, à étendre).
- Unitaires : prorata d'un changement de formule en milieu de période.
- Unitaires : idempotence de la relance d'impayé.
- Bout en bout : cycle complet d'abonnement, y compris pause et reprise.
- Permissions par rôle sur chaque action.
- Intégration trois bases — **jamais exécutée** (`BLOCKERS.md`).

## 7. Pièges connus

- **Le compteur d'utilisation d'un coupon est un problème de concurrence**, exactement
  comme le stock. Le paquet a déjà résolu ce problème une fois, avec un contre-test qui
  prouve que la version naïve échoue : reprendre ce motif, ne pas le réinventer.
- **L'arithmétique de dates est le piège classique des abonnements.** Le 31 janvier est
  déjà traité ; les changements d'heure et les fuseaux ne le sont peut-être pas.
- **Une relance envoyée deux fois est un incident.** Idempotence obligatoire, parce que
  le planificateur redémarre.
- **Une remise se calcule sur le serveur.** Un total recalculé dans l'écran est un
  écart qui finira par payer une commande au mauvais prix.
- **Annuler « à la fin de la période » et « immédiatement » sont deux choses.** Les
  confondre rembourse ou ne rembourse pas à tort.
- **Un renouvellement tacite non annoncé** expose juridiquement dans plusieurs pays.

## 8. Décisions à prendre

- Calendrier de relance par défaut (recommandation : J+1, J+3, J+7, puis suspension).
- Délai d'avis avant renouvellement (recommandation : 7 jours, activé par défaut).
- Cumul des coupons : interdit par défaut (recommandé, plus sûr financièrement).
