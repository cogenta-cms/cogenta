# Images of the `association` blueprint

Where the files in `src/blueprints/assets/photos/association/` come from, so
they can be checked or made again.

## Photographs

Nine photographs from Wikimedia Commons, each under CC0, the public domain or a
Creative Commons Attribution licence. ShareAlike and NonCommercial licences were
excluded, and so were the AI-generated uploads that fill some Commons search
results (their titles are full descriptive sentences and their author uploads in
bulk). Author, title, licence and source page of every file are in
`src/blueprints/association-credits.ts`, which the seeded photo credits page
renders in French and in English.

| File | Used for | Licence |
| --- | --- | --- |
| `hero.jpg` | home page hero: a shared garden behind a building | CC0 |
| `garden-corner.jpg` | the about page gallery | CC0 |
| `garden-planting.jpg` | the community garden programme and the planting morning | public domain |
| `food-bank.jpg` | the food distribution programme and the collection | CC0 |
| `homework-club.jpg` | the homework club programme | CC0 |
| `coat-bank.jpg` | the clothing bank programme and the coat collection | CC0 |
| `orientation.jpg` | the volunteer orientation evening and the volunteer page | CC0 |
| `supper.jpg` | the community supper | CC BY 2.0 |
| `hall.jpg` | the about page, the old library | CC0 |

Chosen by looking at them, not by keyword. The charity is a fiction: nothing
shows a recognisable person presented as a volunteer, a beneficiary or a team
member, so the photographs are places, objects, gardens and crates, and the
testimonial has no portrait. No brand is in view and no watermark. The same
files serve the French and the English site, so none carries a flag or a
readable sentence in either language.

Processing (`sharp`): EXIF orientation applied, metadata stripped, cropped to
16:9 (hero) or 3:2, resized to 2,000 px wide (hero) or 1,600 px (everything
else), saved as progressive JPEG (mozjpeg) at quality 70 to 74, each under about
420 KB; the whole folder is about 2 MB. Crops: `hero.jpg` keeps the top 80 % of
the original; `coat-bank.jpg` keeps the upper 64 % of a portrait original so the
hanging garments fill a landscape frame; `supper.jpg` trims 6 % off the left
edge so the frame of a library sign does not show.

## Drawn for the blueprint

- `partner-*.png` (English) and `partner-fr-*.png` (French): wordmarks of the
  fictional partner organisations, one line of text each, dark ink on a
  transparent background, 160 px high. They were set in a browser from OFL
  typefaces (Fraunces, Cormorant Garamond, EB Garamond, Inter Tight, Manrope,
  Space Grotesk) and exported with `omitBackground`. The names are invented
  (Collège Les Tilleuls, Mairie d’Aubrières, Delcourt & Fils, Habitat Aubrières,
  Fondation du Tilleul, Pharmacie de la Place) and belong to no real
  organisation.

None of these files uses a gradient, following the design rule every theme of
this project keeps.
