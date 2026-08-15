# @cogenta/channels

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/agents@0.1.2

## 0.1.0

### Minor Changes

- [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/channels` (L6 task 1): the `ChannelAdapter` interface and
  `createChannelRegistry`, the foundation for the L6 lot ("Canaux" —
  Telegram, Slack, Discord, email, webhooks).
  
  A message is described abstractly — `AlertChannelMessage`,
  `ReportChannelMessage`, `NotificationChannelMessage` — matching the lot's
  three fixed formats exactly, so no business code ever writes
  platform-specific Markdown. `ChannelIdentity.linkedUserId` is `string |
  null`, representing an unlinked channel identity as a first-class state:
  the lot's central security rule ("une commande entrante s'exécute avec les
  permissions de l'humain identifié, jamais avec celles de l'agent")
  requires that state to exist even before a later task enforces it.
  `InboundCommand` always carries the `ChannelIdentity` it came from, so a
  command cannot be routed without knowing who — if anyone — sent it.
  
  `createChannelRegistry` mirrors `@cogenta/agents`'s `createProviderRegistry`:
  a site with zero channels configured works fine (R2's spirit), `get()` on
  an unconfigured name throws a typed `CogentaError` rather than returning
  `undefined`.
  
  Two new `@cogenta/core` error codes: `CHANNEL_UNKNOWN`, `CHANNEL_DUPLICATE`.

- [`ec28342`](https://github.com/cogenta-cms/cogenta/commit/ec2834226f36cbf8d54e4be8854ea05ae0e1feae) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the channel-actionable approval queue (L6 task 5) — "Un agent en
  niveau `execute_with_approval` produit une entrée dans la file
  d'approbation. Le canal reçoit un message [...] deux actions : approuver,
  refuser."
  
  Builds a channel-facing layer on top of `@cogenta/channels`'s new
  dependency on `@cogenta/agents`' real `ApprovalQueue`
  (`createMemoryApprovalQueue`) rather than a new approval concept:
  `dispatchApproval` renders an `ApprovalRequest` as an `AlertChannelMessage`
  with two one-time tokens (12 Crockford-alphabet characters, 60 bits of
  entropy, 20-minute TTL — longer than the linking code's, since approving a
  real action deserves more time than typing a code just seen), and
  `createApprovalCommands` registers `/approve`/`/deny` on a
  `CommandRouter` that redeems them.
  
  A button press routes through the exact same `CommandRouter.route()` and
  `authorizeInboundCommand` security gate a typed command does — no second
  authorization path. Per-token `requiredRole` (not per-command, since
  different tools need different permissions) is checked before deciding.
  `ApprovalTokenStore.peek`/`markDecided` are first-write-wins and return a
  real discriminated outcome (`ready`/`already_decided`/`expired`/`invalid`)
  rather than throwing — "Une entrée déjà traitée rend le bouton inopérant,
  avec message clair — pas d'erreur brute." Every decision is journalled via
  the real `AuditLogLike.record`, naming the channel of origin in `diff`.
  
  A signed-link primitive (`buildSignedApprovalLink`/
  `verifyApprovalLinkSignature`, HMAC-SHA256 with constant-time comparison,
  mirroring `StorageDriver`'s `signedUrl`) is included for buttonless
  channels — "Sur un canal sans boutons (email, webhook), l'action est un
  lien signé à usage unique" — tested in isolation; no buttonless adapter
  exists yet to consume it (email/webhook are later lot tasks).
  
  Full agent → queue → channel → action → audit cycle proven by a real
  integration test, plus the lot's two explicit acceptance criteria: a
  reused token is refused without re-deciding, an expired token is refused
  with a clear message, not a raw error.

- [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Adds a complete Discord channel adapter (L6 task 10): outbound messages
  rendered as real embeds with button components, inbound message/interaction
  handling routed through the existing identity-linking and human-permission
  authorization gate (never a parallel path), a real Gateway WebSocket client
  with deterministic heartbeat scheduling, and 429 rate-limit handling using
  Discord's actual `retry_after` value. One new `@cogenta/core` error code:
  `CHANNEL_DISCORD_API_ERROR`.

- [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the email channel adapter (L6 task 8) — outbound-only (the lot's task
  list names this adapter without "commandes entrantes", unlike Telegram's
  task 4), buttonless: an `Alert`'s two actions render as HMAC-signed,
  single-use links (`## Approbations depuis le canal`'s explicit guidance for
  channels without buttons) reusing L6 task 5's real signing primitive rather
  than a new one.
  
  R1-compliant `EmailTransport` interface with one real, tested,
  no-external-service implementation (`createFileEmailTransport`, writes each
  message to disk) — a real SMTP/HTTP-API transport is a deliberate,
  documented follow-up, not built in this pass; raw SMTP is a materially
  larger undertaking than Telegram's plain-HTTP Bot API and was judged
  disproportionate to this task's scope.
  
  Two new `@cogenta/core` error codes: `CHANNEL_EMAIL_TRANSPORT_ERROR`,
  `CHANNEL_EMAIL_INBOUND_UNSUPPORTED`.

