# 34 — Commerce : réglages de la boutique

> **État** : **absent côté admin.** Taxes, livraison et paiement ont chacun un magasin
> côté serveur, testé — et **aucune route d'administration**.
> **Vérification** : les racines de `/api/commerce` sont `products`, `variants`,
> `orders`, `payments`, `customers`, `coupons`, `subscriptions`. Ni `tax`, ni
> `shipping`, ni `payment-methods`.
> **Serveur existant** : `packages/commerce/src/tax/store.ts`,
> `shipping/store.ts`, `payment/registry.ts`, `payment/stripe.ts`,
> `payment/manual.ts`, `invoice/`
> **Effort** : 5–6 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Beaucoup, côté serveur, et **rien** côté écran :

- **Taxes par zone**, résolues **par spécificité et non par ordre d'insertion** — un
  détail qui compte : une règle « France » doit l'emporter sur une règle « Europe »
  quel que soit l'ordre de création. Taux en points de base.
- **Livraison** avec un pilote transporteur optionnel qui **retombe sur le tarif
  stocké quand l'API du courrier tombe** — comportement dégradé réel, pas un échec.
- **Paiement** : registre de pilotes, Stripe réel (webhook signé, vérification en temps
  constant, fenêtre de fraîcheur), virement bancaire en dégradé.
- **Factures** : numérotation séquentielle par compare-and-set transactionnel,
  génération PDF sans dépendance, `billing` en configuration (`legalName`, `address`,
  `taxId`, `footer`).

Donc : une boutique Cogenta ne peut **configurer ni ses taxes, ni ses frais de port,
ni ses moyens de paiement** depuis l'admin. Tout se fait par code ou par écriture
directe en base.

## 2. Ce que font les CMS de référence

| Fonction | WooCommerce | Shopify | Cogenta |
|---|---|---|---|
| Zones de taxe et taux | ✅ | ✅ | serveur seulement |
| Prix TTC ou HT affichés | ✅ | ✅ | ? |
| Numéro de TVA intracommunautaire | plugin | ✅ | partiel (`taxId`) |
| Zones de livraison et tarifs | ✅ | ✅ | serveur seulement |
| Livraison gratuite au-delà de X | ✅ | ✅ | ❌ |
| Retrait en magasin | ✅ | ✅ | ❌ |
| Moyens de paiement activables | ✅ | ✅ | serveur seulement |
| Clés de paiement depuis l'admin | ✅ | ✅ | ❌ (configuration) |
| Mode test | ✅ | ✅ | ? |
| Devises multiples | plugin | ✅ | ? |
| Modèle de facture, mentions légales | plugin | ✅ | configuration |
| Conditions générales de vente | ✅ | ✅ | ❌ |
| Pays servis | ✅ | ✅ | ❌ |

## 3. Écarts, classés

### Bloquants

1. **Aucun écran de taxes.** Une boutique française doit appliquer 20 %, 10 %, 5,5 % et
   2,1 % selon les produits, et ne peut aujourd'hui les déclarer que par code.
2. **Aucun écran de livraison.** Aucun tarif de port configurable.
3. **Aucun écran de paiement.** Impossible de savoir quels moyens sont actifs, ni de
   basculer en mode test.

Autrement dit : **le back-office commerce est utilisable, la boutique ne peut pas être
paramétrée.** C'est le plus gros écart du domaine commerce.

### Importants

4. Pas de choix d'affichage TTC/HT — décision structurante pour un marché
   grand public en Europe.
5. Pas de pays servis : une commande arrive d'un pays qu'on ne livre pas.
6. Pas de CGV, alors qu'elles sont obligatoires pour vendre.
7. Le modèle de facture n'est configurable que par le fichier.

## 4. Plan de développement

### Tâche 0 — Où vivent ces réglages ?

Reprendre la classification de la fiche [23](23-reglages-du-site.md) :

- **Taxes, livraison, pays servis, affichage TTC/HT, CGV** → réglages **éditoriaux**,
  en base, modifiables depuis l'admin. Ils changent sans déploiement, et ils sont
  décidés par le commerçant, pas par le développeur.
- **Clés d'API de paiement** → **secrets**. Ils restent dans la configuration ou
  l'environnement, jamais en base et jamais affichés. L'admin montre s'ils sont
  présents et valides ; il ne les montre pas et ne les écrit pas.

Cette séparation n'est pas un détail : c'est ce qui empêche l'écran de paiement de
devenir une fuite de clé.

### Tâche 1 — Taxes

**Fichiers** : `packages/commerce/src/tax/store.ts` (existe),
`admin/router.ts` (routes à créer), nouvelle route admin.

- Zones (pays, région, code postal) et taux par zone et par classe de produit
  (standard, réduit, super-réduit, zéro).
- Classe de taxe par produit ou variante (fiche [31](31-commerce-catalogue.md)).
- **Un simulateur** : « une commande de X, livrée en Y, contenant Z » → le détail du
  calcul. C'est le seul moyen de vérifier une configuration fiscale sans passer une
  vraie commande, et c'est ce qui rend l'écran fiable.
