---
title: Vendre en ligne
order: 4
---

# Vendre en ligne

**Portée volontairement sommaire ici** — la boutique mérite son propre guide
détaillé, pas encore écrit ; cette page pose la structure et les écrans
réels.

Un site qui ne vend jamais rien ne crée aucune table commerce (contrat E est
un domaine de données séparé du contenu, jamais une extension du contrat A —
une commande n'a pas de brouillon, pas de traduction par langue, et se
restaure encore moins qu'un article).

- **`/commerce/products`** — catalogue, variantes, stock. Une fiche produit
  peut se lier à une entrée de contenu classique (`contentRef`) pour hériter
  de son texte riche, ses blocs, son SEO et sa traduction, sans les
  réimplémenter.
- **`/commerce/orders`** — commandes, statuts (`pending → paid → shipped →
  delivered`, plus `cancelled`/`refunded`), historique complet de chaque
  commande.
- **`/commerce/coupons`** — coupons en pourcentage, montant fixe ou livraison
  offerte, avec fenêtre de validité et compteur d'utilisation.
- **`/commerce/subscriptions`** — abonnements, avec une arithmétique de date
  qui traite un mois calendaire correctement (31 janvier + un mois donne le
  28 février, jamais le 3 mars).
- **`/commerce/tax`**, **`/commerce/shipping`**, **`/commerce/payment`** —
  taxes par zone, transporteurs, et le moyen de paiement effectif (Stripe, ou
  virement bancaire en repli — la boutique fonctionne de bout en bout même
  sans clé Stripe configurée).
- **`/commerce/settings`** — devise, réglages généraux de la boutique.

Toute somme d'argent est stockée en entier (centimes, jamais un nombre
flottant) — un détail invisible depuis l'admin, mais qui garantit qu'un total
affiché est toujours exactement celui qui a été facturé.
