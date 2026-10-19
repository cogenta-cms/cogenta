import type {
  AssociationCopy,
  AssociationCopyContext,
  AssociationEventCopy,
  AssociationPagesCopy,
  AssociationProgrammeCopy,
} from './association-copy.js'

/**
 * The English `association` blueprint: a neighbourhood charity in a northern
 * English town, run from an old library on Elm Street. The town, the street
 * and the people are invented. The telephone number is in Ofcom's range
 * reserved for drama (01632 960xxx), so it can never ring anyone.
 */

const PHONE = '01632 960418'
const PHONE_HREF = 'tel:+441632960418'
const HALL = 'The Old Library'
const HALL_STREET = '220 Elm Street'
const HALL_TOWN = 'Ashworth AW4 2LT'
const HALL_ADDRESS = `${HALL_STREET}, ${HALL_TOWN}`
const CHARITY_NUMBER = '1299418'

const PROGRAMMES: readonly AssociationProgrammeCopy[] = [
  {
    slug: 'thursday-food-bank',
    title: 'Thursday food bank',
    summary:
      'A week of groceries for any household that asks, every Thursday evening. No referral, no forms, and fresh vegetables alongside the tins.',
    schedule: 'Thursdays, 5.30pm to 7.30pm',
    location: `${HALL}, main hall`,
    audience: 'Any household in Ashworth, with no referral needed',
    cost: 'Free',
    mailbox: 'foodbank',
    photo: 'programme-food-bank',
    body: [
      'Every Thursday the main hall fills with tables of tins, pasta, rice, cereal, tea and toiletries, and a table of whatever the garden and the market traders have given that week. Each household leaves with a week of groceries chosen with a volunteer, about 14 kilos, packed into their own bags or one of ours.',
      '## How it works',
      'Come to the side door on Elm Street any time between 5.30pm and 7.30pm. A volunteer takes your first name and the number of people at home, and nothing else. If you cannot carry a week of shopping, tell us: two drivers take parcels to 23 households who cannot get to the hall.',
      'We ask no one to prove they need help. The three neighbours who started the food bank in 1994 decided that asking for proof would turn people away who needed it most, and every committee since has kept that rule.',
      '## Where the food comes from',
      'About two thirds of what we hand out is given: collection points at Brindle & Sons and at two schools, two big collections a year at Brindle & Sons, and neighbours who leave a bag at the door. We buy the rest, mostly fresh food, milk, nappies and anything that runs short, which is where most of the money you give goes.',
      '## Giving food',
      'The hall takes food on weekdays from 9.30am to 4pm. This month we are shortest of tinned fish, UHT milk, instant coffee and toiletries. Please do not bring anything past its date or opened.',
    ],
  },
  {
    slug: 'homework-club',
    title: 'Homework club',
    summary:
      'Two quiet afternoons a week in the reading room for children aged 10 to 14, with volunteer tutors, laptops, a printer and something to eat.',
    schedule: 'Tuesdays and Thursdays, 3.30pm to 5.30pm, in term time',
    location: `${HALL}, upstairs reading room`,
    audience: 'Children aged 10 to 14 from any school in Ashworth',
    cost: 'Free',
    mailbox: 'homework',
    photo: 'programme-homework-club',
    body: [
      'The homework club started in 2009, when a parent noticed that the reading room above the hall sat empty on weekday afternoons while her children had nowhere quiet to work. Today 46 children from nine schools come at least once a week.',
      '## An afternoon at the club',
      'Children arrive from school, sign in and have toast or fruit first. Then they work at their own pace on whatever they have been set, with one tutor for every four children. Most of the tutors are sixth-form students from Ashworth College and two retired teachers who run the sessions.',
      'We have twelve laptops, a printer, a shelf of revision guides for every GCSE subject we could find, and a rule that phones stay in bags until five.',
      '## Joining',
      'A parent or carer fills in a one-page form at the hall or by email, with an emergency contact and anything we should know about health or learning. There is no waiting list at the moment for Tuesday; Thursday has four places left.',
      'Every tutor has an enhanced DBS check, arranged and paid for by us, and completes our safeguarding session before their first afternoon.',
    ],
  },
  {
    slug: 'community-garden',
    title: 'Community garden',
    summary:
      'Twelve raised beds behind the hall, planted and picked by anyone who wants to help. Last year they grew 1.4 tonnes of vegetables for the food bank.',
    schedule: 'Saturdays, 9.30am to 12.30pm, April to October',
    location: 'Elm Street garden, behind the hall',
    audience: 'Everyone, including children with an adult',
    cost: 'Free',
    mailbox: 'garden',
    photo: 'programme-garden',
    body: [
      'The garden began as three raised beds on the edge of the car park in 2012. It now runs the length of the plot behind the hall: twelve beds, a polytunnel given by Kestrel Homes, two water butts and a shed of tools anyone can borrow on a Saturday.',
      '## What grows',
      'We grow what the food bank hands out fastest: potatoes, onions, carrots, courgettes, beans, salad leaves and herbs. Everything picked on a Saturday morning is weighed, washed and on the food bank tables the following Thursday.',
      '## Coming along',
      'Turn up on any Saturday from April to October. Gloves, tools and tea are provided, and one of the regular gardeners shows anyone new what needs doing. Nobody needs to know anything about plants; most of the jobs are digging, weeding and watering.',
      'The raised beds are waist height at one end, so the garden works for anyone who cannot kneel.',
    ],
  },
  {
    slug: 'winter-coat-bank',
    title: 'Winter coat bank',
    summary:
      'Warm coats, boots and school uniform jumpers, given by neighbours and sorted by size, free to any family who needs them from October to February.',
    schedule: 'Mondays, 10am to 1pm, October to February',
    location: `${HALL}, main hall`,
    audience: 'Adults and children in Ashworth',
    cost: 'Free',
    mailbox: 'coats',
    photo: 'programme-coat-bank',
    body: [
      'Last winter the coat bank gave out 820 coats, 310 pairs of boots and 190 school jumpers. Every one of them was given by someone in the town, checked for zips and buttons, washed if it needed it and hung by size.',
      '## Choosing a coat',
      'Come to the hall on a Monday morning between October and February and choose what fits. There is a changing screen, a mirror and a volunteer to help find a size. Families can take a coat for each person at home.',
      '## Giving a coat',
      'We take clean coats, boots and jumpers in good condition at the hall on weekdays from September. We are always short of children’s coats in ages 8 to 13 and of men’s boots in large sizes.',
      '## Where the coats go',
      'Anything we cannot use, because it is torn or the wrong season, goes to a textile recycler in Ashworth, who pays us by the kilo. Last winter that paid for the coat rails and the hangers.',
    ],
  },
]