- L'écran doit rendre visible la **résolution par spécificité** : montrer quelle règle
  s'applique et pourquoi elle l'emporte.

**Critère** : configurer les quatre taux français et vérifier au simulateur qu'un livre
est à 5,5 % et un ordinateur à 20 %.

### Tâche 2 — Livraison

**Fichiers** : `packages/commerce/src/shipping/store.ts`, routes, écran.

- Zones de livraison, méthodes par zone (forfait, par poids, par montant, gratuite
  au-delà d'un seuil, retrait).
- Délais annoncés.
- Pilote transporteur : activation, et **comportement de repli visible** — l'écran doit
  dire « tarif du transporteur, avec repli sur le tarif stocké si l'API ne répond
  pas ». C'est une garantie de robustesse, elle mérite d'être montrée.
- Poids et dimensions viennent de la fiche [31](31-commerce-catalogue.md) tâche 5.

### Tâche 3 — Paiement

**Fichiers** : `packages/commerce/src/payment/registry.ts`, routes, écran.

- Liste des pilotes disponibles, activables un par un.
- **Présence** des clés, pas leur valeur : « clé Stripe configurée ✓ », jamais la
  chaîne, jamais un champ pré-rempli avec des astérisques qui pourrait être renvoyé.
- Mode test / production visible en gros — une boutique en mode test qui croit encaisser
  est un incident coûteux.
- Bouton « tester la connexion » qui appelle l'API du fournisseur et rend l'erreur
  exacte.
- URL du webhook à copier, avec l'état du dernier événement reçu — l'erreur numéro un
  d'une intégration Stripe est un webhook mal configuré, silencieux.
- Virement : instructions affichées au client (IBAN, référence).

### Tâche 4 — Réglages généraux de la boutique

**Fichiers** : réglages (fiche 23), écran.

Devise et format, affichage TTC ou HT, pays servis, seuil de commande minimum,
politique de stock (autoriser la vente à découvert par défaut), CGV et politique de
retour (des entrées de contenu, pas des champs de texte — elles doivent être des pages
publiques), mentions de facture.

### Tâche 5 — Facture configurable

**Fichiers** : `packages/commerce/src/invoice/pdf.ts`, réglages, écran.

Logo, mentions légales, conditions de paiement, préfixe et série de numérotation,
langue. Prévisualisation sur une commande réelle.

**Ne pas casser la numérotation** : le préfixe et la série sont configurables, le
compteur reste pris par compare-and-set dans la transaction. Changer une série en
cours d'exercice comptable doit être refusé ou fortement averti.

## 5. Critères d'acceptation

- Une boutique se configure entièrement depuis l'admin, sauf ses secrets.
- Aucune clé de paiement n'est affichée ni stockée en base.
- Le mode test est visible sans ambiguïté.
- Le simulateur de taxe donne le même résultat que le moteur de totaux réel — même
  code, pas une seconde implémentation.
- Le repli du pilote transporteur reste actif et visible.
- La numérotation de facture reste sûre sous concurrence.

## 6. Tests exigés

- Unitaires : résolution de taxe par spécificité, sur des zones qui se recouvrent, dans
  les deux ordres d'insertion.
- Unitaires : le simulateur appelle le moteur réel (test d'égalité, pas d'égalité
  approchée).
- Bout en bout : commande avec taxe et port calculés, facture émise, montants
  cohérents de bout en bout.
- Bout en bout : API transporteur indisponible → repli sur le tarif stocké.
- Sécurité : aucune route ne renvoie une clé de paiement — test explicite.
- Permissions : ces réglages relèvent de `commerce.catalog.write` ou d'`admin` —
  trancher et tester.
- Intégration trois bases — **jamais exécutée** (`BLOCKERS.md`).

## 7. Pièges connus

- **Un écran de paiement est une fuite de clé en puissance.** Présence, jamais valeur.
  Et pas de champ « mot de passe » pré-rempli, dont le contenu pourrait repartir dans
  une requête.
- **Le mode test doit être criant.** Une boutique qui encaisse en test perd de
  l'argent en silence.
- **La résolution par spécificité est déjà correcte côté serveur.** Un écran qui la
  réimplémenterait pour « prévisualiser » finirait par afficher un autre résultat que
  celui appliqué. Le simulateur appelle le moteur.
- **Changer une série de facture en cours d'exercice** est un problème comptable.
- **Le repli du transporteur est une fonctionnalité, pas un bug.** Le montrer.
- **Les CGV doivent être une page publique**, pas un champ de réglage : elles doivent
  être consultables, versionnées et liées depuis la commande.

## 8. Décisions à prendre

- Permission requise : `admin` (recommandé, ce sont des réglages financiers) ou
  `commerce.catalog.write`.
- Affichage TTC ou HT : réglage, avec un défaut par pays.
- Multi-devises : hors périmètre de la première version, à confirmer.
