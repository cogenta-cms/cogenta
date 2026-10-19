import type { PhotoCredit } from './blog-credits.js'

/**
 * Where every photograph of the `portfolio` blueprint comes from.
 *
 * Each file under `assets/photos/portfolio/` is a real photograph, taken from
 * Wikimedia Commons under CC0, the public domain or a Creative Commons
 * Attribution licence (never ShareAlike, never NonCommercial), then cropped
 * and resized. They replace the drawn design work this blueprint carried
 * before it became a photography studio. Attribution licences ask for the
 * author, the licence and an indication of changes: the seeded "Photo
 * credits" page renders exactly this list, and
 * `scripts/portfolio-assets/README.md` records how the files were made.
 *
 * The photographs were chosen by looking at them: no recognisable person, no
 * visible brand, no readable private text.
 */
export const PORTFOLIO_PHOTO_CREDITS: readonly PhotoCredit[] = [
  {
    file: 'lagoon-cover.jpg',
    title: 'Building of the Salins de Frontignan 14',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Building_of_the_Salins_de_Frontignan_14.jpg',
  },
  {
    file: 'lagoon-shore.jpg',
    title: 'Lido de Thau, Sète, Hérault 14',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Lido_de_Thau,_S%C3%A8te,_H%C3%A9rault_14.jpg',
  },
  {
    file: 'lagoon-egret.jpg',
    title: 'Egretta garzetta - Sète - January 2021',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Egretta_garzetta_-_S%C3%A8te_-_January_2021.jpg',
  },
  {
    file: 'lagoon-storm.jpg',
    title: 'Sunrise and clouds over the Étang de Thau from Mèze 01',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Sunrise_and_clouds_over_the_%C3%89tang_de_Thau_from_M%C3%A8ze_01.jpg',
  },
  {
    file: 'vines-cover.jpg',
    title: 'Pic de Vissou et vignes 01',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Pic_de_Vissou_et_vignes_01.jpg',
  },
  {
    file: 'vines-tree.jpg',
    title: 'Mazet in vineyards, Mèze cf02',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Mazet_in_vineyards,_M%C3%A8ze_cf02.jpg',
  },
  {
    file: 'vines-shed.jpg',
    title: 'Former windmill, Salasc 01',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Former_windmill,_Salasc_01.jpg',
  },
  {
    file: 'vines-grapes.jpg',
    title: 'Uva nera da vino - grappoli 1',
    author: 'Anna.Massini',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Uva_nera_da_vino_-_grappoli_1.jpg',
  },
  {
    file: 'port-cover.jpg',
    title: 'Two trawlers in Sète',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Two_trawlers_in_S%C3%A8te.jpg',
  },
  {
    file: 'port-quay.jpg',
    title: 'Odeep One depuis le Quai de la République',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Odeep_One_depuis_le_Quai_de_la_R%C3%A9publique.jpg',
  },
  {
    file: 'port-dusk.jpg',
    title: 'Dawn on the harbour of Sète cf01',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Dawn_on_the_harbour_of_S%C3%A8te_cf01.jpg',
  },
  {
    file: 'port-marina.jpg',
    title: 'Port de Mèze 01',
    author: 'Christian Ferrer',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Port_de_M%C3%A8ze_01.jpg',
  },
  {
    file: 'forest-cover.jpg',
    title: 'Forest road Slavne 2017 G8',
    author: 'George Chernilevsky',
    licence: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Forest_road_Slavne_2017_G8.jpg',
  },
  {
    file: 'forest-birch.jpg',
    title: 'Birchwood Slavnoe 2012 G1',
    author: 'George Chernilevsky',
    licence: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Birchwood_Slavnoe_2012_G1.jpg',
  },
  {
    file: 'forest-branches.jpg',
    title: 'Artemisia vulgaris RF',
    author: 'Robert Flogaus-Faust',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Artemisia_vulgaris_RF.jpg',
  },
  {
    file: 'forest-beech.jpg',
    title: 'Sharp intersection of multiple trails in Parc Naturel de Gaume, Florenville (DSCF7245)',
    author: 'Trougnouf (Benoit Brummer)',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Sharp_intersection_of_multiple_trails_in_Parc_Naturel_de_Gaume,_Florenville_(DSCF7245).jpg',
  },
  {
    file: 'glacier-cover.jpg',
    title: 'Fjallsárlón glacier lake, Iceland, 20240719 1720 2774',
    author: 'Jakub Hałun',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Fjalls%C3%A1rl%C3%B3n_glacier_lake,_Iceland,_20240719_1720_2774.jpg',
  },
  {
    file: 'glacier-tongue.jpg',
    title: 'Breiðamerkurjökull glacier, Iceland, 20240719 1514 2687',
    author: 'Jakub Hałun',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Brei%C3%B0amerkurj%C3%B6kull_glacier,_Iceland,_20240719_1514_2687.jpg',
  },
  {
    file: 'glacier-melt.jpg',
    title: 'Breiðamerkurjökull glacier, Iceland, 20240719 1503 2670',
    author: 'Jakub Hałun',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Brei%C3%B0amerkurj%C3%B6kull_glacier,_Iceland,_20240719_1503_2670.jpg',
  },
  {
    file: 'glacier-cave.jpg',
    title: 'Breiðamerkurjökull glacier, Iceland, 20240719 1427 2618',
    author: 'Jakub Hałun',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Brei%C3%B0amerkurj%C3%B6kull_glacier,_Iceland,_20240719_1427_2618.jpg',
  },
  {
    file: 'coast-cover.jpg',
    title: 'Olkhon Island, Coastline at sunset, Lake Baikal, Russia',
    author: 'Vyacheslav Argenberg',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Olkhon_Island,_Coastline_at_sunset,_Lake_Baikal,_Russia.jpg',
  },
  {
    file: 'coast-ridge.jpg',
    title: 'Olkhon Island, Panoramic view, Lake Baikal, Russia',
    author: 'Vyacheslav Argenberg',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Olkhon_Island,_Panoramic_view,_Lake_Baikal,_Russia.jpg',
  },
  {
    file: 'coast-water.jpg',
    title: 'Sea Cliff',
    author: 'Serhio Magpie',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Sea_Cliff.jpg',
  },
  {
    file: 'coast-boats.jpg',
    title: 'Promontoire rocheux Calahonda',
    author: 'Jebulon',
    licence: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Promontoire_rocheux_Calahonda.jpg',
  },
  {
    file: 'towers-cover.jpg',
    title: 'Caucasus, Ingushetia, Ингушские боевые и смотровые башни, горы Кавказа',
    author: 'Vyacheslav Argenberg',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Caucasus,_Ingushetia,_%D0%98%D0%BD%D0%B3%D1%83%D1%88%D1%81%D0%BA%D0%B8%D0%B5_%D0%B1%D0%BE%D0%B5%D0%B2%D1%8B%D0%B5_%D0%B8_%D1%81%D0%BC%D0%BE%D1%82%D1%80%D0%BE%D0%B2%D1%8B%D0%B5_%D0%B1%D0%B0%D1%88%D0%BD%D0%B8,_%D0%B3%D0%BE%D1%80%D1%8B_%D0%9A%D0%B0%D0%B2%D0%BA%D0%B0%D0%B7%D0%B0.jpg',
  },
  {
    file: 'towers-single.jpg',
    title: 'Ingushetia, Russia, Armkhi, Ingush tower',
    author: 'Vyacheslav Argenberg',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Ingushetia,_Russia,_Armkhi,_Ingush_tower.jpg',
  },
  {
    file: 'towers-green.jpg',
    title: 'Sioni, Tower, Khevi, Georgia',
    author: 'Vyacheslav Argenberg',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Sioni,_Tower,_Khevi,_Georgia.jpg',
  },
  {
    file: 'towers-valley.jpg',
    title: 'Sioni, Georgian Military Road, Khevi, Georgia',
    author: 'Vyacheslav Argenberg',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Sioni,_Georgian_Military_Road,_Khevi,_Georgia.jpg',
  },
]