const EVENTS: readonly AssociationEventCopy[] = [
  {
    title: 'Volunteer orientation evening',
    slug: 'volunteer-orientation-evening',
    daysFromNow: 6,
    start: [18, 0],
    end: [19, 30],
    location: `${HALL}, upstairs reading room`,
    address: HALL_ADDRESS,
    cost: 'Free',
    booking: 'No need to book, but tell us you are coming',
    description:
      'An hour and a half for anyone thinking of volunteering: what each role involves, who runs it, and which shifts need people now.',
    photo: 'event-orientation',
    body: [
      'Most of our 312 volunteers started at one of these evenings. The volunteer coordinator and the people who lead the food bank, the homework club, the garden and the coat bank each talk for ten minutes about what a shift is really like, then stay to answer questions over tea.',
      '## What happens next',
      'Nobody signs up for anything on the night. If a role suits you, the coordinator arranges a first shift alongside an experienced volunteer. For the homework club we start the DBS check that week, which usually takes three to four weeks.',
      'The reading room is up one flight of stairs. If stairs are difficult, tell us and we will meet in the main hall instead.',
    ],
  },
  {
    title: 'Food collection at Brindle & Sons',
    slug: 'food-collection-brindle-and-sons',
    daysFromNow: 11,
    start: [10, 0],
    end: [14, 0],
    location: 'Brindle & Sons car park',
    address: '14 Market Row, Ashworth AW4 1BS',
    cost: 'Free',
    booking: 'No booking needed',
    description:
      'Our biggest collection of the year. Bring tins and dry food to the market car park, or give two hours to sort what arrives.',
    photo: 'programme-food-bank',
    body: [
      'The last time we held this collection, one day brought in 2.1 tonnes of food, enough to fill the food bank shelves for eight weeks. Brindle & Sons lend us their car park and a van, and match every tenth tin with one of their own.',
      '## What to bring',
      'Tinned fish and meat, tinned vegetables, UHT milk, rice, pasta sauce, tea, coffee, and toiletries. Please nothing opened, homemade or past its date.',
      '## Helping on the day',
      'We need about 30 people across the day, in two-hour slots, to take donations at the tables and to sort them into crates inside the shop’s storeroom. Come for one slot or stay for all of it.',
    ],
  },
  {
    title: 'Planting morning in the garden',
    slug: 'planting-morning-in-the-garden',
    daysFromNow: 17,
    start: [9, 30],
    end: [12, 30],
    location: 'Elm Street garden, behind the hall',
    address: HALL_ADDRESS,
    cost: 'Free',
    booking: 'No booking needed',
    description:
      'A morning of planting and clearing the raised beds and the polytunnel. Tools, gloves and tea provided, children welcome with an adult.',
    photo: 'event-planting',
    body: [
      'Six times a year the garden needs more hands than a regular session brings. We plant whatever the time of year allows in the open beds, sow salad leaves and herbs under the polytunnel, clear what has finished, and give the empty beds a fresh layer of compost.',
      '## Bring',
      'Clothes that can get muddy and boots if you have them. We have gloves in every size, tools for about forty people and a kettle in the shed. There is a bed kept for children, with fast-growing radishes and sunflowers.',
    ],
  },
  {
    title: 'Coat and boot collection',
    slug: 'coat-and-boot-collection',
    daysFromNow: 24,
    start: [10, 0],
    end: [15, 0],
    location: `${HALL}, main hall`,
    address: HALL_ADDRESS,
    cost: 'Free',
    booking: 'Drop in any time',
    description:
      'Bring clean coats, boots and school jumpers you no longer need. Everything is checked, sorted by size and kept for the coat bank.',
    photo: 'programme-coat-bank',
    body: [
      'The coat bank is stocked by collections through the year, so there is a rail ready for every family when it opens. Bring what you can carry to the main hall between 10am and 3pm; a volunteer checks each coat with you at the door, so nothing needs to be sorted beforehand.',
      '## What we need most',
      'Children’s coats for ages 8 to 13, men’s coats and boots in large sizes, and grey or black school jumpers in any size. We cannot take coats that are torn, stained or missing a zip.',
    ],
  },
  {
    title: 'Annual general meeting',
    slug: 'annual-general-meeting',
    daysFromNow: 31,
    start: [19, 0],
    end: [20, 30],
    location: `${HALL}, main hall`,
    address: HALL_ADDRESS,
    cost: 'Free',
    booking: 'Open to everyone; members vote',
    description:
      'The trustees present the year’s accounts and annual report, two trustees stand for election, and anyone can ask a question.',
    body: [
      'Once a year the trustees account for every pound we received and spent, and for what the four programmes achieved. The treasurer presents the accounts for the year to 31 March, independently examined, and the chair presents the annual report.',
      '## On the agenda',
      '- The annual report and accounts',
      '- The election of two trustees, one of them a volunteer at the food bank',
      '- The reserves policy, which the trustees propose to keep at three months of spending',
      '- Questions from the floor',
      'Anyone may attend and ask a question. Members, meaning anyone who has volunteered or given in the past year and asked to join, may vote. Printed copies of the accounts are at the hall from two weeks before.',
    ],
  },
  {
    title: 'Community supper',
    slug: 'community-supper',
    daysFromNow: 38,
    start: [18, 30],
    end: [22, 0],
    location: 'Ashworth Town Hall, Wardle Room',
    address: 'Market Square, Ashworth AW4 1AA',
    cost: '£25, or £12 for under-16s',
    booking: 'Tickets from the hall or by email; 180 places',
    description:
      'Three courses cooked by volunteers, a raffle, and a short word from the food bank team. Every ticket pays for four food parcels.',
    photo: 'event-supper',
    body: [
      'Our one fundraising dinner of the year. Last year 170 people came and the evening raised £9,400, which paid for the fresh food at Thursday’s food bank for three months.',
      '## The evening',
      'Doors open at 6.30pm, dinner is at 7pm, and the raffle is drawn between the main course and pudding. The menu is soup, a vegetable and bean casserole or roast chicken, and a fruit crumble, with a vegetarian or vegan option at every course if you tell us when you book.',
      'The Wardle Room is step-free with an accessible toilet. The Market Square car park is free in the evening.',
    ],
  },
]

