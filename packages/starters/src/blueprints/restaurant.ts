import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { coverArt, heroArt, type Palette } from '../demo-art/compositions.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `restaurant` blueprint (L27, `@cogenta/theme-restaurant`): a
 * contemporary bistro in a former silk-weaving workshop on the slopes of the
 * Croix-Rousse in Lyon. A seasonal menu of nineteen dishes and wines in four
 * sections, a page for each of them, and the pages a real restaurant needs
 * before a guest arrives: the menu with its set menus and allergy notes, the
 * story of the kitchen and its suppliers, how to book, the private room,
 * opening hours and directions, and the legal notice.
 *
 * **No booking engine, and nothing that pretends to be one.** A blueprint
 * writes content; contract B has no reservation block and nothing in a page
 * can hold a table. So the site is honest about how to book: the header's
 * "Reserve" link and the home page's one action lead to a Reservations page
 * that says how it works (telephone hours, an email answered the same day,
 * the counter kept for guests without a booking, groups, deposits,
 * cancellation), and its only actions are a `tel:` link and a `mailto:` link
 * that both work on any device. A restaurant that uses an online booking
 * service puts that address in the same actions.
 *
 * The menu is a `menu_item` collection whose `category` names the section of
 * the menu; `@cogenta/theme-restaurant` reads any list of priced entries as a
 * menu and groups it by that field, in the order the entries were written
 * (the lists sort on `id`, a UUIDv7, so insertion order is the menu's order).
 */

export const DEFAULT_RESTAURANT_NAME = 'Laurier'

const SECTIONS = ['Starters', 'Mains', 'Cheese and desserts', 'Wine by the glass'] as const
export type MenuSectionName = (typeof SECTIONS)[number]

const PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
  publish: ['admin'],
} as const

export const menuItem = defineCollection({
  name: 'menu_item',
  versioning: { drafts: true, history: true },
  labels: { singular: 'Dish', plural: 'Menu' },
  routing: { pattern: '/menu/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({
      max: 300,
      multiline: true,
      admin: { label: 'Description', help: 'One or two sentences, printed under the name.' },
    }),
    price: f.number({ required: true, min: 0 }),
    currency: f.select({ options: ['EUR', 'CHF', 'GBP', 'DKK', 'USD'], default: 'EUR' }),
    category: f.select({
      options: [...SECTIONS],
      required: true,
      admin: { label: 'Section of the menu' },
    }),
    vegetarian: f.boolean({ default: false }),
    sourcing: f.text({
      max: 200,
      admin: { label: 'Where it comes from', help: 'The farm, boat or grower.' },
    }),
    pairing: f.text({ max: 160, admin: { label: 'To drink with it' } }),
    allergens: f.text({ max: 200 }),
    photo: f.media({ accept: ['image'] }),
    blocks: f.blocks(),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['category']],
  permissions: PERMISSIONS,
})

export const page = definePageCollection('/:slug')

export const RESTAURANT_COLLECTIONS: readonly CollectionDefinition[] = [menuItem, page]

validateCollectionSet(RESTAURANT_COLLECTIONS)

const BLOCK_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// The house: address, telephone, mailboxes
// ---------------------------------------------------------------------------

export const RESTAURANT_ADDRESS = '8 rue Burdeau, 69001 Lyon'
export const RESTAURANT_PHONE = '+33 4 78 28 16 42'
const PHONE_LINK = 'tel:+33478281642'
const MAP_LINK = 'https://www.openstreetmap.org/?mlat=45.7695&mlon=4.8325#map=18/45.7695/4.8325'

function nameOf(siteName: string | undefined): string {
  const trimmed = siteName?.trim()
  return trimmed === undefined || trimmed === '' ? DEFAULT_RESTAURANT_NAME : trimmed
}

/** `table@maisonverte.fr` for "Maison Verte": the restaurant's own name, as a mailbox. */
export function restaurantEmail(siteName: string | undefined, mailbox = 'table'): string {
  const domain = nameOf(siteName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? 'restaurant' : domain}.fr`
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

type RichNode = RichTextDocument[number]

/**
 * A paragraph where `[words](href)` becomes a link. Nothing else is
 * interpreted: the copy stays plain text a person can read in this file.
 */
function textBlock(key: string, style: 'normal' | 'h2' | 'h3', text: string): RichNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/).filter((part) => part !== '')
  const markDefs: { _key: string; _type: 'link'; href: string }[] = []
  const children = parts.map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link === null) {
      return { _key: `${key}-s${index}`, _type: 'span' as const, text: part, marks: [] }
    }
    const mark = `${key}-l${index}`
    markDefs.push({ _key: mark, _type: 'link', href: link[2] as string })
    return {
      _key: `${key}-s${index}`,
      _type: 'span' as const,
      text: link[1] as string,
      marks: [mark],
    }
  })
  return { _key: key, _type: 'block', style, children, markDefs }
}

/** A prose block from lines: `## ` starts a heading, anything else is a paragraph. */
function prose(
  key: string,
  lines: readonly string[],
  variant?: { readonly align: 'center' },
): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    ...(variant === undefined ? {} : { variant }),
    body: lines.map((line, index) =>
      line.startsWith('## ')
        ? textBlock(`${key}-${index}`, 'h2', line.slice(3))
        : textBlock(`${key}-${index}`, 'normal', line),
    ),
  } as VocabularyBlock
}

function answer(key: string, text: string): RichTextDocument {
  return [textBlock(key, 'normal', text)]
}

