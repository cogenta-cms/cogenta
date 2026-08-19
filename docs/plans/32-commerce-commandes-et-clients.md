# 32 — Commerce : commandes, clients, factures

> **État** : partiel — les commandes sont bien traitées, les clients sont une liste,
> les factures existent sans écran dédié.
> **Écrans** : `routes/commerce-orders.tsx` (149),
> `routes/commerce-order-detail.tsx` (355)
> **API existante** : `/orders`, `/orders/{id}`, `/orders/{id}/status`,
> `/payments/{id}/settle`, `/payments/{id}/refund`, `/customers`,
> `/orders/{id}/invoice`, `/orders/{id}/invoice/pdf`
> **Effort** : 5–7 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- **Table de transitions fermée** côté serveur, avec un historique append-only.
  L'écran de détail **ne la duplique pas** : chaque action relit la commande plutôt que
  de deviner le nouvel état localement. C'est la bonne façon.
- Détail complet : lignes, historique, paiements, et les actions réelles (avancer,
  encaisser, rembourser).
- **Deux pilotes de paiement** : Stripe réel via `fetch` sans la dépendance `stripe`,
  avec vérification de signature de webhook en temps constant et fenêtre de fraîcheur ;
  et virement bancaire en mode dégradé, qui n'est pas un bouchon.
- **Factures PDF sans aucune dépendance** (R9/R10), vérifiées ouvrables par un vrai
  `pdftotext`, à numérotation séquentielle prise par compare-and-set **dans la
  transaction qui écrit la facture**.
- **`commerce.payment.settle` et `commerce.order.refund` sont deux permissions
  distinctes** : l'argent qui entre et l'argent qui sort ne se confondent pas.
- Une route `/customers` en lecture existe ; **aucun écran ne l'utilise.**

## 2. Ce que font les CMS de référence

| Fonction | WooCommerce | Shopify | Cogenta |
|---|---|---|---|
| Liste des commandes, filtres | ✅ | ✅ | partiel |
| Détail, lignes, historique | ✅ | ✅ | ✅ |
| Changer le statut | ✅ | ✅ | ✅ |
| Encaisser / rembourser | ✅ | ✅ | ✅ |
| **Remboursement partiel** | ✅ | ✅ | pilote ✅, écran ❌ |
| **Fiche client** | ✅ | ✅ | ❌ (liste seule) |
| Historique d'achat d'un client | ✅ | ✅ | ❌ |
| Créer une commande manuellement | ✅ | ✅ | ❌ |
| Modifier une commande (ajouter une ligne) | ✅ | ✅ | ❌ |
| Étiquette d'expédition / n° de suivi | ✅ | ✅ | ❌ |
| E-mails transactionnels | ✅ | ✅ | ❌ |
| **Facture PDF** | plugin | ✅ | ✅ |
| Avoir / note de crédit | plugin | ✅ | ❌ |
| Export comptable | plugin | ✅ | ❌ |
| Notes internes | ✅ | ✅ | partiel (`note`) |

## 3. Écarts, classés

### Bloquants

1. **Aucun e-mail transactionnel.** Un client qui commande ne reçoit **rien** : ni
   confirmation, ni avis d'expédition, ni facture. Pour une boutique, ce n'est pas un
   manque de confort, c'est un défaut disqualifiant.
2. **Pas de fiche client.** La route existe, l'écran non. On ne peut pas répondre à
   « ce client a-t-il déjà commandé ? ».
3. **Pas de numéro de suivi.** « Expédié » sans suivi déclenche un appel client à
   chaque commande.

### Importants

4. Pas de commande manuelle (vente par téléphone, correction).
5. Pas de modification de commande après création.
6. **Remboursement partiel : le pilote le fait, l'écran non.** Vérifié —
   `packages/commerce/src/payment/stripe.ts` envoie toujours le montant explicitement,
   avec un commentaire qui dit pourquoi (« omettre le montant rembourse la totalité,
   ce qui n'est pas ce qu'un remboursement partiel a demandé »). Ce qui manque est
   donc uniquement l'interface : choisir les lignes ou le montant à rembourser.
7. Pas d'avoir : un remboursement sans note de crédit est un problème comptable dans
   plusieurs pays.
8. Pas d'export comptable.
9. Filtres de la liste limités.

## 4. Plan de développement

### Tâche 1 — E-mails transactionnels

**Fichiers** : `packages/commerce/src/order/`, `@cogenta/channels` (réutilisation),
réglages.

Modèles pour : confirmation de commande, paiement reçu, expédition (avec le suivi),
livraison, annulation, remboursement, facture jointe.

- Réutiliser l'adaptateur e-mail de `@cogenta/channels` et ses erreurs typées
  (`CHANNEL_EMAIL_TRANSPORT_ERROR`). Ne pas écrire un second transport.
- Modèles éditables depuis l'admin, avec des variables nommées et une prévisualisation.
- **File d'attente et reprise** : un e-mail de confirmation qui échoue ne doit pas
  faire échouer la commande, et ne doit pas être perdu non plus. La file existe.
- Journal des envois, visible sur la commande — « confirmation envoyée à … le … » est
  la première chose qu'on cherche quand un client dit n'avoir rien reçu.

