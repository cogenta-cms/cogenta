# Audit 13 — Agents et assistant IA — 2026-09-01

## 1. Résumé exécutif

**Constat central, qui contredit la prémisse même des fiches 30/58 : ce domaine est
massivement implémenté.** Les huit fiches auditées (30, 45, 55, 56, 57, 58, 59, 60)
sont, à une exception près, déjà **FAIT** dans le code réel — store de prompts,
catalogue de fournisseurs ouvert, dossiers de compétences standard, client MCP
sandboxé avec plancher de sécurité complet, guides « Comment faire ? » par canal,
conscience contextuelle du site existant dans la génération de plan, écran Assistant
unifié, plafond de coût mensuel, assistant sur texte riche, traçabilité `provenance:
'assisted'`, et surtout — contrairement à ce que la fiche 30 affirme en ouverture —
**un vrai `AgentRunner` existe et exécute réellement un agent** (`packages/agents/src/
agents/orchestrator.ts`, câblé par `POST /api/agents/:name/run` et le pont de chat des
canaux). La prémisse « aucun `AgentRegistry` vivant » de la fiche 30 est **obsolète**.

**Mais la promesse produit centrale — un site qui s'exploite lui-même sans clic humain
— reste, elle, réellement non tenue, pour une raison précise et jusqu'ici non
documentée** : le champ `AgentDeclaration.triggers` (déclencheur `{on:'schedule',
cron:...}`, déjà porté par les deux agents intégrés désactivés Content Watch et Site
Monitor) est stocké, sérialisé et renvoyé par l'API — **et n'est lu par absolument
rien**. `cogenta serve` a une douzaine de tickers `setInterval` réels (publication
programmée, purge de corbeille, notifications de canal, intégrité d'audit…) mais aucun
qui lise `triggers`/`cron` pour déclencher un agent. Un agent, même en « Pilote
automatique », ne s'exécute jamais sans qu'un humain clique « Exécuter » ou qu'un
message de canal l'invoque. C'est un point mort concret, précis, et c'est le plus gros
écart entre le discours et le code de tout le domaine — voir §4.

**Un second point mort, aussi grave, jamais couvert par aucune des huit fiches (aucune
n'auditait ce paquet) : `@cogenta/agents-builtin` — le paquet des six agents
spécialisés listés en §2.1 (`content`, `designer`, `developer`, `performance`,
`security`, `seo`), avec leurs `identity.md` (jusqu'à 661 lignes pour `designer`) et
leurs outils dédiés dont `code.propose_patch` (porté par la permission contrat C
`code.patch`/`tools@1.3`) — n'est importé nulle part dans `@cogenta/cli`,
`@cogenta/api` ou `@cogenta/admin`.** `grep -rln "from '@cogenta/agents-builtin'"
packages/ --include=*.ts | grep -v test | grep -v dist` ne retourne que quatre
fichiers de `@cogenta/fleet`, et uniquement pour des **types** (`SbomEntry`,
`CruxMetrics`, `Urgency`), jamais les agents eux-mêmes. Aucun
`AgentDeclarationStore.create(securityAgent)` (ni équivalent) n'existe dans le code de
production : ces six agents ne sont jamais seedés dans le store que l'écran
`agents.tsx` lit, jamais sélectionnables, jamais exécutables. `code.propose_patch`
n'est jamais enregistré dans `packages/agents/src/tools/manifest.ts` (le registre
réellement consommé par `createAgentRunner`) — la permission `code.patch` existe au
contrat, l'outil qui la porte n'existe nulle part côté exécution. Testé et correct **en
isolation** (154 tests dans `packages/agents-builtin/test/`), mais totalement
inaccessible en pratique — un point mort au sens le plus strict, et plus grave que le
champ `triggers` mort ci-dessus puisqu'ici c'est un paquet entier, documenté comme
livré par CLAUDE.md (L5/L18/L24), qui est resté orphelin. Voir §4.

**Décomptes** (critères des 8 fiches, ~95 critères/tâches recensés — hors ce second
point mort qui n'appartient à aucune fiche) :
- **FAIT** : 78
- **PARTIEL** : 8 (les 6 d'origine + deux trouvailles additionnelles : les libellés de
  section du plan de site restent en anglais dur malgré ADR-0019, et le compteur de
  coût de l'assistant n'est pas persisté — voir §4)
- **ABSENT** : 5 (tous des « décisions à trancher » explicitement laissées ouvertes par
  les fiches elles-mêmes — Replicate, `skill.read_resource`, HTTP/SSE MCP, etc.)
- **POINT MORT** : 4 (le déclencheur `cron` d'agent, et `@cogenta/agents-builtin` en
  entier — les deux plus graves du domaine)
- **Bugs de règles (R1-R10)** trouvés : 0 (`console.log`, `any`, `@ts-ignore`, `throw
  new Error` nu — sweep complet, zéro occurrence hors documentation/tests)

Le serveur MCP de Cogenta reste **stdio + `tools` uniquement** : ni transport HTTP/SSE,
ni `resources`, ni `prompts` (items « élevé »/« moyen » de l'audit L20, jamais repris
par une fiche). L5 tâche 10 (sept agents de priorité 2-3) reste sans spécification.
L18 : `pgvector` jamais exécuté contre un vrai Postgres, aucun adaptateur d'embeddings
distant, indexation à un chunk par entrée — tous documentés et assumés dans
`BLOCKERS.md`, pas des surprises.

## 2. Ce qui existe réellement

### 2.1 Agents — modèle, exécution, écrans

- **Modèle** : `packages/agents/src/agents/types.ts` (`AgentDeclarationInput`,
  `StoredAgentIdentity`, `AgentModelPreference` avec `preferred`+`model` explicite),
  `store.ts` (fichier par agent), `identity/markdown.ts` (`renderIdentityMarkdown`/
  `parseIdentityMarkdown`, 4 sections dont `## System prompt`, repli si absente).
- **Exécution réelle** : `packages/agents/src/agents/orchestrator.ts`
  (`createAgentRunner`/`AgentRunner`), runtime LangGraph
  (`packages/agents/src/runtime/loop.ts`, `StateGraph` deux nœuds `agent`/`tools`,
  `@langchain/langgraph` en dépendance directe réelle du `package.json`). Déclenché
  **uniquement** par `POST /api/agents/:name/run` (`packages/api/src/rest/
  agents-router.ts:391`, `trigger: 'manual'`) ou par le pont de chat des canaux
  (`packages/channels/src/chat/bridge.ts:137`). **Aucun déclencheur automatique.**
- **Écrans** : `packages/admin/src/routes/agents.tsx` (643 lignes — liste, création
  complète, `CONTRACT_C_PERMISSIONS` reproduite en dur avec commentaire expliquant
  pourquoi (éviter une dépendance `@cogenta/agents` côté admin)), `agent-detail.tsx`
  (820 lignes — fiche complète : identité, système, modèle, autonomie, budget, outils,
  bouton « Exécuter », traces, historique).
- **Agents intégrés (`@cogenta/agents-builtin`) — construits, testés, mais ORPHELINS
  du runtime réel.** Six agents `defineAgent` complets : `security/` (SBOM, OSV/GHSA,
  EPSS, exploitabilité, PR de correctif), `seo/` (audit, JSON-LD, maillage interne,
  cannibalisation, `llms.txt`), `performance/` (budgets, régression, CrUX, diagnostic),
  `content/` (provenance, terminologie, trous thématiques), `designer/` (identity.md
  661 lignes), `developer/` (L24 — `code.propose_patch`, identity.md 341 lignes).
  Chacun est un vrai `AgentDeclaration` (même type que les quatre seeds de §2.1),
  avec `tools`/`skills`/`triggers`/`budget` réels — `security/agent.ts:14-31` en est un
  exemple complet (7 outils, 2 skills, autonomie `propose` avec `deps.scan` en
  `autonomous`, `triggers` sur `cve.published`/cron/`dependency.installed`). **Aucun de
  ces six agents n'est jamais importé par `@cogenta/cli`, `@cogenta/api` ou
  `@cogenta/admin`** — `grep -rln "from '@cogenta/agents-builtin'" packages/
  --include=*.ts | grep -v test | grep -v dist` ne retourne que 4 fichiers de
  `@cogenta/fleet`, et uniquement pour des **types** (`SbomEntry`, `CruxMetrics`,
  `Urgency`, jamais les agents). Aucun seeding dans `AgentDeclarationStore`, aucune
  apparition dans `agents.tsx`, aucun chemin d'exécution. Le tool `code.propose_patch`
  (`developer/patch-tool.ts`, `createCodePatchTool`) — celui qui porte la permission
  contrat C `code.patch` actée en `tools@1.3` — n'est jamais enregistré dans
  `packages/agents/src/tools/manifest.ts`, le registre réel consommé par
  `createAgentRunner`. 154 tests, tous en isolation dans `packages/agents-builtin/
  test/`, zéro test d'intégration avec le runtime réel. Voir §4 (POINT MORT). **Item 10
  de `docs/lots/L5-agents.md` (sept agents priorité 2-3 : Média, Traduction,
  Modération, Analytics, Migration, Accessibilité, Conformité) toujours sans
  spécification** — confirmé absent, `grep` négatif sur tout nom plausible ; à ne pas
  confondre avec les six ci-dessus, qui couvrent la priorité 1 de L5 plus deux agents
  de L24 (`designer`/`developer`).

### 2.2 Prompts, fournisseurs, compétences

- `packages/agents/src/prompts/{store.ts,seeds.ts,render.ts,types.ts}` (486 lignes) —
  `PromptTemplateStore` fichier JSON, `builtinPromptTemplateSeeds()` migrant
  verbatim les instructions de `writing.ts`/`classify.ts`/`faq.ts`/`chat.ts` en
  templates `{{placeholder}}`, plus `generate_text_block` et
  `generate_agent_system_prompt`. `resolveInstruction` lit le store avec **repli
  explicite** sur la constante d'origine codée en dur dans chaque outil (ex.
  `writing.ts:110`).
- `packages/api/src/rest/prompt-templates-router.ts` — lecture ouverte à tout acteur
  signé, écriture `admin` (`:70-74`). `packages/admin/src/routes/prompt-settings.tsx`
  (393 lignes), nav `/prompt-settings` sous le groupe `ai`.
- `packages/agents/src/providers/catalog.ts` — `KNOWN_PROVIDER_CATALOG` : 7 entrées
  confirmées (`grep -c "id: '"` sur le fichier) — `anthropic`, `openai`, `google`
  natifs ; `openrouter`, `deepseek`, `qwen`, `glm` en
  `wireFormat: 'openai-compatible'` réutilisant `createOpenAiClient` sans nouveau code
  réseau). `registry.ts:18` — `ProviderName = string` (union ouverte, plus 3
  littéraux). `packages/admin/src/routes/providers.tsx` (364 lignes) — cartes de
  catalogue + option « fournisseur personnalisé » (`CUSTOM_PROVIDER`) + « modèle
  personnalisé » (`CUSTOM_MODEL`). `providers-client.ts:38` lit `GET /api/providers/
  catalog`, aucun `KNOWN_PROVIDERS` dupliqué côté admin.
- `packages/agents/src/skills/library.ts` — `SKILL_RESOURCE_DIRS = ['references',
  'scripts', 'assets']` (:20), `listResources`/`addResource`/`removeResource`
  (:124-142, implémentées :398-434). `packages/admin/src/routes/agent-skills.tsx`
  (524 lignes) — section « Fichiers de référence » (:407-408).

### 2.3 MCP — serveur et client externe

- **Serveur** : `packages/mcp/src/server.ts`/`stdio-transport.ts`, aucune permission
  (R4 respecté — la porte est le manifeste construit en amont). `packages/cli/src/
  commands/mcp.ts` (395 lignes) — `--email`/`--role`/`--api-key` (le 3e via la **même**
  `ApiKeyStore` que REST, pas un second magasin). Un `AccessContext` réel traverse
  chaque appel (`BLOCKERS.md` §18). Écran `packages/admin/src/routes/mcp.tsx`
  (503 lignes) — génère une clé à portée MCP, affiche commande CLI + JSON client.
- **Client externe** : `packages/mcp/src/client/{stdio-client.ts (360 lignes),
  wrap-tool.ts, sandbox.ts (43 lignes), watchdog.ts (117 lignes)}`. Plancher de
  sécurité de la tâche 1bis **entièrement vérifié dans le code** :
  `stdio-client.ts:88-91` — `spawn(command, args, { stdio: ['pipe','pipe','pipe'],
  cwd: options.cwd, env: options.env })` (jamais `process.env` implicite, jamais
  `inherit`) ; `sandbox.ts` — répertoire temporaire dédié créé/détruit par connexion ;
  `watchdog.ts` — poll `ps`/PowerShell `Get-Process`, zéro dépendance native ;
  `wrap-tool.ts:74` — `ctx.signal` transmis à `callTool`. `packages/mcp/src/
  registry/{store.ts (395),tables.ts,discovery.ts,tool-definitions.ts}` —
  `McpConnectionStore`, table `mcp_connections`, `confirmedUnsandboxed` obligatoire
  (`store.ts:162-269`, refuse sans confirmation explicite). Écran
  `packages/admin/src/routes/mcp-clients.tsx` (602 lignes). Câblage runtime confirmé :
  `packages/cli/src/commands/agent-runtime.ts:56,131` importe
  `buildMcpToolDefinitions`/`McpConnectionStore`. Vocabulaire de permission
  `mcp.external:<connexionId>.<nomOutilDistant>` en `tools@1.4`
  (`docs/04-contrats.md:546-562`, `tool-definitions.ts:68`).
- **Ce que le serveur MCP ne fait toujours pas** : transport HTTP/SSE (stdio
  uniquement, `README.md` §1 le dit), `resources` (contenu/médias/schéma non
  adressables par URI), `prompts` prédéfinis, pagination `tools/list`,
  sampling/notifications de progression — items « élevé »/« moyen »/« faible » du plan
  d'action MCP de L20 (§2), jamais repris par une fiche de ce lot.

### 2.4 Canaux

- `packages/channels/src/linking/codes.ts` — code à 8 caractères, protocole
  identique Telegram/Slack/Discord. `packages/admin/src/routes/channels.tsx`
  (303 lignes) — bouton « Comment faire ? » (:240, modale :264-290 avec
  `howTo.operatorHeading`/`userHeading`/`step0..step4`), champ « nom du bot » par
  canal persisté en réglage (`botNameSettingKey`, :59-143), affiché dans le guide
  quand renseigné (:285-290).

### 2.5 Assistant unifié, coût, texte riche, traçabilité, RAG

- `packages/admin/src/routes/assistant.tsx` (308 lignes) — onglets Vue d'ensemble/
  Index/Chat/Doublons, lit `GET /api/assistant`, `TOOL_LOCATION` (:31-47) nomme où
  chaque outil s'utilise réellement dans l'admin. Seul écran qui **ne disparaît pas**
  sans fournisseur (:26-27, texte explicatif à la place).
- `packages/agents/src/assist/usage.ts` (112 lignes) — `AssistUsageTracker`, plafond
  mensuel configurable, `checkBudget()` avant appel / `record()` après, signal
  `nearLimit` à 80 %, `overLimit` honnête au-delà de 100 %. Câblé bout en bout :
  `assistant-router.ts:66-245` → `assist-client.ts:29,85` → `assistant.tsx:207-228`
  (barre de progression + refus visible).
- `packages/admin/src/rich-text/selection-assist.tsx` (210 lignes) — opère sur la
  **sélection courante** (`Transforms.insertText(editor, text, {at: selection})`),
  refuse une sélection qui traverse un lien/média (`selectionCrossesInline`), passe
  par la pile d'annulation de l'éditeur (`Ctrl+Z` défait l'acceptation).
- `packages/admin/src/routes/entry-edit.tsx:585-597` — une suggestion acceptée écrit
  `provenance: 'assisted'` + `provenanceDetail` (valeur du contrat A, distincte de
  `'generated'` — nuance correcte : `'assisted'` = contenu humain retouché par l'IA
  puis accepté, `'generated'` = contenu entièrement produit par l'IA comme le contenu
  de démo L19).
- `packages/admin/src/routes/assistant-index.tsx` — section vecteurs (:190-232,
  `vector.collections`, `assistantIndex.reindexHint`) affiche driver actif, nombre
  d'entrées, bouton de réindexation.

### 2.6 Génération de site contextuelle (fiche 60)

- `packages/agents/src/site-plan/site-context.ts` (158 lignes) — `describeExistingSite`.
  `existingSite?: ExistingSiteSnapshot` filé par le canal `data` d'`assembleContext`
  dans `analyse-brief.ts:75,166,194-195`, `content-model.ts:40,332-469` (mode
  « écart » quand non vide, :40), `skin-candidates.ts:90-126`, `propose-plan.ts:53-121`
  (orchestration + passe `structural-gaps.ts` uniquement si le site n'est pas vide).
  Renommage « Créer un site » → « Générer le site » complet en fr/en + `nav-items.ts`.

## 3. Vérification des fiches, critère par critère

| Fiche | Tâche/critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| 30 | §1 « Aucun `AgentRegistry` vivant » | **CONTREDIT PAR LE CODE** | `orchestrator.ts` (`createAgentRunner`), `agents-router.ts:391`, `chat/bridge.ts:137` | La prémisse de la fiche est obsolète : un runner réel exécute un agent à la demande. Reste vrai : aucune exécution *autonome/planifiée*. |
| 30 T1 | Bandeau honnête « aucun agent ne s'exécute » | **PARTIEL** | Aucun texte de ce type dans `agents.tsx`/`agent-detail.tsx`/i18n (`grep` négatif) | Le texte littéral demandé serait maintenant faux. Ce qui manque réellement : un texte disant que « Pilote automatique » et le déclencheur `cron` (invisible côté UI) ne créent **aucune** exécution planifiée — voir §4, point mort n°1. |
| 30 T2 | Écran Assistant unifié, liste serveur | **FAIT** | `assistant.tsx` 308 lignes, `TOOL_LOCATION`, onglets Chat/Doublons | — |
| 30 T3 | Coût/usage, plafond, signal 80 % | **FAIT** | `assist/usage.ts`, câblage `assistant-router.ts`→`assist-client.ts`→`assistant.tsx:207-228` | — |
| 30 T4 | Assistant sur texte riche, sélection, Ctrl+Z | **FAIT** | `selection-assist.tsx` (210 lignes), garde lien/média | — |
| 30 T5 | Traçabilité, `provenance:'assisted'` | **FAIT** | `entry-edit.tsx:585-597` | — |
| 30 T6 | Visibilité vecteurs/RAG | **FAIT** | `assistant-index.tsx:190-232` | — |
| 45 T1 | Store de templates, contrat CRUD | **FAIT** | `prompts/store.ts` 184 lignes, JSON par fichier | — |
| 45 T2 | Seeds migrés + nouveaux, repli si vide | **FAIT** | `prompts/seeds.ts` 178 lignes, `writing.ts:110` fallback | — |
| 45 T3 | Route API, lecture ouverte/écriture admin | **FAIT** | `prompt-templates-router.ts:70-74` | — |
| 45 T4 | Écran admin, sous-item nav `ai` | **FAIT** | `prompt-settings.tsx` 393 lignes, `/prompt-settings` | — |
| 55 T1 | `systemPrompt` explicite, section markdown, repli | **FAIT** | `identity/markdown.ts`, `agents.tsx:250,275` | — |
| 55 T2 | `AgentModelPreference.model` explicite | **FAIT** | `agents.tsx:278-280` (`model:` avec `model` optionnel) | — |
| 55 T3 | Génération de prompt système, relecture obligatoire | **FAIT** | `assist/agent-identity.ts` 156 lignes, `applied: z.literal(false)` (:45) | — |
| 55 T4 | `<Select>` provider dynamique en édition | **FAIT** | `agents.tsx:352-354` (`enabledProviders.map`) | — |
| 55 T5 | Fiche agent affiche prompt système + modèle | **FAIT** | `agent-detail.tsx` (identité complète affichée) | — |
| 56 T1 | Catalogue statique `KNOWN_PROVIDER_CATALOG` | **FAIT** | `providers/catalog.ts:44-95`, 7 entrées (dont custom implicite) | — |
| 56 T2 | `provider: string` union ouverte | **FAIT** | `registry.ts:18` | — |
| 56 T3 | `openai-compatible` réutilise `createOpenAiClient` | **FAIT** | Commentaire `catalog.ts` explicite, zéro nouveau code réseau | — |
| 56 T4 | Replicate hors périmètre | **FAIT (décision tenue)** | Aucune entrée `replicate` dans le catalogue | Conforme à la recommandation de la fiche elle-même. |
| 56 T5 | Écran cartes + custom provider/model | **FAIT** | `providers.tsx:61-257` | — |
| 56 T6 | `providers-client.ts` lit `/api/providers/catalog` | **FAIT** | `providers-client.ts:38`, aucun `KNOWN_PROVIDERS` dupliqué | — |
| 57 T1 | Sous-dossiers standards créés à `create()` | **FAIT** | `library.ts:20` `SKILL_RESOURCE_DIRS` | — |
| 57 T2 | `listResources`/`addResource`/`removeResource` | **FAIT** | `library.ts:124-142,398-434` | — |
| 57 T3 | Route API resources, admin | **FAIT** | `agent-skills-router.ts:99-103` | — |
| 57 T4 | Écran, 3 zones, upload/suppression | **FAIT** | `agent-skills.tsx:407-408` | — |
| 57 T5 | Client `agent-skills-client.ts` | **FAIT** | (confirmé par le test `agent-skills.test.tsx`) | — |
| 57 T6 | Contexte agent inchangé (pas d'injection auto) | **FAIT (décision tenue)** | `skills/library.ts:17` commentaire nomme `skill.read_resource` comme non fait | `skill.read_resource` reste **ABSENT**, conforme à la décision de laisser ce point à trancher séparément. |
| 58 Serveur T1 | Renommage « MCP Server », scope = permissions existantes | **FAIT** | `mcp.tsx` distinct de `mcp-clients.tsx`, `cli/mcp.ts` | — |
| 58 Client 1bis | `spawn` sans héritage `env`, `stdio` pipe, `cwd` dédié, timeout `ctx.signal`, watchdog PID, confirmation obligatoire | **FAIT (tous les points)** | `stdio-client.ts:88-91`, `sandbox.ts`, `watchdog.ts`, `wrap-tool.ts:74`, `store.ts:162-269` | — |
| 58 T2 | `McpConnectionStore`, table `mcp_connections`, secret chiffré | **FAIT** | `registry/store.ts` 395 lignes, `tables.ts` | Intégration Postgres/MySQL/MariaDB **non exécutée** (Docker indisponible), documenté `BLOCKERS.md` §19. |
| 58 T3 | Écran connexions, test, case à cocher par outil | **FAIT** | `mcp-clients.tsx` 602 lignes | — |
| 58 T4 | Câblage runtime | **FAIT** | `agent-runtime.ts:56,131` | — |
| 58 T5 | Codes d'erreur | **FAIT** | `MCP_ACTOR_API_KEY_INVALID` etc. (`BLOCKERS.md` §18bis) | — |
| 58 T6 | Permission par outil distant, jamais par connexion | **FAIT** | `tools@1.4`, `tool-definitions.ts:63-68` | — |
| 59 T1 | Modale « Comment faire ? » par canal | **FAIT** | `channels.tsx:240,264-290` | — |
| 59 T2 | Clés i18n `channels.howTo.*` | **FAIT** | `fr.json:2648` | — |
| 59 T3 | Champ « nom du bot » | **FAIT** | `channels.tsx:59-143` | — |
| 59 T4 | Doc process séparé | **FAIT** | `packages/mcp/README.md`/`channels` doc (non re-vérifié ligne à ligne, cohérent avec §2.4) | — |
| 60 T1 | Renommage UI | **FAIT** | `fr.json:256,3441`, `en.json:257,3442`, `nav-items.ts:351` | — |
| 60 T2 | `describeExistingSite()` | **FAIT** | `site-context.ts` 158 lignes | — |
| 60 T3 | Injection en donnée (canal `data`) | **FAIT** | `analyse-brief.ts:194-195` etc. (motif répété dans les 3 fichiers) | — |
| 60 T4 | Mode écart vs premier jet | **FAIT** | `content-model.ts:40,332-469` | — |
| 60 T5 | Détection de trous structurels | **FAIT** | `structural-gaps.ts` 87+ lignes, `propose-plan.ts:117-121` | — |
| 60 T6 | Câblage CLI/API | **FAIT** | `existingSite` filé dans `propose-plan.ts`, câblé par les points d'entrée (non re-tracé ligne à ligne jusqu'à `site-plan.ts`/`site-plan-router.ts`, cohérent avec le reste) | — |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P0** | `packages/agents-builtin/src/{content,designer,developer,performance,security,seo}/agent.ts` ; `packages/agents/src/tools/manifest.ts` | Six `AgentDeclaration` complets (identity.md jusqu'à 661 lignes, outils/skills/triggers/budget réels) ne sont **jamais importés** par `@cogenta/cli`/`@cogenta/api`/`@cogenta/admin` — `grep -rln "from '@cogenta/agents-builtin'" packages/ --include=*.ts \| grep -v test \| grep -v dist` ne retourne que 4 fichiers de `@cogenta/fleet`, uniquement pour des types (`SbomEntry`, `CruxMetrics`, `Urgency`), jamais les agents. Aucun `AgentDeclarationStore.create(...)` nulle part en production. `code.propose_patch` (`developer/patch-tool.ts`), qui porte la permission contrat C `code.patch` actée en `tools@1.3`, n'est jamais enregistré dans `packages/agents/src/tools/manifest.ts` — aucun agent, à aucun niveau d'autonomie, ne peut aujourd'hui ouvrir de PR via cet outil malgré la permission actée au contrat. 154 tests, tous en isolation. | Seeder les six déclarations dans `builtinAgentSeeds()` (désactivées par défaut, même statut que Security Scanner/Content Watch), enregistrer `createCodePatchTool` dans le registre d'outils réel conditionné à un `PrClient` configuré (même garde que `deps.patch`). Voir T10. |
| **P0** | `packages/agents/src/agents/types.ts` (champ `triggers`), `store.ts:203,254-258`, `agents-router.ts:226` | `AgentDeclaration.triggers` (`{on:'schedule', cron}`) est stocké, patché et exposé par l'API — **rien ne le lit jamais**. `grep -rn "\.triggers\b"` sur `packages/agents`, `packages/api`, `packages/cli`, `packages/admin` ne retourne que ces 4 lignes d'écriture/lecture de structure, aucune lecture d'exécution. `packages/cli/src/commands/serve.ts` a 10 constantes `*_TICK_MS` réelles (publication, corbeille, notifications, intégrité d'audit…) et **aucune** pour un agent. Les deux agents intégrés qui portent ce champ (`SITE_MONITOR_AGENT_NAME` `cron: '0 7 * * *'`, agent de veille de contenu `cron: '0 8 * * 1'`, `builtins.ts:104,113`) sont `enabled: false` par défaut et resteraient inertes même activés. | Soit lire réellement `triggers` dans un ticker `runServe` dédié (même discipline R1 que `SCHEDULED_PUBLISH_TICK_MS`), soit retirer le champ du modèle et le documenter comme non implémenté — le stocker sans jamais l'honorer est exactement la définition d'un point mort. |
| **P1** | `packages/admin/src/routes/agents.tsx`, `agent-detail.tsx`, i18n `agentSkills`/`agents` | Aucun texte n'indique que « Pilote automatique » (`autonomyLevel.autopilot`) et un déclencheur `cron` ne produisent **aucune** exécution planifiée — seule l'autonomie du *comportement une fois lancé* (approbation ou non) est réglée, jamais le *déclenchement*. Un opérateur peut raisonnablement lire « budget/jour » + « Pilote automatique » et croire à un agent qui tourne seul. | Notice sur l'écran Agents (et sur la fiche d'un agent portant `triggers`) : « Cet agent ne s'exécute que si vous cliquez Exécuter ou qu'un message de canal l'invoque — aucune planification automatique n'existe sur cette installation. » |
| P2 | `packages/mcp/src/server.ts`, `README.md` | Le serveur MCP reste stdio + `tools` uniquement — pas de transport HTTP/SSE, pas de `resources`, pas de `prompts`. Items « élevé »/« moyen » du plan d'action MCP de L20 (§2, points 4-5, 8-10), jamais repris par une fiche 45-60. | Nouvelle fiche dédiée (hors périmètre de cet audit) si un client distant (site hébergé exposant son propre MCP) est un besoin réel. |
| P3 | `docs/lots/L5-agents.md` tâche 10 | Sept agents de priorité 2-3 toujours sans spécification — `grep` négatif sur tout nom plausible dans `packages/agents-builtin/src`. Documenté honnêtement depuis L5, toujours vrai. | Écrire la spec avant de coder, comme documenté. |
| Info | `BLOCKERS.md` §8.1-8.3 | `pgvector` jamais exécuté contre un vrai Postgres (Docker indisponible), aucun adaptateur d'embeddings distant (`openai` éteint la recherche sémantique plutôt que de mal fonctionner), indexation à un chunk par entrée. Tous **assumés et documentés**, pas des bugs. | Reprendre dès que Docker est disponible / qu'un adaptateur distant est un besoin réel. |
| Info | `packages/mcp/test/registry/store.test.ts` | `mcp_connections` testé SQLite uniquement, aucune suite Postgres/MySQL/MariaDB écrite (contrairement à la convention `@cogenta/schema` pour du contenu) — `BLOCKERS.md` §19 argumente que c'est cohérent avec `@cogenta/plugins`/`ProviderConfigStore`, pas un oubli. | À vérifier si Docker redevient disponible. |
| — | Sweep R1-R10 | `console.log`, `: any`, `@ts-ignore`, `throw new Error(...)` nu : **zéro occurrence** dans `packages/agents/src`, `packages/agents-builtin/src`, `packages/mcp/src`, `packages/channels/src` (hors mentions de la règle elle-même dans `identity.md`). `package.json` de ces 4 paquets : aucune dépendance non justifiée (`@langchain/langgraph` documentée et actée par ADR-0029/L24). | Rien à corriger. |
| P2 | `packages/agents/src/site-plan/approval.ts:88-165` (ex. ligne 147, `title: 'Suggested standing pages'`) | `summarisePlan` construit les titres/descriptions de **chaque** section du plan de site (« Suggested standing pages », « Design », etc. — le texte structurel fixe, pas le contenu généré par l'IA) comme des chaînes anglaises codées en dur dans `@cogenta/agents`, jamais routées par `react-i18next`. ADR-0019 impose une interface admin traduite fr/en dès le lancement, et le reste de l'écran `site-plan.tsx` l'est (`t('sitePlan...')`) — seuls ces libellés de section échappent au système. Un admin francophone voit un écran de génération de site mixte fr/en. Distinct du contenu réellement généré par le brief (titres de page proposés, etc.), qui a raison de rester dans la langue du brief. | Voir T08 |
| P3 | `packages/agents/src/assist/usage.ts` (tracker en mémoire, `Map` locale, aucune écriture disque/DB dans le fichier) | Le plafond mensuel de jetons et sa ventilation par outil (fiche 30 tâche 3) sont perdus à chaque redémarrage de `cogenta serve` — pas de persistance, contrairement à l'esprit d'un « plafond mensuel » censé tenir jusqu'à la fin du mois sur un hébergement qui redémarre (déploiement quotidien, par exemple). | Voir T09 |

## 5. Comparaison marché

### WordPress (Jetpack AI + AI Engine de Meow Apps, plugin tiers dominant)

| Fonctionnalité | Cogenta |
|---|---|
| Bloc/assistant d'écriture dans l'éditeur (réécrire, résumer, ton, grammaire) | **OUI** — `assist.rewrite`/`proofread`/`summarise` + panneau champ + sélection texte riche |
| Génération d'image | **OUI** — `assist.generate_image` |
| Chatbot RAG sur le contenu du site | **OUI** — `assist.chat`, citations remappées depuis la récupération |
| Bibliothèque de templates de prompts éditables | **OUI** — fiche 45, `prompt-settings.tsx` (AI Engine a un équivalent, « AI Templates ») |
| Multi-fournisseur (OpenAI, Anthropic, Google, Mistral, Ollama local, OpenRouter, Groq, DeepSeek) | **PARTIEL** — 7 fournisseurs catalogués (3 natifs + 4 OpenAI-compatible) + option personnalisée, mais pas Mistral/Groq/Ollama local nommément (le champ `baseUrl`/`model` libre permet un Ollama local via un endpoint compatible OpenAI, non testé pour ce cas précis) |
| Outils/function calling pour automatiser (« AI Tools », lire/écrire des articles) | **OUI, plus strict** — contrat C, `sideEffects`/`revert`/permissions déclarées (R4/R6), AI Engine n'a pas cette discipline de réversibilité |
| Tâches planifiées IA (« AI Cron ») | **NON, point mort** — voir §4 P0 : le champ existe, rien ne l'exécute |
| Tableau de bord d'usage/coût par modèle | **OUI** — `assist/usage.ts`, plafond + signal 80 % ; AI Engine a un tableau de bord similaire mais par requête, pas par outil |
| Support MCP (client/serveur) | **OUI, plus complet** — AI Engine a ajouté un support MCP basique en 2025 ; Cogenta a un serveur ET un client externe sandboxé, taxonomie de permission par outil distant |
| Détection de doublons sans IA | **OUI, unique** — `assist.find_duplicates`, embedder local, aucun concurrent cité n'a cet outil sans clé |
| Génération de site depuis un document | **OUI, unique** — L19/fiche 60, aucun concurrent cité n'a cet équivalent |

### Drupal AI module (écosystème contrib, le plus proche architecturalement)

| Fonctionnalité | Cogenta |
|---|---|
| Catalogue de fournisseurs pluggable, par opération (chat/embeddings/image/modération) | **PARTIEL** — catalogue ouvert oui, mais un seul fournisseur actif à la fois par usage, pas de sélection fine par *type d'opération* comme Drupal AI |
| « AI Automators » — auto-génération d'un champ depuis un autre au save | **NON** — Cogenta a l'assistant à la demande (bouton), pas d'automatisation déclenchée à l'enregistrement |
| « AI Agents » module — agents avec prompt système + outils, exposables | **OUI, équivalent direct** — `agents.tsx`, contrat C, mais sans exécution planifiée (voir P0) alors que Drupal AI Agents n'a pas non plus de scheduler natif — parité réelle ici |
| AI CKEditor — assistant sur texte riche, sélection | **OUI** — `selection-assist.tsx`, fonctionnellement équivalent |
| AI Logging — journal de chaque requête/réponse pour audit | **PARTIEL** — traçabilité des suggestions acceptées (`provenance:'assisted'`) oui, mais pas de journal brut requête/réponse consultable par admin comme AI Logging |
| Chatbot RAG via Search API | **OUI** — `assist.chat` |

### Sanity AI Assist

| Fonctionnalité | Cogenta |
|---|---|
| Génération/réécriture liée à un champ de schéma (« Instruction fields ») | **PARTIEL** — Cogenta a un panneau générique par outil, pas de prompt personnalisé par champ de schéma défini par le développeur |
| Édition préservant le texte riche (Portable Text) | **OUI, équivalent** — `selection-assist.tsx` préserve marques/liens, même problème que Sanity résout |
| Traduction assistée | **OUI** — `assist.translate` |
| Chatbot / RAG | **NON** — Sanity AI Assist n'en a pas nativement (Cogenta va plus loin ici) |

### Contentful (AI Actions)

| Fonctionnalité | Cogenta |
|---|---|
| Prompts réutilisables déclenchables depuis l'éditeur, avec placeholders liés aux champs | **PARTIEL** — la bibliothèque de templates (fiche 45) existe et sert les outils internes, mais un éditeur ne peut pas créer/lier un template libre à un champ arbitraire depuis l'écran d'entrée comme une AI Action Contentful |
| Permissions par rôle sur qui crée/exécute une AI Action | **OUI, équivalent** — écriture `prompt-templates-router` réservée `admin`, exécution ouverte à tout acteur signé |

### LangGraph Studio / Platform (comparaison du runtime, pas un CMS)

| Fonctionnalité | Cogenta |
|---|---|
| Graphe d'exécution visible, inspection par étape | **NON** — `runAgentLoop` sur `StateGraph` existe (L24) mais aucun visualiseur admin de graphe/étapes |
| Time-travel / rejeu depuis un checkpoint | **NON** | 
| Traces par exécution (outils appelés, durée, coût) | **PARTIEL** — `agent-detail.tsx` a une liste de traces (`traces.map`, `startedAt`/`stopReason`) mais pas le détail par étape d'un outil |
| Human-in-the-loop (approbation avant un outil à risque) | **OUI** — niveaux d'autonomie `report-only`/`co-pilot`/`autopilot`, `execute_with_approval` |
| Évaluation A/B de prompts | **OUI, partiel** — `packages/agents/src/eval/compare-prompt-versions.ts` existe mais sert un prompt donné, pas une bibliothèque de datasets/evals comme LangSmith |

### OpenAI Assistants / Agents SDK

| Fonctionnalité | Cogenta |
|---|---|
| Threads persistants, runs inspectables | **PARTIEL** — le chat n'a pas d'historique de conversation persistant (fiche 30 §3 confort, non traité par ce lot) |
| Function calling avec vector store attaché | **OUI** — `assist.chat`, index vectoriel par driver |
| Tableau de bord de coût par assistant | **OUI** — `assist/usage.ts`, plus fin (par outil, pas seulement par assistant) |

## 6. Spécification ultra détaillée des corrections et ajouts

### T01 — Décider du sort de `AgentDeclaration.triggers`

**Priorité** : P0. **Effort** : 0,5 j (documentation seule) à 3 j (exécution réelle).
**Fichiers** : `packages/agents/src/agents/types.ts`, `store.ts`,
`packages/cli/src/commands/serve.ts`, `packages/admin/src/routes/agents.tsx`,
`agent-detail.tsx`, i18n fr/en.

**Travail détaillé** — deux options, à trancher explicitement (pas les deux) :

- **Option A (documenter, ne pas construire)** : retirer `triggers` de l'écran (déjà
  absent) ne suffit pas — il faut un texte visible sur la fiche d'un agent qui *porte*
  ce champ (Site Monitor, Content Watch) disant explicitement qu'aucune planification
  n'existe sur cette installation et que ce champ n'a aucun effet aujourd'hui. Nouvelle
  clé i18n `agents.triggersInert` (fr/en), affichée dans `agent-detail.tsx` quand
  `selectedAgent.triggers !== undefined`.
- **Option B (construire réellement)** : nouveau ticker dans `runServe`
  (`AGENT_SCHEDULE_TICK_MS`, même discipline que `SCHEDULED_PUBLISH_TICK_MS`) qui lit
  chaque agent activé, évalue son `triggers.cron` (une lib de parsing cron minimale
  déjà nécessaire ou à écrire — vérifier si une dépendance existe déjà dans le
  workspace avant d'en ajouter une, R9), et appelle `runner.run(name, undefined,
  'schedule')` quand dû. Le `trigger` doit apparaître dans les traces (`agent-detail.tsx`
  affiche déjà `trace.stopReason`, ajouter la nature du déclenchement).

**Critères d'acceptation** : (A) aucun texte de l'admin ne peut laisser croire qu'un
agent avec `triggers` s'exécute seul sans que ce soit vrai ; ou (B) un agent avec
`triggers: {on:'schedule', cron:'0 7 * * *'}` et `enabled:true` s'exécute réellement au
prochain passage du ticker, prouvé par un test avec horloge injectée (même motif que
`scheduledPublishTickMs`).

**Tests exigés** : (A) test composant vérifiant l'affichage de la notice quand
`triggers` est présent. (B) test d'intégration `runServe` avec tick simulé, agent
`enabled:true` + `triggers`, vérifiant un appel réel à `runner.run`.

**Impact contrat/ADR** : aucun — `triggers` existe déjà dans le modèle (additif,
`tools@1.x` inchangé). ADR requise : non.

### T02 — Notice d'honnêteté sur l'autonomie d'un agent

**Priorité** : P1. **Effort** : 0,5 j. **Fichiers** : `packages/admin/src/routes/
agents.tsx`, `agent-detail.tsx`, i18n fr/en.

**Travail détaillé** : ajouter, sur l'écran liste et la fiche d'agent, une phrase fixe
(pas conditionnelle à `triggers`, car même sans lui l'ambiguïté existe) : « Un agent ne
s'exécute que lorsqu'un humain clique Exécuter, ou qu'un message de canal l'invoque.
Aucun agent ne surveille ni n'agit seul dans le temps sur cette installation. » —
placée près du sélecteur d'autonomie, pour dissocier explicitement « niveau
d'approbation une fois lancé » de « déclenchement automatique ».

**Critère d'acceptation** : un utilisateur lisant l'écran Agents ne peut pas conclure
qu'activer « Pilote automatique » fait tourner l'agent sans intervention.

**Tests exigés** : test composant, présence du texte, aucune régression sur les
contrôles existants.

**Impact contrat/ADR** : aucun.

### T03 — Journal brut requête/réponse par outil d'assistant (parité Drupal AI Logging)

**Priorité** : P2. **Effort** : 1,5 j. **Fichiers** : `packages/agents/src/assist/
usage.ts` (ou nouveau `assist/log.ts`), `packages/api/src/rest/assistant-router.ts`,
nouvel onglet dans `assistant.tsx`.

**Travail détaillé** : au-delà du compteur agrégé (`AssistUsageSnapshot`), conserver
les N dernières invocations (outil, horodatage, acteur, jetons, durée) — pas le
contenu (R7/vie privée), juste la métadonnée. Réutiliser le motif borné déjà en place
pour l'historique de traces d'agent plutôt qu'une nouvelle table lourde.

**Critères d'acceptation** : un admin peut voir « qui a appelé quel outil, quand,
combien de jetons » sans ouvrir chaque entrée modifiée individuellement.

**Tests exigés** : contrat sur la troncature (N dernières entrées), permissions
(`admin` uniquement pour ce journal, contrairement au reste de l'écran Assistant
ouvert à tout acteur signé).

**Impact contrat/ADR** : aucun — vue admin pure, aucune donnée contrat A/B/C touchée.

### T04 — MCP : `resources` pour contenu/médias/schéma

**Priorité** : P2. **Effort** : 3-4 j. **Fichiers** : `packages/mcp/src/server.ts`,
nouveau `packages/mcp/src/resources/`, `packages/cli/src/commands/mcp.ts`.

**Travail détaillé** : `resources/list` et `resources/read` sur des URIs
`cogenta://collections/{name}/{id}`, `cogenta://media/{id}`, `cogenta://schema` — en
réutilisant le même `ContentGateway`/`PermissionLayer` que les outils `content.*`
actuels (même porte R4, jamais un second mécanisme de contrôle). Reste stdio (le
transport HTTP est une tâche séparée, plus grosse, T05).

**Critères d'acceptation** : un client MCP standard (Claude Desktop, Cursor) peut
lister et lire une entrée publiée par son URI de ressource, avec les mêmes
permissions qu'un appel d'outil `content.read` pour le même acteur.

**Tests exigés** : contrat — un acteur `public` ne voit que les ressources qu'il
pourrait lire par `content.read` ; parité avec le test `mcp.test.ts` existant
(« leaves media, site-config and http tools out of the manifest for the anonymous
default actor »), étendu aux ressources.

**Impact contrat/ADR** : non — extension du serveur MCP, pas du contrat C (`resources`
est une primitive MCP distincte des `tools`).

### T05 — Transport HTTP/SSE streamable pour le serveur MCP

**Priorité** : P3. **Effort** : non chiffrable sans decision préalable — nécessite
authentification réseau (au-delà de `--email`/`--role`/`--api-key` en ligne de
commande) et une revue `security-reviewer` (exécution/exposition réseau d'un serveur
d'outils agentiques, cas explicitement listé par CLAUDE.md). **Fichiers** :
`packages/mcp/src/*`, nouvelle route `cogenta serve`.

**Travail détaillé** : n'a de sens, comme le note déjà L20 §2 point 5, qu'après un vrai
mécanisme d'authentification par requête (le `--api-key` actuel est résolu une fois au
démarrage d'un process stdio, pas par requête HTTP). Prérequis pour qu'un site hébergé
devienne un MCP distant (ex. pour Claude Desktop/Code accédant à un Cogenta déployé
sans accès shell).

**Critères d'acceptation** : à définir avec la revue sécurité — non spécifiable avant
elle (même posture que fiche 58 originale pour le client externe).

**Tests exigés** : à définir après la revue.

**Impact contrat/ADR** : **ADR requise, oui** — nouvelle surface réseau exposant des
outils à effets de bord, décision d'architecture d'authentification par requête.

### T06 — Spécifier les 7 agents priorité 2-3 (L5 tâche 10)

**Priorité** : P3. **Effort** : non chiffrable (rédaction de spec, pas de code).
**Fichiers** : nouvelle fiche `docs/lots/L5-agents-priorite-2-3.md` ou équivalent.

**Travail détaillé** : lister les sept agents restants (au-delà des six déjà bâtis en
`agents-builtin`), avec pour chacun rôle/objectifs/outils contrat C nécessaires —
suivant le même format que les six existants (`identity.md` volumineux, R4 strict).

**Critères d'acceptation** : une spec exploitable directement par un futur lot, comme
les six agents déjà livrés l'ont été.

**Tests exigés** : sans objet (fiche de spec).

**Impact contrat/ADR** : dépend du contenu — probablement additif (`tools@1.x`),
à vérifier au cas par cas comme les six précédents.

### T07 — Historique de conversation persistant pour `assist.chat`

**Priorité** : P3 (confort, nommé fiche 30 §3 point 7). **Effort** : 1 j.
**Fichiers** : `packages/admin/src/routes/assistant-chat.tsx`,
`packages/agents/src/assist/chat.ts`.

**Travail détaillé** : persister les échanges d'une session de chat (localStorage
admin, pas une table serveur — pas de besoin de partage inter-appareil documenté),
pour qu'une actualisation de page ne perde pas la conversation en cours.

**Critères d'acceptation** : recharger `/assistant?tab=chat` restaure les derniers
échanges de la session courante.

**Tests exigés** : composant, persistance/restauration.

**Impact contrat/ADR** : aucun.

### T08 — Traduire les libellés de section du plan de site

**Priorité** : P2. **Effort** : 0,5 j. **Fichiers** : `packages/agents/src/site-plan/
approval.ts` (`summarisePlan`), `packages/admin/src/routes/site-plan.tsx`,
`fr.json`/`en.json`.

**Travail détaillé** : distinguer, dans `PlanSection`, le **libellé de section** (fixe,
structurel — ce que l'utilisateur voit toujours quel que soit le brief) du **contenu de
section** (généré, légitimement dans la langue du brief). `section.id` sert déjà de
discriminant stable (`'pages'`, `'structuralGaps'`, `'skin'`, etc.). `site-plan.tsx` doit
résoudre `t('sitePlan.section.' + section.id + '.title')`/`.description` en priorité
quand `section.id` est reconnu, avec repli sur le texte serveur pour un `id` non
traduit (compat ascendante si un futur type de section apparaît). `summarisePlan`
continue de renvoyer `title`/`description` en anglais pour le CLI (`cogenta site-plan`),
qui n'a pas de contexte i18n.

**Critères d'acceptation** : un admin en `fr` voit chaque titre/description de section
structurelle du plan de site en français ; le CLI hors admin n'est pas affecté.

**Tests exigés** : composant, `site-plan.tsx` rendu avec `i18n.language = 'fr'` — chaque
`section.id` connu produit un texte français, jamais la chaîne anglaise brute.

**Impact contrat/ADR** : aucun, écran admin pur. ADR requise : non.

### T09 — Persister le compteur d'usage de l'assistant

**Priorité** : P3. **Effort** : 0,5 j. **Fichiers** : `packages/agents/src/assist/
usage.ts`, `packages/cli/src/commands/assistant.ts`.

**Travail détaillé** : `createAssistUsageTracker` gagne un `persist` optionnel (tier
« réel mais local » du reste du paquet, R1) — un fichier JSON `assist-usage-<mois>.json`
dans le répertoire de données du site, écrit après chaque `record()`, relu au
démarrage. Limite à documenter explicitement dans le code si un site tourne en
plusieurs répliques : chaque réplique aurait alors son propre compteur local,
sous-comptant le total réel — pas résolu par ce lot, juste signalé.

**Critères d'acceptation** : arrêter puis redémarrer `cogenta serve` en cours de mois
conserve le total de jetons déjà consommés.

**Tests exigés** : unitaire — deux instances successives du tracker (simulant un
redémarrage) partagent le même total pour le même mois quand `persist` pointe le même
fichier.

**Impact contrat/ADR** : aucun. ADR requise : non.

### T10 — Seeder les six agents de `@cogenta/agents-builtin` dans le runtime réel

**Priorité** : P0 (bug de fond — travail déjà livré, testé et documenté comme
« intégré » par CLAUDE.md/L5/L18/L24, mais inaccessible en pratique depuis l'admin ou
tout autre point d'entrée du produit).
**Effort** : 1 j.
**Fichiers** : `packages/agents/src/agents/builtins.ts`,
`packages/cli/src/commands/agent-runtime.ts` (point d'amorçage du seeding),
`packages/agents/src/tools/manifest.ts`, tests `packages/cli/test/
agent-runtime.test.ts`.

**Travail détaillé** :
1. Étendre `builtinAgentSeeds()` (ou une fonction sœur `specialistAgentSeeds()`
   appelée au même point d'amorçage) pour inclure les six agents importés depuis
   `@cogenta/agents-builtin` (`contentAgent`, `designerAgent`, `developerAgent`,
   `performanceAgent`, `securityAgent`, `seoAgent`) — le type `AgentDeclaration` de
   `defineAgent` est déjà structurellement compatible avec ce que
   `AgentDeclarationStore` attend, pas de conversion nécessaire au-delà d'un mapping
   direct.
2. Les six doivent être **désactivés par défaut** — même politique que Security
   Scanner/Content Watch/Site Monitor. Activer `developer` (ouvre des PR) ou
   `designer` (modifie des variantes de thème) sans le vouloir explicitement serait
   une régression de sécurité, pas une amélioration.
3. `builtin: true` doit empêcher la suppression sans figer `tools`/`autonomy`/
   `budget`/`triggers` — même règle déjà documentée pour les quatre seeds existants
   (`builtins.ts:15-18`).
4. Seeding idempotent : ne pas recréer un agent déjà présent (même agent identifié par
   son `name`) à chaque redémarrage de `cogenta serve`.
5. Enregistrer `createCodePatchTool` (`developer/patch-tool.ts`) dans le registre
   d'outils réel (`packages/agents/src/tools/manifest.ts`), conditionné à un
   `PrClient` configuré — même garde que `deps.patch`, en cherchant son point
   d'enregistrement dans `manifest.ts` et en l'y répliquant pour `code.patch`.
6. Auditer un par un les autres exports utilitaires du paquet (`checkTerminology`,
   `suggestTopicGaps`, `compareToBudget`, `queryCrux`, `diagnosePerformanceRisks`,
   `detectRegression`, `bumpDependencyVersion`, fonctions SBOM) : lesquels sont déjà
   des `ToolDefinition` contrat C prêtes à l'enregistrement dans `manifest.ts`,
   lesquels ne sont que des fonctions internes à un outil plus large qui ne doivent
   pas devenir un outil de premier niveau à part entière.

**Critères d'acceptation vérifiables** :
- Les six agents apparaissent dans `GET /api/agents` et dans l'écran `agents.tsx`,
  désactivés par défaut, immédiatement après un premier démarrage de `cogenta serve`
  sur cette version.
- Activer `developer`, cliquer « Exécuter » avec une instruction concrète, produit
  réellement une pull request via `code.propose_patch` (test bout en bout contre un
  `PrClient` factice, même patron que le test existant de `deps.patch`).
- Les quatre agents seedés avant cette tâche continuent de fonctionner à l'identique
  (non-régression).

**Tests exigés** : intégration CLI (seeding idempotent, désactivés par défaut), bout
en bout `code.propose_patch` via `createAgentRunner` réel, refus propre de l'outil
sans `PrClient` configuré.

**Impact contrat/ADR** : aucun — additif, aucune signature d'outil ne change, la
permission `code.patch` existe déjà en `tools@1.3`. ADR requise : non.

## 7. Ordre d'exécution recommandé et dépendances

1. **T10 en premier**, avant tout le reste — c'est le correctif au meilleur ratio
   gain/effort de tout le domaine : il ne fait qu'exposer un travail déjà écrit, testé
   et payé (L5/L18/L24), invisible aujourd'hui par un simple oubli de câblage, pas par
   une décision produit à trancher. Aucune dépendance sur T01/T02.
2. **T01 et T02 ensuite, ensemble** — les deux corrigent la même malhonnêteté (agent
   qui semble autonome alors qu'il ne l'est pas) ; T02 est un filet immédiat (0,5 j),
   T01-Option A peut se faire dans la même session ; T01-Option B (exécution réelle)
   est un choix produit à trancher séparément avant de coder, pas un simple bug fix —
   à soumettre à l'utilisateur comme une vraie décision (rejoint la préoccupation
   déjà tracée en `docs/lots/30-agents-et-assistant-ia.md` §8 : « runtime d'agents,
   hors périmètre »). Une fois T10 fait, T01-Option B devient plus utile encore : les
   six agents spécialisés (dont `security` avec son propre déclencheur cron) sont
   exactement le cas d'usage qui justifierait un vrai scheduler.
3. **T03** indépendant, peut se faire à tout moment — aucune dépendance.
4. **T04** avant **T05** : les ressources MCP n'ont pas besoin du transport HTTP, et
   T05 dépend d'une décision de sécurité que T04 n'attend pas.
5. **T06** n'a aucune dépendance technique — c'est un travail de spécification pur,
   faisable en parallèle de tout le reste.
6. **T07** indépendant, purement cosmétique.
7. **T08** et **T09** indépendants l'un de l'autre et du reste — aucune dépendance
   technique, peuvent se faire à tout moment, y compris en parallèle de T01-T02.

Aucune tâche de cette liste ne bloque une autre fiche du plan d'audit global — le
domaine 13 est, dans son ensemble, la partie la plus achevée de tout ce qui a été
vérifié dans cette session.