function questions(
  key: string,
  items: readonly (readonly [string, string])[],
): { _key: string; question: string; answer: RichTextDocument }[] {
  return items.map(([question, text], index) => ({
    _key: `${key}-${index}`,
    question,
    answer: answer(`${key}-${index}-a`, text),
  }))
}

interface Row {
  readonly title: string
  readonly text: string
  readonly href?: string
}

/** A `featureGrid` without icons, which the theme sets as a ruled table. */
function table(key: string, title: string, rows: readonly Row[]): VocabularyBlock {
  return {
    _key: key,
    _type: 'featureGrid',
    _version: BLOCK_VERSION,
    title,
    items: rows.map((row, index) => ({
      _key: `${key}-${index}`,
      title: row.title,
      text: row.text,
      ...(row.href === undefined ? {} : { link: { href: row.href } }),
    })),
  } as VocabularyBlock
}

// ---------------------------------------------------------------------------
// The menu, in the order it is printed
// ---------------------------------------------------------------------------

export interface RestaurantDemoDish {
  readonly name: string
  readonly slug: string
  readonly category: MenuSectionName
  readonly price: number
  readonly vegetarian: boolean
  readonly description: string
  readonly sourcing: string
  readonly pairing?: string
  readonly allergens?: string
  /** A note from the kitchen or the cellar, printed on the dish's own page. */
  readonly note: string
}

/**
 * Nineteen dishes and wines for a week in early autumn, in the order the menu
 * prints them. Eight of them have a photograph (`RESTAURANT_DISH_PHOTOS`),
 * and every photograph shows the dish it is filed under.
 */
