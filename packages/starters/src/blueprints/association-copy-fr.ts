import type {
  AssociationCopy,
  AssociationCopyContext,
  AssociationEventCopy,
  AssociationPagesCopy,
  AssociationProgrammeCopy,
} from './association-copy.js'

/**
 * The French `association` blueprint: une association loi 1901 de quartier,
 * installée dans l’ancienne bibliothèque de la rue des Tilleuls à Aubrières,
 * dans le Nord. La ville, la rue et les personnes sont inventées. Le numéro de
 * téléphone est dans la tranche que l’Arcep réserve à la fiction (03 53 01 xx
 * xx) : il ne sonnera chez personne.
 *
 * Typography: this file is written with ordinary spaces; the rules of
 * `association-typography.ts` are applied when the pack is built, so a
 * no-break space always stands before `: ; ? !`, `%` and `€`.
 */

const PHONE = '03 53 01 18 42'
const PHONE_HREF = 'tel:+33353011842'
const HALL = 'L’ancienne bibliothèque'
const HALL_STREET = '18, rue des Tilleuls'
const HALL_TOWN = '59990 Aubrières'
const HALL_ADDRESS = `${HALL_STREET}, ${HALL_TOWN}`
const FEST = 'Salle des fêtes'
const FEST_ADDRESS = 'Place de la Mairie, 59990 Aubrières'

const PROGRAMMES: readonly AssociationProgrammeCopy[] = [
  {
    slug: 'distribution-alimentaire',
    title: 'Distribution alimentaire du jeudi',
    summary:
      'Chaque jeudi soir, une semaine de courses pour tout foyer qui en fait la demande. Sans justificatif, sans dossier, et des légumes frais à côté des conserves.',
    schedule: 'Jeudi, de 17 h 30 à 19 h 30',
    location: `${HALL}, grande salle`,
    audience: 'Tout foyer d’Aubrières et des communes voisines, sans justificatif de ressources',
    cost: 'Gratuit',
    mailbox: 'distribution',
    photo: 'programme-food-bank',
    body: [
      'Chaque jeudi, la grande salle se remplit de tables de conserves, de pâtes, de riz, de céréales, de thé et de produits d’hygiène, et d’une table de tout ce que le jardin et les commerçants du marché ont donné dans la semaine. Chaque foyer repart avec une semaine de courses choisies avec un bénévole, environ 14 kilos, rangés dans ses propres sacs ou dans les nôtres.',
      '## Comment ça se passe',
      'Présentez-vous à la porte latérale, côté rue des Tilleuls, à n’importe quel moment entre 17 h 30 et 19 h 30. Un bénévole note votre prénom et le nombre de personnes au foyer, rien d’autre. Si vous ne pouvez pas porter une semaine de courses, dites-le-nous : deux chauffeurs livrent chaque semaine 23 foyers qui ne peuvent pas venir jusqu’à la salle.',
      'Nous ne demandons à personne de prouver qu’il a besoin d’aide. Les trois voisins qui ont lancé la distribution en 1994 estimaient que réclamer des justificatifs découragerait ceux qui en ont le plus besoin, et chaque conseil d’administration depuis a gardé cette règle.',
      '## D’où vient la nourriture',
      'Environ les deux tiers de ce que nous distribuons est donné : points de collecte chez Delcourt & Fils et dans deux écoles, deux grandes collectes par an, et des voisins qui laissent un sac à la porte. Le reste, nous l’achetons, surtout des produits frais, du lait, des couches et tout ce qui vient à manquer ; c’est là que va l’essentiel de l’argent que vous donnez.',
      '## Donner de la nourriture',
      'La salle reçoit les dons alimentaires en semaine, de 9 h 30 à 16 h. Ce mois-ci, il nous manque surtout du poisson en conserve, du lait UHT, du café soluble et des produits d’hygiène. Merci de ne rien apporter d’ouvert ni de périmé.',
    ],
  },
  {
    slug: 'aide-aux-devoirs',
    title: 'Aide aux devoirs',
    summary:
      'Deux après-midi calmes par semaine dans la salle de lecture, pour les collégiens, avec des bénévoles, des ordinateurs, une imprimante et un goûter.',
    schedule: 'Mardi et jeudi, de 16 h 30 à 18 h 30, en période scolaire',
    location: `${HALL}, salle de lecture à l’étage`,
    audience: 'Collégiens de la 6e à la 3e, de tous les établissements d’Aubrières',
    cost: 'Gratuit',
    mailbox: 'devoirs',
    photo: 'programme-homework-club',
    body: [
      'L’aide aux devoirs est née en 2009, quand une maman a remarqué que la salle de lecture, au-dessus de la grande salle, restait vide les après-midi de semaine alors que ses enfants n’avaient nulle part où travailler au calme. Aujourd’hui, 46 collégiens de neuf établissements viennent au moins une fois par semaine.',
      '## Un après-midi à l’aide aux devoirs',
      'Les enfants arrivent de l’école, signent la feuille de présence et prennent d’abord un goûter, tartines ou fruit. Puis ils travaillent à leur rythme sur ce qu’on leur a demandé, avec un bénévole pour quatre enfants. La plupart sont des lycéens de terminale du lycée voisin, et deux enseignants retraités animent les séances.',
      'Nous disposons de douze ordinateurs portables, d’une imprimante, d’une étagère d’annales du brevet et du baccalauréat, et d’une règle : les téléphones restent dans les sacs jusqu’à 18 heures.',
      '## S’inscrire',
      'Un parent remplit une fiche d’une page à la salle ou par courriel, avec un contact en cas d’urgence et tout ce que nous devons savoir sur la santé ou les difficultés d’apprentissage de l’enfant. L’adhésion à l’association est demandée, mais personne n’est refusé faute de pouvoir la payer. Il reste de la place le mardi ; le jeudi, il reste quatre places.',
      'Chaque intervenant fournit un extrait de casier judiciaire (bulletin n° 3), que l’on peut obtenir gratuitement en ligne, et suit notre séance de sensibilisation à la protection de l’enfance avant son premier après-midi.',
    ],
  },
  {
    slug: 'jardin-partage',
    title: 'Jardin partagé',
    summary:
      'Douze carrés potagers derrière la salle, plantés et récoltés par tous ceux qui veulent donner un coup de main. L’an dernier, 1,4 tonne de légumes pour la distribution alimentaire.',
    schedule: 'Samedi, de 9 h 30 à 12 h 30, d’avril à octobre',
    location: 'Jardin de la rue des Tilleuls, derrière la salle',
    audience: 'Tout le monde, enfants accompagnés d’un adulte compris',
    cost: 'Gratuit',
    mailbox: 'jardin',
    photo: 'programme-garden',
    body: [
      'Le jardin a commencé en 2012 avec trois carrés au bord du parking. Il occupe aujourd’hui toute la longueur du terrain derrière la salle : douze carrés, une serre tunnel offerte par Habitat Aubrières, deux récupérateurs d’eau de pluie et une cabane d’outils que chacun peut emprunter le samedi.',
      '## Ce qui pousse',
      'Nous cultivons ce que la distribution alimentaire écoule le plus vite : pommes de terre, oignons, carottes, courgettes, haricots, salades et herbes aromatiques. Tout ce qui est cueilli le samedi matin est pesé, lavé, et se retrouve sur les tables de la distribution le jeudi suivant.',
      '## Venir au jardin',
      'Présentez-vous n’importe quel samedi, d’avril à octobre. Gants, outils et thé sont fournis, et l’un des jardiniers réguliers montre aux nouveaux ce qu’il y a à faire. Nul besoin de connaître les plantes ; la plupart des tâches consistent à bêcher, désherber et arroser.',
      'Les carrés sont à hauteur de taille à une extrémité : le jardin convient donc à ceux qui ne peuvent pas s’agenouiller.',
    ],
  },
  {
    slug: 'vestiaire-solidaire',
    title: 'Vestiaire solidaire d’hiver',
    summary:
      'Manteaux chauds, bottes et pulls d’école, donnés par les voisins et rangés par taille, gratuits pour toute famille qui en a besoin, d’octobre à février.',
    schedule: 'Lundi, de 10 h à 13 h, d’octobre à février',
    location: `${HALL}, grande salle`,
    audience: 'Adultes et enfants d’Aubrières',
    cost: 'Gratuit',
    mailbox: 'vestiaire',
    photo: 'programme-coat-bank',
    body: [
      'L’hiver dernier, le vestiaire a distribué 820 manteaux, 310 paires de bottes et 190 pulls d’école. Chacun a été donné par quelqu’un de la ville, vérifié (fermetures, boutons), lavé si nécessaire et accroché par taille.',
      '## Choisir un manteau',
      'Venez à la salle un lundi matin, entre octobre et février, et choisissez ce qui vous va. Il y a une cabine d’essayage, un miroir et un bénévole pour vous aider à trouver votre taille. Une famille peut prendre un manteau pour chaque personne du foyer.',
      '## Donner un manteau',
      'Nous acceptons les manteaux, bottes et pulls propres et en bon état à la salle, en semaine, dès septembre. Il nous manque toujours des manteaux d’enfant de 8 à 13 ans et des bottes d’homme en grandes tailles.',
      '## Où vont les vêtements',
      'Ce que nous ne pouvons pas distribuer, parce que c’est déchiré ou de la mauvaise saison, part chez un recycleur textile d’Aubrières, qui nous paie au kilo. L’hiver dernier, cela a financé les portants et les cintres.',
    ],
  },
]

