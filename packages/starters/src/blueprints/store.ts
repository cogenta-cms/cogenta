import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { coverArt, heroArt, type Palette, productArt } from '../demo-art/compositions.js'
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
 * The `store` blueprint (L27, `@cogenta/theme-ecommerce`): a small brand of
 * durable everyday goods with a shop and a repair bench in Lisbon, twelve
 * products from the workshops it buys from, four categories, and the pages a
 * real shop needs before it takes an order (how to order, delivery and
 * returns, repairs, contact, terms).
 *
 * **Contract A only, and no checkout.** A blueprint writes
 * `cogenta.schema.mjs` and seeds content; it cannot provision
 * `@cogenta/commerce`'s tables (contract E, ADR-0024), and contract B has no
 * cart or checkout block. So the catalogue is honest about how to buy: each
 * product names where it can be ordered (`orderLink`, an email to the shop
 * with the product in the subject line), the theme turns that into an
 * "Order by email" action, and the "How to order" page says what happens
 * next. A shop that connects a payment link or a marketplace page puts that
 * address in the same field.
 *
 * Categories are a small collection of their own rather than a taxonomy: a
 * category page here is a photographed grid of goods, and a term archive
 * (`TermArchiveEntry`) carries neither a picture nor a price. Each product
 * keeps its category as a plain `select`, which is what a category's own
 * list filters on and what the product page prints.
 */

export const DEFAULT_SHOP_NAME = 'Atelier Goods'

const CATEGORY_NAMES = ['Wear', 'Carry', 'Kitchen', 'Living'] as const
export type ProductCategory = (typeof CATEGORY_NAMES)[number]

const CURRENCIES = ['EUR', 'GBP', 'CHF', 'DKK', 'SEK', 'USD'] as const

const PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
  publish: ['admin'],
} as const

export const product = defineCollection({
  name: 'product',
  labels: { singular: 'Product', plural: 'Products' },
  routing: { pattern: '/shop/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({
      max: 300,
      multiline: true,
      admin: { label: 'Short description', help: 'Shown beside the price on the product page.' },
    }),
    price: f.number({ required: true, min: 0 }),
    currency: f.select({ options: [...CURRENCIES], default: 'EUR' }),
    category: f.select({ options: [...CATEGORY_NAMES], required: true }),
    inStock: f.boolean({ default: true, admin: { label: 'In stock' } }),
    material: f.text({ max: 200 }),
    dimensions: f.text({ max: 200 }),
    weight: f.text({ max: 60 }),
    capacity: f.text({ max: 60 }),
    origin: f.text({ max: 160, admin: { label: 'Made in' } }),
    care: f.text({ max: 300, multiline: true }),
    delivery: f.text({
      max: 300,
      multiline: true,
      admin: { label: 'Delivery note', help: 'One or two sentences under the order button.' },
    }),
    orderLink: f.text({
      max: 400,
      admin: {
        label: 'Where to order',
        help: 'An email link (mailto:), a payment link or a marketplace page. The product page shows it as the order button.',
      },
    }),
    photo: f.media({ accept: ['image'] }),
    blocks: f.blocks(),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['category']],
  permissions: PERMISSIONS,
})

export const category = defineCollection({
  name: 'category',
  labels: { singular: 'Category', plural: 'Categories' },
  routing: { pattern: '/category/:slug' },
  fields: {
    name: f.text({ required: true, max: 80 }),
    slug: f.slug({ from: 'name', unique: true }),
    summary: f.text({ max: 240, multiline: true }),
    photo: f.media({ accept: ['image'] }),
    blocks: f.blocks(),
    ...SEO_FIELDS,
  },
  indexes: [['slug']],
  permissions: PERMISSIONS,
})

export const page = definePageCollection('/:slug')

export const STORE_COLLECTIONS: readonly CollectionDefinition[] = [product, category, page]

validateCollectionSet(STORE_COLLECTIONS)

const BLOCK_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

