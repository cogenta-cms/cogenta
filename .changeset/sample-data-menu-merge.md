---
"@cogenta/cli": patch
"@cogenta/api": patch
---

Importing sample data while keeping the site now adds the sample's missing links after the site's own in a header or footer menu that already exists, instead of leaving the imported sections unreachable. Nothing of the site's menu is removed or reordered; a header button stays as it is. The preview reports it as a `merge` outcome with a `menu-merged` warning.
