/**
 * Where every photograph of the `blog` blueprint comes from.
 *
 * Each file under `assets/photos/blog/` is a real photograph, taken from
 * Wikimedia Commons or Flickr under CC0, the public domain or a Creative
 * Commons Attribution licence (never ShareAlike, never NonCommercial), then
 * cropped and resized — replacing the AI-generated placeholders `photo-assets.ts`
 * bundled for this slot at L25, which looked convincingly photographic but
 * depicted nothing real. Attribution licences ask for the author, the licence
 * and an indication of changes: the seeded "Photo credits" page renders
 * exactly this list, the same way `@cogenta/theme-entreprise`'s `vitrine`
 * blueprint already does for its own twenty-two photographs (`vitrine-credits.ts`).
 *
 * Chosen by looking at them, not by keyword: nothing that shows a
 * recognisable brand or a real person presented as a character of this
 * fictional site.
 */

export interface PhotoCredit {
  readonly file: string
  readonly title: string
  readonly author: string
  readonly licence: string
  /** Absent for the public domain or CC0, which have no licence to link to. */
  readonly licenceUrl?: string
  readonly source: string
}

export const BLOG_PHOTO_CREDITS: readonly PhotoCredit[] = [
  {
    file: 'notebook-and-coffee.jpg',
    title: 'Coffee, notebooks and pen (Unsplash)',
    author: 'Freddy Castro',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Coffee,_notebooks_and_pen_(Unsplash).jpg',
  },
  {
    file: 'desk-setup.jpg',
    title: 'Laptop on a neat desk (Unsplash)',
    author: 'Norbert Levajsics',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Laptop_on_a_neat_desk_(Unsplash).jpg',
  },
  {
    file: 'notebooks.jpg',
    title: 'journals',
    author: 'gbSk',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://www.flickr.com/photos/72236921@N00/4980420685',
  },
  {
    file: 'platform.jpg',
    title: 'Metro Mornings',
    author: 'John Brighenti',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://www.flickr.com/photos/94359914@N06/49209891048',
  },
  {
    file: 'pour-over.jpg',
    title: 'Pour Over Coffee Brewing with a Chemex',
    author: 'markolaz',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://www.flickr.com/photos/195403219@N08/52135390054',
  },
]
