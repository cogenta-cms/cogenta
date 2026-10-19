import type { PhotoCredit } from './blog-credits.js'

/**
 * Where every photograph of the `magazine` blueprint comes from.
 *
 * Each file under `assets/photos/magazine/` is a real photograph from
 * Wikimedia Commons under CC0, the public domain or a Creative Commons
 * Attribution licence (never ShareAlike, never NonCommercial), cropped and
 * resized — replacing the AI-generated placeholders `photo-assets.ts`
 * bundled for this slot at L25. The seeded "Photo credits" page renders
 * exactly this list, in the site's language, the same way the `blog` and
 * `vitrine` blueprints do.
 *
 * The magazine's city is fictional and so is every story: a photograph
 * therefore shows a kind of place (a town hall, a reading room, a tram
 * stop), never a named institution, and the captions say only what the
 * picture shows. No recognisable person appears in any of them.
 */
export const MAGAZINE_PHOTO_CREDITS: readonly PhotoCredit[] = [
  {
    file: 'town-hall.jpg',
    title: 'Laval F Town Hall',
    author: 'Rei Momo',
    licence: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Laval_F_Town_Hall.jpg',
  },
  {
    file: 'gallery.jpg',
    title: 'Villa Caro, exhibition room (Museum in Gliwice)',
    author: 'Krzysztof Popławski',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Muzeum_w_Gliwicach_-_Willa_Caro_-_sala_wystawowa,_wystawa_Zofii_Stryje%C5%84skiej,_sierpie%C5%84_2024_KsP_069.jpg',
  },
  {
    file: 'theatre.jpg',
    title: 'Harrogate Theatre pit and curtain',
    author: 'Celia Perry',
    licence: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Harrogate_Theatre_pit_and_curtain.jpg',
  },
  {
    file: 'archive-stacks.jpg',
    title: 'Documents stacks in a repository at The National Archives',
    author: 'The National Archives (United Kingdom)',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Documents_stacks_in_a_repository_at_The_National_Archives.jpg',
  },
  {
    file: 'allotments.jpg',
    title: 'Jardins partagés à Saint-Martin-de-Crau',
    author: 'Mikani',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Jardins_partag%C3%A9s_%C3%A0_Saint-Martin-de-Crau_by_Mikani.jpg',
  },
  {
    file: 'reception-hall.jpg',
    title: 'Manchester Town Hall Banqueting Room',
    author: 'Michael D Beckwith',
    licence: 'CC0 1.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Manchester_Town_Hall_Banqueting_Room_(49079145863).jpg',
  },
  {
    file: 'tram-stop.jpg',
    title: 'Strasbourg Gare Tramway',
    author: 'Ikar.us',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Strasbourg_Gare_Tramway.jpg',
  },
  {
    file: 'empty-tram-stop.jpg',
    title: 'Lyon 7e - Quai Claude Bernard - Vers le nord depuis l’arrêt du tramway T1',
    author: 'Romainbehar',
    licence: 'CC0 1.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Lyon_7e_-_Quai_Claude_Bernard_-_Vers_le_nord_depuis_l%27arr%C3%AAt_du_tramway_T1.jpg',
  },
  {
    file: 'reading-room.jpg',
    title: 'People studying in the Wolfson Reading Room of Manchester Central Library',
    author: 'Ridiculopathy',
    licence: 'CC0 1.0',
    source:
      'https://commons.wikimedia.org/wiki/File:People_studying_in_the_Wolfson_Reading_Room_of_Manchester_Central_Library_03.jpg',
  },
  {
    file: 'baguettes.jpg',
    title: 'Boulangerie de Saint-Maurice-de-Beynost (Ain, France) - des baguettes de pain',
    author: 'Benoît Prieur',
    licence: 'CC0 1.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Boulangerie_de_Saint-Maurice-de-Beynost_(Ain,_France)_-_des_baguettes_de_pain.JPG',
  },
  {
    file: 'dining-room.jpg',
    title:
      'Modern dining area with wooden decor and empty tables inviting guests to enjoy a meal at a restaurant',
    author: 'Shixart1985',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Modern_dining_area_with_wooden_decor_and_empty_tables_inviting_guests_to_enjoy_a_meal_at_a_restaurant.jpg',
  },
  {
    file: 'office-block-dusk.jpg',
    title: 'Office Building Off Old Street',
    author: 'Francisco Anzola',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Office_Building_Off_Old_Street_(215200145).jpeg',
  },
]