export const RESTAURANT_DEMO_DISHES: readonly RestaurantDemoDish[] = [
  {
    name: 'Beetroot, goat’s curd and walnuts',
    slug: 'beetroot-goats-curd',
    category: 'Starters',
    price: 12,
    vegetarian: true,
    description:
      'Crapaudine beetroot baked in salt, fresh goat’s curd, Grenoble walnuts toasted in brown butter and a few leaves from the farm.',
    sourcing: 'Beetroot from the Morel farm in Vourles, curd from a goat dairy near Condrieu',
    pairing: 'Mâcon-Villages, 2023',
    allergens: 'Milk, walnuts',
    note: 'Crapaudine is an old variety with a rough, dark skin like bark. Baked slowly in a crust of salt it keeps all of its sweetness, and the walnuts are toasted to order so they are still warm when the plate leaves the pass.',
  },
  {
    name: 'Autumn vegetable broth, confit garlic',
    slug: 'vegetable-broth',
    category: 'Starters',
    price: 10,
    vegetarian: true,
    description:
      'A clear tomato and vegetable broth with squash, turnip and white beans, a clove of garlic confit in olive oil and flat parsley.',
    sourcing: 'Vegetables from the Morel farm in Vourles',
    allergens: 'Celery',
    note: 'The broth is made every morning from the trimmings of the vegetables delivered that day, so it changes a little from one week to the next. At lunch it comes with a slice of toasted sourdough.',
  },
  {
    name: 'Grilled octopus, saffron and orange',
    slug: 'grilled-octopus',
    category: 'Starters',
    price: 17,
    vegetarian: false,
    description:
      'Octopus braised for two hours, then grilled over vine cuttings, with an emulsion of saffron, orange and olive oil and a sprig of wild marjoram.',
    sourcing: 'Day boats at Saint-Gilles-Croix-de-Vie, delivered overnight',
    pairing: 'Saint-Joseph blanc, 2022',
    allergens: 'Molluscs, egg',
    note: 'We buy whole octopus of around two kilos and cook it the day it arrives. The vine cuttings come from a grower in Beaujolais who prunes in February and keeps a trailer of them for us.',
  },
  {
    name: 'Pâté en croûte, pickled girolles',
    slug: 'pate-en-croute',
    category: 'Starters',
    price: 15,
    vegetarian: false,
    description:
      'Pork, duck and pistachio in a hot-water crust, made on Monday for the week, with girolles pickled in cider vinegar.',
    sourcing: 'Pork from the Monts du Lyonnais, duck from the Dombes',
    pairing: 'Morgon Côte du Py, 2022',
    allergens: 'Gluten, egg, pistachio, sulphites',
    note: 'One pâté makes eighteen slices and we make two each Monday. When they are gone, the dish comes off the menu until the following week.',
  },
  {
    name: 'Leeks vinaigrette, soft egg and hazelnuts',
    slug: 'leeks-vinaigrette',
    category: 'Starters',
    price: 11,
    vegetarian: true,
    description:
      'Young leeks poached until tender, a sharp mustard vinaigrette, a soft-boiled egg from the farm and toasted hazelnuts.',
    sourcing: 'Leeks and eggs from the Morel farm in Vourles',
    allergens: 'Egg, mustard, hazelnuts',
    note: 'A bistro dish we have served since the first week. The leeks are pulled when they are no thicker than a thumb, and dressed while they are still warm so they take the vinaigrette.',
  },
  {
    name: 'Hake, brown butter and green peppercorns',
    slug: 'hake-green-peppercorns',
    category: 'Mains',
    price: 28,
    vegetarian: false,
    description:
      'A thick fillet of line-caught hake roasted on its skin, brown butter with fresh green peppercorns and roasted Delicata squash.',
    sourcing: 'Day boats at Saint-Gilles-Croix-de-Vie',
    pairing: 'Saint-Joseph blanc, 2022',
    allergens: 'Fish, milk',
    note: 'Fresh green peppercorns arrive on the stem, packed in brine, and taste of pepper without the heat. They go into the butter at the last moment, with a squeeze of lemon.',
  },
  {
    name: 'Duck leg, red cabbage and juniper',
    slug: 'duck-leg-red-cabbage',
    category: 'Mains',
    price: 26,
    vegetarian: false,
    description:
      'Duck leg cured overnight and cooked slowly in its own fat, crisped to order, with red cabbage braised with apple and a juniper jus.',
    sourcing: 'Ducks raised in the Dombes, forty minutes north of Lyon',
    pairing: 'Crozes-Hermitage, 2021',
    allergens: 'Sulphites',
    note: 'The legs are cured with salt, thyme and crushed juniper for a night before they are cooked. The cabbage spends three hours in the oven with apple, red wine vinegar and a little of the duck fat.',
  },
  {
    name: 'Risotto of ceps and girolles, aged Comté',
    slug: 'ceps-risotto',
    category: 'Mains',
    price: 24,
    vegetarian: true,
    description:
      'Carnaroli rice cooked in a stock of roasted mushroom trimmings, ceps and girolles, Comté aged for twenty-four months and a leaf of lemon balm.',
    sourcing:
      'Mushrooms picked in the Monts du Forez, Comté from an affineur on the Croix-Rousse market',
    pairing: 'Mâcon-Villages, 2023',
    allergens: 'Milk, celery',
    note: 'The mushrooms come from a picker who drives down from the Forez on Tuesdays and Fridays. When the weather has been dry there are none, and the risotto is made with squash instead.',
  },
  {
    name: 'Pork chop, cider and apples',
    slug: 'pork-chop-cider',
    category: 'Mains',
    price: 29,
    vegetarian: false,
    description:
      'A thick chop from the Monts du Lyonnais roasted on the bone, apples cooked in cider and a spoonful of the pan juices.',
    sourcing: 'Pork from a farm in the Monts du Lyonnais',
    pairing: 'Morgon Côte du Py, 2022',
    allergens: 'Milk, sulphites',
    note: 'The pigs are a cross of Large White and Duroc, raised outdoors and slaughtered at ten months. The chop rests for as long as it cooked before it is carved.',
  },
  {
    name: 'Pike quenelle, crayfish sauce',
    slug: 'pike-quenelle',
    category: 'Mains',
    price: 25,
    vegetarian: false,
    description:
      'The Lyon classic, made light: pike and choux pastry poached, then baked in a sauce of crayfish shells, cream and a little Cognac.',
    sourcing: 'Pike from the lakes of the Dombes, crayfish from Savoie',
    pairing: 'Mâcon-Villages, 2023',
    allergens: 'Fish, crustaceans, gluten, egg, milk',
    note: 'A quenelle rises like a soufflé in the oven and falls a little on the way to the table, which is how you know it was made that evening. Allow twenty minutes.',
  },
  {
    name: 'Saint-Marcellin, walnut bread',
    slug: 'saint-marcellin',
    category: 'Cheese and desserts',
    price: 9,
    vegetarian: false,
    description:
      'A soft cow’s milk cheese from the Isère, ripened until it runs, with walnut bread from the bakery on rue d’Austerlitz.',
    sourcing: 'An affineur on the Croix-Rousse market',
    allergens: 'Milk, gluten, walnuts',
    note: 'Saint-Marcellin is served in its small earthenware dish, at room temperature. Ask for it runny or firm and the affineur’s shelf will usually have both.',
  },
  {
    name: 'Dark chocolate tart, sea salt',
    slug: 'chocolate-tart',
    category: 'Cheese and desserts',
    price: 10,
    vegetarian: true,
    description:
      'A ganache of seventy per cent chocolate set in a sablé crust and finished with flakes of salt from Guérande.',
    sourcing: 'Chocolate from a maker in the Drôme',
    pairing: 'Muscat de Beaumes-de-Venise, 2020',
    allergens: 'Milk, gluten, egg, soya',
    note: 'The crust is baked blind in the afternoon and the ganache poured an hour before service, so the tart is set but never cold from the refrigerator.',
  },
  {
    name: 'Pear poached in Beaujolais, vanilla cream',
    slug: 'poached-pear',
    category: 'Cheese and desserts',
    price: 10,
    vegetarian: true,
    description:
      'A Williams pear poached in Beaujolais with cinnamon and orange peel, a spoonful of vanilla cream and the reduced poaching wine.',
    sourcing: 'Pears from an orchard in the Monts du Lyonnais',
    pairing: 'Muscat de Beaumes-de-Venise, 2020',
    allergens: 'Milk, sulphites',
    note: 'The pears are poached two days ahead and left in the wine, which turns them the colour of the glass all the way to the core.',
  },
  {
    name: 'Pink praline tart',
    slug: 'praline-tart',
    category: 'Cheese and desserts',
    price: 9,
    vegetarian: true,
    description:
      'The praline tart of Lyon: almonds and hazelnuts coated in red sugar, crushed and melted with cream into a sweet pastry case.',
    sourcing: 'Pralines from a confectioner in the Presqu’île',
    allergens: 'Gluten, egg, milk, almonds, hazelnuts',
    note: 'Made the way it has been made in Lyon since the 1950s, with a little less sugar. A slice is small and very sweet, and goes well with a coffee.',
  },
  {
    name: 'Mâcon-Villages, 2023',
    slug: 'macon-villages-2023',
    category: 'Wine by the glass',
    price: 8,
    vegetarian: false,
    description:
      'Chardonnay from old vines above Lugny, fermented in steel tanks. Bright and a little salty.',
    sourcing: 'A family estate in the Mâconnais, farmed organically since 2011',
    note: 'We pour this with the risotto, the quenelle and the beetroot. It is the wine we open most often at lunch.',
  },
  {
    name: 'Saint-Joseph blanc, 2022',
    slug: 'saint-joseph-blanc-2022',
    category: 'Wine by the glass',
    price: 12,
    vegetarian: false,
    description:
      'Marsanne and roussanne from granite terraces on the right bank of the Rhône. Round, with apricot and almond.',
    sourcing: 'A grower in Tournon-sur-Rhône with four hectares of terraces',
    note: 'Rich enough for the hake and the octopus, and served a little warmer than most white wines so the fruit comes through.',
  },
  {
    name: 'Morgon Côte du Py, 2022',
    slug: 'morgon-cote-du-py-2022',
    category: 'Wine by the glass',
    price: 10,
    vegetarian: false,
    description:
      'Gamay from the hill of Py, fermented in whole bunches and bottled without filtering. Dark cherry and a stony finish.',
    sourcing: 'A grower in Villié-Morgon we have bought from since we opened',
    note: 'Served slightly cool, at about fourteen degrees. It is the wine we drink with the pâté en croûte and the pork.',
  },
  {
    name: 'Crozes-Hermitage, 2021',
    slug: 'crozes-hermitage-2021',
    category: 'Wine by the glass',
    price: 11,
    vegetarian: false,
    description:
      'Syrah from the northern Rhône, aged fifteen months in old barrels. Black olive, pepper and violets.',
    sourcing: 'A cooperative of eleven growers in Tain-l’Hermitage',
    note: 'A cooler vintage than most, with fine tannins and a long, peppery finish. We decant a bottle at the start of each service, and it drinks best with the duck.',
  },
  {
    name: 'Muscat de Beaumes-de-Venise, 2020',
    slug: 'muscat-beaumes-de-venise-2020',
    category: 'Wine by the glass',
    price: 9,
    vegetarian: false,
    description:
      'A sweet white from the southern Rhône, served cold in a glass of eight centilitres. Orange peel and honey.',
    sourcing: 'A domaine at the foot of the Dentelles de Montmirail',
    note: 'The one sweet wine we pour by the glass, kept for the poached pear and the chocolate tart. A half bottle is on the list for a table that wants more than a glass.',
  },
]

