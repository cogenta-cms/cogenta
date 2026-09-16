# Images of the `vitrine` blueprint

Where the files in `src/blueprints/assets/photos/vitrine/` come from, so they
can be checked or made again.

## Photographs

Twenty-two photographs from Wikimedia Commons, each under CC0, the public
domain or a Creative Commons Attribution licence. ShareAlike and NonCommercial
licences were excluded. Author, title, licence and source page of every file
are in `src/blueprints/vitrine-credits.ts`, which the seeded photo credits page
renders.

Chosen by looking at them, not by keyword: nothing that shows a recognisable
person presented as a character of the site (testimonials and leadership carry
no portrait), no brand in view, no watermark.

Processing: EXIF orientation applied, metadata stripped, resized to 2,000 px
wide (hero, sectors, case studies) or 1,600 px (everything else), saved as
progressive JPEG at quality 62 to 78, each under about 420 KB.

## Drawn for the blueprint

- `logo-*.png`: `logos.html`, rendered with Playwright, transparent background,
  520 × 160. Fictional companies. Typefaces: Inter Tight, Fraunces, IBM Plex
  Sans Condensed, Manrope and Space Grotesk (SIL Open Font License).
- `vigie-overview-{fr,en}.png` and `vigie-detail-{fr,en}.png`: `vigie.html`
  (`?lang=fr|en&view=overview|detail`), 1,600 × 1,000 and 1,600 × 800 at a
  device scale factor of 1.5. The data is invented. Typefaces: Inter Tight and
  JetBrains Mono (SIL Open Font License).

Neither file uses a gradient, following the design rule every theme of this
project keeps.
