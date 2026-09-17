import type { VitrineCopy } from './vitrine-copy.js'

/** The showcase site in English (L36). See `vitrine-copy.ts` for the shape. */
export const VITRINE_COPY_EN: VitrineCopy = {
  locale: 'en',
  schema: {
    taxonomy: { name: 'sector', singular: 'Sector', plural: 'Sectors' },
    routes: {
      solution: '/solutions/:slug',
      caseStudy: '/case-studies/:slug',
      job: '/careers/:slug',
      post: '/news/:slug',
    },
    labels: {
      solution: { singular: 'Solution', plural: 'Solutions' },
      caseStudy: { singular: 'Case study', plural: 'Case studies' },
      testimonial: { singular: 'Testimonial', plural: 'Testimonials' },
      teamMember: { singular: 'Leadership member', plural: 'Leadership' },
      job: { singular: 'Job opening', plural: 'Job openings' },
      post: { singular: 'Article', plural: 'News' },
    },
    fields: {
      icon: 'Icon',
      client: 'Client',
      location: 'Location',
      keyFigure: 'Key figure',
      keyFigureLabel: 'What the key figure measures',
      company: 'Company',
      team: 'Team',
      contract: 'Contract',
      author: 'Author',
    },
  },
  pageSlugs: {
    solutions: 'solutions',
    caseStudies: 'case-studies',
    company: 'company',
    careers: 'careers',
    news: 'news',
    contact: 'contact',
    legal: 'legal-notice',
    privacy: 'privacy',
    credits: 'photo-credits',
  },
  sectors: [
    {
      slug: 'energy',
      name: 'Energy',
      icon: 'bolt',
      text: 'Substations, lines, transformers and wind farms, monitored continuously so failures are anticipated rather than suffered.',
    },
    {
      slug: 'water',
      name: 'Water',
      icon: 'globe',
      text: 'Distribution networks, treatment plants and pumping stations: find a leak in days, not months.',
    },
    {
      slug: 'rail',
      name: 'Rail',
      icon: 'truck',
      text: 'Points, overhead lines and bridges fitted with sensors, so crews act before a train is held.',
    },
    {
      slug: 'industry',
      name: 'Industry',
      icon: 'settings',
      text: 'Turbines, compressors and production lines where a stoppage costs more than watching them.',
    },
  ],
  solutions: [
    {
      slug: 'sensors',
      name: 'Sensors and measurement nodes',
      description:
        'Self-contained nodes for lines, substations, pipes and track. Temperature, vibration, current and pressure, on battery or mains power.',
      icon: 'layers',
      media: 'solution-sensors',
      body: (firm) => [
        {
          p: 'Our measurement nodes are designed and assembled in France. They fit without an outage, on a live line as on a pipe in service, and send their readings over long-range radio, cellular networks or fibre depending on the site.',
        },
        { h2: 'What we measure' },
        {
          bullets: [
            'Conductor, terminal and transformer oil temperature, every ten seconds.',
            'Vibration and acoustic spectrum on rotating machines and points.',
            'Leakage current, partial discharge and humidity inside cabinets.',
            'Pressure, flow and hydraulic noise on water networks.',
          ],
        },
        { h2: 'Built to last in the field' },
        {
          p: 'IP68 enclosures, operating from −40 °C to +85 °C, ten years on a battery for the low-power models. Every node updates remotely and signs its readings, so tampered data is never mistaken for real data.',
        },
        {
          p: `${firm} sensors speak the protocols your systems already know, IEC 61850, Modbus and DNP3, and join an existing supervisory system without replacing a line of it.`,
        },
      ],
    },
    {
      slug: 'vigie-platform',
      name: 'The Vigie monitoring platform',
      description:
        'One view of the condition of every asset, alerts that say what to do, and a history maintenance teams actually read.',
      icon: 'chart',
      media: 'solution-platform',
      body: () => [
        {
          p: 'Vigie brings together readings from our sensors, data from your existing systems and your maintenance history. On one screen, an operator sees what is degrading, where, and since when.',
        },
        { h2: 'Alerts built for decisions' },
        {
          p: 'A Vigie alert does more than cross a threshold. It compares each reading with what the asset should be doing under the same load and weather, estimates severity, and proposes the right intervention with its deadline.',
        },
        { h2: 'What your teams find there' },
        {
          bullets: [
            'The network diagram, with the live state of every substation and every link.',
            'A record for each asset: readings, estimated remaining life, documents and past work.',
            'Monthly reports ready for the regulator, exported as PDF and CSV.',
            'An offline mobile app for technicians on site.',
          ],
        },
        {
          p: 'Vigie is hosted in France by a SecNumCloud-qualified provider, or in your own data centre if your security policy requires it.',
        },
      ],
    },
    {
      slug: 'predictive-maintenance',
      name: 'Predictive maintenance',
      description:
        'Models trained on your own assets that estimate how long is left before a failure, and when to intervene.',
      icon: 'trending-up',
      media: 'solution-predictive',
      body: (firm) => [
        {
          p: 'Replacing equipment on a fixed schedule is expensive; waiting for it to break costs more. Predictive maintenance means acting in between, when the readings show that degradation has started.',
        },
        { h2: 'How we build a model' },
        {
          bullets: [
            'We start from your failure and maintenance history, however incomplete.',
            'We combine it with sensor readings, load conditions and weather.',
            'Every model is validated on real failures it has never seen before it goes live.',
          ],
        },
        {
          p: `${firm} engineers stay accountable for every recommendation. A model whose accuracy drops is flagged, retrained, and withdrawn if it does not recover.`,
        },
        { h2: 'What changes for maintenance' },
        {
          p: 'Across our clients, unplanned corrective work falls by 40% on average in the second year, and critical assets are replaced fourteen months later on average than under a fixed schedule.',
        },
      ],
    },
    {
      slug: 'engineering-integration',
      name: 'Engineering and integration',
      description:
        'Site studies, laboratory qualification and connection to your control systems, so a new sensor disturbs nothing that already works.',
      icon: 'settings',
      media: 'solution-engineering',
      body: () => [
        {
          p: 'Every deployment starts with a study of the site and its constraints: access, power, electromagnetic compatibility, cybersecurity and operating procedures.',
        },
        { h2: 'Our laboratory' },
        {
          p: 'In Lyon, our 900 m² laboratory reproduces field conditions: a climate chamber, a vibration bench, a Faraday cage and a high-voltage test bay. No equipment ships to a client site without passing through it.',
        },
        { h2: 'Connecting to what you have' },
        {
          bullets: [
            'Integration with your SCADA systems and maintenance software, with nothing replaced.',
            'Documentation that meets your procedures and your auditors.',
            'Joint acceptance testing with your operations teams before anything goes live.',
          ],
        },
      ],
    },
    {
      slug: 'field-services',
      name: 'Field services',
      description:
        'Installation, commissioning and upkeep of sensors by our own technicians, certified for live equipment and sensitive sites.',
      icon: 'map-pin',
      media: 'solution-field',
      body: (firm) => [
        {
          p: `${firm} technicians are employees, not subcontractors. They are certified for live working, work at height and restricted sites, and they know the sensors they install because they helped qualify them.`,
        },
        { h2: 'What we take care of' },
        {
          bullets: [
            'Site survey, installation plan and access requests.',
            'Installation and commissioning, without an outage on most assets.',
            'Preventive maintenance of the sensors, and replacement within 72 hours if one fails.',
          ],
        },
        {
          p: 'Our crews work from Paris, Lyon, Reims and Nantes, and cover all of mainland France as well as Belgium and Switzerland.',
        },
      ],
    },
    {
      slug: 'industrial-cybersecurity',
      name: 'Industrial cybersecurity',
      description:
        'Mapping, segmentation and monitoring of operational networks, by a team that knows a patch is not installed on a live substation the way it is on a laptop.',
      icon: 'shield',
      media: 'solution-security',
      body: () => [
        {
          p: 'A connected sensor is also a way in. We design our hardware and software with that constraint in mind, and help our clients protect their operational networks as a whole.',
        },
        { h2: 'Our commitments' },
        {
          bullets: [
            'End-to-end encryption of readings, and a signature on every update.',
            'Annual penetration tests by an accredited third party.',
            'Support with NIS 2 compliance for operators of essential services.',
          ],
        },
        {
          p: 'Our security operations centre runs day and night. A security incident on a client site is assessed within thirty minutes, and the client is told before the first hour is out.',
        },
      ],
    },
  ],
  caseStudies: [
    {
      slug: 'ardenne-energies-outage-duration',
      title: 'Ardenne Énergies cuts average outage duration on its network by 38%',
      client: 'Ardenne Énergies',
      location: 'Charleville-Mézières, France',
      sector: 'energy',
      keyFigure: '−38%',
      keyFigureLabel: 'average outage duration over two years',
      summary:
        'An electricity distributor serving 410,000 customers fitted sensors to 140 primary substations and 2,300 km of lines. Faults are now located within minutes.',
      media: 'case-grid',
      body: (firm) => [
        { h2: 'The situation' },
        {
          p: 'Ardenne Énergies runs a large rural network exposed to storms and vegetation. Locating a fault often took hours of patrolling, and average outage duration had missed the regulator’s target for three years running.',
        },
        { h2: 'What we did' },
        {
          bullets: [
            'Installed 3,100 connected fault passage indicators on medium-voltage lines.',
            'Added thermal monitoring to the transformers of all 140 primary substations.',
            'Connected Vigie to the existing control system, without replacing it.',
          ],
        },
        {
          p: `${firm} engineers and the control room team spent six months tuning alert thresholds together, substation by substation, before the rollout.`,
        },
        { h2: 'The results' },
        {
          bullets: [
            'Average outage duration down 38% in two years.',
            'Time to locate a fault reduced from 2 h 40 to 11 minutes.',
            'Two transformers replaced before they failed, after thermal drift alerts.',
          ],
        },
      ],
    },
    {
      slug: 'castelane-water-leaks',
      title: 'Eaux de Castelane finds its leaks in three days instead of three months',
      client: 'Eaux de Castelane',
      location: 'Castelane metropolitan area, France',
      sector: 'water',
      keyFigure: '2.1 million',
      keyFigureLabel: 'cubic metres of water saved each year',
      summary:
        'A public water utility fitted acoustic sensors to 1,800 km of mains. The share of water reaching customers rose from 79% to 87% in two years.',
      media: 'case-water',
      body: () => [
        { h2: 'The situation' },
        {
          p: 'One litre in five produced by the utility was lost before it reached a tap. Leak detection campaigns kept four crews busy all year and covered the network only once every three years.',
        },
        { h2: 'What we did' },
        {
          bullets: [
            'Installed 2,600 acoustic sensors on valves and hydrants.',
            'Modelled the normal sound of each pipe section, hour by hour.',
            'Sent alerts straight into the scheduling tool the utility’s crews already use.',
          ],
        },
        { h2: 'The results' },
        {
          bullets: [
            'Average time to detect a leak cut from 94 days to 3.',
            'Network efficiency up from 79% to 87%.',
            '2.1 million cubic metres of water saved a year, the consumption of 38,000 residents.',
          ],
        },
      ],
    },
    {
      slug: 'railvia-points-failures',
      title: 'Railvia monitors 1,400 km of track and halves points failures',
      client: 'Railvia',
      location: 'North-eastern France',
      sector: 'rail',
      keyFigure: '−47%',
      keyFigureLabel: 'points failures in eighteen months',
      summary:
        'A regional rail infrastructure manager now tracks the operating force of 1,150 sets of points continuously, and intervenes before they fail.',
      media: 'case-rail',
      body: (firm) => [
        { h2: 'The situation' },
        {
          p: 'Points failures were the leading cause of delay on Railvia’s network. Maintenance followed calendar-based inspection rounds that could not see degradation appearing between two visits.',
        },
        { h2: 'What we did' },
        {
          bullets: [
            'Measured the current and operating force of every point machine.',
            'Detected drift caused by lubrication, frost and misalignment.',
            'Prioritised inspection rounds automatically, based on the actual condition of each asset.',
          ],
        },
        {
          p: `Installation took place at night, forty sets of points at a time, without a single service interruption attributable to ${firm} crews.`,
        },
        { h2: 'The results' },
        {
          bullets: [
            'Points failures down 47% in eighteen months.',
            'Delay minutes attributable to points divided by 2.3.',
            'Maintenance rounds cut by a third, with the same headcount.',
          ],
        },
      ],
    },
    {
      slug: 'marea-offshore-availability',
      title: 'maréa offshore raises the availability of its offshore wind farm to 97.8%',
      client: 'maréa offshore',
      location: 'English Channel',
      sector: 'energy',
      keyFigure: '97.8%',
      keyFigureLabel: 'wind farm availability in 2025',
      summary:
        'An operator of 62 offshore turbines now anticipates bearing wear and plans its work around favourable weather windows.',
      media: 'case-offshore',
      body: () => [
        { h2: 'The situation' },
        {
          p: 'Offshore, every intervention depends on the weather and on an available vessel. A bearing failure found too late could keep a turbine idle for weeks, while the sea calmed and the part arrived.',
        },
        { h2: 'What we did' },
        {
          bullets: [
            'Vibration analysis on the drivetrains of all 62 turbines.',
            'Remaining useful life estimates for every main bearing.',
            'Recommendations matched against swell forecasts to plan vessel trips.',
          ],
        },
        { h2: 'The results' },
        {
          bullets: [
            'Wind farm availability up from 94.1% to 97.8%.',
            'Nine bearing replacements planned instead of forced.',
            'Vessel trips down 22% by grouping interventions.',
          ],
        },
      ],
    },
  ],
  testimonials: [
    {
      authorName: 'Hélène Morvan',
      authorRole: 'Head of Operations, Ardenne Énergies',
      quote: (firm) =>
        `We thought we were buying sensors. What we gained was a method: the ${firm} team spent nights in our control room before tuning a single alert, and it shows in our figures.`,
    },
    {
      authorName: 'Bruno Castaing',
      authorRole: 'Technical Director, Eaux de Castelane',
      quote: () =>
        'In the first week the system found eleven leaks our crews had been looking for for months. Today our teams leave in the morning with the list of sections to check, and the list is right.',
    },
    {
      authorName: 'Ingrid Solberg',
      authorRole: 'Maintenance Manager, maréa offshore',
      quote: () =>
        'We now change a bearing when the sea is calm and the part is on the quay. It sounds simple, and it is exactly what we were missing.',
    },
  ],
  team: [
    {
      name: 'Claire Dumont',
      role: 'Chief Executive Officer',
      description:
        'An engineer who spent twenty years running electricity networks before co-founding the company in 2014.',
    },
    {
      name: 'Karim Benali',
      role: 'Chief Technology Officer',
      description:
        'Designed our first generation of sensors. Now leads electronics, embedded software and the Vigie platform.',
    },
    {
      name: 'Sofia Lindqvist',
      role: 'Chief Operating Officer',
      description:
        'Responsible for deployments and field services in the four countries where we work.',
    },
    {
      name: 'Thomas Nguyen',
      role: 'Head of Engineering',
      description:
        'Runs the Lyon laboratory and the studies that connect our systems to our clients’ control systems.',
    },
    {
      name: 'Amina Diallo',
      role: 'Head of Data and Models',
      description:
        'Holds a doctorate in statistics and leads the eighteen data scientists who build and monitor our models.',
    },
    {
      name: 'Julien Marchetti',
      role: 'Head of Systems Security',
      description:
        'A former industrial security auditor who runs our security operations centre and product compliance.',
    },
  ],
  jobs: [
    {
      slug: 'embedded-systems-engineer',
      title: 'Embedded systems engineer',
      team: 'Sensors',
      location: 'Paris',
      contract: 'Permanent · hybrid',
      summary:
        'Design the embedded software of our next measurement nodes: low power, remote updates and security.',
      body: (firm) => [
        { h2: 'What you will do' },
        {
          bullets: [
            'Write embedded software in C and Rust on ARM Cortex-M microcontrollers.',
            'Cut power consumption to reach ten years on a battery.',
            'Design the secure remote update chain.',
            'Take part in hardware qualification at the Lyon laboratory.',
          ],
        },
        { h2: 'What we are looking for' },
        {
          bullets: [
            'At least three years of experience with constrained embedded software.',
            'Hands-on experience with low-power radio protocols.',
            'An appetite for the field: you will go and see your sensors working on site.',
          ],
        },
        {
          p: `At ${firm}, embedded engineers sit in the same team as the people who install the sensors. Two days a week from home, and one day a quarter on a client site.`,
        },
      ],
    },
    {
      slug: 'data-scientist-predictive-maintenance',
      title: 'Data scientist, predictive maintenance',
      team: 'Data and models',
      location: 'Lyon or Paris',
      contract: 'Permanent · hybrid',
      summary:
        'Build and monitor the models that estimate the remaining life of transformers, turbines and points.',
      body: () => [
        { h2: 'What you will do' },
        {
          bullets: [
            'Build degradation models from sensor time series.',
            'Validate every model on real failures before it goes live.',
            'Monitor model accuracy in production and decide when to retrain.',
            'Explain your results to our clients’ operations engineers.',
          ],
        },
        { h2: 'What we are looking for' },
        {
          bullets: [
            'A background in statistics, machine learning or physics.',
            'Production experience with Python and time series.',
            'The discipline to say a model does not work when it does not.',
          ],
        },
      ],
    },
    {
      slug: 'field-technician-electrical-networks',
      title: 'Field technician, electrical networks',
      team: 'Field services',
      location: 'Reims',
      contract: 'Permanent · travel',
      summary:
        'Install, commission and maintain our sensors on the substations and lines of our clients in north-eastern France.',
      body: () => [
        { h2: 'What you will do' },
        {
          bullets: [
            'Prepare each intervention with network operators and safety teams.',
            'Install and commission sensors on substations and lines.',
            'Diagnose and replace faulty equipment.',
          ],
        },
        { h2: 'What we are looking for' },
        {
          bullets: [
            'A technical qualification in electrical engineering, or equivalent experience.',
            'Electrical safety certifications, or the wish to earn them with us.',
            'A driving licence, and availability for travel within the region.',
          ],
        },
        {
          p: 'Company vehicle, full equipment and live-working training provided. Travel is planned at least a week ahead.',
        },
      ],
    },
    {
      slug: 'product-designer-monitoring',
      title: 'Product designer, monitoring interfaces',
      team: 'Vigie platform',
      location: 'Paris',
      contract: 'Permanent · hybrid',
      summary:
        'Design screens that operators watch eight hours a day, where a misreading can cut the power to a city.',
      body: () => [
        { h2: 'What you will do' },
        {
          bullets: [
            'Observe operators at work, in control rooms and in the field.',
            'Design the Vigie interfaces, from the network diagram to the offline mobile app.',
            'Evolve our design system and its documentation.',
          ],
        },
        { h2: 'What we are looking for' },
        {
          bullets: [
            'At least four years of experience on complex, data-dense products.',
            'A portfolio that shows how you work, not only what you shipped.',
            'A genuine interest in accessibility and long-term legibility.',
          ],
        },
      ],
    },
  ],
  posts: [
    {
      slug: 'transformer-temperature-every-ten-seconds',
      title: 'Why we measure transformer temperature every ten seconds',
      summary:
        'One reading an hour is enough to see a transformer heat up. It is not enough to understand why, or to know whether to act tonight.',
      author: 'Karim Benali',
      publishedAt: '2026-09-02T08:00:00.000Z',
      sector: 'energy',
      media: 'post-transformer',
      body: () => [
        {
          p: 'A transformer’s oil temperature follows its load tens of minutes behind. Measured once an hour, it tells a smoothed story in which a brief overload and an emerging fault look alike.',
        },
        { h2: 'What a fine-grained reading shows' },
        {
          p: 'Every ten seconds, the thermal response to each change in load becomes readable. A cooling fault gives itself away through a steeper rise than usual, long before the absolute temperature reaches a threshold.',
        },
        { h2: 'And the volume of data' },
        {
          p: 'Our nodes do not send every reading. They compute the useful indicators locally and send the full series only when a deviation appears. A transformer produces less than 2 MB of data a month.',
        },
      ],
    },
    {
      slug: 'hydro-turbine-vibration',
      title: 'Hydropower: what vibration says about a turbine before it fails',
      summary:
        'A turbine’s vibration spectrum changes weeks before a bearing gives way. The difficulty is reading it at varying flow.',
      author: 'Amina Diallo',
      publishedAt: '2026-07-15T08:00:00.000Z',
      sector: 'industry',
      media: 'post-hydro',
      body: () => [
        {
          p: 'A hydroelectric turbine never runs under the same conditions two days in a row. Flow, head and demanded load change its vibration spectrum far more than early wear does.',
        },
        { h2: 'Comparing like with like' },
        {
          p: 'Our models group readings by operating regime before comparing them. A 15% rise in vibration energy at 300 Hz only means something if it appears at equivalent flow and load.',
        },
        {
          p: 'Across the eight units monitored for an Alpine producer, this method flagged two bearing wear cases six and nine weeks ahead, enough to schedule the stoppage during low water.',
        },
      ],
    },
    {
      slug: 'blade-erosion-from-the-ground',
      title: 'Blade erosion: seeing from the ground what used to need a rope access team',
      summary:
        'Leading-edge erosion can cost up to 3% of output. We now detect it without stopping the turbine or sending anyone up.',
      author: 'Sofia Lindqvist',
      publishedAt: '2026-06-10T08:00:00.000Z',
      sector: 'energy',
      media: 'post-blades',
      body: () => [
        {
          p: 'Rain, sand and salt wear down the leading edge of turbine blades. Traditional inspection means stopping the turbine and sending a technician up on ropes, which is rare and costly.',
        },
        { h2: 'An acoustic signature' },
        {
          p: 'An eroded blade does not sound like a healthy one. Microphones at the foot of the tower, combined with wind and output data, are enough to single out the blades to inspect first.',
        },
        {
          p: 'On a 24-turbine farm, this method halved the number of rope access inspections by focusing work on the blades that were actually damaged.',
        },
      ],
    },
    {
      slug: 'where-your-data-lives',
      title: 'Where your data lives: our hosting, explained plainly',
      summary:
        'Readings from a water or electricity network are sensitive data. Here is where we store them, who can read them, and how we prove it.',
      author: 'Julien Marchetti',
      publishedAt: '2026-05-06T08:00:00.000Z',
      sector: 'industry',
      media: 'post-storage',
      body: (firm) => [
        {
          p: 'Our clients’ data is stored in two data centres in France, with a SecNumCloud-qualified provider. No copy is kept outside the European Union, backups included.',
        },
        { h2: 'Who can access it' },
        {
          bullets: [
            'The client’s own teams, with the permissions the client sets.',
            `Authorised ${firm} engineers, only at the client’s request, with every access logged.`,
            'Nobody else, and no subcontractor outside the European Union.',
          ],
        },
        { h2: 'If you would rather keep your data in-house' },
        {
          p: 'Vigie can run in your own data centre with no outbound connection at all. Updates are then delivered on signed media and installed by your teams.',
        },
      ],
    },
  ],
  clients: [
    { key: 'logo-ardenne', name: 'Ardenne Énergies' },
    { key: 'logo-castelane', name: 'Eaux de Castelane' },
    { key: 'logo-railvia', name: 'Railvia' },
    { key: 'logo-marea', name: 'maréa offshore' },
    { key: 'logo-helion', name: 'Hélion Réseaux' },
    { key: 'logo-tessane', name: 'Tessane Industrie' },
  ],
  media: [
    {
      name: 'hero',
      file: 'hero-pylon-dusk.jpg',
      alt: 'A high-voltage pylon against an evening sky, above a field',
    },
    {
      name: 'platform-overview',
      file: 'vigie-overview-en.png',
      alt: 'The Vigie overview screen: network indicators, substation diagram, alert list and a transformer temperature chart',
    },
    {
      name: 'platform-detail',
      file: 'vigie-detail-en.png',
      alt: 'A transformer record in Vigie: estimated remaining life, maintenance recommendation, vibration spectrum and intervention history',
    },
    {
      name: 'solution-sensors',
      file: 'solution-sensor-node.jpg',
      alt: 'A connected measurement unit clamped to a power cable, seen from the ground',
    },
    {
      name: 'solution-platform',
      file: 'solution-control-room.jpg',
      alt: 'A monitoring desk with several screens showing a rail network diagram',
    },
    {
      name: 'solution-predictive',
      file: 'sector-industry-turbines.jpg',
      alt: 'The turbine hall of a hydroelectric plant, with units painted blue and red in a row',
    },
    {
      name: 'solution-engineering',
      file: 'solution-clean-room.jpg',
      alt: 'Two engineers in clean room suits beside a measuring instrument',
    },
    {
      name: 'solution-field',
      file: 'solution-field-fibre.jpg',
      alt: 'A technician’s hands using an optical fibre cleaver',
    },
    {
      name: 'solution-security',
      file: 'about-servers.jpg',
      alt: 'Server racks lit by blue status lights',
    },
    {
      name: 'case-grid',
      file: 'case-grid-pylons.jpg',
      alt: 'Pylons of an extra-high-voltage line under a cloudy blue sky',
    },
    {
      name: 'case-water',
      file: 'case-water-pipes.jpg',
      alt: 'A gallery of pipes inside a water treatment plant',
    },
    {
      name: 'case-rail',
      file: 'case-rail-bridge.jpg',
      alt: 'A steel railway bridge in the mist of a winter morning',
    },
    {
      name: 'case-offshore',
      file: 'case-offshore-array.jpg',
      alt: 'An offshore wind farm seen from an aircraft, turbines lined up to the horizon',
    },
    {
      name: 'post-transformer',
      file: 'news-transformer.jpg',
      alt: 'A high-voltage transformer installed in a substation',
    },
    {
      name: 'post-hydro',
      file: 'news-hydro-aerial.jpg',
      alt: 'Aerial view of a run-of-river hydroelectric plant on a wide river',
    },
    {
      name: 'post-blades',
      file: 'news-blades.jpg',
      alt: 'Two wind turbine blades laid on the ground in a V shape',
    },
    {
      name: 'post-storage',
      file: 'news-drive-internals.jpg',
      alt: 'The underside of a server hard drive, with its circuit board',
    },
    {
      name: 'company-studio',
      file: 'careers-studio.jpg',
      alt: 'A bright shared office space with sofas and tall windows',
    },
    {
      name: 'company-lab',
      file: 'about-instrument.jpg',
      alt: 'An engineer inspecting a detector with a torch in a laboratory',
    },
    {
      name: 'field-rail',
      file: 'sector-rail-viaduct.jpg',
      alt: 'A train crossing a red steel viaduct above a forest',
    },
    {
      name: 'field-water',
      file: 'sector-water-plant.jpg',
      alt: 'Machinery and pipework inside a water treatment plant',
    },
    {
      name: 'field-energy',
      file: 'sector-energy-offshore.jpg',
      alt: 'Offshore wind turbines under a hazy sky',
    },
    {
      name: 'careers-hero',
      file: 'careers-open-office.jpg',
      alt: 'A person working on a laptop in an open-plan office, behind plants',
    },
    {
      name: 'contact-office',
      file: 'contact-loft.jpg',
      alt: 'A large open office floor with industrial windows',
    },
  ],
  pages: (firm) => ({
    titles: {
      home: 'Home',
      solutions: 'Solutions',
      caseStudies: 'Case studies',
      company: 'Company',
      careers: 'Careers',
      news: 'News',
      contact: 'Contact',
      legal: 'Legal notice',
      privacy: 'Privacy policy',
      credits: 'Photo credits',
    },
    home: {
      heroEyebrow: 'Engineering and software for critical infrastructure',
      heroTitle: 'See a failure coming before it cuts a city off',
      heroSubtitle: `${firm} designs the sensors, the platform and the services that monitor electricity, water and rail networks around the clock. Our clients act at the right moment, not after the breakdown.`,
      heroPrimary: 'Talk about your network',
      heroSecondary: 'See our case studies',
      clientsCaption: 'Networks monitored with us',
      solutionsTitle: 'From sensor to decision',
      figuresTitle: 'In figures',
      figures: [
        { value: '12,400', label: 'sensors in service with our clients' },
        { value: '3,200', unit: 'km', label: 'of networks monitored continuously' },
        { value: '99.98', unit: '%', label: 'platform availability in 2025' },
        { value: '140', label: 'engineers, data scientists and technicians' },
      ],
      platformIntro: [
        { h2: 'Vigie, one view of the whole network' },
        {
          p: 'Readings from our sensors, data from your existing systems and your maintenance history, brought together in a platform designed for control rooms. Every alert says what is degrading, how serious it is, and what work to plan.',
        },
      ],
      platformCaption:
        'Overview of a distribution network in Vigie: substation status, alerts ranked by severity, and a transformer’s temperature against its model.',
      sectorsTitle: 'The networks we monitor',
      workTitle: 'Case studies',
      newsTitle: 'News',
      faqTitle: 'Frequently asked questions',
      faq: [
        [
          'Do we have to replace our existing supervisory systems?',
          'No. Our sensors and Vigie connect to your SCADA systems and maintenance software through standard protocols. Your teams keep running the network with the tools they know.',
        ],
        [
          'How long does a first deployment take?',
          'A pilot site is operational in eight to twelve weeks, including the study. The rollout then proceeds in stages, at the pace your operations allow.',
        ],
        [
          'Where is our data hosted?',
          'In France, with a SecNumCloud-qualified provider, and no copy outside the European Union. Vigie can also run in your own data centre.',
        ],
        [
          'How is the service priced?',
          'Sensors are sold or leased, the platform is an annual subscription based on the number of assets monitored, and field work is quoted at a fixed price. A detailed quote follows the site study.',
        ],
        [
          'Do you work outside France?',
          'Yes. We work in Belgium and Switzerland, and in Quebec from our Montreal office.',
        ],
      ],
      ctaTitle: 'Let’s talk about your network',
      ctaText:
        'Tell us about your assets and what concerns you. An engineer will reply within two working days to arrange a first visit.',
      ctaPrimary: 'Contact us',
      ctaSecondary: 'Explore the solutions',
    },
    solutions: {
      intro: [
        {
          p: `${firm} covers the whole chain of network monitoring: the sensors that measure, the platform that analyses, the models that anticipate, and the crews who install and maintain. Each part works on its own, and together they work best.`,
        },
      ],
      listTitle: 'Our solutions',
      methodTitle: 'How a deployment runs',
      method: [
        [
          'Site study',
          'Two to four weeks. We visit your installations, study your existing data and agree with your teams what should be measured, and why.',
        ],
        [
          'Pilot',
          'Eight to twelve weeks. A limited area is equipped and connected to Vigie. Alert thresholds are tuned with your operators on real situations.',
        ],
        [
          'Rollout',
          'In stages, without outages. Each stage goes through joint acceptance testing before it goes live.',
        ],
        [
          'Operation',
          'Our teams maintain the sensors, monitor the models and hold a quarterly review with your managers.',
        ],
      ],
      detailCaption:
        'A transformer record in Vigie: the estimated remaining life leads to a dated recommendation for work.',
    },
    caseStudies: {
      intro: [
        {
          p: 'Some of the projects our clients have agreed to describe in public. Figures come from their own operating indicators, and each account was reviewed by the client before publication.',
        },
      ],
      figuresTitle: 'Across our clients',
      figures: [
        { value: '−41', unit: '%', label: 'unplanned corrective work on average' },
        { value: '14', unit: 'months', label: 'longer life for critical assets' },
        { value: '8', unit: 'weeks', label: 'average warning before a detected failure' },
      ],
      logosTitle: 'They trust us',
    },
    company: {
      heroEyebrow: 'Company',
      heroTitle: 'Engineers who ran networks before they equipped them',
      heroSubtitle: `${firm} was founded in 2014 by electricity network operators who could not find the tools they needed.`,
      story: [
        { h2: 'Our story' },
        {
          p: `Claire Dumont and Karim Benali were running a distribution network when a storm left 90,000 homes without power for four days. The data that could have located the faults existed, but nobody could read it in time. ${firm} began there.`,
        },
        {
          p: 'The first sensors went up in 2015 on a rural network in the Ardennes. Today our equipment monitors electricity, water and rail networks in four countries.',
        },
        { h2: 'Independent and European' },
        {
          p: 'The company is owned by its founders, its employees and two European investment funds. We design our hardware in France, assemble it in Lyon, and host all our clients’ data within the European Union.',
        },
      ],
      figuresTitle: 'Since 2014',
      figures: [
        { value: '140', label: 'employees, 90 of them engineers and technicians' },
        { value: '4', label: 'countries: France, Belgium, Switzerland and Canada' },
        { value: '38', label: 'network operators as clients' },
        { value: '12%', label: 'of revenue invested in research' },
      ],
      principlesTitle: 'How we work',
      principles: [
        {
          icon: 'check',
          title: 'Measurement before opinion',
          text: 'We recommend work only when the readings justify it, and we always show which ones.',
        },
        {
          icon: 'users',
          title: 'The field first',
          text: 'Our engineers spend time in control rooms and on site before they design anything.',
        },
        {
          icon: 'lock',
          title: 'Security by design',
          text: 'Every sensor, every update and every access to data is designed for a critical network.',
        },
        {
          icon: 'leaf',
          title: 'Built to last',
          text: 'Our hardware is repairable, designed for ten years of service, and taken back at end of life.',
        },
      ],
      labCaption:
        'Qualifying a detector in the laboratory. No equipment leaves for a client site without passing these tests.',
      teamTitle: 'Leadership',
      fieldTitle: 'In the field',
    },
    careers: {
      heroEyebrow: 'Careers',
      heroTitle: 'Make networks more reliable, with people who like to understand things',
      heroSubtitle:
        'We hire engineers, data scientists, technicians and designers who want to see their work running in the field.',
      heroAction: 'See open roles',
      intro: [
        {
          p: `At ${firm}, the person who writes a model meets the person who installs the sensor, and both spend time with the client. That is how we build tools operators actually use.`,
        },
      ],
      benefitsTitle: 'What we offer',
      benefits: [
        {
          icon: 'clock',
          title: 'A sustainable pace',
          text: 'Two days a week from home where the role allows it, and on-call duty kept limited and paid.',
        },
        {
          icon: 'book',
          title: 'Keep learning',
          text: 'A personal training budget, and one week a year for a project of your choice.',
        },
        {
          icon: 'heart',
          title: 'Solid cover',
          text: 'Health insurance fully paid, income protection, and topped-up parental leave for every parent.',
        },
        {
          icon: 'award',
          title: 'Share the success',
          text: 'Every employee becomes a shareholder after a year, and profit sharing is paid in equal parts.',
        },
      ],
      rolesTitle: 'Open roles',
      processTitle: 'How we hire',
      process: [
        [
          'A first conversation',
          'Thirty minutes with the person who will lead your team, about the role and what you are looking for.',
        ],
        [
          'A short exercise',
          'A case close to the real work, prepared at home in two hours at most, then discussed together.',
        ],
        [
          'Half a day with the team',
          'You meet your future colleagues and, for technical roles, visit the laboratory or a site.',
        ],
        ['An answer within a week', 'Whatever the decision, we explain it.'],
      ],
      ctaTitle: 'No role quite fits',
      ctaText: 'Write to us anyway. We read every speculative application and always reply.',
      ctaAction: 'Send an application',
    },
    news: {
      intro: [
        {
          p: 'What we learn from monitoring networks: field notes, methods, and the thinking behind our products.',
        },
      ],
    },
    contact: {
      intro: [
        {
          p: 'For a project, a question about our solutions or a site visit, write to us. An engineer will reply within two working days.',
        },
        { h2: 'Paris · headquarters' },
        {
          p: '18 rue des Ateliers, 75011 Paris, France. Telephone +33 1 99 00 42 17. contact@example.com',
        },
        { h2: 'Lyon · laboratory' },
        {
          p: '42 quai Perrache, 69002 Lyon, France. Telephone +33 4 99 00 18 64. lyon@example.com',
        },
        { h2: 'Montreal' },
        {
          p: '1250 rue Ottawa, Montreal, Quebec H3C 0B6, Canada. Telephone +1 514 555 0142. montreal@example.com',
        },
        { h2: 'Press and partnerships' },
        { p: 'press@example.com' },
      ],
      officeCaption: 'The floor of our Paris headquarters.',
      ctaTitle: 'Tell us about your network',
      ctaText:
        'Types of assets, extent, current concerns: a few lines are enough to prepare a useful first conversation.',
      ctaAction: 'Write to an engineer',
    },
    legal: [
      { h2: 'Publisher' },
      {
        p: `${firm}, a simplified joint-stock company with share capital of €850,000, registered office 18 rue des Ateliers, 75011 Paris, France. Registered with the Paris trade and companies register under number 000 000 000. EU VAT number FR00 000000000.`,
      },
      { p: 'Publication director: Claire Dumont, Chief Executive Officer.' },
      { h2: 'Hosting' },
      {
        p: 'This site is hosted in France. Full details of the hosting provider are available on request from contact@example.com.',
      },
      { h2: 'Intellectual property' },
      {
        p: 'The text, logos and interfaces on this site are protected. Photographs are used under their respective licences, listed on the photo credits page.',
      },
    ],
    privacy: [
      {
        p: `${firm} takes the protection of personal data seriously. This page explains what data this site collects, why, and how to exercise your rights.`,
      },
      { h2: 'Data we collect' },
      {
        bullets: [
          'The information you send when you write to us: name, email address, company and message.',
          'Anonymous visit statistics, with no advertising tracking cookies.',
        ],
      },
      { h2: 'Purposes and retention' },
      {
        p: 'Your messages are used only to reply to you and are kept for three years after our last exchange. Job applications are kept for two years unless you ask otherwise.',
      },
      { h2: 'Your rights' },
      {
        p: 'You can access, correct or delete your data, or object to its processing, by writing to dpo@example.com. You may also lodge a complaint with your data protection authority.',
      },
    ],
    credits: {
      intro: [
        {
          p: 'The photographs on this site are published under open licences or are in the public domain. We thank their authors. They have been cropped and resized for the web.',
        },
      ],
      licenceWord: 'licence',
      sourceWord: 'source',
    },
  }),
  menus: {
    header: [
      { label: 'Solutions', page: 'solutions' },
      { label: 'Case studies', page: 'caseStudies' },
      { label: 'Company', page: 'company' },
      { label: 'Careers', page: 'careers' },
      { label: 'News', page: 'news' },
    ],
    footer: [
      { label: 'Solutions', page: 'solutions' },
      { label: 'Case studies', page: 'caseStudies' },
      { label: 'Company', page: 'company' },
      { label: 'Careers', page: 'careers' },
      { label: 'News', page: 'news' },
      { label: 'Contact', page: 'contact' },
      { label: 'Legal notice', page: 'legal' },
      { label: 'Privacy', page: 'privacy' },
      { label: 'Photo credits', page: 'credits' },
    ],
    action: 'Contact us',
  },
  settings: () => ({
    tagline: 'Sensors, software and services that monitor electricity, water and rail networks.',
    footerNote: [
      'Paris\n18 rue des Ateliers\n75011 Paris',
      'Lyon\n42 quai Perrache\n69002 Lyon',
      'Montreal\n1250 rue Ottawa\nMontreal QC H3C 0B6',
    ].join('\n\n'),
  }),
  widgets: {
    sectors: 'Sectors',
    moreCaseStudies: 'More case studies',
    otherSolutions: 'Other solutions',
    recentPosts: 'Recent articles',
    contactTitle: 'Talk to an engineer',
    contactHours: 'Monday to Friday',
    contactHoursValue: '8:30 am to 6:30 pm',
    ctaHeading: 'A similar network to monitor?',
    ctaBody: 'Describe it in a few lines. An engineer will reply within two working days.',
    ctaLabel: 'Contact us',
    searchTitle: 'Search',
    searchPlaceholder: 'A client, an asset',
    relatedWork: 'Related case studies',
    openRoles: 'Other open roles',
  },
}