/** The dishes photographed for the site, by slug. Every other dish has no photograph, on purpose. */
export const RESTAURANT_DISH_PHOTOS: Readonly<Record<string, string>> = {
  'beetroot-goats-curd':
    'Cubes of dark beetroot, white goat’s curd and toasted walnuts on a white plate',
  'vegetable-broth':
    'A bowl of clear tomato broth with squash, turnip, white beans and flat parsley',
  'grilled-octopus':
    'A grilled octopus tentacle on a pool of saffron and orange emulsion, with a sprig of marjoram',
  'hake-green-peppercorns':
    'A roasted fillet of hake with fresh green peppercorns on the stem and cubes of squash',
  'duck-leg-red-cabbage':
    'A crisp duck leg on braised red cabbage with juniper jus, on an oak table',
  'ceps-risotto': 'A bowl of risotto with sliced ceps, grated Comté and a leaf of lemon balm',
  'chocolate-tart':
    'A slice of dark chocolate tart with flakes of salt, a fork resting on the plate',
  'poached-pear': 'A pear poached dark red in Beaujolais, with vanilla cream and the reduced wine',
}

/** The four plates that make the band of photographs on the home page. */
const HOME_PLATES = [
  'beetroot-goats-curd',
  'grilled-octopus',
  'duck-leg-red-cabbage',
  'poached-pear',
]

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type Media = Readonly<Record<string, string>>

export interface RestaurantDemoOptions {
  readonly siteName?: string
  readonly media?: Media
}

function menuList(
  key: string,
  options: {
    readonly title?: string
    readonly category?: MenuSectionName
    readonly layout?: 'grid' | 'list'
  },
): VocabularyBlock {
  return {
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    ...(options.title === undefined ? {} : { title: options.title }),
    collection: 'menu_item',
    ...(options.category === undefined ? {} : { filter: { category: options.category } }),
    sort: { field: 'id', direction: 'asc' },
    limit: 40,
    layout: options.layout ?? 'grid',
  } as VocabularyBlock
}

const MORE_TITLES: Readonly<Record<MenuSectionName, string>> = {
  Starters: 'The other starters',
  Mains: 'The other mains',
  'Cheese and desserts': 'Cheese and desserts',
  'Wine by the glass': 'Wine by the glass',
}

/** The body of one dish's page: the note from the kitchen, then the rest of its section. */
export function restaurantDishBlocks(dish: RestaurantDemoDish): readonly VocabularyBlock[] {
  return [
    prose(`dish-${dish.slug}-note`, [dish.note]),
    menuList(`dish-${dish.slug}-more`, {
      title: MORE_TITLES[dish.category],
      category: dish.category,
      layout: 'list',
    }),
  ]
}

function reservationActions(siteName: string) {
  return [
    { label: `Call ${RESTAURANT_PHONE}`, target: { href: PHONE_LINK }, emphasis: 'primary' },
    {
      label: 'Write to us',
      target: {
        href: `mailto:${restaurantEmail(siteName)}?subject=${encodeURIComponent('Table request')}`,
      },
    },
  ]
}