- [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/channels`'s identity-linking mechanism (L6 task 2): a
  one-time code generated on the admin side, verified from a channel, tying
  a channel-side identity (`channelName`/`channelUserId`) to a real Cogenta
  user — the piece "## La règle de sécurité centrale" (`docs/lots/L6-canaux.md`)
  depends on.
  
  `createChannelLinkStore(db, now?)` — `generateCode`, `verifyCode`,
  `resolveIdentity`, `revoke`, `listLinkedChannels`, all real, persisted
  (SQLite/Postgres/MySQL via `ensureChannelTables`, following
  `@cogenta/auth`'s `ensureAuthTables` pattern — no separate migration file).
  
  Codes are 8 characters from a 32-symbol unambiguous alphabet (Crockford-style,
  `0`/`O`/`1`/`I`/`L` removed), 40 bits of entropy, single-use, a short
  default TTL (10 minutes, "valable quelques minutes" per the lot doc) —
  judged against brute-forcing one code within its TTL window, not against
  long-term-secret standards (session tokens remain 256 bits). Stored hashed,
  never plain, like a session token.
  
  `verifyCode` rejects every failure kind — nonexistent, expired,
  already-used, wrong channel — with the same uniform `CHANNEL_LINK_CODE_INVALID`
  error, so a caller cannot accidentally build a channel-facing reply that
  leaks which reason applied (an enumeration oracle against unlinked
  identities).
  
  One new `@cogenta/core` error code: `CHANNEL_LINK_CODE_INVALID`.

- [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/channels`'s inbound command routing (L6 task 3) — the
  payoff for tasks 1 and 2: "## La règle de sécurité centrale"
  (`docs/lots/L6-canaux.md`), **"Une commande entrante s'exécute avec les
  permissions de l'humain identifié, jamais avec celles de l'agent."**
  
  `authorizeInboundCommand(identity, requiredRoles, getUserRoles)` — the
  single security gate every inbound command passes through. An unlinked
  identity (`linkedUserId: null`) is refused with `shouldReply: false`,
  matching "Une identité de canal non liée à un compte est ignorée, sans
  réponse — répondre confirmerait l'existence du bot à un inconnu": a
  consuming adapter that just checks the flag gets that property for free.
  A linked-but-unauthorized user is refused with `shouldReply: true`
  (they're a known person and may be told so). An authorized result always
  carries the identity's real, verified `linkedUserId` — never anything
  read off the inbound payload itself.
  
  `createCommandRouter({getUserRoles})` — parses `/name args`, looks up a
  registered handler, and routes through `authorizeInboundCommand` before
  ever invoking it. The unlinked check happens before even checking whether
  the command is recognized, so an unlinked stranger gets silence for
  *any* input, not just for commands that exist — an "unknown command"
  reply would itself leak the bot's existence.
  
  `requiredRoles` reuses contract A's own open role-name-array convention
  (`CollectionDefinition.permissions`, `@cogenta/api`'s `PermissionLayer`)
  rather than a parallel permission-string system.
  
  One new `@cogenta/core` error code: `CHANNEL_COMMAND_DUPLICATE`.

- [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add real constructors for the lot's three fixed message levels (L6 task 6)
  — `buildAlert`/`buildReport`/`buildNotification` (`src/formats/`) — that
  validate the exact rules `## Formats de message` states in prose: an alert
  requires a title/context/expected-action and a real admin URL; a report
  requires at least one key figure and refuses to exceed an abstract
  480-character screen budget unless a `moreUrl` fallback is given; a
  notification must be a real, non-empty single line. `approvals/message.ts`
  now builds its alert through `buildAlert` instead of a hand-assembled
  literal, so it gets the same validation for free.
  
  Also hardens the Telegram adapter's report rendering with a real,
  last-resort truncation at Telegram's actual 4096-character `sendMessage`
  limit — the `moreUrl` footer is never the part that gets cut, since it's
  the reader's only way to the full detail.
  
  New `@cogenta/core` error code: `CHANNEL_MESSAGE_INVALID`.

- [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/channels`'s notification preferences and grouping (L6 task
  7) — per `(userId, channelName)`: opted-in event types, minimum severity,
  quiet hours, and a grouping mode (`immediate | hourly | daily`).
  
  A `NotificationDispatcher.notify()` filters against these preferences and
  either sends immediately or queues the notification; `flushDue()`
  collapses every due group into a single message (a `Report` via
  `buildReport` for more than one queued item, a `Notification` for
  exactly one) — this is what turns fifteen dependency-scan findings into
  one grouped message instead of fifteen separate ones
  ("## Préférences", `docs/lots/L6-canaux.md`).
  
  Quiet hours defer a non-critical notification until the window ends
  rather than dropping it; a `critical`-severity notification always
  bypasses quiet hours. Preferences persist via a new `cogenta_channel_preferences`
  table (`ensurePreferenceTables`), following the same `create table if
  not exists` pattern as `ensureChannelTables`.
  
  One new `@cogenta/core` error code: `CHANNEL_PREFERENCES_INVALID`.

- [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the Slack channel adapter (L6 task 9) — the second real
  `ChannelAdapter`, wired to the same identity linking and inbound command
  routing Telegram (task 4) already proved.
  
  Zero-dependency: a small hand-typed client (`createSlackClient`) calls
  Slack's plain HTTPS/JSON Web API directly via `fetch`, same reasoning as
  the Telegram client. Socket Mode, not the Events API webhook — Slack's own
  real, officially-supported answer to "no public HTTPS endpoint," same
  reasoning as Telegram's long-polling choice (no plane of this project is
  deployed publicly yet). `createSlackSocketClient` opens a WebSocket via
  `apps.connections.open`, using Node's built-in `WebSocket` global (stable
  since this project's Node 22 minimum) — no new dependency needed for the
  transport either. A `disconnect` envelope triggers exactly one
  reconnect, mirroring Telegram's continuous poll loop.
  
  Rate limiting: Slack signals a 429 via an HTTP `Retry-After` header
  (unlike Telegram's JSON `retry_after` field) — read correctly and
  retried with the real value, never a guessed backoff.
  
  Message rendering (`renderSlackMessage`) turns the abstract
  `ChannelMessage` into Slack Block Kit blocks, entirely inside this
  adapter. A button's `action_id`/`value` is literally the command text it
  routes as — a Block Kit button press (`block_actions`) goes through the
  exact same `CommandRouter.route()` a typed message does, never a second,
  parallel authorization path. An unlinked identity's message is tried
  once as a linking code, exactly like Telegram; every other case stays
  silent.
  
  Capabilities declared honestly: `threads`/`attachments` are `false` —
  not built this pass, deferred rather than half-implemented.
  
  One new `@cogenta/core` error code: `CHANNEL_SLACK_API_ERROR`.

- [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the Telegram channel adapter (L6 task 4) — "Telegram en premier,
  complet": the first live `ChannelAdapter`, wired to tasks 2/3's identity
  linking and inbound command routing.
  
  Zero-dependency: a small hand-typed client (`createTelegramClient`) calls
  Telegram's plain HTTPS/JSON Bot API directly via `fetch`, following this
  project's established precedent (`@cogenta/import`'s WXR parser,
  `@cogenta/mcp`'s JSON-RPC subset) of a small hand-rolled client over a new
  SDK dependency for a REST API this simple.
  
  Transport: long-polling (`getUpdates`), not a webhook — a webhook needs a
  real public HTTPS endpoint and Telegram's own signature verification, and
  no plane of this project is deployed publicly yet (L9 task 12's scoping).
  Polling works unchanged wherever `cogenta serve` already runs.
  
  Rate limiting: a 429 response is retried using Telegram's own
  `retry_after` value, never a guessed backoff — "Prévoir la file, le
  backoff et le regroupement dès le premier adaptateur."
  
  Message rendering (`renderTelegramMessage`) turns the abstract
  `ChannelMessage` (alert/report/notification) into MarkdownV2 text plus
  inline keyboard buttons, entirely inside this adapter — "on n'écrit pas
  de Markdown Telegram dans le code métier." A button's `callback_data` is
  literally the command text it routes as: a button press goes through the
  exact same `CommandRouter.route()` a typed command does, never a second,
  parallel authorization path. An unlinked identity's message is tried
  once as a linking code (confirmed on success, silent on any failure) —
  "Une identité de canal non liée à un compte est ignorée, sans réponse"
  still holds for everything else.
  
  One new `@cogenta/core` error code: `CHANNEL_TELEGRAM_API_ERROR`.

- [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the generic signed webhook channel (L6 task 11, the final task of the
  L6 lot) — the security primitive "## Pièges connus" names explicitly:
  "Les webhooks entrants sont une surface d'attaque. Vérification de
  signature obligatoire, fenêtre temporelle, protection contre le rejeu."
  
  `verifyIncomingWebhook` checks all three, mandatory: HMAC-SHA256
  signature authenticity (constant-time comparison, same construction as
  `approvals/signed-link.ts`), timestamp freshness against an injectable
  clock (default 5-minute window), and replay rejection via a bounded
  in-memory `WebhookReplayGuard` — a request failing any check is rejected
  with a distinguishable, typed `CogentaError` (unlike identity-linking's
  deliberately uniform code, there is no enumeration oracle here: a
  webhook secret is either configured correctly or it isn't, and
  distinguishing "bad signature" from "stale timestamp" from "already
  processed" is a legitimate operator need). `signOutgoingWebhook` is the
  matching outbound half `createWebhookAdapter`'s `send()` uses on every
  request — round-trip tested against the real verifier, not just each
  half in isolation.
  
  `createWebhookAdapter` is outbound-only: `capabilities.buttons` is
  `false` (no UI to click — actions render as real signed links, reusing
  the same primitive the email adapter, task 8, already consumes) and
  `capabilities.inbound` is `false` — real inbound command execution for
  an arbitrary third-party caller is a materially larger undertaking
  (a live HTTP route, per-integration identity decisions) than this
  task's actual deliverable, the signing/verification primitive itself,
  which is complete and exercised end-to-end. `verifyIdentity` is an
  honest refusal, matching the email adapter's precedent.
  
  Three new `@cogenta/core` error codes: `CHANNEL_WEBHOOK_SIGNATURE_INVALID`,
  `CHANNEL_WEBHOOK_EXPIRED`, `CHANNEL_WEBHOOK_REPLAY_DETECTED`, plus
  `CHANNEL_WEBHOOK_DELIVERY_FAILED` and `CHANNEL_WEBHOOK_INBOUND_UNSUPPORTED`.
  
  L6 ("Canaux") is now complete — all 11 tasks done.

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`bcf646e`](https://github.com/cogenta-cms/cogenta/commit/bcf646edfd9810a977161075e639bce760b91864), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/agents@0.1.0
