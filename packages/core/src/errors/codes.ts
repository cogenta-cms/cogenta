/**
 * Every error Cogenta throws carries one of these codes. They are a public API:
 * callers branch on them, logs are aggregated by them, and translations key off
 * them. Adding a code is a minor version; changing the meaning of one is major.
 */
export const ERROR_CODES = [
  // Configuration
  'CONFIG_INVALID',
  'CONFIG_NOT_FOUND',
  'CONFIG_LOAD_FAILED',
  'CONFIG_SECRET_IN_FILE',

  // Drivers
  'DRIVER_UNKNOWN',
  'DRIVER_DUPLICATE',
  'DRIVER_UNAVAILABLE',
  'DRIVER_INIT_FAILED',

  // Data
  'DB_UNREACHABLE',
  'DB_DIALECT_UNSUPPORTED',
  'MIGRATION_FAILED',
  'MIGRATION_IRREVERSIBLE',
  'MIGRATION_LOCKED',
  'MIGRATION_CHECKSUM_MISMATCH',
  'MIGRATION_DESTRUCTIVE',

  // Content schema
  'SCHEMA_INVALID',

  // Content
  'CONTENT_NOT_FOUND',
  'CONTENT_INVALID',
  'CONTENT_CONFLICT',
  'CONTENT_SLUG_INVALID',
  'CONTENT_SLUG_TAKEN',
  'CONTENT_ROUTE_INVALID',
  'CONTENT_REDIRECT_LOOP',
  // The admin's redirect screen (audit follow-up to L10 task 2: the store and
  // its wiring into every public GET existed, but nothing ever let an editor
  // create or remove a row from a browser).
  'REDIRECT_UNKNOWN',
  'CONTENT_SCHEDULE_INVALID',
  'CONTENT_READ_ONLY',
  // Concurrent editing (fiche 02 task 7): a `PATCH` naming `expectedUpdatedAt`
  // is refused when it no longer matches the live row — someone else's write
  // landed first. Detection, not locking: no table, no TTL, no state that
  // outlives the request.
  'CONTENT_STALE_WRITE',
  // Trash (`schema@2.0`, ADR-0022). `restrict` is no longer enforced only by
  // the foreign key: trashing is not a DELETE, so the database cannot refuse.
  'CONTENT_REFERENCED',
  'CONTENT_NOT_TRASHED',

  // Editorial workflow (`schema@2.1`, ADR-0027). `reviewState` is orthogonal
  // to `status`, exactly as `deletedAt` is to it since ADR-0022.
  'CONTENT_WORKFLOW_DISABLED',
  'CONTENT_REVIEW_TRANSITION_INVALID',

  // Taxonomies (`schema@2.0`, ADR-0022)
  'TAXONOMY_UNKNOWN',
  'TAXONOMY_TERM_NOT_FOUND',
  'TAXONOMY_SLUG_TAKEN',
  'TAXONOMY_CYCLE',
  'TAXONOMY_TOO_DEEP',
  'TAXONOMY_NOT_HIERARCHICAL',
  'TAXONOMY_TERM_HAS_CHILDREN',

  // Menus (navigation)
  'MENU_UNKNOWN',
  'MENU_NAME_TAKEN',
  'MENU_LOCATION_TAKEN',
  'MENU_ITEM_NOT_FOUND',
  'MENU_ITEM_INVALID',
  'MENU_CYCLE',

  // Patterns — the page builder's motif/model library (fiche 43 sub-chantier A)
  'PATTERN_UNKNOWN',
  'PATTERN_INVALID',

  // Blocks
  'BLOCK_UNKNOWN',
  'BLOCK_INVALID',
  'BLOCK_DEFINITION_INVALID',
  'BLOCK_MIGRATION_FAILED',

  // Rendering — skins. A skin is refused, never repaired: contract D freezes the
  // token set precisely so that a generated skin either passes or is rejected.
  'SKIN_TOKEN_MISSING',
  'SKIN_TOKEN_UNKNOWN',
  'SKIN_TOKEN_INVALID',
  'SKIN_CONTRAST_INSUFFICIENT',
  'SKIN_SCALE_NOT_MONOTONIC',
  'SKIN_MOTION_NOT_REDUCED',

  // Themes
  'THEME_NOT_FOUND',
  'THEME_INVALID',
  'THEME_BLOCK_MISSING',
  'THEME_IMPORT_FORBIDDEN',
  'THEME_SIGNATURE_INVALID',

  // Rendering — the content API a theme reads through (ADR-0016)
  'CONTENT_API_FAILED',

  // Rendering — in-process fallback `cogenta serve` uses until a real Astro
  // build exists (no image pipeline is wired into that fallback yet)
  'THEME_IMAGE_UNSUPPORTED',

  // Rendering — build targets. A target that cannot honour a declared runtime
  // need refuses the build; it never degrades silently (ADR-0004).
  'BUILD_TARGET_UNKNOWN',
  'BUILD_RUNTIME_UNSATISFIED',

  // Access
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'PREVIEW_TOKEN_INVALID',
  'PREVIEW_TOKEN_EXPIRED',
  'QUERY_INVALID',
  'REQUEST_BODY_TOO_LARGE',

  // Auth
  'AUTH_PASSWORD_INVALID',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_TOTP_INVALID',
  'AUTH_TOTP_REQUIRED',
  'AUTH_WEBAUTHN_FAILED',
  'AUTH_SESSION_INVALID',
  'AUTH_SESSION_EXPIRED',
  'AUTH_RATE_LIMITED',
  'AUTH_MFA_REQUIRED',
  'AUTH_USER_EXISTS',
  'AUTH_USER_NOT_FOUND',
  'AUTH_ROLE_UNKNOWN',
  'AUDIT_CHAIN_BROKEN',
  // Fiche 21: a lookup by id (audit entry detail) found nothing — distinct
  // from `AUDIT_CHAIN_BROKEN`, which means "found it, and it lied".
  'AUDIT_ENTRY_NOT_FOUND',
  // Auth — self-service password reset over HTTP (L11, forgot-password route)
  'AUTH_RESET_TOKEN_INVALID',
  // Auth — recovery codes (fiche 18 task 1): the way back in when TOTP itself
  // is unusable.
  'AUTH_RECOVERY_CODE_INVALID',
  'AUTH_RECOVERY_CODES_UNAVAILABLE',

  // Auth — account lifecycle (fiche 17: invitations and anonymization)
  // The invitation reuses AUTH_RESET_TOKEN_INVALID for the token itself
  // (same primitive, same failure shape) — these four are the states around
  // it that a reset token was never asked to describe.
  'AUTH_INVITE_UNAVAILABLE',
  'AUTH_INVITE_INVALID_STATE',
  'AUTH_ACCOUNT_ANONYMIZED',
  'AUTH_ANONYMIZE_CONFIRMATION_MISMATCH',

  // API keys (L13 task 8: machine-to-machine bearer tokens)
  'API_KEY_INVALID',
  'API_KEY_REVOKED',
  'API_KEY_EXPIRED',
  'API_KEY_NOT_FOUND',
  // API keys — lifecycle and request quota (fiche 20: expiry defaults,
  // rotation, per-key rate limiting).
  'API_KEY_ROTATION_INVALID',
  'API_KEY_RATE_LIMITED',

  // Media
  'MEDIA_NOT_FOUND',
  'MEDIA_INVALID',
  'MEDIA_TYPE_REJECTED',

  // Infrastructure
  'CACHE_FAILED',
  'QUEUE_FAILED',
  'STORAGE_FAILED',
  'RATE_LIMIT_FAILED',

  // Agents — LLM provider adapters (L4)
  'PROVIDER_UNKNOWN',
  'PROVIDER_REQUEST_FAILED',
  'PROVIDER_RESPONSE_INVALID',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_TIMEOUT',

  // Agents — tool registry (L4)
  'TOOL_DEFINITION_INVALID',
  'TOOL_DUPLICATE',
  'TOOL_UNKNOWN',
  'TOOL_INPUT_INVALID',
  'TOOL_OUTPUT_INVALID',
  'TOOL_CALL_REJECTED',

  // Agents — core tools (L4)
  'HTTP_FETCH_DOMAIN_DENIED',

  // Agents — autonomy and approval (L4)
  'APPROVAL_REQUEST_UNKNOWN',

  // Agents — reversibility (L4)
  'RECEIPT_UNKNOWN',
  'RECEIPT_ALREADY_REVERTED',
  'RECEIPT_NOT_REVERTIBLE',

  // Agents — sub-agents (L4)
  'AGENT_SUBAGENT_UNKNOWN',
  'AGENT_SUBAGENT_TOOLS_NOT_SUBSET',

  // Agents — skills (L4)
  'SKILL_UNKNOWN',
  'SKILL_DEFINITION_INVALID',

  // Agents — memory (L4)
  'AGENT_APPROVAL_NOT_DECIDED',

  // MCP client (L4)
  'MCP_CLIENT_REMOTE_ERROR',
  'MCP_CLIENT_TOOL_FAILED',

  // MCP server (L20) — "cogenta mcp"
  'MCP_ACTOR_OPTIONS_CONFLICT',
  'MCP_ACTOR_USER_NOT_FOUND',
  'MCP_ACTOR_ROLE_EMPTY',
  // MCP server (L21) — "cogenta mcp --api-key"
  'MCP_ACTOR_API_KEY_INVALID',

  // MCP client sandboxing floor (fiche 58 task 1bis) — stdio-client.ts's
  // hard per-call timeout, cancellation, process lifecycle and best-effort
  // resource watchdog.
  'MCP_CLIENT_CALL_TIMEOUT',
  'MCP_CLIENT_CALL_ABORTED',
  'MCP_CLIENT_PROCESS_EXITED',
  'MCP_CLIENT_SPAWN_FAILED',
  'MCP_CLIENT_CLOSED',
  'MCP_CLIENT_RESOURCE_EXCEEDED',

  // MCP external connection registry (fiche 58 tasks 2/3) — "MCP Clients"
  // admin screen and its backing store.
  'MCP_CONNECTION_NOT_FOUND',
  'MCP_CONNECTION_INVALID',
  'MCP_CONNECTION_AUTH_INVALID',
  'MCP_CONNECTION_CONFIRMATION_REQUIRED',
  'MCP_CONNECTION_TOOL_NOT_DISCOVERED',

  // Agents — privacy (L4)
  'PRIVACY_NO_DATA_LEAVES_VIOLATION',

  // Agents — agent format and registry (L5)
  'AGENT_DEFINITION_INVALID',
  'AGENT_UNKNOWN',

  // Agents — evaluation (L5)
  'EVAL_THRESHOLD_NOT_MET',

  // Agents-builtin — security agent (L5)
  'SECURITY_OSV_QUERY_FAILED',
  'SECURITY_EPSS_QUERY_FAILED',
  'SECURITY_DEPENDENCY_NOT_FOUND',

  // Agents-builtin — performance agent (L5)
  'PERFORMANCE_CRUX_QUERY_FAILED',

  // create-cogenta — blueprints (L9)
  'BLUEPRINT_REGISTRY_CORRUPT',

  // create-cogenta — AI skin generation (L9)
  'SKIN_GENERATION_RESPONSE_NOT_JSON',

  // Import — WordPress WXR (L9)
  'IMPORT_WXR_PARSE_FAILED',
  'IMPORT_WXR_UNSAFE_DOCUMENT',

  // Import — preview/apply/undo, CSV, RSS/Atom (fiche 25)
  'IMPORT_RUN_NOT_FOUND',
  'IMPORT_SOURCE_INVALID',
  'IMPORT_ALREADY_APPLIED',
  'IMPORT_MAPPING_INVALID',
  'IMPORT_MEDIA_URL_UNSAFE',
  'IMPORT_CSV_INVALID',
  'IMPORT_FEED_INVALID',

  // create-cogenta — playground reset (L9)
  'PLAYGROUND_BLUEPRINT_UNKNOWN',

  // Channels — adapter registry (L6)
  'CHANNEL_UNKNOWN',
  'CHANNEL_DUPLICATE',

  // Channels — identity linking (L6 task 2)
  'CHANNEL_LINK_CODE_INVALID',

  // Channels — inbound command routing (L6 task 3)
  'CHANNEL_COMMAND_DUPLICATE',

  // Channels — Telegram adapter (L6 task 4)
  'CHANNEL_TELEGRAM_API_ERROR',

  // Channels — message formats (L6 task 6)
  'CHANNEL_MESSAGE_INVALID',

  // Channels — notification preferences (L6 task 7)
  'CHANNEL_PREFERENCES_INVALID',

  // Channels — email adapter (L6 task 8)
  'CHANNEL_EMAIL_TRANSPORT_ERROR',
  'CHANNEL_EMAIL_INBOUND_UNSUPPORTED',

  // Channels — Slack adapter (L6 task 9)
  'CHANNEL_SLACK_API_ERROR',

  // Channels — Discord adapter (L6 task 10)
  'CHANNEL_DISCORD_API_ERROR',

  // Channels — generic signed webhook (L6 task 11)
  'CHANNEL_WEBHOOK_SIGNATURE_INVALID',
  'CHANNEL_WEBHOOK_EXPIRED',
  'CHANNEL_WEBHOOK_REPLAY_DETECTED',
  'CHANNEL_WEBHOOK_DELIVERY_FAILED',
  'CHANNEL_WEBHOOK_INBOUND_UNSUPPORTED',

  // Plugins — manifest schema and validation (L7 task 1)
  'PLUGIN_MANIFEST_INVALID',

  // Plugins — resolution and loading (L7 task 2)
  'PLUGIN_SOURCE_NOT_FOUND',
  'PLUGIN_MANIFEST_FILE_NOT_FOUND',
  'PLUGIN_MANIFEST_LOAD_FAILED',
  'PLUGIN_MANIFEST_EXPORT_INVALID',

  // Plugins — isolated worker execution (L7 task 3)
  'PLUGIN_WORKER_TIMEOUT',
  'PLUGIN_WORKER_CRASHED',
  'PLUGIN_WORKER_RUNTIME_ERROR',

  // Plugins — capability-gated SDK (L7 task 4)
  'PLUGIN_CAPABILITY_REFUSED',

  // Plugins — resource limits, kill and disable (L7 task 6)
  'PLUGIN_DISABLED',

  // Plugins — signature and verification (L7 task 9)
  'PLUGIN_SIGNATURE_MISSING',
  'PLUGIN_SIGNATURE_INVALID',

  // Fleet — site-side telemetry emission (L8 task 2)
  'FLEET_TELEMETRY_FORBIDDEN_FIELD',

  // Fleet — rollout campaigns (L8 task 7)
  'FLEET_CAMPAIGN_NOT_FOUND',
  'FLEET_CAMPAIGN_STATE_CORRUPT',

  // Fleet — per-site rollback (L8 task 8)
  'FLEET_ROLLBACK_NO_PRIOR_VERSION',

  // Agents — document text extraction (L19 task 1)
  'DOCUMENT_FORMAT_UNSUPPORTED',
  'DOCUMENT_TOO_LARGE',
  'DOCUMENT_EXTRACTION_FAILED',
  'DOCUMENT_NO_TEXT_LAYER',

  // Agents — AI-driven site planning (L19 tasks 2, 3, 4, 5)
  'SITE_BRIEF_RESPONSE_INVALID',
  'SITE_BRIEF_GENERATION_FAILED',
  'CONTENT_MODEL_PROPOSAL_INVALID',
  'CONTENT_MODEL_PROPOSAL_PERMISSIONS_UNSAFE',
  'SITE_PLAN_CONSTRAINT_VIOLATED',
  'SITE_PLAN_DECISION_MISSING',
  'SITE_PLAN_DECISION_UNKNOWN_ITEM',
  'SITE_PLAN_DRAFT_NOT_FOUND',
  'SITE_PLAN_NO_PROVIDER',
  'SKIN_CANDIDATES_INSUFFICIENT',

  // Commerce — money and currency (L15, contract E)
  'COMMERCE_AMOUNT_INVALID',
  'COMMERCE_CURRENCY_INVALID',
  'COMMERCE_CURRENCY_MISMATCH',

  // Commerce — catalogue and stock (L15 task 2)
  'COMMERCE_PRODUCT_INVALID',
  'COMMERCE_PRODUCT_NOT_FOUND',
  'COMMERCE_VARIANT_NOT_FOUND',
  'COMMERCE_SKU_TAKEN',
  'COMMERCE_OUT_OF_STOCK',

  // Commerce — cart and totals (L15 task 3)
  'COMMERCE_CART_NOT_FOUND',
  'COMMERCE_CART_CLOSED',
  'COMMERCE_CART_EMPTY',
  'COMMERCE_QUANTITY_INVALID',

  // Commerce — orders (L15 task 4)
  'COMMERCE_ORDER_NOT_FOUND',
  'COMMERCE_ORDER_TRANSITION_INVALID',

  // Commerce — payment drivers (L15 task 5)
  'COMMERCE_PAYMENT_NOT_FOUND',
  'COMMERCE_PAYMENT_FAILED',
  'COMMERCE_PAYMENT_UNSUPPORTED',
  'COMMERCE_PAYMENT_SIGNATURE_INVALID',
  'COMMERCE_REFUND_EXCEEDS_PAYMENT',

  // Commerce — tax and shipping (L15 task 6)
  'COMMERCE_TAX_RULE_INVALID',
  'COMMERCE_SHIPPING_METHOD_UNKNOWN',
  'COMMERCE_SHIPPING_UNAVAILABLE',

  // Commerce — coupons and promotions (L15 task 7)
  'COMMERCE_COUPON_NOT_FOUND',
  'COMMERCE_COUPON_INVALID',
  'COMMERCE_COUPON_EXHAUSTED',
  // Fiche 53 task 2: a per-customer cap, distinct from the global one above,
  // and a coupon restricted to products none of which are in the basket.
  'COMMERCE_COUPON_CUSTOMER_EXHAUSTED',
  'COMMERCE_COUPON_NOT_APPLICABLE',

  // Commerce — invoices (L15 task 8)
  'COMMERCE_INVOICE_NOT_FOUND',
  'COMMERCE_INVOICE_ALREADY_ISSUED',
  'COMMERCE_INVOICE_SEQUENCE_CONFLICT',

  // Commerce — subscriptions (L15 task 9)
  'COMMERCE_SUBSCRIPTION_NOT_FOUND',
  'COMMERCE_SUBSCRIPTION_INVALID',

  // Commerce — customers, order edits, shipment tracking, credit notes
  // (fiche 52: commandes et clients)
  'COMMERCE_CUSTOMER_NOT_FOUND',
  'COMMERCE_ORDER_LOCKED',
  'COMMERCE_TRACKING_INVALID',
  'COMMERCE_CREDIT_NOTE_NOT_FOUND',

  // Agents — vector store driver (L18 task 1/5)
  'VECTOR_DIMENSION_MISMATCH',
  'VECTOR_STORE_FAILED',

  // Agents — writing/assistant tools (L18 tasks 2-8)
  'ASSIST_UNAVAILABLE',
  'ASSIST_RESPONSE_INVALID',

  // Agents — assistant usage/budget (fiche 30 task 3)
  'ASSIST_BUDGET_EXCEEDED',

  // Agents — reference document RAG index (L22 task 4)
  'ASSIST_DOCUMENT_NOT_FOUND',

  // Marketplace — catalog and one-click install (L17)
  'MARKETPLACE_ITEM_NOT_FOUND',
  'MARKETPLACE_KIND_UNSUPPORTED',
  'MARKETPLACE_ALREADY_INSTALLED',
  'MARKETPLACE_NOT_INSTALLED',
  'MARKETPLACE_UPDATE_REQUIRES_APPROVAL',

  // Marketplace — installed extensions management (fiche 29)
  'MARKETPLACE_ENGINE_INCOMPATIBLE',

  // Analytics — self-hosted, cookie-free page-view analytics (`@cogenta/analytics`)
  'ANALYTICS_SALT_UNAVAILABLE',

  // Site settings — the editorial key/value store (fiche 23, ADR-0025)
  'SITE_SETTING_UNKNOWN',
  'SITE_SETTING_INVALID',

  // Admin theme — the admin's own runtime template + personalisation (L21 task 2)
  'ADMIN_THEME_TEMPLATE_UNKNOWN',
  'ADMIN_THEME_INVALID',

  // Health, migrations and maintenance tools (fiche 24)
  'MAINT_TOOL_UNKNOWN',
  'MAINT_TOOL_RUN_NOT_FOUND',
  'MAINT_TOOL_INPUT_INVALID',

  // Export/import/backup/restore (`@cogenta/export`)
  'EXPORT_FORMAT_INVALID',
  'EXPORT_PERMISSION_DENIED',
  'EXPORT_MEDIA_NOT_FOUND',
  'EXPORT_ENTRY_TOO_LARGE',
  'BACKUP_CHECKSUM_MISMATCH',
  'BACKUP_VERSION_UNSUPPORTED',
  'BACKUP_DECRYPTION_FAILED',
  'BACKUP_PASSPHRASE_REQUIRED',
  'RESTORE_NOT_ALLOWED',
  'RESTORE_CONFLICT',

  // Scheduled tasks — the maintenance clock's admin surface (fiche 28)
  'SCHEDULER_TASK_UNKNOWN',
  'SCHEDULER_TASK_DUPLICATE',
  'SCHEDULER_QUEUE_JOB_NOT_FOUND',
  'SCHEDULER_QUEUE_JOB_NOT_RETRYABLE',

  // Appearance and theme — DB-stored skin overrides overlaying contract D's
  // file-based skin (fiche 14)
  'THEME_OVERRIDE_INVALID',
  'THEME_SKIN_NOT_FOUND',
  'THEME_NO_PROVIDER',
  'THEME_EXPORT_NOT_ALLOWED',

  // Comments — contract F, visitor comments (fiche 15, ADR-0025)
  'COMMENT_NOT_FOUND',
  'COMMENT_BODY_INVALID',
  'COMMENT_AUTHOR_INVALID',
  'COMMENT_TARGET_INVALID',
  'COMMENT_TARGET_CLOSED',
  'COMMENT_PARENT_INVALID',
  'COMMENT_PARENT_TOO_DEEP',
  'COMMENT_STATUS_INVALID',
  'COMMENT_RATE_LIMITED',
  'COMMENT_SPAM_DETECTED',

  // Forms — contract G (ADR-0026, fiche 16): definitions and submissions.
  'FORM_UNKNOWN',
  'FORM_NAME_TAKEN',
  'FORM_DEFINITION_INVALID',
  'FORM_SUBMISSION_NOT_FOUND',
  'FORM_SUBMISSION_INVALID',
  'FORM_DISABLED',
  'FORM_RATE_LIMITED',
  'FORM_HONEYPOT_TRIGGERED',
  'FORM_SUBMITTED_TOO_FAST',
  'FORM_CONSENT_REQUIRED',
  'FORM_AUTORESPONDER_RATE_LIMITED',
  // Fiche 47 — logic, steps, files, multi-channel notifications, CAPTCHA.
  'FORM_FILE_REJECTED',
  'FORM_CAPTCHA_REQUIRED',
  'FORM_CAPTCHA_FAILED',
  'FORM_STEP_INVALID',

  // A package's own `package.json` could not be read to determine its
  // version (`readOwnPackageVersion`) — a broken install, not a user mistake.
  'PACKAGE_VERSION_UNREADABLE',

  // Update system (L22 task 9): checking npm for a newer @cogenta/core /
  // @cogenta/cli, and applying one with a mandatory restore point first.
  'UPDATE_CHECK_FAILED',
  'UPDATE_RESTORE_POINT_FAILED',
  'UPDATE_APPLY_FAILED',
  'UPDATE_NOT_AVAILABLE',
  'UPDATE_CONFIRMATION_REQUIRED',
  'UPDATE_POLICY_INVALID',

  // Agents — real execution runtime, providers, skills library (L22 task
  // 1/1bis). `AGENT_SKILL_*` are deliberately distinct from the pre-existing
  // `SKILL_UNKNOWN`/`SKILL_DEFINITION_INVALID` above (L7's marketplace skill
  // registry) — a different store for a different concept, see
  // `packages/agents/src/skills/library.ts`'s module comment.
  'AGENT_DUPLICATE',
  'AGENT_DISABLED',
  'AGENT_NO_PROVIDER',
  'AGENT_BUILTIN_UNDELETABLE',
  'PROVIDER_NOT_CONFIGURED',
  'AGENT_SKILL_UNKNOWN',
  'AGENT_SKILL_DUPLICATE',
  'AGENT_SKILL_BUILTIN_UNDELETABLE',
  'AGENT_REGISTRY_READ_ONLY',
  'AGENT_RUNTIME_UNAVAILABLE',

  // Agent execution loop, migrated onto LangGraph.js (L24 task 1). Thrown
  // only if the graph's own recursion ceiling is hit before `runAgentLoop`'s
  // `max_steps` check has a chance to fire first — a bug in the graph's
  // wiring, never a normal way for a run to end.
  'AGENT_LOOP_RECURSION_LIMIT',

  // Channels — inbound chat bridge and `cogenta channels` process (L22 task 2)
  'CHANNEL_PROVIDER_NOT_CONFIGURED',

  // LLM provider catalog (fiche 56): `provider` widened from a closed
  // 3-literal union to a free string, validated at the write boundary
  // instead. A malformed identifier (empty, or not the slug shape a
  // filename can safely be built from) is distinct from a name that is
  // simply not in the built-in catalog and needs an explicit `baseUrl` to
  // be usable as a custom OpenAI-compatible endpoint.
  'PROVIDER_ID_INVALID',
  'PROVIDER_CUSTOM_BASE_URL_REQUIRED',

  // Role permission overrides in the database (fiche 63, ADR-0028): a
  // production-applicable surcharge over `cogenta.schema.*`'s `permissions`
  // block, `PermissionLayer` checked before falling back to the file.
  'ROLE_PERMISSION_TARGET_UNKNOWN',
  'ROLE_PERMISSION_INVALID',
  'ROLE_PERMISSION_EXPORT_INVALID',

  // Prompt Settings — fiche 45's shared template library every `assist.*`
  // tool's instruction text reads from, with a fallback to its own
  // hard-coded string when a site was never migrated.
  'PROMPT_TEMPLATE_UNKNOWN',
  'PROMPT_TEMPLATE_DUPLICATE',
  'PROMPT_TEMPLATE_BUILTIN_UNDELETABLE',
  'PROMPT_TEMPLATE_PLACEHOLDER_UNRESOLVED',
  // A malformed create/update body on `/api/prompt-templates` — kept
  // distinct from `PROMPT_TEMPLATE_UNKNOWN` (an id that does not exist) so
  // the two map to different HTTP statuses (400 vs 404).
  'PROMPT_TEMPLATE_INVALID',

  // Catch-all, deliberately last and deliberately rare.
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]
