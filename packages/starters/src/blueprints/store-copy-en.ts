import type { StoreCopy } from './store-copy.js'

const SHIPS = 'Ships from Lyon within two working days. Free returns within 30 days.'

/** The `store` blueprint in English: the same shop of the Croix-Rousse, in Lyon. */
export const STORE_COPY_EN: StoreCopy = {
  locale: 'en',
  defaultShopName: 'Atelier Goods',
  schema: {
    routes: { product: '/shop/:slug', category: '/category/:slug' },
    labels: {
      product: { singular: 'Product', plural: 'Products' },
      category: { singular: 'Category', plural: 'Categories' },
    },
  },
  pageSlugs: {
    home: 'home',
    shop: 'shop',
    about: 'about',
    order: 'how-to-order',
    delivery: 'delivery-and-returns',
    repairs: 'repairs',
    contact: 'contact',
    terms: 'terms',
    credits: 'photo-credits',
  },
  categories: [
    {
      id: 'kitchen',
      slug: 'kitchen',
      name: 'Kitchen',
      summary:
        'Iron, copper, enamel and aluminium: tools that are used every day, bought from workshops that also supply the spare parts.',
      photoOf: 'skillet',
      relatedTitle: 'More for the kitchen',
      makers: [
        'Nothing in the kitchen range is coated, and nothing needs to be handled gently. Cast iron, copper, enamel and aluminium last for decades when they are used every day, which is the only way we test them.',
        'We cook with every piece at the shop before we sell it, and we reseason customers’ skillets for the price of the oil.',
      ],
    },
    {
      id: 'home',
      slug: 'homeware',
      name: 'Homeware',
      summary:
        'A crocheted throw, a stoneware vase, a turned wooden bowl and a soap dried for three years: things made by hand, one at a time, in small workshops.',
      photoOf: 'stoneware-bottles',
      relatedTitle: 'More homeware',
      makers: [
        'What we sell for the home comes from four workshops of fewer than five people, in La Borne, Saint-Claude, Roanne and Tripoli. Each piece is made on its own, and two vases thrown on the same day never quite match.',
        'These workshops make in short runs, two or three times a year. A piece that sells out comes back with the next run, and we write to everyone who asked us to.',
      ],
    },
    {
      id: 'carry',
      slug: 'wear-and-carry',
      name: 'Wear and carry',
      summary:
        'Leather and wool for the back, the feet and the hands: boots that can be resoled, a travel bag, a wallet and a sweater that can be darned.',
      photoOf: 'leather-duffel',
      relatedTitle: 'More to wear and carry',
      makers: [
        'The leather comes from a bark tannery in the Drôme and the wool from a knitting mill in the Aube. The boots and the travel bag are made up in Romans-sur-Isère, and the wallet is sewn at our own bench behind the shop.',
        'Every piece is repaired for as long as we sell it: a seam, a buckle, a sole, the end of a sleeve. Bring it to the bench or post it to us and we will put it right.',
      ],
    },
  ],
  products: [
    {
      key: 'enamel-mug',
      slug: 'enamel-mug',
      name: 'Enamel mug',
      category: 'kitchen',
      price: 22,
      inStock: true,
      description:
        'A 350 ml mug in white enamelled steel with a black line along its rolled rim. Light enough for a rucksack and good enough for the table.',
      material: 'White enamelled steel, black rim.',
      capacity: '350 ml',
      dimensions: '8.5 cm across, 8 cm high.',
      origin: 'Olkusz, Poland',
      care: 'Dishwasher safe. A chip in the enamel does not spread, so keep using it.',
      delivery: SHIPS,
      story: [
        'Pressed and enamelled in Olkusz, a town that has made enamelware for more than a century. Each mug is dipped twice and fired at 800 °C, which gives the enamel its depth and a surface that coffee will not stain.',
        'It can go on a camping stove and in the oven. We drink from these at the shop counter every morning, and some of ours have been in daily use for six years.',
      ],
      alt: 'White enamel mug with a black rim, seen from three quarters on a pale ground',
    },
    {
      key: 'skillet',
      slug: 'cast-iron-skillet',
      name: 'Cast-iron skillet',
      category: 'kitchen',
      price: 89,
      inStock: true,
      description:
        'A 26 cm skillet cast in one piece, with a pouring lip on each side and a small helper handle. Seasoned with linseed oil and ready to cook with.',
      material: 'Cast iron, seasoned with three coats of linseed oil.',
      dimensions: '26 cm across, 5 cm deep, 45 cm with the handle.',
      weight: '2.6 kg',
      origin: 'Ardennes, France',
      care: 'Rinse with hot water and a brush, dry on the hob, wipe with a drop of oil. Keep it out of the dishwasher.',
      delivery:
        'Ships from Lyon within two working days by tracked courier. Free returns within 30 days.',
      story: [
        'Cast in sand moulds at a foundry in the Ardennes that otherwise makes parts for water pumps. The cooking surface is machined smoother than most cast iron, so the seasoning builds quickly and eggs release after a few weeks of use.',
        'It works on gas, electric and induction hobs, in the oven and over a fire. A skillet that has rusted or lost its seasoning can be saved: we strip and reseason them at the bench for the price of the oil.',
      ],
      alt: 'Black cast-iron skillet with a pouring lip and a helper handle, seen from above at an angle on a white ground',
    },
    {
      key: 'aleppo-soap',
      slug: 'aleppo-soap',
      name: 'Aleppo soap',
      category: 'home',
      price: 9,
      inStock: true,
      description:
        'A 200 g bar of olive oil and laurel berry oil soap, dried in the open air for three years. It lathers lightly, washes gently and lasts to the last sliver.',
      material: 'Olive oil, laurel berry oil, lye. No perfume and no colouring.',
      dimensions: 'About 8 × 8 × 5 cm.',
      weight: '200 g',
      origin: 'Tripoli, Lebanon',
      care: 'Rest it on a draining dish. It dries between uses and lasts for months.',
      delivery: SHIPS,
      story: [
        'Boiled in a cauldron with olive oil and laurel berry oil, poured by hand, then cut into cubes and stacked in a lattice to dry for three years. The outside browns and the heart stays green, which is how you know a soap has aged as it should.',
        'Each bar carries the soapworks’ seal, pressed by hand before drying. We buy from a family of soap makers in Tripoli whom we have visited since 2017, and we keep the soap at the bench until it is sold so that it finishes drying.',
      ],
      alt: 'Bar of orange-brown Aleppo soap with a carved seal, standing on a glossy surface that reflects it',
    },
    {
      key: 'copper-pan',
      slug: 'copper-jam-pan',
      name: 'Copper jam pan',
      category: 'kitchen',
      price: 165,
      inStock: true,
      description:
        'A 32 cm pan in hammered copper, round-bottomed, with two riveted handles. Copper spreads the heat: sugar cooks without sticking and jam sets in twenty minutes.',
      material: 'Hammered copper, 2 mm, riveted handles.',
      capacity: '8 litres',
      dimensions: '32 cm across, 16 cm deep.',
      weight: '2.1 kg',
      origin: 'Villedieu-les-Poêles, Normandy',
      care: 'Clean with lemon and coarse salt, rinse and dry at once. For jams and sugar work only, never in the dishwasher.',
      delivery:
        'Ships from Lyon within two working days, wedged in recycled paper. Free returns within 30 days.',
      story: [
        'Hammered by hand in Villedieu-les-Poêles, the coppersmiths’ town, in a workshop of three people that still raises copper over a stake. The round bottom follows the flame and avoids the corners where sugar browns too fast.',
        'It is for jam, fruit in syrup and caramel, and for nothing else: bare copper does not suit savoury or acidic dishes. It darkens over the years, and a rub with lemon and coarse salt brings the shine back.',
      ],
      alt: 'Red copper jam pan on a burner with a wooden ladle resting against its rim',
    },
    {
      key: 'stoneware-bottles',
      slug: 'stoneware-bottle-vase',
      name: 'Stoneware bottle vase',
      category: 'home',
      price: 48,
      inStock: true,
      description:
        'A narrow-necked vase in glazed stoneware, thrown by hand. It comes in three glazes: celadon, sage green and matt black. One stem stands in it, and three look right.',
      material: 'Glazed stoneware in three colours: celadon, sage green, matt black.',
      dimensions: '22 cm high, 11 cm across.',
      origin: 'La Borne, Cher',
      care: 'Watertight. Rinse in lukewarm water without abrasive cleaner. Variations in the glaze are part of the piece.',
      delivery:
        'Ships from Lyon within two working days, wedged in paper. Free returns within 30 days, and a replacement if it breaks in transit.',
      story: [
        'Thrown and glazed in La Borne, the village in the Cher where stoneware has been fired since the sixteenth century, by a potter who works alone and fires with gas. The glazes run slightly at the foot, which is the only way to tell two vases thrown on the same day apart.',
        'Each colour is fired at 1,280 °C, which leaves the stoneware non-porous and the glaze as hard as glass. The narrow neck holds a single stem or a bunch of grasses, and the vase stands firm even empty.',
      ],
      alt: 'Rows of narrow-necked stoneware bottle vases glazed celadon, sage green and matt black',
    },
    {
      key: 'leather-wallet',
      slug: 'leather-wallet',
      name: 'Leather wallet',
      category: 'carry',
      price: 62,
      inStock: true,
      description:
        'A bifold wallet in vegetable-tanned leather, stitched with waxed thread, with slots for cards and a pocket for notes. It takes on a patina with use.',
      material: 'Vegetable-tanned cowhide, 1.4 mm. Waxed linen thread.',
      dimensions: '11 × 9 cm closed. Six card slots and two pockets.',
      origin: 'Lyon, France',
      care: 'Keep it dry. A little neutral leather balm once a year.',
      delivery: SHIPS,
      story: [
        'Cut from the offcuts of our bag handles, so none of the hide is wasted. Each wallet is saddle stitched by hand at the bench with two needles and one waxed thread, a stitch that holds even if a single loop is cut.',
        'The leather is tanned with tree bark over several weeks, which leaves it firm and pale at first. Within a few months it takes on the colour of your pocket, and scratches fade under a thumb.',
      ],
      alt: 'Brown leather bifold wallet with visible stitching, folded in front of a leather shoe',
    },
    {
      key: 'turned-bowl',
      slug: 'turned-wooden-bowl',
      name: 'Turned wooden bowl',
      category: 'home',
      price: 210,
      inStock: false,
      description:
        'A large bowl turned from spalted maple, its natural cracks filled with turquoise powder. Every piece is unique, and veined like no other.',
      material: 'Spalted maple, hard oil finish. Cracks filled with turquoise.',
      dimensions: '28 cm across, 13 cm high.',
      weight: '820 g',
      origin: 'Saint-Claude, Jura',
      care: 'Wipe with a damp cloth. Never leave it to soak or put it in the dishwasher. A drop of food-safe oil every six months.',
      delivery:
        'A one-off piece, already sold. The turner is making more this winter: write to us and we will let you know.',
      story: [
        'Turned green from a block of maple that fungi had begun to marble: the dark lines running through the wood are the trace of that work, stopped at the right moment by drying. The turner lets each rough bowl rest for six months before finishing it.',
        'The cracks and knots a joiner would set aside are filled by hand with turquoise powder and resin, then sanded level with the wood. The bowl serves as a salad bowl or a catch-all, takes a patina from oil and fears neither water nor years.',
      ],
      alt: 'Large spalted maple bowl veined with dark lines and patches of turquoise, on a white stand',
    },
    {
      key: 'leather-duffel',
      slug: 'leather-travel-bag',
      name: 'Leather travel bag',
      category: 'carry',
      price: 245,
      inStock: true,
      description:
        'A 50 cm bag in aged buffalo leather with two patch pockets and a detachable strap. Wide enough for two days away, supple enough to go under a seat.',
      material: 'Full-grain buffalo leather, brass buckles and rivets. Cotton lining.',
      dimensions: '50 × 28 × 26 cm. Strap adjusts from 90 to 130 cm.',
      weight: '2.4 kg',
      origin: 'Romans-sur-Isère, Drôme',
      care: 'Brush off dust, wipe with a damp cloth and condition the leather once a year with a neutral balm.',
      delivery: SHIPS,
      story: [
        'Cut and sewn by a leather worker in Romans-sur-Isère, a town that has worked leather for more than a century. Every seam that carries weight is stitched twice, and the handles run right through the bag, riveted under the base.',
        'The leather arrives already softened, with working creases that fade with use. After a year it is dark at the handles and lighter at the corners, and every scratch tells of a journey. We keep spare straps and buckles to repair the bag.',
      ],
      alt: 'Aged brown leather travel bag with two patch pockets and buckled straps, standing at the foot of a tree trunk',
    },
    {
      key: 'moka-pot',
      slug: 'stovetop-coffee-maker',
      name: 'Stovetop coffee maker',
      category: 'kitchen',
      price: 39,
      inStock: true,
      description:
        'An Italian stovetop coffee maker in blue lacquered aluminium, eight-sided with a black handle. Three cups of short, dense coffee in five minutes, on gas or an electric hob.',
      material: 'Cast aluminium, blue lacquer, black resin handle.',
      capacity: '3 cups, 150 ml',
      dimensions: '16 cm high with the lid closed, 9 cm across the base.',
      origin: 'Piedmont, Italy',
      care: 'Rinse with clear water and no soap. Keep it out of the dishwasher, which dulls aluminium.',
      delivery: SHIPS,
      story: [
        'Cast and assembled in Piedmont, around Lake Orta, where coffee makers have been built since the 1930s. The eight sides are not for show: they add to the surface that heats and sit well in the hand.',
        'The principle has not changed since: water rises through a valve and passes through the ground coffee. The valve, the filter and the gasket can all be replaced. We sell the parts at cost and keep some at the bench for every coffee maker we have sold.',
      ],
      alt: 'Pale blue eight-sided coffee maker with its lid open, standing on a wooden table',
    },
    {
      key: 'crochet-throw',
      slug: 'crocheted-throw',
      name: 'Crocheted throw',
      category: 'home',
      price: 165,
      inStock: false,
      description:
        'A 130 × 170 cm throw crocheted by hand in wool, striped in brick red, olive green and saffron yellow. Heavy enough to cover a sofa, supple enough to fold over an armrest.',
      material: 'Wool, 100%, dyed in the fibre before spinning.',
      dimensions: '130 × 170 cm.',
      weight: '1.4 kg',
      origin: 'Roanne, Loire',
      care: 'Air it outside rather than washing it. If needed, hand wash cold with wool soap and dry flat.',
      delivery:
        'The next batch is on the hook, due in December. Write to us and we will keep one aside for you.',
      story: [
        'Crocheted in rows of tight stitches by a workshop of four women in Roanne, who work three colours at once and do not count rows: they measure by hand. Each stripe is a palm wide.',
        'The wool is dyed in the fibre before spinning, which keeps its depth through years of washing. The throw has its weight and is quickly forgotten on a sofa. We order two batches a year, in autumn and in spring.',
      ],
      alt: 'Crocheted throw in broad brick red and olive green stripes, draped over the arm of a sofa',
    },
    {
      key: 'knit-sweater',
      slug: 'chunky-knit-sweater',
      name: 'Chunky knit sweater',
      category: 'carry',
      price: 128,
      inStock: true,
      description:
        'An ecru sweater in thick wool, with a round neck and a wide rib. Warm without weight, straight cut, long enough to cover a belt.',
      material: 'Merino and lambswool, undyed ecru.',
      dimensions: 'Sizes XS to XL. Size M: 68 cm long, 56 cm across the chest.',
      origin: 'Troyes, Aube',
      care: 'Hand wash cold with wool soap and dry flat. A wool comb takes off any pilling.',
      delivery: SHIPS,
      story: [
        'Knitted in Troyes, the capital of French hosiery, in a thick stitch worked on machines from the 1970s that the mill maintains itself. The wool stays ecru: the colour of the sweater is the colour of the sheep.',
        'In the first weeks it pills a little at the elbows. A wool comb deals with that and the sweater softens for years afterwards. A holed sleeve or a stretched collar can be mended at the bench: send it to us.',
      ],
      alt: 'Ecru chunky knit sweater, folded and creased on a wooden worktop in warm light',
    },
    {
      key: 'leather-boots',
      slug: 'leather-boots',
      name: 'Leather boots',
      category: 'carry',
      price: 310,
      inStock: true,
      description:
        'Lace-up boots in honey-coloured pebbled leather, with a cap toe and a stitched leather sole. They can be resoled at the bench for as long as we sell them.',
      material: 'Full-grain pebbled cowhide, leather lining, stitched leather sole.',
      dimensions: 'Sizes 39 to 46, with half sizes from 40 to 45.',
      origin: 'Romans-sur-Isère, Drôme',
      care: 'Brush after each outing, condition twice a year with a neutral balm and keep wooden shoe trees in them.',
      delivery: SHIPS,
      story: [
        'Made up in Romans-sur-Isère by a workshop of ten people that has made shoes for four generations. The sole is stitched to a welt and not glued, which is what allows the boots to be resoled, and it is why we sell them.',
        'The leather is naturally pebbled, pale and a little stiff when new. It gives to the foot in about ten outings and darkens at the creases. When the sole wears through, we replace it at the bench rate, between €70 and €90, and the boots are good for another ten years.',
      ],
      alt: 'Pair of lace-up boots in honey-coloured pebbled leather with a cap toe, on a pale wooden floor',
    },
  ],
  media: {
    hero: 'White and red enamel cups on a wooden table in a country kitchen',
    story: 'Two old kettles, one copper and one black cast iron, on a small wood stove',
  },
  orderSubject: 'Order: {product}',
  pages: ({ name, hello, orders, repairs, letters }) => ({
    titles: {
      home: 'Home',
      shop: 'Shop',
      about: 'About',
      order: 'How to order',
      delivery: 'Delivery and returns',
      repairs: 'Repairs',
      contact: 'Contact',
      terms: 'Terms and privacy',
      credits: 'Photo credits',
    },
    home: {
      heroTitle: 'Things for every day, made to last and to be mended',
      heroSubtitle:
        'Kitchen, homeware and clothing from eleven small workshops, sold from our shop in Lyon and sent across Europe.',
      heroAction: 'Shop the collection',
      commitments: [
        { title: 'Delivery across the EU in 2 to 5 working days', page: 'delivery' },
        { title: '30 days to return anything that does not suit', page: 'delivery' },
        { title: 'Repairs for as long as we sell the piece', page: 'repairs' },
      ],
      newTitle: 'New this season',
      storyCaption: `${name} opened in 2014 at the back of a haberdashery on the Croix-Rousse hill, with a repair bench and nothing else. Two flea-market kettles are waiting there for a new handle.`,
      letter: {
        quote:
          'I bought the jam pan in 2019 and took it back last winter because a handle had worked loose. It came home three weeks later, riveted again, with a note from the coppersmith who had made it.',
        name: 'Hélène Marchand',
        role: 'Jam pan, bought in 2019',
      },
      faqTitle: 'Before you order',
      faq: [
        [
          'How do I place an order?',
          'Use the order button on a product page to write to us, or come to the shop. We reply within one working day with the total, delivery included, and a secure payment link. Nothing is charged until you confirm.',
        ],
        [
          'How long does delivery take?',
          'Two to three working days in mainland France and three to five across the rest of the European Union. Orders confirmed before noon leave Lyon the same day.',
        ],
        [
          'Can I collect my order from the shop?',
          'Yes. Ask for collection when you write, and your order will be waiting at 12 rue Imbert-Colomès from the next day, Tuesday to Saturday.',
        ],
        [
          'What if something does not fit?',
          'Send it back unworn within 30 days for a refund or another size. Returns are free within France, and from elsewhere in the EU we refund the cost of the cheapest tracked service.',
        ],
      ],
      lettersTitle: 'Letters from the workshop',
      lettersText:
        'Four letters a year about new batches, repairs and the people who make our goods. Write to us and we will add you to the list.',
      lettersAction: 'Ask for the letters',
      lettersSubject: 'Letters from the workshop',
    },
    shop: {},
    about: {
      intro: [
        `${name} began in 2014 as a repair bench at the back of a haberdashery on rue Imbert-Colomès, on the slopes of the Croix-Rousse. People brought in coats with broken zips and bags with torn straps, and after a year of mending other people’s things we started to make our own, built so that they could be mended too.`,
        'Today the shop sells about sixty pieces from eleven workshops. Most of them are in France, within a day of each other by train: a foundry in the Ardennes, a coppersmith in Normandy, a potter in the Cher, a turner in the Jura, a knitting mill in Troyes. We visit each of them at least twice a year, and we buy in runs small enough to sell through before the next season.',
        '## How we choose what to sell',
        'A piece comes into the shop when we have used it long enough to know how it wears, and when the person who made it can supply the parts to repair it. That rules out most things with glued soles, coated pans and zips we cannot replace. It also means the range changes slowly and some pieces sell out for months at a time.',
        'We pay our workshops before the goods are delivered and publish the price we paid on request. Nothing is made in a quantity we cannot sell, so nothing is ever put on sale to clear a warehouse.',
      ],
      figureCaption:
        'The counter cups, enamelled and a little dented, are used every morning at the bench.',
      figuresTitle: 'The shop in numbers',
      figures: [
        { value: '11', label: 'workshops we buy from, nine of them in France' },
        { value: '1,380', label: 'repairs done at the bench last year' },
        { value: '2014', label: 'the year we opened on the Croix-Rousse hill' },
      ],
      visitTitle: 'Visit the shop and the repair bench',
      visitText: '12 rue Imbert-Colomès, Lyon. Open Tuesday to Saturday, 11:00 to 19:00.',
      visitAction: 'Opening hours and directions',
    },
    order: {
      intro: [
        'We sell through the shop and by email, so that every order is read by the person who will pack it. It takes a little longer than a checkout and it means we can answer a question about size or delivery before you pay.',
        '## Ordering by email',
        `Use the order button on any product page, or write to [${orders}](mailto:${orders}) with the pieces, the sizes and the delivery address. We reply within one working day, Tuesday to Saturday, with the total including delivery and a secure payment link by card. Your order leaves Lyon as soon as the payment arrives.`,
        '## Ordering at the shop',
        'Everything on the site is in the shop at 12 rue Imbert-Colomès, and most sizes can be tried on. We can also keep an item aside for a week if you tell us when you plan to come.',
      ],
      notesTitle: 'Payment and delivery',
      notes: [
        [
          'Which payment methods do you accept?',
          'Card payment through a secure link, bank transfer to our account, and cash or card at the shop. Prices are in euros and include VAT at 20%.',
        ],
        [
          'What does delivery cost?',
          'Delivery is €5 in mainland France and €12 to the rest of the EU, free on orders over €150. Skillets and throws travel by tracked courier at the same price.',
        ],
        [
          'Do you send orders outside the European Union?',
          'We send to the United Kingdom, Switzerland and Norway at cost. Import duties and taxes are paid by the recipient on arrival, and we tell you the estimate before you pay.',
        ],
        [
          'Can you wrap a gift?',
          'Yes, in brown paper and cotton string, with a card written by hand if you send us the words. It costs nothing.',
        ],
      ],
    },
    delivery: {
      intro: [
        'Orders leave the shop in Lyon every working day at 14:00, packed in recycled paper and card with no plastic. You receive a tracking number by email when the parcel is collected.',
      ],
      faqTitle: 'Delivery and returns',
      faq: [
        [
          'How long does delivery take?',
          'Two to three working days in mainland France, three to five working days to the rest of the European Union, and five to eight to the United Kingdom, Switzerland and Norway.',
        ],
        [
          'How do I return something?',
          `Write to [${orders}](mailto:${orders}) within 30 days of delivery with your order number. We send a prepaid label for returns within France, and an address for returns from elsewhere.`,
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
      ],
    },
    repairs: {
      intro: [
        'We repair everything we sell for as long as we sell it, and most things long after. The bench is at the back of the shop, and two of us work at it every afternoon.',
        '## What we mend',
        'Seams, pockets, cuffs and buttons on clothing. Straps, buckles, rivets and stitching on bags and leather. Handles, valves and gaskets on utensils. Rust and lost seasoning on cast iron. Moth holes in knitwear, if they are small enough to darn.',
        '## What it costs',
        'Repairs to anything bought from us in the last two years are free. After that we charge for the materials and nothing for the time, which comes to between €5 and €25 for most repairs. We tell you the price before we start.',
        '## How to send something in',
        `Bring it to the shop, or write to [${repairs}](mailto:${repairs}) with a photograph of the damage. We reply with the price, the time it will take (usually two to three weeks) and the address to post it to.`,
      ],
      figuresTitle: 'Last year at the bench',
      figures: [
        { value: '1,380', label: 'repairs completed' },
        { value: '62%', label: 'done free of charge' },
        { value: '16', label: 'days on average from arrival to return' },
      ],
    },
    contact: [
      '## The shop',
      '12 rue Imbert-Colomès, 69001 Lyon, France. Five minutes on foot from Croix-Paquet metro station, line C.',
      'Tuesday to Saturday, 11:00 to 19:00. Closed on Sundays, Mondays and public holidays.',
      '## Writing to us',
      `For orders, [${orders}](mailto:${orders}). For repairs, [${repairs}](mailto:${repairs}). For our letters from the workshop, four a year, [${letters}](mailto:${letters}). For anything else, including workshops that would like to work with us, [${hello}](mailto:${hello}).`,
      'Telephone +33 4 65 71 42 17, Tuesday to Saturday during opening hours.',
    ],
    terms: [
      `These terms apply to every order placed with ${name}, SAS, 12 rue Imbert-Colomès, 69001 Lyon, registered in France under RCS Lyon number 912 345 678.`,
      '## Orders and prices',
      'An order is confirmed when we have received payment and replied to say so. Prices are in euros and include VAT at 20%. Delivery costs are stated before payment.',
      '## Your right to cancel',
      'You may cancel an order within 14 days of receiving it without giving a reason, as French and European consumer law provide, and our own returns period of 30 days extends that right. Refunds are made within 14 days of the goods reaching us.',
      '## Guarantee',
      'Every piece carries the legal guarantee of conformity of two years and the guarantee against hidden defects. Our repair service is offered in addition to them and does not replace them.',
      '## Mediation',
      'If a dispute is one we could not settle, you may refer it free of charge to the consumer mediator we are attached to. We give you their details on request.',
      '## Privacy',
      `We keep your name, address and email for as long as it takes to deliver, return or repair an order, and for the ten years French law requires us to keep invoices. We never sell or share them except with the carrier delivering your parcel. Write to [${hello}](mailto:${hello}) to see, correct or delete what we hold; you may also complain to the CNIL, the French data protection authority. This site sets no advertising or tracking cookies.`,
    ],
    credits: {
      intro: [
        'The photographs on this site are published under free licences or in the public domain. We thank their authors. They have been cropped and resized for the web.',
      ],
      sourceWord: 'source',
    },
  }),
  menus: {
    shop: 'Shop',
    about: 'About',
    action: 'How to order',
    footer: [
      { label: 'About', page: 'about' },
      { label: 'How to order', page: 'order' },
      { label: 'Delivery and returns', page: 'delivery' },
      { label: 'Repairs', page: 'repairs' },
      { label: 'Contact', page: 'contact' },
      { label: 'Terms and privacy', page: 'terms' },
      { label: 'Photo credits', page: 'credits' },
    ],
  },
  settings: {
    tagline: 'Everyday goods, made to last and to be mended.',
    footerNote:
      '12 rue Imbert-Colomès, 69001 Lyon, France. Shop and repair bench open Tuesday to Saturday, 11:00 to 19:00.\n\nRegistered in France as a simplified joint-stock company, RCS Lyon 912 345 678.',
  },
  widgets: {
    newTitle: 'New in the shop',
    careTitle: 'Customer care',
    careLabels: {
      order: 'How to order',
      delivery: 'Delivery and returns',
      repairs: 'Repairs',
      contact: 'Contact',
      terms: 'Terms and privacy',
    },
    beforeTitle: 'Before you order',
    beforeHeading: 'A question about a size or a delivery',
    beforeBody:
      'Write to us or call the shop. We reply within one working day, Tuesday to Saturday, and nothing is charged until you confirm.',
    beforeLabel: 'Contact the shop',
    phoneTitle: 'Call the shop',
    phone: '+33 4 65 71 42 17',
    phoneHoursLabel: 'Answered',
    phoneHoursValue: 'Tuesday to Saturday, during opening hours',
    lettersTitle: 'Letters from the workshop',
    lettersHeading: 'Four letters a year',
    lettersBody:
      'New batches, repairs and the people who make our goods, written from the bench in Lyon.',
    lettersLabel: 'How to ask for them',
  },
}
