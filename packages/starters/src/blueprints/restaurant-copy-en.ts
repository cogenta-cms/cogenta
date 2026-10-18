import type { RestaurantCopy } from './restaurant-copy.js'

/**
 * The English restaurant: a bistro in the former offices of a silk merchant on
 * the slopes of the Croix-Rousse, in Lyon. Prices are in euros and include
 * service; the telephone number is printed the way a visitor from abroad
 * dials it.
 */

const MACON = 'Mâcon-Villages, 2023'
const SAINT_JOSEPH = 'Saint-Joseph blanc, 2022'
const MORGON = 'Morgon Côte du Py, 2022'
const CROZES = 'Crozes-Hermitage, 2021'
const MUSCAT = 'Muscat de Beaumes-de-Venise, 2020'

export const RESTAURANT_COPY_EN: RestaurantCopy = {
  locale: 'en',
  schema: {
    dishLabels: { singular: 'Dish', plural: 'Menu' },
    dishRoute: '/menu/:slug',
  },
  pageSlugs: {
    home: 'home',
    menu: 'menu',
    story: 'our-story',
    reservations: 'reservations',
    privateDining: 'private-dining',
    visit: 'visit',
    legal: 'legal',
    credits: 'photo-credits',
  },
  sections: ['Starters', 'Mains', 'Cheese and desserts', 'Wine by the glass'],
  moreTitles: ['The other starters', 'The other mains', 'Cheese and desserts', 'Wine by the glass'],
  address: '8 rue Burdeau, 69001 Lyon',
  phoneDisplay: '+33 4 78 28 16 42',
  dishes: [
    {
      id: 'beetroot-carpaccio',
      slug: 'beetroot-carpaccio',
      name: 'Beetroot carpaccio, warm goat’s cheese',
      section: 0,
      price: 12,
      vegetarian: true,
      description:
        'Crapaudine beetroot baked in salt and sliced thin, three rounds of fresh goat’s cheese grilled with honey, aged vinegar and walnut oil.',
      sourcing: 'Beetroot from the Morel farm in Vourles, goat’s cheese from a dairy near Condrieu',
      pairing: MACON,
      allergens: 'Milk, walnuts, sulphites',
      note: 'Crapaudine is an old variety with a rough, dark skin like bark. Baked slowly in a crust of salt it keeps all of its sweetness, and it is sliced to order so the slices never dry. The goat’s cheese is grilled until the honey on top turns to caramel.',
      photoAlt:
        'Thin slices of dark beetroot on a hammered metal plate, with three rounds of grilled goat’s cheese and a thread of aged vinegar',
    },
    {
      id: 'pumpkin-soup',
      slug: 'pumpkin-chestnut-soup',
      name: 'Pumpkin and chestnut soup, aged Comté',
      section: 0,
      price: 10,
      vegetarian: true,
      description:
        'Potimarron roasted until it caramelises, simmered with chestnuts and a little cream, and finished with Comté aged for twenty-four months and black pepper.',
      sourcing: 'Squash from the Morel farm in Vourles, chestnuts from the Ardèche',
      allergens: 'Milk, celery',
      note: 'The squash is roasted with its skin on, which gives the soup its colour and a hint of hazelnut. Chestnuts arrive fresh from an Ardèche grower in October, when the soup is at its best, and vacuum-packed for the rest of the winter. The Comté is grated at the pass, just before the bowl leaves.',
      photoAlt:
        'A dark bowl of orange pumpkin soup under a drift of grated Comté and black pepper, with a spoon beside it',
    },
    {
      id: 'grilled-octopus',
      slug: 'grilled-octopus',
      name: 'Grilled octopus, saffron and orange',
      section: 0,
      price: 17,
      vegetarian: false,
      description:
        'Octopus braised for two hours, then grilled over vine cuttings, with an emulsion of saffron, orange and olive oil and a handful of pea shoots.',
      sourcing: 'Day boats at Saint-Gilles-Croix-de-Vie, delivered overnight',
      pairing: SAINT_JOSEPH,
      allergens: 'Molluscs, egg',
      note: 'We buy whole octopus of around two kilos and cook it the day it arrives. The vine cuttings come from a grower in Beaujolais who prunes in February and keeps a trailer of them for us.',
      photoAlt:
        'Grilled octopus tentacles on a pool of saffron and orange sauce, under a handful of pea shoots',
    },
    {
      id: 'pate-en-croute',
      slug: 'pate-en-croute',
      name: 'Pâté en croûte, pickled girolles',
      section: 0,
      price: 15,
      vegetarian: false,
      description:
        'Pork, duck and pistachio in a hot-water crust, made on Monday for the week, with girolles pickled in cider vinegar.',
      sourcing: 'Pork from the Monts du Lyonnais, duck from the Dombes',
      pairing: MORGON,
      allergens: 'Gluten, egg, pistachio, sulphites',
      note: 'One pâté makes eighteen slices and we make two each Monday. When they are gone, the dish comes off the menu until the following week.',
    },
    {
      id: 'leeks-vinaigrette',
      slug: 'leeks-vinaigrette',
      name: 'Leeks vinaigrette, soft egg and hazelnuts',
      section: 0,
      price: 11,
      vegetarian: true,
      description:
        'Young leeks poached until tender, a sharp mustard vinaigrette, a soft-boiled egg from the farm and toasted hazelnuts.',
      sourcing: 'Leeks and eggs from the Morel farm in Vourles',
      allergens: 'Egg, mustard, hazelnuts',
      note: 'A bistro dish we have served since the first week. The leeks are pulled when they are no thicker than a thumb, and dressed while they are still warm so they take the vinaigrette.',
    },
    {
      id: 'cod-vin-jaune',
      slug: 'cod-vin-jaune',
      name: 'Cod, vin jaune sauce, endive and crisp Comté',
      section: 1,
      price: 28,
      vegetarian: false,
      description:
        'A thick piece of cod pan-fried on its skin, a light cream sauce made with vin jaune from the Jura, braised endive and a tile of baked Comté.',
      sourcing: 'Day boats at Saint-Gilles-Croix-de-Vie, vin jaune from a grower in Arbois',
      pairing: SAINT_JOSEPH,
      allergens: 'Fish, milk, sulphites',
      note: 'Vin jaune is a wine of the Jura kept under a veil of yeast for six years and more, and its taste of walnut and curry leaf is what the sauce is built on. We reduce it with shallots and cream, then whisk in butter at the last moment so it stays light. The Comté tile is baked in the morning from the ends of the wheels.',
      photoAlt:
        'A golden fillet of cod in a pale vin jaune sauce, scattered with chives and tiles of crisp Comté, on a white plate',
    },
    {
      id: 'duck-confit',
      slug: 'duck-leg-confit',
      name: 'Duck leg confit, Brussels sprouts and celeriac',
      section: 1,
      price: 26,
      vegetarian: false,
      description:
        'Duck leg cured overnight and cooked slowly in its own fat, crisped to order, with Brussels sprouts roasted in the pan and a purée of celeriac.',
      sourcing: 'Ducks raised in the Dombes, forty minutes north of Lyon',
      pairing: CROZES,
      allergens: 'Milk, celery, sulphites',
      note: 'The legs are cured with salt, thyme and crushed juniper for a night, then cooked for three hours in their own fat. They are crisped skin-down in a hot pan only when the order arrives. The sprouts are halved and left to blacken a little, which is how we like them.',
      photoAlt:
        'A crisp duck leg on a bed of celeriac purée, with roasted Brussels sprouts and chopped parsley on a white plate',
    },
    {
      id: 'mushroom-risotto',
      slug: 'wild-mushroom-risotto',
      name: 'Wild mushroom risotto, aged Comté',
      section: 1,
      price: 24,
      vegetarian: true,
      description:
        'Carnaroli rice cooked in a stock of roasted mushroom trimmings, topped with pan-fried wild mushrooms, thyme and Comté aged for twenty-four months.',
      sourcing:
        'Mushrooms picked in the Monts du Forez, Comté from an affineur on the Croix-Rousse market',
      pairing: MACON,
      allergens: 'Milk, celery, sulphites',
      note: 'The mushrooms come from a picker who drives down from the Forez on Tuesdays and Fridays, and the mix changes with the woods: ceps, hedgehog mushrooms, black trumpets. When the weather has been dry there are none, and the risotto is made with roasted squash instead.',
      photoAlt:
        'A grey bowl of creamy risotto topped with browned wild mushrooms and a sprig of thyme, seen from above',
    },
    {
      id: 'pork-chop',
      slug: 'pork-chop-cider',
      name: 'Pork chop, cider and apples',
      section: 1,
      price: 29,
      vegetarian: false,
      description:
        'A thick chop from the Monts du Lyonnais roasted on the bone, apples cooked in cider and a spoonful of the pan juices.',
      sourcing: 'Pork from a farm in the Monts du Lyonnais',
      pairing: MORGON,
      allergens: 'Milk, sulphites',
      note: 'The pigs are a cross of Large White and Duroc, raised outdoors and slaughtered at ten months. The chop rests for as long as it cooked before it is carved.',
    },
    {
      id: 'pike-quenelle',
      slug: 'pike-quenelle',
      name: 'Pike quenelle, crayfish sauce',
      section: 1,
      price: 25,
      vegetarian: false,
      description:
        'The Lyon classic, made light: pike and choux pastry poached, then baked in a sauce of crayfish shells, cream and a little Cognac, with a bowl of rice.',
      sourcing: 'Pike from the lakes of the Dombes, crayfish from Savoie',
      pairing: MACON,
      allergens: 'Fish, crustaceans, gluten, egg, milk',
      note: 'A quenelle rises like a soufflé in the oven and falls a little on the way to the table, which is how you know it was made that evening. Allow twenty minutes. In Lyon it is served with plain rice, to take up the sauce.',
      photoAlt:
        'A pike quenelle baked golden in a black cast-iron dish of crayfish sauce, with a small bowl of rice beside it',
    },
    {
      id: 'saint-marcellin',
      slug: 'saint-marcellin',
      name: 'Saint-Marcellin, walnut bread',
      section: 2,
      price: 9,
      vegetarian: false,
      description:
        'A soft cow’s milk cheese from the Isère, ripened until it runs, with walnut bread from the bakery on rue d’Austerlitz.',
      sourcing: 'An affineur on the Croix-Rousse market',
      allergens: 'Milk, gluten, walnuts',
      note: 'Saint-Marcellin is served in its small earthenware dish, at room temperature. Ask for it runny or firm and the affineur’s shelf will usually have both.',
    },
    {
      id: 'chocolate-tart',
      slug: 'dark-chocolate-tart',
      name: 'Dark chocolate tart, sea salt',
      section: 2,
      price: 10,
      vegetarian: true,
      description:
        'A ganache of seventy per cent chocolate set in a sablé crust and finished with flakes of salt from Guérande.',
      sourcing: 'Chocolate from a maker in the Drôme',
      pairing: MUSCAT,
      allergens: 'Milk, gluten, egg, soya',
      note: 'The crust is baked blind in the afternoon and the ganache poured an hour before service, so the tart is set but never cold from the refrigerator.',
      photoAlt:
        'Round dark chocolate tarts in a sablé crust, each topped with a pinch of flaked sea salt, on a white plate',
    },
    {
      id: 'poached-pear',
      slug: 'poached-pear-blackcurrant',
      name: 'Pear poached in blackcurrant, crème fraîche',
      section: 2,
      price: 10,
      vegetarian: true,
      description:
        'A Williams pear poached in blackcurrant syrup with a few black currants, served cold in its syrup with a spoonful of crème fraîche on the side.',
      sourcing: 'Pears from an orchard in the Monts du Lyonnais, blackcurrants from Burgundy',
      pairing: MUSCAT,
      allergens: 'Milk, sulphites',
      note: 'The pears are poached two days ahead and left in the syrup, which turns them deep red all the way to the core. We slice them at the table so none of the syrup is lost.',
      photoAlt: 'Slices of pear poached deep red in a white bowl, with black currants in the syrup',
    },
    {
      id: 'praline-cake',
      slug: 'apple-praline-cake',
      name: 'Apple and pink praline cake',
      section: 2,
      price: 9,
      vegetarian: true,
      description:
        'A moist cake of apples and crushed pink pralines, glazed with caramel and dusted with icing sugar, in the manner of the pastry shops of Lyon.',
      sourcing: 'Pralines from a confectioner in the Presqu’île, apples from the Monts du Lyonnais',
      allergens: 'Gluten, egg, milk, almonds, hazelnuts',
      note: 'Pink pralines are almonds coated in red sugar, a Lyon habit since the nineteenth century. We crush them by hand, a little coarsely, so some of them are still crunchy inside the cake. A slice is small and very sweet, and goes well with a coffee.',
      photoAlt:
        'A slice of glazed apple and praline cake dusted with sugar, with drops of caramel on a white plate',
    },
    {
      id: 'macon-villages',
      slug: 'macon-villages-2023',
      name: MACON,
      section: 3,
      price: 8,
      vegetarian: false,
      description:
        'Chardonnay from old vines above Lugny, fermented in steel tanks. Bright and a little salty.',
      sourcing: 'A family estate in the Mâconnais, farmed organically since 2011',
      note: 'We pour this with the risotto, the quenelle and the beetroot. It is the wine we open most often at lunch.',
    },
    {
      id: 'saint-joseph-blanc',
      slug: 'saint-joseph-blanc-2022',
      name: SAINT_JOSEPH,
      section: 3,
      price: 12,
      vegetarian: false,
      description:
        'Marsanne and roussanne from granite terraces on the right bank of the Rhône. Round, with apricot and almond.',
      sourcing: 'A grower in Tournon-sur-Rhône with four hectares of terraces',
      note: 'Rich enough for the cod and the octopus, and served a little warmer than most white wines so the fruit comes through.',
    },
    {
      id: 'morgon',
      slug: 'morgon-cote-du-py-2022',
      name: MORGON,
      section: 3,
      price: 10,
      vegetarian: false,
      description:
        'Gamay from the hill of Py, fermented in whole bunches and bottled without filtering. Dark cherry and a stony finish.',
      sourcing: 'A grower in Villié-Morgon we have bought from since we opened',
      note: 'Served slightly cool, at about fourteen degrees. It is the wine we drink with the pâté en croûte and the pork.',
    },
    {
      id: 'crozes-hermitage',
      slug: 'crozes-hermitage-2021',
      name: CROZES,
      section: 3,
      price: 11,
      vegetarian: false,
      description:
        'Syrah from the northern Rhône, aged fifteen months in old barrels. Black olive, pepper and violets.',
      sourcing: 'A cooperative of eleven growers in Tain-l’Hermitage',
      note: 'A cooler vintage than most, with fine tannins and a long, peppery finish. We decant a bottle at the start of each service, and it drinks best with the duck.',
    },
    {
      id: 'muscat',
      slug: 'muscat-beaumes-de-venise-2020',
      name: MUSCAT,
      section: 3,
      price: 9,
      vegetarian: false,
      description:
        'A sweet white from the southern Rhône, served cold in a glass of eight centilitres. Orange peel and honey.',
      sourcing: 'A domaine at the foot of the Dentelles de Montmirail',
      note: 'The one sweet wine we pour by the glass, kept for the poached pear and the chocolate tart. A half bottle is on the list for a table that wants more than a glass.',
    },
  ],
  media: {
    hero: 'The dining room, with green panelled bookcases full of old ledgers, tables laid with grey cloths and armchairs upholstered in red stripes',
    street:
      'Rue Burdeau in the evening sun, a street of tall apartment buildings with bicycles parked along the pavement',
    market: 'Red apples, oranges and lemons piled on a stall of the Croix-Rousse market',
  },
  pages: ({ name, email, href, phoneHref, mapHref }) => ({
    titles: {
      home: 'Home',
      menu: 'Menu',
      story: 'Our story',
      reservations: 'Reservations',
      privateDining: 'Private dining',
      visit: 'Hours and address',
      legal: 'Legal notice and privacy',
      credits: 'Photo credits',
    },
    hours: [
      { title: 'Lunch', text: 'Thursday and Friday, 12:00 to 13:45' },
      { title: 'Dinner', text: 'Tuesday to Saturday, 19:30 to 21:45' },
      { title: 'Closed', text: 'Sunday and Monday, three weeks in August and Christmas week' },
    ],
    labels: { address: 'Address', telephone: 'Telephone' },
    actions: {
      call: 'Call +33 4 78 28 16 42',
      write: 'Write to us',
      tableSubject: 'Table request',
      eventsSubject: 'Private dining enquiry',
    },
    home: {
      heroEyebrow: 'Restaurant and wine bar, Lyon',
      heroSubtitle:
        'Seasonal cooking in the former offices of a silk merchant on the slopes of the Croix-Rousse. Lunch on Thursday and Friday, dinner from Tuesday to Saturday.',
      heroAction: 'Reserve a table',
      welcome:
        'We cook what a handful of farms, boats and growers send us each week, and write a new menu every Tuesday. Thirty-eight seats between the bookcases, and six at the counter for anyone who walks in.',
      menuTitle: 'This week’s menu',
      kitchen: [
        '## The kitchen',
        `${name} opened in 2016 in the old offices of a silk merchant on rue Burdeau, in a long room of green panelling and bookcases that the family who owned the house had left untouched. Élise Marchand runs the kitchen with three cooks; Karim Benali looks after the room and the wine.`,
        'Almost everything we cook comes from within a hundred kilometres of the door: vegetables from a farm in Vourles, ducks and pike from the Dombes, pork from the Monts du Lyonnais, cheese from the market at the top of the hill. The fish is the exception, and it comes overnight from the day boats of the Vendée coast.',
        `[Read about the kitchen and the people we buy from](${href('story')})`,
      ],
      press: {
        text: 'Élise Marchand cooks the way the room looks: there is nothing on the plate that is there for show, and nothing missing either.',
        author: 'Hélène Vasseur',
        role: 'Tablées, autumn guide 2026',
      },
      hoursTitle: 'Hours and address',
      privateCta: {
        title: 'The room upstairs, for fourteen at one table',
        text: 'Lunch or dinner for a birthday, a wedding party or a team, with a menu written for the occasion and wines chosen with you.',
        action: 'Private dining',
      },
      bookCta: {
        title: 'Book a table',
        text: 'Call us from Tuesday to Saturday between 10:00 and 18:00, or write to us and we will reply the same day.',
      },
    },
    menu: {
      intro:
        'The menu changes every Tuesday, following what the farms and boats send us, and a dish comes off it when we run out. Everything is cooked to order. Prices are in euros and include service; wine by the glass is poured at twelve centilitres unless the list says otherwise.',
      setsTitle: 'Set menus',
      tiers: [
        {
          name: 'Lunch',
          price: '€29',
          interval: 'two courses, Thursday and Friday',
          features: [
            'A starter and a main, or a main and a dessert',
            'Three courses for €36',
            'A glass of the white or red of the week for €7',
          ],
        },
        {
          name: 'The evening menu',
          price: '€62',
          interval: 'five courses, for the whole table',
          features: [
            'Two starters, a main, cheese and a dessert',
            'Five glasses chosen by Karim for €38',
            'Served until 20:30',
          ],
          highlighted: true,
        },
        {
          name: 'À la carte',
          price: '€9 to €29',
          interval: 'a dish, at lunch and dinner',
          features: [
            'Every dish on this page',
            'Half portions for children',
            'Bread and butter included',
          ],
        },
      ],
      listTitle: 'This week’s menu',
      notesTitle: 'Allergies and dietary requirements',
      notes: [
        [
          'Allergies',
          'Each dish lists the fourteen regulated allergens it contains. Tell us about an allergy when you book and again at the table, and the kitchen will say plainly what it can and cannot change. Our kitchen handles nuts, gluten and shellfish every day, so we cannot promise that a dish is free of traces.',
        ],
        [
          'Vegetarian guests',
          'Dishes marked vegetarian contain no meat or fish. Some of our cheeses are made with animal rennet, so ask and we will tell you which. There is always a vegetarian main, and we can cook the evening menu without meat or fish if you tell us when you book.',
        ],
        [
          'Vegan guests',
          'Write to us before you come and we will plan a meal for you. On a busy evening without notice, the kitchen can make two courses at most.',
        ],
      ],
    },
    story: {
      intro: [
        `${name} opened in the autumn of 2016 in the former offices of a silk merchant on rue Burdeau. The house went up in 1832 for a firm that sold lengths of cloth to Paris and Milan. Its accounts were kept in the long room on the ground floor, behind green panelling and shelves that still hold its ledgers. We kept the room as it was, laid the tables where the clerks’ desks stood and put the kitchen in the warehouse at the back.`,
        '## The kitchen',
        'Élise Marchand grew up in Villefranche-sur-Saône and cooked for eight years in Paris and Copenhagen before coming home to open the restaurant. She writes the menu on Monday afternoon, once the farms have told her what they will send, and cooks every service with three cooks and a pastry chef who works mornings.',
        'The cooking is plain on purpose. A dish has three or four things on the plate, each of them chosen for the week it is in season, and the sauces are made from the bones and trimmings of what we buy whole.',
        '## The room and the wine',
        'Karim Benali runs the room. He trained as a sommelier in Beaune and has built a list of about two hundred wines, almost all from growers in Beaujolais, the Mâconnais and the northern Rhône, most of whom he has visited. Six are poured by the glass and change with the menu.',
      ],
      roomCaption:
        'The dining room on rue Burdeau, set for dinner between the bookcases of the silk merchant’s old office.',
      figuresTitle: 'The house in numbers',
      figures: [
        { value: '38', label: 'seats in the room, and six at the counter' },
        { value: '14', label: 'guests at one table in the room upstairs' },
        { value: '11', label: 'farms, boats and growers we buy from each week' },
        { value: '100', unit: 'km', label: 'from the door to almost everything we cook' },
      ],
      suppliersTitle: 'Who we buy from',
      suppliers: [
        {
          title: 'Vegetables and eggs',
          text: 'The Morel family farm in Vourles, twenty minutes south-west of Lyon, delivers on Tuesday and Friday mornings.',
        },
        {
          title: 'Duck and pike',
          text: 'Two farms and a fishery in the Dombes, the plateau of ponds north of the city.',
        },
        {
          title: 'Pork and pears',
          text: 'A farm and an orchard in the Monts du Lyonnais, where the pigs are raised outdoors.',
        },
        {
          title: 'Fish and shellfish',
          text: 'Day boats at Saint-Gilles-Croix-de-Vie, through a merchant who sends the catch overnight.',
        },
        {
          title: 'Cheese',
          text: 'An affineur on the Croix-Rousse market, two hundred metres up the hill.',
        },
        {
          title: 'Bread',
          text: 'A sourdough bakery on rue d’Austerlitz, collected by one of the cooks every morning at seven.',
        },
      ],
      marketCaption: 'A stall of the Croix-Rousse market, two hundred metres up the hill.',
    },
    reservations: {
      intro: [
        'We take bookings by telephone and by email, for up to eight weeks ahead. There is no online booking: every table is booked by one of us, so we can ask about allergies, a pram or a birthday while we do it.',
        '## By telephone',
        `Call [+33 4 78 28 16 42](${phoneHref}) from Tuesday to Saturday between 10:00 and 18:00. During service the phone is answered when someone is free, so the afternoon is the best time to reach us.`,
        '## By email',
        `Write to [${email('table')}](mailto:${email('table')}) with the date, the time, the number of guests and a telephone number. We reply the same day, and a table is only booked once you have our reply.`,
        '## Without a booking',
        'The six seats at the counter are kept for guests who walk in at dinner, and the full menu is served there. On Friday and Saturday they are usually taken by 20:00.',
      ],
      summaryTitle: 'Booking at a glance',
      summary: [
        {
          title: 'Tables',
          text: 'For two to six guests. For seven to fourteen, see private dining.',
          href: href('privateDining'),
        },
        { title: 'Booking ahead', text: 'Up to eight weeks, by telephone or by email' },
        { title: 'Deposits', text: 'None for up to six guests. €20 a guest for eight or more.' },
        {
          title: 'Cancelling',
          text: 'Please tell us 24 hours ahead, so we can give the table to someone else',
        },
      ],
      faqTitle: 'Before you come',
      faq: [
        [
          'What happens if we are running late?',
          'We keep a table for fifteen minutes. Call us if you will be later than that and we will do what we can, although on a full evening we may have to shorten the meal.',
        ],
        [
          'How do I cancel?',
          'Call us or reply to the email that confirmed your table, at least 24 hours before. For eight guests or more the deposit is returned in full if you cancel 72 hours ahead.',
        ],
        [
          'Do you welcome children?',
          'Yes. We have two high chairs, and the kitchen makes a half portion of most dishes. There is no separate children’s menu.',
        ],
        [
          'Is the restaurant accessible by wheelchair?',
          'The room is on the ground floor, with a step of six centimetres at the door and a ramp we put down when you arrive. The toilets are downstairs and are not adapted, which we are sorry about.',
        ],
        [
          'Can I bring a dog?',
          'A small, quiet dog is welcome at the counter and at the tables by the window.',
        ],
      ],
      cta: {
        title: 'Book a table',
        text: 'Tuesday to Saturday, 10:00 to 18:00 by telephone. Emails are answered the same day.',
      },
    },
    privateDining: {
      intro: [
        'Above the dining room is the old drawing room of the firm, where its designers drew the patterns for the looms. It seats fourteen at one oak table, has its own windows over rue Burdeau and a door that closes, and is served from the same kitchen as the restaurant.',
        'We plan every meal upstairs with you. Tell us the date, the number of guests and what the occasion is, and Élise will suggest a menu from the week’s produce a fortnight before; Karim will do the same with the wine.',
      ],
      menusTitle: 'Menus for the room upstairs',
      tiers: [
        {
          name: 'Lunch',
          price: '€48',
          interval: 'a guest, Tuesday to Saturday',
          features: [
            'Three courses and coffee',
            'For eight to fourteen guests',
            'The room is yours from 12:00 to 15:30',
          ],
        },
        {
          name: 'Dinner',
          price: '€72',
          interval: 'a guest, Tuesday to Saturday',
          features: [
            'Five courses, with cheese',
            'For eight to fourteen guests',
            'The room is yours from 19:30 to midnight',
          ],
          highlighted: true,
        },
        {
          name: 'Wine',
          price: '€38',
          interval: 'a guest, with dinner',
          features: [
            'A glass with each course',
            'Or bottles from the list, chosen with you',
            'Soft drinks and coffee included',
          ],
        },
      ],
      testimonial: {
        quote:
          'We had my father’s seventieth birthday upstairs, twelve of us and a cake from his favourite bakery. Karim found a bottle from the year he was born and nobody told him until the cheese.',
        name: 'Camille Roux',
        role: 'Dinner for twelve, March 2026',
      },
      faqTitle: 'Before you book the room',
      faq: [
        [
          'Is there a minimum number of guests?',
          'Eight guests for lunch and ten for dinner on Friday and Saturday. Smaller parties are welcome in the dining room.',
        ],
        [
          'How do we confirm the booking?',
          'With a deposit of €20 a guest, by bank transfer or card, within a week of our proposal. It is taken off the bill on the evening.',
        ],
        [
          'Can we bring our own cake or decorations?',
          'A cake, yes, with no charge for serving it. Flowers and place cards are welcome; we ask that nothing is fixed to the walls.',
        ],
        [
          'Is the room upstairs accessible?',
          'It is up a flight of eighteen stairs, and there is no lift. For a guest who cannot manage the stairs, we can set a long table in the dining room at lunch.',
        ],
      ],
      cta: {
        title: 'Plan a meal upstairs',
        text: 'Write with the date, the number of guests and the occasion. We reply within two working days with a proposal.',
      },
    },
    visit: {
      hoursTitle: 'Opening hours',
      extraHours: [
        { title: 'The counter', text: 'At dinner, for guests without a booking' },
        { title: 'Telephone', text: '+33 4 78 28 16 42', href: phoneHref },
        { title: 'Bookings by telephone', text: 'Tuesday to Saturday, 10:00 to 18:00' },
      ],
      accessTitle: 'Finding us',
      access: [
        { title: 'Address', text: '8 rue Burdeau, 69001 Lyon', href: mapHref },
        { title: 'The door', text: 'Under the stone arch, next to the bookbinder' },
        {
          title: 'Metro',
          text: 'Line C to Croix-Paquet, then four minutes on foot up rue Burdeau',
        },
        { title: 'Bus', text: 'Lines S6 and 2 to Burdeau, a minute away' },
        {
          title: 'Car',
          text: 'There is no parking on the slopes. The Terreaux car park is a ten-minute walk and closes at 01:00.',
        },
        {
          title: 'Bicycle',
          text: 'A Vélo’v station on place Sathonay, and two racks across the street',
        },
      ],
      note: 'The Pentes are steep, and rue Burdeau is a street of stairs in places. From the Terreaux, the gentlest way up is along rue Sainte-Catherine and rue Burdeau, rather than the stairs of the passage Mermet.',
      streetCaption: 'Rue Burdeau, on the slopes of the Croix-Rousse.',
    },
    legal: [
      `This site is published by ${name} SAS, 8 rue Burdeau, 69001 Lyon, France, registered with the Lyon trade and companies register under number 821 405 617, VAT FR 34 821405617. Publication director: Karim Benali.`,
      '## Your booking details',
      `When you book, we keep your name, telephone number, the size of your party and anything you tell us about allergies, for the sole purpose of seating you. We delete booking details three months after your visit, and we never send marketing emails. Write to [${email('hello')}](mailto:${email('hello')}) to see or remove what we hold.`,
      '## Cookies',
      'This site sets no advertising or tracking cookies. If you choose a light or dark appearance, that choice is kept in your own browser and nowhere else.',
      '## Photographs',
      `The photographs on this site are published under open licences or are in the public domain, and each one is credited on the [photo credits page](${href('credits')}).`,
    ],
    credits: {
      intro: [
        'The photographs on this site come from Wikimedia Commons and are published under open licences or in the public domain. We thank their authors. They have been cropped and resized for the web.',
      ],
      sourceWord: 'source',
    },
  }),
  menus: {
    header: [
      { label: 'Menu', page: 'menu' },
      { label: 'Our story', page: 'story' },
      { label: 'Private dining', page: 'privateDining' },
      { label: 'Hours and address', page: 'visit' },
    ],
    footer: [
      { label: 'Menu', page: 'menu' },
      { label: 'Reservations', page: 'reservations' },
      { label: 'Private dining', page: 'privateDining' },
      { label: 'Our story', page: 'story' },
      { label: 'Hours and address', page: 'visit' },
      { label: 'Legal notice', page: 'legal' },
      { label: 'Photo credits', page: 'credits' },
    ],
    action: { label: 'Reserve', page: 'reservations' },
  },
  settings: {
    tagline: 'Seasonal cooking on the slopes of the Croix-Rousse.',
    footerNote:
      '8 rue Burdeau\n69001 Lyon\n+33 4 78 28 16 42\n\nLunch Thursday and Friday, 12:00 to 13:45.\nDinner Tuesday to Saturday, 19:30 to 21:45.',
  },
  widgets: {
    reservations: {
      title: 'Reservations',
      heading: 'Book a table',
      body: 'Every table is booked by one of us, by telephone or by email, up to eight weeks ahead, so we can ask about allergies or a birthday while we do it.',
      label: 'How to book',
    },
    goodToKnow: {
      title: 'Good to know',
      hours: [
        { label: 'Closed', value: 'Sunday and Monday, three weeks in August and Christmas week' },
        { label: 'The counter', value: 'Six seats at dinner, kept for guests without a booking' },
        { label: 'Bookings', value: 'By telephone, Tuesday to Saturday, 10:00 to 18:00' },
      ],
    },
    privateDining: {
      title: 'Private dining',
      heading: 'The room upstairs, for fourteen',
      body: 'Lunch or dinner at one oak table, with a menu written for the occasion and wines chosen with you.',
      label: 'Plan a meal upstairs',
    },
  },
}
