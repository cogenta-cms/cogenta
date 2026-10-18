import type { PhotoCredit } from './blog-credits.js'

/**
 * Where every photograph of the `restaurant` blueprint comes from.
 *
 * Each file under `assets/photos/restaurant/` is a real photograph taken from
 * Wikimedia Commons under CC0, the public domain or a Creative Commons
 * Attribution licence (never ShareAlike, never NonCommercial), then cropped
 * and resized. They replace the AI-generated placeholders `photo-assets.ts`
 * bundled for this slot at L25, which looked like food but depicted no real
 * plate. Attribution licences ask for the author, the licence and an
 * indication of changes: the seeded "Photo credits" page renders exactly this
 * list, in the language of the site, the same way `vitrine` and `blog` do.
 *
 * Chosen by looking at them: every dish photograph shows the dish it is filed
 * under, none shows a recognisable person, a brand or a readable private text.
 */
export const RESTAURANT_PHOTO_CREDITS: readonly PhotoCredit[] = [
  {
    file: 'hero.jpg',
    title: 'Hostellerie des Fines Roches, salle de restaurant',
    author: 'jean-louis Zimmermann',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Hostellerie_des_Fines_Roches_Salle_de_restaurant.jpg',
  },
  {
    file: 'beetroot-carpaccio.jpg',
    title: 'Carpaccio of beets with goat cheese, Berlin-Charlottenburg',
    author: 'Gerda Arendt',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Carpaccio_of_beets_with_goat_cheese,_Berlin-Charlottenburg.jpg',
  },
  {
    file: 'pumpkin-soup.jpg',
    title: 'Pumpkin soup with chestnuts',
    author: 'Luca Nebuloni',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Pumpkin_soup_with_chestnuts_(10513766303).jpg',
  },
  {
    file: 'grilled-octopus.jpg',
    title: 'Grilled octopus - Other Mama - March 2019 01',
    author: 'T.Tseng',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Grilled_octopus_-_Other_Mama_-_March_2019_01.jpg',
  },
  {
    file: 'cod-vin-jaune.jpg',
    title: 'Pavé de cabillaud mousseline au vin jaune, endives et Comté croustillant',
    author: 'Benoît Prieur',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Pav%C3%A9_de_cabillaud_mousseline_au_vin_jaune,_endives_et_Comt%C3%A9_croustillant.JPG',
  },
  {
    file: 'duck-confit.jpg',
    title: 'Duck confit - the girl and the fig - 2021-11-10',
    author: 'Sarah Stierch (Missvain)',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Duck_confit_-_the_girl_and_the_fig_-_2021-11-10_-_Sarah_Stierch.jpg',
  },
  {
    file: 'mushroom-risotto.jpg',
    title: 'Mushroom and Leek Risotto',
    author: 'spurekar',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Mushroom_and_Leek_Risotto_(49535206656).jpg',
  },
  {
    file: 'pike-quenelle.jpg',
    title: 'Brasserie le Terminus (Tournus), quenelle de brochet',
    author: 'Tangopaso',
    licence: 'Public domain',
    source:
      'https://commons.wikimedia.org/wiki/File:Brasserie_le_Terminus_(Tournus)_-_Quenelle_de_brochet.jpg',
  },
  {
    file: 'chocolate-tart.jpg',
    title: 'Caramel Chocolate Tart',
    author: 'Prayitno',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Caramel_Chocolate_Tart_(38380007766).jpg',
  },
  {
    file: 'poached-pear.jpg',
    title: 'Poire au sirop de cassis',
    author: 'DocteurCosmos',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Poire_au_sirop_de_cassis.jpg',
  },
  {
    file: 'praline-cake.jpg',
    title: 'Lyon 5e, Le Panier du Chef, gâteau lyonnais pomme et pralines',
    author: 'Romainbehar',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Lyon_5e_-_Le_Panier_du_Chef,_g%C3%A2teau_lyonnais_pomme_et_pralines.jpg',
  },
  {
    file: 'street-burdeau.jpg',
    title: 'Rue Burdeau (Lyon)',
    author: 'Benoît Prieur',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Rue_Burdeau_(Lyon).jpg',
  },
  {
    file: 'market-stall.jpg',
    title: 'Marché de la Croix-Rousse en octobre 2019 (1)',
    author: 'Benoît Prieur',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:March%C3%A9_de_la_Croix-Rousse_en_octobre_2019_(1).jpg',
  },
]
