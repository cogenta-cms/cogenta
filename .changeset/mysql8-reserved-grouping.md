---
"@cogenta/channels": patch
"create-cogenta": patch
---

A site on MySQL 8 starts again. The channel-preferences table had a column named `grouping`, a reserved word in MySQL 8, so `cogenta serve` refused to start on it; the column is now quoted. The installer's closing summary no longer calls skin generation and agents unavailable: it says where to turn them on in the admin.
