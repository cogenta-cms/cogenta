# 58 — MCP : serveur Cogenta et client vers MCP externes

> **État** : le serveur MCP de Cogenta est déjà solide (JSON-RPC/stdio maison, zéro
> dépendance officielle). Le **client** MCP sortant existe déjà en bas niveau
> (`createMcpStdioClient`/`wrapMcpTool`) mais n'est câblé nulle part — ni store, ni
> écran, ni runtime. Ouvrir ce client fait entrer un exécutable tiers non contrôlé
> dans le runtime d'agent : **revue `security-reviewer` obligatoire avant tout
> code sur le client**.
> **Fichiers** : `packages/mcp/src/*`, `packages/cli/src/commands/mcp.ts`,
> `packages/admin/src/routes/mcp.tsx`
> **Effort** : renommage serveur, quelques heures ; client externe, gros lot,
> non chiffrable avant la décision de sécurité
> **ADR/RFC requise** : oui, pour la taxonomie de permission du client externe si
> un nouveau vocabulaire est introduit ; revue `security-reviewer` obligatoire dans
> tous les cas

---

## 1. Ce qui existe réellement

**Serveur** : `packages/mcp/src/server.ts` (`createMcpServer`, JSON-RPC sur une
liste de `ExecutableTool` déjà construite par l'appelant, aucune permission ici —
R4 respecté), `stdio-transport.ts`. `packages/cli/src/commands/mcp.ts` (`cogenta
mcp`) câble tout : résout un acteur (compte réel/rôle synthétique/clé API via
`ApiKeyStore`), construit le manifeste, démarre le serveur jusqu'à fermeture de
stdin. `packages/admin/src/routes/mcp.tsx` réutilise **la même table `api_keys`**
que l'écran générique Clés API, ajoute un toggle « purpose » (`mcp`/`chat`),
affiche la commande CLI et un bloc JSON prêt à coller pour Claude Desktop/Cursor.

**Client, écrit, jamais câblé** : `packages/mcp/src/client/stdio-client.ts`
(`createMcpStdioClient`, spawn+JSON-RPC vers un process tiers) et
`packages/mcp/src/client/wrap-tool.ts` (`wrapMcpTool`, transforme un outil distant
en `ToolDefinition` standard, permissions déclarées par l'intégrateur, jamais par
le serveur distant — déjà la bonne position dans le code). Aucun store de
« connexions MCP externes », aucune commande CLI, aucun écran, aucun câblage
runtime. Zéro dépendance `@modelcontextprotocol/sdk` — tout est fait main (R9/R10).

## 2. Diagnostic

Le retour utilisateur mélange deux demandes distinctes : **« MCP Server »** =
gérer le serveur MCP *de* Cogenta (déjà fait à 90 %, juste une clé recyclée du
système générique) ; **« ajouter les autres MCP »** = un vrai client sortant pour
que Cogenta consomme des serveurs MCP tiers (brique bas niveau prête, rien
au-dessus).

## 3. Plan de développement

### MCP Server (sans risque, indépendant de la décision de sécurité)

**Tâche 1** — Renommer l'écran en « MCP Server » (nav, i18n), sans changer son
fonctionnement. Le scope existant EST déjà le contrôle d'accès aux outils (via
`PermissionLayer`, R4) — documenter ce fait plutôt qu'inventer un second
mécanisme.

### MCP Client externe *(gate sécurité)*

> **Revue `security-reviewer` rendue le 2026-08-26 : NO-GO tel qu'écrit, GO
> conditionnel.** Verdict complet et scénarios d'attaque dans le rapport de
> l'agent (voir historique de session) ; résumé actionnable ci-dessous, devenu
> **tâche 1bis, bloquante, avant toute autre tâche de cette section**.

**Tâche 1bis — Plancher de sandboxing, avant la tâche 2** (`packages/mcp/src/
client/stdio-client.ts`, `wrap-tool.ts`) :
- `spawn(command, args, { env: options.env ?? {}, cwd: <répertoire dédié à la
  connexion, vidé avant/après> })` — **jamais** un héritage implicite de
  `process.env` (trouvaille critique : le défaut actuel transmet
  `COGENTA_AUTH_SIGNING_KEY` et tous les secrets configurés par variable
  d'environnement au process tiers, avant même `initialize()`, donc avant toute
  case à cocher des tâches 3/4).
- `stdio: ['pipe', 'pipe', 'pipe']` — jamais `inherit` sur stderr (fuite/injection
  dans les logs du host, contourne le logger structuré et sa politique de
  rédaction de secrets) ; stderr capturé et journalisé via le logger structuré,
  plafonné en taille.
- Timeout dur par appel JSON-RPC qui tue le process et rejette — `wrapMcpTool`'s
  `execute` doit accepter `(input, ctx)` et honorer `ctx.signal` (absent
  aujourd'hui : le seul timeout du runtime n'entoure que l'appel modèle, jamais
  l'exécution d'un outil — un serveur qui ne répond jamais bloque indéfiniment).
- Watchdog mémoire/CPU par poll du PID (pas de `resourceLimits`
  `worker_threads` possible sur un `child_process` externe, R9/R10 interdisent une
  dépendance native) ; la vraie limite reste au niveau hébergement (cgroup/Job
  Object), à documenter comme prérequis, pas une garantie du code.
