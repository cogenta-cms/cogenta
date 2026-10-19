import type { RestaurantCopy } from './restaurant-copy.js'

/**
 * Le restaurant en français : un bistrot installé dans les anciens bureaux
 * d’un soyeux, sur les pentes de la Croix-Rousse, à Lyon. Les prix sont en
 * euros, service compris, les heures s’écrivent à la française et le
 * téléphone se compose comme on le fait en France.
 */

const MACON = 'Mâcon-Villages, 2023'
const SAINT_JOSEPH = 'Saint-Joseph blanc, 2022'
const MORGON = 'Morgon Côte du Py, 2022'
const CROZES = 'Crozes-Hermitage, 2021'
const MUSCAT = 'Muscat de Beaumes-de-Venise, 2020'

export const RESTAURANT_COPY_FR: RestaurantCopy = {
  locale: 'fr',
  schema: {
    dishLabels: { singular: 'Plat', plural: 'Carte' },
    dishRoute: '/carte/:slug',
  },
  pageSlugs: {
    home: 'home',
    menu: 'carte',
    story: 'notre-histoire',
    reservations: 'reservations',
    privateDining: 'salon-prive',
    visit: 'horaires-et-acces',
    legal: 'mentions-legales',
    credits: 'credits-photos',
  },
  sections: ['Entrées', 'Plats', 'Fromages et desserts', 'Vins au verre'],
  moreTitles: ['Les autres entrées', 'Les autres plats', 'Fromages et desserts', 'Vins au verre'],
  address: '8 rue Burdeau, 69001 Lyon',
  phoneDisplay: '04\u00A078\u00A028\u00A016\u00A042',
  dishes: [
    {
      id: 'beetroot-carpaccio',
      slug: 'carpaccio-de-betteraves',
      name: 'Carpaccio de betteraves, chèvre tiède',
      section: 0,
      price: 12,
      vegetarian: true,
      description:
        'Betterave crapaudine cuite sous une croûte de sel et tranchée fin, trois palets de chèvre frais grillés au miel, vinaigre vieux et huile de noix.',
      sourcing: 'Betteraves de la ferme Morel à Vourles, chèvre d’une fromagerie près de Condrieu',
      pairing: MACON,
      allergens: 'Lait, noix, sulfites',
      note: 'La crapaudine est une variété ancienne, à la peau rugueuse et sombre comme une écorce. Cuite lentement sous une croûte de sel, elle garde toute sa douceur, et nous la tranchons à la commande pour que les tranches ne sèchent pas. Le chèvre passe sous le gril jusqu’à ce que le miel caramélise.',
      photoAlt:
        'Fines tranches de betterave sombre sur une assiette en métal martelé, trois palets de chèvre grillé et un filet de vinaigre vieux',
    },
    {
      id: 'pumpkin-soup',
      slug: 'veloute-de-potimarron',
      name: 'Velouté de potimarron aux châtaignes, comté vieux',
      section: 0,
      price: 10,
      vegetarian: true,
      description:
        'Potimarron rôti jusqu’à caraméliser, mijoté avec des châtaignes et un peu de crème, terminé par du comté affiné vingt-quatre mois et du poivre noir.',
      sourcing: 'Potimarrons de la ferme Morel à Vourles, châtaignes d’Ardèche',
      allergens: 'Lait, céleri',
      note: 'Le potimarron est rôti avec sa peau, ce qui donne au velouté sa couleur et un goût de noisette. En octobre, quand le velouté est à son meilleur, les châtaignes arrivent fraîches d’un producteur ardéchois\u00A0; le reste de l’hiver, elles viennent sous vide. Le comté est râpé au passe, juste avant que le bol ne parte.',
      photoAlt:
        'Un bol sombre de velouté orange sous une neige de comté râpé et de poivre noir, une cuillère à côté',
    },
    {
      id: 'grilled-octopus',
      slug: 'poulpe-grille',
      name: 'Poulpe grillé, safran et orange',
      section: 0,
      price: 17,
      vegetarian: false,
      description:
        'Poulpe braisé deux heures puis grillé sur des sarments de vigne, émulsion de safran, d’orange et d’huile d’olive, quelques pousses de pois.',
      sourcing: 'Bateaux de Saint-Gilles-Croix-de-Vie, livré dans la nuit',
      pairing: SAINT_JOSEPH,
      allergens: 'Mollusques, œuf',
      note: 'Nous achetons des poulpes entiers d’environ deux kilos et les cuisons le jour même. Les sarments viennent d’un vigneron du Beaujolais qui taille en février et nous garde une remorque.',
      photoAlt:
        'Tentacules de poulpe grillé sur une flaque de sauce au safran et à l’orange, sous une poignée de pousses de pois',
    },
    {
      id: 'pate-en-croute',
      slug: 'pate-en-croute',
      name: 'Pâté en croûte, girolles marinées',
      section: 0,
      price: 15,
      vegetarian: false,
      description:
        'Porc, canard et pistache sous une pâte à l’eau chaude, fait le lundi pour la semaine, avec des girolles marinées au vinaigre de cidre.',
      sourcing: 'Porc des monts du Lyonnais, canard de la Dombes',
      pairing: MORGON,
      allergens: 'Gluten, œuf, pistache, sulfites',
      note: 'Un pâté donne dix-huit tranches et nous en faisons deux chaque lundi. Quand elles sont parties, le plat quitte la carte jusqu’à la semaine suivante.',
    },
    {
      id: 'leeks-vinaigrette',
      slug: 'poireaux-vinaigrette',
      name: 'Poireaux vinaigrette, œuf mollet et noisettes',
      section: 0,
      price: 11,
      vegetarian: true,
      description:
        'Jeunes poireaux pochés à cœur, vinaigrette franche à la moutarde, un œuf mollet de la ferme et des noisettes grillées.',
      sourcing: 'Poireaux et œufs de la ferme Morel à Vourles',
      allergens: 'Œuf, moutarde, noisettes',
      note: 'Un plat de bistrot que nous servons depuis la première semaine. Les poireaux sont arrachés quand ils ne sont pas plus gros qu’un pouce, et assaisonnés tièdes pour qu’ils boivent la vinaigrette.',
    },
    {
      id: 'cod-vin-jaune',
      slug: 'cabillaud-vin-jaune',
      name: 'Cabillaud, sauce au vin jaune, endive et comté croustillant',
      section: 1,
      price: 28,
      vegetarian: false,
      description:
        'Un pavé de cabillaud poêlé sur la peau, une sauce légère à la crème et au vin jaune du Jura, des endives braisées et une tuile de comté cuite au four.',
      sourcing: 'Bateaux de Saint-Gilles-Croix-de-Vie, vin jaune d’un vigneron d’Arbois',
      pairing: SAINT_JOSEPH,
      allergens: 'Poisson, lait, sulfites',
      note: 'Le vin jaune est un vin du Jura élevé sous voile pendant six ans et plus\u00A0; son goût de noix et de curry est la base de la sauce. Nous le réduisons avec des échalotes et de la crème, puis nous montons le beurre au dernier moment pour qu’elle reste légère. La tuile de comté est cuite le matin avec les talons de meule.',
      photoAlt:
        'Un pavé de cabillaud doré dans une sauce pâle au vin jaune, parsemé de ciboulette et de tuiles de comté croustillantes, dans une assiette blanche',
    },
    {
      id: 'duck-confit',
      slug: 'cuisse-de-canard-confite',
      name: 'Cuisse de canard confite, choux de Bruxelles et céleri-rave',
      section: 1,
      price: 26,
      vegetarian: false,
      description:
        'Cuisse de canard salée une nuit et cuite doucement dans sa graisse, croustillante à la commande, avec des choux de Bruxelles rôtis à la poêle et une purée de céleri-rave.',
      sourcing: 'Canards élevés dans la Dombes, à quarante minutes au nord de Lyon',
      pairing: CROZES,
      allergens: 'Lait, céleri, sulfites',
      note: 'Les cuisses sont salées une nuit avec du thym et du genièvre écrasé, puis cuites trois heures dans leur graisse. Elles ne sont dorées côté peau, dans une poêle bien chaude, qu’à l’arrivée de la commande. Les choux sont coupés en deux et laissés noircir un peu, comme nous les aimons.',
      photoAlt:
        'Une cuisse de canard croustillante sur une purée de céleri-rave, avec des choux de Bruxelles rôtis et du persil haché, dans une assiette blanche',
    },
    {
      id: 'mushroom-risotto',
      slug: 'risotto-champignons-des-bois',
      name: 'Risotto aux champignons des bois, comté vieux',
      section: 1,
      price: 24,
      vegetarian: true,
      description:
        'Riz carnaroli cuit dans un fond de parures de champignons rôties, champignons des bois poêlés, thym et comté affiné vingt-quatre mois.',
      sourcing:
        'Champignons cueillis dans les monts du Forez, comté d’un affineur du marché de la Croix-Rousse',
      pairing: MACON,
      allergens: 'Lait, céleri, sulfites',
      note: 'Les champignons viennent d’un cueilleur qui descend du Forez le mardi et le vendredi, et le mélange change avec la forêt\u00A0: cèpes, pieds-de-mouton, trompettes-de-la-mort. Quand le temps a été sec, il n’y en a pas, et le risotto se fait alors avec du potimarron rôti.',
      photoAlt:
        'Un bol gris de risotto crémeux garni de champignons des bois dorés et d’une branche de thym, vu de dessus',
    },
    {
      id: 'pork-chop',
      slug: 'cote-de-porc-cidre',
      name: 'Côte de porc, cidre et pommes',
      section: 1,
      price: 29,
      vegetarian: false,
      description:
        'Une épaisse côte des monts du Lyonnais rôtie sur l’os, des pommes cuites au cidre et une cuillère de jus de cuisson.',
      sourcing: 'Porc d’une ferme des monts du Lyonnais',
      pairing: MORGON,
      allergens: 'Lait, sulfites',
      note: 'Les porcs sont un croisement de large white et de duroc, élevés en plein air et abattus à dix mois. La côte repose aussi longtemps qu’elle a cuit avant d’être tranchée.',
    },
    {
      id: 'pike-quenelle',
      slug: 'quenelle-de-brochet',
      name: 'Quenelle de brochet, sauce aux écrevisses',
      section: 1,
      price: 25,
      vegetarian: false,
      description:
        'Le classique lyonnais, allégé\u00A0: brochet et panade pochés, puis gratinés dans une sauce de carcasses d’écrevisses, de crème et d’un peu de cognac, avec un bol de riz.',
      sourcing: 'Brochet des étangs de la Dombes, écrevisses de Savoie',
      pairing: MACON,
      allergens: 'Poisson, crustacés, gluten, œuf, lait',
      note: 'Une quenelle gonfle au four comme un soufflé et retombe un peu en chemin jusqu’à la table, ce qui prouve qu’elle a été faite le soir même. Comptez vingt minutes. À Lyon, on la sert avec du riz nature, pour boire la sauce.',
      photoAlt:
        'Une quenelle de brochet dorée dans un plat en fonte noire de sauce aux écrevisses, avec un petit bol de riz à côté',
    },
    {
      id: 'saint-marcellin',
      slug: 'saint-marcellin',
      name: 'Saint-marcellin, pain aux noix',
      section: 2,
      price: 9,
      vegetarian: false,
      description:
        'Un fromage de vache à pâte molle de l’Isère, affiné jusqu’à ce qu’il coule, avec du pain aux noix de la boulangerie de la rue d’Austerlitz.',
      sourcing: 'Un affineur du marché de la Croix-Rousse',
      allergens: 'Lait, gluten, noix',
      note: 'Le saint-marcellin est servi dans son petit plat en terre cuite, à température ambiante. Demandez-le coulant ou ferme\u00A0: l’étal de l’affineur a en général les deux.',
    },
    {
      id: 'chocolate-tart',
      slug: 'tarte-au-chocolat',
      name: 'Tarte au chocolat noir, fleur de sel',
      section: 2,
      price: 10,
      vegetarian: true,
      description:
        'Une ganache à soixante-dix pour cent de cacao sur un fond de pâte sablée, finie de quelques cristaux de sel de Guérande.',
      sourcing: 'Chocolat d’un artisan de la Drôme',
      pairing: MUSCAT,
      allergens: 'Lait, gluten, œuf, soja',
      note: 'Le fond est cuit à blanc l’après-midi et la ganache coulée une heure avant le service\u00A0: la tarte est prise, sans jamais sortir froide du réfrigérateur.',
      photoAlt:
        'Des tartelettes rondes au chocolat noir sur un fond de pâte sablée, chacune surmontée d’une pincée de fleur de sel, dans une assiette blanche',
    },
    {
      id: 'poached-pear',
      slug: 'poire-pochee-au-cassis',
      name: 'Poire pochée au cassis, crème fraîche',
      section: 2,
      price: 10,
      vegetarian: true,
      description:
        'Une poire williams pochée dans un sirop de cassis avec quelques baies, servie froide dans son sirop, une cuillère de crème fraîche à côté.',
      sourcing: 'Poires d’un verger des monts du Lyonnais, cassis de Bourgogne',
      pairing: MUSCAT,
      allergens: 'Lait, sulfites',
      note: 'Les poires sont pochées deux jours à l’avance et laissées dans le sirop, qui les teint en rouge profond jusqu’au cœur. Nous les tranchons à table pour ne rien perdre du sirop.',
      photoAlt:
        'Des tranches de poire pochée rouge sombre dans un bol blanc, avec des baies de cassis dans le sirop',
    },
    {
      id: 'praline-cake',
      slug: 'gateau-aux-pralines',
      name: 'Gâteau aux pommes et pralines roses',
      section: 2,
      price: 9,
      vegetarian: true,
      description:
        'Un moelleux de pommes et de pralines roses concassées, glacé au caramel et saupoudré de sucre glace, à la manière des pâtissiers lyonnais.',
      sourcing: 'Pralines d’un confiseur de la Presqu’île, pommes des monts du Lyonnais',
      allergens: 'Gluten, œuf, lait, amandes, noisettes',
      note: 'La praline rose, ce sont des amandes enrobées de sucre rouge, une habitude lyonnaise depuis le XIXe siècle. Nous les concassons à la main, un peu gros, pour qu’il en reste de croquantes dans le gâteau. La part est petite et très sucrée, et s’accompagne bien d’un café.',
      photoAlt:
        'Une part de gâteau aux pommes et aux pralines glacé au caramel et saupoudré de sucre, avec des gouttes de caramel dans l’assiette blanche',
    },
    {
      id: 'macon-villages',
      slug: 'macon-villages-2023',
      name: MACON,
      section: 3,
      price: 8,
      vegetarian: false,
      description:
        'Chardonnay de vieilles vignes au-dessus de Lugny, élevé en cuve inox. Vif et légèrement salin.',
      sourcing: 'Un domaine familial du Mâconnais, en culture biologique depuis 2011',
      note: 'Nous le servons avec le risotto, la quenelle et la betterave. C’est le vin que nous ouvrons le plus souvent au déjeuner.',
    },
    {
      id: 'saint-joseph-blanc',
      slug: 'saint-joseph-blanc-2022',
      name: SAINT_JOSEPH,
      section: 3,
      price: 12,
      vegetarian: false,
      description:
        'Marsanne et roussanne de terrasses de granit sur la rive droite du Rhône. Rond, avec de l’abricot et de l’amande.',
      sourcing: 'Un vigneron de Tournon-sur-Rhône, quatre hectares de terrasses',
      note: 'Assez riche pour le cabillaud et le poulpe, et servi un peu plus chaud que la plupart des blancs pour laisser venir le fruit.',
    },
    {
      id: 'morgon',
      slug: 'morgon-cote-du-py-2022',
      name: MORGON,
      section: 3,
      price: 10,
      vegetarian: false,
      description:
        'Gamay de la côte du Py, vinifié en grappes entières et mis en bouteille sans filtration. Cerise noire et finale minérale.',
      sourcing: 'Un vigneron de Villié-Morgon chez qui nous achetons depuis l’ouverture',
      note: 'Servi légèrement frais, autour de quatorze degrés. C’est le vin que nous buvons avec le pâté en croûte et le porc.',
    },
    {
      id: 'crozes-hermitage',
      slug: 'crozes-hermitage-2021',
      name: CROZES,
      section: 3,
      price: 11,
      vegetarian: false,
      description:
        'Syrah du nord du Rhône, élevée quinze mois en fûts anciens. Olive noire, poivre et violette.',
      sourcing: 'Une coopérative de onze vignerons à Tain-l’Hermitage',
      note: 'Un millésime plus frais que d’habitude, aux tanins fins et à la longue finale poivrée. Nous carafons une bouteille au début de chaque service\u00A0; c’est avec le canard qu’il se boit le mieux.',
    },
    {
      id: 'muscat',
      slug: 'muscat-beaumes-de-venise-2020',
      name: MUSCAT,
      section: 3,
      price: 9,
      vegetarian: false,
      description:
        'Un blanc doux du sud du Rhône, servi frais dans un verre de huit centilitres. Zeste d’orange et miel.',
      sourcing: 'Un domaine au pied des dentelles de Montmirail',
      note: 'Le seul vin doux que nous servons au verre, réservé à la poire pochée et à la tarte au chocolat. Une demi-bouteille figure sur la carte pour la table qui en veut plus qu’un verre.',
    },
  ],
  media: {
    hero: 'La salle, ses bibliothèques vertes garnies de vieux registres, ses tables dressées de nappes grises et ses fauteuils rayés de rouge',
    street:
      'La rue Burdeau au soleil du soir, une rue d’immeubles hauts avec des vélos garés le long du trottoir',
    market: 'Pommes rouges, oranges et citrons empilés sur un étal du marché de la Croix-Rousse',
  },
  pages: ({ name, email, href, phoneHref, mapHref }) => ({
    titles: {
      home: 'Accueil',
      menu: 'La carte',
      story: 'Notre histoire',
      reservations: 'Réservations',
      privateDining: 'Salon privé',
      visit: 'Horaires et accès',
      legal: 'Mentions légales et confidentialité',
      credits: 'Crédits photographiques',
    },
    hours: [
      { title: 'Déjeuner', text: 'Jeudi et vendredi, de 12\u00A0h à 13\u00A0h\u00A045' },
      { title: 'Dîner', text: 'Du mardi au samedi, de 19\u00A0h\u00A030 à 21\u00A0h\u00A045' },
      {
        title: 'Fermé',
        text: 'Dimanche et lundi, trois semaines en août et la semaine de Noël',
      },
    ],
    labels: { address: 'Adresse', telephone: 'Téléphone' },
    actions: {
      call: 'Appeler le 04\u00A078\u00A028\u00A016\u00A042',
      write: 'Nous écrire',
      tableSubject: 'Demande de table',
      eventsSubject: 'Demande de privatisation du salon',
    },
    home: {
      heroEyebrow: 'Restaurant et bar à vins, Lyon',
      heroSubtitle:
        'Une cuisine de saison dans les anciens bureaux d’un soyeux, sur les pentes de la Croix-Rousse. Déjeuner le jeudi et le vendredi, dîner du mardi au samedi.',
      heroAction: 'Réserver une table',
      welcome:
        'Nous cuisinons ce que nous envoient chaque semaine quelques fermes, quelques bateaux et quelques vignerons, et nous écrivons une nouvelle carte tous les mardis. Trente-huit places entre les bibliothèques, et six au comptoir pour ceux qui poussent la porte sans avoir réservé.',
      menuTitle: 'La carte de la semaine',
      kitchen: [
        '## La cuisine',
        `${name} a ouvert en 2016 dans les anciens bureaux d’un soyeux de la rue Burdeau, une longue salle de boiseries vertes et de bibliothèques que la famille propriétaire de l’immeuble n’avait jamais touchées. Élise Marchand dirige la cuisine avec trois cuisiniers\u00A0; Karim Benali veille sur la salle et sur le vin.`,
        'Presque tout ce que nous cuisinons vient à moins de cent kilomètres de la porte\u00A0: les légumes d’une ferme de Vourles, les canards et les brochets de la Dombes, le porc des monts du Lyonnais, le fromage du marché tout en haut de la colline. Le poisson fait exception\u00A0: il arrive dans la nuit des bateaux de la côte vendéenne.',
        `[Découvrir la cuisine et ceux qui nous fournissent](${href('story')})`,
      ],
      press: {
        text: 'Élise Marchand cuisine comme la salle est faite\u00A0: rien dans l’assiette n’est là pour l’effet, et rien n’y manque.',
        author: 'Hélène Vasseur',
        role: 'Tablées, guide d’automne 2026',
      },
      hoursTitle: 'Horaires et adresse',
      privateCta: {
        title: 'Le salon de l’étage, quatorze couverts à une seule table',
        text: 'Un déjeuner ou un dîner pour un anniversaire, un mariage ou une équipe, avec un menu écrit pour l’occasion et des vins choisis avec vous.',
        action: 'Salon privé',
      },
      bookCta: {
        title: 'Réserver une table',
        text: 'Appelez-nous du mardi au samedi entre 10\u00A0h et 18\u00A0h, ou écrivez-nous\u00A0: nous répondons le jour même.',
      },
    },
    menu: {
      intro:
        'La carte change chaque mardi, au gré de ce que les fermes et les bateaux nous envoient, et un plat la quitte quand il n’y en a plus. Tout est cuisiné à la commande. Les prix sont en euros, service compris\u00A0; le vin au verre est servi à douze centilitres, sauf indication contraire.',
      setsTitle: 'Les menus',
      tiers: [
        {
          name: 'Déjeuner',
          price: '29\u00A0€',
          interval: 'deux plats, jeudi et vendredi',
          features: [
            'Une entrée et un plat, ou un plat et un dessert',
            'Trois plats pour 36\u00A0€',
            'Un verre du blanc ou du rouge de la semaine pour 7\u00A0€',
          ],
        },
        {
          name: 'Le menu du soir',
          price: '62\u00A0€',
          interval: 'cinq plats, pour toute la table',
          features: [
            'Deux entrées, un plat, un fromage et un dessert',
            'Cinq verres choisis par Karim pour 38\u00A0€',
            'Servi jusqu’à 20\u00A0h\u00A030',
          ],
          highlighted: true,
        },
        {
          name: 'À la carte',
          price: '9 à 29\u00A0€',
          interval: 'un plat, au déjeuner et au dîner',
          features: [
            'Tous les plats de cette page',
            'Demi-portions pour les enfants',
            'Pain et beurre compris',
          ],
        },
      ],
      listTitle: 'La carte de la semaine',
      notesTitle: 'Allergies et régimes alimentaires',
      notes: [
        [
          'Allergies',
          'Chaque plat indique les quatorze allergènes réglementaires qu’il contient. Signalez une allergie à la réservation, puis de nouveau à table\u00A0: la cuisine dira clairement ce qu’elle peut changer et ce qu’elle ne peut pas. Nous travaillons chaque jour les fruits à coque, le gluten et les crustacés, et ne pouvons donc pas garantir l’absence de traces.',
        ],
        [
          'Convives végétariens',
          'Les plats marqués végétariens ne contiennent ni viande ni poisson. Certains de nos fromages sont faits avec de la présure animale\u00A0: demandez, nous vous dirons lesquels. Il y a toujours un plat végétarien, et nous pouvons cuisiner le menu du soir sans viande ni poisson si vous nous prévenez à la réservation.',
        ],
        [
          'Convives végans',
          'Écrivez-nous avant de venir et nous composerons un repas pour vous. Un soir de service chargé, sans préavis, la cuisine ne peut pas faire plus de deux plats.',
        ],
      ],
    },
    story: {
      intro: [
        `${name} a ouvert à l’automne 2016 dans les anciens bureaux d’un soyeux, rue Burdeau. La maison a été bâtie en 1832 pour une maison de négoce qui vendait des coupons d’étoffe à Paris et à Milan. Ses comptes se tenaient dans la longue salle du rez-de-chaussée, derrière des boiseries vertes et des rayonnages qui abritent toujours ses registres. Nous avons gardé la salle telle qu’elle était, dressé les tables à la place des pupitres des commis et installé la cuisine dans l’entrepôt du fond.`,
        '## La cuisine',
        'Élise Marchand a grandi à Villefranche-sur-Saône et cuisiné huit ans à Paris et à Copenhague avant de rentrer ouvrir le restaurant. Elle écrit la carte le lundi après-midi, quand les fermes lui ont dit ce qu’elles enverraient, et fait chaque service avec trois cuisiniers et un pâtissier qui travaille le matin.',
        'La cuisine est simple, et c’est voulu. Une assiette compte trois ou quatre éléments, chacun choisi pour la semaine où il est de saison, et les sauces se font avec les os et les parures de ce que nous achetons entier.',
        '## La salle et le vin',
        'Karim Benali tient la salle. Formé au métier de sommelier à Beaune, il a bâti une carte d’environ deux cents vins, presque tous de vignerons du Beaujolais, du Mâconnais et du nord du Rhône, dont il connaît la plupart pour leur avoir rendu visite. Six sont servis au verre et changent avec la carte.',
      ],
      roomCaption:
        'La salle de la rue Burdeau, dressée pour le dîner entre les bibliothèques de l’ancien bureau du soyeux.',
      figuresTitle: 'La maison en chiffres',
      figures: [
        { value: '38', label: 'places en salle, et six au comptoir' },
        { value: '14', label: 'convives à une seule table dans le salon de l’étage' },
        {
          value: '11',
          label: 'fermes, bateaux et vignerons chez qui nous achetons chaque semaine',
        },
        { value: '100', unit: 'km', label: 'de la porte à presque tout ce que nous cuisinons' },
      ],
      suppliersTitle: 'Chez qui nous achetons',
      suppliers: [
        {
          title: 'Légumes et œufs',
          text: 'La ferme familiale Morel, à Vourles, à vingt minutes au sud-ouest de Lyon, livre le mardi et le vendredi matin.',
        },
        {
          title: 'Canard et brochet',
          text: 'Deux fermes et une pisciculture de la Dombes, ce plateau d’étangs au nord de la ville.',
        },
        {
          title: 'Porc et poires',
          text: 'Une ferme et un verger des monts du Lyonnais, où les porcs sont élevés en plein air.',
        },
        {
          title: 'Poissons et coquillages',
          text: 'Les bateaux de Saint-Gilles-Croix-de-Vie, par un mareyeur qui expédie la pêche dans la nuit.',
        },
        {
          title: 'Fromage',
          text: 'Un affineur du marché de la Croix-Rousse, à deux cents mètres plus haut.',
        },
        {
          title: 'Pain',
          text: 'Une boulangerie au levain de la rue d’Austerlitz, où l’un des cuisiniers passe chaque matin à sept heures.',
        },
      ],
      marketCaption: 'Un étal du marché de la Croix-Rousse, à deux cents mètres plus haut.',
    },
    reservations: {
      intro: [
        'Nous prenons les réservations par téléphone et par e-mail, jusqu’à huit semaines à l’avance. Il n’y a pas de réservation en ligne\u00A0: chaque table est réservée par l’un de nous, ce qui nous permet de vous demander, au passage, s’il y a une allergie, une poussette ou un anniversaire à prévoir.',
        '## Par téléphone',
        `Appelez le [04\u00A078\u00A028\u00A016\u00A042](${phoneHref}) du mardi au samedi, entre 10\u00A0h et 18\u00A0h. Pendant le service, nous répondons quand quelqu’un est libre\u00A0: l’après-midi est le meilleur moment pour nous joindre.`,
        '## Par e-mail',
        `Écrivez à [${email('table')}](mailto:${email('table')}) en indiquant la date, l’heure, le nombre de convives et un numéro de téléphone. Nous répondons le jour même, et une table n’est réservée qu’une fois notre réponse reçue.`,
        '## Sans réservation',
        'Les six places du comptoir sont gardées pour ceux qui poussent la porte au dîner, et toute la carte y est servie. Le vendredi et le samedi, elles sont en général prises avant 20\u00A0h.',
      ],
      summaryTitle: 'La réservation en bref',
      summary: [
        {
          title: 'Tables',
          text: 'De deux à six convives. De sept à quatorze, voyez le salon privé.',
          href: href('privateDining'),
        },
        {
          title: 'Réserver à l’avance',
          text: 'Jusqu’à huit semaines, par téléphone ou par e-mail',
        },
        {
          title: 'Acompte',
          text: 'Aucun jusqu’à six convives. 20\u00A0€ par convive à partir de huit.',
        },
        {
          title: 'Annulation',
          text: 'Merci de nous prévenir 24 heures à l’avance, pour que nous puissions donner la table à quelqu’un d’autre',
        },
      ],
      faqTitle: 'Avant de venir',
      faq: [
        [
          'Que se passe-t-il si nous avons du retard\u00A0?',
          'Nous gardons une table quinze minutes. Appelez-nous si vous devez arriver plus tard\u00A0: nous ferons ce que nous pouvons, mais un soir complet, il se peut que le repas doive être raccourci.',
        ],
        [
          'Comment annuler\u00A0?',
          'Appelez-nous ou répondez à l’e-mail qui a confirmé votre table, au moins 24 heures avant. À partir de huit convives, l’acompte est intégralement rendu si vous annulez 72 heures à l’avance.',
        ],
        [
          'Les enfants sont-ils les bienvenus\u00A0?',
          'Oui. Nous avons deux chaises hautes, et la cuisine prépare une demi-portion de la plupart des plats. Il n’y a pas de menu enfant séparé.',
        ],
        [
          'Le restaurant est-il accessible en fauteuil roulant\u00A0?',
          'La salle est de plain-pied, avec une marche de six centimètres à l’entrée et une rampe que nous installons à votre arrivée. Les toilettes sont au sous-sol et ne sont pas adaptées, ce que nous regrettons.',
        ],
        [
          'Puis-je venir avec mon chien\u00A0?',
          'Un petit chien tranquille est bienvenu au comptoir et aux tables près de la fenêtre.',
        ],
      ],
      cta: {
        title: 'Réserver une table',
        text: 'Du mardi au samedi, de 10\u00A0h à 18\u00A0h par téléphone. Nous répondons aux e-mails le jour même.',
      },
    },
    privateDining: {
      intro: [
        'Au-dessus de la salle se trouve l’ancien salon de la maison de négoce, où ses dessinateurs composaient les motifs destinés aux métiers à tisser. Il accueille quatorze convives autour d’une seule table de chêne, a ses propres fenêtres sur la rue Burdeau et une porte qui ferme, et il est servi depuis la même cuisine que le restaurant.',
        'Nous préparons chaque repas du salon avec vous. Indiquez-nous la date, le nombre de convives et l’occasion\u00A0: Élise vous proposera un menu à partir des produits de la semaine quinze jours avant, et Karim fera de même pour le vin.',
      ],
      menusTitle: 'Les menus du salon',
      tiers: [
        {
          name: 'Déjeuner',
          price: '48\u00A0€',
          interval: 'par convive, du mardi au samedi',
          features: [
            'Trois plats et le café',
            'Pour huit à quatorze convives',
            'Le salon est à vous de 12\u00A0h à 15\u00A0h\u00A030',
          ],
        },
        {
          name: 'Dîner',
          price: '72\u00A0€',
          interval: 'par convive, du mardi au samedi',
          features: [
            'Cinq plats, avec le fromage',
            'Pour huit à quatorze convives',
            'Le salon est à vous de 19\u00A0h\u00A030 à minuit',
          ],
          highlighted: true,
        },
        {
          name: 'Vins',
          price: '38\u00A0€',
          interval: 'par convive, avec le dîner',
          features: [
            'Un verre avec chaque plat',
            'Ou des bouteilles de la carte, choisies avec vous',
            'Softs et café compris',
          ],
        },
      ],
      testimonial: {
        quote:
          'Nous avons fêté les soixante-dix ans de mon père à l’étage, douze convives et un gâteau de sa boulangerie préférée. Karim a déniché une bouteille de l’année de sa naissance, et personne ne le lui a dit avant le fromage.',
        name: 'Camille Roux',
        role: 'Dîner pour douze, mars 2026',
      },
      faqTitle: 'Avant de réserver le salon',
      faq: [
        [
          'Y a-t-il un nombre minimum de convives\u00A0?',
          'Huit convives au déjeuner et dix au dîner, le vendredi et le samedi. Les groupes plus petits sont les bienvenus en salle.',
        ],
        [
          'Comment confirmer la réservation\u00A0?',
          'Par un acompte de 20\u00A0€ par convive, par virement ou par carte, dans la semaine qui suit notre proposition. Il est déduit de l’addition le soir même.',
        ],
        [
          'Pouvons-nous apporter notre gâteau ou notre décoration\u00A0?',
          'Un gâteau, oui, sans supplément pour le servir. Fleurs et marque-places sont les bienvenus\u00A0; nous demandons seulement que rien ne soit fixé aux murs.',
        ],
        [
          'Le salon de l’étage est-il accessible\u00A0?',
          'On y monte par un escalier de dix-huit marches, et il n’y a pas d’ascenseur. Pour un convive qui ne peut pas monter, nous pouvons dresser une longue table en salle au déjeuner.',
        ],
      ],
      cta: {
        title: 'Préparer un repas à l’étage',
        text: 'Écrivez-nous avec la date, le nombre de convives et l’occasion. Nous répondons sous deux jours ouvrés avec une proposition.',
      },
    },
    visit: {
      hoursTitle: 'Horaires d’ouverture',
      extraHours: [
        { title: 'Le comptoir', text: 'Au dîner, pour ceux qui n’ont pas réservé' },
        { title: 'Téléphone', text: '04\u00A078\u00A028\u00A016\u00A042', href: phoneHref },
        {
          title: 'Réservations par téléphone',
          text: 'Du mardi au samedi, de 10\u00A0h à 18\u00A0h',
        },
      ],
      accessTitle: 'Nous trouver',
      access: [
        { title: 'Adresse', text: '8 rue Burdeau, 69001 Lyon', href: mapHref },
        { title: 'La porte', text: 'Sous l’arche de pierre, à côté du relieur' },
        {
          title: 'Métro',
          text: 'Ligne C jusqu’à Croix-Paquet, puis quatre minutes à pied en remontant la rue Burdeau',
        },
        { title: 'Bus', text: 'Lignes S6 et 2 jusqu’à Burdeau, à une minute' },
        {
          title: 'Voiture',
          text: 'Il n’y a pas de stationnement sur les pentes. Le parking des Terreaux est à dix minutes à pied et ferme à 1\u00A0h.',
        },
        {
          title: 'Vélo',
          text: 'Une station Vélo’v place Sathonay, et deux arceaux de l’autre côté de la rue',
        },
      ],
      note: 'Les pentes sont raides, et la rue Burdeau est par endroits une rue d’escaliers. Depuis les Terreaux, le chemin le plus doux passe par la rue Sainte-Catherine puis la rue Burdeau, plutôt que par les escaliers du passage Mermet.',
      streetCaption: 'La rue Burdeau, sur les pentes de la Croix-Rousse.',
    },
    legal: [
      `Ce site est édité par ${name} SAS, 8 rue Burdeau, 69001 Lyon, France, immatriculée au registre du commerce et des sociétés de Lyon sous le numéro 821\u00A0405\u00A0617, TVA FR 34 821405617. Directeur de la publication\u00A0: Karim Benali.`,
      '## Vos données de réservation',
      `Quand vous réservez, nous conservons votre nom, votre numéro de téléphone, la taille de votre groupe et ce que vous nous dites de vos allergies, dans le seul but de vous placer. Nous supprimons ces informations trois mois après votre venue, et nous n’envoyons jamais d’e-mails promotionnels. Écrivez à [${email('hello')}](mailto:${email('hello')}) pour consulter ou faire effacer ce que nous détenons.`,
      '## Cookies',
      'Ce site ne dépose aucun cookie publicitaire ni de suivi. Si vous choisissez une apparence claire ou sombre, ce choix reste dans votre navigateur et nulle part ailleurs.',
      '## Photographies',
      `Les photographies de ce site sont publiées sous licence libre ou dans le domaine public\u00A0; chacune est créditée sur la page [crédits photographiques](${href('credits')}).`,
    ],
    credits: {
      intro: [
        'Les photographies de ce site viennent de Wikimedia Commons et sont publiées sous licence libre ou dans le domaine public. Nous remercions leurs auteurs. Elles ont été recadrées et redimensionnées pour le web.',
      ],
      sourceWord: 'source',
    },
  }),
  menus: {
    header: [
      { label: 'La carte', page: 'menu' },
      { label: 'Notre histoire', page: 'story' },
      { label: 'Salon privé', page: 'privateDining' },
      { label: 'Horaires et accès', page: 'visit' },
    ],
    footer: [
      { label: 'La carte', page: 'menu' },
      { label: 'Réservations', page: 'reservations' },
      { label: 'Salon privé', page: 'privateDining' },
      { label: 'Notre histoire', page: 'story' },
      { label: 'Horaires et accès', page: 'visit' },
      { label: 'Mentions légales', page: 'legal' },
      { label: 'Crédits photographiques', page: 'credits' },
    ],
    action: { label: 'Réserver', page: 'reservations' },
  },
  settings: {
    tagline: 'Une cuisine de saison sur les pentes de la Croix-Rousse.',
    footerNote:
      '8 rue Burdeau\n69001 Lyon\n04\u00A078\u00A028\u00A016\u00A042\n\nDéjeuner le jeudi et le vendredi, de 12\u00A0h à 13\u00A0h\u00A045.\nDîner du mardi au samedi, de 19\u00A0h\u00A030 à 21\u00A0h\u00A045.',
  },
  widgets: {
    reservations: {
      title: 'Réservations',
      heading: 'Réserver une table',
      body: 'Chaque table est réservée par l’un de nous, par téléphone ou par e-mail, jusqu’à huit semaines à l’avance\u00A0: nous pouvons ainsi vous demander, au passage, s’il y a une allergie ou un anniversaire à prévoir.',
      label: 'Comment réserver',
    },
    goodToKnow: {
      title: 'Bon à savoir',
      hours: [
        {
          label: 'Fermé',
          value: 'Dimanche et lundi, trois semaines en août et la semaine de Noël',
        },
        {
          label: 'Le comptoir',
          value: 'Six places au dîner, gardées pour ceux qui n’ont pas réservé',
        },
        {
          label: 'Réservations',
          value: 'Par téléphone, du mardi au samedi, de 10\u00A0h à 18\u00A0h',
        },
      ],
    },
    privateDining: {
      title: 'Salon privé',
      heading: 'Le salon de l’étage, quatorze couverts',
      body: 'Un déjeuner ou un dîner autour d’une seule table de chêne, avec un menu écrit pour l’occasion et des vins choisis avec vous.',
      label: 'Préparer un repas à l’étage',
    },
  },
}