function pages(c: AssociationCopyContext): AssociationPagesCopy {
  const { name } = c
  return {
    titles: {
      home: 'Home',
      whatWeDo: 'What we do',
      events: 'Events',
      volunteer: 'Volunteer with us',
      donate: 'Ways to give',
      finances: 'Where the money goes',
      about: 'Our story',
      contact: 'Contact us',
      privacy: 'Privacy',
      legal: 'Legal information',
      credits: 'Photo credits',
    },
    home: {
      heroEyebrow: 'A neighbourhood charity in Ashworth since 1994',
      heroTitle: 'No one in Ashworth should go hungry or face winter alone',
      heroSubtitle: `${name} runs a food bank, a homework club, a community garden and a winter coat bank from the old library on Elm Street, with 312 volunteers and two part-time staff.`,
      heroPrimary: 'Donate',
      heroSecondary: 'Volunteer with us',
      impactTitle: 'Last year, in numbers',
      impact: [
        {
          value: '7,280',
          unit: 'parcels',
          label:
            'of food handed out on Thursday evenings, each a week of groceries for one household.',
        },
        {
          value: '46',
          unit: 'children',
          label: 'from nine schools came to homework club at least once a week.',
        },
        {
          value: '1.4',
          unit: 'tonnes',
          label: 'of vegetables grown in the garden went straight onto the food bank tables.',
        },
        {
          value: '312',
          unit: 'volunteers',
          label: 'gave 21,600 hours between them. Two part-time staff organise the rotas.',
        },
      ],
      programmesTitle: 'What we do',
      eventsTitle: 'Coming up',
      storyQuote: [
        'My son was falling behind in maths and our flat is not a quiet place. I brought him to homework club for a term, and by the summer I was one of the people helping.',
        `Five years on I run the Tuesday session. What keeps me at ${name} is that nobody here has ever made a child feel they needed to be helped.`,
      ],
      storyName: 'Joanne Pryce',
      storyRole: 'Homework club volunteer since 2019',
      moneyTitle: 'Where each pound goes',
      money: [
        { value: '38%', label: 'Food bought to fill the gaps in what is given' },
        { value: '23%', label: 'The homework club, the garden and the winter coat bank' },
        { value: '17%', label: 'Heating, lighting, repairing and insuring the hall' },
        { value: '12%', label: 'The van, the accounts and fundraising' },
        { value: '10%', label: 'Two part-time staff who organise 312 volunteers' },
      ],
      giveTitle: 'A monthly gift keeps Thursday going',
      giveText:
        'We plan the food bank a month ahead, so a regular gift helps most. £5 a month buys the bread for one Thursday. £12 a month keeps one family in fresh vegetables all year. £30 a month pays for a child’s place at homework club.',
      givePrimary: 'Ways to give',
      giveSecondary: 'Read our accounts',
      partnersCaption: 'Working alongside us in Ashworth',
      faqTitle: 'Questions people ask us',
      faq: [
        {
          question: 'Do I need a referral to use the food bank?',
          answer:
            'No. Come to the side door on a Thursday between 5.30pm and 7.30pm. We ask for a first name and how many people are at home, and nothing else.',
        },
        {
          question: 'How much time do I need to give to volunteer?',
          answer:
            'As much as suits you. Some volunteers come every week for years; others help at two collections a year. Both keep things running.',
        },
        {
          question: 'Can I give food instead of money?',
          answer:
            'Yes, at the hall on weekdays from 9.30am to 4pm. Money goes further for fresh food, so we buy that ourselves.',
        },
        {
          question: 'Is the hall accessible?',
          answer:
            'The main hall and the toilets are step-free from the Elm Street entrance. The reading room is upstairs; homework club moves downstairs for any child who needs it.',
        },
      ],
    },
    whatWeDo: {
      intro: [
        `${name} runs four programmes from the old library on Elm Street. Each one started because a neighbour noticed something missing, and each is run by volunteers with a lead volunteer and one of our two part-time staff.`,
        'None of them asks anyone to prove they need help, and none of them costs anything to use.',
      ],
      stepsTitle: 'Getting help from us',
      steps: [
        {
          title: 'Come to the hall',
          text: 'Every programme is open to anyone in Ashworth. Turn up at the times on each page, or ring the hall first if you would rather.',
        },
        {
          title: 'Tell us what you need',
          text: 'A volunteer asks your first name and what would help. Nothing is written down beyond that.',
        },
        {
          title: 'Ask about anything else',
          text: 'If we cannot help, we know who can: debt advice, housing, benefits and the council’s support fund all hold sessions at the hall.',
        },
      ],
    },
    events: {
      intro: [
        `Everything ${name} has planned for the next six weeks. Almost all of it is free and needs no booking; where it does, the event’s page says how.`,
      ],
      hostTitle: 'Holding something for the food bank',
      hostText:
        'Schools, workplaces and clubs run collections and sponsored events for us every year. Tell us your date and we will lend you crates, posters and a volunteer to collect.',
      hostAction: 'Write to the events team',
      hostSubject: 'An event for the food bank',
    },
    volunteer: {
      intro: [
        `${name} is 312 volunteers and two part-time staff. Volunteers pack the food parcels, tutor at homework club, dig the garden, sort the coats, drive the van and sit on the board of trustees.`,
        'You do not need experience for any of it. Every new volunteer does a first shift alongside someone who has done it for years.',
      ],
      rolesTitle: 'Where you could help',
      roles: [
        {
          icon: 'heart',
          title: 'Food bank',
          text: 'Thursdays, 5pm to 8pm. Setting out tables, helping households choose, packing bags. About 25 volunteers a week.',
          href: '/what-we-do/thursday-food-bank',
        },
        {
          icon: 'book',
          title: 'Homework club tutor',
          text: 'Tuesdays or Thursdays, 3.15pm to 5.45pm in term time. Aged 16 or over, with an enhanced DBS check we arrange.',
          href: '/what-we-do/homework-club',
        },
        {
          icon: 'leaf',
          title: 'Garden',
          text: 'Saturdays, 9.30am to 12.30pm, April to October. Digging, weeding, watering and picking. Children welcome with an adult.',
          href: '/what-we-do/community-garden',
        },
        {
          icon: 'gift',
          title: 'Coat bank',
          text: 'Mondays, 9.30am to 1.30pm, September to February. Checking, sorting and hanging coats, and helping families find a size.',
          href: '/what-we-do/winter-coat-bank',
        },
        {
          icon: 'truck',
          title: 'Driver',
          text: 'Thursdays, 4pm to 7pm. Collecting from shops and taking parcels to 23 households who cannot get to the hall. A full licence held for two years.',
        },
        {
          icon: 'users',
          title: 'Trustee',
          text: 'Six evening meetings a year. We are looking for a trustee with experience of property or building maintenance.',
        },
      ],
      stepsTitle: 'How to start',
      steps: [
        {
          title: 'Write or ring',
          text: `Email ${c.email('volunteer')} or ring ${PHONE}, and tell us what you would like to do and when you are free.`,
        },
        {
          title: 'Come to an orientation evening',
          text: 'Once a month, an hour and a half in the reading room with the people who run each programme.',
          href: '/events/volunteer-orientation-evening',
        },
        {
          title: 'Do a first shift alongside someone',
          text: 'Our coordinator pairs you with an experienced volunteer. After that, you choose how often to come.',
        },
      ],
      photoCaption: 'Where we meet new volunteers: the reading room, upstairs.',
      notesTitle: 'Before your first shift',
      notes: [
        {
          question: 'Is there a minimum age?',
          answer:
            'Sixteen for most roles and eighteen for driving. Younger children can help in the garden and at collections with a parent or carer.',
        },
        {
          question: 'Do I need a DBS check?',
          answer:
            'Only for the homework club. We apply for an enhanced check for you and pay for it; it usually takes three to four weeks.',
        },
        {
          question: 'What should I wear?',
          answer:
            'Closed shoes and clothes that can get dirty. We provide aprons, gloves and tools.',
        },
        {
          question: 'Are expenses paid?',
          answer:
            'Yes. We pay mileage for drivers and bus fares for anyone who asks, with no receipts needed for under £10.',
        },
        {
          question: 'Can my workplace volunteer as a team?',
          answer:
            'Yes, for the food collections, the coat collections and garden mornings, for groups of up to twelve. Write to us with a date.',
        },
      ],
      askTitle: 'Tell us you would like to help',
      askText:
        'Our volunteer coordinator, Priya Nair, answers every message within two working days.',
      askAction: 'Email the volunteer team',
      askSubject: 'I would like to volunteer',
      phoneAction: `Ring ${PHONE}`,
    },
    donate: {
      intro: [
        `Every pound given to ${name} is spent in Ashworth, on food, on the homework club, the garden and the coat bank, and on keeping the hall warm and open. Last year 62% of our income came from people in the town.`,
        'We do not take card payments on this site. Here are the ways to give, and the people to ask.',
      ],
      monthlyTitle: 'Give every month',
      tiers: [
        {
          name: 'Bread for Thursday',
          price: '£5',
          interval: 'a month',
          features: [
            'Buys the bread for one Thursday’s food bank',
            'With Gift Aid, worth £6.25 to us',
          ],
        },
        {
          name: 'Vegetables',
          price: '£12',
          interval: 'a month',
          features: [
            'Keeps one family in fresh vegetables all year',
            'With Gift Aid, worth £15 to us',
          ],
          highlighted: true,
        },
        {
          name: 'A place at homework club',
          price: '£30',
          interval: 'a month',
          features: [
            'Pays for one child’s place, books and snacks included',
            'With Gift Aid, worth £37.50 to us',
          ],
        },
      ],
      ways: [
        '## By standing order',
        `A standing order goes straight from your bank to ours, so none of your gift goes on fees. Email our treasurer at [${c.email('treasurer')}](mailto:${c.email('treasurer')}) or ring ${PHONE}, and we send you our account details, a reference and a Gift Aid form. You set up the payment with your own bank, and can stop it at any time the same way.`,
        '## By cheque or cash',
        `Make cheques payable to ${name} and post them to ${HALL}, ${HALL_ADDRESS}. You can also give cash or a cheque at the hall on weekdays from 9.30am to 4pm, and on Thursday evenings; we give a receipt for every gift.`,
        '## Gift Aid',
        'If you pay UK income tax, Gift Aid adds 25p to every pound you give, at no cost to you. Tick the box on our form or tell the person who takes your gift. Last year Gift Aid brought in £25,800.',
        '## Through your employer or your will',
        `Payroll giving takes your gift before tax. Ask your payroll team for the Payroll Giving scheme and give our charity number, ${CHARITY_NUMBER}. A gift in your will, of any size, can be left to us by name; we are happy to talk it through in confidence.`,
      ],
      questionsTitle: 'Before you give',
      questions: [
        {
          question: 'Can I choose which programme my gift pays for?',
          answer:
            'Yes. Tell us when you give, and the treasurer records it against that programme. Gifts with no programme named go where they are needed most, usually the food bank.',
        },
        {
          question: 'How much of my gift is spent on fundraising?',
          answer:
            'Three pence in every pound goes on fundraising, accounts and the independent examination. The full breakdown is on our finances page.',
        },
        {
          question: 'Can I give food or coats instead?',
          answer:
            'Yes. The food bank and the coat bank pages list what we need most this month and when to bring it.',
        },
        {
          question: 'How do I cancel a standing order?',
          answer:
            'With your bank, in the same way you set it up. You do not need to tell us, though we are always glad to hear why.',
        },
      ],
      askTitle: 'Talk to our treasurer',
      askText:
        'Our treasurer, Martin Okafor, answers questions about giving, Gift Aid and gifts in wills, usually the same week.',
      askAction: 'Email the treasurer',
      askSubject: 'Giving to the charity',
      phoneAction: `Ring ${PHONE}`,
    },
    finances: {
      intro: [
        `${name} is a charitable incorporated organisation registered in England and Wales, number ${CHARITY_NUMBER}. Our accounts for the year to 31 March are independently examined and filed with the Charity Commission.`,
        'These are the figures from our last annual report. A printed copy of the full accounts is at the hall, and we post one to anyone who asks.',
      ],
      yearTitle: 'The year to 31 March',
      year: [
        {
          value: '£286,400',
          label: 'received, from 1,940 people, 14 local businesses and 6 charitable trusts.',
        },
        {
          value: '£271,900',
          label: 'spent on the four programmes, the hall and the people who organise them.',
        },
        {
          value: '£68,000',
          label: 'held in reserve, three months of spending, as our reserves policy requires.',
        },
        {
          value: '21,600',
          unit: 'hours',
          label: 'given by volunteers. We do not put a value on them in the accounts.',
        },
      ],
      spendingTitle: 'How we spent it',
      spending: [
        { value: '38%', label: 'Food bought for the food bank' },
        { value: '17%', label: 'Running the hall: heating, lighting, repairs, insurance' },
        { value: '12%', label: 'Homework club: books, laptops, snacks and DBS checks' },
        { value: '11%', label: 'The coat bank, the garden and emergency help' },
        { value: '10%', label: 'A part-time coordinator and a part-time volunteer manager' },
        { value: '9%', label: 'The van: fuel, insurance and repairs' },
        { value: '3%', label: 'Fundraising, accounts and the independent examination' },
      ],
      incomeTitle: 'Where it came from',
      income: [
        { value: '46%', label: 'Gifts from individuals, most of them monthly' },
        { value: '27%', label: 'Grants from six charitable trusts' },
        { value: '11%', label: 'Local businesses, in money and in food' },
        { value: '9%', label: 'Gift Aid claimed on individual gifts' },
        { value: '7%', label: 'The community supper and sponsored events' },
      ],
      notes: [
        '## Why the hall costs so little',
        'We bought the old library outright in 2001, with money raised over six years, so we pay no rent. The 17% it costs is heating a Victorian building, keeping the roof sound and insuring it.',
        '## What we do not spend money on',
        'Nobody is paid to fundraise, the trustees are unpaid and claim no expenses, and we have no offices other than the hall. When we spend on something new, the trustees agree it at a meeting and the minutes are available at the hall.',
      ],
    },
    about: {
      story: [
        `${name} started in the winter of 1994, when three neighbours on Elm Street, a retired teacher, a bus driver and a nurse working nights, borrowed a van and took hot meals to eleven households who had run out of money for food.`,
        'By the next winter they had forty volunteers and a spare room above the hardware shop. In 2001, after six years of jumble sales and sponsored walks, the charity bought the old public library on Elm Street, so that no landlord could ever close the food bank.',
        'The homework club opened in the library’s reading room in 2009, the garden in 2012 and the coat bank in 2016. Each began because someone who came to the hall noticed something missing and offered to start it.',
      ],
      years: [
        { value: '1994', label: 'The first van of hot meals' },
        { value: '2001', label: 'The old library bought outright' },
        { value: '4', label: 'Programmes running every week' },
        { value: '312', label: 'Volunteers on the rota today' },
      ],
      hallCaption: 'The old library on Elm Street, which the charity has owned since 2001.',
      people: [
        '## Our trustees',
        'Six unpaid trustees are responsible for the charity. They are elected at the annual general meeting for three years, and at least two of them are always volunteers.',
        '- Helen Ashby, chair. A retired head teacher and a homework club tutor since 2010.',
        '- Martin Okafor, treasurer. A chartered accountant who works for the NHS trust.',
        '- Sarah Whitlock, secretary. A solicitor, and a driver on Thursdays.',
        '- Daniel Reyes. Runs a building firm in the town and looks after the hall.',
        '- Amina Hussain. A pharmacist on Marlow Street and a food bank volunteer.',
        '- Tom Garside. A student at Ashworth College, elected by the volunteers.',
        '## Our staff',
        'Priya Nair coordinates the programmes and Colin Birch manages volunteers. Both work three days a week, and both started as volunteers.',
      ],
      quote:
        'We never set out to be a charity. We just could not stand the thought of a neighbour going without dinner.',
      quoteAuthor: 'Margaret Heald',
      quoteRole: 'One of the three founders, in 1994',
      partnersTitle: 'The organisations we work with',
    },
    contact: {
      intro: [
        `The quickest way to reach ${name} is to ring the hall or come in. Someone is there on weekdays from 9.30am to 4pm, and on Thursday evenings until 8pm.`,
      ],
      ways: [
        {
          icon: 'phone',
          title: `Ring ${PHONE}`,
          text: 'Weekdays from 9.30am to 4pm. Leave a message at other times and we ring back the next working day.',
          href: PHONE_HREF,
        },
        {
          icon: 'mail',
          title: 'Write to us',
          text: `${c.email()}, for anything at all. Each programme page also gives the address of the people who run it.`,
          href: `mailto:${c.email()}`,
        },
        {
          icon: 'map-pin',
          title: 'Visit the hall',
          text: `${HALL}, ${HALL_ADDRESS}. The 14 and 22 buses stop outside; the Elm Street entrance is step-free.`,
          href: 'https://www.openstreetmap.org/',
        },
        {
          icon: 'clock',
          title: 'Opening hours',
          text: 'Monday to Friday, 9.30am to 4pm. Thursday evenings, 5.30pm to 8pm. Saturday mornings in the garden, April to October.',
        },
      ],
      concerns: [
        '## Raising a concern',
        `If you are worried about the safety of a child or an adult at any of our programmes, speak to Priya Nair, our safeguarding lead, on ${PHONE}, or to any trustee. If someone is in immediate danger, ring 999.`,
        `If you are unhappy with how we have treated you, write to the chair of trustees at ${HALL}, ${HALL_ADDRESS}. We reply within ten working days.`,
      ],
    },
    privacy: [
      `${name} (registered charity ${CHARITY_NUMBER}) is responsible for the personal information described on this page. You can reach us at ${HALL}, ${HALL_ADDRESS}, or by email at ${c.email('privacy')}.`,
      '## What we keep',
      '- For the food bank: a first name and the number of people at home, on paper, destroyed at the end of each month.',
      '- For donors: name, address and the gifts you make, and a Gift Aid declaration if you give one.',
      '- For volunteers: contact details, an emergency contact, the shifts you do and, for homework club tutors, the date of a DBS check.',
      '- For homework club: a parent or carer’s contact details and anything they tell us about the child’s health or learning.',
      '## Why, and for how long',
      'We keep donation records for six years after your last gift, because HMRC requires it for Gift Aid. We keep volunteer details while you volunteer and for a year afterwards. We never sell or share personal information, and we do not use it for anything other than the reason you gave it.',
      '## This website',
      'This site sets no advertising or tracking cookies. If you choose a light or dark appearance, your browser remembers the choice on your own device.',
      '## Your rights',
      'You can ask to see, correct or delete what we hold about you, at any time and at no cost. If you are unhappy with how we have handled your information, you can complain to the Information Commissioner’s Office.',
    ],
    legal: [
      `This website belongs to ${name}, a charitable incorporated organisation registered in England and Wales, charity number ${CHARITY_NUMBER}. Our address is ${HALL}, ${HALL_ADDRESS}, and you can reach us at ${c.email()} or on ${PHONE}.`,
      '## Who is responsible for the site',
      'The chair of trustees is responsible for what is published here. The pages are written and kept up to date by the charity’s own volunteers.',
      '## Photographs',
      'The photographs on this site are used under open licences. The photo credits page names every author and licence.',
      '## Links to other sites',
      'We link to a few other sites, for example a map of the hall. We are not responsible for what they publish or for how they treat your information.',
    ],
    credits: {
      intro: [
        'The photographs on this site are published under open licences: Creative Commons Zero, the public domain, or Creative Commons Attribution. They were cropped and resized for this site. The logos of the partner organisations were drawn for this demonstration and belong to no real organisation.',
      ],
      licenceWord: 'Licence',
      sourceWord: 'Source',
    },
  }
}

