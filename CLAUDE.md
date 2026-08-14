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
| Lot en cours | **L4 — Runtime agentique** (`docs/lots/L4-runtime-agentique.md`) — 21 tâches. **Tâches 1-11 faites.** 1-3 fournisseurs LLM, `runAgentLoop`, `assembleContext`. 4 `defineTool`/`createToolRegistry`/`buildManifest` (point réel d'application de la hiérarchie d'autorité). 5 `src/tools/core/` (`content.*`, `media.*`, `site.config_read`, `http.fetch`). 6 `src/audit/with-audit.ts`. 7 `src/trace/`. 8 `src/budget/` (`createBudgetTracker`, `createKillSwitch`, `runAgentLoop` vérifie les deux + `maxRunDurationMs` avant chaque appel). 9 `src/autonomy/` — quatre niveaux (`observe`/`propose`/`execute_with_approval`/`autonomous`), réglables par agent et par outil (`AutonomyConfig.overrides`) ; `withAutonomy` enveloppe un `ExecutableTool` : `observe` n'appelle jamais un outil à effet de bord, `propose` met en file sans attendre, `execute_with_approval` bloque le run jusqu'à décision humaine, `autonomous` appelle immédiatement — **sauf** si `sideEffects:true` et `reversible` n'est pas `true`, auquel cas l'approbation est forcée quel que soit le niveau configuré (règle du Contrat C), et un outil sans métadonnée déclarée est traité comme à effet de bord par défaut (sûr par défaut). `createMemoryApprovalQueue` : `request()` résout seulement quand `decide()` est appelé sur le même id — la file consultable dans l'admin/canal (L2/L6) reste à construire plus tard. « Confirmation explicite à l'activation d'un outil destructif en autonomous » est un contrôle de configuration (hors de portée de ce décorateur runtime). 10 `src/reversibility/` (R6) — `ExecutableTool` gagne un `revert?(receipt, ctx)` optionnel, câblé par `buildManifest` depuis le `ToolDefinition` sous-jacent quand `reversible:true` ; `withReceipts`/`withReceiptsForManifest` capturent, après un appel réussi d'un outil réversible, un `Receipt` (sortie de l'appel = reçu) dans un `ReceiptStore` (`createMemoryReceiptStore`) ; `revertReceipt` retrouve le reçu, refuse un id inconnu ou déjà annulé, retrouve l'outil par son nom **uniquement parmi les outils du run en cours** (jamais tout le registre — un appel ne peut être annulé que par le même outil qui l'a fait), appelle son `revert(receipt.output, ctx)`, marque le reçu annulé. `diffValues` : utilitaire structurel avant/après générique (chemins, tableaux traités comme des feuilles), réutilisable par un appelant disposant de vrais instantanés — pas branché automatiquement (le runtime n'a pas de lecture générique d'état « avant »). 11 `src/subagents/` — `AgentToolsDeclaration` (le sous-ensemble de `defineAgent` que ce jalon exige : `name`, `tools`, `subagents?`) ; `validateSubagentTools` vérifie `subagent.tools ⊆ parent.tools` pour tout l'ensemble déclaré, **au chargement, jamais à l'exécution** — une déclaration invalide lève avant qu'un agent ne tourne. `runSubagent` enveloppe `runAgentLoop` (qui n'a de toute façon aucun état partagé entre appels, donc « contexte et budget propres » vient gratuitement de deux appels distincts) et transforme une levée en résultat (`stopReason: 'errored'`, nouveau, plus `error?: string` sur `RunResult`) plutôt que de la laisser remonter — c'est ce qui empêche l'échec d'un sous-agent de polluer le parent. `agent.delegate` (`src/tools/core/agent-delegate.ts`) est le point d'intégration concret : un `ToolDefinition` de plus, qui passe par le pipeline normal (permissions, audit, autonomie), dont `execute` délègue une tâche au sous-agent via `runSubagent` et ne lève jamais pour cette raison. Dix-neuf codes d'erreur `PROVIDER_*`/`TOOL_*`/`HTTP_FETCH_*`/`APPROVAL_*`/`RECEIPT_*`/`AGENT_SUBAGENT_*` ajoutés à `@cogenta/core`. Reste : tâches 12-21 (skills, mémoire, RAG, MCP, bac à sable, etc.) |
| Lots terminés | L0 (socle), L1 (contenu), L3 (rendu), L2 (admin, 16/16 tâches). 2062 tests unitaires, tous verts (intégration Postgres/MySQL/MariaDB du `MediaStore` écrite mais non exécutée cette session — Docker Desktop indisponible dans l'environnement ; les adaptateurs de fournisseurs LLM n'ont pas non plus de test d'intégration exécuté — nécessite une clé API réelle, `vitest.integration.config.ts` prêt, skip loud si absente). |
| Paquets publiés | `@cogenta/core`, `@cogenta/schema`, `@cogenta/blocks`, `@cogenta/api`, `@cogenta/render`, `@cogenta/seo`, `@cogenta/theme-canonical`, `@cogenta/auth`, `@cogenta/cli` (`doctor`, `migrate`, `users create`, `serve`), `@cogenta/admin` (coquille, non publié) |
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
