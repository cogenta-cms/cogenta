# Images of the `saas` blueprint

Where the files in `src/blueprints/assets/photos/saas/` come from, so they can
be checked or made again.

## Photographs

Five photographs from Wikimedia Commons, each under CC0 or a Creative Commons
Attribution licence. ShareAlike and NonCommercial licences were excluded.
Author, title, licence and source page of every file are in
`src/blueprints/saas-credits.ts`, which the seeded photo credits page renders
(in each language, the photographs that site shows).

| File | Shown on | Subject |
|---|---|---|
| `security-racks.jpg` | both sites, security page | A data-centre room with network racks |
| `office-london.jpg`, `office-toronto.jpg` | English site, company page | The two cities of the English company's offices |
| `office-paris.jpg`, `office-montreal.jpg` | French site, company page | The two cities of the French company's offices |

Chosen by looking at them, not by keyword: nothing that shows a recognisable
person, a brand or a watermark. The product has no photograph of a person at
all: the customer quoted on the home page is fictional and carries no portrait.

`photos.mjs` records the processing: EXIF orientation applied, metadata
stripped, cropped as its table says (a city view without the incidental
sky or the foreground clutter), resized to 1,600 px wide, saved as a
progressive JPEG at quality 72 to 74, each under about 270 KB. The originals
are the files named by the `source` of each credit, downloaded from
upload.wikimedia.org.

## Drawn for the blueprint

- `<name>-{en,fr}.png`: `screens.html` (`?lang=en|fr&view=app|policy|audit|erp|sso|spend|api`),
  rendered by `render.mjs`. The approvals queue is 1,200 × 760 at a device
  scale factor of 2 (2,400 × 1,520), the six other screens 1,600 × 1,000. The
  data is invented, and each language has its own company, people, amounts
  (dollars and pounds, or euros), ERP (NetSuite or Sage X3) and dates.
  Typefaces: Geist and Geist Mono (SIL Open Font License).
- `logo-*.png`: the six customers' wordmarks, 174 px high and cropped to their
  text. The English ones (`halvorsen-freight`, `brightwell-clinics`,
  `castlemere-foods`, `tessaly-energy`, `northgate-homes`) were drawn first;
  the French ones (`marenne-logistique`, `cliniques-du-vivier`,
  `castellan-alimentaire`, `tessaly-energies`, `nordgate-habitat`) come from
  `logos.html` through `render.mjs`; `orrin-and-vale` serves both. Fictional
  companies. Typefaces: Inter Tight, Fraunces, Manrope, Space Grotesk and
  IBM Plex Sans Condensed (SIL Open Font License).

None of these files uses a gradient, following the design rule every theme of
this project keeps.
