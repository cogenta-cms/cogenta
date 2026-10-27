---
'@cogenta/cli': patch
---

`cogenta serve` serves `/.well-known/security.txt` (RFC 9116) as `text/plain` from the site's own `public/.well-known/security.txt`, or `security.txt` at the project root. A site without the file answers 404: Cogenta's own contact is never served on its behalf.
