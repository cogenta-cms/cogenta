import type { PhotoCredit } from './blog-credits.js'

/**
 * Where every photograph of the `store` blueprint comes from.
 *
 * Each file under `assets/photos/store/` is a real photograph taken from
 * Wikimedia Commons under CC0, the public domain or a Creative Commons
 * Attribution licence (never ShareAlike, never NonCommercial), then cropped
 * and resized. Attribution licences ask for the author, the licence and an
 * indication of changes: the seeded photo credits page renders exactly this
 * list, and `scripts/store-assets/README.md` records how the files were made.
 *
 * Every picture was looked at before it was kept: it shows the kind of object
 * its product describes, with no brand, no logo and no recognisable person.
 */

const CC0 = 'CC0 1.0'
const BY_2 = { licence: 'CC BY 2.0', licenceUrl: 'https://creativecommons.org/licenses/by/2.0/' }

export const STORE_PHOTO_CREDITS: readonly PhotoCredit[] = [
  {
    file: 'hero.jpg',
    title: 'Enamel cups on a table (Unsplash)',
    author: 'André Freitas',
    licence: CC0,
    source: 'https://commons.wikimedia.org/wiki/File:Enamel_cups_on_a_table_(Unsplash).jpg',
  },
  {
    file: 'story.jpg',
    title: 'Rustic stovetop (Unsplash)',
    author: 'Clem Onojeghuo',
    licence: CC0,
    source: 'https://commons.wikimedia.org/wiki/File:Rustic_stovetop_(Unsplash).jpg',
  },
  {
    file: 'enamel-mug.jpg',
    title: 'Enamel mug',
    author: 'knoe',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Enamel_mug.jpg',
  },
  {
    file: 'skillet.jpg',
    title: 'Cast-Iron-Pan',
    author: 'Evan-Amos',
    licence: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Cast-Iron-Pan.jpg',
  },
  {
    file: 'aleppo-soap.jpg',
    title: 'Bars of pure Marseille and Aleppo soap, 2024',
    author: 'DimiTalen',
    licence: CC0,
    source:
      'https://commons.wikimedia.org/wiki/File:Bars_of_pure_Marseille_and_Aleppo_soap,_2024.jpg',
  },
  {
    file: 'copper-pan.jpg',
    title: 'Copper kettle flickr',
    author: 'chefranden',
    ...BY_2,
    source: 'https://commons.wikimedia.org/wiki/File:Copper_kettle_flickr.jpg',
  },
  {
    file: 'stoneware-bottles.jpg',
    title: 'Large ceramic bottles (Unsplash)',
    author: 'Jessica Ruscello',
    licence: CC0,
    source: 'https://commons.wikimedia.org/wiki/File:Large_ceramic_bottles_(Unsplash).jpg',
  },
  {
    file: 'leather-wallet.jpg',
    title: 'Leather items',
    author: 'Ivan Radic',
    ...BY_2,
    source: 'https://commons.wikimedia.org/wiki/File:Leather_items.jpg',
  },
  {
    file: 'turned-bowl.jpg',
    title: 'Wooden bowl with some turquoise',
    author: 'in pastel',
    ...BY_2,
    source:
      'https://commons.wikimedia.org/wiki/File:Wooden_bowl_with_some_turquoise_(6212066788).jpg',
  },
  {
    file: 'leather-duffel.jpg',
    title: 'Leather duffel bag on the ground (Unsplash)',
    author: 'Harsh Jadav',
    licence: CC0,
    source:
      'https://commons.wikimedia.org/wiki/File:Leather_duffel_bag_on_the_ground_(Unsplash).jpg',
  },
  {
    file: 'moka-pot.jpg',
    title: 'Moka Pot',
    author: 'Ajay Suresh',
    licence: CC0,
    source: 'https://commons.wikimedia.org/wiki/File:Moka_Pot_(55013301353).jpg',
  },
  {
    file: 'crochet-throw.jpg',
    title: 'Homemade Blanket',
    author: 'Andy Mudrak',
    ...BY_2,
    source: 'https://commons.wikimedia.org/wiki/File:Homemade_Blanket_-_Flickr_-_andymudrak.jpg',
  },
  {
    file: 'knit-sweater.jpg',
    title: 'Sweater (Unsplash)',
    author: 'Victoria Bilsborough',
    licence: CC0,
    source: 'https://commons.wikimedia.org/wiki/File:Sweater_(Unsplash).jpg',
  },
  {
    file: 'leather-boots.jpg',
    title: 'Leather Boots',
    author: 'Ajay Suresh',
    ...BY_2,
    source: 'https://commons.wikimedia.org/wiki/File:Leather_Boots_(51011160965).jpg',
  },
]
