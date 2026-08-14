# CLAUDE.md

Ce fichier est le point d'entrée de toute session de développement assistée sur Cogenta.

## Règles de développement

@AGENTS.md

## Avant d'écrire du code

Dans cet ordre, sans sauter d'étape :

1. `docs/00-vision.md` — si jamais lu.
2. `docs/03-decisions.md` — **une décision actée ne se rediscute pas.** Si elle semble
   mauvaise, le dire et attendre. Ne pas contourner.
3. `docs/lots/<lot en cours>.md` — périmètre, interfaces à produire, critères
   d'acceptation, pièges connus.
4. `docs/04-contrats.md` — uniquement les contrats que le lot consomme.

La commande `/lot <L0..L9>` fait ce chargement pour toi.

## État courant

| Élément | Valeur |
|---|---|
| Lot en cours | **L9 — Écosystème** (`docs/lots/L9-ecosysteme.md`) — installeur, skin IA, blueprints, imports, CLI, hébergement mutualisé, documentation, gouvernance. **Tâche 3 faite** : blueprint « blog » (`packages/create-cogenta/src/blueprints/blog.ts`), premier blueprint réel au-delà de `blank`. Trois collections (`post`, `category`, `tag`) via `defineCollection`/`f.*`, validées par `validateCollectionSet` au chargement du module — jamais réinventées côté outil : `post` réutilise `SystemFields.status`/`createdAt` pour l'état de publication et la date plutôt que de dupliquer un champ, et `SystemFields.createdBy` pour l'auteur plutôt qu'une collection auteur séparée. `resolveBlueprint('blog')` résout désormais réellement vers une entrée `available: true` (`blank` reste inchangé, testé explicitement en régression). `scaffoldSite()` étendu pour, uniquement quand le blueprint choisi est `blog` : écrire `cogenta.schema.mjs` (`loadCollections` de `@cogenta/cli` le recharge tel quel — les définitions de champ de contrat A sont des données sérialisables, jamais du comportement), matérialiser les tables via `createSchemaTables`, insérer du contenu de démo réel (trois articles, deux catégories, trois tags) via `createContentStore` — jamais mocké —, copier le `tokens.json` par défaut de `@cogenta/theme-canonical` tel quel dans `theme.tokens.json` (« appliquer un skin », pas la génération IA de la tâche 7, hors périmètre), et écrire `.cogenta/recommended-agents.json` nommant `seoAgent`/`contentAgent` (`@cogenta/agents-builtin`) sans les activer — aucun site du code base ne construit encore un `AgentRegistry` vivant (R2), donc les préconfigurer réellement serait mentir sur ce qui tourne. Un bug corrigé au passage : `throw new Error(...)` nu dans `resolveBlueprint` (violation AGENTS.md), remplacé par `CogentaError` (nouveau code `BLUEPRINT_REGISTRY_CORRUPT`). **Tâche 1 faite** : `create-cogenta` (`npm create cogenta`, paquet `packages/create-cogenta/`), vérification d'environnement (Node, droits d'écriture, détection Postgres/MySQL), assistant interactif ou `--yes`/`--config <fichier>`, écriture d'un `cogenta.config.mjs` chargeable tel quel, migrations + création du compte admin réellement exécutées via `runMigrate`/`runUsers` de `@cogenta/cli` (jamais réimplémentées) contre une base SQLite réelle (R1, zéro-config par défaut). Quatre écarts délibérés, documentés dans le récapitulatif final plutôt que dissimulés : (1) le registre de blueprints n'a qu'une entrée réelle (`blank`) plus huit entrées visibles-mais-désactivées « coming soon » (tâches L9 3/8) — un id inconnu ou indisponible retombe toujours sur `blank` avec un avertissement explicite, jamais en silence ; (2) la génération de skin IA (tâche 7) est hors périmètre — seule la clé API est validée par un aller-retour réel via les adaptateurs `@cogenta/agents`, le skin par défaut est toujours utilisé ensuite ; (3) l'enrôlement de passkey est reporté à la première connexion web (la cérémonie WebAuthn a besoin d'un navigateur, impossible dans un assistant terminal) ; (4) aucune dépendance de prompt ajoutée (R9) — trois primitives (texte/choix/confirmation) construites sur `node:readline/promises`. **Tâche 2 vérifiée déjà faite** : `cogenta doctor` (`@cogenta/cli`, héritée de L0) diagnostique déjà l'environnement, les drivers sélectionnés avec raison et repli, les problèmes de configuration (champ fautif nommé, jamais une pile d'appels) et l'état de santé — testé contre trois installations cassées distinctes, critère d'acceptation satisfait sans travail supplémentaire. L5 précédent : 9/10 tâches faites, **tâche 10 (agents de priorité 2-3 : Média, Traduction, Modération, Analytics, Migration, Accessibilité, Conformité) délibérément non entamée** — le lot ne fournit aucune spécification pour ces sept agents (contrairement aux quatre agents de priorité 1, qui ont chacun une section détaillée : outils, déclencheurs, règles dures), les inventer maintenant serait deviner une décision d'architecture non actée, contraire au mode de travail autonome (« ne pas deviner une décision d'architecture »). Reprendre quand une spec équivalente existe pour ces agents. Résumé L5 1-9 : `@cogenta/agents` (`defineAgent`/`createAgentRegistry`, `assertEvalThreshold`, `BudgetTracker.usage()`), nouveau paquet `@cogenta/agents-builtin` (agents Sécurité — `deps.scan`/`deps.patch` via OSV/EPSS/PR ; SEO — audit + JSON-LD + maillage + AEO/GEO ; Performance — CrUX + budgets + régression + diagnostic structurel ; Contenu — provenance forcée + terminologie + lacunes de sujets), `@cogenta/api` (`createAgentsRouter`), `@cogenta/cli` (câblage optionnel `/api/agents`), `@cogenta/admin` (écran Agents). Détail complet dans l'historique git (commits `ea82de1`..`bcf646e`). |
| Lots terminés | L0 (socle), L1 (contenu), L3 (rendu), L2 (admin, 16/16 tâches), L4 (runtime agentique, 21/21 tâches), **L5 (agents, 9/10 tâches — tâche 10 différée, voir Lot en cours)**. 2402 tests unitaires, tous verts (recompté directement paquet par paquet cette session — le chiffre précédemment noté ici, 2447, ne correspondait plus à l'état réel). Deux flakys d'environnement confirmés non liés à ce travail, non reproductibles isolément, seulement sous contention CPU lors d'un `pnpm test` complet : `@cogenta/seo` `test/sitemap.test.ts` « holds every file under both protocol limits by default » (déjà connu) et, nouvellement observé cette session, `@cogenta/auth` `test/login.test.ts` « clears the rate-limit counter after a successful login » — même symptôme (timeout Vitest à 5000ms), même paquet non modifié par cette tâche. Intégration Postgres/MySQL/MariaDB du `MediaStore` écrite mais non exécutée cette session (Docker Desktop indisponible) ; adaptateurs de fournisseurs LLM sans test d'intégration exécuté (nécessite une clé API réelle, `vitest.integration.config.ts` prêt, skip loud si absente). |
| Paquets publiés | `@cogenta/core`, `@cogenta/schema`, `@cogenta/blocks`, `@cogenta/api`, `@cogenta/render`, `@cogenta/seo`, `@cogenta/theme-canonical`, `@cogenta/auth`, `@cogenta/cli` (`doctor`, `migrate`, `users create`, `serve`), `@cogenta/mcp` (serveur MCP, tâche 17), `@cogenta/agents-builtin` (agents intégrés, L5), `create-cogenta` (installeur `npm create cogenta`, L9 tâche 1, nom non préfixé par convention npm), `@cogenta/admin` (coquille, non publié) |
| Ordre des lots | `L0 → L1 → L3 → L2 → L4 → L5 → L9(installeur) → L6 → L7 → L8` |
| Contrats figés | **A, B, C et D figés** — C (`tools@1.0`) figé le 2026-08-14 (ADR-0020), tel qu'esquissé, sans modification |
| Statut public | pre-alpha |

Tenir ce tableau à jour à chaque changement de lot.

## Mode de travail : autonomie

Décider, coder, livrer, puis rendre compte. Ne pas demander la permission pour une
décision de conception : la prendre, la tracer, et la signaler dans le rapport.

**S'arrêter pour demander uniquement dans trois cas :**

1. Une action **irréversible vers l'extérieur** — publier sur npm, supprimer des
   données, déployer en production.
2. Un **secret ou un accès** que seul l'humain détient.
3. Un choix qui **contredirait une décision déjà actée** dans `docs/03-decisions.md`.

Tout le reste s'avance. Une décision discutable signalée dans un rapport coûte une
correction ; une question posée coûte une journée d'attente.

## Gouvernance documentaire

`docs/03-decisions.md` est **append-only** : une décision actée ne se modifie pas. Pour
changer d'avis, écrire une **nouvelle** ADR et marquer l'ancienne
`Remplacée par ADR-XXXX`, sans supprimer son texte.

`docs/04-contrats.md` est versionné en semver. **A (`schema@1.0`) et B (`blocks@1.0`)
sont figés** depuis le 2026-08-13 : les modifier impose une montée de version majeure et
une note de migration du contenu déjà saisi. C et D ne sont pas encore figés.

Ces règles s'appliquent par discipline, plus par un hook.

## Sous-agents disponibles

| Agent | Quand l'appeler |
|---|---|
| `contract-guardian` | Avant de commiter du code qui touche un contrat A/B/C/D ou une ADR |
| `dod-verifier` | Avant tout commit ou PR — joue la « Définition de terminé » |
| `db-dialect-specialist` | Dès qu'un SQL, une migration ou un type de colonne est en jeu |
| `driver-parity-tester` | À chaque nouvelle interface de driver ou nouvelle implémentation |
| `deps-auditor` | Avant d'ajouter une dépendance directe (R9, R10) |
| `security-reviewer` | Auth, plugins tiers, agents, secrets, exécution de code tiers |
| `docs-sync` | Après un changement d'interface publique |

## Skills projet

`new-package` · `new-driver` · `write-migration` · `integration-tests` · `write-adr` ·
`changeset`

## Commandes

`/lot` · `/dod` · `/adr` · `/contract`

## Commandes shell utiles

```bash
pnpm install                  # installe le workspace
pnpm lint                     # Biome (lint + format)
pnpm typecheck                # tsc --noEmit sur tous les paquets
pnpm test                     # tests unitaires (Vitest)
pnpm services:up              # Postgres + MySQL + Redis + MinIO éphémères
pnpm test:integration         # tests d'intégration (exige services:up)
pnpm services:down
pnpm changeset                # décrit un changement publiable
```

## Rappels qui coûtent cher quand on les oublie

- **Pas de `any`, pas de `@ts-ignore`, pas de CommonJS.** ESM uniquement.
- **Jamais `throw new Error("…")` nu** dans du code de bibliothèque : `CogentaError`
  avec `code` stable et `hint`.
- **Jamais `console.log`** : logger structuré.
- **Pas de mock de la base.** Base réelle éphémère.
- **Le driver dégradé est testé**, pas seulement l'optimal.
- **Un `TODO` sans issue GitHub associée est interdit.**
- Commits en Conventional Commits, avec `Signed-off-by`. Code, commentaires, commits
  et issues **en anglais** ; les documents de conception sont en français.
