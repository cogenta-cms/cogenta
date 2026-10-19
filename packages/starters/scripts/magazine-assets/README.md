# Images of the `magazine` blueprint

Where the files in `src/blueprints/assets/photos/magazine/` come from, so they
can be checked or replaced.

## Photographs

Twelve photographs, replacing the AI-generated placeholders `photo-assets.ts`
bundled for these slots at L25 (convincing at a glance, but depicting nothing
real). Every one was taken from Wikimedia Commons under CC0, the public domain
or a Creative Commons Attribution licence (CC BY 2.0, 3.0 or 4.0) — never
ShareAlike, never NonCommercial. The licence of each file was read from its
Commons page through the API (`LicenseShortName`, `Artist`). Author, title,
licence and source page of every file are in `src/blueprints/magazine-credits.ts`,
which the seeded "Photo credits" page renders in the site's language, and from
which every article's lead credit line (`Photo : Mikani (CC BY 4.0)`) is
built — the credit under a picture is the real photographer's, never an
invented one.

The magazine's city is fictional (Port Calder in English, Belmarais in
French), so a photograph shows a place of the same kind — a town hall, a
reading room, a tram stop, a bakery counter — and the captions describe only
what the picture shows. Chosen by looking at each one at full size: no
recognisable person, no readable private text, no visible brand, no watermark.
(The town hall carries its public "Hôtel de ville" lettering; that is the one
legible inscription kept.)

| File | Used for | Crop |
|---|---|---|
| `town-hall.jpg` | The council vote (front-page lead) | Bottom tenth removed (a parked car) |
| `gallery.jpg` | The Kell Gallery review | None |
| `theatre.jpg` | Three small theaters | Bottom fifth removed (the heads of the audience) |
| `archive-stacks.jpg` | The projectionist's papers | None |
| `allotments.jpg` | The community garden's lease | Top 30 % removed (visitors in the distance) |
| `reception-hall.jpg` | Banquet halls and caterers | None |
| `tram-stop.jpg` | The commute column | Left 40 % removed (a bus shelter carrying an advertisement), top and bottom trimmed |
| `empty-tram-stop.jpg` | Morning peak, empty midday | None |
| `reading-room.jpg` | The library branches | None |
| `baguettes.jpg` | The Vine Street bakery | Cropped to the loaves (a price label and its lettering removed) |
| `dining-room.jpg` | The restaurant review | None |
| `office-block-dusk.jpg` | Office towers turned into flats | None |

Processing: EXIF orientation applied, metadata stripped, cropped as above,
resized to at most 1600 px wide, saved as progressive JPEG (mozjpeg, quality
74). The whole folder weighs about 2.7 MB and no file passes 420 KB; a test
(`test/magazine-blueprint.test.ts`) keeps both true, and keeps the credits in
step with the files.

## Not photographs

Nothing: the blueprint draws no logo and no interface mock-up. `spec` on each
`DemoMediaSpec` is the flat procedural fallback `seedDemoMedia` would render if
a file were ever missing; with every file present it is never used.
