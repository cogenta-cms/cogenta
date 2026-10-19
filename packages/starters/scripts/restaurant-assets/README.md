# Images of the `restaurant` blueprint

Where the files in `src/blueprints/assets/photos/restaurant/` come from, so
they can be checked or made again.

## Photographs

Thirteen photographs from Wikimedia Commons, replacing the AI-generated
placeholders `photo-assets.ts` bundled for this blueprint at L25 (convincing at
a glance, but showing no real plate). Each is under CC0, the public domain or a
Creative Commons Attribution licence (CC BY 2.0, 3.0 or 4.0). ShareAlike and
NonCommercial licences were excluded, and the licence of each file was read
from the Commons API (`LicenseShortName`) before it was kept. Author, title,
licence and source page of every file are in
`src/blueprints/restaurant-credits.ts`, which the seeded photo credits page
renders, in French and in English.

| File | What it shows | Licence |
|---|---|---|
| `hero.jpg` | The dining room of a French hostellerie, green panelled bookcases and tables laid for dinner | CC BY 2.0 |
| `beetroot-carpaccio.jpg` | Sliced beetroot and grilled goat's cheese | CC0 |
| `pumpkin-soup.jpg` | Pumpkin and chestnut soup under grated cheese | CC BY 2.0 |
| `grilled-octopus.jpg` | Grilled octopus on a saffron sauce | CC BY 2.0 |
| `cod-vin-jaune.jpg` | Cod in a vin jaune sauce with crisp Comté | CC0 |
| `duck-confit.jpg` | Duck leg confit, Brussels sprouts, celeriac purée | CC BY 4.0 |
| `mushroom-risotto.jpg` | Wild mushroom risotto | CC BY 2.0 |
| `pike-quenelle.jpg` | Quenelle de brochet in crayfish sauce, a Lyon classic | public domain |
| `chocolate-tart.jpg` | Dark chocolate tarts with sea salt | CC BY 2.0 |
| `poached-pear.jpg` | Pear poached in blackcurrant syrup | CC BY 3.0 |
| `praline-cake.jpg` | Apple and pink praline cake from a Lyon bakery | CC0 |
| `street-burdeau.jpg` | Rue Burdeau, Lyon 1er, where the fictional restaurant stands | CC0 |
| `market-stall.jpg` | A stall of the Croix-Rousse market | CC0 |

Chosen by looking at each file, not by keyword: it shows the dish it is filed
under, with no recognisable person presented as a character of the site (the
restaurant's team, its press and its guests carry no portrait), no brand, no
watermark and no readable private text.

## Processing

`sharp`: EXIF orientation applied, metadata stripped, cropped, resized, saved
as progressive JPEG (mozjpeg, quality 74). Every dish photograph is cropped to
the 4:5 portrait the theme shows it in, 1,200 px wide; the room is 3:2 at
2,000 px, the street and the market 3:2 at 1,600 px. The whole folder weighs
about 2.2 MB, no file more than 300 KB.

| File | Crop and edits |
|---|---|
| `hero.jpg` | None beyond the resize |
| `beetroot-carpaccio.jpg` | Centred on the plate, a table napkin at the right edge cut off |
| `grilled-octopus.jpg` | Tight on the plate, the glasses and sauce pots around it mostly cut |
| `pike-quenelle.jpg` | Tight on the dish, the dining room behind it cut, brightness and saturation raised by 12 per cent (a dim phone photograph) |
| `praline-cake.jpg` | Tight on the slice, the glasses behind it cut |
| `street-burdeau.jpg` | 3:2 crop of the 4:3 original. The number plate and the badge of the van in the foreground are blurred, since a number plate is a private text |
| the others | Centred 4:5 crop, a little tighter than the frame where the plate was small |

## Credits

The credits page lists the photographs under their Commons titles, which are
in the language of their authors. A site that keeps these photographs keeps
the page and its link in the footer: the attribution licences require it.
