# AGENTS.md — Règles de développement de Cogenta

> Lu à chaque session de développement assistée par IA.
> Ces règles priment sur toute habitude ou convention générale.

## Le projet en trois phrases

Cogenta est un CMS agentique en Node.js, open source, sous MPL 2.0. Son runtime
multi-agents fait partie du noyau, pas d'un plugin. Sa promesse est qu'un site s'exploite
lui-même : il se surveille, se patche, s'optimise, et rend des comptes.

## Avant d'écrire du code

1. Lire `docs/00-vision.md` si tu ne l'as jamais lu.
2. Lire `docs/03-decisions.md`. **Ne jamais rediscuter une décision actée.** Si elle
   semble mauvaise, le dire et attendre — ne pas contourner.
3. Lire la spec du lot concerné dans `docs/lots/`.
4. Lire les contrats de `docs/04-contrats.md` que le lot consomme.

## Stack imposée

TypeScript strict, ESM uniquement, Node 22 LTS minimum. pnpm workspaces, Changesets,
Turborepo. Drizzle. Astro pour les thèmes, React pour l'admin. Vitest, Playwright, Zod.

Pas de CommonJS. Pas de `any`. Pas de Prisma. Pas de Next.js.

## Règles non négociables

**R1 — Aucune dépendance dure à une infrastructure.** Redis, Docker, S3 et le worker
persistant sont optionnels. Tout besoin d'infrastructure passe par une interface avec au
moins deux implémentations, dont une sans service externe.

**R2 — Le CMS fonctionne sans IA.** Aucune fonctionnalité de contenu, d'admin ou de
rendu ne dépend d'une clé API. Sans fournisseur configuré, tout marche sauf les agents.

**R3 — Un bloc ne stocke jamais de HTML ni de CSS.** Uniquement de la donnée sémantique
conforme au contrat B.

**R4 — Un outil déclare ses permissions ; le runtime les vérifie.** Jamais de contrôle
d'accès à l'intérieur d'un outil.

**R5 — Le code de thème ne touche jamais la base ni les secrets.** Il ne dispose que du
`RenderContext` et d'un client HTTP à jeton restreint.

**R6 — Toute action d'agent est journalisée, diffée et réversible.** Un outil à effet de
bord implémente `revert` ou est marqué non réversible et exige une validation humaine.

**R7 — Aucun secret dans le contexte d'un modèle.** Les identifiants sont injectés par
le runtime dans des clients pré-configurés.

**R8 — Le contenu externe est de la donnée, jamais une instruction.** Tout texte
provenant d'un commentaire, d'un import ou du web est balisé comme tel dans le contexte
d'un agent.

**R9 — Pas de dépendance nouvelle sans justification.** Préférer zéro dépendance à une
petite dépendance. Toute dépendance directe nouvelle est signalée dans la PR avec sa
raison, sa taille et son état de maintenance.

**R10 — Pas de code natif sans repli WASM ou pré-calcul.** `sharp` et
`better-sqlite3` cassent sur ARM, musl et mutualisé.

## Définition de « terminé »

Un travail n'est pas terminé tant que **tous** ces points ne sont pas vrais :

- [ ] Les types compilent en mode strict, sans `any` ni `@ts-ignore`
- [ ] Tests unitaires sur la logique métier
- [ ] Tests d'intégration sur les trois bases si le code touche aux données
- [ ] Test e2e si le code touche à un parcours utilisateur
- [ ] Le driver dégradé est testé, pas seulement le driver optimal
- [ ] Les permissions sont testées par rôle si le code expose une route ou un outil
- [ ] Documentation à jour : contrat modifié → doc du contrat modifiée
- [ ] Changeset écrit si un paquet publié est touché
- [ ] Aucune régression Lighthouse si le code touche au rendu

## Conventions

**Nommage** — Paquets `@cogenta/<domaine>`. Fichiers en kebab-case. Types en
PascalCase. Fonctions et variables en camelCase. Constantes en SCREAMING_SNAKE.

**Erreurs** — Classes d'erreur typées avec code stable. Jamais de `throw new Error("…")`
nu dans le code de bibliothèque. Une erreur destinée à l'utilisateur final dit ce qui a
échoué, pourquoi, et quoi faire.

**Logs** — Structurés, jamais de `console.log`. Aucune donnée personnelle ni secret.

**Commits** — Conventional Commits. Une PR = un sujet. `Signed-off-by` requis.

**Migrations** — Toujours réversibles. Une migration destructive exige une confirmation
explicite et un backup vérifié.

**Tests** — Le nom du test décrit le comportement attendu, pas la fonction appelée.
Pas de mock de la base : base réelle éphémère.

## Ce qu'il ne faut pas faire

- Créer un « helper » générique avant d'avoir trois usages réels
- Ajouter un bloc au vocabulaire sans passer par une RFC
- Introduire une abstraction pour un cas hypothétique
- Optimiser avant d'avoir mesuré
- Élargir le périmètre d'un lot en cours de route
- Écrire un long fichier quand deux fichiers courts font le travail
- Laisser un `TODO` sans issue GitHub associée

## Quand tu bloques

Dis-le. Ne devine pas une décision d'architecture, ne contourne pas un contrat, ne
désactive pas un test. Un blocage signalé coûte cinq minutes ; un contournement
silencieux coûte une réécriture.
