---
'@cogenta/theme-association': patch
'@cogenta/theme-blog': patch
'@cogenta/theme-canonical': patch
'@cogenta/theme-docs': patch
'@cogenta/theme-ecommerce': patch
'@cogenta/theme-entreprise': patch
'@cogenta/theme-magazine': patch
'@cogenta/theme-portfolio': patch
'@cogenta/theme-restaurant': patch
'@cogenta/theme-saas': patch
---

Give a logo that links out the organisation's name as the link's own name.

Contract B says of the `logos` block's `name` field: "It is also the accessible
name of the link." Every theme passed it to `image()` as `altFrom`, which is
only the fallback used when the media library has no alt text of its own. For a
logo that did have one — the ordinary case — the name was dropped, and the
link's accessible name became the alt text of the picture inside it: a link to
a farm announcing itself as "A pear poached dark red in Beaujolais". That is a
WCAG 2.4.4 failure, and the row of logos was unusable by anyone listening to it.

The link now carries the name. Nothing changes visually, and an unlinked logo
keeps the documented fallback behaviour.