**Critère** : une commande passée déclenche une confirmation reçue, et son envoi est
visible sur la commande.

### Tâche 2 — Fiche client

**Fichiers** : `packages/commerce/src/customer/store.ts` (existe),
`packages/commerce/src/admin/router.ts`, nouvelle route admin.

Liste avec recherche, et fiche : coordonnées, adresses, commandes, total dépensé,
panier moyen, abonnements, factures. Notes internes.

**RGPD** : bouton d'export des données du client et d'anonymisation — un client peut
le demander, et une boutique doit pouvoir répondre. À relier à la fiche
[26](26-export-et-sauvegarde.md) tâche 6.

### Tâche 3 — Expédition et suivi

**Fichiers** : `packages/commerce/src/order/`, `shipping/store.ts`, écran de détail.

Transporteur, numéro de suivi, URL de suivi, date d'expédition, expédition partielle
(certaines lignes seulement). Le numéro de suivi part dans l'e-mail d'expédition.

Le pilote transporteur optionnel existe déjà et retombe sur le tarif stocké quand
l'API du courrier tombe — comportement à préserver.

### Tâche 4 — Commande manuelle et modification

**Fichiers** : `packages/commerce/src/order/`, `admin/router.ts`, écran.

- Créer une commande depuis l'admin : client, lignes, remise, mode de paiement.
- Modifier une commande **avant paiement** : ajouter, retirer, ajuster.
- Après paiement : la commande est figée ; les corrections passent par un remboursement
  ou un avoir. C'est une règle comptable, à écrire à l'écran plutôt qu'à contourner.

Chaque modification passe par la table de transitions du serveur et écrit dans
l'historique append-only. **Ne jamais court-circuiter.**

### Tâche 5 — Remboursement partiel et avoir

**Fichiers** : `packages/commerce/src/payment/`, `invoice/`, écran.

- Vérifier le remboursement partiel dans le pilote ; l'ajouter s'il manque, ligne par
  ligne ou par montant, avec un motif obligatoire.
- **Avoir** : un document numéroté dans sa propre série, référençant la facture
  d'origine, produit par le même générateur PDF sans dépendance. La numérotation doit
  utiliser le même compare-and-set transactionnel — c'est ce qui garantit qu'aucun
  numéro n'est sauté ni dupliqué.

### Tâche 6 — Liste, filtres, export comptable

**Fichiers** : `admin/router.ts`, `routes/commerce-orders.tsx`.

Filtres par statut, période, montant, client, mode de paiement ; recherche par numéro
et par e-mail ; pagination ; totaux de la période affichée.

Export comptable : CSV des commandes et des factures d'une période, avec la TVA par
taux — c'est ce que demande un comptable, et le format doit être **stable et
documenté**, parce qu'il sera importé ailleurs.

## 5. Critères d'acceptation

- Un client reçoit une confirmation, un avis d'expédition avec suivi, et sa facture.
- Un échec d'envoi n'annule pas la commande et n'est pas perdu.
- On répond à « ce client a-t-il déjà commandé ? » en un écran.
- Aucun numéro de facture n'est sauté ni dupliqué, sous concurrence.
- Une commande payée ne se modifie pas ; elle se corrige par remboursement ou avoir.
- Rembourser reste une permission distincte d'encaisser.

## 6. Tests exigés

- Bout en bout : cycle complet — commande, paiement, expédition, facture, remboursement
  partiel, avoir.
- Concurrence : deux factures émises simultanément → deux numéros consécutifs, aucun
  doublon (rejouer le motif du test de stock).
- Unitaires : arithmétique du remboursement partiel, en unité mineure, aux bornes.
- Sécurité : signature de webhook Stripe — rejeu, fenêtre de fraîcheur, signature
  invalide.
- Permissions par rôle : `shopkeeper` encaisse mais ne rembourse pas ; `editor` ne
  touche à rien de tout cela.
- Intégration trois bases — **jamais exécutée** (`BLOCKERS.md`).
- Bac à sable Stripe réel — **jamais exécuté**, faute de clé humaine (`BLOCKERS.md`).

## 7. Pièges connus

- **Un e-mail transactionnel qui échoue ne doit jamais faire échouer la commande.**
  L'inverse — perdre l'e-mail en silence — est tout aussi mauvais. D'où la file.
- **La numérotation de facture est le point le plus délicat du domaine.** Le
  compare-and-set dans la transaction est ce qui la protège ; toute nouvelle série
  (avoirs) doit reprendre le même mécanisme.
- **Une commande payée est un document comptable.** La modifier a des conséquences
  légales.
- **La table de transitions vit sur le serveur.** L'écran ne la duplique pas
  aujourd'hui ; ne pas commencer.
- **Les données client sont personnelles.** Export, anonymisation, rétention.
- **Le bac à sable Stripe n'a jamais tourné** et les intégrations trois bases non
  plus. Deux angles morts réels, documentés.

## 8. Décisions à prendre

- Format d'export comptable : à figer et documenter dès la première version.
- Modification d'une commande payée : interdite (recommandé) ou autorisée avec trace
  renforcée.
