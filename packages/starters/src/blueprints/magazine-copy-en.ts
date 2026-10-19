import {
  h2,
  type MagazineCopy,
  type MagazineDemoArticle,
  type MagazineDemoAuthor,
  type MagazineDemoSection,
  p,
  prose,
  pullQuote,
} from './magazine-copy.js'

/**
 * The English `magazine`: an independent news and culture magazine for
 * Port Calder, a fictional mid-sized city. The city, its institutions and
 * every person quoted are invented; the photographs show places of the same
 * kind, never the places named (see `magazine-credits.ts`).
 */

export const DEFAULT_PUBLICATION_NAME_EN = 'The Meridian'

export const MAGAZINE_DEMO_SECTIONS_EN: readonly MagazineDemoSection[] = [
  {
    name: 'News',
    slug: 'news',
    description: 'City hall, schools, transit, housing and the courts.',
  },
  {
    name: 'Business',
    slug: 'business',
    description: 'The companies, workers and property decisions that shape the local economy.',
  },
  {
    name: 'Culture',
    slug: 'culture',
    description: 'Reviews and reporting on the city’s art, theater, music and restaurants.',
  },
  {
    name: 'Opinion',
    slug: 'opinion',
    description: 'Columnists and readers who live here and argue in good faith.',
  },
]

export const MAGAZINE_DEMO_AUTHORS_EN: readonly MagazineDemoAuthor[] = [
  { name: 'Ruth Adebayo', slug: 'ruth-adebayo' },
  { name: 'Tomas Lindqvist', slug: 'tomas-lindqvist' },
  { name: 'Sam Okonjo', slug: 'sam-okonjo' },
  { name: 'Priya Raman', slug: 'priya-raman' },
  { name: 'Owen Mercer', slug: 'owen-mercer' },
  { name: 'Celia Marchetti', slug: 'celia-marchetti' },
  { name: 'Jonah Feld', slug: 'jonah-feld' },
  { name: 'Lucía Ferrer', slug: 'lucia-ferrer' },
  { name: 'Nadia Haddad', slug: 'nadia-haddad' },
  { name: 'Graham Oyelaran', slug: 'graham-oyelaran' },
  { name: 'Esther Kowalczyk', slug: 'esther-kowalczyk' },
  { name: 'Marcus Bell', slug: 'marcus-bell' },
]

// ---------------------------------------------------------------------------
// The journalism, oldest first
// ---------------------------------------------------------------------------

