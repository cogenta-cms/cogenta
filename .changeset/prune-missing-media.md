---
'@cogenta/api': minor
'@cogenta/cli': patch
---

Serve a page whose media was deleted, instead of answering HTTP 500.

Deleting an asset that a published page still pointed at made that page
unservable for everyone: `renderPage` draws every block of a page in one call,
and contract D's `RenderContext.image(media): ImageSource` has no "absent"
state to return, so the theme could only throw and one dead reference took the
whole document with it.

Neither the contract nor the ten installed themes can gain that state without a
major bump, so the dead reference is now removed from the data before rendering
starts. `@cogenta/api` gains `pruneMissingMedia(entries, source, available)`: a
pure function that walks entries exactly as `collectDependencies` does —
declared `media` fields, expanded relations, the media inside a known block's
list items, plus rich text's own `media` nodes — and returns copies with every
reference outside `available` gone. A collection field simply forgets its
picture; a list item that was only there to show one leaves the list, so a
gallery that lost one photograph keeps the others; and a block whose *required*
media field is left empty (a `mediaFigure`, a gallery with nothing in it) is
dropped rather than rendered as a hole. A block type the registry does not know
contributes nothing and is never dropped, the same answer `collectDependencies`
gives it. Nothing is mutated in place.

`cogenta serve` calls it in `renderEntryPage` once it knows which assets
actually loaded, so a dead identifier can no longer reach `ctx.image()` — whose
`throw` deliberately stays, and now means a real defect. A render that had to
drop something is logged (`ThemeRenderOptions.onMissingMedia`): the visitor
gets a 200, so that line is the only trace an operator has that a page is being
served incomplete.
