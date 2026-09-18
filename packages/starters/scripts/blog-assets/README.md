# Images of the `blog` blueprint

Where the files in `src/blueprints/assets/photos/blog/` come from, so they can
be checked or replaced.

## Photographs

Seven photographs, replacing the AI-generated placeholders `photo-assets.ts`
bundled for this slot at L25 (convincing at a glance, but depicting nothing
real). Sourced from Wikimedia Commons and Flickr, each under CC0, the public
domain, or a Creative Commons Attribution licence — never ShareAlike, never
NonCommercial. Author, title, licence and source page of every file are in
`src/blueprints/blog-credits.ts`, which the seeded "Photo credits" page
renders — the same discipline `@cogenta/theme-entreprise`'s `vitrine`
blueprint keeps for its own twenty-two photographs (`vitrine-credits.ts`).

One per essay: every full essay has its own photograph (none reused), and a
"Letter" stays text-only by design — a personal letter is not a produced
piece the way an essay is, and the front of the site should never carry the
same photograph in three places at once.

Chosen by looking at them, not by keyword: nothing that shows a recognisable
brand, a real person's private writing in enough detail to read, or a name
plausibly belonging to someone still alive.

Processing: EXIF orientation applied, metadata stripped, cropped where the
frame held incidental text or a device logo, resized to at most 1600 px
wide, saved as progressive JPEG (quality 76-80).

| File | Crop |
|---|---|
| `notebook-and-coffee.jpg` | Bottom third removed (a small stationery brand mark) |
| `desk-setup.jpg` | Right side removed (a second, branded computer) |
| `platform.jpg`, `notebooks.jpg`, `pour-over.jpg`, `typing.jpg`, `library.jpg` | None |