export const MAGAZINE_DEMO_ARTICLES_EN: readonly MagazineDemoArticle[] = [
  {
    title: 'What the new rental licensing rules mean for small landlords',
    slug: 'rental-licensing-rules-small-landlords',
    kicker: 'Housing',
    excerpt:
      'The ordinance that takes effect on November 1 was written with large landlords in mind. Its $40 registration fee will also reach about 1,200 people who rent out a basement or a garage apartment.',
    section: 'business',
    authors: ['owen-mercer'],
    publishedAt: '2026-08-24T07:00:00.000Z',
    frontPage: false,
    body: ({ siteName }) => [
      prose(
        p(
          'Most of the debate over Port Calder’s rental licensing ordinance has been about its rules for large buildings: annual inspections, a public registry of owners, fines for unregistered units. The provision likely to affect the most people is shorter, and it sits in Section 4.',
        ),
        p(
          'Section 4 requires every landlord renting out more than one unit to register each unit and pay an annual $40 inspection fee, whatever the size of the property. The city’s housing office estimates that about 1,200 residents rent out a basement apartment, a garage apartment or the second half of a duplex they live in, and that most of them have never registered anything with the city.',
        ),
        p(
          `A staff memo obtained by ${siteName} describes the overlap as “an acceptable tradeoff for closing the registration gap.” It does not estimate how many small landlords might stop renting rather than register.`,
        ),
        p(
          'Housing advocates disagree on the answer. Tobias Wren of the Lakeshore Housing Coalition expects the effect to be small. “Forty dollars is less than one day’s rent on a basement apartment,” he said. Maria Castellanos, who runs a legal clinic for tenants in Canal Ward, is less sure. Registration also triggers an inspection, and many older basement units would need egress windows or new wiring to pass it.',
        ),
        p(
          '“Some of those units will be fixed, which is good,” Castellanos said. “Some will be taken off the market, and the people living in them will not find anything cheaper.”',
        ),
        h2('What small landlords need to do'),
        p(
          'Registration opens on October 1 on the city’s website and at the permit counter on the second floor of City Hall. Landlords who register before January 31 will not be charged for their first inspection. A unit that fails its inspection has 90 days to be repaired before a fine applies.',
        ),
        p(
          'The housing office hotline has taken more calls about the $40 fee in its first two weeks than about any other part of the 60-page ordinance, according to a staff member who answers it.',
        ),
      ),
    ],
  },
  {
    title: 'Keep two libraries open until 9 p.m. for a year, and count who comes',
    slug: 'keep-libraries-open-late-and-count',
    kicker: 'Marcus Bell',
    excerpt:
      'The library board wants to close the Northgate and Eastbank branches to save money. A cheaper experiment would tell the city what those two buildings are worth.',
    section: 'opinion',
    authors: ['marcus-bell'],
    publishedAt: '2026-08-25T07:00:00.000Z',
    frontPage: false,
    body: ({ siteName }) => [
      prose(
        p(
          'The Port Calder Public Library board is considering closing two branches, Northgate and Eastbank, to fill a $2.1 million hole in its budget. Before it votes in November, I would like it to try the opposite for one year.',
        ),
        p(
          'Keep both branches open until 9 p.m. on weekdays, count who comes in after six, and publish the numbers every month. The extra staff hours would cost about $380,000 a year, according to figures the library itself published for a similar proposal in 2023. That is a fraction of the savings the board is chasing, and a small price for evidence.',
        ),
        p(
          'I taught eighth grade at Northgate Middle School for twenty-six years. The branch library across the street was where my students went when home was loud, cold or empty. It now closes at 6 p.m., which is about when most of their parents finish work.',
        ),
        p(
          'The board’s own figures show 88,000 visits to Northgate last year, even with shortened hours. They cannot show who stayed away because the doors were already locked by the time they could get there.',
        ),
        p(
          'A mobile library that visits twice a week is a fine service for a neighborhood that already has a branch. It is a poor replacement for a warm building with free internet that a thirteen-year-old can walk to on a Wednesday.',
        ),
        p(
          'Evening hours would also answer a question the board has never asked: who uses a library when it is open at the times working people are free. Two branch systems elsewhere in the region stay open until 8 p.m., and both report that their busiest hour of the day is the one after dinner.',
        ),
        p(
          'Run the experiment. If nobody comes after six, the board will have its answer, and I will write a column saying so.',
        ),
        p(
          `*Marcus Bell taught at Northgate Middle School from 1994 to 2020 and writes for ${siteName}.*`,
        ),
      ),
    ],
  },
  {
    title: 'The community radio station that finally found an overnight host',
    slug: 'community-radio-overnight-host',
    kicker: 'Radio',
    excerpt:
      'For two years a night-shift nurse kept Harbor Community Radio on the air whenever its automated playlist failed. This season the station gave him the hours for real.',
    section: 'culture',
    authors: ['sam-okonjo'],
    publishedAt: '2026-08-26T07:00:00.000Z',
    frontPage: false,
    body: () => [
      prose(
        p(
          'For two years, whenever the automated playlist at Harbor Community Radio crashed in the middle of the night, the station went silent for a few minutes and then came back with a person talking. That person was Marcus Webb, a night-shift nurse at Port Calder General Hospital who lives three blocks from the studio and has a key.',
        ),
        p(
          'This month the volunteer-run station, which broadcasts on 91.3 FM from a converted storage room above the Eastbank Community Center, gave Webb the 1 a.m. to 5 a.m. slot on Thursday nights. It is unpaid, like every other show on the schedule, and it is his.',
        ),
        p(
          'He plans to fill most of it with a collection of 3,000 records that a retired disc jockey donated in 2019 and that nobody has had time to catalog. “I’m going to play them in the order they come out of the boxes,” Webb said, “and find out what we have.” His first letter has already arrived, from a listener on the night shift at the port who asked for more jazz.',
        ),
        p(
          'The overnight show is one of four new programs this season. The others are a Spanish-language news roundup produced by two journalism students at Northgate Community College, an hour of recordings sent in by local bands, and a series of oral histories with residents who arrived in the city as refugees. Three long-running shows have ended, including a sports call-in program that station manager Claire Anand said had not received a call in eleven months.',
        ),
        p(
          'The station runs on about $40,000 a year, most of it raised in a single pledge drive each spring. Anand said the new schedule was built around one rule: no show goes on air unless a second volunteer has been trained to run it.',
        ),
        p(
          '“We lost two programs the hard way, when the only person who knew how to run them moved away,” she said. “Marcus has already trained his backup.”',
        ),
      ),
    ],
  },
  {
    title: 'The projectionist who kept forty years of the city’s film history in his garage',
    slug: 'projectionist-kept-alhambra-film-notes',
    kicker: 'Archives',
    excerpt:
      'Every film shown at the Alhambra between 1963 and 2003 got a typed page of notes. Frank Delury saved all of them, and the University of Port Calder has agreed to take them in.',
    section: 'culture',
    authors: ['celia-marchetti'],
    publishedAt: '2026-08-28T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'archive-stacks',
      caption:
        'Shelving in a university archive store, where the Alhambra papers will be catalogued.',
    },
    body: () => [
      prose(
        p(
          'For forty years, every film that played at the Alhambra on Canal Street got a single typed page. The page gave the title, the dates of the run and the number of reels, followed by a few lines for whichever projectionist was on duty next: the reel where the sound drops, the changeover that comes early, the print with a scratch through its second half.',
        ),
        p(
          'Nobody asked anyone to keep them. When the Alhambra closed in 2003, its owner told the staff to take whatever they wanted before the building was cleared. Frank Delury, who had worked in the projection booth since 1971, took the filing cabinets.',
        ),
        p(
          'They stayed in his garage in Eastbank for twenty-one years. Last month the University of Port Calder library agreed to catalog and digitize the collection, which fills 61 boxes and holds a little under 9,000 pages.',
        ),
        h2('A record of what failed'),
        p(
          'The archivist Teodora Vukić spent three weekends this spring sorting the papers on Delury’s kitchen table before recommending that the library take them. What makes the collection valuable, she said, is its record of the films nobody remembers.',
        ),
        p(
          '“The hits are documented everywhere,” Vukić said. “What you almost never find is a record of the films that opened on a Friday, played to forty people and were gone by Tuesday. Frank wrote those down too, because somebody still had to thread the projector.”',
        ),
        p(
          'Among them are a run of Italian westerns in the summer of 1968, a war film that played two nights in 1974 to a total of 83 people, and dozens of prints from regional distributors that appear in no national catalog. Vukić found notes on 214 films she could not identify in any database.',
        ),
        p(
          'The pages also record how the Alhambra changed. Notes from the early 1960s describe double bills and a newsreel. By the late 1970s they mention a second screen built into the old balcony, and by 1990 almost every page carries a warning about the new sound system, which the staff seem to have disliked from the day it was installed.',
        ),
        h2('The booth, in writing'),
        p(
          'The notes are also a record of the work itself. Delury and his colleagues wrote down which reels arrived damaged, which studios sent prints too late for a test screening and, in 1977, a two-page account of a fire in the rewinding room that closed the cinema for a week. The handwriting in the margins changes as projectionists came and went, and some pages carry corrections from three different people.',
        ),
        p(
          'Delury started as an usher at sixteen and moved into the booth when the senior projectionist broke his wrist. He learned to splice film on the job, he said, from a man who kept a razor blade in his shirt pocket and a list of every film he had ever shown taped inside the booth door.',
        ),
        p(
          'Delury, who is 79, remembers most of them. Sitting in his garage in August, he picked up a page from November 1985 and read out the note at the bottom, in his own hand: reel four runs short, watch the changeover, the audience will not notice if you are quick.',
        ),
        p('“That was the whole job,” he said. “Making sure nobody noticed you were there.”'),
      ),
      pullQuote(
        'What you almost never find is a record of the films that opened on a Friday, played to forty people and were gone by Tuesday.',
        'Teodora Vukić',
        'Archivist',
      ),
      prose(
        h2('One condition'),
        p(
          'The library will scan the collection over the next eighteen months and open it to researchers, with a public online index of every film listed. Delury keeps the original pages for the rest of his life, after which they pass to the library.',
        ),
        p(
          'The work will cost about $48,000, most of it covered by a grant from the state humanities council. The library has also asked former staff and moviegoers to lend photographs of the cinema, of which it has so far found only eleven, all of them taken from the street.',
        ),
        p(
          'He set one condition, which the library accepted without discussion. The catalog must name every projectionist who wrote a note, alongside every film. Delury has identified nineteen of them so far. He is still looking for the twentieth, a woman who signed her notes “M.K.” in the winter of 1966 and who, he believes, was the Alhambra’s only female projectionist before 1990.',
        ),
        p(
          'Anyone who worked at the Alhambra, or knows who did, can write to the university library’s special collections department. Vukić has already heard from two former ushers and from the grandson of the cinema’s first manager.',
        ),
      ),
    ],
  },
  {
    title: 'The morning trains are full again. Midday service is running nearly empty',
    slug: 'morning-trains-full-midday-empty',
    kicker: 'Transport',
    excerpt:
      'Ridership on the Northgate commuter line is back to 94 percent of its 2019 level at rush hour and 41 percent the rest of the day. The transit authority must now decide what to do about it.',
    section: 'business',
    authors: ['owen-mercer'],
    publishedAt: '2026-08-29T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'empty-tram-stop',
      caption: 'A quayside stop at midday, between the morning and the evening peaks.',
    },
    body: () => [
      prose(
        p(
          'At 7:52 on a weekday morning, the platform at Northgate station is as crowded as it was in 2019. By 10 a.m., the trains passing through it carry an average of 38 passengers in cars built for 300.',
        ),
        p(
          'Figures published by the Harbor Transit Authority this week show rush-hour ridership on the Northgate commuter line back to 94 percent of its prepandemic level. Between the morning and evening peaks, ridership stands at 41 percent, and on Fridays it has barely moved since 2022.',
        ),
        p(
          'The pattern follows the way office work has settled in the city. Most downtown employers now expect staff at their desks three days a week, usually Tuesday to Thursday, and the trains show it: Wednesday morning ridership is above its 2019 level, while Friday mornings run at about 60 percent.',
        ),
        h2('Two options on the table'),
        p(
          'The authority is weighing two proposals for the timetable that takes effect in January. The first would cut midday service from every 20 minutes to every 40 and spend the savings, about $3.2 million a year, on two more trains in each rush hour. The second would keep the midday frequency and add weekend service, on the bet that off-peak riders return when trains come often enough to use without checking a timetable.',
        ),
        p(
          'Riders’ groups favor the second. “A train every 40 minutes is a train nobody takes unless they have to,” said Kofi Mensah of the Northgate Riders Association, who takes the 7:52 himself. “The midday rider is a nurse, a student, a retiree going to an appointment. Cut their train and they buy a car.”',
        ),
        p(
          'The authority’s planners say the budget does not allow both. Its chief planning officer, Ingrid Sorensen, said a cost comparison of the two options would be published in October, followed by a public hearing before the board votes in November.',
        ),
        p(
          'Whichever option wins, the authority will run four-car trains on Tuesday, Wednesday and Thursday mornings from October, after months of complaints from passengers standing all the way from Northgate to downtown.',
        ),
      ),
    ],
  },
  {
    title: 'An empty storefront is sometimes just a retirement',
    slug: 'empty-storefront-sometimes-a-retirement',
    kicker: 'Esther Kowalczyk',
    excerpt:
      'Every closed shop on Vine Street gets the same eulogy about rents and decline. Some of them deserve it. Treating them all alike makes the real losses harder to see.',
    section: 'opinion',
    authors: ['esther-kowalczyk'],
    publishedAt: '2026-08-31T07:00:00.000Z',
    frontPage: false,
    body: ({ siteName }) => [
      prose(
        p(
          'When a storefront goes dark in this city, the obituary writes itself: rising rents, a changing neighborhood, the end of something that cannot be replaced. Sometimes all of that is true. Sometimes the owner simply retired.',
        ),
        p(
          'The corner bakery at 9th and Vine closed in March, and the neighborhood association’s newsletter gave a full page to “another casualty of the rent crisis.” When I called the owner, she laughed. She is 68, her children have no interest in running a bakery, and she had tried to sell the business for three years before deciding to lock the door and enjoy her mornings.',
        ),
        p(
          'The newsletter did her a small disservice as well. Three neighbors called after it ran to ask whether she needed money to reopen, and one offered to organize a fundraiser. She had to explain, three times, that she was fine and would be at the farmers market on Saturday.',
        ),
        p(
          'Rents are rising, and they are closing businesses. I know four owners on Vine Street who lost their shops this year when their leases came up for renewal, and all four agreed to be named in this magazine’s coverage. They are angry, and they are right to be.',
        ),
        p(
          'The trouble with the reflex is that it erases the difference between a landlord’s decision and a person’s plans. A neighborhood that treats every vacancy as proof of decline stops asking the useful questions: who owns the building, what the renewal asked for, and whether anyone tried to buy the business and could not get a loan.',
        ),
        p(
          'Those answers point to different remedies. A retiring owner needs a buyer, and the city’s small business office could help match one. A tenant facing a doubled rent needs lease protections, which the council has discussed for two years without a vote.',
        ),
        p(
          'Grief for a corner bakery is real, and I share it. It should come with a phone call to find out what actually happened.',
        ),
        p(
          `*Esther Kowalczyk has lived on Vine Street since 1994 and writes about neighborhoods for ${siteName}.*`,
        ),
      ),
    ],
  },
  {
    title: 'Three small theaters, one unexpected season',
    slug: 'three-small-theaters-one-season',
    kicker: 'Theater',
    excerpt:
      'The Riverside Players, the Loft and the Blackbox Collective all came close to closing in 2024. All three are now selling out, for three different reasons.',
    section: 'culture',
    authors: ['jonah-feld'],
    publishedAt: '2026-09-01T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'theatre',
      caption: 'The house of a small theater a few minutes before a performance.',
    },
    body: () => [
      prose(
        p(
          'Eighteen months ago, two of the three small theaters now selling out their runs in Port Calder were one bad season away from giving up their leases. The third had already given notice.',
        ),
        p(
          'The three artistic directors do not agree on what changed, and their explanations are different enough that they may all be right.',
        ),
        p(
          'The Riverside Players moved their main season from Friday-to-Sunday runs to Wednesday-to-Saturday. Artistic director Hal Brennan said the change followed a survey of the company’s mailing list, which found that a large share of its audience worked weekend shifts at the hospital and the port. Midweek attendance rose by 70 percent in the first season.',
        ),
        p(
          'At the Loft on Mill Street, a 40-second rehearsal video posted by a cast member brought in an audience about twenty years younger than the company’s subscribers. “We did nothing,” said artistic director Femi Adeyemi. “The video did it, and then we had to be good enough that they came back.” About half of those new ticket buyers returned for a second production, according to the Loft’s box office.',
        ),
        p(
          'The Blackbox Collective raised its ticket prices from $18 to $32, the first increase in six years, expecting to lose part of its audience. It lost almost none, and used the extra money to pay its actors for rehearsals as well as performances.',
        ),
        p(
          '“People had been telling us for years that the tickets were too cheap to take seriously,” said managing director Wren Adisa. “We thought they were being polite.”',
        ),
        p(
          'What the three share is their size. None seats more than 140 people, none owns its building, and all three depend on volunteers to run the front of house. A bad season could still undo any of them. For now, the Loft has added a Thursday performance, and the Blackbox Collective has a waiting list for its December production for the first time in its history.',
        ),
      ),
    ],
  },
  {
    title: 'Juniper Hill gardeners win a ten-year lease on city land',
    slug: 'juniper-hill-garden-ten-year-lease',
    kicker: 'Neighborhoods',
    excerpt:
      'After five years on a month-to-month permit, the Juniper Hill Community Garden has a lease that lets its volunteers plant trees, build a shed and plan past next spring.',
    section: 'news',
    authors: ['sam-okonjo'],
    publishedAt: '2026-09-02T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'allotments',
      caption: 'Onions, potatoes and tomatoes in the rows of the Juniper Hill community garden.',
    },
    body: () => [
      prose(
        p(
          'For five years the Juniper Hill Community Garden has operated on a permit the city could cancel with thirty days’ notice. Its volunteers grew vegetables and flowers, and nothing that took longer than a season.',
        ),
        p(
          'On Thursday the parks committee approved a ten-year lease on the 1.3-acre lot at the corner of Alder Street and Wren Avenue, at a rent of one dollar a year. The full council is expected to confirm it on October 2.',
        ),
        p(
          '“The first thing we’re planting is a row of pear trees,” said Marcus Oyelowo, who coordinates the garden’s 140 volunteers. “You don’t plant pear trees on a month-to-month permit.”',
        ),
        p(
          'The city took ownership of the lot after a warehouse fire in 2014, and neighbors began clearing it in 2021. The garden now has 62 raised beds allotted by lottery, a composting area that takes food scraps from three nearby restaurants, and a waiting list of 90 households.',
        ),
        p(
          'Volunteers grew about 2,300 pounds of vegetables last season, according to the garden’s own records, and gave a third of it to the food pantry at St. Brendan’s Church on Harbor Road. The lease also allows a weekly produce stand, which the garden plans to open next summer.',
        ),
        p(
          'The lease requires the garden to stay open to the public in daylight, to carry liability insurance and to let the city reclaim the site with two years’ notice if it is needed for housing. That clause drew the only objection at Thursday’s meeting, from a resident who argued the lot should be built on now.',
        ),
        p(
          'Parks director Simone Achebe said the city’s housing office assessed the site in 2023 and ranked it low for development because of soil contamination beneath the old warehouse floor. The raised beds, filled with imported soil, were built partly for that reason.',
        ),
        p(
          'The garden’s next project is a tool shed with a rainwater tank, paid for by a $14,000 neighborhood grant. The volunteers hope to finish it before the first frost.',
        ),
      ),
    ],
  },
  {
    title:
      'Two downtown office towers will become apartments. Other owners are watching the numbers',
    slug: 'downtown-office-towers-become-apartments',
    kicker: 'Property',
    excerpt:
      'With a fifth of downtown office space empty, the owners of the Lakeview Building and 200 Canal Street have filed plans for 410 apartments. The rest of the market is waiting for their construction costs.',
    section: 'business',
    authors: ['priya-raman'],
    publishedAt: '2026-09-03T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'office-block-dusk',
      caption:
        'An office block at dusk on Canal Street, where only a few floors still have their lights on.',
    },
    body: () => [
      prose(
        p(
          'Downtown Port Calder has 6.8 million square feet of office space. On an average weekday this summer, 21 percent of it stood empty, according to the commercial property firm Halvorsen Grant, up from 9 percent in 2019.',
        ),
        p(
          'Two owners have decided to stop waiting for tenants. Plans filed with the city this month would convert the 14-story Lakeview Building and the 11-story tower at 200 Canal Street into a combined 410 apartments, the first office-to-residential conversions downtown since the 1990s.',
        ),
        h2('Why most towers cannot be converted'),
        p(
          'Conversions are harder than they sound. Office floors built after about 1970 tend to be deep, which leaves the interior rooms of an apartment without windows, and every unit needs its own plumbing. The architect Hye-jin Park, who studied the downtown stock for the city’s planning department, estimates that only about a quarter of downtown towers could be converted for less than the cost of new construction.',
        ),
        p(
          'Both buildings in the current plans are older and narrower. The Lakeview Building was completed in 1929 and measures 62 feet from its windows to its central corridor, a depth Park described as close to ideal.',
        ),
        p(
          '“Everybody asks why we cannot turn every empty tower into housing,” she said. “The answer is mostly geometry.”',
        ),
        p(
          'The developers are relying on a tax abatement the council approved in 2025, which reduces property taxes on converted buildings for twelve years provided 15 percent of the units are rented below market rates. The two projects would include 62 such apartments.',
        ),
        h2('Who is watching'),
        p(
          'Other landlords are treating the two buildings as a test. Paul Ferreira, who directs Halvorsen Grant’s downtown office, said at least five owners had commissioned feasibility studies since the abatement passed, and that none would commit before seeing real construction costs from the first projects.',
        ),
        p(
          'For the businesses at street level, the arithmetic is simpler. Ana Beltrán, who runs a lunch counter in the lobby of 200 Canal Street, said her takings have fallen by almost half since 2019. “Office workers eat lunch,” she said. “People who live here eat breakfast and dinner. I can open earlier.”',
        ),
        p(
          'The planning commission will review both plans on October 15. If they are approved, construction could begin next spring, with the first residents moving in during 2028.',
        ),
      ),
    ],
  },
  {
    title: 'The small stories are the ones this city remembers',
    slug: 'small-stories-this-city-remembers',
    kicker: 'Graham Oyelaran',
    excerpt:
      'The article that drew the most letters last year ran on page eleven. It belonged on page one, and the reasons it did not say something about how newsrooms decide what matters.',
    section: 'opinion',
    authors: ['graham-oyelaran'],
    publishedAt: '2026-09-04T07:00:00.000Z',
    frontPage: false,
    body: ({ siteName }) => [
      prose(
        p(
          'Every autumn this magazine publishes dozens of stories about the city budget, the rail line and the stadium proposal. They are read, shared and argued over, as they should be. They are also rarely the stories readers bring up when they write to us.',
        ),
        p(
          `The article that drew the most letters to ${siteName} last year was 400 words long. It described Doris Quaye, who helped children cross the corner of Alder Street and 9th Avenue every school morning for thirty-one years and retired without so much as a card from the school district. We ran it on page eleven. It belonged on page one.`,
        ),
        p(
          'Newsrooms bury stories like hers for a practical reason. A council vote arrives with an agenda, a press release and a deadline. A retiring crossing guard arrives with nothing until a reporter happens to notice her, and noticing takes time a small staff does not always have.',
        ),
        p(
          'We are going to make that time. From this month, one reporter will spend two days a week on stories nobody has sent us: the people who keep a neighborhood running, and the institutions that close without a hearing. The Juniper Hill garden lease and the fight over the Northgate library are the first results.',
        ),
        p(
          'The reporter’s first assignment was a single block of Canal Ward, walked door to door over a week. It produced three stories, a correction to a city map that had listed a closed clinic as open for two years, and a list of names we will go back to.',
        ),
        p(
          'This work will sit beside our coverage of city hall, which is the reason many of you subscribe. A city is also its corners, and a newspaper that only covers the council chamber misses most of what holds a place together.',
        ),
        p(
          'If you know a story like that, write to me at the address at the foot of this page. I read every letter, and so does the reporter.',
        ),
        p(`*Graham Oyelaran is the editor of ${siteName}.*`),
      ),
    ],
  },
  {
    title: 'Larkin’s finally has a kitchen as good as its dining room',
    slug: 'larkins-review-kitchen-matches-dining-room',
    kicker: 'Restaurant review',
    excerpt:
      'The 1924 room on Harbor Road has always been the reason to book. Under chef Noor Salame, the food is a reason too.',
    section: 'culture',
    authors: ['lucia-ferrer'],
    publishedAt: '2026-09-05T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'dining-room',
      caption: 'The dining room at Larkin’s, laid for the evening service.',
    },
    body: () => [
      prose(
        p(
          'For as long as anyone can remember, people have gone to Larkin’s for the room. The dining room on Harbor Road has a coffered ceiling, a glass skylight installed in 1924, dark paneling that has outlasted three owners and a flood, and candlelight that flatters everyone at every table. The food, for most of those years, was fine.',
        ),
        p(
          'Noor Salame took over the kitchen in March. Over three visits in the past month, her cooking has been considerably better than fine.',
        ),
        p(
          'Start with the smoked trout, served warm with pickled beets and a sharp horseradish cream, or with the charred leeks with hazelnuts and a soft egg, which is the best vegetable dish I have eaten in the city this year. The bread is baked in the kitchen, comes with cultured butter and is worth its $6.',
        ),
        p(
          'Salame spent eight years in hotel kitchens on the West Coast before moving to Port Calder, and it shows in the discipline of the main courses. A duck leg, cooked slowly and then crisped, arrives with lentils and a bitter-orange sauce that keeps its richness in check. Halibut with mussels and a saffron broth is generous and precisely timed. The one disappointment was a mushroom risotto that tasted mostly of cream.',
        ),
        p(
          'Desserts are simple and good: a dark chocolate tart with salted caramel, and a poached pear with mascarpone that is exactly as light as it should be after the duck.',
        ),
        p(
          'Salame has cut the menu to eleven dishes, down from the laminated list of thirty the previous owners served, and changes about half of them each month. By the second visit the trout had been replaced by cured mackerel with rhubarb, which was just as good.',
        ),
        p(
          'Service is warm, and occasionally slow on a full Saturday. The wine list is short, sensibly priced and strongest in French and Oregon reds, with eleven bottles under $50.',
        ),
        p(
          'Main courses cost $26 to $38. Larkin’s, 318 Harbor Road, serves dinner Tuesday to Saturday. Book a week ahead for a weekend table, and ask for one under the skylight.',
        ),
      ),
    ],
  },
  {
    title: 'Banquet halls are booked through June. The caterers are still short of staff',
    slug: 'banquet-halls-booked-caterers-short-staffed',
    kicker: 'Hospitality',
    excerpt:
      'Weddings, retirement dinners and fundraisers have returned to Port Calder’s banquet halls in numbers not seen since 2019. The people who cook and serve at them have been slower to come back.',
    section: 'business',
    authors: ['priya-raman'],
    publishedAt: '2026-09-07T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'reception-hall',
      caption: 'A reception hall laid out and empty before an evening function.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'St. Brendan’s Hall on Harbor Road has 16 Saturdays left this year, and all of them are booked. So are most Fridays through next June, and a growing number of Thursdays, which the hall’s manager, Theresa Quigley, never used to bother advertising.',
        ),
        p(
          '“In 2021 I was calling people to ask whether they wanted their deposits back,” Quigley said. “Now I have couples asking whether we do Tuesdays.”',
        ),
        p(
          'Across the city’s eleven licensed banquet halls, bookings for events of more than 150 guests rose 38 percent in the first half of 2026 compared with the same period in 2019, according to figures the Port Calder Hospitality Association collected from its members. Spending per guest rose by a little more than a third, roughly in line with food prices.',
        ),
        h2('Full rooms, short kitchens'),
        p(
          `The kitchens have not recovered at the same pace. Four caterers told ${siteName} they turn down between one and three events a month because they cannot staff them, and pay overtime on the events they accept.`,
        ),
        p(
          'Harbourside Catering, the largest independent caterer in the city, had 94 people on its payroll in 2019. It has 61 now, most of them part time. Its owner, Farid Haddad, raised the starting wage for servers to $21 an hour last year and still loses staff to hotel kitchens that can promise regular weekly hours.',
        ),
        p(
          '“A wedding is eleven hours on your feet on a Saturday,” Haddad said. “A hotel offers the same money on a Tuesday morning, with a pension. I would take the hotel.”',
        ),
        p(
          'Some caterers have simplified their menus to cut the number of people needed on the night. A served three-course dinner needs roughly one server for every twelve guests; family-style platters and buffets need about half as many. Quigley said about a third of her autumn bookings had switched formats, sometimes at the caterer’s suggestion and sometimes at the couple’s.',
        ),
        p(
          'The kitchens have changed too. Harbourside now prepares most sauces and desserts two days before a large event and chills them, a practice Haddad resisted for years because he believed guests could taste the difference. “Nobody has complained,” he said. “The cooks have noticed, because they go home before one in the morning.”',
        ),
        h2('A training kitchen in Eastbank'),
        p(
          'The shortage has pushed the trade into an unusual partnership. Since February, Northgate Community College has run a twelve-week banquet service course in a borrowed kitchen at the Eastbank Community Center, with trainees paid a wage by a group of seven caterers and three halls. Of the first 24 students, 19 now work in the trade.',
        ),
        p(
          'The course coordinator, Lena Moreau, said it deliberately teaches the unglamorous parts of the job: carrying four plates at once, setting a room for 300 in ninety minutes and clearing it again by midnight. “Nobody grows up wanting to be a banquet server,” she said. “People find out they are good at it, and that it pays.”',
        ),
        p(
          'Students spend the last three weeks of the course working paid shifts at real events, each one paired with an experienced server from a sponsoring caterer. Moreau said the placements matter more than the classroom: most of the students hired so far were offered jobs by the caterer they shadowed.',
        ),
        p(
          'A second group of students started this month. The college has applied for state workforce funding to double the size of the course next year, and expects a decision in December.',
        ),
      ),
      pullQuote(
        'A wedding is eleven hours on your feet on a Saturday. A hotel offers the same money on a Tuesday morning, with a pension.',
        'Farid Haddad',
        'Owner, Harbourside Catering',
      ),
      prose(
        h2('What it costs the customer'),
        p(
          'For families planning an event, the practical result is less choice and earlier deposits. Quigley now asks for 30 percent of the room fee at booking, up from 10 percent before the pandemic, because a cancelled Saturday is almost impossible to fill at short notice. Haddad asks for final guest numbers three weeks ahead instead of one.',
        ),
        p(
          'Some families have moved smaller celebrations out of the halls altogether. The Eastbank Community Center rents its main room for $400 on a Saturday and allows outside food, and its bookings for family events have doubled since 2023, according to its director, Maureen Oduya.',
        ),
        p(
          'Neither expects the pressure to ease soon. Couples who postponed weddings during the pandemic have mostly married, Quigley said, while retirement parties for a large generation of hospital and city workers are only beginning. “I have three nursing retirement dinners in November alone,” she said. “Those are the nights when nobody leaves before midnight.”',
        ),
      ),
    ],
  },
  {
    title: 'At the Kell, a crowded and generous survey of forty Port Calder painters',
    slug: 'kell-gallery-local-color-review',
    kicker: 'Art review',
    excerpt:
      '“Local Color” hangs 112 works by artists who have lived in the city since 1950. It is too big, and it is the best exhibition the Kell Gallery has mounted in a decade.',
    section: 'culture',
    authors: ['celia-marchetti'],
    publishedAt: '2026-09-08T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'gallery',
      caption: 'A hall of the Kell Gallery, hung for “Local Color” before the doors opened.',
    },
    body: () => [
      prose(
        p(
          '*Local Color*, which opened at the Kell Gallery on Friday and runs until January 11, is the kind of exhibition curators are trained to avoid. It hangs 112 paintings by 40 artists across five rooms, frame touching frame in places, with no argument holding it together beyond the fact that everyone in it lived and worked in Port Calder.',
        ),
        p(
          'It is also the most enjoyable show the Kell has put on in a decade, and the crowd on opening night suggested the city agrees.',
        ),
        p(
          'The curator, Amara Whitfield, has arranged the rooms by decade rather than by style, which produces some happy collisions. In the first room, a harbor scene by Walter Brisbane from 1954, all fog and gray freighters, hangs beside Ruth Okafor’s *Canal Street, Noon* from the same year, a bright, flattened street painted as if from a passing streetcar. They could be two different cities, and in a sense they are: Brisbane lived on the water, Okafor above a laundry downtown.',
        ),
        p(
          'The middle rooms are the weakest. The 1970s and 1980s produced a great deal of large abstract painting here, much of it bought by the banks on Canal Street for their lobbies, and too much of it has come back for this show. A wall of five nearly identical color-field canvases could have been one.',
        ),
        p(
          'The exhibition recovers in its last two rooms. Delia Marsh’s portraits of her neighbors in Canal Ward, painted in the 1990s on the backs of old shop signs, are funny and tender and ought to be far better known. The final room, given to artists working now, includes Samuel Adu’s enormous painting of the Northgate rail yard at night, which the Kell bought for its permanent collection before the show opened.',
        ),
        p(
          'Whitfield has written the wall labels in plain language and signed each one, a small decision that makes the building feel less like an institution. Several labels quote the artists. One quotes Okafor’s landlord, who complained in 1956 about the smell of turpentine.',
        ),
        p(
          'Admission is free on Thursdays after 5 p.m. Go on a Thursday, give yourself two hours, and walk quickly through the middle rooms.',
        ),
      ),
    ],
  },
  {
    title: 'Northgate residents fill a school gym to oppose closing two branch libraries',
    slug: 'northgate-residents-oppose-library-closures',
    kicker: 'Libraries',
    excerpt:
      'More than 300 people came to the first hearing on a plan to close the Northgate and Eastbank branches and replace them with a mobile library.',
    section: 'news',
    authors: ['sam-okonjo'],
    publishedAt: '2026-09-09T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'reading-room',
      caption:
        'A reading room on a weekday afternoon: the branches threatened with closure are smaller, and just as used.',
    },
    body: () => [
      prose(
        p(
          'The Port Calder Public Library expected about sixty people at Monday’s hearing and booked a classroom. Twenty minutes before it began, with the line outside reaching the parking lot, staff moved the meeting to the gymnasium of Northgate Middle School.',
        ),
        p(
          'The library board is considering closing the Northgate and Eastbank branches next July to close a $2.1 million gap in its budget. The two branches would be replaced by a mobile library, a converted bus that would visit each neighborhood two days a week.',
        ),
        p(
          'Of the 41 people who spoke, none supported the plan. Several described the branches as the only public place in their neighborhood that stays warm, quiet and free after school.',
        ),
        p(
          '“My son does his homework there because we have one laptop and three people who need it,” said Denise Alvarado, who lives four blocks from the Northgate branch. “A bus that comes on Tuesdays does nothing for him on a Wednesday.”',
        ),
        p(
          'The library director, Martin Osei, told the audience that no decision had been made and that usage figures for every branch would be published before the board votes in November. Northgate recorded 88,000 visits last year, the third highest of the city’s eleven branches. Eastbank recorded 41,000.',
        ),
        p(
          'Several speakers questioned the savings. Frank Okoro, a retired accountant who volunteers at the Eastbank branch, said the board’s estimate counted the full salaries of staff who would be moved to other branches instead of laid off. “The savings are smaller than the slide says,” he said. Students from Northgate Middle School presented a petition with 1,140 signatures collected over two weeks.',
        ),
        p(
          'Board member Helen Achterberg said she would propose keeping both branches open with shorter weekday hours and asking the council to restore $900,000 cut from the library budget in 2024. A second hearing is scheduled for October 6 at the Eastbank Community Center.',
        ),
      ),
    ],
  },
  {
    title: 'Port Calder keeps planning for the commute it had in 2019',
    slug: 'planning-for-the-commute-of-2019',
    kicker: 'Nadia Haddad',
    excerpt:
      'The trains, the parking garages and the downtown lunch trade are all built around five days a week in the office. That week no longer exists.',
    section: 'opinion',
    authors: ['nadia-haddad'],
    publishedAt: '2026-09-10T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'tram-stop',
      caption: 'A tram stop beside the station. The plan assumes a commute that no longer exists.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'Nearly every transportation decision this city has taken in the past two years assumes a commute that has disappeared.',
        ),
        p(
          'The parking garage approved for Canal Street last spring was sized using traffic counts from 2019. The timetable the Harbor Transit Authority is now revising still treats the midday train as a leftover between two rush hours. Even the case for the Harbor Line, which I support, leans on ridership forecasts built from five days a week downtown.',
        ),
        p(
          'That week is gone. The authority’s own figures show Wednesday morning trains fuller than in 2019 and Friday mornings at 60 percent. Downtown office occupancy averages 79 percent and falls closer to half on Mondays and Fridays. None of this is a crisis. It is a different city, and it moves differently.',
        ),
        p(
          'The people riding at midday are the ones planners call off-peak: hospital staff on rotating shifts, students, parents with small children, retirees on their way to appointments. They are the riders most likely to have no other way to travel, and the first any timetable cut will reach.',
        ),
        p(
          'There is a cheaper way to plan for the city we actually have. Count trips every month instead of every five years, and publish the counts. Design the garage so it can be converted later. Set the timetable so that frequency follows the riders instead of the office calendar.',
        ),
        p(
          'None of this needs new money. The authority already records every tap of a transit card, to the minute. It publishes the totals once a year, in a report that treats everything between the two rush hours as a single number.',
        ),
        p(
          'The council will spend this autumn arguing about stations for a line that opens in 2030. It should spend at least one evening asking what a Tuesday in Port Calder looks like now.',
        ),
        p(
          `*Nadia Haddad is an urban planner, a member of the Northgate Riders Association and a columnist for ${siteName}.*`,
        ),
      ),
    ],
  },
  {
    title: 'A Vine Street bakery turned down three buyout offers. Its owner explains why',
    slug: 'vine-street-bakery-turned-down-buyout-offers',
    kicker: 'Small business',
    excerpt:
      'A regional chain offered more than $600,000 for Okonkwo’s Bakery. Delphine Okonkwo-Reyes said no three times, and has started telling her customers about it at the counter.',
    section: 'business',
    authors: ['owen-mercer'],
    publishedAt: '2026-09-11T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'baguettes',
      caption: 'Baguettes on the counter of the Vine Street bakery.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'The first offer came in a letter. The second came with a lawyer. By the third, in June, Delphine Okonkwo-Reyes had stopped opening the envelopes and started telling the story to customers at the counter of Okonkwo’s Bakery on Vine Street.',
        ),
        p(
          `The buyer was Continental Baking Group, a company based two hours north that has bought four independent bakeries in the Port Calder area since 2024. In each case it kept the bakery’s name on the sign and, within six months, moved most of the bread production to a central commissary, according to two former owners who spoke to ${siteName}.`,
        ),
        p(
          'The last offer, confirmed by two people who saw it, was a little over $600,000, more than four times what Okonkwo-Reyes paid when she bought the business and its building from her mother in 2009.',
        ),
        p(
          '“They explained the number to me every time, as if I had not heard it the first time,” she said. “I heard it. I want my name on the door, and I want the bread made in the back.”',
        ),
        p(
          'The bakery employs nine people and bakes about 700 loaves a day, starting at 3:30 in the morning. Okonkwo-Reyes, who is 58, has begun training her head baker, Joel Amankwah, to take over within five years, and is working with a lawyer on an arrangement that would let him buy the business gradually out of its profits.',
        ),
        p(
          'Customers have noticed. A handwritten card taped to the register last week read, in full, “Please don’t sell.” She has left it there.',
        ),
        p(
          'Independent bakeries have become scarcer in the city. Of the fourteen that operated in Port Calder in 2019, nine are still run by the people who owned them then, according to the county’s business license records.',
        ),
        p(
          'Continental Baking Group did not respond to three requests for comment. Of the eleven storefronts on the block, the bakery is now one of two that have not changed hands since 2020.',
        ),
      ),
    ],
  },
  {
    title: 'The quiet shift in who is leaving Port Calder',
    slug: 'quiet-shift-in-who-is-leaving',
    kicker: 'Housing',
    excerpt:
      'New census estimates show that renters over 60 were the largest group of households to leave the city core last year, and the city’s own permit records suggest why.',
    section: 'news',
    authors: ['tomas-lindqvist'],
    publishedAt: '2026-09-12T07:00:00.000Z',
    frontPage: true,
    body: ({ siteName }) => [
      prose(
        p(
          'For a decade, the explanation for the shrinking population of Port Calder’s downtown has been the same: young families moving to the suburbs for space and schools. The latest census estimates, released on Thursday, point somewhere else.',
        ),
        p(
          'Of the roughly 2,400 households that left the city core between 2024 and 2025, 31 percent were headed by someone aged 60 or older, almost double that group’s share of the core’s population. Households with children under 18 made up 19 percent of departures, in line with their share of residents.',
        ),
        p(
          `Grace Tanaka, a demographer at the Lakeshore Regional Planning Council, checked the estimates against utility disconnection records at ${siteName}’s request, a more reliable guide to real moves than changes of address. The two sources agreed within three percentage points.`,
        ),
        p(
          '“The families story is true in some cities,” Tanaka said. “Here, the older renter is the person who moves when a building is sold and the new owner renovates. They are leaving because the rent doubled.”',
        ),
        p(
          'The pattern matches the city’s permit records. In 2025 the city issued renovation permits for 37 apartment buildings of twenty units or more in the core, the highest number since 2008. In at least 22 of them, rents for renovated units rose by more than 30 percent, according to listings compiled by the tenants’ group Canal Ward Renters.',
        ),
        p(
          'The group says the estimates match what its volunteers see at housing court. They counted 64 households headed by someone over 60 at eviction hearings in the first half of this year, most of them facing a lease that ended after their building was sold.',
        ),
        h2('A bill waiting in committee'),
        p(
          'Two council members have sponsored an ordinance that would require landlords to offer existing tenants a renovated unit at no more than a 10 percent increase. It was introduced in March and has not been scheduled for a hearing. Council member Adaeze Nwosu, one of its sponsors, said she would ask for a hearing in October now that the estimates are public.',
        ),
      ),
    ],
  },
  {
    title: 'Council approves the Harbor Line after a decade of false starts',
    slug: 'council-approves-harbor-line',
    kicker: 'Transit',
    excerpt:
      'An 8-3 vote commits Port Calder to a 9.4-mile light rail line from Northgate to the Old Harbor. Utility work starts in April, and the first passengers are due to ride in 2030.',
    section: 'news',
    authors: ['ruth-adebayo', 'tomas-lindqvist'],
    publishedAt: '2026-09-13T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'town-hall',
      caption:
        'City Hall on the morning after the vote. The council chamber was full until a little after 11 p.m.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'The Harbor Line has been drawn, costed, cancelled and redrawn four times since 2016. On Tuesday night, a little after eleven, the Port Calder City Council voted 8-3 to build it.',
        ),
        p(
          'The decision commits the city to a 9.4-mile light rail line from the Northgate park-and-ride to the Old Harbor ferry terminal, with fourteen stops, two of them underground beneath Canal Street. The approved budget is $1.62 billion, of which $710 million is expected to come from a federal transit grant the city applied for in March and has not yet received.',
        ),
        p(
          'The first phase of construction, moving water mains and power lines along Harbor Road, is scheduled to start in April. The Harbor Transit Authority says passengers will ride the full line in the autumn of 2030, and projects 41,000 weekday trips by 2032. Opponents call that figure optimistic: the busiest bus route in the corridor, the 12, carried 9,800 riders a day last year.',
        ),
        h2('What changed this time'),
        p(
          `The 2019 version of the plan died in committee over the cost of its tunnel. The 2022 version lost its federal match when the authority missed a filing deadline by nine days. What carried this one, according to three council members who spoke to ${siteName} before the vote, is a contract structure the city has never used on a project of this size. A single consortium, Lakeshore Rail Partners, will design and build the line for a fixed price and operate it for fifteen years.`,
        ),
        p(
          '“We have spent a decade paying consultants to tell us what it would cost,” said council member Adaeze Nwosu, who represents the Flats and chairs the transportation committee. “The fixed price is the first number anyone has been willing to sign.”',
        ),
        p(
          'The three votes against came from the members who blocked the 2022 plan. Council member Leonard Pryce, whose Eastbank ward the line does not reach, argued that a fifteen-year operating contract gives a private company too much say over fares and service.',
        ),
        p(
          '“If ridership disappoints, the city pays the difference,” Pryce said. “If it succeeds, the consortium keeps the gain. I have read the summary twice and I still cannot find the clause that protects the rider.”',
        ),
        p(
          'City staff dispute that reading. The contract caps the city’s annual operating payment at $48 million, adjusted for inflation, and sets penalties for late or cancelled trains, according to a summary released by the city attorney’s office on Monday. The full agreement runs to 412 pages and has not been published. The authority says it will post it once the federal grant is confirmed.',
        ),
        h2('The businesses on the route'),
        p(
          'Along Harbor Road, where two years of utility work will close one lane in each direction, the reaction was relief mixed with arithmetic. Rosa Delgado has run Delgado Hardware at Harbor and Vine for nineteen years, and still keeps the 2016 public notice for the line folded in a drawer behind the counter.',
        ),
        p(
          '“I believe it now that there’s a date,” she said on Wednesday morning, measuring out chain for a customer. “What I want to know is where my deliveries park for two years.”',
        ),
        p(
          'The authority has promised a loading plan for every block before work begins, and a $6 million fund for businesses that can show lost revenue during construction. Merchants on Canal Street, who lived through eighteen months of sewer replacement in 2021, have asked for the fund to pay out monthly instead of at the end of the project.',
        ),
      ),
      pullQuote(
        'We have spent a decade paying consultants to tell us what it would cost. The fixed price is the first number anyone has been willing to sign.',
        'Adaeze Nwosu',
        'Chair of the council’s transportation committee',
      ),
      prose(
        h2('What happens next'),
        p(
          'The federal grant decision is expected in January. Without it, the city would have to borrow another $710 million or shorten the line, most likely by ending it at Canal Street and leaving the last three stops to a later phase. Mayor Joanna Kessler’s office said the city would not break ground on the underground section without the grant in hand.',
        ),
        p(
          'Residents can comment on the station designs at four public sessions this autumn, the first on September 24 at the Northgate branch library. The authority has also agreed to publish ridership forecasts for each individual stop, a document opponents requested in 2022 and never received.',
        ),
        p(
          'For Pryce, the vote settles whether the line will be built and opens the question of how it will be run. “I lost tonight,” he said, on his way out of the chamber. “I intend to be the most persistent person at every one of those sessions.”',
        ),
      ),
    ],
  },
]

