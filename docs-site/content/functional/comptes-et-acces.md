---
title: Comptes et accès
order: 6
---

# Comptes et accès

## Comptes et rôles

`/users` crée et gère les comptes. `/roles` définit les rôles disponibles
sur le site — quatre rôles livrés par défaut (`public`, `viewer`, `editor`,
`admin`), mais l'ensemble des rôles est **ouvert** : un site peut en déclarer
de nouveaux (par exemple `author`, avec la permission de modifier
« ses propres entrées », jamais celles d'un autre). Un rôle inconnu au
chargement du schéma est traité comme une erreur de configuration à
corriger, jamais comme un refus silencieux qui masquerait le problème.

## Sécurité du compte

Aucun blocage à la première connexion : un système de recommandations
visibles dans l'admin (inspiré de la manière dont WordPress affiche ses
notices) encourage l'activation de la double authentification sans jamais
empêcher de travailler tant qu'elle n'est pas activée.

## Clés API

`/api-keys` gère les clés utilisées par un client headless ou une intégration
externe pour appeler l'API REST/GraphQL de contenu — chaque clé porte les
permissions d'un rôle précis, jamais un accès total implicite.

## Journal d'audit

`/audit` — chaque action d'écriture significative (publication, suppression,
changement de réglage, exécution d'un outil par un agent) laisse une trace :
qui, quoi, quand, avec un diff quand c'est pertinent. C'est le même journal
que consultent les écrans d'historique d'agent — un seul système de
journalisation, pas deux qui pourraient diverger.
