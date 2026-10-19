import type { PhotoCredit } from './blog-credits.js'

/**
 * Where every photograph of the `association` blueprint comes from.
 *
 * Each file under `assets/photos/association/` that is a photograph was taken
 * from Wikimedia Commons under CC0, the public domain or a Creative Commons
 * Attribution licence (never ShareAlike, never NonCommercial), then cropped
 * and resized. The seeded "Photo credits" page renders exactly this list, and
 * `scripts/association-assets/README.md` records how the files were made.
 *
 * Chosen by looking at them: places, objects and gardens, never a person
 * presented as a volunteer or a beneficiary of the fictional charity. The
 * partner wordmarks are not in this list: they were drawn for this blueprint.
 */
export const ASSOCIATION_PHOTO_CREDITS: readonly PhotoCredit[] = [
  {
    file: 'hero.jpg',
    title: 'Jardin partagé pédagogique La Pinède (Lyon) - mai 2019 (1)',
    author: 'Benoît Prieur',
    licence: 'CC0 1.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Jardin_partag%C3%A9_p%C3%A9dagogique_La_Pin%C3%A8de_(Lyon)_-_mai_2019_(1).jpg',
  },
  {
    file: 'garden-corner.jpg',
    title: 'Jardin partagé pédagogique La Pinède (Lyon) - mai 2019 (2)',
    author: 'Benoît Prieur',
    licence: 'CC0 1.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Jardin_partag%C3%A9_p%C3%A9dagogique_La_Pin%C3%A8de_(Lyon)_-_mai_2019_(2).jpg',
  },
  {
    file: 'garden-planting.jpg',
    title: 'A tale of two gardens',
    author: 'mypubliclands (U.S. Bureau of Land Management)',
    licence: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:A_TALE_OF_TWO_GARDENS-_(20628764456).jpg',
  },
  {
    file: 'food-bank.jpg',
    title: 'Vegetable Market (Unsplash)',
    author: 'Lukas Budimaier',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Vegetable_Market_(Unsplash).jpg',
  },
  {
    file: 'homework-club.jpg',
    title: 'Reading room (Unsplash)',
    author: 'Samuel Zeller',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Reading_room_(Unsplash).jpg',
  },
  {
    file: 'coat-bank.jpg',
    title: 'Hanging shirts and jackets (Unsplash)',
    author: 'Crew',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Hanging_shirts_and_jackets_(Unsplash).jpg',
  },
  {
    file: 'orientation.jpg',
    title: 'Chairs in a meeting room (Unsplash)',
    author: 'Breather',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Chairs_in_a_meeting_room_(Unsplash).jpg',
  },
  {
    file: 'supper.jpg',
    title: 'John Pounds Centre Library Converted to Dining Area',
    author: 'Tim Sheerman-Chase',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:John_Pounds_Centre_Library_Converted_to_Dining_Area.jpg',
  },
  {
    file: 'hall.jpg',
    title: 'White library tall windows (Unsplash)',
    author: 'Tu Tram Pham',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:White_library_tall_windows_(Unsplash).jpg',
  },
]
