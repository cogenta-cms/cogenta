---
'@cogenta/theme-association': patch
'@cogenta/theme-kit': patch
'create-cogenta': patch
---

Fixes from the final live review of every scaffolded blueprint (L25): the association
theme's event cards stack their cover over a date + text row and never exceed three
columns (a fourth column broke every word in two); embed placeholders name the provider
("Open on YouTube", "Open the original") instead of printing its raw id; cover art walks
its flat families by seed so consecutive covers never repeat; the magazine front page no
longer opens on the same story twice.
