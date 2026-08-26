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

## Vague 2 — corrections et extensions post-implémentation (2026-08-23)

> Les fiches 01 à 38 ci-dessus ont depuis été **intégralement implémentées**
> (soixante commits « fiche NN » sur `main` entre le 2026-08-19 et le 2026-08-22).
> Ni ce README ni `CLAUDE.md` n'en gardaient trace avant la fiche
> [69](69-mise-a-jour-documentation-projet.md) — voir son constat. La colonne
> « État actuel » des fiches 01-38 ci-dessus est donc **obsolète** pour toute fiche
> déjà fusionnée ; se fier au code, pas à cette page, avant de recoder quoi que ce
> soit qu'elle décrit comme manquant.
>
> Après une passe de QA en direct sur l'admin par l'utilisateur, 30 retours ont été
> analysés (un agent de recherche par thème, lecture du code réel avant toute
> proposition) et transformés en 31 nouvelles fiches, 39 à 69, au même gabarit que
> les précédentes. Constat transversal, revenu dans la majorité des recherches : le
> travail **serveur** existant dépasse souvent largement ce que l'écran admin en
> montre — plusieurs fiches ci-dessous sont d'abord du câblage d'API déjà écrite et
> testée, pas des fonctionnalités à construire depuis zéro.

### Fondations à construire en premier (débloquent plusieurs fiches)

| Fondation | Fiche qui la construit | Fiches qui en dépendent |
|---|---|---|
| Composant de pagination réutilisable | [67](67-observabilite-details-pagination-retention.md) tâche 1 | 46, 47, 61, 62 |
| Bibliothèque de prompts (« Prompt Settings ») | [45](45-prompt-settings.md) | 43 (bouton IA sur bloc), 44, 55 |
| Catalogue de fournisseurs IA | [56](56-fournisseurs-ia-catalogue-complet.md) | 55 |

Ces trois chantiers sont eux-mêmes indépendants l'un de l'autre — développables en
parallèle dès le jour 1, dans trois worktrees distincts.

### Décisions produit à prendre avant de coder (bloquent une partie, pas tout, de leur fiche)

| Fiche | Décision | Ce qui reste parallélisable en attendant |
|---|---|---|
| [43](43-cogenta-page-builder.md) | Élargir le plafond de blocs (RFC contrat B, ADR-0009) ou achever le registre de blocs de thème déjà à moitié câblé | Sous-chantiers A/B/D/E/F (motifs, copier-coller, personnalisation par variante sémantique, UX, import/export) — zéro impact contrat |
| [58](58-mcp-serveur-et-client-externe.md) | Sandboxing d'un serveur MCP externe (`spawn` d'un exécutable tiers) — revue `security-reviewer` obligatoire | Le renommage « MCP Server » et l'écran de gestion de clés côté serveur Cogenta |
| [63](63-roles-et-permissions-personnalises.md) | Où vivent les permissions d'un rôle personnalisé : fichier versionné (mode `cogenta dev`, cohérent ADR-0010) ou table de site (ADR requise) | Rien en amont — c'est la première tâche de la fiche |
| [47](47-formulaires-et-soumissions-premium.md) | Réintroduire un champ `file` (explicitement écarté par ADR-0026) | Logique conditionnelle, multi-étapes, notifications canaux, soumissions enrichies |

### Table de parallélisation

Numérotation continue à partir de 39. Une fiche sans dépendance listée est
démarrable immédiatement, dans son propre worktree, sans attendre aucune des
fondations ci-dessus (elle peut simplement en profiter si elles atterrissent
avant).

