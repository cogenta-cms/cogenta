---
'@cogenta/cli': patch
---

Stop serving Cogenta's logo as a client site's favicon.

A freshly installed site answered `<link rel="icon" href="/_cogenta/logo-cogenta.png">`:
the CMS's mark in the browser tab of somebody else's site. Uploading a logo
changed nothing, because the favicon was chosen by `branding.showCogentaBranding`
— a setting whose name, description and every other effect concern the
**credit in the footer**. Turning that off was the only way to make an
uploaded logo appear in the tab, and nothing documented the link.

The site's own logo is used whenever there is one, whatever the footer credit
says. With none, no `<link rel="icon">` is emitted at all, which is what every
site without a favicon does. The footer credit itself is untouched.
