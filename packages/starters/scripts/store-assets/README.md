# Images of the `store` blueprint

Where the files in `src/blueprints/assets/photos/store/` come from, so they
can be checked or made again. They replace the AI-generated placeholders that
`photo-assets.ts` bundled for this slot at L25.

## Photographs

Fourteen photographs from Wikimedia Commons, each under CC0, the public
domain or a Creative Commons Attribution licence (nine CC0 or public domain,
five CC BY 2.0 or 3.0). ShareAlike and NonCommercial licences were excluded.
Author, title, licence and source page of every file are in
`src/blueprints/store-credits.ts`, which the seeded photo credits page renders
in French and in English.

The catalogue was written around the photographs, not the other way round: a
product exists in the shop only because an honest picture of that kind of
object exists. Each file was opened and looked at before it was kept. Nothing
shows a recognisable person, a brand, a logo or a watermark; the boots, the
sweater, the wallet and the bags carry no maker's mark. The Marseille soap
picture was cropped to the unbranded Aleppo bar for the same reason, and a
knitted hat was dropped because of the label sewn on its turn-up.

Processing, with `sharp` (the same dependency the workspace already has): EXIF
orientation applied, metadata stripped, cropped to 4:5 for products (1,280 ×
1,600), 3:2 for the banner (2,000 px wide) and 4:3 for the brand story
(1,600 px), saved as progressive JPEG at quality 70 to 76, each under 240 KB
(the whole folder is about 1.9 MB).

| File | Commons file | Crop |
| --- | --- | --- |
| `hero.jpg` | Enamel cups on a table (Unsplash) | whole picture, 3:2 |
| `story.jpg` | Rustic stovetop (Unsplash) | centred, 4:3, 1,600 px |
| `enamel-mug.jpg` | Enamel mug | centred |
| `skillet.jpg` | Cast-Iron-Pan | whole pan on a white ground at 4:5, multiplied into the shop paper colour (#f4f0ea) so no white box shows and the shadow stays |
| `aleppo-soap.jpg` | Bars of pure Marseille and Aleppo soap, 2024 | right-hand bar, 80% across |
| `copper-pan.jpg` | Copper kettle flickr | left side of the pan, 27% across and 36% down, 80% zoom, so the maker plate on the other side stays out |
| `stoneware-bottles.jpg` | Large ceramic bottles (Unsplash) | centred |
| `leather-wallet.jpg` | Leather items | wallet, 27% across, 95% zoom |
| `turned-bowl.jpg` | Wooden bowl with some turquoise | 42% across |
| `leather-duffel.jpg` | Leather duffel bag on the ground (Unsplash) | 42% across, 72% zoom |
| `moka-pot.jpg` | Moka Pot | centred |
| `crochet-throw.jpg` | Homemade Blanket - Flickr - andymudrak | 56% across |
| `knit-sweater.jpg` | Sweater (Unsplash) | centred |
| `leather-boots.jpg` | Leather Boots | 68% across, 55% down |

A category's picture is a product's file (`skillet`, `stoneware-bottles`,
`leather-duffel`), never one of the four on the home page's grid, so the same
file serves two slots without a second copy.

Nothing here is drawn: the blueprint has no logo, no interface mock-up and no
generated image, so there is no gradient to avoid.
