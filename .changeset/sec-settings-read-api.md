---
"@cogenta/api": patch
---

`GET /api/settings` returns, to a signed-in caller, the public settings, the few that shape the admin for every role, and the settings whose `writeRoles` the caller holds, instead of the whole registry. `updatedBy` (the internal id of the last editor) is only shown to those who may write the setting.
