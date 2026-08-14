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
| Lot en cours | **L6 — Canaux** (`docs/lots/L6-canaux.md`). **Tâche 1 faite** : interface `ChannelAdapter`, registre, format de message abstrait — nouveau paquet `@cogenta/channels` (`packages/channels/`). `ChannelMessage` est une union discriminée sur les trois niveaux imposés par le lot (`alert`/`report`/`notification`) plutôt qu'une forme unique à champs optionnels, pour qu'une alerte sans action attendue ou une notification à rallonge soit une erreur de type, pas une possibilité silencieuse. `ChannelIdentity.linkedUserId: string \| null` rend représentable, dès cette tâche, l'état « identité de canal non liée » qu'exige la règle de sécurité centrale du lot (« une commande entrante s'exécute avec les permissions de l'humain identifié, jamais avec celles de l'agent ») — l'application de la règle elle-même est la tâche 3, pas celle-ci. `InboundCommand` porte toujours l'identité d'origine, structurellement impossible à contourner. `createChannelRegistry` reprend exactement le patron de `createProviderRegistry` (`@cogenta/agents`) : zéro canal configuré fonctionne (esprit R2), `get()` sur un nom inconnu lève une `CogentaError` typée. Deux nouveaux codes `@cogenta/core` : `CHANNEL_UNKNOWN`, `CHANNEL_DUPLICATE`. **Tâche 2 faite** : liaison d'identité (`packages/channels/src/linking/`) — `createChannelLinkStore` (`generateCode`/`verifyCode`/`resolveIdentity`/`revoke`/`listLinkedChannels`), persistée via `ensureChannelTables` (deux tables, patron `ensureAuthTables` de `@cogenta/auth` repris à l'identique — pas de fichier de migration séparé). Code à 8 caractères, alphabet non ambigu à 32 symboles (style Crockford, `0`/`O`/`1`/`I`/`L` exclus), 40 bits d'entropie, jugés contre le brute-force d'un seul code dans sa fenêtre de validité (10 min par défaut), pas contre les standards de secret long terme (les jetons de session restent à 256 bits) — stocké haché, jamais en clair. `verifyCode` rejette toute cause d'échec (inexistant, expiré, déjà utilisé, mauvais canal) sous un seul code d'erreur uniforme `CHANNEL_LINK_CODE_INVALID`, pour qu'un appelant ne puisse pas construire par mégarde une réponse côté canal qui distingue les causes — un oracle d'énumération contre les identités non liées. **Tâche 3 faite** : routage des commandes entrantes avec permissions de l'humain (`packages/channels/src/inbound/`) — la règle de sécurité centrale du lot est maintenant réellement appliquée, pas seulement représentable. `authorizeInboundCommand(identity, requiredRoles, getUserRoles)` est la porte unique : identité non liée → `{ok:false, reason:'unlinked', shouldReply:false}` (aucune réponse possible sans effort de la part de l'appelant) ; liée mais sans le rôle requis → `{ok:false, reason:'forbidden', shouldReply:true, userId}` (un utilisateur connu, qui peut être informé) ; autorisé → `{ok:true, userId}` où `userId` provient exclusivement de `identity.linkedUserId`, jamais d'un champ du message entrant. `createCommandRouter` vérifie l'absence de liaison *avant même* de chercher si la commande existe — une identité non liée n'obtient aucune réponse, y compris pour une commande inconnue (répondre « commande inconnue » confirmerait déjà l'existence du bot). `requiredRoles` reprend le vocabulaire de rôles ouvert déjà utilisé par `CollectionDefinition.permissions`/`PermissionLayer` (`@cogenta/api`) plutôt que d'inventer un système de permissions parallèle pour les canaux. Un nouveau code `@cogenta/core` : `CHANNEL_COMMAND_DUPLICATE`. Trois scénarios de sécurité prouvés par test, exactement ceux exigés par le lot : commande d'une identité non liée (ignorée, y compris si la commande existe), escalade de permission via le canal (refusée même en forgeant le texte de la commande), et l'identité agissante ne peut pas être usurpée via la charge utile entrante. **Tâche 4 faite** : adaptateur Telegram, complet (`packages/channels/src/providers/telegram/`) — premier canal réellement vivant, câblé aux tâches 2/3. Zéro nouvelle dépendance : client Telegram fait main (`createTelegramClient`, quatre méthodes REST/JSON via `fetch`), même choix que le parseur WXR de `@cogenta/import` ou le sous-ensemble JSON-RPC de `@cogenta/mcp` pour une API aussi simple — pas de `deps-auditor` consulté cette fois (contrainte du harnais fork, décision prise directement, motivation identique aux précédents). Transport : *long-polling* (`getUpdates`), pas de webhook — un webhook exige un vrai point HTTPS public et la vérification de signature Telegram, et aucun plan de ce projet n'est déployé publiquement (cadrage tâche 12 du L9) ; le polling fonctionne tel quel partout où `cogenta serve` tourne déjà. Limite de débit : un 429 est retenté avec la valeur `retry_after` réelle de Telegram, jamais un backoff deviné. Rendu (`renderTelegramMessage`) : MarkdownV2 échappé, boutons intégrés pour une alerte avec actions — tout le formatage Telegram reste dans ce module, `ChannelMessage` ne le connaît jamais. Un bouton pressé (`callback_query`) route son `callback_data` — littéralement le texte de commande qu'il représente — à travers exactement le même `CommandRouter.route()` qu'une commande tapée : aucune deuxième voie d'autorisation parallèle. Une identité non liée qui écrit au bot voit son message essayé une seule fois comme code de liaison (confirmé si valide, silence sinon) — le reste de la règle de sécurité centrale (silence total pour tout le reste) tient toujours. Un nouveau code `@cogenta/core` : `CHANNEL_TELEGRAM_API_ERROR`. Reste à faire, dans l'ordre du lot : file d'approbation actionnable depuis le canal (tâche 5), puis formats de rendu, préférences, email, Slack, Discord, webhook. |
| Lots terminés | L0 (socle), L1 (contenu), L3 (rendu), L2 (admin, 16/16 tâches), L4 (runtime agentique, 21/21 tâches), **L5 (agents, 9/10 tâches — tâche 10 délibérément non entamée : aucune spécification dans le lot pour les sept agents de priorité 2-3, contrairement aux quatre de priorité 1 ; reprendre quand une spec équivalente existe. Résumé L5 1-9 dans l'historique git, commits `ea82de1`..`bcf646e`)**, **L9 — Écosystème (`docs/lots/L9-ecosysteme.md`, installeur/skin IA/blueprints/import/CLI/hébergement mutualisé/documentation/gouvernance, les 14 tâches faites sauf une case explicitement laissée à l'humain — voir ci-dessous). Résumé complet dans l'historique git (commits `d321a40`..`6a44558`)**. Points de L9 qui ne sont PAS dans le code et qu'il faut garder en tête pour la suite : (1) `cogenta build`/`backup`/`upgrade`/`deploy`/`theme`/`agent` sont des commandes CLI honnêtement différées, sans stub, faute de capacité réelle sous-jacente (tâche 9) ; (2) la case « testé sur un vrai hébergement cPanel » (tâche 13, `docs/hebergement-mutualise.md`) reste à cocher par l'humain — ce n'est pas du travail en attente, c'est un accès que je n'ai pas ; (3) aucun `AgentRegistry` vivant n'existe nulle part dans ce dépôt (R2-honnête) — activer un agent dans l'admin ne le fait pas tourner ; ce sera probablement le premier vrai gap que L6/L7/L8 devront combler. 2564 tests unitaires, tous verts (recompté directement paquet par paquet cette session, en sommant chaque `vitest run` isolé — 2503 avant L6 tâche 1, 2513 après tâche 1, 2529 après tâche 2, 2545 après tâche 3, +19 pour l'adaptateur Telegram de la tâche 4). Un timeout du test de compilation TS `@cogenta/schema`'s `test/generated-types-compile.test.ts` (60s dépassées sous contention CPU d'un `pnpm test` complet) a été observé deux fois cette session, la deuxième pendant L6 tâche 1 — reconfirmé non reproductible en isolation les deux fois (`pnpm -F @cogenta/schema test`, 359/359 verts), même famille de flaky d'environnement déjà documentée pour `@cogenta/seo` (revu à nouveau, non reproductible, pendant L6 tâche 3). Intégration Postgres/MySQL/MariaDB du `MediaStore` écrite mais non exécutée cette session (Docker Desktop indisponible) ; adaptateurs de fournisseurs LLM sans test d'intégration exécuté (nécessite une clé API réelle, `vitest.integration.config.ts` prêt, skip loud si absente). |
| Paquets publiés | `@cogenta/core` (gagne `CHANNEL_UNKNOWN`/`CHANNEL_DUPLICATE`/`CHANNEL_LINK_CODE_INVALID`/`CHANNEL_COMMAND_DUPLICATE`/`CHANNEL_TELEGRAM_API_ERROR`, L6 tâches 1-4), `@cogenta/channels` (interface `ChannelAdapter` + registre + liaison d'identité + routage entrant + adaptateur Telegram, L6 tâches 1-4), `@cogenta/schema` (gagne `withReadOnlyStore`, L9 tâche 12), `@cogenta/blocks`, `@cogenta/api`, `@cogenta/render`, `@cogenta/seo`, `@cogenta/theme-canonical`, `@cogenta/auth`, `@cogenta/cli` (`doctor`, `migrate`, `users create`, `serve`/`dev` avec option `readOnly`, `import wordpress`, `generate types`, `skin list/validate/apply/generate`), `@cogenta/mcp` (serveur MCP, tâche 17), `@cogenta/agents-builtin` (agents intégrés, L5), `@cogenta/agents` (gagne `generateSkin`, L9 tâche 9, et une dépendance vers `@cogenta/render`), `@cogenta/import` (import WordPress WXR, L9 tâche 6), `create-cogenta` (installeur `npm create cogenta`, L9 tâche 1 ; gagne `resetPlaygroundData` et l'export public de `BLUEPRINT_CONTENT_PACKS`, tâche 12 ; nom non préfixé par convention npm), `@cogenta/admin` (coquille, non publié) |
| Paquets internes non publiés | `@cogenta/project-site` (site du projet, L9 tâche 12, `private: true`, jamais déployé par ce dépôt) |
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
