# Plans d'achèvement de la console d'administration

> Rédigé le 2026-08-19, à partir d'un audit **réel** du code de `packages/admin`,
> `packages/api` et `packages/commerce` — pas d'une lecture des documents de lot.
> Chaque fiche dit d'abord ce qui existe vraiment, avec les chemins de fichiers,
> avant de dire ce qui manque.

## Pourquoi ce document existe

L'admin de Cogenta n'est pas vide : 38 écrans existent, la plupart appellent de
vraies routes API et respectent de vraies permissions. Mais presque tous se sont
arrêtés au **premier niveau utile** : lister, créer, supprimer. Ce qui manque est
le deuxième niveau — celui qui fait qu'un CMS est utilisable une journée entière
sans ouvrir un terminal : modifier ce qu'on a créé, agir sur dix lignes à la fois,
retrouver quelque chose, comprendre pourquoi une action a échoué.

Un exemple qui résume le reste : `packages/admin/src/fields/relation-field.tsx`
fait 22 lignes et **n'affiche qu'une phrase**. Un champ `relation` déclaré dans un
schéma est donc, aujourd'hui, non éditable depuis l'admin — alors que la relation
est un type de champ de premier niveau du contrat A, avec sa clé étrangère, ses
tests d'intégration et son `onDelete: 'restrict'`. Tout le travail serveur est là.
L'écran manque.

## Comment lire une fiche

Chaque fiche suit le même plan :

1. **Ce qui existe réellement** — vérifié dans le code, avec les chemins.
2. **Ce que font les CMS de référence** — WordPress 6.x, Strapi 5, Drupal 11,
   Joomla 5, et Sanity/Contentful quand la comparaison est plus juste.
3. **Écarts, classés** — bloquant / important / confort. Un écart bloquant est un
   écart qui oblige à ouvrir un terminal ou une base de données.
4. **Plan de développement** — des tâches ordonnées, chacune avec ses fichiers,
   son travail et son critère d'acceptation.
5. **Critères d'acceptation** du lot entier.
6. **Tests exigés** — au sens d'`AGENTS.md` § « Définition de terminé ».
7. **Pièges connus.**
8. **Décisions à prendre** — et notamment : cette fiche a-t-elle besoin d'une ADR
   avant qu'on écrive une ligne ?

## Règles qui s'appliquent à toutes les fiches

Elles viennent d'`AGENTS.md` et de `docs/03-decisions.md`, et aucune fiche ne les
rediscute :

- **R9** — pas de dépendance nouvelle sans justification écrite dans la PR. Plusieurs
  fiches proposent explicitement du code maison plutôt qu'une bibliothèque.
- **R4** — la permission est vérifiée par le serveur. Masquer un bouton est une
  politesse, jamais le contrôle.
- **Contrats A, B, C, D figés.** Toute fiche qui a besoin d'un nouveau type de champ,
  d'un nouveau bloc ou d'un nouveau statut le signale comme **ADR requise** et ne
  code rien avant.
- **ADR-0010** — le schéma est en lecture seule en production. Aucune fiche ne
  propose d'éditeur de modèle de contenu qui écrirait `cogenta.schema.*` en prod.
- **ADR-0022** — `deletedAt` est orthogonal à `status`. La corbeille n'est pas un
  statut.
- Les documents de conception sont en **français**, le code et les commits en
  **anglais**.

## Ordre recommandé

Il n'est pas obligatoire — chaque fiche est autonome — mais il minimise le travail
refait. Les fiches marquées **socle** débloquent plusieurs autres.