const EVENTS: readonly AssociationEventCopy[] = [
  {
    title: 'Soirée d’accueil des bénévoles',
    slug: 'soiree-accueil-benevoles',
    daysFromNow: 6,
    start: [18, 0],
    end: [19, 30],
    location: `${HALL}, salle de lecture à l’étage`,
    address: HALL_ADDRESS,
    cost: 'Gratuit',
    booking: 'Inutile de s’inscrire, mais prévenez-nous de votre venue',
    description:
      'Une heure et demie pour tous ceux qui pensent devenir bénévoles : ce que fait chacun, qui l’anime, et quels créneaux ont besoin de monde en ce moment.',
    photo: 'event-orientation',
    body: [
      'La plupart de nos 312 bénévoles ont commencé lors d’une de ces soirées. La coordinatrice et les responsables de la distribution alimentaire, de l’aide aux devoirs, du jardin et du vestiaire parlent chacun dix minutes de ce qu’est vraiment une séance, puis restent répondre aux questions autour d’un thé.',
      '## Et après',
      'Personne ne s’engage à quoi que ce soit le soir même. Si une activité vous plaît, la coordinatrice organise une première séance aux côtés d’un bénévole expérimenté. Pour l’aide aux devoirs, nous lançons la demande d’extrait de casier judiciaire dans la semaine ; comptez quelques jours.',
      'La salle de lecture se trouve à l’étage, par un escalier. Si l’escalier pose problème, prévenez-nous : nous nous retrouverons dans la grande salle.',
    ],
  },
  {
    title: 'Collecte alimentaire chez Delcourt & Fils',
    slug: 'collecte-delcourt-et-fils',
    daysFromNow: 11,
    start: [10, 0],
    end: [14, 0],
    location: 'Parking de Delcourt & Fils',
    address: '14, rue du Marché, 59990 Aubrières',
    cost: 'Gratuit',
    booking: 'Sans inscription',
    description:
      'Notre plus grosse collecte de l’année. Apportez des conserves et des produits secs sur le parking du marché, ou donnez deux heures pour trier ce qui arrive.',
    photo: 'programme-food-bank',
    body: [
      'La dernière fois, une seule journée a rapporté 2,1 tonnes de nourriture, de quoi remplir les étagères de la distribution pendant huit semaines. Delcourt & Fils nous prête son parking et une camionnette, et ajoute une boîte de conserve à chaque dizaine reçue.',
      '## Quoi apporter',
      'Poisson et viande en conserve, légumes en conserve, lait UHT, riz, sauce tomate, thé, café et produits d’hygiène. Merci de ne rien apporter d’ouvert, de fait maison ou de périmé.',
      '## Aider sur place',
      'Il nous faut une trentaine de personnes dans la journée, par créneaux de deux heures, pour recevoir les dons aux tables et les trier dans des caisses, dans la réserve du magasin. Venez pour un créneau ou restez toute la journée.',
    ],
  },
  {
    title: 'Matinée plantation au jardin',
    slug: 'matinee-plantation-jardin',
    daysFromNow: 17,
    start: [9, 30],
    end: [12, 30],
    location: 'Jardin de la rue des Tilleuls, derrière la salle',
    address: HALL_ADDRESS,
    cost: 'Gratuit',
    booking: 'Sans inscription',
    description:
      'Une matinée pour planter et nettoyer les carrés et la serre tunnel. Outils, gants et thé fournis ; les enfants sont les bienvenus avec un adulte.',
    photo: 'event-planting',
    body: [
      'Six fois par an, le jardin a besoin de plus de bras qu’une séance ordinaire n’en apporte. Nous plantons en pleine terre ce que la saison permet, semons salades et aromatiques sous la serre, nettoyons ce qui est fini et donnons aux carrés vides une couche de compost frais.',
      '## À apporter',
      'Des vêtements qui peuvent se salir et des bottes si vous en avez. Nous avons des gants dans toutes les tailles, des outils pour une quarantaine de personnes et une bouilloire dans la cabane. Un carré est réservé aux enfants, avec des radis et des tournesols qui poussent vite.',
    ],
  },
  {
    title: 'Collecte de manteaux et de bottes',
    slug: 'collecte-manteaux-bottes',
    daysFromNow: 24,
    start: [10, 0],
    end: [15, 0],
    location: `${HALL}, grande salle`,
    address: HALL_ADDRESS,
    cost: 'Gratuit',
    booking: 'Venez quand vous voulez',
    description:
      'Apportez les manteaux, bottes et pulls d’école propres dont vous n’avez plus l’usage. Tout est vérifié, rangé par taille et gardé pour le vestiaire solidaire.',
    photo: 'programme-coat-bank',
    body: [
      'Le vestiaire se garnit grâce aux collectes de l’année : à l’ouverture, un portant est prêt pour chaque famille. Apportez ce que vous pouvez porter à la grande salle entre 10 h et 15 h ; un bénévole vérifie chaque manteau avec vous à l’entrée, il n’y a donc rien à trier avant de venir.',
      '## Ce qu’il nous faut le plus',
      'Des manteaux d’enfant de 8 à 13 ans, des manteaux et des bottes d’homme en grandes tailles, et des pulls d’école gris ou noirs, dans toutes les tailles. Nous ne pouvons pas prendre les manteaux déchirés, tachés ou dont la fermeture est cassée.',
    ],
  },
  {
    title: 'Assemblée générale',
    slug: 'assemblee-generale',
    daysFromNow: 31,
    start: [19, 0],
    end: [20, 30],
    location: `${HALL}, grande salle`,
    address: HALL_ADDRESS,
    cost: 'Gratuit',
    booking: 'Ouverte à tous ; les adhérents votent',
    description:
      'Le conseil d’administration présente le rapport moral et les comptes de l’année, deux administrateurs sont à élire, et chacun peut poser sa question.',
    body: [
      'Une fois par an, le conseil d’administration rend compte de chaque euro reçu et dépensé, et de ce que les quatre actions ont accompli. Le trésorier présente les comptes de l’exercice, vérifiés par deux adhérents, et la présidente présente le rapport moral.',
      '## À l’ordre du jour',
      '- Le rapport moral et le rapport financier',
      '- Le vote du quitus et l’approbation des comptes',
      '- L’élection de deux administrateurs, dont un bénévole de la distribution alimentaire',
      '- Le budget prévisionnel et le montant de la cotisation',
      '- Les questions diverses',
      'Toute personne peut assister à l’assemblée et poser une question. Les adhérents à jour de leur cotisation votent. Des exemplaires imprimés des comptes sont à votre disposition à la salle dans les quinze jours qui précèdent.',
    ],
  },
  {
    title: 'Repas solidaire',
    slug: 'repas-solidaire',
    daysFromNow: 38,
    start: [19, 0],
    end: [22, 30],
    location: FEST,
    address: FEST_ADDRESS,
    cost: '25 €, ou 12 € pour les moins de 16 ans',
    booking: 'Billets à la salle ou par courriel ; 180 places',
    description:
      'Un repas en trois plats cuisiné par les bénévoles, une tombola et un mot de l’équipe de la distribution alimentaire. Chaque billet finance quatre colis.',
    photo: 'event-supper',
    body: [
      'Notre unique repas de soutien de l’année. L’an dernier, 170 personnes sont venues et la soirée a rapporté 9 400 €, de quoi payer les produits frais de la distribution du jeudi pendant trois mois.',
      '## La soirée',
      'Les portes ouvrent à 18 h 30, le repas est servi à 19 h et la tombola est tirée entre le plat et le dessert. Au menu : velouté de légumes, blanquette de volaille ou gratin de légumes et haricots blancs, puis tarte aux pommes, avec une option végétarienne ou végétalienne à chaque plat si vous nous le dites en réservant.',
      'La salle des fêtes est de plain-pied et dispose de toilettes accessibles. Le parking de la place de la Mairie est gratuit le soir.',
    ],
  },
]