/** `orders@ateliergoods.com` for "Atelier Goods": the shop's own name, as a mailbox. */
export function shopEmail(siteName: string, mailbox = 'hello'): string {
  const domain = siteName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? 'shop' : domain}.com`
}

function nameOf(siteName: string | undefined): string {
  const trimmed = siteName?.trim()
  return trimmed === undefined || trimmed === '' ? DEFAULT_SHOP_NAME : trimmed
}

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
function prose(key: string, lines: readonly string[]): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
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

// ---------------------------------------------------------------------------
// The goods, oldest first
// ---------------------------------------------------------------------------

export interface StoreDemoProduct {
  readonly name: string
  readonly slug: string
  readonly category: ProductCategory
  readonly price: number
  readonly inStock: boolean
  readonly description: string
  readonly material: string
  readonly dimensions: string
  readonly weight?: string
  readonly capacity?: string
  readonly origin: string
  readonly care: string
  readonly delivery: string
  /** Two paragraphs: how it is made, and how it wears. */
  readonly story: readonly [string, string]
}

const SHIPS = 'Ships from Lisbon within two working days. Free returns within 30 days.'

/**
 * Twelve products, three per category and two sold out, written oldest
 * first: the newest four (the jacket, the shoulder bag, the pour-over set and
 * the blanket) open the home page's grid. Each photograph is the product it
 * names, and every material, size and origin matches what the picture shows.
 */
export const STORE_DEMO_PRODUCTS: readonly StoreDemoProduct[] = [
  {
    name: 'Linen table runner',
    slug: 'linen-table-runner',
    category: 'Living',
    price: 68,
    inStock: false,
    description:
      'A long runner in washed white linen with knotted fringes, woven narrow enough to leave room for plates on either side.',
    material: 'Linen, stone washed.',
    dimensions: '45 × 200 cm, fringes included.',
    origin: 'Guimarães, Portugal',
    care: 'Wash at 40 °C and line dry. Linen looks best a little creased.',
    delivery: 'The next weaving is due in April. Write to us and we will keep one aside for you.',
    story: [
      'Woven in Guimarães from flax grown in Normandy and spun in the north of Portugal. The ends are left to fray for a few centimetres and then knotted by hand, so there is no hem to pucker in the wash.',
      'Stone washing softens the cloth before it reaches you. It turns whiter and more supple each time it is washed, and red wine comes out with cold water if you get to it the same evening.',
    ],
  },
  {
    name: 'Enamel mug',
    slug: 'enamel-mug',
    category: 'Kitchen',
    price: 24,
    inStock: true,
    description:
      'A 350 ml mug in forest green enamel over steel, with a rolled stainless rim. Light enough for a rucksack and good enough for the table.',
    material: 'Enamelled steel, stainless steel rim.',
    capacity: '350 ml',
    dimensions: '8.5 cm across, 8 cm high.',
    origin: 'Olkusz, Poland',
    care: 'Dishwasher safe. A chip in the enamel does not spread, so keep using it.',
    delivery: SHIPS,
    story: [
      'Pressed and enamelled in Olkusz, a town that has made enamelware since the beginning of the last century. Each mug is dipped twice and fired at 800 °C, which gives the green its depth and a surface that coffee will not stain.',
      'It can go on a camping stove and in the oven. We drink from these at the shop counter every morning, and some of ours have been in daily use for six years.',
    ],
  },
  {
    name: 'Cable-knit beanie',
    slug: 'cable-knit-beanie',
    category: 'Wear',
    price: 42,
    inStock: true,
    description:
      'A deep, loose beanie in charcoal lambswool with a wide turn-up. Knitted on hand-flat machines and finished by hand.',
    material: 'Lambswool, charcoal melange.',
    dimensions: 'One size, 28 cm high unfolded.',
    origin: 'Covilhã, Portugal',
    care: 'Hand wash cold with wool soap and dry flat on a towel.',
    delivery: SHIPS,
    story: [
      'Knitted in Covilhã, a town that once ran on its wool mills and still has a handful of knitters working hand-flat machines. The cable is set loose, so the hat rests on the head instead of gripping it.',
      'Lambswool pills a little in the first weeks of wear. A wool comb takes it off, and the hat stays soft for years afterwards.',
    ],
  },
  {
    name: 'Canvas tote',
    slug: 'canvas-tote',
    category: 'Carry',
    price: 48,
    inStock: true,
    description:
      'An undyed cotton canvas tote with handles long enough to wear over a coat. It stands up on its own and carries a week of shopping.',
    material: 'Cotton canvas, 14 oz, undyed.',
    dimensions: '38 × 42 × 12 cm. Handles 62 cm.',
    origin: 'Lisbon, Portugal',
    care: 'Machine wash cold, reshape while damp and dry flat. It softens and shrinks slightly.',
    delivery: SHIPS,
    story: [
      'The first thing we ever made, and still the thing we sell most of. The body is one piece of canvas folded at the base, so there is no seam along the bottom to split, and the handles run down both sides to carry the weight.',
      'It arrives undyed and a little stiff. After a few months it creases where you hold it and takes the shape of what you carry.',
    ],
  },
  {
    name: 'Brushed cotton overshirt',
    slug: 'brushed-cotton-overshirt',
    category: 'Wear',
    price: 98,
    inStock: false,
    description:
      'A grey overshirt in brushed cotton flannel with a button-down collar and one chest pocket. Heavy enough to wear as a light jacket in spring.',
    material: 'Cotton flannel, 220 g/m², brushed on both sides. Mother-of-pearl buttons.',
    dimensions: 'Sizes S to XL. Size M: 76 cm back length, 57 cm across the chest.',
    origin: 'Guimarães, Portugal',
    care: 'Wash at 30 °C and line dry. Iron on low heat.',
    delivery: 'The next batch is being cut and should reach the shop in March.',
    story: [
      'The flannel is brushed on both faces at a finishing mill outside Guimarães, which gives it a soft, slightly dusty surface and traps enough air to feel warm on a cold morning. We make it in one grey, a mix of undyed and black cotton.',
      'This batch sold out in six weeks. Write to us and we will tell you when the next one arrives. Nothing is charged until it does.',
    ],
  },
  {
    name: 'Cast-iron skillet',
    slug: 'cast-iron-skillet',
    category: 'Kitchen',
    price: 89,
    inStock: true,
    description:
      'A 26 cm skillet cast in one piece, with a pouring lip on each side. Seasoned with linseed oil and ready to cook with.',
    material: 'Cast iron, seasoned with three coats of linseed oil.',
    dimensions: '26 cm across, 5 cm deep, 45 cm with the handle.',
    weight: '2.6 kg',
    origin: 'Aveiro, Portugal',
    care: 'Rinse with hot water and a brush, dry on the hob, wipe with a drop of oil. Keep it out of the dishwasher.',
    delivery:
      'Ships from Lisbon within two working days by tracked courier. Free returns within 30 days.',
    story: [
      'Cast in sand moulds at a foundry near Aveiro that otherwise makes parts for water pumps. The cooking surface is machined smoother than most cast iron, so the seasoning builds quickly and eggs release after a few weeks of use.',
      'It works on gas, electric and induction hobs, in the oven and over a fire. A skillet that has rusted or lost its seasoning can be saved: we strip and reseason them at the shop for the price of the oil.',
    ],
  },
  {
    name: 'Leather card holder',
    slug: 'leather-card-holder',
    category: 'Carry',
    price: 55,
    inStock: true,
    description:
      'A slim holder for four to six cards in vegetable-tanned leather, stitched with waxed thread. It darkens and shines where your hand holds it.',
    material: 'Vegetable-tanned cowhide, 1.4 mm. Waxed linen thread.',
    dimensions: '10.5 × 7.5 cm. Two outer pockets and a centre slot.',
    origin: 'Lisbon, Portugal',
    care: 'Keep it dry. A little neutral leather balm once a year.',
    delivery: SHIPS,
    story: [
      'Cut from the offcuts of our bag handles, so none of the hide is wasted. Each holder is saddle stitched by hand at the workshop with two needles and one waxed thread, a stitch that holds even if a single loop is cut.',
      'The leather is tanned with tree bark over several weeks, which leaves it firm and pale at first. Within a few months it takes on the colour of your pocket.',
    ],
  },
  {
    name: 'Heavyweight T-shirt',
    slug: 'heavyweight-t-shirt',
    category: 'Wear',
    price: 38,
    inStock: true,
    description:
      'A white T-shirt in dense organic cotton jersey with a narrow ribbed collar that keeps its shape. Straight cut, slightly longer at the back.',
    material: 'Organic cotton jersey, 240 g/m².',
    dimensions: 'Sizes XS to XXL. Size M: 71 cm back length, 54 cm across the chest.',
    origin: 'Barcelos, Portugal',
    care: 'Wash at 40 °C and dry flat or on a line. Allow 3% shrinkage on the first wash.',
    delivery: SHIPS,
    story: [
      'Knitted and sewn by a family firm in Barcelos that has made T-shirts for other labels for three generations. The jersey is heavier than most, which keeps a white T-shirt from turning sheer and lets the collar lie flat after hundreds of washes.',
      'We make it in white only, because white is the one we wear. The body is cut straight, so take a size up for a looser fit.',
    ],
  },
  {
    name: 'Striped wool blanket',
    slug: 'striped-wool-blanket',
    category: 'Living',
    price: 190,
    inStock: true,
    description:
      'A heavy blanket in undyed wool with indigo stripes and hand-knotted fringes. Large enough for the foot of a double bed or the back of a sofa.',
    material: 'Serra da Estrela wool, undyed, with indigo-dyed stripes.',
    dimensions: '130 × 190 cm, plus 8 cm of fringe at each end.',
    weight: '1.6 kg',
    origin: 'Manteigas, Portugal',
    care: 'Air it outside rather than washing it. Hand wash cold with wool soap if needed and dry flat.',
    delivery: SHIPS,
    story: [
      'Woven on a shuttle loom in Manteigas, a mountain town where wool has been washed in the river Zêzere for five hundred years. The mill buys fleece from shepherds in the Serra da Estrela and spins it without bleaching, so the cream of the blanket is the colour of the sheep.',
      'The stripes are dyed with indigo in small lots, and the fringes are knotted by hand as each blanket comes off the loom. Wool this dense keeps out a draught and seldom needs washing: a dry day on a line is enough.',
    ],
  },
  {
    name: 'Porcelain pour-over set',
    slug: 'porcelain-pour-over-set',
    category: 'Kitchen',
    price: 72,
    inStock: true,
    description:
      'A porcelain dripper and a 600 ml glass carafe with a cork collar, for two large cups at a time. The dripper takes size 2 paper filters.',
    material: 'Porcelain, borosilicate glass, natural cork.',
    capacity: '600 ml, two large cups.',
    dimensions: 'Carafe 19 cm high. Dripper 11.5 cm across.',
    origin: 'Porcelain from Ílhavo, Portugal. Glass from Bohemia, Czech Republic.',
    care: 'Dishwasher safe once the cork collar is lifted off. Wipe the cork dry.',
    delivery:
      'Ships from Lisbon within two working days, packed in recycled paper. Free returns within 30 days.',
    story: [
      'The dripper is made at a porcelain works in Ílhavo that has supplied restaurants in Porto since the 1950s. Its ribs are cut deep enough that the paper never seals against the wall, so the water runs through evenly and a pour takes about three minutes.',
      'The carafe is mouth-blown borosilicate glass and can sit on a gas flame at low heat to keep coffee warm. The cork collar lets you hold it by the neck without a cloth.',
    ],
  },
  {
    name: 'Canvas shoulder bag',
    slug: 'canvas-shoulder-bag',
    category: 'Carry',
    price: 165,
    inStock: true,
    description:
      'A roomy bag in tan cotton canvas with bridle leather handles and a detachable strap. Wide enough for a laptop and a change of clothes.',
    material: 'Cotton canvas, 18 oz. Vegetable-tanned bridle leather. Steel hooks.',
    dimensions: '40 × 34 × 14 cm. The strap adjusts from 90 to 130 cm.',
    weight: '1.1 kg',
    origin: 'Lisbon, Portugal',
    care: 'Brush off dust and spot clean with cold water. Condition the leather once a year.',
    delivery: SHIPS,
    story: [
      'We cut and sew this bag in our own workshop behind the shop, twelve at a time. The canvas is a heavy cotton duck that holds its shape when the bag is empty and relaxes as it fills, and each handle is one length of bridle leather riveted through both layers.',
      'Every seam that carries weight is stitched twice. The strap clips off with two steel hooks, so the bag goes by hand on a train and over the shoulder on a bicycle. We keep spare straps and hooks at the workshop for as long as we make the bag.',
    ],
  },
  {
    name: 'Field jacket',
    slug: 'field-jacket',
    category: 'Wear',
    price: 245,
    inStock: true,
    description:
      'A four-pocket jacket in olive cotton drill, cut long enough to cover a sweater and loose enough to wear over one. Corozo buttons and a stand collar.',
    material: 'Cotton drill, 280 g/m², garment washed. Corozo nut buttons.',
    dimensions: 'Sizes XS to XL. Size M: 74 cm back length, 58 cm across the chest.',
    origin: 'Guimarães, Portugal',
    care: 'Wash at 30 °C inside out, line dry, iron warm.',
    delivery: SHIPS,
    story: [
      'The pattern comes from a work jacket that one of our tailors in Guimarães wore for twenty years. We kept its proportions, raised the chest pockets two centimetres so they clear a bag strap, and chose corozo buttons, which survive a hot wash and can be sewn back on at the shop.',
      'The drill is woven for us in runs of four hundred metres and washed once before cutting, so the jacket will not shrink after it reaches you. It softens and fades along the seams over a few years of wear. When a pocket tears or a cuff frays, send it back and we will mend it.',
    ],
  },
]

export interface StoreDemoCategory {
  readonly name: ProductCategory
  readonly slug: string
  readonly summary: string
  /** The product whose photograph stands for the category: never one of the four on the home page's grid. */
  readonly photoOf: string
  readonly relatedTitle: string
  readonly makers: readonly string[]
}

export const STORE_DEMO_CATEGORIES: readonly StoreDemoCategory[] = [
  {
    name: 'Wear',
    slug: 'wear',
    summary:
      'Jackets, shirts and knitwear cut in Guimarães, Barcelos and Covilhã, and mended at the shop when they tear.',
    photoOf: 'cable-knit-beanie',
    relatedTitle: 'More to wear',
    makers: [
      'Our clothes come from three workshops in the north of Portugal, each of which has sewn or knitted for larger labels for decades. We choose cloth with them, agree a pattern, and order in runs small enough to sell within a season.',
      'Every garment is sold with the promise we make for everything in the shop: if a seam opens, a pocket tears or a button goes, bring it or send it back and we will repair it for as long as we sell the piece.',
    ],
  },
  {
    name: 'Carry',
    slug: 'carry',
    summary:
      'Bags and small leather goods, most of them cut and sewn at our own workshop behind the shop in Lisbon.',
    photoOf: 'leather-card-holder',
    relatedTitle: 'More to carry',
    makers: [
      'Canvas comes from a mill in Guimarães and leather from a vegetable tannery in Alcanena. Both are cut on the long table at the back of the shop, and anyone buying a bag can watch the next one being sewn.',
      'We keep spare straps, hooks and rivets for everything we have made, so a bag can be put right long after the batch it came from has sold out.',
    ],
  },
  {
    name: 'Kitchen',
    slug: 'kitchen',
    summary:
      'Cookware and tableware from a foundry, a porcelain works and an enamel maker, for use every day.',
    photoOf: 'cast-iron-skillet',
    relatedTitle: 'More for the kitchen',
    makers: [
      'Nothing in the kitchen range is coated, and nothing needs to be handled gently. Cast iron, porcelain, glass and enamelled steel all last for decades when they are used every day, which is the only way we test them.',
      'We cook with every piece at the shop before we sell it, and we reseason skillets for customers for the price of the oil.',
    ],
  },
  {
    name: 'Living',
    slug: 'living',
    summary:
      'Blankets and table linen woven on old looms in Manteigas and Guimarães, from wool and flax left undyed.',
    photoOf: 'linen-table-runner',
    relatedTitle: 'More for the house',
    makers: [
      'Our blankets and linens come from two weaving mills that still run shuttle looms, slower than modern machines and able to weave a denser cloth with a finished edge.',
      'The mills weave for us twice a year, in spring and in autumn, so a piece that sells out comes back with the next season.',
    ],
  },
]

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type Media = Readonly<Record<string, string>>

export interface StoreDemoOptions {
  readonly siteName?: string
  readonly media?: Media
}

function productsGrid(
  key: string,
  options: { readonly title?: string; readonly category?: ProductCategory; readonly limit: number },
): VocabularyBlock {
  return {
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    ...(options.title === undefined ? {} : { title: options.title }),
    collection: 'product',
    ...(options.category === undefined ? {} : { filter: { category: options.category } }),
    sort: { field: 'createdAt', direction: 'desc' },
    limit: options.limit,
    layout: 'grid',
  } as VocabularyBlock
}

const COMMITMENTS: VocabularyBlock = {
  _key: 'commitments',
  _type: 'featureGrid',
  _version: BLOCK_VERSION,
  items: [
    {
      _key: 'commitment-delivery',
      title: 'Delivery across the EU in 2 to 5 working days',
      link: { href: '/delivery-and-returns' },
    },
    {
      _key: 'commitment-returns',
      title: '30 days to return anything unworn',
      link: { href: '/delivery-and-returns' },
    },
    {
      _key: 'commitment-repairs',
      title: 'Repairs for as long as we sell the piece',
      link: { href: '/repairs' },
    },
  ],
} as VocabularyBlock

function withKey(block: VocabularyBlock, key: string): VocabularyBlock {
  return { ...block, _key: key }
}

/** The body of one product's page: how it is made, then more from its category. */
export function storeProductBlocks(demo: StoreDemoProduct): readonly VocabularyBlock[] {
  const group = STORE_DEMO_CATEGORIES.find((candidate) => candidate.name === demo.category)
  return [
    prose(`product-${demo.slug}-story`, [...demo.story]),
    productsGrid(`product-${demo.slug}-more`, {
      title: group?.relatedTitle ?? 'More from the shop',
      category: demo.category,
      limit: 5,
    }),
  ]
}

/** The body of a category's page: its goods, then the people who make them. */
export function storeCategoryBlocks(demo: StoreDemoCategory): readonly VocabularyBlock[] {
  return [
    productsGrid(`category-${demo.slug}-goods`, { category: demo.name, limit: 24 }),
    prose(`category-${demo.slug}-makers`, [...demo.makers]),
  ]
}

export function buildStoreHomeBlocks(options: StoreDemoOptions = {}): readonly VocabularyBlock[] {
  const media = options.media ?? {}
  const siteName = nameOf(options.siteName)
  const letters = shopEmail(siteName, 'letters')
  return [
    {
      _key: 'home-banner',
      _type: 'hero',
      _version: BLOCK_VERSION,
      title: 'Things for every day, made to last and to be mended',
      subtitle:
        'Clothing, bags and kitchenware from eleven small workshops in Portugal and beyond, sold from our shop in Lisbon and sent across Europe.',
      ...(media.hero === undefined ? {} : { media: media.hero }),
      actions: [{ label: 'Shop the collection', target: { href: '/shop' }, emphasis: 'primary' }],
    } as VocabularyBlock,
    {
      _key: 'home-categories',
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      collection: 'category',
      sort: { field: 'createdAt', direction: 'asc' },
      limit: 4,
      layout: 'grid',
    } as VocabularyBlock,
    productsGrid('home-new', { title: 'New this season', limit: 4 }),
    withKey(COMMITMENTS, 'home-commitments'),
    ...(media.story === undefined
      ? []
      : [
          {
            _key: 'home-story',
            _type: 'mediaFigure',
            _version: BLOCK_VERSION,
            media: media.story,
            ratio: '1:1',
            align: 'start',
            caption: `${siteName} opened in 2014 as a repair bench at the back of a haberdashery on Rua da Boavista. We still mend what we sell, and we only sell what our workshops make to be mended.`,
            credit: 'Enamel mug, made in Olkusz',
          } as VocabularyBlock,
        ]),
    {
      _key: 'home-letter',
      _type: 'testimonial',
      _version: BLOCK_VERSION,
      quote: answer(
        'home-letter-quote',
        'I bought the field jacket in 2016 and sent it back last winter with a torn pocket and two buttons missing. It came home three weeks later with both put right and a note saying who had sewn them.',
      ),
      attribution: { name: 'Helena Duarte', role: 'Field jacket, bought in 2016' },
    } as VocabularyBlock,
    {
      _key: 'home-faq',
      _type: 'faq',
      _version: BLOCK_VERSION,
      title: 'Before you order',
      items: questions('home-faq', [
        [
          'How do I place an order?',
          'Use the order button on a product page to write to us, or come to the shop. We reply within one working day with the total, delivery included, and a secure payment link. Nothing is charged until you confirm.',
        ],
        [
          'How long does delivery take?',
          'Two to three working days in mainland Portugal and three to five across the rest of the European Union. Orders confirmed before noon leave Lisbon the same day.',
        ],
        [
          'Can I collect my order from the shop?',
          'Yes. Ask for collection when you write, and your order will be waiting at Rua da Boavista 84 from the next day, Tuesday to Saturday.',
        ],
        [
          'What if something does not fit?',
          'Send it back unworn within 30 days for a refund or another size. Returns are free within Portugal, and from elsewhere in the EU we refund the cost of the cheapest tracked service.',
        ],
      ]),
    } as VocabularyBlock,
    {
      _key: 'home-letters',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: 'Letters from the workshop',
      text: 'Four letters a year about new batches, repairs and the people who make our goods. Write to us and we will add you to the list.',
      actions: [
        {
          label: 'Ask for the letters',
          target: {
            href: `mailto:${letters}?subject=${encodeURIComponent('Letters from the workshop')}`,
          },
          emphasis: 'secondary',
        },
      ],
    } as VocabularyBlock,
  ]
}

export interface StoreDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home`, `shop` (every product), `about`, `how-to-order`,
 * `delivery-and-returns`, `repairs`, `contact` and `terms`: every page the
 * menus and the copy link to.
 */