export const MAGAZINE_COPY_EN: MagazineCopy = {
  locale: 'en',
  publicationName: DEFAULT_PUBLICATION_NAME_EN,
  sections: MAGAZINE_DEMO_SECTIONS_EN,
  authors: MAGAZINE_DEMO_AUTHORS_EN,
  articles: MAGAZINE_DEMO_ARTICLES_EN,
  mediaAlts: {
    'town-hall':
      'The columned stone front of a town hall with a clock and tall arched windows, seen from the foot of its steps',
    gallery:
      'A gallery hall with paintings in gilt frames hung along a pale wall above a parquet floor',
    theatre:
      'A red velvet stage curtain framed by gilded balconies, seen from the circle of a small theater',
    'archive-stacks':
      'A long aisle between green metal shelves stacked with tied cardboard document boxes',
    allotments:
      'Rows of onions, potato plants and staked tomatoes on a community garden plot, with small wooden sheds beyond',
    'reception-hall':
      'A large empty reception hall with a carved wooden ceiling, chandeliers and portraits above wood paneling',
    'tram-stop':
      'A tram arriving at a stop between two stone buildings, with a blue tram-lane sign in the foreground',
    'empty-tram-stop':
      'A deserted tram stop and tracks along a river road lined with bare plane trees under a cloudy sky',
    'reading-room':
      'A round library reading room under a glass dome, with long wooden tables and a few readers',
    baguettes: 'A basket of golden baguettes standing upright against a deep red wall',
    'office-block-dusk':
      'A dark office building at dusk with a column of lit windows against a blue sky',
    'dining-room':
      'A restaurant dining room with set oak tables, grey upholstered chairs and wood paneling',
  },
  leadCredit: (author, licence) => `Photograph: ${author} (${licence})`,
  pages: {
    home: {
      title: 'Front page',
      opinionRail: 'Opinion',
      cultureRail: 'Culture',
      mostRead: 'Most read',
      businessRail: 'Business',
      ctaTitle: 'Journalism for Port Calder, paid for by its readers',
      ctaText: (siteName) =>
        `${siteName} keeps its coverage of city hall free for everyone to read. Subscriptions start at $8 a month and pay for sixteen journalists.`,
      ctaSubscribe: 'Subscribe',
      ctaStandards: 'Read our standards',
    },
    about: {
      title: 'About',
      slug: 'about',
      body: (siteName) => [
        p(
          `${siteName} is an independent news and culture magazine for Port Calder. It publishes online every weekday and in print every Thursday, and it has covered the city since its first issue went to press in the back room of a print shop on Mill Street in 2011.`,
        ),
        p(
          'It is owned by the Harbor Press Cooperative, whose members are its subscribers and its staff. No owner outside the city can buy it, and no advertiser sits on its board.',
        ),
        h2('What we cover'),
        p(
          'News reports on city hall, schools, transit, housing and the courts. Business follows the companies, workers and property decisions that shape the local economy. Culture reviews the city’s art, theater, music and restaurants. Opinion publishes columnists and readers who live here and argue in good faith.',
        ),
        h2('How we are paid for'),
        p(
          'Subscriptions provide 94 percent of our revenue. The rest comes from a small number of local advertisers, whose advertisements are labeled and never placed beside coverage of their own businesses. Our reporting on city government is free to read for everyone.',
        ),
        h2('When we get it wrong'),
        p(
          'We correct the article, add a dated note at its foot and say what changed. Our full policy on corrections, sources and conflicts of interest is published on our standards page.',
        ),
      ],
      figuresTitle: 'The newsroom in figures',
      figures: [
        { value: '2011', label: 'First printed issue' },
        { value: '16', label: 'Reporters, editors and photographers' },
        { value: '31,200', label: 'Paying subscribers' },
        { value: '94', unit: '%', label: 'Of revenue from readers' },
      ],
      sectionsTitle: 'Four sections',
      quote: {
        text: 'We print the council agenda on the Thursday before every meeting, because that is when a reader can still change what happens at it.',
        author: 'Graham Oyelaran',
        role: 'Editor since 2019',
      },
    },
    subscribe: {
      title: 'Subscribe',
      slug: 'subscribe',
      body: (siteName) => [
        p(
          `A subscription pays for ${siteName}’s reporting. It funds sixteen journalists, a weekly print edition and an archive that goes back to 2011, and it keeps our coverage of city hall free for everyone.`,
        ),
        p(
          'Every subscription includes unlimited access to the website and the archive, the morning newsletter, and an invitation to the quarterly editors’ meeting, where subscribers question the newsroom about its coverage.',
        ),
      ],
      plansTitle: 'Choose a subscription',
      plans: [
        {
          key: 'digital',
          name: 'Digital',
          price: '$8',
          interval: 'a month',
          features: [
            'Every article and the full archive',
            'The morning newsletter',
            'Cancel online at any time',
          ],
          actionLabel: 'Choose Digital',
          href: '/subscribe#digital',
        },
        {
          key: 'print',
          name: 'Print and digital',
          price: '$19',
          interval: 'a month',
          features: [
            'The Thursday print edition, delivered',
            'Everything in Digital',
            'Five articles a month to share with anyone',
          ],
          actionLabel: 'Choose Print and digital',
          href: '/subscribe#print',
          highlighted: true,
        },
        {
          key: 'student',
          name: 'Student',
          price: '$3',
          interval: 'a month',
          features: [
            'Everything in Digital',
            'A student email address or card is enough',
            'Renews each academic year',
          ],
          actionLabel: 'Choose Student',
          href: '/subscribe#student',
        },
        {
          key: 'supporter',
          name: 'Supporter',
          price: '$150',
          interval: 'a year',
          features: [
            'Everything in Print and digital',
            'A vote at the cooperative’s annual meeting',
            'Your name in the annual report, if you wish',
          ],
          actionLabel: 'Become a supporter',
          href: '/subscribe#supporter',
        },
      ],
      letter: {
        text: 'I cancelled two national subscriptions to keep this one. It was the only paper that told me the library near my house might close, three months before anyone asked my opinion.',
        name: 'Denise Alvarado',
        role: 'Subscriber in Northgate since 2019',
      },
      faqTitle: 'Questions about subscriptions',
      faq: [
        {
          key: 'cancel',
          question: 'Can I cancel online?',
          answer:
            'Yes. Choose Cancel subscription on your account page. You keep access until the end of the period you have paid for.',
        },
        {
          key: 'delivery',
          question: 'Where is the print edition delivered?',
          answer:
            'Anywhere in Port Calder and the neighboring towns of Alder Falls and Wenham, on Thursday morning. Outside that area it is mailed and usually arrives on Saturday.',
        },
        {
          key: 'gift',
          question: 'Can I give a subscription as a gift?',
          answer:
            'Yes, for three, six or twelve months. You choose the start date, and we post a card to the person receiving it.',
        },
        {
          key: 'low-income',
          question: 'Is there a reduced rate for people on a low income?',
          answer:
            'Yes. Anyone receiving public assistance can subscribe to Digital for $1 a month. Write to the circulation desk and we will set it up without asking for documents.',
        },
      ],
      newsletterTitle: 'Start with the morning newsletter',
      newsletterText:
        'Every weekday at 6 a.m., the day’s city news in five minutes. It is free, and it is how most of our subscribers first found us.',
      newsletterAction: 'Get the newsletter',
    },
    standards: {
      title: 'Standards and corrections',
      slug: 'standards',
      body: (siteName) => [
        p(
          `These are the standards ${siteName}’s journalists work to. We publish them so that readers can hold us to them.`,
        ),
        h2('Accuracy and corrections'),
        p(
          'We correct errors of fact as soon as we confirm them. A correction is added to the foot of the article, dated, and says what was wrong. We never quietly edit a published article to remove a mistake.',
        ),
        h2('Sources'),
        p(
          'We name our sources whenever we can. We grant anonymity only when a source faces a real risk of harm or of losing their job, when the information matters, and when we cannot get it on the record. An editor must know the identity of every anonymous source.',
        ),
        h2('Independence'),
        p(
          'Our journalists accept no gifts, free travel or paid speaking engagements from the people and organizations they cover. Restaurant and theater critics pay for their meals and tickets, and the magazine reimburses them.',
        ),
        h2('Photographs'),
        p(
          'We never alter the content of a news photograph. Photographs are cropped and adjusted for exposure and color, and nothing more.',
        ),
      ],
      contactTitle: 'Reaching the standards desk',
      contact: [
        {
          key: 'error',
          question: 'Report an error',
          answer:
            'Write to the standards desk at 212 Harbor Road, Port Calder. Tell us which article, what is wrong and, if you can, how you know.',
        },
        {
          key: 'complaint',
          question: 'Complain about our coverage',
          answer:
            'Complaints go to the standards editor, Ama Boateng, who replies to every one within ten working days. If her answer does not satisfy you, the cooperative’s board will review it.',
        },
        {
          key: 'removal',
          question: 'Ask us to update an old article',
          answer:
            'We rarely remove published journalism. We will consider updating or anonymizing an article about a minor offense more than seven years old. Write to the standards editor with the details.',
        },
      ],
    },
    credits: {
      title: 'Photo credits',
      slug: 'photo-credits',
      intro:
        'Every photograph on this site is a real one, used under the licence its photographer chose. The city and its stories are invented, so each picture shows a place of the same kind rather than the place named. Cropped and resized; nothing else changed.',
      sourceWord: 'Source',
      licenceName: (licence) => licence,
    },
  },
  menu: {
    about: 'About',
    subscribe: 'Subscribe',
    standards: 'Standards and corrections',
    credits: 'Photo credits',
  },
  widgets: {
    searchTitle: 'Search the archive',
    searchPlaceholder: 'Stories, people, places',
    latestTitle: 'Latest',
    sectionsTitle: 'Sections',
    ctaHeading: 'Local reporting, paid for by readers',
    ctaBody: 'No paywall and no billionaire owner. Members keep the newsroom open for everyone.',
    ctaLabel: 'Become a member',
    relatedTitle: 'More stories',
  },
  tagline: 'Independent news and culture from Port Calder.',
  footerNote:
    'Published by the Harbor Press Cooperative, 212 Harbor Road, Port Calder. Letters to the editor and corrections go to the standards desk at the same address.',
}