function pages(c: AssociationCopyContext): AssociationPagesCopy {
  const { name } = c
  return {
    titles: {
      home: 'Accueil',
      whatWeDo: 'Nos actions',
      events: 'Agenda',
      volunteer: 'Devenir bénévole',
      donate: 'Faire un don',
      finances: 'Où va l’argent',
      about: 'Notre histoire',
      contact: 'Nous contacter',
      privacy: 'Confidentialité',
      legal: 'Mentions légales',
      credits: 'Crédits photo',
    },
    home: {
      heroEyebrow: 'Une association de quartier à Aubrières depuis 1994',
      heroTitle: 'Personne à Aubrières ne devrait avoir faim ni affronter l’hiver seul',
      heroSubtitle: `${name} anime une distribution alimentaire, une aide aux devoirs, un jardin partagé et un vestiaire solidaire dans l’ancienne bibliothèque de la rue des Tilleuls, avec 312 bénévoles et deux salariés à temps partiel.`,
      heroPrimary: 'Faire un don',
      heroSecondary: 'Devenir bénévole',
      impactTitle: 'L’an dernier, en chiffres',
      impact: [
        {
          value: '7 280',
          unit: 'colis',
          label: 'distribués le jeudi soir, chacun une semaine de courses pour un foyer.',
        },
        {
          value: '46',
          unit: 'collégiens',
          label:
            'de neuf établissements sont venus à l’aide aux devoirs au moins une fois par semaine.',
        },
        {
          value: '1,4',
          unit: 'tonne',
          label:
            'de légumes cultivés au jardin sont allés directement sur les tables de la distribution.',
        },
        {
          value: '312',
          unit: 'bénévoles',
          label:
            'ont donné 21 600 heures à eux tous. Deux salariés à temps partiel organisent les plannings.',
        },
      ],
      programmesTitle: 'Nos actions',
      eventsTitle: 'À venir',
      storyQuote: [
        'Mon fils décrochait en maths et notre appartement n’est pas un endroit calme. Je l’ai amené à l’aide aux devoirs pour un trimestre, et à l’été j’étais l’une de celles qui aidaient.',
        `Cinq ans plus tard, j’anime la séance du mardi. Ce qui me retient chez ${name}, c’est que personne ici n’a jamais fait sentir à un enfant qu’on l’aidait.`,
      ],
      storyName: 'Marie Lecomte',
      storyRole: 'Bénévole à l’aide aux devoirs depuis 2019',
      moneyTitle: 'Où va chaque euro',
      money: [
        { value: '38 %', label: 'Produits achetés pour compléter les dons' },
        { value: '23 %', label: 'L’aide aux devoirs, le jardin et le vestiaire solidaire' },
        { value: '17 %', label: 'Chauffage, électricité, entretien et assurance du local' },
        { value: '12 %', label: 'La camionnette, la comptabilité et la collecte de fonds' },
        { value: '10 %', label: 'Deux salariés à temps partiel qui organisent 312 bénévoles' },
      ],
      giveTitle: 'Un don mensuel fait tenir le jeudi',
      giveText:
        'Nous préparons la distribution un mois à l’avance : un don régulier est donc ce qui nous aide le plus. 5 € par mois paient le pain d’un jeudi. 12 € par mois assurent des légumes frais à une famille toute l’année. 30 € par mois financent la place d’un enfant à l’aide aux devoirs. Chaque don ouvre droit à une réduction d’impôt de 66 %.',
      givePrimary: 'Les façons de donner',
      giveSecondary: 'Lire nos comptes',
      partnersCaption: 'À nos côtés à Aubrières',
      faqTitle: 'Les questions qu’on nous pose',
      faq: [
        {
          question: 'Faut-il être orienté par un travailleur social pour venir à la distribution ?',
          answer:
            'Non. Présentez-vous à la porte latérale un jeudi entre 17 h 30 et 19 h 30. Nous demandons un prénom et le nombre de personnes au foyer, rien d’autre.',
        },
        {
          question: 'Combien de temps faut-il donner pour être bénévole ?',
          answer:
            'Autant que cela vous convient. Certains bénévoles viennent chaque semaine depuis des années ; d’autres aident lors de deux collectes par an. Les deux font tourner l’association.',
        },
        {
          question: 'Puis-je donner de la nourriture plutôt que de l’argent ?',
          answer:
            'Oui, à la salle, en semaine de 9 h 30 à 16 h. L’argent va plus loin pour les produits frais, que nous achetons nous-mêmes.',
        },
        {
          question: 'Le local est-il accessible ?',
          answer:
            'La grande salle et les toilettes sont de plain-pied depuis l’entrée de la rue des Tilleuls. La salle de lecture est à l’étage ; l’aide aux devoirs descend au rez-de-chaussée pour tout enfant qui en a besoin.',
        },
      ],
    },
    whatWeDo: {
      intro: [
        `${name} mène quatre actions depuis l’ancienne bibliothèque de la rue des Tilleuls. Chacune est née parce qu’un voisin avait remarqué qu’il manquait quelque chose, et chacune est portée par des bénévoles, avec un référent bénévole et l’un de nos deux salariés à temps partiel.`,
        'Aucune ne demande à personne de prouver qu’il a besoin d’aide, et aucune n’est payante.',
      ],
      stepsTitle: 'Être aidé chez nous',
      steps: [
        {
          title: 'Venez à la salle',
          text: 'Chaque action est ouverte à toute personne d’Aubrières. Présentez-vous aux horaires indiqués sur chaque page, ou appelez d’abord la salle si vous préférez.',
        },
        {
          title: 'Dites-nous ce qu’il vous faut',
          text: 'Un bénévole vous demande votre prénom et ce qui vous aiderait. Rien n’est noté de plus.',
        },
        {
          title: 'Posez-nous d’autres questions',
          text: 'Si nous ne pouvons pas vous aider, nous savons qui le peut : l’aide aux démarches administratives, au logement et aux droits tient des permanences à la salle avec le CCAS.',
        },
      ],
    },
    events: {
      intro: [
        `Tout ce que ${name} a prévu pour les six prochaines semaines. Presque tout est gratuit et sans inscription ; quand ce n’est pas le cas, la page de l’événement vous explique comment faire.`,
      ],
      hostTitle: 'Vous organisez quelque chose pour la distribution alimentaire ?',
      hostText:
        'Écoles, entreprises et clubs organisent chaque année des collectes et des événements solidaires à notre profit. Dites-nous votre date : nous vous prêtons des caisses, des affiches et un bénévole pour récupérer les dons.',
      hostAction: 'Écrire à l’équipe événements',
      hostSubject: 'Un événement pour la distribution alimentaire',
    },
    volunteer: {
      intro: [
        `${name}, ce sont 312 bénévoles et deux salariés à temps partiel. Les bénévoles préparent les colis, accompagnent les collégiens, bêchent le jardin, trient les vêtements, conduisent la camionnette et siègent au conseil d’administration.`,
        'Nul besoin d’expérience. Chaque nouveau bénévole fait une première séance aux côtés de quelqu’un qui le fait depuis des années. Les bénévoles sont couverts par l’assurance de l’association.',
      ],
      rolesTitle: 'Où vous pourriez aider',
      roles: [
        {
          icon: 'heart',
          title: 'Distribution alimentaire',
          text: 'Jeudi, de 17 h à 20 h. Installer les tables, aider les foyers à choisir, remplir les sacs. Environ 25 bénévoles par semaine.',
          href: '/nos-actions/distribution-alimentaire',
        },
        {
          icon: 'book',
          title: 'Accompagnement aux devoirs',
          text: 'Mardi ou jeudi, de 16 h 15 à 18 h 45, en période scolaire. À partir de 16 ans, avec un extrait de casier judiciaire que nous vous aidons à obtenir.',
          href: '/nos-actions/aide-aux-devoirs',
        },
        {
          icon: 'leaf',
          title: 'Jardin',
          text: 'Samedi, de 9 h 30 à 12 h 30, d’avril à octobre. Bêcher, désherber, arroser et récolter. Enfants bienvenus avec un adulte.',
          href: '/nos-actions/jardin-partage',
        },
        {
          icon: 'gift',
          title: 'Vestiaire solidaire',
          text: 'Lundi, de 9 h 30 à 13 h 30, de septembre à février. Vérifier, trier et accrocher les vêtements, et aider les familles à trouver leur taille.',
          href: '/nos-actions/vestiaire-solidaire',
        },
        {
          icon: 'truck',
          title: 'Chauffeur',
          text: 'Jeudi, de 16 h à 19 h. Récupérer les dons chez les commerçants et porter des colis à 23 foyers qui ne peuvent pas venir jusqu’à la salle. Permis B depuis au moins deux ans.',
        },
        {
          icon: 'users',
          title: 'Administrateur',
          text: 'Six réunions en soirée par an. Nous cherchons un administrateur qui connaît le bâtiment ou l’entretien d’un local.',
        },
      ],
      stepsTitle: 'Comment commencer',
      steps: [
        {
          title: 'Écrivez-nous ou appelez',
          text: `Écrivez à ${c.email('benevoles')} ou appelez le ${PHONE}, et dites-nous ce que vous aimeriez faire et quand vous êtes disponible.`,
        },
        {
          title: 'Venez à une soirée d’accueil',
          text: 'Une fois par mois, une heure et demie dans la salle de lecture avec ceux qui animent chaque action.',
          href: '/agenda/soiree-accueil-benevoles',
        },
        {
          title: 'Faites une première séance aux côtés de quelqu’un',
          text: 'Notre coordinatrice vous associe à un bénévole expérimenté. Ensuite, vous choisissez à quelle fréquence venir.',
        },
      ],
      photoCaption:
        'Là où nous accueillons les nouveaux bénévoles : la salle de lecture, à l’étage.',
      notesTitle: 'Avant votre première séance',
      notes: [
        {
          question: 'Y a-t-il un âge minimum ?',
          answer:
            'Seize ans pour la plupart des missions et dix-huit ans pour la conduite. Les plus jeunes peuvent aider au jardin et lors des collectes avec un parent.',
        },
        {
          question: 'Faut-il un extrait de casier judiciaire ?',
          answer:
            'Seulement pour l’aide aux devoirs. Il s’agit du bulletin n° 3, que vous pouvez demander gratuitement en ligne ; nous vous aidons à le faire.',
        },
        {
          question: 'Faut-il adhérer à l’association ?',
          answer:
            'Non. L’adhésion est ouverte à tous, mais elle n’est pas obligatoire pour être bénévole ; elle donne le droit de voter à l’assemblée générale.',
        },
        {
          question: 'Comment dois-je m’habiller ?',
          answer:
            'Chaussures fermées et vêtements qui peuvent se salir. Nous fournissons tabliers, gants et outils.',
        },
        {
          question: 'Les frais sont-ils remboursés ?',
          answer:
            'Oui. Nous remboursons les frais kilométriques des chauffeurs et les titres de transport à qui le demande, sans justificatif en dessous de 10 €.',
        },
        {
          question: 'Mon entreprise peut-elle venir en équipe ?',
          answer:
            'Oui, pour les collectes alimentaires, les collectes de vêtements et les matinées au jardin, par groupes de douze au plus. Écrivez-nous avec une date.',
        },
      ],
      askTitle: 'Dites-nous que vous voulez aider',
      askText:
        'Notre coordinatrice des bénévoles, Nadia Roussel, répond à chaque message sous deux jours ouvrés.',
      askAction: 'Écrire à l’équipe des bénévoles',
      askSubject: 'Je voudrais devenir bénévole',
      phoneAction: `Appeler le ${PHONE}`,
    },
    donate: {
      intro: [
        `Chaque euro donné à ${name} est dépensé à Aubrières, pour la nourriture, l’aide aux devoirs, le jardin et le vestiaire, et pour garder le local chauffé et ouvert. L’an dernier, 62 % de nos ressources venaient d’habitants de la commune.`,
        'L’association est d’intérêt général : un don vous donne droit à une réduction d’impôt sur le revenu de 66 % de son montant, dans la limite de 20 % de votre revenu imposable. Un don de 30 € ne vous coûte donc que 10,20 €. Nous vous envoyons un reçu fiscal pour chaque don.',
        'Nous ne prenons pas de paiement par carte sur ce site. Voici les façons de donner, et les personnes à qui poser vos questions.',
      ],
      monthlyTitle: 'Donner chaque mois',
      tiers: [
        {
          name: 'Le pain du jeudi',
          price: '5 €',
          interval: 'par mois',
          features: [
            'Paie le pain d’une distribution du jeudi',
            'Après réduction d’impôt, 1,70 € par mois',
          ],
        },
        {
          name: 'Les légumes',
          price: '12 €',
          interval: 'par mois',
          features: [
            'Assure des légumes frais à une famille toute l’année',
            'Après réduction d’impôt, 4,08 € par mois',
          ],
          highlighted: true,
        },
        {
          name: 'Une place à l’aide aux devoirs',
          price: '30 €',
          interval: 'par mois',
          features: [
            'Finance la place d’un enfant, livres et goûters compris',
            'Après réduction d’impôt, 10,20 € par mois',
          ],
        },
      ],
      ways: [
        '## Par virement permanent',
        `Un virement permanent part directement de votre banque vers la nôtre : rien de votre don ne se perd en frais. Écrivez à notre trésorier à [${c.email('tresorier')}](mailto:${c.email('tresorier')}) ou appelez le ${PHONE} : nous vous envoyons nos coordonnées bancaires, une référence et un formulaire de reçu fiscal. Vous mettez en place le virement auprès de votre banque, et vous pouvez l’arrêter à tout moment de la même façon.`,
        '## Par chèque ou en espèces',
        `Libellez vos chèques à l’ordre de ${name} et envoyez-les à ${HALL}, ${HALL_ADDRESS}. Vous pouvez aussi remettre des espèces ou un chèque à la salle, en semaine de 9 h 30 à 16 h et le jeudi soir ; nous vous remettons un reçu pour chaque don.`,
        '## La réduction d’impôt de 66 %',
        'Si vous êtes imposable, vous déduisez 66 % de votre don de votre impôt sur le revenu, dans la limite de 20 % de votre revenu imposable ; l’excédent est reporté sur les cinq années suivantes. Il suffit de joindre à votre déclaration le reçu fiscal que nous vous envoyons. L’an dernier, 1 100 reçus fiscaux ont été émis.',
        '## Adhérer à l’association',
        'L’adhésion coûte 15 € par an (5 € au tarif réduit). Elle donne le droit de voter à l’assemblée générale et d’élire le conseil d’administration. Elle n’est pas nécessaire pour donner ni pour être bénévole.',
        '## Par votre entreprise',
        'Une entreprise qui nous fait un don bénéficie d’une réduction d’impôt de 60 % de son montant, dans les limites fixées par la loi. Elle peut aussi nous prêter des salariés le temps d’une collecte ou d’une matinée au jardin : parlez-en à notre trésorier.',
      ],
      questionsTitle: 'Avant de donner',
      questions: [
        {
          question: 'Puis-je choisir l’action que mon don finance ?',
          answer:
            'Oui. Dites-le-nous en donnant : le trésorier l’affecte à cette action. Un don sans affectation va là où il est le plus utile, en général la distribution alimentaire.',
        },
        {
          question: 'Quelle part de mon don part en frais de collecte ?',
          answer:
            'Trois centimes par euro vont à la collecte de fonds, à la comptabilité et à la vérification des comptes. Le détail complet est sur la page des comptes.',
        },
        {
          question: 'Puis-je donner de la nourriture ou des manteaux à la place ?',
          answer:
            'Oui. Les pages de la distribution alimentaire et du vestiaire indiquent ce qui nous manque le plus ce mois-ci et quand l’apporter.',
        },
        {
          question: 'Comment arrêter un virement permanent ?',
          answer:
            'Auprès de votre banque, comme vous l’avez mis en place. Vous n’avez pas à nous prévenir, même si nous sommes toujours heureux de savoir pourquoi.',
        },
      ],
      askTitle: 'Parler à notre trésorier',
      askText:
        'Notre trésorier, Karim Benali, répond aux questions sur les dons, les reçus fiscaux et le mécénat d’entreprise, en général dans la semaine.',
      askAction: 'Écrire au trésorier',
      askSubject: 'Faire un don à l’association',
      phoneAction: `Appeler le ${PHONE}`,
    },
    finances: {
      intro: [
        `${name} est une association loi 1901, déclarée en 1994 et d’intérêt général. Ses comptes de l’exercice clos le 31 décembre sont vérifiés par deux adhérents, présentés à l’assemblée générale et approuvés par son vote.`,
        'Voici les chiffres de notre dernier rapport d’activité. Un exemplaire imprimé des comptes complets est à la salle, et nous en envoyons un à toute personne qui le demande.',
      ],
      yearTitle: 'L’exercice clos le 31 décembre',
      year: [
        {
          value: '286 400 €',
          label:
            'de ressources, venues de 1 940 particuliers, de 14 entreprises locales et de 6 fondations.',
        },
        {
          value: '271 900 €',
          label: 'dépensés pour les quatre actions, le local et les personnes qui les organisent.',
        },
        {
          value: '68 000 €',
          label:
            'de réserves, soit trois mois de dépenses, comme l’exige notre politique de réserves.',
        },
        {
          value: '21 600',
          unit: 'heures',
          label: 'données par les bénévoles. Nous ne les valorisons pas dans les comptes.',
        },
      ],
      spendingTitle: 'Comment nous l’avons dépensé',
      spending: [
        { value: '38 %', label: 'Produits achetés pour la distribution alimentaire' },
        { value: '17 %', label: 'Le local : chauffage, électricité, travaux, assurance' },
        { value: '12 %', label: 'Aide aux devoirs : livres, ordinateurs, goûters' },
        { value: '11 %', label: 'Le vestiaire, le jardin et les aides d’urgence' },
        {
          value: '10 %',
          label: 'Une coordinatrice et un responsable des bénévoles à temps partiel',
        },
        { value: '9 %', label: 'La camionnette : carburant, assurance et réparations' },
        { value: '3 %', label: 'Collecte de fonds, comptabilité et vérification des comptes' },
      ],
      incomeTitle: 'D’où venait l’argent',
      income: [
        { value: '46 %', label: 'Dons de particuliers, pour la plupart mensuels' },
        { value: '27 %', label: 'Subventions de la commune et de six fondations' },
        { value: '11 %', label: 'Entreprises locales, en argent et en nature' },
        { value: '9 %', label: 'Cotisations des adhérents' },
        { value: '7 %', label: 'Le repas solidaire et les vide-greniers' },
      ],
      notes: [
        '## Pourquoi le local coûte si peu',
        'La commune nous a cédé l’ancienne bibliothèque en 2001 pour un euro symbolique, à charge pour nous de la remettre en état : six années de vide-greniers et de marches solidaires y ont suffi. Nous ne payons donc aucun loyer. Les 17 % que le local coûte, c’est le chauffage d’un bâtiment du XIXe siècle, la toiture et l’assurance.',
        '## Ce pour quoi nous ne dépensons pas',
        'Personne n’est payé pour collecter des fonds, les administrateurs sont bénévoles et ne se font rembourser aucun frais, et nous n’avons pas d’autre bureau que la salle. Quand nous dépensons pour quelque chose de nouveau, le conseil d’administration le décide en réunion, et les comptes rendus sont consultables à la salle.',
      ],
    },
    about: {
      story: [
        `${name} est née l’hiver 1994, quand trois voisins de la rue des Tilleuls, une enseignante retraitée, un conducteur de bus et une infirmière de nuit, ont emprunté une camionnette pour apporter des repas chauds à onze foyers qui n’avaient plus de quoi manger.`,
        'L’hiver suivant, ils étaient quarante bénévoles et disposaient d’une pièce au-dessus de la quincaillerie. En 2001, la commune a cédé à l’association l’ancienne bibliothèque municipale de la rue des Tilleuls, pour qu’aucun propriétaire ne puisse jamais fermer la distribution ; il a fallu six ans de vide-greniers et de marches solidaires pour la remettre en état.',
        'L’aide aux devoirs a ouvert dans la salle de lecture en 2009, le jardin en 2012 et le vestiaire en 2016. Chaque fois, quelqu’un qui venait à la salle avait remarqué qu’il manquait quelque chose et proposé de le lancer.',
      ],
      years: [
        { value: '1994', label: 'La première camionnette de repas chauds' },
        { value: '2001', label: 'L’ancienne bibliothèque cédée à l’association' },
        { value: '4', label: 'Actions ouvertes chaque semaine' },
        { value: '312', label: 'Bénévoles au planning aujourd’hui' },
      ],
      hallCaption:
        'L’ancienne bibliothèque de la rue des Tilleuls, que l’association occupe depuis 2001.',
      people: [
        '## Notre conseil d’administration',
        'Neuf administrateurs bénévoles dirigent l’association. Ils sont élus pour trois ans par l’assemblée générale, et au moins trois d’entre eux sont toujours des bénévoles de terrain. Voici les membres du bureau et quelques administrateurs.',
        '- Hélène Marchand, présidente. Ancienne principale de collège, bénévole à l’aide aux devoirs depuis 2010.',
        '- Karim Benali, trésorier. Expert-comptable dans l’hôpital de la ville.',
        '- Sophie Vasseur, secrétaire. Juriste, et chauffeuse le jeudi.',
        '- Daniel Lefèvre. Dirige une entreprise de bâtiment de la commune et veille sur le local.',
        '- Amina Haddad. Pharmacienne de la place et bénévole à la distribution alimentaire.',
        '- Thomas Garnier. Étudiant, élu par les bénévoles.',
        '## Nos salariés',
        'Nadia Roussel coordonne les actions et Benoît Carpentier gère les bénévoles. Tous deux travaillent trois jours par semaine, et tous deux ont commencé comme bénévoles.',
      ],
      quote:
        'Nous n’avions jamais voulu créer une association. Nous ne supportions simplement pas l’idée qu’un voisin n’ait pas de quoi dîner.',
      quoteAuthor: 'Marguerite Hélin',
      quoteRole: 'L’une des trois fondatrices, en 1994',
      partnersTitle: 'Les organisations avec lesquelles nous travaillons',
    },
    contact: {
      intro: [
        `Le plus simple pour joindre ${name} est d’appeler la salle ou de passer. Il y a toujours quelqu’un en semaine de 9 h 30 à 16 h, et le jeudi soir jusqu’à 20 h.`,
      ],
      ways: [
        {
          icon: 'phone',
          title: `Appeler le ${PHONE}`,
          text: 'En semaine de 9 h 30 à 16 h. Laissez un message le reste du temps : nous rappelons le jour ouvré suivant.',
          href: PHONE_HREF,
        },
        {
          icon: 'mail',
          title: 'Nous écrire',
          text: `${c.email()}, pour toute question. Chaque page d’action donne aussi l’adresse de ceux qui l’animent.`,
          href: `mailto:${c.email()}`,
        },
        {
          icon: 'map-pin',
          title: 'Venir à la salle',
          text: `${HALL}, ${HALL_ADDRESS}. Les bus 14 et 22 s’arrêtent devant ; l’entrée de la rue des Tilleuls est de plain-pied.`,
          href: 'https://www.openstreetmap.org/',
        },
        {
          icon: 'clock',
          title: 'Horaires d’ouverture',
          text: 'Du lundi au vendredi, de 9 h 30 à 16 h. Le jeudi soir, de 17 h 30 à 20 h. Le samedi matin au jardin, d’avril à octobre.',
        },
      ],
      concerns: [
        '## Signaler une inquiétude',
        `Si vous êtes inquiet pour la sécurité d’un enfant ou d’un adulte lors d’une de nos actions, parlez-en à Nadia Roussel, notre référente protection, au ${PHONE}, ou à n’importe quel administrateur. En cas de danger immédiat, appelez le 17 ou le 112 ; pour un enfant en danger, le 119.`,
        `Si vous êtes mécontent de la façon dont nous vous avons traité, écrivez à la présidente à ${HALL}, ${HALL_ADDRESS}. Nous répondons sous dix jours ouvrés.`,
      ],
    },
    privacy: [
      `${name} (association loi 1901) est responsable des données personnelles décrites sur cette page. Vous pouvez nous joindre à ${HALL}, ${HALL_ADDRESS}, ou par courriel à ${c.email('contact')}.`,
      '## Ce que nous conservons',
      '- Pour la distribution alimentaire : un prénom et le nombre de personnes au foyer, sur papier, détruits à la fin de chaque mois.',
      '- Pour les donateurs : nom, adresse et dons effectués, pour établir vos reçus fiscaux.',
      '- Pour les bénévoles : coordonnées, contact en cas d’urgence, séances effectuées et, pour l’aide aux devoirs, la date de remise du bulletin n° 3 du casier judiciaire.',
      '- Pour l’aide aux devoirs : les coordonnées d’un parent et tout ce qu’il nous dit sur la santé ou les difficultés d’apprentissage de l’enfant.',
      '## Pourquoi, et combien de temps',
      'Nous conservons les justificatifs de dons dix ans, durée légale de conservation des pièces comptables. Nous gardons les données des bénévoles pendant leur engagement et un an après. Nous ne vendons ni ne partageons jamais d’informations personnelles, et nous ne les utilisons que pour la raison pour laquelle vous nous les avez confiées.',
      '## Ce site',
      'Ce site ne dépose aucun cookie publicitaire ni de suivi. Si vous choisissez une apparence claire ou sombre, votre navigateur retient ce choix sur votre appareil.',
      '## Vos droits',
      'Vous pouvez à tout moment, et gratuitement, demander à consulter, corriger ou supprimer ce que nous détenons sur vous. Si vous estimez que nous avons mal traité vos données, vous pouvez adresser une réclamation à la CNIL.',
    ],
    legal: [
      `Ce site est édité par ${name}, association loi 1901 déclarée en préfecture en 1994, dont le siège est ${HALL}, ${HALL_ADDRESS}. Vous pouvez nous joindre à ${c.email()} ou au ${PHONE}.`,
      '## Directrice de la publication',
      'La présidente de l’association, Hélène Marchand, est responsable de ce qui est publié ici. Les pages sont rédigées et mises à jour par des bénévoles de l’association.',
      '## Hébergement',
      'Le site est hébergé par un prestataire établi en France, choisi par l’association. Ses coordonnées sont communiquées sur simple demande à l’adresse ci-dessus.',
      '## Photographies',
      'Les photographies de ce site sont utilisées sous licence libre. La page des crédits photo nomme chaque auteur et chaque licence.',
      '## Liens vers d’autres sites',
      'Nous renvoyons vers quelques autres sites, par exemple une carte du local. Nous ne sommes pas responsables de ce qu’ils publient ni de la façon dont ils traitent vos données.',
    ],
    credits: {
      intro: [
        'Les photographies de ce site sont publiées sous licence libre : Creative Commons Zero, domaine public ou Creative Commons Attribution. Elles ont été recadrées et redimensionnées pour ce site. Les logos des organisations partenaires ont été dessinés pour cette démonstration et n’appartiennent à aucune organisation réelle.',
      ],
      licenceWord: 'Licence',
      sourceWord: 'Source',
    },
  }
}

