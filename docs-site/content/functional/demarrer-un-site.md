---
title: Démarrer un site
order: 1
---

# Démarrer un site

## Installer

`npm create cogenta` scaffold un site complet — schéma de contenu, thème,
base de données (SQLite par défaut, Postgres/MySQL/MariaDB toujours proposés
même sans serveur local détecté), une clé de signature d'authentification
générée automatiquement dans `.env`.

Un cahier des charges peut être téléversé pendant l'installation : un agent
en extrait un modèle de contenu et deux à cinq gabarits visuels, que vous
relisez **section par section** avant qu'une seule ligne ne soit appliquée —
rien n'est jamais appliqué automatiquement. Sans fournisseur IA configuré,
cette étape n'est même pas posée : l'installation produit exactement le même
site qu'avant, octet pour octet (R2). Le même flux existe après coup, depuis
l'admin — voir « Créer un site à partir d'un document » plus bas.

Des préréglages existent par **type de site** — vitrine, blog, magazine, portfolio,
documentation, association, restaurant, SaaS, boutique en ligne : un jeu de collections
de départ réaliste, **le thème dédié à ce type déjà actif**, une page d'accueil complète
(huit à douze sections avec visuels), des entrées de démonstration publiées avec leurs
images de couverture, les menus d'en-tête et de pied de page, l'accroche et les liens
sociaux, un skin cohérent, et des réglages de sécurité/cache déjà différenciés (le cache
de page, notamment, n'a pas le même bon défaut pour une boutique que pour un blog
statique). Le préréglage `blank` reste vierge. Les pages de gabarit (accueil, à propos) ne
portent pas de fil de commentaires ; les articles gardent le réglage du site.

## Se connecter la première fois

Un compte `admin` est créé pendant l'installation. Depuis la version qui
introduit le système de notices de l'admin (inspiré de WordPress), rien ne
bloque la première connexion — l'ancien blocage MFA obligatoire dès la
première session a été remplacé par une recommandation, visible et
actionnable, jamais bloquante.

## Créer un site à partir d'un document, depuis un site déjà installé

Le même agent que celui de l'installeur est aussi accessible **depuis
l'admin** (section Comptes → « Créer un site »), pour un site déjà en
production. La proposition (nouvelles collections, contenu de démonstration)
reste relisable et modifiable à tout moment ; **l'appliquer** — écrire
réellement de nouvelles collections dans le schéma du site — n'est possible
qu'en développement (`cogenta dev`), jamais contre un site en production :
le schéma d'un site en production est en lecture seule par décision actée
(ADR-0010), et appliquer un plan reviendrait à contourner cette règle par une
autre porte. Sur un site en production, cet écran reste utilisable pour
proposer et relire un plan — l'appliquer attend un passage en développement,
et le rapport le dit explicitement plutôt que de laisser croire que c'est
déjà pris en compte.

## Le tableau de bord

Premier écran après connexion : des widgets réordonnables et masquables
individuellement (résumé du contenu, santé du site, activité récente,
statistiques, tâches planifiées, à-faire, raccourcis, sauvegardes), une
préférence par personne et par navigateur, jamais un réglage du site. Ce que
le tableau de bord affiche dépend aussi des permissions de votre rôle — un
`editor` ne voit jamais un widget de chiffre d'affaires si son rôle n'a pas
la permission commerce correspondante.