const HOURS_ROWS: readonly Row[] = [
  { title: 'Lunch', text: 'Thursday and Friday, 12:00 to 13:45' },
  { title: 'Dinner', text: 'Tuesday to Saturday, 19:30 to 21:45' },
  { title: 'Closed', text: 'Sunday and Monday, three weeks in August and Christmas week' },
]

export function buildRestaurantHomeBlocks(
  options: RestaurantDemoOptions = {},
): readonly VocabularyBlock[] {
  const media = options.media ?? {}
  const siteName = nameOf(options.siteName)
  const plates = HOME_PLATES.map((slug) => media[`dish-${slug}`]).filter(
    (id): id is string => id !== undefined,
  )

  return [
    {
      _key: 'home-hero',
      _type: 'hero',
      _version: BLOCK_VERSION,
      eyebrow: 'Restaurant and wine bar, Lyon',
      title: siteName,
      subtitle:
        'Seasonal cooking in a former silk workshop on the slopes of the Croix-Rousse. Lunch on Thursday and Friday, dinner from Tuesday to Saturday.',
      ...(media.hero === undefined ? {} : { media: media.hero }),
      actions: [{ label: 'Reserve a table', target: { href: '/reservations' } }],
    } as VocabularyBlock,
    prose(
      'home-welcome',
      [
        'We cook what a handful of farms, boats and growers send us each week, and write a new menu every Tuesday. Thirty-eight seats under the high ceilings of an old weaving workshop, and six at the counter for anyone who walks in.',
      ],
      { align: 'center' },
    ),
    menuList('home-menu', { title: 'This week’s menu' }),
    ...(plates.length === 0
      ? []
      : [
          {
            _key: 'home-plates',
            _type: 'gallery',
            _version: BLOCK_VERSION,
            layout: 'grid',
            items: plates.map((id, index) => ({ _key: `home-plates-${index}`, media: id })),
          } as VocabularyBlock,
        ]),
    prose('home-kitchen', [
      '## The kitchen',
      `${siteName} opened in 2016 in a canut workshop on rue Burdeau, built in 1827 with ceilings four and a half metres high so that Jacquard looms could stand in it. Élise Marchand runs the kitchen with three cooks; Karim Benali looks after the room and the wine.`,
      'Almost everything we cook comes from within a hundred kilometres of the door: vegetables from a farm in Vourles, ducks and pike from the Dombes, pork from the Monts du Lyonnais, cheese from the market at the top of the hill. The fish is the exception, and it comes overnight from the day boats of the Vendée coast.',
      '[Read about the kitchen and the people we buy from](/our-story)',
    ]),
    {
      _key: 'home-press',
      _type: 'quote',
      _version: BLOCK_VERSION,
      text: 'Élise Marchand cooks the way the room looks: there is nothing on the plate that is there for show, and nothing missing either.',
      author: 'Hélène Vasseur',
      role: 'Tablées, autumn guide 2026',
    } as VocabularyBlock,
    table('home-hours', 'Hours and address', [
      ...HOURS_ROWS,
      { title: 'Address', text: RESTAURANT_ADDRESS, href: '/visit' },
      { title: 'Telephone', text: RESTAURANT_PHONE, href: PHONE_LINK },
    ]),
    {
      _key: 'home-private',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: 'The room upstairs, for fourteen at one table',
      text: 'Lunch or dinner for a birthday, a wedding party or a team, with a menu written for the occasion and wines chosen with you.',
      actions: [{ label: 'Private dining', target: { href: '/private-dining' } }],
    } as VocabularyBlock,
    {
      _key: 'home-book',
      _type: 'cta',
      _version: BLOCK_VERSION,
      variant: { background: 'muted' },
      title: 'Book a table',
      text: 'Call us from Tuesday to Saturday between 10:00 and 18:00, or write to us and we will reply the same day.',
      actions: reservationActions(siteName),
    } as VocabularyBlock,
  ]
}

