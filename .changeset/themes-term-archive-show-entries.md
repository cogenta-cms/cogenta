---
"@cogenta/theme-canonical": patch
"@cogenta/theme-association": patch
"@cogenta/theme-blog": patch
"@cogenta/theme-docs": patch
"@cogenta/theme-ecommerce": patch
"@cogenta/theme-entreprise": patch
"@cogenta/theme-magazine": patch
"@cogenta/theme-portfolio": patch
"@cogenta/theme-restaurant": patch
"@cogenta/theme-saas": patch
---

A term archive page honours `TermArchiveInput.showEntries` (contract D `theme@1.11`): when the site owner chose a page that shows only the sub-terms, the theme draws neither the entry list, nor the "nothing is filed here" message, nor the pager. A host that does not set the field gets the page it always got.