- Confirmation explicite et honnête à la création de toute connexion `stdio` —
  même esprit que `deps.patch autonomous` (désactivé par défaut, avertissement
  explicite) — nommant noir sur blanc que ce binaire tourne avec les privilèges
  OS complets du serveur Cogenta, ce que la case à cocher par outil (tâche 3) ne
  protège pas (elle borne la surface *outil* offerte au modèle, pas l'exécution
  du *process* lui-même).

**Tâche 2** — Nouveau module `packages/mcp/src/registry/` : `McpConnectionStore`
— table `mcp_connections` (id, nom, transport `stdio|http`, commande+args ou URL,
auth `none|api_key|oauth`, référence chiffrée au secret via le même mécanisme
AES-256-GCM que les fournisseurs LLM — R7, statut, dernière découverte d'outils).

**Tâche 3** — Écran « MCP Clients » : ajout de connexion, test (`initialize` +
`tools/list`), liste des outils découverts avec case à cocher pour ceux réellement
exposés — jamais un octroi implicite du catalogue distant entier (philosophie
« absent, pas refusée » de `@cogenta/plugins`).

**Tâche 4** — Câblage runtime (`packages/agents/src/runtime/`) : au démarrage d'un
agent, pour chaque connexion activée, client + `wrapMcpTool` pour chaque outil
coché, permissions déclarées par l'admin lors de la case à cocher.

**Tâche 5** — Codes d'erreur `@cogenta/core` : `MCP_CONNECTION_NOT_FOUND`,
`MCP_CONNECTION_AUTH_INVALID`, etc. (taxonomie ouverte, mineur).

**Tâche 6** — Contrat C : vocabulaire de permission des outils distants.
**`mcp.external.<connexion>` rejeté par la revue sécurité** — une permission par
*connexion* autoriserait tous ses outils cochés indifféremment de leur risque
réel (un `read_file` et un `send_email` sur le même serveur), ce qui contredit
directement le principe « case à cocher par outil » de la tâche 3 et affaiblit R4
(« un outil déclare ses permissions », pas sa connexion). Forme retenue :
`mcp.external:<connexionId>.<nomOutilDistant>`, une permission par outil distant
coché, scope après `:` — cohérent avec la convention déjà en usage dans le
contrat C (`http.fetch:api.example.com`).

## 4. Critères d'acceptation

- L'écran « MCP Server » est renommé sans régression fonctionnelle.
- Une connexion externe ne s'exécute jamais sans révision manuelle explicite de la
  part de l'admin (outils exposés cochés un par un).
- Aucun secret de connexion externe n'apparaît en clair une fois enregistré.
- **Bloquants ajoutés par la revue sécurité (tâche 1bis)** : un process `stdio`
  spawné ne reçoit jamais de variable d'environnement du host par défaut ; un
  serveur qui ne répond jamais est tué et rejeté sous le timeout configuré,
  jamais un blocage indéfini ; toute connexion `stdio` exige une confirmation
  explicite nommant l'exécution non sandboxée ; une permission couvre un outil
  distant précis, jamais une connexion entière.

## 5. Tests exigés

- Sécurité : un serveur MCP externe malveillant ne peut ni lire ni écrire hors de
  ce que les outils cochés autorisent explicitement (test d'escalade, même esprit
  que les tests de `@cogenta/plugins`).
- Contrat : `wrapMcpTool` refuse une permission non déclarée par l'admin, même si
  le serveur distant en réclame une plus large.
- R7 : aucun secret de connexion externe dans le contexte modèle.
- **Ajoutés par la revue sécurité** : test prouvant qu'un process spawné ne reçoit
  aucune variable d'environnement du host (pas seulement qu'il ne peut pas lire
  un fichier) ; test prouvant qu'un serveur qui ne répond jamais est tué et
  rejeté sous le timeout configuré, pas seulement documenté comme souhaité.

## 6. Pièges connus

- Un serveur MCP `stdio` tiers est un exécutable arbitraire que Cogenta `spawn` —
  contrairement à `@cogenta/plugins`, aucun isolat `worker_threads`+`vm`
  n'existe pour ce cas. Signaler explicitement si un sandboxing équivalent est
  nécessaire avant d'ouvrir cette surface en production.
- Ne jamais hériter les permissions déclarées par le serveur distant lui-même.

## 7. Décisions à prendre

- **Revue `security-reviewer` obligatoire avant tout code sur le client externe** —
  exécution de code tiers, cas explicitement listé par CLAUDE.md.
  **Faite le 2026-08-26** : NO-GO tel qu'écrit, GO conditionnel au plancher de la
  tâche 1bis. Aucun des constats n'exige de revoir l'architecture bas niveau déjà
  écrite (`createMcpStdioClient`/`wrapMcpTool` restent la bonne forme) — options
  de spawn, câblage de signal, correction de convention de nommage, tous
  réalisables avant la tâche 2 sans re-conception.
- Vocabulaire de permission du client externe (tâche 6). **Tranché** :
  `mcp.external:<connexionId>.<nomOutilDistant>`, voir tâche 6.
- Sandboxing d'un serveur MCP `stdio` tiers (piège ci-dessus) — **tranché**, voir
  tâche 1bis.
