# Images of the `portfolio` blueprint

Where the files in `src/blueprints/assets/photos/portfolio/` come from, so they
can be checked or replaced.

## Photographs

Twenty-eight photographs, replacing the drawn design work (posters, covers,
signs, interface sheets) this blueprint carried when it was a design studio.
The blueprint is now an independent photography studio, so its work is
photographs. They come from Wikimedia Commons, each under CC0, the public
domain, or a Creative Commons Attribution licence (CC BY 4.0 for twenty-five of
them, the public domain for two, CC0 for one) — never ShareAlike, never
NonCommercial. The licence of every file was read from its
Commons page through the API
(`action=query&prop=imageinfo&iiprop=extmetadata`, field `LicenseShortName`).
Author, title, licence and source page of every file are in
`src/blueprints/portfolio-credits.ts`, which the seeded "Photo credits" page
renders (in French and in English), and which the footer menu links.

The studio, its clients and its people are fictional. The photographs are
unrelated real work by the credited authors, used as the studio's work: the
credits page says so.

Chosen by looking at each one: seven projects of four photographs, each project
one place and one subject (a lagoon, a vineyard, a fishing harbour, a snowed-in
forest, a glacier, a cliff path, a valley of stone towers). No recognisable
person, no visible brand or logo, no watermark, no readable private text. The
first candidates were dropped for that reason: a cargo ship with its owner's
logo on the funnel, a vineyard aerial that is clearly another country's, a
salt-pan worker, and every famous building found while searching architecture.

Searched with the Commons API (`generator=search`, `haswbstatement:P6731=Q63348069`
for featured pictures, then by licence category), thumbnails reviewed on contact
sheets, finalists opened at 900 px.

## Processing

Downloaded from `upload.wikimedia.org` with an identifying user agent, then with
`sharp`: EXIF orientation applied, all metadata stripped, progressive
mozjpeg, quality 64-68.

- Covers (`*-cover.jpg`): cut to 3:2 and resized to 1800 x 1200, because the
  work grid shows them at 3:2 and 2:1.
- Every other photograph keeps the shape of the original, at most 1600 px wide.

Each file is under 400 KB and the folder is 5.3 MB.

| File | Cut |
|---|---|
| `lagoon-cover.jpg` | Left-aligned 3:2 from a 1.87:1 frame (the building is on the left) |
| `vines-cover.jpg` | 3:2 around the point of interest from a 16:9 frame |
| `port-cover.jpg`, `forest-cover.jpg`, `glacier-cover.jpg`, `coast-cover.jpg`, `towers-cover.jpg` | Centred 3:2 |
| All others | None, only resized |