| Vague | Fiches | Pourquoi d'abord |
|---|---|---|
| 1 — socle éditorial | 03, 01, 02 | Un champ `relation` non éditable rend plusieurs schémas inutilisables. Les listes et l'éditeur sont l'écran où passent 90 % du temps. |
| 2 — le quotidien | 11, 04, 08, 09, 07 | Médias, texte riche, taxonomies, menus, corbeille : ce qu'un éditeur touche chaque jour. |
| 3 — le trou visible | 23, 13, 26, 24 | Réglages (aujourd'hui : une seule option), SEO, export/sauvegarde, santé. |
| 4 — les absents | 15, 16, 37, 19 | Commentaires, formulaires, workflow éditorial, rôles. Nouveaux domaines, ADR probable. |
| 5 — exploitation | 22, 36, 35, 38, 21, 27, 28 | Tableau de bord, recherche, coquille, notices, audit, analytics, tâches. |
| 6 — reste | 05, 06, 10, 12, 14, 17, 18, 20, 25, 29, 30 | Consolidation. |
| 7 — commerce | 31, 32, 33, 34 | Domaine à part (contrat E), livrable indépendamment. |

## Index

### Contenu

| # | Fiche | État actuel | Effort |
|---|---|---|---|
| 01 | [Liste de contenu](01-liste-de-contenu.md) | Partiel | 4–6 j |
| 02 | [Éditeur d'entrée](02-editeur-d-entree.md) | Partiel | 8–12 j |
| 03 | [Champs de formulaire](03-champs-de-formulaire.md) | **Incomplet — bloquant** | 8–10 j |
| 04 | [Éditeur de texte riche](04-editeur-texte-riche.md) | Partiel | 6–8 j |
| 05 | [Page builder visuel](05-page-builder.md) | Bon | 4–5 j |
| 06 | [Versions et historique](06-versions-et-historique.md) | Partiel | 3–4 j |
| 07 | [Corbeille](07-corbeille.md) | Minimal | 2–3 j |
| 08 | [Taxonomies](08-taxonomies.md) | **Minimal — pas d'édition** | 4–5 j |
| 09 | [Menus](09-menus.md) | Partiel | 3–4 j |
| 10 | [Traductions et multilingue](10-traductions.md) | Partiel | 4–5 j |

### Médias

| # | Fiche | État actuel | Effort |
|---|---|---|---|
| 11 | [Médiathèque](11-mediatheque.md) | Minimal | 6–8 j |

### Structure du site

| # | Fiche | État actuel | Effort |
|---|---|---|---|
| 12 | [Redirections](12-redirections.md) | Minimal | 2–3 j |
| 13 | [SEO éditorial](13-seo.md) | **Absent côté admin** | 5–6 j |
| 14 | [Apparence et thème](14-apparence-et-theme.md) | **Absent côté admin** | 6–8 j |

### Interaction avec les visiteurs

| # | Fiche | État actuel | Effort |
|---|---|---|---|
| 15 | [Commentaires](15-commentaires.md) | **Absent partout** | 10–14 j |
| 16 | [Formulaires et soumissions](16-formulaires.md) | **Absent partout** | 10–14 j |

### Comptes et sécurité

| # | Fiche | État actuel | Effort |
|---|---|---|---|
| 17 | [Utilisateurs](17-utilisateurs.md) | Bon | 3–4 j |
| 18 | [Profil et authentification](18-profil-et-authentification.md) | Bon | 3–4 j |
| 19 | [Rôles et permissions](19-roles-et-permissions.md) | **Absent côté admin** | 5–7 j |
| 20 | [Clés d'API](20-cles-api.md) | Bon | 2–3 j |
| 21 | [Journal d'audit](21-journal-d-audit.md) | Bon | 2–3 j |

### Exploitation

| # | Fiche | État actuel | Effort |
|---|---|---|---|
| 22 | [Tableau de bord](22-tableau-de-bord.md) | Partiel | 4–5 j |
| 23 | [Réglages du site](23-reglages-du-site.md) | **Une seule option** | 6–8 j |
| 24 | [Santé et outils](24-sante-et-outils.md) | Partiel | 4–5 j |
| 25 | [Import](25-import.md) | Partiel | 4–5 j |
| 26 | [Export et sauvegarde](26-export-et-sauvegarde.md) | **Absent** | 6–8 j |
| 27 | [Analytics](27-analytics.md) | Minimal | 4–5 j |
| 28 | [Tâches planifiées](28-taches-planifiees.md) | **Absent côté admin** | 3–4 j |

### Écosystème

| # | Fiche | État actuel | Effort |
|---|---|---|---|
| 29 | [Extensions et marketplace](29-extensions-et-marketplace.md) | Bon | 3–4 j |
| 30 | [Agents et assistant IA](30-agents-et-assistant-ia.md) | Partiel | 5–6 j |

### Commerce (contrat E)

| # | Fiche | État actuel | Effort |
|---|---|---|---|
| 31 | [Catalogue](31-commerce-catalogue.md) | Partiel | 5–6 j |
| 32 | [Commandes et clients](32-commerce-commandes-et-clients.md) | Partiel | 5–7 j |
| 33 | [Promotions et abonnements](33-commerce-promotions-et-abonnements.md) | Partiel | 3–4 j |
| 34 | [Réglages boutique](34-commerce-reglages-boutique.md) | **Absent côté admin** | 5–6 j |

### Transverse

| # | Fiche | État actuel | Effort |
|---|---|---|---|
| 35 | [Coquille et navigation](35-coquille-et-navigation.md) | Partiel | 3–4 j |
| 36 | [Recherche globale](36-recherche-globale.md) | Partiel | 3–4 j |
| 37 | [Workflow éditorial](37-workflow-editorial.md) | **Absent** | 8–10 j |
| 38 | [Notifications et notices](38-notifications-et-notices.md) | Partiel | 3–4 j |

## Ce que cet ensemble ne couvre pas

Volontairement, et pas par oubli :

- **L'éditeur de modèle de contenu dans l'admin** (« créer un type d'article depuis
  l'interface », comme Strapi ou les ACF de WordPress). ADR-0010 l'interdit en
  production. La fiche [24](24-sante-et-outils.md) explique ce qui est possible sans
  la contredire, et [19](19-roles-et-permissions.md) traite le cas voisin des rôles.
- **Le déploiement et l'hébergement.** `docs/hebergement-mutualise.md` couvre le
  sujet, et `cogenta deploy` reste honnêtement différée.
- **Le multi-site / la flotte.** `@cogenta/fleet` existe et a son propre écran ;
  ce n'est pas une fonctionnalité de la console d'un site.
