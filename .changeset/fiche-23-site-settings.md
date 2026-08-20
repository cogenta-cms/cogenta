---
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/core': minor
'@cogenta/cli': minor
'create-cogenta': patch
---

Add the editorial site settings screen (fiche 23, ADR-0025's third settings
category between `cogenta.config.mjs` — infrastructure, read-only — and
`localStorage` — personal preference).

- `@cogenta/schema` gains a typed key/value site-settings store
  (`createSiteSettingsStore`) backed by a closed registry: general (title,
  tagline, admin email, time zone, date/time style), reading (home path,
  posts per page), media (max upload size), and privacy (policy path, cookie
  banner). Every setting has a declared scope (site or per-locale), a default,
  and a required permission; writing an undeclared key is refused.
- `@cogenta/api` gains `createSitePlanRouter`'s sibling `GET|PATCH
  /api/settings` and extends `GET /api/config-status` with `storage`,
  `llm`/`embeddings`/`imageGeneration`/`vector`, and `billingConfigured` —
  never a secret, never a credential.
- `@cogenta/cli` wires the new store into `cogenta serve`/`dev`, and
  `theme-render.ts` now serves the configured home path instead of always
  falling back to the hardcoded `/home`.
- `@cogenta/core` adds `SITE_SETTING_UNKNOWN`/`SITE_SETTING_INVALID` and a
  `secret-hygiene` module the settings screen uses to detect a
  `database.url` with embedded credentials, or a `.env` file readable by
  other users on shared hosting.
- `create-cogenta` now writes the generated `.env` (which holds
  `COGENTA_AUTH_SIGNING_KEY`) with mode `0o600` instead of the default —
  closing the shared-hosting exposure `docs/hebergement-mutualise.md`
  already named as a known gap.

The admin's old single-control "Paramètres" screen (the signed-in account's
own interface language) moves to "My profile"; `/settings` is now the
site-wide editorial screen.
