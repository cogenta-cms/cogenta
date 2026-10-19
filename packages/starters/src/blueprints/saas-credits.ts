import type { PhotoCredit } from './blog-credits.js'
import type { SaasLocale } from './saas-copy.js'

/**
 * Where every photograph of the `saas` blueprint comes from.
 *
 * Each photograph under `assets/photos/saas/` was taken from Wikimedia Commons
 * under CC0 or a Creative Commons Attribution licence (never ShareAlike, never
 * NonCommercial), then cropped and resized; `scripts/saas-assets/photos.mjs`
 * records the crops. The seeded "Photo credits" page renders the entries of the
 * site's language: the English site shows London and Toronto, the French site
 * Paris and Montreal, and both show the data centre.
 *
 * The interface screenshots and the customer wordmarks are not in this list:
 * they were drawn for this blueprint (HTML and CSS, OFL typefaces, invented
 * data) and belong to it.
 */

export interface SaasPhotoCredit extends PhotoCredit {
  /** The site languages whose pages show this photograph. */
  readonly locales: readonly SaasLocale[]
}

export const SAAS_PHOTO_CREDITS: readonly SaasPhotoCredit[] = [
  {
    file: 'security-racks.jpg',
    title: 'Datacenter Server Racks',
    author: 'Carl Lender',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Datacenter_Server_Racks_(22370909788).jpg',
    locales: ['en', 'fr'],
  },
  {
    file: 'office-london.jpg',
    title: 'City of London skyline from Dawson Heights, Dulwich (1)',
    author: 'FHL2',
    licence: 'CC0 1.0',
    source:
      'https://commons.wikimedia.org/wiki/File:City_of_London_skyline_from_Dawson_Heights,_Dulwich_(1).jpg',
    locales: ['en'],
  },
  {
    file: 'office-toronto.jpg',
    title: 'Toronto Skyline viewed from Centre Island',
    author: 'TheWxResearcher',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Toronto_Skyline_viewed_from_Centre_Island.jpg',
    locales: ['en'],
  },
  {
    file: 'office-paris.jpg',
    title: 'Paris Paris Skyline',
    author: 'Ali Sabbagh',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Paris_Paris_Skyline_(37328639624).jpg',
    locales: ['fr'],
  },
  {
    file: 'office-montreal.jpg',
    title: 'Skyline of Montreal, view from Mont Royal',
    author: 'www.Pixel.la Free Stock Photos',
    licence: 'CC0 1.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Skyline_of_Montreal,_view_from_Mont_Royal_(24244189891).jpg',
    locales: ['fr'],
  },
]
