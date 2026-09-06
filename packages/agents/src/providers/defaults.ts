/**
 * Built-in fallbacks, used only when an admin has not set the matching
 * per-provider value from `/admin/providers`
 * (`ProviderConfigStore`'s `maxOutputTokens`/`requestTimeoutMs`/
 * `maxCorrectionAttempts`) — never picked over an admin's own choice, since
 * only the admin knows which model they configured and what it actually
 * needs. `8000`/`3` match the values a real, reproduced failure against a
 * reasoning-tier model (DeepSeek's `deepseek-v4-flash`) already forced this
 * codebase to converge on independently in more than one call site before
 * this file existed — kept here as the one shared floor instead of staying
 * duplicated per adapter.
 */
export const FALLBACK_MAX_OUTPUT_TOKENS = 8000
export const FALLBACK_MAX_CORRECTION_ATTEMPTS = 3
