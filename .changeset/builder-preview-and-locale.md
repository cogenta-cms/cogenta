---
'@cogenta/cli': patch
---

The page builder preview survives a block just placed

A content list with no collection chosen yet answered 400 and an embed with no
address 500, so the preview broke the moment either block was added. The draft
render now leaves out the blocks contract B refuses and shows the rest of the
page; a save still refuses them.

Content created through the API without a locale now takes the site's default
language: `cogenta serve` built its content stores without it, so a French
site's agents and headless clients created English entries.