export function buildStoreDemoPages(options: StoreDemoOptions = {}): readonly StoreDemoPage[] {
  const media = options.media ?? {}
  const siteName = nameOf(options.siteName)
  const hello = shopEmail(siteName)
  const orders = shopEmail(siteName, 'orders')
  const repairs = shopEmail(siteName, 'repairs')
  const letters = shopEmail(siteName, 'letters')

  return [
    { title: 'Home', slug: 'home', blocks: buildStoreHomeBlocks({ siteName, media }) },
    {
      title: 'Shop',
      slug: 'shop',
      blocks: [productsGrid('shop-all', { limit: 48 }), withKey(COMMITMENTS, 'shop-commitments')],
    },
    {
      title: 'About',
      slug: 'about',
      blocks: [
        prose('about-intro', [
          `${siteName} began in 2014 as a repair bench at the back of a haberdashery on Rua da Boavista in Lisbon. People brought in coats with broken zips and bags with torn straps, and after a year of mending other people's things we started to make our own, built so that they could be mended too.`,
          'Today the shop sells about sixty pieces from eleven workshops. Most of them are in the north of Portugal, within a day of each other by train: a tailoring firm in Guimarães, a knitter in Covilhã, a weaving mill in Manteigas, a foundry near Aveiro. We visit each of them at least twice a year, and we buy in runs small enough to sell through before the next season.',
          '## How we choose what to sell',
          'A piece comes into the shop when we have used it long enough to know how it wears, and when the person who made it can supply the parts to repair it. That rules out most things with glued soles, coated pans and zips we cannot replace. It also means the range changes slowly and some pieces sell out for months at a time.',
          'We pay our workshops before the goods are delivered and publish the price we paid on request. Nothing is made in a quantity we cannot sell, so nothing is ever put on sale to clear a warehouse.',
        ]),
        ...(media.hero === undefined
          ? []
          : [
              {
                _key: 'about-figure',
                _type: 'mediaFigure',
                _version: BLOCK_VERSION,
                media: media.hero,
                ratio: '21:9',
                align: 'wide',
                caption:
                  'A canvas tote, a lambswool beanie and a card holder, all made within a day of Lisbon.',
              } as VocabularyBlock,
            ]),
        {
          _key: 'about-figures',
          _type: 'stats',
          _version: BLOCK_VERSION,
          title: 'The shop in numbers',
          items: [
            {
              _key: 'about-figure-workshops',
              value: '11',
              label: 'workshops we buy from, nine of them in Portugal',
            },
            {
              _key: 'about-figure-repairs',
              value: '1,380',
              label: 'repairs done at the bench last year',
            },
            {
              _key: 'about-figure-opened',
              value: '2014',
              label: 'the year we opened on Rua da Boavista',
            },
          ],
        } as VocabularyBlock,
        {
          _key: 'about-visit',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Visit the shop and the repair bench',
          text: 'Rua da Boavista 84, Lisbon. Open Tuesday to Saturday, 11:00 to 19:00.',
          actions: [
            {
              label: 'Opening hours and directions',
              target: { href: '/contact' },
              emphasis: 'secondary',
            },
          ],
        } as VocabularyBlock,
      ],
    },
    {
      title: 'How to order',
      slug: 'how-to-order',
      blocks: [
        prose('order-intro', [
          'We sell through the shop and by email, so that every order is read by the person who will pack it. It takes a little longer than a checkout and it means we can answer a question about size or delivery before you pay.',
          '## Ordering by email',
          `Use the order button on any product page, or write to [${orders}](mailto:${orders}) with the pieces, the sizes and the delivery address. We reply within one working day, Tuesday to Saturday, with the total including delivery and a secure payment link by card or MB WAY. Your order leaves Lisbon as soon as the payment arrives.`,
          '## Ordering at the shop',
          'Everything on the site is in the shop at Rua da Boavista 84, and most sizes can be tried on. We can also keep an item aside for a week if you tell us when you plan to come.',
        ]),
        {
          _key: 'order-notes',
          _type: 'accordion',
          _version: BLOCK_VERSION,
          title: 'Payment and delivery',
          items: questions('order-notes', [
            [
              'Which payment methods do you accept?',
              'Visa, Mastercard and MB WAY through a payment link, bank transfer to our account in Lisbon, and cash or card at the shop. Prices include Portuguese VAT.',
            ],
            [
              'What does delivery cost?',
              'Delivery is €5 in mainland Portugal and €12 to the rest of the EU, free on orders over €150. Blankets and skillets travel by tracked courier at the same price.',
            ],
            [
              'Do you send orders outside the European Union?',
              'We send to the United Kingdom, Switzerland and Norway at cost. Import duties and taxes are paid by the recipient on arrival, and we tell you the estimate before you pay.',
            ],
            [
              'Can you wrap a gift?',
              'Yes, in brown paper and cotton string, with a card written by hand if you send us the words. It costs nothing.',
            ],
          ]),
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Delivery and returns',
      slug: 'delivery-and-returns',
      blocks: [
        prose('delivery-intro', [
          'Orders leave the shop in Lisbon every working day at 14:00, packed in recycled paper and card with no plastic. You receive a tracking number by email when the parcel is collected.',
        ]),
        {
          _key: 'delivery-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Delivery and returns',
          items: questions('delivery-faq', [
            [
              'How long does delivery take?',
              'Two to three working days in mainland Portugal, three to five working days to the rest of the European Union, and five to eight to the United Kingdom, Switzerland and Norway.',
            ],
            [
              'How do I return something?',
              `Write to [${orders}](mailto:${orders}) within 30 days of delivery with your order number. We send a prepaid label for returns within Portugal, and an address for returns from elsewhere.`,
            ],
            [
              'When will I be refunded?',
              'Within five working days of the parcel reaching us, to the card or account you paid from. Delivery costs are refunded when the whole order is returned.',
            ],
            [
              'Can I exchange a size?',
              'Yes. Tell us the size you need when you write, and we send it as soon as the first piece is on its way back to us.',
            ],
            [
              'What cannot be returned?',
              'Pieces that have been worn, washed or altered, and anything we have repaired or made to order for you.',
            ],
          ]),
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Repairs',
      slug: 'repairs',
      blocks: [
        prose('repairs-intro', [
          'We repair everything we sell for as long as we sell it, and most things long after. The bench is at the back of the shop, and two of us work at it every afternoon.',
          '## What we mend',
          'Seams, pockets, cuffs and buttons on clothing. Straps, hooks, rivets and stitching on bags and leather. Rust and lost seasoning on cast iron. Moth holes in knitwear, if they are small enough to darn.',
          '## What it costs',
          'Repairs to anything bought from us in the last two years are free. After that we charge for the materials and nothing for the time, which comes to between €5 and €25 for most repairs. We tell you the price before we start.',
          '## How to send something in',
          `Bring it to the shop, or write to [${repairs}](mailto:${repairs}) with a photograph of the damage. We reply with the price, the time it will take (usually two to three weeks) and the address to post it to.`,
        ]),
        {
          _key: 'repairs-figures',
          _type: 'statCounter',
          _version: BLOCK_VERSION,
          title: 'Last year at the bench',
          stats: [
            { _key: 'repairs-figure-total', value: '1,380', label: 'repairs completed' },
            { _key: 'repairs-figure-free', value: '62%', label: 'done free of charge' },
            {
              _key: 'repairs-figure-days',
              value: '16',
              label: 'days on average from arrival to return',
            },
          ],
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Contact',
      slug: 'contact',
      blocks: [
        prose('contact-details', [
          '## The shop',
          'Rua da Boavista 84, 1200-066 Lisboa, Portugal. Five minutes on foot from Cais do Sodré station and the 28 tram.',
          'Tuesday to Saturday, 11:00 to 19:00. Closed on Sundays, Mondays and public holidays.',
          '## Writing to us',
          `For orders, [${orders}](mailto:${orders}). For repairs, [${repairs}](mailto:${repairs}). For our letters from the workshop, four a year, [${letters}](mailto:${letters}). For anything else, including workshops that would like to work with us, [${hello}](mailto:${hello}).`,
          'Telephone +351 213 460 218, Tuesday to Saturday during opening hours.',
        ]),
      ],
    },
    {
      title: 'Terms and privacy',
      slug: 'terms',
      blocks: [
        prose('terms', [
          `These terms apply to every order placed with ${siteName}, Lda., Rua da Boavista 84, 1200-066 Lisboa, registered in Portugal under NIPC 516 204 873.`,
          '## Orders and prices',
          'An order is confirmed when we have received payment and replied to say so. Prices are in euros and include VAT at the Portuguese rate. Delivery costs are stated before payment.',
          '## Your right to cancel',
          'You may cancel an order within 14 days of receiving it without giving a reason, as the law of the European Union provides, and our own returns period of 30 days extends that right. Refunds are made within 14 days of the goods reaching us.',
          '## Guarantee',
          'Every piece carries the legal guarantee of conformity of three years. Our repair service is offered in addition to it and does not replace it.',
          '## Privacy',
          `We keep your name, address and email for as long as it takes to deliver, return or repair an order, and for the ten years Portuguese tax law requires us to keep invoices. We never sell or share them except with the carrier delivering your parcel. Write to [${hello}](mailto:${hello}) to see or delete what we hold. This site sets no advertising or tracking cookies.`,
        ]),
      ],
    },
  ]
}

// ---------------------------------------------------------------------------
// Media, menus, settings
// ---------------------------------------------------------------------------

/**
 * `store`'s own starting skin, asserted present with a real check since
 * `STARTING_SKINS` is keyed by blueprint id. Its palette only feeds the
 * procedural fallback of each media slot below, which is never used while
 * the photographs are bundled.
 */
function storePalette(): Palette {
  const skin = STARTING_SKINS.store
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.store is missing.',
      hint: 'The "store" entry must stay declared in starting-skins.ts for this blueprint to render its fallback art.',
    })
  }
  return skin.color
}

const PRODUCT_ALT: Readonly<Record<string, string>> = {
  'linen-table-runner': 'White linen runner with fringed ends laid along a dark oak table',
  'enamel-mug': 'Forest green enamel mug with a steel rim on a wooden table',
  'cable-knit-beanie': 'Charcoal cable-knit lambswool beanie against a white wall',
  'canvas-tote': 'Undyed cotton canvas tote with long handles standing on its base',
  'brushed-cotton-overshirt':
    'Grey brushed cotton overshirt with a button-down collar and chest pocket',
  'cast-iron-skillet': 'Black cast-iron skillet with a pouring lip, seen from above at an angle',
  'leather-card-holder':
    'Tan vegetable-tanned leather card holder with hand stitching and two cards inside',
  'heavyweight-t-shirt': 'White heavyweight cotton T-shirt laid flat on a pale grey ground',
  'striped-wool-blanket': 'Folded cream wool blanket with navy stripes and a knotted fringe',
  'porcelain-pour-over-set':
    'Porcelain coffee dripper resting on a glass carafe with a cork collar',
  'canvas-shoulder-bag':
    'Tan canvas shoulder bag with brown leather handles and a detachable strap',
  'field-jacket': 'Olive cotton drill field jacket with four pockets and a stand collar',
}

/**
 * Every visual this blueprint seeds is a bundled photograph: the banner, one
 * per product, one per category (the photograph of a product from that
 * category that is not on the home page's grid) and the brand story's.
 * `spec` is `seedDemoMedia`'s fallback if a file is ever missing, never the
 * intended picture.
 */
export const STORE_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(storePalette(), 'blocks', 11),
    alt: 'A canvas tote, a knitted beanie and a leather card holder laid out on undyed linen',
    photo: 'store/hero.jpg',
  },
  ...STORE_DEMO_CATEGORIES.map(
    (demo, index): DemoMediaSpec => ({
      name: `category-${demo.slug}`,
      spec: coverArt(storePalette(), 50 + index),
      alt: PRODUCT_ALT[demo.photoOf] ?? demo.name,
      photo: `store/${demo.photoOf}.jpg`,
    }),
  ),
  {
    name: 'story',
    spec: coverArt(storePalette(), 60),
    alt: PRODUCT_ALT['enamel-mug'] as string,
    photo: 'store/enamel-mug.jpg',
  },
  ...STORE_DEMO_PRODUCTS.map(
    (demo, index): DemoMediaSpec => ({
      name: `product-${demo.slug}`,
      spec: productArt(storePalette(), index + 1),
      alt: PRODUCT_ALT[demo.slug] ?? demo.name,
      photo: `store/${demo.slug}.jpg`,
    }),
  ),
]

export const STORE_MENUS: BlueprintMenus = {
  header: [
    { label: 'Shop', url: '/shop' },
    ...STORE_DEMO_CATEGORIES.map((demo) => ({ label: demo.name, url: `/category/${demo.slug}` })),
    { label: 'About', url: '/about' },
  ],
  footer: [
    { label: 'About', url: '/about' },
    { label: 'How to order', url: '/how-to-order' },
    { label: 'Delivery and returns', url: '/delivery-and-returns' },
    { label: 'Repairs', url: '/repairs' },
    { label: 'Contact', url: '/contact' },
    { label: 'Terms and privacy', url: '/terms' },
  ],
  headerAction: { label: 'How to order', url: '/how-to-order' },
}

/**
 * The widgets a shop's site places, and where.
 *
 * A product page stays a product page: its photograph and its sheet, then
 * the story of the piece and a grid of more from its category, which the
 * product's own blocks already draw. So no side column beside a product and
 * no "you may also like" strip under it; the same for a category (a grid of
 * goods across the page), the shop, the home page and "About", which lay
 * their photographs across the whole grid.
 *
 * Beside the pages a customer reads before and after an order (how to order,
 * delivery and returns, repairs, contact, terms): the customer care pages as
 * a ruled list with the page being read marked, and, on every one of them
 * except the contact page itself, a line pointing to that page. Beside search
 * results: the newest pieces with their photographs, so a search that finds
 * nothing still leads somewhere, then the same customer care pages.
 *
 * In the footer, what its three columns do not already say: the shop's
 * telephone (the footer note gives the address and the opening hours, never
 * the number), and the letters from the workshop, which only the home page
 * mentions. Neither shows on the page that already says the same: the contact
 * page for both, the home page for the letters.
 *
 * No widget names an e-mail address: the pages derive every address from the
 * site's name, and a widget's settings cannot, so it would contradict them on
 * any shop not called Atelier Goods.
 */
type StorePageTarget =
  | { readonly kind: 'home' }
  | { readonly kind: 'search' }
  | { readonly kind: 'path'; readonly path: string }

const HOME: StorePageTarget = { kind: 'home' }
const SEARCH_RESULTS: StorePageTarget = { kind: 'search' }
const pagePath = (path: string): StorePageTarget => ({ kind: 'path', path })

const CUSTOMER_CARE_PAGES = [
  { label: 'How to order', href: '/how-to-order' },
  { label: 'Delivery and returns', href: '/delivery-and-returns' },
  { label: 'Repairs', href: '/repairs' },
  { label: 'Contact', href: '/contact' },
  { label: 'Terms and privacy', href: '/terms' },
] as const

function shownOn(
  mode: 'only' | 'except',
  ...targets: readonly StorePageTarget[]
): Readonly<Record<string, unknown>> {
  return { pages: { mode, targets } }
}

export const STORE_WIDGETS: readonly BlueprintWidget[] = [
  {
    area: 'sidebar',
    type: 'recentEntries',
    title: 'New in the shop',
    settings: { collection: 'product', count: 4, showDate: false, showImage: true },
    visibility: shownOn('only', SEARCH_RESULTS),
  },
  {
    area: 'sidebar',
    type: 'links',
    title: 'Customer care',
    settings: { items: CUSTOMER_CARE_PAGES.map((item) => ({ ...item })) },
    visibility: shownOn(
      'only',
      ...CUSTOMER_CARE_PAGES.map((item) => pagePath(item.href)),
      SEARCH_RESULTS,
    ),
  },
  {
    area: 'sidebar',
    type: 'cta',
    title: 'Before you order',
    settings: {
      heading: 'A question about a size or a delivery',
      body: 'Write to us or call the shop. We reply within one working day, Tuesday to Saturday, and nothing is charged until you confirm.',
      label: 'Contact the shop',
      href: '/contact',
    },
    visibility: shownOn(
      'only',
      ...CUSTOMER_CARE_PAGES.filter((item) => item.href !== '/contact').map((item) =>
        pagePath(item.href),
      ),
    ),
  },
  {
    area: 'footer-1',
    type: 'contact',
    title: 'Call the shop',
    settings: {
      phone: '+351 213 460 218',
      hours: [{ label: 'Answered', value: 'Tuesday to Saturday, during opening hours' }],
    },
    visibility: shownOn('except', pagePath('/contact')),
  },
  {
    area: 'footer-2',
    type: 'cta',
    title: 'Letters from the workshop',
    settings: {
      heading: 'Four letters a year',
      body: 'New batches, repairs and the people who make our goods, written from the bench in Lisbon.',
      label: 'How to ask for them',
      href: '/contact',
    },
    visibility: shownOn('except', HOME, pagePath('/contact')),
  },
]

export const STORE_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Everyday goods, made to last and to be mended.',
  'general.socialLinks': [
    { label: 'Instagram', url: 'https://instagram.com/example' },
    { label: 'Pinterest', url: 'https://pinterest.com/example' },
  ],
  'general.footerNote':
    'Rua da Boavista 84, 1200-066 Lisboa, Portugal. Shop and repair bench open Tuesday to Saturday, 11:00 to 19:00.\n\nRegistered in Portugal as a private limited company, NIPC 516 204 873.',
  // A catalogue is not a discussion: no comment form under a product. An
  // editor can open comments again per collection or per entry.
  'discussion.enabled': false,
}