export interface RestaurantDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home`, `menu`, `our-story`, `reservations`, `private-dining`, `visit` and
 * `legal`: every page the menus and the copy link to.
 */
export function buildRestaurantDemoPages(
  options: RestaurantDemoOptions = {},
): readonly RestaurantDemoPage[] {
  const media = options.media ?? {}
  const siteName = nameOf(options.siteName)
  const tableEmail = restaurantEmail(siteName)
  const events = restaurantEmail(siteName, 'events')
  const hello = restaurantEmail(siteName, 'hello')

  return [
    { title: 'Home', slug: 'home', blocks: buildRestaurantHomeBlocks({ siteName, media }) },
    {
      title: 'Menu',
      slug: 'menu',
      blocks: [
        prose('menu-intro', [
          'The menu changes every Tuesday, following what the farms and boats send us, and a dish comes off it when we run out. Everything is cooked to order. Prices are in euros and include service; wine by the glass is poured at twelve centilitres unless the list says otherwise.',
        ]),
        {
          _key: 'menu-sets',
          _type: 'pricingTable',
          _version: BLOCK_VERSION,
          title: 'Set menus',
          tiers: [
            {
              _key: 'menu-sets-lunch',
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
              _key: 'menu-sets-evening',
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
              _key: 'menu-sets-carte',
              name: 'À la carte',
              price: '€10 to €29',
              interval: 'a dish, at lunch and dinner',
              features: [
                'Every dish on this page',
                'Half portions for children',
                'Bread and butter included',
              ],
            },
          ],
        } as VocabularyBlock,
        menuList('menu-all', { title: 'This week’s menu' }),
        {
          _key: 'menu-notes',
          _type: 'accordion',
          _version: BLOCK_VERSION,
          title: 'Allergies and dietary requirements',
          items: questions('menu-notes', [
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
          ]),
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Our story',
      slug: 'our-story',
      blocks: [
        prose('story-intro', [
          `${siteName} opened in the autumn of 2016, in a workshop on rue Burdeau where silk was woven until the 1930s. The building went up in 1827 for the canuts, the silk weavers of Lyon, with ceilings high enough for a Jacquard loom and tall windows for the light they needed to see the thread. We kept both, sanded the oak floor and put the kitchen where the looms used to stand.`,
          '## The kitchen',
          'Élise Marchand grew up in Villefranche-sur-Saône and cooked for eight years in Paris and Copenhagen before coming home to open the restaurant. She writes the menu on Monday afternoon, once the farms have told her what they will send, and cooks every service with three cooks and a pastry chef who works mornings.',
          'The cooking is plain on purpose. A dish has three or four things on the plate, each of them chosen for the week it is in season, and the sauces are made from the bones and trimmings of what we buy whole.',
          '## The room and the wine',
          'Karim Benali runs the room. He trained as a sommelier in Beaune and has built a list of about two hundred wines, almost all from growers in Beaujolais, the Mâconnais and the northern Rhône, most of whom he has visited. Six are poured by the glass and change with the menu.',
        ]),
        ...(media.hero === undefined
          ? []
          : [
              {
                _key: 'story-room',
                _type: 'mediaFigure',
                _version: BLOCK_VERSION,
                media: media.hero,
                ratio: '3:2',
                align: 'start',
                caption:
                  'The dining room on rue Burdeau, set for dinner under the skylight the weavers put in.',
              } as VocabularyBlock,
            ]),
        {
          _key: 'story-figures',
          _type: 'stats',
          _version: BLOCK_VERSION,
          title: 'The house in numbers',
          items: [
            {
              _key: 'story-figures-seats',
              value: '38',
              label: 'seats in the room, and six at the counter',
            },
            {
              _key: 'story-figures-room',
              value: '14',
              label: 'guests at one table in the room upstairs',
            },
            {
              _key: 'story-figures-growers',
              value: '11',
              label: 'farms, boats and growers we buy from each week',
            },
            {
              _key: 'story-figures-km',
              value: '100',
              unit: 'km',
              label: 'from the door to almost everything we cook',
            },
          ],
        } as VocabularyBlock,
        table('story-suppliers', 'Who we buy from', [
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
        ]),
      ],
    },
    {
      title: 'Reservations',
      slug: 'reservations',
      blocks: [
        prose('reservations-intro', [
          `We take bookings by telephone and by email, for up to eight weeks ahead. There is no online booking: every table is booked by one of us, so we can ask about allergies, a pram or a birthday while we do it.`,
          '## By telephone',
          `Call [${RESTAURANT_PHONE}](${PHONE_LINK}) from Tuesday to Saturday between 10:00 and 18:00. During service the phone is answered when someone is free, so the afternoon is the best time to reach us.`,
          '## By email',
          `Write to [${tableEmail}](mailto:${tableEmail}) with the date, the time, the number of guests and a telephone number. We reply the same day, and a table is only booked once you have our reply.`,
          '## Without a booking',
          'The six seats at the counter are kept for guests who walk in at dinner, and the full menu is served there. On Friday and Saturday they are usually taken by 20:00.',
        ]),
        table('reservations-summary', 'Booking at a glance', [
          {
            title: 'Tables',
            text: 'For two to six guests. For seven to fourteen, see private dining.',
            href: '/private-dining',
          },
          { title: 'Booking ahead', text: 'Up to eight weeks, by telephone or by email' },
          { title: 'Deposits', text: 'None for up to six guests. €20 a guest for eight or more.' },
          {
            title: 'Cancelling',
            text: 'Please tell us 24 hours ahead, so we can give the table to someone else',
          },
        ]),
        {
          _key: 'reservations-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Before you come',
          items: questions('reservations-faq', [
            [
              'What happens if we are running late?',
              'We keep a table for fifteen minutes. Call us if you will be later than that and we will do what we can, although on a full evening we may have to shorten the meal.',
            ],
            [
              'How do I cancel?',
              `Call us or reply to the email that confirmed your table, at least 24 hours before. For eight guests or more the deposit is returned in full if you cancel 72 hours ahead.`,
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
          ]),
        } as VocabularyBlock,
        {
          _key: 'reservations-book',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Book a table',
          text: 'Tuesday to Saturday, 10:00 to 18:00 by telephone. Emails are answered the same day.',
          actions: reservationActions(siteName),
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Private dining',
      slug: 'private-dining',
      blocks: [
        prose('private-intro', [
          'Above the dining room is the old drawing room of the workshop, where the pattern designers worked. It seats fourteen at one oak table, has its own windows over rue Burdeau and a door that closes, and is served from the same kitchen as the restaurant.',
          'We plan every meal upstairs with you. Tell us the date, the number of guests and what the occasion is, and Élise will suggest a menu from the week’s produce a fortnight before; Karim will do the same with the wine.',
        ]),
        {
          _key: 'private-menus',
          _type: 'pricingTable',
          _version: BLOCK_VERSION,
          title: 'Menus for the room upstairs',
          tiers: [
            {
              _key: 'private-menus-lunch',
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
              _key: 'private-menus-dinner',
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
              _key: 'private-menus-wine',
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
        } as VocabularyBlock,
        {
          _key: 'private-note',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: answer(
            'private-note-quote',
            'We had my father’s seventieth birthday upstairs, twelve of us and a cake from his favourite bakery. Karim found a bottle from the year he was born and nobody told him until the cheese.',
          ),
          attribution: { name: 'Camille Roux', role: 'Dinner for twelve, March 2026' },
        } as VocabularyBlock,
        {
          _key: 'private-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Planning a meal upstairs',
          items: questions('private-faq', [
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
          ]),
        } as VocabularyBlock,
        {
          _key: 'private-plan',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Plan a meal upstairs',
          text: 'Write with the date, the number of guests and the occasion. We reply within two working days with a proposal.',
          actions: [
            {
              label: 'Write to us',
              target: {
                href: `mailto:${events}?subject=${encodeURIComponent('Private dining enquiry')}`,
              },
              emphasis: 'primary',
            },
            { label: `Call ${RESTAURANT_PHONE}`, target: { href: PHONE_LINK } },
          ],
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Hours and address',
      slug: 'visit',
      blocks: [
        table('visit-hours', 'Opening hours', [
          ...HOURS_ROWS,
          { title: 'The counter', text: 'At dinner, for guests without a booking' },
          { title: 'Telephone', text: RESTAURANT_PHONE, href: PHONE_LINK },
          { title: 'Bookings by telephone', text: 'Tuesday to Saturday, 10:00 to 18:00' },
        ]),
        table('visit-access', 'Finding us', [
          { title: 'Address', text: RESTAURANT_ADDRESS, href: MAP_LINK },
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
        ]),
        prose('visit-note', [
          'The Pentes are steep, and rue Burdeau is a street of stairs in places. From the Terreaux, the gentlest way up is along rue Sainte-Catherine and rue Burdeau, rather than the stairs of the passage Mermet.',
        ]),
      ],
    },
    {
      title: 'Legal notice and privacy',
      slug: 'legal',
      blocks: [
        prose('legal-body', [
          `This site is published by ${siteName} SAS, ${RESTAURANT_ADDRESS}, France, registered with the Lyon trade and companies register under number 821 405 617, VAT FR 34 821405617. Publication director: Karim Benali.`,
          '## Your booking details',
          `When you book, we keep your name, telephone number, the size of your party and anything you tell us about allergies, for the sole purpose of seating you. We delete booking details three months after your visit, and we never send marketing emails. Write to [${hello}](mailto:${hello}) to see or remove what we hold.`,
          '## Cookies',
          'This site sets no advertising or tracking cookies. If you choose a light or dark appearance, that choice is kept in your own browser and nowhere else.',
          '## Photographs',
          'The photographs on this site are of our dishes and our dining room, and may not be reused without permission.',
        ]),
      ],
    },
  ]
}

// ---------------------------------------------------------------------------
// Media, menus, settings
// ---------------------------------------------------------------------------

/**
 * `restaurant`'s own starting skin, asserted present with a real check since
 * `STARTING_SKINS` is keyed by blueprint id. Its palette only feeds the
 * procedural fallback of each media slot below, which is never used while the
 * photographs are bundled.
 */
function restaurantPalette(): Palette {
  const skin = STARTING_SKINS.restaurant
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.restaurant is missing.',
      hint: 'The "restaurant" entry must stay declared in starting-skins.ts for this blueprint to render its fallback art.',
    })
  }
  return skin.color
}

/**
 * Every visual this blueprint seeds is a bundled photograph: the dining room,
 * and one photograph for each of the eight dishes that has one, every one
 * cropped to the same 4:5. The home page's band of plates and the story
 * page's figure reuse these, never a second copy. `spec` is `seedDemoMedia`'s
 * fallback if a file is ever missing, never the intended picture.
 */
export const RESTAURANT_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(restaurantPalette(), 'radial', 7),
    alt: 'The dining room at night, tables laid with white cloths and glasses under a skylight',
    photo: 'restaurant/hero.jpg',
  },
  ...Object.entries(RESTAURANT_DISH_PHOTOS).map(
    ([slug, alt], index): DemoMediaSpec => ({
      name: `dish-${slug}`,
      spec: coverArt(restaurantPalette(), 100 + index),
      alt,
      photo: `restaurant/${slug}.jpg`,
    }),
  ),
]

export const RESTAURANT_MENUS: BlueprintMenus = {
  header: [
    { label: 'Menu', url: '/menu' },
    { label: 'Our story', url: '/our-story' },
    { label: 'Private dining', url: '/private-dining' },
    { label: 'Hours and address', url: '/visit' },
  ],
  footer: [
    { label: 'Menu', url: '/menu' },
    { label: 'Reservations', url: '/reservations' },
    { label: 'Private dining', url: '/private-dining' },
    { label: 'Our story', url: '/our-story' },
    { label: 'Hours and address', url: '/visit' },
    { label: 'Legal notice', url: '/legal' },
  ],
  headerAction: { label: 'Reserve', url: '/reservations' },
}

/**
 * The widgets a restaurant's site places, and where.
 *
 * Beside a dish (which opens on its own photograph and words, not a hero) and
 * beside search results: the way to book, in the house's words, then a
 * critic's line about the kitchen. Never beside the menu, the set menus or
 * the room upstairs: those pages lay out their prices across the whole grid.
 *
 * In the footer, under the address card it already prints (street,
 * telephone, lunch and dinner hours), a second tier with what that card
 * leaves out: the days the restaurant is closed, the counter kept for guests
 * without a booking and the hours the telephone is answered; then the room
 * upstairs. Neither shows on a page that already says the same thing: the home
 * page (its own hours table and its private dining band), the hours page, the
 * reservations page and the private dining page.
 *
 * No widget names the restaurant's e-mail address: the pages derive it from
 * the site's name, and a widget's settings cannot, so it would contradict them
 * on any site not called Laurier.
 */
type RestaurantPageTarget =
  | { readonly kind: 'home' }
  | { readonly kind: 'collection'; readonly collection: 'menu_item' }
  | { readonly kind: 'search' }
  | { readonly kind: 'path'; readonly path: string }

const DISH_PAGE: RestaurantPageTarget = { kind: 'collection', collection: 'menu_item' }
const SEARCH_RESULTS: RestaurantPageTarget = { kind: 'search' }
const HOME: RestaurantPageTarget = { kind: 'home' }
const pagePath = (path: string): RestaurantPageTarget => ({ kind: 'path', path })

function shownOn(
  mode: 'only' | 'except',
  ...targets: readonly RestaurantPageTarget[]
): Readonly<Record<string, unknown>> {
  return { pages: { mode, targets } }
}

export const RESTAURANT_WIDGETS: readonly BlueprintWidget[] = [
  {
    area: 'sidebar',
    type: 'cta',
    title: 'Reservations',
    settings: {
      heading: 'Book a table',
      body: 'Every table is booked by one of us, by telephone or by email, up to eight weeks ahead, so we can ask about allergies or a birthday while we do it.',
      label: 'How to book',
      href: '/reservations',
    },
    visibility: shownOn('only', DISH_PAGE, SEARCH_RESULTS),
  },
  {
    area: 'sidebar',
    type: 'quote',
    settings: {
      text: 'Élise Marchand cooks the way the room looks: there is nothing on the plate that is there for show, and nothing missing either.',
      attribution: 'Hélène Vasseur',
      role: 'Tablées, autumn guide 2026',
    },
    visibility: shownOn('only', DISH_PAGE),
  },
  {
    area: 'footer-1',
    type: 'contact',
    title: 'Good to know',
    settings: {
      hours: [
        { label: 'Closed', value: 'Sunday and Monday, three weeks in August and Christmas week' },
        { label: 'The counter', value: 'Six seats at dinner, kept for guests without a booking' },
        { label: 'Bookings', value: 'By telephone, Tuesday to Saturday, 10:00 to 18:00' },
      ],
    },
    visibility: shownOn('except', HOME, pagePath('/visit'), pagePath('/reservations')),
  },
  {
    area: 'footer-2',
    type: 'cta',
    title: 'Private dining',
    settings: {
      heading: 'The room upstairs, for fourteen',
      body: 'Lunch or dinner at one oak table, with a menu written for the occasion and wines chosen with you.',
      label: 'Plan a meal upstairs',
      href: '/private-dining',
    },
    visibility: shownOn('except', HOME, pagePath('/private-dining')),
  },
]

export const RESTAURANT_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Seasonal cooking on the slopes of the Croix-Rousse.',
  'general.socialLinks': [
    { label: 'Instagram', url: 'https://instagram.com/example' },
    { label: 'Facebook', url: 'https://facebook.com/example' },
  ],
  'general.footerNote': `8 rue Burdeau\n69001 Lyon\n${RESTAURANT_PHONE}\n\nLunch Thursday and Friday, 12:00 to 13:45.\nDinner Tuesday to Saturday, 19:30 to 21:45.`,
  // A menu is not a discussion: no comment form under a dish. An editor can
  // open comments again per collection or per entry.
  'discussion.enabled': false,
}

export const RESTAURANT_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Audits the menu and the hours page so the restaurant is findable by name, street and cuisine.',
  },
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized food photography before it slows the menu page down.',
  },
]

/**
 * Inserts the blueprint's content through the real `ContentStore`, never
 * mocked (house rule): the dishes first, in the order the menu prints them,
 * then the pages. Everything is published, so every list and every link has
 * something real behind it.
 */
async function seedRestaurantDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const siteName = nameOf(ctx.siteName)
  const dishStore = createContentStore({ db, collection: menuItem, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const dish of RESTAURANT_DEMO_DISHES) {
    const photo = media[`dish-${dish.slug}`]
    await dishStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        name: dish.name,
        slug: dish.slug,
        description: dish.description,
        price: dish.price,
        currency: 'EUR',
        category: dish.category,
        vegetarian: dish.vegetarian,
        sourcing: dish.sourcing,
        ...(dish.pairing === undefined ? {} : { pairing: dish.pairing }),
        ...(dish.allergens === undefined ? {} : { allergens: dish.allergens }),
        ...(photo === undefined ? {} : { photo }),
      },
      blocks: { blocks: restaurantDishBlocks(dish).map(toBlockZoneEntry) },
    })
  }

  for (const demo of buildRestaurantDemoPages({ siteName, media })) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const restaurantContentPack: BlueprintContentPack = {
  collections: RESTAURANT_COLLECTIONS,
  recommendedAgents: RESTAURANT_RECOMMENDED_AGENTS,
  seedDemoContent: seedRestaurantDemoContent,
  defaultTheme: '@cogenta/theme-restaurant',
  menus: RESTAURANT_MENUS,
  widgets: RESTAURANT_WIDGETS,
  siteSettings: RESTAURANT_SITE_SETTINGS,
  mediaSpecs: RESTAURANT_MEDIA_SPECS,
}