| # | Fiche | Dépend de | Taille |
|---|---|---|---|
| 39 | [Tableau de bord : widgets déplaçables et panneau de paramétrage](39-tableau-de-bord-widgets.md) | — | 1,5–2 j |
| 40 | [Diagnostics et messages d'erreur de configuration](40-diagnostics-erreurs-configuration.md) | — | 1–2 j |
| 41 | [Taxonomies : sous-catégories depuis l'éditeur](41-taxonomies-sous-categories.md) | — | 0,5–1 j |
| 42 | [Éditeur de texte riche : zone visible et enrichissement](42-editeur-texte-riche.md) | — | qq heures + 1–2 j |
| 43 | [Cogenta Page Builder (CPB)](43-cogenta-page-builder.md) | décision (voir ci-dessus) pour le sous-chantier C seulement | 4–5 j (+ inconnue pour C) |
| 44 | [Éditeur d'entrée : extrait et génération IA](44-editeur-entree-extrait-ia.md) | 45 (peut démarrer sans, migrer ensuite) | 1–1,5 j |
| 45 | [Prompt Settings](45-prompt-settings.md) | — (fondation) | 2–3 j |
| 46 | [Médiathèque : dossiers et gestion de fichiers](46-mediatheque-dossiers.md) | pagination (67) pour la tâche (d) seulement | 6–9 j |
| 47 | [Formulaires et soumissions : parité premium](47-formulaires-et-soumissions-premium.md) | décision `file` (voir ci-dessus) pour une tâche seulement | 12–16 j |
| 48 | [Apparence (thème du site) : bouton Personnaliser et métadonnées](48-apparence-site-personnaliser.md) | — | 3–4 j |
| 49 | [Apparence de l'admin : même traitement](49-apparence-admin-personnaliser.md) | — (aucun fichier partagé avec 48) | 2–3 j |
| 50 | [SEO éditoriale avancée](50-seo-avancee.md) | — | 3–4 j |
| 51 | [Cogenta Commerce : catalogue](51-commerce-catalogue.md) | — | 6–7 j |
| 52 | [Cogenta Commerce : commandes et clients](52-commerce-commandes-clients.md) | — | 7–9 j |
| 53 | [Cogenta Commerce : promotions et abonnements](53-commerce-promotions-abonnements.md) | — | 5–6 j |
| 54 | [Cogenta Commerce : réglages boutique](54-commerce-reglages-boutique.md) | — | 1–2 j |
| 55 | [Agents IA : création complète](55-agents-creation-complete.md) | 45, 56 | 2 j |
| 56 | [Fournisseurs IA : catalogue complet](56-fournisseurs-ia-catalogue-complet.md) | — (fondation) | 2–3 j |
| 57 | [Compétences : dossiers de référence standard](57-competences-dossiers-reference.md) | — | 2 j |
| 58 | [MCP : serveur Cogenta et client externe](58-mcp-serveur-et-client-externe.md) | décision sécurité (voir ci-dessus) pour le client externe seulement | variable |
| 59 | [Canaux : guides pas-à-pas](59-canaux-guides-pas-a-pas.md) | — | &lt; 1 semaine |
| 60 | [Générer le site : conscience contextuelle](60-generer-le-site-contextuel.md) | — | proche d'une tâche L19 |
| 61 | [Utilisateurs : cycle de vie complet](61-utilisateurs-cycle-de-vie.md) | — | 1,5 j |
| 62 | [Clés API : cycle de vie complet](62-cles-api-cycle-de-vie.md) | — | 2 j |
| 63 | [Rôles et permissions personnalisés](63-roles-et-permissions-personnalises.md) | décision (voir ci-dessus) | 3,5–7,5 j selon décision |
| 64 | [Analytics : courbes et tendances](64-analytics-courbes-tendances.md) | — | 2–3 j |
| 65 | [Import : déplacement vers Contenu et plateformes supplémentaires](65-import-contenu-plateformes.md) | — | 3–5 j |
| 66 | [Mises à jour : écran autonome](66-mises-a-jour-ecran-autonome.md) | — | 0,5–1 j |
| 67 | [Observabilité : détails, pagination transverse, rétention](67-observabilite-details-pagination-retention.md) | — (fondation pagination) | 5–7 j |
| 68 | [Réglages généraux : fuseau, format de date, langues, marque](68-reglages-generaux.md) | — | 2–3 j (+1–2 j si langues) |
| 69 | [Mise à jour de la documentation du projet](69-mise-a-jour-documentation-projet.md) | toutes les autres (tâche de clôture) | continu |

**Lecture** : hormis les quatre décisions ci-dessus et les trois fondations, les
**27 fiches restantes sont mutuellement indépendantes** — aucune ne modifie un
fichier qu'une autre touche, confirmé fiche par fiche pendant la recherche
(signalé explicitement quand deux fiches voisines partagent un risque, ex.
48/49). Elles sont donc développables en autant de worktrees isolés que de
capacité disponible, fusionnées une par une avec vérification complète avant et
après chaque fusion — même discipline que L22/L23/L24.

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