export const STORE_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized product photography before it slows the shop grid down.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits product pages so each one is findable by name, not only from the grid.',
  },
]

/** The email address a product's order button writes to, with the product in the subject line. */
export function orderLinkFor(siteName: string | undefined, productName: string): string {
  return `mailto:${shopEmail(nameOf(siteName), 'orders')}?subject=${encodeURIComponent(`Order: ${productName}`)}`
}

/**
 * Inserts the blueprint's content through the real `ContentStore`, never
 * mocked (house rule): categories first (the home page lists them in that
 * order), then the products oldest first, then the pages. Everything is
 * published, so every list and every link has something real behind it.
 */
async function seedStoreDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const siteName = nameOf(ctx.siteName)
  const categoryStore = createContentStore({ db, collection: category, defaultLocale })
  const productStore = createContentStore({ db, collection: product, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of STORE_DEMO_CATEGORIES) {
    const photo = media[`category-${demo.slug}`]
    await categoryStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        name: demo.name,
        slug: demo.slug,
        summary: demo.summary,
        ...(photo === undefined ? {} : { photo }),
      },
      blocks: { blocks: storeCategoryBlocks(demo).map(toBlockZoneEntry) },
    })
  }

  for (const demo of STORE_DEMO_PRODUCTS) {
    const photo = media[`product-${demo.slug}`]
    await productStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        price: demo.price,
        currency: 'EUR',
        category: demo.category,
        inStock: demo.inStock,
        material: demo.material,
        dimensions: demo.dimensions,
        ...(demo.weight === undefined ? {} : { weight: demo.weight }),
        ...(demo.capacity === undefined ? {} : { capacity: demo.capacity }),
        origin: demo.origin,
        care: demo.care,
        delivery: demo.delivery,
        orderLink: orderLinkFor(siteName, demo.name),
        ...(photo === undefined ? {} : { photo }),
      },
      blocks: { blocks: storeProductBlocks(demo).map(toBlockZoneEntry) },
    })
  }

  for (const demo of buildStoreDemoPages({ siteName, media })) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const storeContentPack: BlueprintContentPack = {
  collections: STORE_COLLECTIONS,
  recommendedAgents: STORE_RECOMMENDED_AGENTS,
  seedDemoContent: seedStoreDemoContent,
  defaultTheme: '@cogenta/theme-ecommerce',
  menus: STORE_MENUS,
  widgets: STORE_WIDGETS,
  siteSettings: STORE_SITE_SETTINGS,
  mediaSpecs: STORE_MEDIA_SPECS,
}
