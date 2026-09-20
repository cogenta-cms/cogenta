---
'@cogenta/theme-kit': patch
---

Stop rendering a list item that has nothing in it.

Pressing Enter twice at the end of a bullet list used to leave an empty item
behind — the editor had no way out of a list but the toolbar's "Paragraph"
button — and it was saved as it stood, `listItem: "bullet"` with `text: ""`,
then drawn on the public page as an empty `<li></li>`. A screen reader
announces that as a list item with no content, and it shifts every visible
bullet down by one.

The editor no longer creates them (`@cogenta/admin`, same release). This is
what happens to the ones already stored, on pages nobody will reopen: the
item is not drawn. The stored document keeps it — this decides what is worth
drawing, it does not delete what somebody wrote.

The list itself still renders as long as one item says something.
