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
| Lot en cours | **L4 — Runtime agentique** (`docs/lots/L4-runtime-agentique.md`) — 21 tâches. **Tâches 1-20 faites.** 1-3 fournisseurs LLM, `runAgentLoop`, `assembleContext`. 4 `defineTool`/`createToolRegistry`/`buildManifest` (point réel d'application de la hiérarchie d'autorité). 5 `src/tools/core/` (`content.*`, `media.*`, `site.config_read`, `http.fetch`). 6 `src/audit/with-audit.ts`. 7 `src/trace/`. 8 `src/budget/` (`createBudgetTracker`, `createKillSwitch`, `runAgentLoop` vérifie les deux + `maxRunDurationMs` avant chaque appel). 9 `src/autonomy/` — quatre niveaux (`observe`/`propose`/`execute_with_approval`/`autonomous`), réglables par agent et par outil (`AutonomyConfig.overrides`) ; `withAutonomy` enveloppe un `ExecutableTool` : `observe` n'appelle jamais un outil à effet de bord, `propose` met en file sans attendre, `execute_with_approval` bloque le run jusqu'à décision humaine, `autonomous` appelle immédiatement — **sauf** si `sideEffects:true` et `reversible` n'est pas `true`, auquel cas l'approbation est forcée quel que soit le niveau configuré (règle du Contrat C), et un outil sans métadonnée déclarée est traité comme à effet de bord par défaut (sûr par défaut). `createMemoryApprovalQueue` : `request()` résout seulement quand `decide()` est appelé sur le même id — la file consultable dans l'admin/canal (L2/L6) reste à construire plus tard. « Confirmation explicite à l'activation d'un outil destructif en autonomous » est un contrôle de configuration (hors de portée de ce décorateur runtime). 10 `src/reversibility/` (R6) — `ExecutableTool` gagne un `revert?(receipt, ctx)` optionnel, câblé par `buildManifest` depuis le `ToolDefinition` sous-jacent quand `reversible:true` ; `withReceipts`/`withReceiptsForManifest` capturent, après un appel réussi d'un outil réversible, un `Receipt` (sortie de l'appel = reçu) dans un `ReceiptStore` (`createMemoryReceiptStore`) ; `revertReceipt` retrouve le reçu, refuse un id inconnu ou déjà annulé, retrouve l'outil par son nom **uniquement parmi les outils du run en cours** (jamais tout le registre — un appel ne peut être annulé que par le même outil qui l'a fait), appelle son `revert(receipt.output, ctx)`, marque le reçu annulé. `diffValues` : utilitaire structurel avant/après générique (chemins, tableaux traités comme des feuilles), réutilisable par un appelant disposant de vrais instantanés — pas branché automatiquement (le runtime n'a pas de lecture générique d'état « avant »). 11 `src/subagents/` — `AgentToolsDeclaration` (le sous-ensemble de `defineAgent` que ce jalon exige : `name`, `tools`, `subagents?`) ; `validateSubagentTools` vérifie `subagent.tools ⊆ parent.tools` pour tout l'ensemble déclaré, **au chargement, jamais à l'exécution** — une déclaration invalide lève avant qu'un agent ne tourne. `runSubagent` enveloppe `runAgentLoop` (qui n'a de toute façon aucun état partagé entre appels, donc « contexte et budget propres » vient gratuitement de deux appels distincts) et transforme une levée en résultat (`stopReason: 'errored'`, nouveau, plus `error?: string` sur `RunResult`) plutôt que de la laisser remonter — c'est ce qui empêche l'échec d'un sous-agent de polluer le parent. `agent.delegate` (`src/tools/core/agent-delegate.ts`) est le point d'intégration concret : un `ToolDefinition` de plus, qui passe par le pipeline normal (permissions, audit, autonomie), dont `execute` délègue une tâche au sous-agent via `runSubagent` et ne lève jamais pour cette raison. 12 `src/skills/` — un skill est un dossier `<name>/SKILL.md` (frontmatter `---` à trois champs plats `name`/`version`/`description`, pas de dépendance YAML pour trois chaînes — R9) plus des ressources. `createFileSkillStore` (R1 : local, sans service externe) : `list()` ne lit que le frontmatter de chaque `SKILL.md` (pas coûteux même avec beaucoup de skills), `load(name)` lit les instructions **et seulement à cet appel** (« chargé à la demande, jamais concaténé en permanence ») plus les noms des fichiers de ressources (`readdir` récursif, pas leur contenu — lu séparément par l'appelant selon ce dont il a réellement besoin), `install(sourceDir)` copie un dossier de skill sous son nom déclaré (« installable »). Le versionnement est le champ `version` du frontmatter, exposé tel quel — aucune résolution de plage de version n'est faite ici. 13 `src/memory/` (§4.6) — quatre types (`working`/`episodic`/`semantic`/`procedural`) ; `working` (« le run en cours », rétention éphémère) n'est délibérément jamais géré par `MemoryStore` — c'est `runAgentLoop.messages`/`RunResult`, jamais persisté ici, le type existe seulement pour taguer un instantané si un appelant choisit d'en garder un. `MemoryRecord.siteId` est obligatoire partout : **jamais de mémoire partagée entre deux sites**, vérifié par test de contrat (`memory-store.contract.ts`, joué contre `createMemoryStore` et `createFileMemoryStore` — R1). La politique d'oubli tient en deux méthodes déterministes du store : `prune` (par âge) et `consolidate` (« garder les N plus récents d'un périmètre, retirer le reste ») — la synthèse sémantique de nombreuses entrées épisodiques en une seule reste le jugement de l'agent (un `save()` normal après coup), pas quelque chose que le store peut faire seul (même raisonnement que `diffValues`, tâche 10). `approvalToMemoryRecord` est le pont du signal d'apprentissage humain : convertit une `ApprovalRequest` décidée (tâche 9) en un enregistrement `procedural` ; `ApprovalStatus` ne distingue pas encore une modification d'une acceptation, donc une approbation modifiée n'a pour l'instant que son `reason` comme trace. Vingt-deux codes d'erreur `PROVIDER_*`/`TOOL_*`/`HTTP_FETCH_*`/`APPROVAL_*`/`RECEIPT_*`/`AGENT_SUBAGENT_*`/`SKILL_*`/`AGENT_APPROVAL_*` ajoutés à `@cogenta/core`. 14 `src/rag/embeddings/` — `EmbeddingProvider` (`{provider, model, dimensions}` + `embed()`), neutre vis-à-vis du fournisseur, prêt à porter l'identité que l'index RAG (tâches 15-16) doit conserver. **Adaptateur ONNX `multilingual-e5-small` différé** : audité (deps-auditor) et refusé pour l'instant — `@huggingface/transformers` déclare `sharp` en dépendance directe non-optionnelle, cassant R10 (natif sans repli WASM, ARM/musl/mutualisé) dès `pnpm install`, même pour un usage texte seul. Livré à la place `createHashingEmbeddingProvider` : « hashing trick » (FNV-1a, bag-of-words replié par hachage + normalisation L2), déterministe, local, CPU, zéro dépendance — un vrai fournisseur `EmbeddingProvider`, pas un mock, qui débloque les tâches RAG suivantes ; à remplacer par un adaptateur ONNX quand un chemin sans `sharp` existe (R9). 15 `src/rag/chunking/` — `chunkDocument` : un bloc est l'unité atomique (jamais scindé), un bloc `isHeading:true` ouvre toujours un nouveau chunk (jamais replié dans la section au-dessus), les blocs consécutifs d'une section sont regroupés jusqu'à `maxChunkChars` ; le titre du document est plié dans le texte de chaque chunk (pas seulement en métadonnée — sinon un chunk isolé dans l'index perd son contexte). L'id d'un chunk vient de la composition de blocs (`documentId:blockIds`), pas de sa position ni de son texte : un chunk édité garde le même id (hash SHA-256 différent), une réorganisation de blocs en donne un différent — c'est ce qui rend `planIncrementalIngestion` correct (« hash par chunk → ré-embedding des seuls chunks modifiés ») : compare id+hash entre l'ancien et le nouveau jeu de chunks d'un document, retourne `toEmbed`/`toRemove`/`unchanged`, aucune I/O — l'appelant fournit l'ancien jeu et branche le résultat sur l'`EmbeddingProvider` (tâche 14) et l'index. 16 `src/rag/index/` — `RagIndex` (`createMemoryRagIndex`, R1) : `search` filtre d'abord au `canAccess` injecté (structurel, comme `ContentServiceLike` — ce module ne sait pas ce qu'est un brouillon, un contenu privé ou une frontière de site, c'est le vrai système de permissions de l'appelant qui le décide), **puis seulement** classe ce qui a survécu — BM25 (`bm25Rank`, Okapi standard) et similarité cosinus (`vectorRank`) tournent tous deux sur l'ensemble déjà filtré, fusionnés par `reciprocalRankFusion` (RRF, par rang et non par score brut — BM25 et cosinus vivent sur des échelles incomparables). « Filtrage de permissions au moment de la requête — non négociable » vérifié par un test dédié (`permission-filtering.test.ts`) où chaque chunk qui ne doit jamais remonter est construit pour scorer en tête sur les deux classements — la requête reprend mot pour mot son propre texte et vecteur — de sorte que le test échoue si le filtre n'est pas réellement appliqué avant le classement. 17 **nouveau paquet `@cogenta/mcp`** — serveur MCP : `createMcpServer` expose un manifeste `ExecutableTool[]` (déjà construit par `buildManifest` + les décorateurs des tâches 6/9/10 — permissions, audit, autonomie décidés en amont, ce paquet n'en sait rien) sur un sous-ensemble JSON-RPC 2.0 réimplémenté à la main (`initialize`/`tools/list`/`tools/call`) plutôt que `@modelcontextprotocol/sdk` — audité et refusé (R9) : le SDK officiel tire express/hono/ajv/jose/cross-spawn (>100 paquets transitifs, 4,3 Mo) pour trois méthodes, réimplémentées ici en ~200 lignes testées. `serveMcpOverStdio` : un objet JSON-RPC par ligne en entrée, une réponse par ligne en sortie, flux injectables pour les tests. Un échec d'outil devient `isError:true` dans un résultat JSON-RPC réussi (convention MCP), jamais une erreur de protocole. 18 client MCP (`@cogenta/mcp/client`) — `createMcpStdioClient` parle le même protocole ligne-par-ligne que le serveur (tâche 17), côté enfant : spawn d'un processus tiers, corrélation requête/réponse par id sur `child.stdout`. `wrapMcpTool` transforme un outil découvert à distance en `ToolDefinition` ordinaire : permissions/`sideEffects`/`reversible`/`cost` sont **déclarés par l'intégrateur**, jamais lus depuis le serveur distant (« les mêmes permissions déclarées que les outils internes ») — un outil MCP tiers passe ensuite par le même pipeline registre/manifeste/audit/autonomie qu'un outil du dépôt, sans que le runtime puisse faire la différence. Deux codes d'erreur `MCP_CLIENT_REMOTE_ERROR`/`MCP_CLIENT_TOOL_FAILED`. 19 `src/sandbox/` — `withSandbox` : un outil non `sideEffects:true` passe inchangé (« lecture réelle »). Un outil à effet de bord **et** réversible est réellement appelé contre la copie puis immédiatement annulé via son propre `revert()` (tâche 10) — « écriture simulée » : la copie termine l'appel dans le même état, mais ce que l'appel a produit (et, si `snapshot()` est fourni, un vrai diff avant/après via `diffValues`, tâche 10) est renvoyé à la place de la sortie réelle de l'outil. Un outil à effet de bord **sans** `revert()` n'est jamais appelé, même une seule fois — aucun moyen sûr de l'annuler sur la copie, donc refuser est la seule réponse sûre (`simulated:false`). « C'est le prérequis à toute activation en autonomie » (niveau `autonomous`, tâche 9). 20 `src/eval/` — `EvalCase` (un `RunAgentLoopInput` + un `score(result)`), `runEvalSuite` (rejoue chaque cas via `runAgentLoop`, moyenne les scores) ; la reproductibilité en CI n'est pas la responsabilité de ce module — c'est le `ProviderClient` que porte `input` de chaque cas (un faux client scripté en CI, un vrai seulement en intégration, même partition que les adaptateurs LLM). `comparePromptVersions` : le même jeu de cas rejoué une fois par version de prompt nommée (le `system` de chaque cas est remplacé), rapports directement comparables — « score comparé entre versions de prompt ». Trois scoreurs réutilisables : `scoreFinalTextIncludes`, `scoreToolSequence` (score partiel sur sous-séquence), `scoreStopReason`. Reste : tâche 21 (rédaction des données personnelles avant envoi) |
| Lots terminés | L0 (socle), L1 (contenu), L3 (rendu), L2 (admin, 16/16 tâches). 2195 tests unitaires, tous verts (intégration Postgres/MySQL/MariaDB du `MediaStore` écrite mais non exécutée cette session — Docker Desktop indisponible dans l'environnement ; les adaptateurs de fournisseurs LLM n'ont pas non plus de test d'intégration exécuté — nécessite une clé API réelle, `vitest.integration.config.ts` prêt, skip loud si absente). |
| Paquets publiés | `@cogenta/core`, `@cogenta/schema`, `@cogenta/blocks`, `@cogenta/api`, `@cogenta/render`, `@cogenta/seo`, `@cogenta/theme-canonical`, `@cogenta/auth`, `@cogenta/cli` (`doctor`, `migrate`, `users create`, `serve`), `@cogenta/mcp` (serveur MCP, tâche 17), `@cogenta/admin` (coquille, non publié) |
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
