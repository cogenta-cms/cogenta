import type { PortfolioCopy } from './portfolio-copy.js'

/** The `portfolio` blueprint in English. See `portfolio-copy.ts` for the shape. */
export const PORTFOLIO_COPY_EN: PortfolioCopy = {
  locale: 'en',
  schema: {
    routes: { project: '/work/:slug' },
    labels: { singular: 'Project', plural: 'Projects' },
    taxonomies: {
      client: { name: 'client', singular: 'Client', plural: 'Clients' },
      disciplines: { name: 'disciplines', singular: 'Discipline', plural: 'Disciplines' },
      team: { name: 'team', singular: 'Team member', plural: 'Team' },
    },
    fields: {
      statement: 'Statement',
      statementHelp: 'One or two sentences under the title of the project page.',
      client: 'Client',
      clientHelp: 'Set under the cover in lists of work.',
      discipline: 'Discipline',
      clientArchive: 'Client page',
      clientArchiveHelp:
        'Files the project under its client, which gives the client a page listing all its work with the studio.',
    },
  },
  pageSlugs: {
    home: 'home',
    work: 'work',
    studio: 'studio',
    contact: 'contact',
    privacy: 'privacy',
    credits: 'photo-credits',
  },
  disciplines: [
    {
      slug: 'landscape',
      name: 'Landscape',
      description:
        'Coasts, valleys, forests and ice, photographed in the hour that suits them and printed at the size they deserve.',
    },
    {
      slug: 'nature',
      name: 'Nature and wildlife',
      description:
        'Birds, plants and habitats for reserves and parks, made from hides and fixed viewpoints over a full year.',
    },
    {
      slug: 'land-and-produce',
      name: 'Land and produce',
      description:
        'Vineyards, orchards and fields for the people who work them: the plot, the season and the thing that grows.',
    },
    {
      slug: 'ports-and-industry',
      name: 'Ports and industry',
      description:
        'Quays, boats and workshops before the day starts, with the permits and the safety briefings that come with them.',
    },
    {
      slug: 'heritage',
      name: 'Heritage',
      description:
        'Photographic inventories of towers, bridges and farms, made to the standard a restoration file asks for.',
    },
    {
      slug: 'expeditions',
      name: 'Science and expeditions',
      description:
        'Repeat photography with research teams: the same place, the same lens, the same hour, year after year.',
    },
  ],
  team: [
    {
      slug: 'mara-lindgren',
      name: 'Mara Lindgren',
      role: 'Founding partner, landscape and expeditions',
    },
    { slug: 'joel-okafor', name: 'Joel Okafor', role: 'Partner, ports and industry' },
    { slug: 'ines-carvalho', name: 'Ines Carvalho', role: 'Partner, editing and production' },
    { slug: 'tom-reyes', name: 'Tom Reyes', role: 'Printer and digital technician' },
    { slug: 'priya-nair', name: 'Priya Nair', role: 'Photographer, nature' },
    { slug: 'sam-whitford', name: 'Sam Whitford', role: 'Producer and archivist' },
    { slug: 'ada-brennan', name: 'Ada Brennan', role: 'Photographer, heritage' },
  ],
  projects: [
    {
      slug: 'a-year-on-the-lagoon',
      title: 'A year on the lagoon',
      client: { name: 'Vissan Lagoon Trust', slug: 'vissan-lagoon-trust' },
      discipline: 'Landscape',
      disciplines: ['landscape', 'nature'],
      team: ['mara-lindgren', 'priya-nair', 'tom-reyes'],
      publishedAt: '2021-06-14T09:00:00.000Z',
      summary:
        'Twelve fixed viewpoints on a coastal lagoon, photographed every month for a year: the record a conservation trust needed, and the exhibition that came out of it.',
      cover: 'lagoon-cover',
      body: () => [
        { h2: 'The brief' },
        {
          p: 'The Vissan Lagoon Trust looks after 1,800 hectares of shallow water, reed beds and old salt pans on the Mediterranean coast. Its wardens know the lagoon season by season. Its funders, and most of its 3,000 members, had only ever seen it in summer, in postcards that show a blue sheet of water and a line of hills.',
        },
        {
          p: 'The trust asked for two things from one commission: a reference record that its scientists could return to in ten years, and an exhibition for the visitor centre that would explain why a lagoon that looks empty in January is anything but.',
        },
        { h2: 'Twelve places, twelve months' },
        {
          p: 'With the wardens we chose twelve viewpoints, from the old salt-works building to the end of the dyke path, and marked each one with a stake and a bearing. Mara Lindgren returned to every one of them on the same morning of each month, before dawn, with the same lens. Tom Reyes made the prints for the exhibition in the studio, so that the grey of a January sky was never corrected into the blue of a June one.',
        },
        {
          p: 'The birds were a different job. Priya Nair spent six weeks in a hide at the water’s edge, learning when the egrets arrive and where they stand, and made the portraits of the year from there.',
        },
        {
          p: 'The prints for the exhibition were made at 1.2 metres wide on cotton paper, and hung without frames in a single row along the north wall of the visitor centre, so that a visitor walks through the year from January to December. Each viewpoint carries a small label with its date, its hour and the water level on that morning, taken from the wardens’ own gauge, which is the information a scientist will want in ten years.',
        },
        {
          figure: 'lagoon-shore',
          caption: 'Viewpoint 7, the dyke path, in the second week of April.',
          align: 'wide',
        },
        {
          gallery: ['lagoon-egret', 'lagoon-storm'],
          layout: 'grid',
        },
        { h2: 'Result' },
        {
          p: 'The exhibition opened in the visitor centre in June 2021 with forty prints and the twelve viewpoints shown as a grid, month by month. Attendance at the centre rose by a third that summer, and the trust now sends a warden to every viewpoint on its date to make the same frame, which is the record we wanted it to keep.',
        },
      ],
    },
    {
      slug: 'harvest-row-by-row',
      title: 'Harvest, row by row',
      client: {
        name: 'Hautes Garrigues Growers’ Cooperative',
        slug: 'hautes-garrigues-cooperative',
      },
      discipline: 'Land and produce',
      disciplines: ['land-and-produce', 'landscape'],
      team: ['mara-lindgren', 'ines-carvalho', 'sam-whitford'],
      publishedAt: '2022-11-07T09:00:00.000Z',
      summary:
        'Three seasons among the vines of a cooperative of 140 growers: the plot, the light and the work, photographed for a catalogue and for the labels of its single-estate wines.',
      cover: 'vines-cover',
      body: () => [
        { h2: 'The brief' },
        {
          p: 'The Hautes Garrigues cooperative gathers 140 growers on the slopes under a limestone peak, each with a few hectares and a view of the same hill. Its wines were good and its pictures were not: a stock image of a sunset over unnamed vines was doing duty on every bottle, and the growers said so first.',
        },
        {
          p: 'The cooperative wanted photographs of its own land for a new catalogue, for the shelf-talkers in its shop and for a range of single-estate wines whose labels would carry the place they come from.',
        },
        { h2: 'The plot, not the grower' },
        {
          p: 'We decided early to photograph plots and not faces. A portrait of a grower is a portrait of one grower, and the cooperative has 140. Each plot was walked with its owner, who showed us what mattered: the hut where the tools are kept, the plane trees that give shade at noon, the row where the first grapes ripen.',
        },
        {
          p: 'Mara Lindgren worked at the edges of the day, in the hour after sunrise and the hour before dusk, when the colour of the leaves does most of the work. Ines Carvalho edited a first selection of 600 frames down to 36 with a group of growers sitting around a table in the cooperative’s tasting room, and the growers chose the pictures of their own plots first.',
        },
        {
          p: 'The edit was the slow part of the work. Over three seasons Sam Whitford kept a map on the studio wall with a pin for each plot and a colour for each stage, so that nobody was ever photographed at the wrong moment for their vines: bare wood in February, flowering in May, the green harvest in July, the picking in September. A plot that was not ready was moved to the following week, and the cooperative’s calendar bent around the weather rather than the other way round.',
        },
        {
          figure: 'vines-tree',
          caption: 'The hut among the plane trees, a plot above the village, in winter.',
          align: 'wide',
        },
        {
          gallery: ['vines-shed', 'vines-grapes'],
          layout: 'grid',
        },
        { h2: 'Result' },
        {
          p: 'The catalogue was printed in an edition of 4,000, and nine single-estate wines now carry a photograph of their own plot on the label. The cooperative has asked us back each autumn to photograph the plots that joined that year.',
        },
      ],
    },
    {
      slug: 'harbour-before-daylight',
      title: 'The harbour before daylight',
      client: { name: 'Port-Bellon Harbour Authority', slug: 'port-bellon-harbour-authority' },
      discipline: 'Ports and industry',
      disciplines: ['ports-and-industry', 'landscape'],
      team: ['joel-okafor', 'sam-whitford', 'tom-reyes'],
      publishedAt: '2023-04-03T09:00:00.000Z',
      summary:
        'A fishing harbour photographed in the hours before it works, for the opening of its rebuilt quay: a book, twenty-four large prints for the new harbour office and a set for the press.',
      cover: 'port-cover',
      body: () => [
        { h2: 'The brief' },
        {
          p: 'Port-Bellon is a working harbour with a fishing fleet of forty boats, a ferry berth and a marina that fills every July. In 2022 the authority rebuilt its main quay after three years of works. For the opening it wanted photographs that would show the place to the town, which had watched the cranes go up and not much else.',
        },
        {
          p: 'It also had a practical need. The old pictures of the port were a decade out of date and showed a quay that no longer existed.',
        },
        { h2: 'Before the day starts' },
        {
          p: 'Joel Okafor suggested photographing the harbour only between four and seven in the morning. At that hour the trawlers are back, the nets are on the quay, the sky is the colour of the water, and the port has the order of a place that has just finished work. It is also the one moment when the quay is empty enough to be seen whole.',
        },
        {
          p: 'Working in a port takes more preparation than photography. Sam Whitford obtained the permits, agreed each access with the harbour master and gave every skipper a print of his own boat in the first week, which is why we were let on to the quay at all.',
        },
        {
          p: 'Light was the other constraint. Between four and seven o’clock the sky changes every few minutes, and the same view can be made well only once. Joel Okafor worked with two lenses and a tripod, never with flash, and went back to a single quay six times to get it right in different weather: a clear dawn for the trawlers, low cloud for the dockside cranes, a still night for the reflections in the basin. The harbour master’s only request was that nothing in the picture should look staged.',
        },
        {
          figure: 'port-quay',
          caption:
            'The new quay at night, with the ferry berth and the lighthouse on the far side.',
          align: 'wide',
        },
        {
          gallery: ['port-dusk', 'port-marina'],
          layout: 'grid',
        },
        { h2: 'Result' },
        {
          p: 'The book of sixty-four pages was given to every household in the town, and the twenty-four large prints hang in the harbour office, where visitors wait for their berth. Two skippers have since asked us to photograph their boats for sale.',
        },
      ],
    },
    {
      slug: 'forest-under-snow',
      title: 'The forest under snow',
      client: { name: 'Haute-Roche Forestry Office', slug: 'haute-roche-forestry-office' },
      discipline: 'Landscape',
      disciplines: ['landscape', 'nature'],
      team: ['priya-nair', 'mara-lindgren'],
      publishedAt: '2023-12-11T09:00:00.000Z',
      summary:
        'A winter set for the trail map and the visitor information of a state forest: four walks photographed in snow and in late autumn, the months the paths are least visited.',
      cover: 'forest-cover',
      body: () => [
        { h2: 'The brief' },
        {
          p: 'The Haute-Roche forest covers 9,000 hectares of beech, birch and spruce, crossed by 140 kilometres of marked paths. In summer it has more walkers than the office can count. From November to March it has almost none, and the office wanted to change that with a trail map for the quiet months.',
        },
        {
          p: 'It needed pictures of four walks that would make a person with a free Sunday in December put on boots. The map and the signs at the trailheads would carry them.',
        },
        { h2: 'In the cold' },
        {
          p: 'Priya Nair walked the four routes in November and again after each snowfall until February, usually at first light, in temperatures that dropped to minus eight. The pictures ask little of the viewer: a track, a light wood, a bent branch. Snow removes everything but line and tone, and the work was to find the places where those lines are worth following.',
        },
        {
          p: 'The cold shaped the method. A battery loses half its charge at minus eight, so Priya carried three, kept two inside her jacket and changed them on the hour, and worked in thin gloves under mittens that she took off for each frame. She photographed in the first hour after a snowfall, when the snow still holds every twig, and stopped when the wind rose and began to shake the branches clear.',
        },
        {
          figure: 'forest-birch',
          caption: 'The birch wood on the second walk, after the first snow of the year.',
          align: 'wide',
        },
        {
          gallery: ['forest-branches', 'forest-beech'],
          layout: 'grid',
        },
        {
          p: 'The beech path was made in the last week of November, with no snow yet and the leaves still on the ground. It is the only picture in the set without snow, and the office liked that it showed a walker what the first weekend of winter really looks like.',
        },
        { h2: 'Result' },
        {
          p: 'The map was printed in an edition of 20,000 and the four photographs hang as signs at the trailheads. Winter visits to the four routes were counted by the office’s trail sensors and rose by 38 percent over the previous season.',
        },
      ],
    },
    {
      slug: 'ice-three-summers',
      title: 'Ice, three summers',
      client: { name: 'Valmeyer Glaciology Institute', slug: 'valmeyer-glaciology-institute' },
      discipline: 'Science and expeditions',
      disciplines: ['expeditions', 'landscape'],
      team: ['mara-lindgren', 'sam-whitford', 'tom-reyes'],
      publishedAt: '2024-09-23T09:00:00.000Z',
      summary:
        'Repeat photography of an outlet glacier over three summers with a research team: the same eleven positions, the same lens and the same hour, and a book that shows how far the ice has moved.',
      cover: 'glacier-cover',
      body: () => [
        { h2: 'The brief' },
        {
          p: 'The Valmeyer Glaciology Institute has measured one outlet glacier since 1998 with stakes, radar and satellites. What it did not have was a photographic record good enough for a person who has never read a mass-balance table. The institute asked us to make one, over three summers, in the weeks when its field team is on the ice.',
        },
        { h2: 'The same place, the same hour' },
        {
          p: 'Repeat photography only works if the second picture is made exactly where the first was. On the first expedition Mara Lindgren and the field team built eleven small cairns on the moraine, each one fitted with a steel plate and a compass bearing. She returned to the cairns in each of the next two summers with the same camera, the same lens and a printed copy of the previous year’s frame, held up to the viewfinder until the edges lined up.',
        },
        {
          p: 'Sam Whitford handled the part the pictures do not show: freight for a month on the ice, insurance for the equipment, a medical plan and the logistics of getting 140 kilograms of cases to a camp that can be reached on foot only.',
        },
        {
          p: 'Weather decided the calendar. On the ice the light stays flat for days and then clears for an hour, and a repeat frame has to be made in the same kind of light as the first, or the comparison means nothing. The team waited, sometimes for a week, in a hut at the edge of the moraine, and made all eleven frames of the third summer in four mornings, with the cloud base at the same height as it had been two years before.',
        },
        {
          figure: 'glacier-tongue',
          caption: 'Position 4, looking down the tongue at the end of the first summer.',
          align: 'wide',
        },
        {
          gallery: ['glacier-melt', 'glacier-cave'],
          layout: 'grid',
        },
        { h2: 'Result' },
        {
          p: 'The book pairs each position with its three years, laid out so that the reader can turn the page and watch the ice retreat. The institute uses it in its lectures, and three university museums have shown the eleven triptychs. The cairns are still there, and the field team now makes the fourth frame itself.',
        },
      ],
    },
    {
      slug: 'the-long-cliff-path',
      title: 'The long cliff path',
      client: { name: 'Presqu’île Regional Nature Park', slug: 'presquile-regional-nature-park' },
      discipline: 'Landscape',
      disciplines: ['landscape', 'nature'],
      team: ['priya-nair', 'ada-brennan'],
      publishedAt: '2025-03-10T09:00:00.000Z',
      summary:
        'The photographs for a new long-distance path along the cliffs of a regional park: eight days on foot, one picture a kilometre, and a guide that a walker can read in the evening.',
      cover: 'coast-cover',
      body: () => [
        { h2: 'The brief' },
        {
          p: 'The Presqu’île park opened a path in 2025 that follows its coastline for 112 kilometres, from a fishing village to the tip of the peninsula, with cliffs on one side and bays on the other. The park’s team had signed it and surveyed it. It had no pictures, and a path that nobody has seen does not get walked.',
        },
        {
          p: 'The commission was a guide for walkers and a set of photographs for the park’s website, to be made in a single walk, so that the pictures would follow the path the way a walker would.',
        },
        { h2: 'A picture a kilometre' },
        {
          p: 'Priya Nair and Ada Brennan walked it in eight days at the end of the summer, each day ending at a campsite the park had chosen. The rule was one picture per kilometre, made when they reached the marker and not before, so that the set would not become a list of the best views. Some kilometres are plain. A guide that shows only the cliffs would not prepare anyone for the long stretches of dry grass between them.',
        },
        {
          p: 'The pictures were made with one lens only, a 35 millimetre, and with the same discipline throughout: arrive at the marker, put the camera to the eye and take the picture that is there. In the evenings the two photographers read each other’s frames of the day on a small screen and agreed nothing in advance. What they shared was the order, the hour and the distance, and the layout of the guide, designed by Ines Carvalho, follows that order page by page.',
        },
        {
          figure: 'coast-ridge',
          caption: 'The ridge above the third bay, kilometre 31.',
          align: 'wide',
        },
        {
          gallery: ['coast-water', 'coast-boats'],
          layout: 'grid',
        },
        { h2: 'Result' },
        {
          p: 'The guide runs to 96 pages and fits in a coat pocket. The park’s website shows the path as a strip of 112 photographs, and in its first season 2,400 people walked the whole route, twice as many as the park had planned for.',
        },
      ],
    },
    {
      slug: 'watchtowers',
      title: 'The watchtowers of the high valley',
      client: {
        name: 'High Valleys Heritage Foundation',
        slug: 'high-valleys-heritage-foundation',
      },
      discipline: 'Heritage',
      disciplines: ['heritage', 'landscape'],
      team: ['ada-brennan', 'ines-carvalho', 'sam-whitford'],
      publishedAt: '2025-09-29T09:00:00.000Z',
      summary:
        'A photographic inventory of sixty-four stone watchtowers in a high valley, made to the standard of a restoration file and published as a book that people read for pleasure.',
      cover: 'towers-cover',
      body: () => [
        { h2: 'The brief' },
        {
          p: 'In the high valley there are sixty-four stone towers, built over six centuries to watch the road and to warn the next village. Some stand whole, with their pitched stone roofs. Others are a single wall. The High Valleys Heritage Foundation wanted to find every one, record its condition and apply for restoration funds, and its application needed photographs that an assessor in a distant office could trust.',
        },
        {
          p: 'It also hoped that the same pictures could make the towers known to people who will never read a condition report.',
        },
        { h2: 'The standard, and then the picture' },
        {
          p: 'Every tower was photographed twice. First came the record: four views from the cardinal points at a fixed distance, a scale rod at the base and a detail of each opening, all made in flat light so that cracks and repointing could be read. Then came the picture, made in the evening, when the same stone turns gold and the tower stands out from the hillside.',
        },
        {
          p: 'Ada Brennan walked the valley in eleven days in June, with a local guide, and Ines Carvalho edited the two sets into one book in which each double page is a tower, the record on the left and the picture on the right.',
        },
        {
          p: 'The valley asked as much of the people as of the camera. Some towers can be reached only on foot, two hours from the last track, and the guide, a retired shepherd who knows the families that own them, opened gates that no letter from the foundation would have opened. Several owners asked to see the pictures before they were filed, and three corrected a date or a name that the foundation’s own records had wrong.',
        },
        {
          figure: 'towers-single',
          caption: 'Tower 17, on the upper pasture, seen from the footpath.',
          align: 'wide',
        },
        {
          gallery: ['towers-green', 'towers-valley'],
          layout: 'grid',
        },
        { h2: 'Result' },
        {
          p: 'The foundation filed its application with the record sets in October 2025 and has since received funds for the first nine towers. The book, printed in an edition of 2,500, has been reprinted once, and the valley’s guesthouses now give a copy to every guest.',
        },
        {
          quote:
            'An assessor told us it was the first file in which he did not have to guess what a wall looked like on the other side.',
          author: 'Lucien Marchetti',
          role: 'Director, High Valleys Heritage Foundation',
        },
      ],
    },
  ],
  media: [
    {
      name: 'lagoon-cover',
      file: 'lagoon-cover.jpg',
      alt: 'The long low building of an old salt works reflected in the still water of a lagoon, with tufts of marsh plants in the foreground',
    },
    {
      name: 'lagoon-shore',
      file: 'lagoon-shore.jpg',
      alt: 'A dyke path of golden grass beside a shallow lagoon, with a stone breakwater and a distant shoreline at sunrise',
    },
    {
      name: 'lagoon-egret',
      file: 'lagoon-egret.jpg',
      alt: 'A little egret standing on dark rocks at the edge of the water',
    },
    {
      name: 'lagoon-storm',
      file: 'lagoon-storm.jpg',
      alt: 'Sunrise under dark clouds over a calm lagoon, with ripples of weed on the sand in the foreground',
    },
    {
      name: 'vines-cover',
      file: 'vines-cover.jpg',
      alt: 'Rows of vines turning yellow in autumn below a rocky hill with a pointed summit',
    },
    {
      name: 'vines-tree',
      file: 'vines-tree.jpg',
      alt: 'Two bare plane trees and a small stone hut standing in a winter vineyard of pruned vines',
    },
    {
      name: 'vines-shed',
      file: 'vines-shed.jpg',
      alt: 'An old stone mill tower and a farm building beyond rows of vines in autumn colours, under a stormy sky',
    },
    {
      name: 'vines-grapes',
      file: 'vines-grapes.jpg',
      alt: 'Two bunches of dark blue grapes hanging from a vine among green leaves',
    },
    {
      name: 'port-cover',
      file: 'port-cover.jpg',
      alt: 'Two fishing trawlers moored in a harbour at sunset, with a forest of yacht masts behind them',
    },
    {
      name: 'port-quay',
      file: 'port-quay.jpg',
      alt: 'A cobbled quay at night with red drums and a lamp, and the lights of a ferry and a lighthouse across the water',
    },
    {
      name: 'port-dusk',
      file: 'port-dusk.jpg',
      alt: 'A harbour basin at dusk under heavy clouds, with cranes, tugs and a lit ship reflected in the water',
    },
    {
      name: 'port-marina',
      file: 'port-marina.jpg',
      alt: 'Yacht masts and pastel façades along a marina at blue hour, with a palm tree',
    },
    {
      name: 'forest-cover',
      file: 'forest-cover.jpg',
      alt: 'A snow-covered track curving through a wood of snow-laden trees',
    },
    {
      name: 'forest-birch',
      file: 'forest-birch.jpg',
      alt: 'Birch trunks in a light wood, with patches of snow on the ground',
    },
    {
      name: 'forest-branches',
      file: 'forest-branches.jpg',
      alt: 'A bent branch weighed down by fresh snow',
    },
    {
      name: 'forest-beech',
      file: 'forest-beech.jpg',
      alt: 'A path covered in russet beech leaves between tall bare beeches in low sun',
    },
    {
      name: 'glacier-cover',
      file: 'glacier-cover.jpg',
      alt: 'Blocks of blue-white ice floating on a grey glacial lake, with the front of the glacier and dark mountains beyond',
    },
    {
      name: 'glacier-tongue',
      file: 'glacier-tongue.jpg',
      alt: 'The grey ice of a glacier tongue leading towards dark cliffs under heavy cloud',
    },
    {
      name: 'glacier-melt',
      file: 'glacier-melt.jpg',
      alt: 'A meltwater stream cutting a blue channel across dirty glacier ice',
    },
    {
      name: 'glacier-cave',
      file: 'glacier-cave.jpg',
      alt: 'The opening of an ice cave at the edge of a glacier, among dark ridges of rubble',
    },
    {
      name: 'coast-cover',
      file: 'coast-cover.jpg',
      alt: 'Golden headlands lit by the low sun above a dark, calm sea, with a rough path in the foreground',
    },
    {
      name: 'coast-ridge',
      file: 'coast-ridge.jpg',
      alt: 'A dry grass ridge with a few pines above a long coastline fading into haze',
    },
    {
      name: 'coast-water',
      file: 'coast-water.jpg',
      alt: 'Pale limestone rocks above water of an intense turquoise',
    },
    {
      name: 'coast-boats',
      file: 'coast-boats.jpg',
      alt: 'A tall orange rock headland above a small bay full of anchored boats, under a deep blue sky',
    },
    {
      name: 'towers-cover',
      file: 'towers-cover.jpg',
      alt: 'Tall square stone towers with pitched stone roofs standing in a mountain valley at dusk',
    },
    {
      name: 'towers-single',
      file: 'towers-single.jpg',
      alt: 'A single narrow stone tower on a green hillside, with mountains and a valley road behind it',
    },
    {
      name: 'towers-green',
      file: 'towers-green.jpg',
      alt: 'A slender ruined stone tower against a cloudy sky on green mountain pasture',
    },
    {
      name: 'towers-valley',
      file: 'towers-valley.jpg',
      alt: 'A broad green mountain valley with a road, scattered farms and a village, seen from above',
    },
  ],
  pages: (studio, mail) => ({
    titles: {
      home: 'Home',
      work: 'Work',
      studio: 'Studio',
      contact: 'Contact',
      privacy: 'Privacy',
      credits: 'Photo credits',
    },
    home: {
      heroTitle: `${studio} photographs landscapes, harbours and the places where people work.`,
      heroSubtitle:
        'An independent photography studio of nine people in Clerkenwell, London, working since 2012 for nature reserves, regional parks, growers, ports and heritage bodies.',
      heroAction: 'All work',
      workTitle: 'Selected work',
      disciplinesTitle: 'Disciplines',
      figuresTitle: 'Since 2012',
      figures: [
        { value: '9', label: 'people in the studio' },
        { value: '143', label: 'commissions completed' },
        { value: '26', label: 'clients who came back for a second commission' },
        { value: '1,900', label: 'large prints made and hung' },
      ],
      quote: {
        text: 'They walked the path before they took a single picture, and the guide reads as if they had walked it with every visitor.',
        author: 'Elena Duval',
        role: 'Head of visitor services, Presqu’île Regional Nature Park',
      },
      clientsTitle: 'Clients',
      clients: [
        'Haute-Roche Forestry Office',
        'Hautes Garrigues Growers’ Cooperative',
        'High Valleys Heritage Foundation',
        'Marenne Marine Museum',
        'Port-Bellon Harbour Authority',
        'Presqu’île Regional Nature Park',
        'Saint-Aubin Fishermen’s Association',
        'Valmeyer Glaciology Institute',
        'Vissan Lagoon Trust',
      ],
      indexTitle: 'Index',
      ctaTitle: 'New work',
      ctaText: `Tell us what you want to show, where and by when. Mara Lindgren replies to every enquiry within two working days.`,
    },
    work: { disciplinesTitle: 'By discipline' },
    studio: {
      about: [
        { h2: 'About' },
        {
          p: `${studio} is a photography studio of nine people in Clerkenwell, London. Mara Lindgren founded it in 2012, after ten years of making pictures for other studios and agencies, and it has been run by three partners since 2018.`,
        },
        {
          p: 'We work for institutions that look after a place: nature reserves, regional parks, ports, growers’ cooperatives and heritage foundations. Most commissions are a body of work that has to be made over a season or a year, and many end as a book, an exhibition and a set of pictures for the client’s own use.',
        },
        {
          p: 'The studio stays small on purpose. The photographer who visits a client stays with the commission until it is delivered, and everyone here edits, prints and writes the captions for their own pictures.',
        },
      ],
      how: [
        { h2: 'How we work' },
        {
          p: 'A commission starts with a visit. Before taking a picture we walk the place with the people who know it, a warden, a grower or a harbour master, and we ask them what visitors never see. Most of our best viewpoints were chosen by someone who works there.',
        },
        {
          p: 'We shoot slowly and we edit hard. A commission of three hundred pictures is cut to thirty with the client in the room, and the ones we cut are kept in the archive, labelled, for whoever needs them in ten years.',
        },
        {
          p: 'Then we hand over the work properly: calibrated prints, files at three sizes with their captions embedded, a rights note written in plain language and a list of exactly where and when each frame was made.',
        },
      ],
      principlesTitle: 'Principles',
      principles: [
        {
          title: 'Walk it first',
          text: 'We visit every place before we photograph it, with the people who work there. The picture comes second.',
        },
        {
          title: 'Return to the same place',
          text: 'One viewpoint photographed twelve times says more than twelve viewpoints photographed once.',
        },
        {
          title: 'Print the real thing',
          text: 'Prints are made in our own studio on cotton paper, and checked against the file under a daylight lamp. A screen flatters everything.',
        },
        {
          title: 'Caption everything',
          text: 'Every frame leaves the studio with its place, its date and its hour, so that it is still useful when we are no longer around to explain it.',
        },
      ],
      numbersTitle: 'The studio in numbers',
      numbers: [
        { value: '2012', label: 'Founded' },
        { value: '9', label: 'People' },
        { value: '3', label: 'Partners' },
        { value: '143', label: 'Commissions completed' },
        { value: '12', label: 'Countries photographed' },
      ],
      partnersTitle: 'Partners',
      partners: [
        {
          slug: 'mara-lindgren',
          name: 'Mara Lindgren',
          text: 'Founding partner. Landscape and expeditions. Before starting the studio she photographed for a mountain rescue service and two polar research teams.',
        },
        {
          slug: 'joel-okafor',
          name: 'Joel Okafor',
          text: 'Partner since 2018. Ports and industry. He teaches documentary photography one day a week at an art school in London.',
        },
        {
          slug: 'ines-carvalho',
          name: 'Ines Carvalho',
          text: 'Partner since 2018. Editing and production. She was picture editor at a Lisbon publisher for eight years before joining.',
        },
      ],
      testimonial: {
        text: 'The cooperative’s growers recognise their own plots in every picture, and that is why they use them.',
        name: 'Hélène Roux',
        role: 'Director, Hautes Garrigues Growers’ Cooperative',
      },
      faqTitle: 'Working with us',
      faq: [
        [
          'How does a commission start?',
          'With a conversation and a written brief, usually after a visit to the place. We then send a proposal with a fixed fee for the first stage, which is the visit and a short test shoot, so that a client can stop there if the fit is wrong.',
        ],
        [
          'What does a commission cost?',
          'A single-day commission starts at around £2,500. A series made over a season starts at around £18,000, and a year-long commission with a book or an exhibition at around £45,000. We give these ranges because a first conversation goes better when both sides know them.',
        ],
        [
          'Who owns the pictures?',
          'We keep the copyright and the client receives a licence for the uses agreed in the brief, including print, web and exhibition, with no end date. A client that needs the copyright itself, a public body for instance, can buy it, and we quote that separately.',
        ],
        [
          'Do you work outside the UK?',
          'More than half of our commissions are abroad, mostly in France and Iceland. We travel for the work and return to London to edit and print.',
        ],
        [
          'Do you offer placements?',
          'Two paid placements a year, starting in January and July. We reply to every application.',
        ],
      ],
    },
    contact: {
      ctaTitle: 'New commissions',
      ctaText:
        'Write to Mara Lindgren with what you want to show, where and by when. She replies to every enquiry within two working days.',
      phoneLabel: 'Telephone 020 7946 0184',
      phoneHref: 'tel:+442079460184',
      visit: [
        { h2: 'Visit' },
        { p: 'Second floor, 41 Hatherley Mews, Clerkenwell, London EC1R.' },
        {
          p: 'The studio is a ten-minute walk from Farringdon station. We are glad to show prints and work in progress by appointment, Monday to Thursday.',
        },
      ],
      jobs: [
        { h2: 'Jobs' },
        {
          p: `We hire one photographer or technician most years, usually in the spring, and look for people who can edit their own pictures and write a clear caption. Send a short letter and a portfolio of no more than twenty images to ${mail.jobs}.`,
        },
      ],
      press: [
        { h2: 'Press' },
        {
          p: `For images of our work and permission to reproduce them, write to Ines Carvalho at ${mail.press}. Please tell us where the images will appear.`,
        },
      ],
    },
    privacy: [
      { h2: 'Privacy' },
      {
        p: 'This site sets no advertising or tracking cookies. It counts visits without storing anything that identifies you.',
      },
      {
        p: `If you write to us, we keep your message and your address for as long as we need them to reply and to keep a record of any work we do together, and we never pass them to anyone else. To see or delete what we hold about you, write to ${mail.hello}.`,
      },
      {
        p: `${studio} Ltd is registered in England and Wales, company number 07642318. Registered office: second floor, 41 Hatherley Mews, London EC1R.`,
      },
    ],
    credits: {
      intro: [
        {
          p: 'The photographs on this site were taken from Wikimedia Commons, where their authors published them under a Creative Commons licence or into the public domain. We thank them. They were cropped and resized for the web.',
        },
        {
          p: 'The commissions, clients and people named on these pages are invented for the purposes of the example.',
        },
      ],
      licenceWord: 'licence',
      sourceWord: 'source',
    },
  }),
  menus: {
    header: ['work', 'studio', 'contact'],
    footer: ['work', 'studio', 'contact', 'privacy', 'credits'],
    labels: {
      home: 'Home',
      work: 'Work',
      studio: 'Studio',
      contact: 'Contact',
      privacy: 'Privacy',
      credits: 'Photo credits',
    },
  },
  settings: {
    tagline: 'Landscape, nature, ports and heritage.',
    footerNote:
      'Second floor, 41 Hatherley Mews, Clerkenwell, London EC1R. Studio visits by appointment, Monday to Thursday.',
  },
  widgets: {
    disciplines: 'Disciplines',
    clients: 'Clients',
    team: 'The studio',
    moreWork: 'More work',
    ctaTitle: 'New work',
    ctaHeading: 'Tell us what you want to show.',
    ctaBody: 'Where, and by when: Mara Lindgren replies to every enquiry within two working days.',
    ctaLabel: 'Start a commission',
  },
}