export const ASSOCIATION_COPY_EN: AssociationCopy = {
  locale: 'en',
  defaultName: 'Riverside Neighbours',
  identity: {
    phone: PHONE,
    phoneHref: PHONE_HREF,
    address: `${HALL}, ${HALL_ADDRESS}`,
    hall: HALL,
    street: HALL_STREET,
    town: HALL_TOWN,
    registration: `Registered charity in England and Wales, no. ${CHARITY_NUMBER}`,
    emailSuffix: 'org.uk',
    emailFallback: 'neighbours',
    mailboxes: { volunteer: 'volunteer', treasurer: 'treasurer', events: 'events' },
    mapHref: 'https://www.openstreetmap.org/',
  },
  schema: {
    routes: { event: '/events/:slug', programme: '/what-we-do/:slug' },
    labels: {
      event: { singular: 'Event', plural: 'Events' },
      programme: { singular: 'Programme', plural: 'Programmes' },
    },
    fields: {
      starts: 'Starts',
      ends: 'Ends',
      place: 'Place',
      address: 'Street address',
      summary: 'Summary',
      when: 'When',
      audience: 'Who it is for',
    },
    help: {
      place: 'The name of the room or venue.',
      cost: 'For example "Free" or "£25, £12 for under-16s".',
      booking: 'Whether to book, and how.',
      summary: 'One or two sentences, shown in the calendar.',
      when: 'For example "Thursdays, 5.30pm to 7.30pm".',
      contact: 'An email address or a telephone number.',
    },
  },
  pageSlugs: {
    home: 'home',
    whatWeDo: 'what-we-do',
    events: 'events',
    volunteer: 'volunteer',
    donate: 'donate',
    finances: 'finances',
    about: 'about',
    contact: 'contact',
    privacy: 'privacy',
    legal: 'legal',
    credits: 'photo-credits',
  },
  programmes: PROGRAMMES,
  events: EVENTS,
  partners: [
    {
      key: 'partner-ashworth-college',
      name: 'Ashworth College',
      file: 'partner-ashworth-college.png',
    },
    {
      key: 'partner-ashworth-council',
      name: 'Ashworth Borough Council',
      file: 'partner-ashworth-council.png',
    },
    {
      key: 'partner-brindle-and-sons',
      name: 'Brindle & Sons',
      file: 'partner-brindle-and-sons.png',
    },
    { key: 'partner-kestrel-homes', name: 'Kestrel Homes', file: 'partner-kestrel-homes.png' },
    { key: 'partner-linden-trust', name: 'The Linden Trust', file: 'partner-linden-trust.png' },
    {
      key: 'partner-marlow-street-pharmacy',
      name: 'Marlow Street Pharmacy',
      file: 'partner-marlow-street-pharmacy.png',
    },
  ],
  media: [
    {
      name: 'hero',
      file: 'hero.jpg',
      alt: 'A sunlit shared garden behind a building, with a pergola, a greenhouse and sacks of compost',
    },
    {
      name: 'programme-food-bank',
      file: 'food-bank.jpg',
      alt: 'Crates of peas, apples, potatoes, tomatoes and lemons, seen from above',
    },
    {
      name: 'programme-homework-club',
      file: 'homework-club.jpg',
      alt: 'Reading tables in front of a lit bookcase, ready for the afternoon',
    },
    {
      name: 'programme-garden',
      file: 'garden-corner.jpg',
      alt: 'A corner of the garden with a wooden table, pots of herbs and a raised bed',
    },
    {
      name: 'event-planting',
      file: 'garden-planting.jpg',
      alt: 'Neighbours raking soil into a long raised bed, a child watching',
    },
    {
      name: 'programme-coat-bank',
      file: 'coat-bank.jpg',
      alt: 'Jackets and shirts hanging in a row, sorted for the clothing bank',
    },
    {
      name: 'event-orientation',
      file: 'orientation.jpg',
      alt: 'A table and white chairs in a bright room with a wooden floor, ready for a meeting',
    },
    {
      name: 'event-supper',
      file: 'supper.jpg',
      alt: 'Tables laid with glasses and napkins for a supper, a bookcase on the wall behind them',
    },
    {
      name: 'hall',
      file: 'hall.jpg',
      alt: 'A tall, white library room with pointed windows, shelves and reading tables',
    },
  ],
  pages,
  programmeBlocks: {
    othersTitle: 'More of what we do',
    eventOthersTitle: 'Other dates at the hall',
  },
  menus: {
    header: [
      { label: 'What we do', page: 'whatWeDo' },
      { label: 'Events', page: 'events' },
      { label: 'Volunteer', page: 'volunteer' },
      { label: 'About us', page: 'about' },
    ],
    action: 'Donate',
  },
  footer: [
    {
      heading: 'Get involved',
      links: [
        { label: 'Ways to give', url: '/donate' },
        { label: 'Volunteer with us', url: '/volunteer' },
        { label: 'Events', url: '/events' },
      ],
    },
    {
      heading: 'What we do',
      links: [
        { label: 'Thursday food bank', url: '/what-we-do/thursday-food-bank' },
        { label: 'Homework club', url: '/what-we-do/homework-club' },
        { label: 'Community garden', url: '/what-we-do/community-garden' },
        { label: 'Winter coat bank', url: '/what-we-do/winter-coat-bank' },
      ],
    },
    {
      heading: 'About us',
      links: [
        { label: 'Our story', url: '/about' },
        { label: 'Where the money goes', url: '/finances' },
        { label: 'Contact us', url: '/contact' },
        { label: 'Privacy', url: '/privacy' },
        { label: 'Legal information', url: '/legal' },
        { label: 'Photo credits', url: '/photo-credits' },
      ],
    },
  ],
  footerNote: (c) =>
    [
      `Registered charity in England and Wales, no. ${CHARITY_NUMBER}`,
      HALL,
      HALL_STREET,
      HALL_TOWN,
      '',
      PHONE,
      c.email(),
      '',
      'The hall is open Monday to Friday, 9.30am to 4pm, and on Thursday evenings.',
    ].join('\n'),
  settings: {
    tagline: 'Food, homework help, a garden and warm coats, from the old library on Elm Street.',
  },
  widgets: {
    keepFreeHeading: 'Keep it free for everyone',
    keepFreeBody:
      'Nobody pays for a food parcel, a place at homework club or a winter coat. £12 a month keeps one family in fresh vegetables all year.',
    keepFreeLabel: 'Ways to give',
    adviceTitle: 'Help with something else',
    adviceLines: [
      'Debt advice, housing, benefits and the council’s support fund all hold sessions at the hall.',
      'Ring [{phone}]({phoneHref}) on a weekday and we will tell you when the next one is.',
    ],
    weeklyTitle: 'Every week at the hall',
    handHeading: 'Lend a hand on the day',
    handBody:
      'Collections, garden mornings and the supper all run on volunteers. Come for two hours or stay all day; nobody needs experience.',
    handLabel: 'Volunteer with us',
  },
}
