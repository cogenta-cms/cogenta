---
"@cogenta/schema": minor
---

Fiche 59 (canaux : guides pas-à-pas) — `SITE_SETTINGS_REGISTRY` gains a new `channels`
group with three free-text, non-secret entries (`channels.telegramBotName`,
`channels.slackBotName`, `channels.discordBotName`), each admin-writable and site-scoped.
This is what lets the admin's "Canaux" screen name a linked bot in its new step-by-step
"How does this work?" guide instead of a generic placeholder — the bot's real credential
(the token) is still environment-only (R7) and has no row anywhere in this registry or its
backing table.

Additive only: a new registry entry with an existing `uiType` (`string`) needs no change
to `SiteSettingsStore`, the REST router, or the generic settings-field renderer — the same
"add a setting = one declaration" property `SITE_SETTINGS_REGISTRY` has held since fiche 23.
