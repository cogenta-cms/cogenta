---
'@cogenta/api': minor
---

Open the image editor on the crop that is currently applied.

Reopening the editor on an already-cropped image showed the untouched
original with a default frame, so the applied crop looked undone — and
applying anything else silently replaced it rather than building on it.

The editor showing the original is correct and deliberate: editing is
non-destructive, every edit re-derived from the stored original rather than
stacked on the last result, which is what stops quality compounding away with
each pass. What was missing is that the editor had no way to learn what is
currently applied. The parameters were written to storage on every edit and
read only inside the media router.

`GET /api/media/{id}` now returns `lastEdit` beside `edited`, on the
single-asset read where `edited` already lives, and the admin's image editor
opens on those values. An image nobody has edited is unchanged: no
`lastEdit`, default frame.

(`@cogenta/admin` is private and never published, so it carries no changeset
of its own — the admin-side half of this change ships with the site build.)