export const ASSOCIATION_COPY_FR: AssociationCopy = {
  locale: 'fr',
  defaultName: 'Les Voisins d’Aubrières',
  identity: {
    phone: PHONE,
    phoneHref: PHONE_HREF,
    address: `${HALL}, ${HALL_ADDRESS}`,
    hall: HALL,
    street: HALL_STREET,
    town: HALL_TOWN,
    registration: 'Association loi 1901 déclarée en 1994, d’intérêt général',
    emailSuffix: 'fr',
    emailFallback: 'voisins',
    mailboxes: { volunteer: 'benevoles', treasurer: 'tresorier', events: 'evenements' },
    mapHref: 'https://www.openstreetmap.org/',
  },
  schema: {
    routes: { event: '/agenda/:slug', programme: '/nos-actions/:slug' },
    labels: {
      event: { singular: 'Événement', plural: 'Événements' },
      programme: { singular: 'Action', plural: 'Actions' },
    },
    fields: {
      starts: 'Début',
      ends: 'Fin',
      place: 'Lieu',
      address: 'Adresse postale',
      summary: 'Résumé',
      when: 'Quand',
      audience: 'Pour qui',
    },
    help: {
      place: 'Le nom de la salle ou du lieu.',
      cost: 'Par exemple « Gratuit » ou « 25 €, 12 € pour les moins de 16 ans ».',
      booking: 'S’il faut s’inscrire, et comment.',
      summary: 'Une ou deux phrases, affichées dans l’agenda.',
      when: 'Par exemple « Jeudi, de 17 h 30 à 19 h 30 ».',
      contact: 'Une adresse électronique ou un numéro de téléphone.',
    },
  },
  pageSlugs: {
    home: 'home',
    whatWeDo: 'nos-actions',
    events: 'agenda',
    volunteer: 'benevolat',
    donate: 'faire-un-don',
    finances: 'comptes-et-finances',
    about: 'notre-histoire',
    contact: 'contact',
    privacy: 'confidentialite',
    legal: 'mentions-legales',
    credits: 'credits-photo',
  },
  programmes: PROGRAMMES,
  events: EVENTS,
  partners: [
    { key: 'partner-fr-college', name: 'Collège Les Tilleuls', file: 'partner-fr-college.png' },
    { key: 'partner-fr-mairie', name: 'Mairie d’Aubrières', file: 'partner-fr-mairie.png' },
    { key: 'partner-fr-delcourt', name: 'Delcourt & Fils', file: 'partner-fr-delcourt.png' },
    { key: 'partner-fr-habitat', name: 'Habitat Aubrières', file: 'partner-fr-habitat.png' },
    { key: 'partner-fr-fondation', name: 'Fondation du Tilleul', file: 'partner-fr-fondation.png' },
    {
      key: 'partner-fr-pharmacie',
      name: 'Pharmacie de la Place',
      file: 'partner-fr-pharmacie.png',
    },
  ],
  media: [
    {
      name: 'hero',
      file: 'hero.jpg',
      alt: 'Un jardin partagé ensoleillé derrière un immeuble, avec une pergola, une serre et des sacs de terreau',
    },
    {
      name: 'programme-food-bank',
      file: 'food-bank.jpg',
      alt: 'Des caisses de petits pois, de pommes, de pommes de terre, de tomates et de citrons, vues du dessus',
    },
    {
      name: 'programme-homework-club',
      file: 'homework-club.jpg',
      alt: 'Des tables de lecture devant une bibliothèque éclairée, prêtes pour l’après-midi',
    },
    {
      name: 'programme-garden',
      file: 'garden-corner.jpg',
      alt: 'Un coin du jardin avec une table en bois, des pots d’aromatiques et un carré potager',
    },
    {
      name: 'event-planting',
      file: 'garden-planting.jpg',
      alt: 'Des voisins qui ratissent la terre d’un long carré potager, un enfant les regarde',
    },
    {
      name: 'programme-coat-bank',
      file: 'coat-bank.jpg',
      alt: 'Des vestes et des chemises accrochées en rang, triées pour le vestiaire solidaire',
    },
    {
      name: 'event-orientation',
      file: 'orientation.jpg',
      alt: 'Une table et des chaises blanches dans une pièce lumineuse au parquet de bois, prêtes pour une réunion',
    },
    {
      name: 'event-supper',
      file: 'supper.jpg',
      alt: 'Des tables dressées avec des verres et des serviettes pour un repas, une bibliothèque au mur derrière elles',
    },
    {
      name: 'hall',
      file: 'hall.jpg',
      alt: 'Une grande salle blanche de bibliothèque, aux fenêtres en ogive, avec des rayonnages et des tables de lecture',
    },
  ],
  pages,
  programmeBlocks: {
    othersTitle: 'Nos autres actions',
    eventOthersTitle: 'Les autres dates à la salle',
  },
  menus: {
    header: [
      { label: 'Nos actions', page: 'whatWeDo' },
      { label: 'Agenda', page: 'events' },
      { label: 'Bénévolat', page: 'volunteer' },
      { label: 'Qui sommes-nous', page: 'about' },
    ],
    action: 'Faire un don',
  },
  footer: [
    {
      heading: 'S’engager',
      links: [
        { label: 'Faire un don', url: '/faire-un-don' },
        { label: 'Devenir bénévole', url: '/benevolat' },
        { label: 'Agenda', url: '/agenda' },
      ],
    },
    {
      heading: 'Nos actions',
      links: [
        { label: 'Distribution alimentaire', url: '/nos-actions/distribution-alimentaire' },
        { label: 'Aide aux devoirs', url: '/nos-actions/aide-aux-devoirs' },
        { label: 'Jardin partagé', url: '/nos-actions/jardin-partage' },
        { label: 'Vestiaire solidaire', url: '/nos-actions/vestiaire-solidaire' },
      ],
    },
    {
      heading: 'L’association',
      links: [
        { label: 'Notre histoire', url: '/notre-histoire' },
        { label: 'Où va l’argent', url: '/comptes-et-finances' },
        { label: 'Nous contacter', url: '/contact' },
        { label: 'Confidentialité', url: '/confidentialite' },
        { label: 'Mentions légales', url: '/mentions-legales' },
        { label: 'Crédits photo', url: '/credits-photo' },
      ],
    },
  ],
  footerNote: (c) =>
    [
      'Association loi 1901 déclarée en 1994, d’intérêt général',
      HALL,
      HALL_STREET,
      HALL_TOWN,
      '',
      PHONE,
      c.email(),
      '',
      'La salle est ouverte du lundi au vendredi, de 9 h 30 à 16 h, et le jeudi soir.',
    ].join('\n'),
  settings: {
    tagline:
      'Alimentation, aide aux devoirs, jardin et vêtements chauds, dans l’ancienne bibliothèque de la rue des Tilleuls.',
  },
  widgets: {
    keepFreeHeading: 'Gratuit pour tous',
    keepFreeBody:
      'Personne ne paie un colis alimentaire, une place à l’aide aux devoirs ou un manteau d’hiver. Avec 12 € par mois, une famille mange des légumes frais toute l’année.',
    keepFreeLabel: 'Faire un don',
    adviceTitle: 'Besoin d’autre chose ?',
    adviceLines: [
      'Des permanences d’aide aux démarches, au logement et aux droits ont lieu à la salle avec le CCAS.',
      'Appelez le [{phone}]({phoneHref}) en semaine : nous vous dirons quand a lieu la prochaine.',
    ],
    weeklyTitle: 'Chaque semaine à la salle',
    handHeading: 'Donnez un coup de main le jour J',
    handBody:
      'Les collectes, les matinées au jardin et le repas solidaire reposent sur les bénévoles. Venez deux heures ou restez toute la journée ; nul besoin d’expérience.',
    handLabel: 'Devenir bénévole',
  },
}
