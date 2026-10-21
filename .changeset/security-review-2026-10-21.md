---
"@cogenta/core": minor
"@cogenta/blocks": minor
"@cogenta/theme-kit": minor
"@cogenta/plugins": minor
"@cogenta/agents": minor
"@cogenta/api": minor
"@cogenta/auth": minor
"@cogenta/schema": patch
"@cogenta/cli": minor
"@cogenta/channels": patch
"@cogenta/import": patch
"@cogenta/comments": patch
"@cogenta/forms": patch
"@cogenta/render": patch
"@cogenta/seo": patch
"@cogenta/commerce": patch
"@cogenta/starters": patch
"@cogenta/agents-builtin": patch
"@cogenta/theme-association": patch
"@cogenta/theme-docs": patch
---

Security review of 2026-10-21 — every finding fixed, each with a test that failed before the fix.

- **Theme sandbox ran untrusted code in the server** (critical). Validating a sandbox write imported the file into the `cogenta serve` process, so a theme ZIP or a file written by the theme agent ran with the server's environment and database. Sandbox modules are now imported, previewed and checked only in a child process under Node's permission model (`--permission`, the sandbox and installed packages readable, empty environment): `@cogenta/plugins` gains `runIsolatedModule({ readPaths })`, `inspectIsolatedModule` and `moduleReadPaths`. A deploy also refuses sources using `process`, `globalThis`, dynamic `import()` and similar, and the admin says plainly that a deployed theme runs with the site's rights.
- **Plugin sandbox escape**: a refused SDK call rejected with an error of the host realm, whose `constructor` reached the real `process` (and with it unrestricted `fetch`). Errors now cross as strings.
- **Stored XSS through `javascript:` links**: contract B accepted `javascript:`, `vbscript:` and `data:` in call-to-action targets, rich-text links, `url`-format fields and logo links. They are refused on write (`isScriptUrl`, `@cogenta/blocks`) and neutralised on output for every theme and plugin tree (`safeUrlAttribute` in `@cogenta/theme-kit`'s `serialize`). The admin's theme previews are iframes with scripting disabled (`sandbox`).
- **Sign-in brute force**: the attempt is now reserved before the password is checked (`RateLimiter.reserve`), closing a race that allowed ~1,000 guesses per window; failures are counted per account and address, the account alone only at ten times the threshold (no lockout of an owner by a stranger); an unknown address costs the same password check; the reset mail is sent without making the answer wait. Changing one's password signs out every other session.
- **Open redirects**: `/_cogenta/unlock`'s `next`, prefix redirect rules (`/blog/*` → `/` asked for `/blog//evil.example`) and redirect rows (also written by the Site Monitor agent) can no longer point off-site.
- **Denial of service**: about 70 regular expressions that backtracked quadratically (a URL of 16,000 slashes held the event loop for a second; a hostile e-mail in a public form or comment, longer) are rewritten in linear form; anonymous request bodies are capped at 1 MiB (a public form's file upload keeps its own ceiling); a PDF's total decompression is bounded; a password-protected page also has a per-page attempt ceiling.
- **AI**: tool results reach the model as escaped DATA blocks (R8); a delegated agent never gets more autonomy than its delegator (`stricterAutonomy`); private and password-protected entries are no longer indexed for the assistant's chat; moving a provider's endpoint requires its API key again (`PROVIDER_KEY_REQUIRED`, a new error code), so a stolen session cannot send the saved key elsewhere; changes to agents, providers, skills, prompts and MCP connections are recorded in the audit log; a disabled account loses its rights on linked chat channels at once; linking and approval codes are drawn without modulo bias.
- **Import**: a WordPress media download checks every redirect hop as a public address and stores the file under the type its bytes deserve.
