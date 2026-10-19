import type { PortfolioCopy } from './portfolio-copy.js'
import { frenchTypography } from './portfolio-typography.js'

/**
 * Le blueprint `portfolio` en français. Voir `portfolio-copy.ts` pour la
 * forme. Les textes sont écrits avec des espaces ordinaires ; la typographie
 * française (espaces insécables avant `: ; ? !` et autour des guillemets,
 * séparateur de milliers) est posée en une fois par `frenchTypography`.
 */
export const PORTFOLIO_COPY_FR: PortfolioCopy = frenchTypography<PortfolioCopy>({
  locale: 'fr',
  schema: {
    routes: { project: '/projets/:slug' },
    labels: { singular: 'Projet', plural: 'Projets' },
    taxonomies: {
      client: { name: 'client', singular: 'Client', plural: 'Clients' },
      disciplines: { name: 'disciplines', singular: 'Discipline', plural: 'Disciplines' },
      team: { name: 'collaborateurs', singular: 'Collaborateur', plural: 'Collaborateurs' },
    },
    fields: {
      statement: 'Présentation',
      statementHelp: 'Une ou deux phrases sous le titre de la page du projet.',
      client: 'Client',
      clientHelp: 'Affiché sous la couverture dans les listes de projets.',
      discipline: 'Discipline',
      clientArchive: 'Page du client',
      clientArchiveHelp:
        'Classe le projet sous son client, qui obtient ainsi une page listant tous ses projets avec le studio.',
    },
  },
  pageSlugs: {
    home: 'home',
    work: 'projets',
    studio: 'studio',
    contact: 'contact',
    privacy: 'confidentialite',
    credits: 'credits-photos',
  },
  disciplines: [
    {
      slug: 'paysage',
      name: 'Paysage',
      description:
        'Côtes, vallées, forêts et glaciers, photographiés à l’heure qui leur convient et tirés à la taille qu’ils méritent.',
    },
    {
      slug: 'nature',
      name: 'Nature et vivant',
      description:
        'Oiseaux, plantes et milieux pour des réserves et des parcs, saisis depuis un affût ou des points de vue fixes, pendant une année entière.',
    },
    {
      slug: 'terroirs',
      name: 'Terroirs',
      description:
        'Vignes, vergers et champs pour celles et ceux qui les travaillent : la parcelle, la saison et ce qui y pousse.',
    },
    {
      slug: 'ports-et-industrie',
      name: 'Ports et industrie',
      description:
        'Quais, bateaux et ateliers avant le début de la journée, avec les autorisations et les consignes de sécurité qui vont avec.',
    },
    {
      slug: 'patrimoine',
      name: 'Patrimoine',
      description:
        'Inventaires photographiques de tours, de ponts et de fermes, au niveau d’exigence d’un dossier de restauration.',
    },
    {
      slug: 'expeditions',
      name: 'Sciences et expéditions',
      description:
        'Photographie répétée avec des équipes de recherche : même lieu, même objectif, même heure, année après année.',
    },
  ],
  team: [
    {
      slug: 'mara-lindgren',
      name: 'Mara Lindgren',
      role: 'Associée fondatrice, paysage et expéditions',
    },
    { slug: 'joel-okafor', name: 'Joël Okafor', role: 'Associé, ports et industrie' },
    { slug: 'ines-carvalho', name: 'Inès Carvalho', role: 'Associée, édition et production' },
    { slug: 'tom-reyes', name: 'Tom Reyes', role: 'Tireur et technicien numérique' },
    { slug: 'priya-nair', name: 'Priya Nair', role: 'Photographe, nature' },
    { slug: 'sam-whitford', name: 'Sam Whitford', role: 'Producteur et archiviste' },
    { slug: 'ada-brennan', name: 'Ada Brennan', role: 'Photographe, patrimoine' },
  ],
  projects: [
    {
      slug: 'un-an-sur-l-etang',
      title: 'Un an sur l’étang',
      client: { name: 'Conservatoire de l’étang de Vissan', slug: 'conservatoire-etang-de-vissan' },
      discipline: 'Paysage',
      disciplines: ['paysage', 'nature'],
      team: ['mara-lindgren', 'priya-nair', 'tom-reyes'],
      publishedAt: '2021-06-14T09:00:00.000Z',
      summary:
        'Douze points de vue fixes sur un étang du littoral, photographiés chaque mois pendant un an : l’état de référence dont un conservatoire avait besoin, et l’exposition qui en est sortie.',
      cover: 'lagoon-cover',
      body: () => [
        { h2: 'La commande' },
        {
          p: 'Le Conservatoire de l’étang de Vissan veille sur 1 800 hectares d’eau peu profonde, de roselières et d’anciens salins sur la côte méditerranéenne. Ses gardes connaissent l’étang saison après saison. Ses financeurs, comme la plupart de ses 3 000 adhérents, ne l’avaient jamais vu qu’en été, sur des cartes postales : une nappe bleue et une ligne de collines.',
        },
        {
          p: 'Le conservatoire attendait deux choses d’une seule commande : un état de référence auquel ses scientifiques pourraient revenir dans dix ans, et une exposition pour la maison de l’étang, qui explique pourquoi un étang qui paraît vide en janvier ne l’est pas du tout.',
        },
        { h2: 'Douze lieux, douze mois' },
        {
          p: 'Avec les gardes, nous avons choisi douze points de vue, du bâtiment des anciens salins jusqu’au bout de la digue, et marqué chacun d’un piquet et d’un relèvement à la boussole. Mara Lindgren est revenue à chacun le même matin de chaque mois, avant l’aube, avec le même objectif. Tom Reyes a tiré les épreuves de l’exposition au studio, pour que le gris d’un ciel de janvier ne soit jamais corrigé en bleu de juin.',
        },
        {
          p: 'Les oiseaux relevaient d’un autre métier. Priya Nair a passé six semaines dans un affût au bord de l’eau, à apprendre quand les aigrettes arrivent et où elles se posent. Les portraits de l’année viennent de là.',
        },
        {
          p: 'Les tirages de l’exposition mesurent 1,20 mètre de large, sur papier coton, et sont accrochés sans cadre en une seule ligne sur le mur nord de la maison de l’étang : le visiteur traverse l’année de janvier à décembre. Chaque point de vue porte une petite étiquette avec sa date, son heure et le niveau de l’eau ce matin-là, relevé sur l’échelle des gardes, c’est-à-dire l’information qu’un scientifique voudra dans dix ans.',
        },
        {
          figure: 'lagoon-shore',
          caption: 'Point de vue 7, le chemin de digue, deuxième semaine d’avril.',
          align: 'wide',
        },
        { gallery: ['lagoon-egret', 'lagoon-storm'], layout: 'grid' },
        { h2: 'Résultat' },
        {
          p: 'L’exposition a ouvert à la maison de l’étang en juin 2021, avec quarante tirages et les douze points de vue présentés en grille, mois par mois. La fréquentation a augmenté d’un tiers cet été-là. Chaque mois, un garde se rend désormais à chaque point de vue, à la date prévue, pour refaire le même cadre : c’est l’état de référence que nous voulions voir continuer.',
        },
      ],
    },
    {
      slug: 'vendanges-rang-par-rang',
      title: 'Vendanges, rang par rang',
      client: {
        name: 'Cave coopérative des Hautes-Garrigues',
        slug: 'cave-cooperative-hautes-garrigues',
      },
      discipline: 'Terroirs',
      disciplines: ['terroirs', 'paysage'],
      team: ['mara-lindgren', 'ines-carvalho', 'sam-whitford'],
      publishedAt: '2022-11-07T09:00:00.000Z',
      summary:
        'Trois saisons dans les vignes d’une coopérative de 140 vignerons : la parcelle, la lumière et le travail, photographiés pour un catalogue et pour les étiquettes de ses vins de domaine.',
      cover: 'vines-cover',
      body: () => [
        { h2: 'La commande' },
        {
          p: 'La cave des Hautes-Garrigues réunit 140 vignerons sur les pentes d’un pic calcaire, chacun avec quelques hectares et la même colline en ligne d’horizon. Ses vins étaient bons, ses images ne l’étaient pas : une photo de banque d’images, un coucher de soleil sur des vignes sans nom, servait sur toutes les bouteilles, et les vignerons ont été les premiers à le dire.',
        },
        {
          p: 'La coopérative voulait des photographies de ses propres terres pour un nouveau catalogue, pour les affichettes de sa boutique et pour une gamme de vins de domaine dont les étiquettes porteraient le lieu d’où ils viennent.',
        },
        { h2: 'La parcelle, pas le vigneron' },
        {
          p: 'Nous avons décidé très tôt de photographier des parcelles et non des visages. Le portrait d’un vigneron est le portrait d’un seul vigneron, et la coopérative en compte 140. Chaque parcelle a été parcourue avec son propriétaire, qui nous a montré ce qui comptait : la cabane où l’on range les outils, les platanes qui donnent de l’ombre à midi, le rang où les premiers raisins mûrissent.',
        },
        {
          p: 'Mara Lindgren a travaillé aux deux bouts de la journée, dans l’heure qui suit le lever du soleil et l’heure qui précède le crépuscule, quand la couleur des feuilles fait presque tout le travail. Inès Carvalho a ramené une première sélection de 600 images à 36, avec un groupe de vignerons réunis autour d’une table dans la salle de dégustation de la cave. Chacun a choisi d’abord les photographies de sa propre parcelle.',
        },
        {
          p: 'Le montage a été la partie lente du travail. Pendant trois saisons, Sam Whitford a tenu au mur du studio une carte où chaque parcelle avait son épingle et chaque stade sa couleur, pour que personne ne soit jamais photographié au mauvais moment de sa vigne : le bois nu en février, la floraison en mai, la vendange verte en juillet, la cueillette en septembre. Quand une parcelle n’était pas prête, on passait à la semaine suivante, et le calendrier de la coopérative se pliait à la météo plutôt que l’inverse.',
        },
        {
          figure: 'vines-tree',
          caption: 'La cabane sous les platanes, une parcelle au-dessus du village, en hiver.',
          align: 'wide',
        },
        { gallery: ['vines-shed', 'vines-grapes'], layout: 'grid' },
        { h2: 'Résultat' },
        {
          p: 'Le catalogue a été imprimé à 4 000 exemplaires, et neuf vins de domaine portent aujourd’hui sur leur étiquette une photographie de leur parcelle. La coopérative nous demande de revenir chaque automne, pour photographier les parcelles qui l’ont rejointe dans l’année.',
        },
      ],
    },
    {
      slug: 'le-port-avant-le-jour',
      title: 'Le port avant le jour',
      client: { name: 'Régie du port de Port-Bellon', slug: 'regie-du-port-de-port-bellon' },
      discipline: 'Ports et industrie',
      disciplines: ['ports-et-industrie', 'paysage'],
      team: ['joel-okafor', 'sam-whitford', 'tom-reyes'],
      publishedAt: '2023-04-03T09:00:00.000Z',
      summary:
        'Un port de pêche photographié dans les heures qui précèdent son travail, pour l’inauguration de son quai refait : un livre, vingt-quatre grands tirages pour la nouvelle capitainerie et une série pour la presse.',
      cover: 'port-cover',
      body: () => [
        { h2: 'La commande' },
        {
          p: 'Port-Bellon est un port en activité, avec une flottille de quarante bateaux de pêche, un poste à quai pour le ferry et une marina qui se remplit chaque juillet. En 2022, la régie a reconstruit son quai principal après trois ans de travaux. Pour l’inauguration, elle voulait des photographies qui montrent le lieu à la ville, laquelle avait vu monter les grues sans voir grand-chose d’autre.',
        },
        {
          p: 'Elle avait aussi un besoin très concret : les anciennes images du port avaient dix ans de retard et montraient un quai qui n’existait plus.',
        },
        { h2: 'Avant que la journée commence' },
        {
          p: 'Joël Okafor a proposé de ne photographier le port qu’entre quatre et sept heures du matin. À cette heure-là, les chalutiers sont rentrés, les filets sont sur le quai, le ciel a la couleur de l’eau, et le port a l’ordre d’un lieu qui vient de finir son travail. C’est aussi le seul moment où le quai est assez vide pour qu’on le voie en entier.',
        },
        {
          p: 'Travailler dans un port demande plus de préparation que de photographie. Sam Whitford a obtenu les autorisations, négocié chaque accès avec le capitaine de port et offert à chaque patron, dès la première semaine, un tirage de son propre bateau. C’est la raison pour laquelle on nous a laissés monter sur le quai.',
        },
        {
          p: 'La lumière était l’autre contrainte. Entre quatre et sept heures, le ciel change toutes les quelques minutes, et une même vue ne se réussit qu’une fois. Joël Okafor a travaillé avec deux objectifs et un trépied, jamais au flash, et il est retourné six fois sur un même quai pour l’obtenir par des temps différents : une aube claire pour les chalutiers, un plafond bas pour les grues du quai, une nuit sans vent pour les reflets du bassin. La seule demande du capitaine de port était que rien dans l’image ne paraisse mis en scène.',
        },
        {
          figure: 'port-quay',
          caption:
            'Le quai neuf de nuit, avec le poste du ferry et le phare de l’autre côté du bassin.',
          align: 'wide',
        },
        { gallery: ['port-dusk', 'port-marina'], layout: 'grid' },
        { h2: 'Résultat' },
        {
          p: 'Le livre de soixante-quatre pages a été distribué à chaque foyer de la ville, et les vingt-quatre grands tirages sont accrochés dans la capitainerie, là où les plaisanciers attendent leur place. Deux patrons nous ont depuis demandé de photographier leur bateau pour le vendre.',
        },
      ],
    },
    {
      slug: 'la-foret-sous-la-neige',
      title: 'La forêt sous la neige',
      client: { name: 'Office forestier de Haute-Roche', slug: 'office-forestier-de-haute-roche' },
      discipline: 'Paysage',
      disciplines: ['paysage', 'nature'],
      team: ['priya-nair', 'mara-lindgren'],
      publishedAt: '2023-12-11T09:00:00.000Z',
      summary:
        'Une série d’hiver pour la carte des sentiers et l’information d’une forêt domaniale : quatre promenades photographiées sous la neige et en fin d’automne, les mois où les chemins sont le moins fréquentés.',
      cover: 'forest-cover',
      body: () => [
        { h2: 'La commande' },
        {
          p: 'La forêt de Haute-Roche couvre 9 000 hectares de hêtres, de bouleaux et d’épicéas, parcourus par 140 kilomètres de sentiers balisés. L’été, elle compte plus de promeneurs que l’office ne sait en dénombrer. De novembre à mars, elle n’en a presque plus, et l’office voulait changer cela avec une carte pensée pour les mois calmes.',
        },
        {
          p: 'Il lui fallait des images de quatre promenades qui donnent envie, à quelqu’un qui a un dimanche libre en décembre, de mettre ses chaussures. La carte et les panneaux au départ des sentiers les porteraient.',
        },
        { h2: 'Dans le froid' },
        {
          p: 'Priya Nair a parcouru les quatre itinéraires en novembre, puis après chaque chute de neige jusqu’en février, le plus souvent à la première lumière, par des températures descendues à moins huit. Les images demandent peu à celui qui les regarde : une piste, un bois clair, une branche courbée. La neige efface tout sauf la ligne et la valeur, et le travail a consisté à trouver les endroits où ces lignes valent la peine d’être suivies.',
        },
        {
          p: 'Le froid a dicté la méthode. À moins huit, une batterie perd la moitié de sa charge : Priya en emportait trois, en gardait deux contre elle sous sa veste et les changeait toutes les heures. Elle travaillait avec de fins gants sous des moufles qu’elle ôtait pour chaque image. Elle photographiait dans la première heure qui suit une chute de neige, quand la neige tient encore chaque brindille, et s’arrêtait quand le vent se levait et secouait les branches pour les dégager.',
        },
        {
          figure: 'forest-birch',
          caption: 'La boulaie de la deuxième promenade, après la première neige de l’année.',
          align: 'wide',
        },
        { gallery: ['forest-branches', 'forest-beech'], layout: 'grid' },
        {
          p: 'Le chemin des hêtres date de la dernière semaine de novembre, sans neige encore et avec les feuilles toujours au sol. C’est la seule image de la série sans neige, et l’office a aimé qu’elle montre au promeneur à quoi ressemble vraiment le premier week-end de l’hiver.',
        },
        { h2: 'Résultat' },
        {
          p: 'La carte a été imprimée à 20 000 exemplaires et les quatre photographies sont installées en panneaux au départ des sentiers. Les compteurs de l’office ont enregistré, sur les quatre itinéraires, 38 % de visites hivernales de plus que la saison précédente.',
        },
      ],
    },
    {
      slug: 'la-glace-trois-etes',
      title: 'La glace, trois étés',
      client: {
        name: 'Institut de glaciologie de Valmeyer',
        slug: 'institut-de-glaciologie-de-valmeyer',
      },
      discipline: 'Sciences et expéditions',
      disciplines: ['expeditions', 'paysage'],
      team: ['mara-lindgren', 'sam-whitford', 'tom-reyes'],
      publishedAt: '2024-09-23T09:00:00.000Z',
      summary:
        'De la photographie répétée sur un glacier émissaire pendant trois étés, avec une équipe de recherche : les mêmes onze positions, le même objectif et la même heure, et un livre qui montre jusqu’où la glace a reculé.',
      cover: 'glacier-cover',
      body: () => [
        { h2: 'La commande' },
        {
          p: 'L’Institut de glaciologie de Valmeyer mesure un glacier émissaire depuis 1998, avec des balises, un radar et des satellites. Ce qui lui manquait, c’était un état photographique assez bon pour quelqu’un qui n’a jamais lu un bilan de masse. L’institut nous a demandé d’en faire un, sur trois étés, pendant les semaines où son équipe de terrain est sur la glace.',
        },
        { h2: 'Le même lieu, la même heure' },
        {
          p: 'La photographie répétée n’a de sens que si la deuxième image est faite exactement là où la première l’a été. Lors de la première expédition, Mara Lindgren et l’équipe de terrain ont bâti onze petits cairns sur la moraine, chacun muni d’une plaque d’acier et d’un relèvement à la boussole. Elle est revenue aux cairns les deux étés suivants, avec le même appareil, le même objectif et une copie imprimée du cadre de l’année précédente, tenue contre le viseur jusqu’à ce que les bords coïncident.',
        },
        {
          p: 'Sam Whitford s’est chargé de ce que les images ne montrent pas : le fret pour un mois sur la glace, l’assurance du matériel, un plan médical, et la logistique pour acheminer 140 kilos de caisses jusqu’à un camp qu’on ne rejoint qu’à pied.',
        },
        {
          p: 'La météo décidait du calendrier. Sur la glace, la lumière reste plate pendant des jours puis se dégage pour une heure, et un cadre de reprise doit être fait sous la même lumière que le premier, sinon la comparaison ne veut rien dire. L’équipe a attendu, parfois une semaine, dans un refuge au bord de la moraine, et a fait les onze cadres du troisième été en quatre matinées, avec la base des nuages à la même hauteur que deux ans plus tôt.',
        },
        {
          figure: 'glacier-tongue',
          caption: 'Position 4, vue vers l’aval de la langue glaciaire à la fin du premier été.',
          align: 'wide',
        },
        { gallery: ['glacier-melt', 'glacier-cave'], layout: 'grid' },
        { h2: 'Résultat' },
        {
          p: 'Le livre associe chaque position à ses trois années, de façon qu’il suffise de tourner la page pour voir la glace reculer. L’institut s’en sert dans ses cours, et trois musées universitaires ont montré les onze triptyques. Les cairns sont toujours là, et l’équipe de terrain fait désormais elle-même le quatrième cadre.',
        },
      ],
    },
    {
      slug: 'le-sentier-des-falaises',
      title: 'Le sentier des falaises',
      client: {
        name: 'Parc naturel régional de la Presqu’île',
        slug: 'parc-naturel-regional-de-la-presquile',
      },
      discipline: 'Paysage',
      disciplines: ['paysage', 'nature'],
      team: ['priya-nair', 'ada-brennan'],
      publishedAt: '2025-03-10T09:00:00.000Z',
      summary:
        'Les photographies d’un nouveau sentier de grande randonnée le long des falaises d’un parc régional : huit jours à pied, une image par kilomètre, et un guide qu’on peut lire le soir à l’étape.',
      cover: 'coast-cover',
      body: () => [
        { h2: 'La commande' },
        {
          p: 'Le parc de la Presqu’île a ouvert en 2025 un sentier qui longe sa côte sur 112 kilomètres, d’un village de pêcheurs jusqu’à la pointe de la presqu’île, avec les falaises d’un côté et les criques de l’autre. L’équipe du parc l’avait balisé et relevé. Il lui manquait des images, et un sentier que personne n’a vu ne se parcourt pas.',
        },
        {
          p: 'La commande était un guide pour les randonneurs et une série de photographies pour le site du parc, à réaliser en une seule traversée, afin que les images suivent le chemin comme le ferait un marcheur.',
        },
        { h2: 'Une image par kilomètre' },
        {
          p: 'Priya Nair et Ada Brennan l’ont parcouru en huit jours, à la fin de l’été, chaque journée s’achevant dans un camping choisi par le parc. La règle était d’une image par kilomètre, faite en arrivant à la borne et pas avant, pour que la série ne devienne pas un palmarès des plus beaux points de vue. Certains kilomètres sont ordinaires. Un guide qui ne montrerait que les falaises ne préparerait personne aux longs passages d’herbe sèche qui les séparent.',
        },
        {
          p: 'Les images ont été faites avec un seul objectif, un 35 millimètres, et avec la même discipline d’un bout à l’autre : arriver à la borne, porter l’appareil à l’œil et faire l’image qui est là. Le soir, les deux photographes relisaient sur un petit écran les cadres de la journée de l’autre, sans rien avoir décidé d’avance. Ils ne partageaient que l’ordre, l’heure et la distance, et la maquette du guide, dessinée par Inès Carvalho, suit cet ordre page après page.',
        },
        {
          figure: 'coast-ridge',
          caption: 'La crête au-dessus de la troisième crique, kilomètre 31.',
          align: 'wide',
        },
        { gallery: ['coast-water', 'coast-boats'], layout: 'grid' },
        { h2: 'Résultat' },
        {
          p: 'Le guide compte 96 pages et se glisse dans la poche d’un manteau. Le site du parc présente le sentier sous la forme d’une bande de 112 photographies, et dès la première saison 2 400 personnes en ont parcouru la totalité, deux fois plus que le parc ne l’avait prévu.',
        },
      ],
    },
    {
      slug: 'les-tours-de-garde',
      title: 'Les tours de garde de la haute vallée',
      client: {
        name: 'Fondation du patrimoine des Hautes-Vallées',
        slug: 'fondation-du-patrimoine-des-hautes-vallees',
      },
      discipline: 'Patrimoine',
      disciplines: ['patrimoine', 'paysage'],
      team: ['ada-brennan', 'ines-carvalho', 'sam-whitford'],
      publishedAt: '2025-09-29T09:00:00.000Z',
      summary:
        'Un inventaire photographique de soixante-quatre tours de guet en pierre dans une haute vallée, réalisé au niveau d’exigence d’un dossier de restauration et publié sous la forme d’un livre qu’on lit pour le plaisir.',
      cover: 'towers-cover',
      body: () => [
        { h2: 'La commande' },
        {
          p: 'Dans la haute vallée se dressent soixante-quatre tours de pierre, bâties en six siècles pour surveiller la route et prévenir le village suivant. Certaines sont entières, avec leur toit de pierre à pans. D’autres ne sont plus qu’un mur. La Fondation du patrimoine des Hautes-Vallées voulait toutes les retrouver, relever leur état et demander des fonds de restauration, et son dossier exigeait des photographies auxquelles un expert, dans un bureau lointain, puisse se fier.',
        },
        {
          p: 'Elle espérait aussi que ces mêmes images feraient connaître les tours à des gens qui ne liront jamais un rapport d’état.',
        },
        { h2: 'D’abord la norme, ensuite l’image' },
        {
          p: 'Chaque tour a été photographiée deux fois. D’abord le relevé : quatre vues depuis les points cardinaux à distance fixe, une mire au pied et un détail de chaque ouverture, le tout en lumière plate pour que les fissures et les reprises de joints se lisent. Ensuite l’image, faite le soir, quand la même pierre devient dorée et que la tour se détache du versant.',
        },
        {
          p: 'Ada Brennan a parcouru la vallée en onze jours, en juin, avec un guide local, et Inès Carvalho a monté les deux séries en un seul livre où chaque double page est une tour : le relevé à gauche, l’image à droite.',
        },
        {
          p: 'La vallée demandait autant aux personnes qu’à l’appareil. Certaines tours ne s’atteignent qu’à pied, à deux heures de la dernière piste, et le guide, un ancien berger qui connaît les familles propriétaires, a fait ouvrir des barrières qu’aucune lettre de la fondation n’aurait ouvertes. Plusieurs propriétaires ont demandé à voir les images avant qu’elles soient versées au dossier, et trois ont corrigé une date ou un nom que les registres de la fondation avaient faux.',
        },
        {
          figure: 'towers-single',
          caption: 'Tour 17, sur l’alpage supérieur, vue depuis le sentier.',
          align: 'wide',
        },
        { gallery: ['towers-green', 'towers-valley'], layout: 'grid' },
        { h2: 'Résultat' },
        {
          p: 'La fondation a déposé son dossier avec les relevés en octobre 2025 et a déjà obtenu des fonds pour les neuf premières tours. Le livre, tiré à 2 500 exemplaires, a été réimprimé une fois, et les gîtes de la vallée en offrent un à chacun de leurs hôtes.',
        },
        {
          quote:
            'Un expert nous a dit que c’était le premier dossier où il n’avait pas à deviner l’aspect d’un mur de l’autre côté.',
          author: 'Lucien Marchetti',
          role: 'Directeur, Fondation du patrimoine des Hautes-Vallées',
        },
      ],
    },
  ],
  media: [
    {
      name: 'lagoon-cover',
      file: 'lagoon-cover.jpg',
      alt: 'Le long bâtiment bas d’un ancien salin se reflète dans l’eau immobile d’un étang, avec des touffes de plantes de marais au premier plan',
    },
    {
      name: 'lagoon-shore',
      file: 'lagoon-shore.jpg',
      alt: 'Un chemin de digue bordé d’herbe dorée longe un étang peu profond, avec un brise-lames en pierre et un rivage lointain au lever du jour',
    },
    {
      name: 'lagoon-egret',
      file: 'lagoon-egret.jpg',
      alt: 'Une aigrette garzette se tient sur des rochers sombres, au bord de l’eau',
    },
    {
      name: 'lagoon-storm',
      file: 'lagoon-storm.jpg',
      alt: 'Lever du soleil sous de gros nuages sombres sur un étang calme, avec des ondulations d’algues sur le sable au premier plan',
    },
    {
      name: 'vines-cover',
      file: 'vines-cover.jpg',
      alt: 'Des rangs de vigne jaunissant à l’automne, au pied d’une colline rocheuse à sommet pointu',
    },
    {
      name: 'vines-tree',
      file: 'vines-tree.jpg',
      alt: 'Deux platanes nus et une petite cabane de pierre dans une vigne d’hiver aux ceps taillés',
    },
    {
      name: 'vines-shed',
      file: 'vines-shed.jpg',
      alt: 'Une ancienne tour de moulin en pierre et un bâtiment agricole derrière des rangs de vigne aux couleurs d’automne, sous un ciel d’orage',
    },
    {
      name: 'vines-grapes',
      file: 'vines-grapes.jpg',
      alt: 'Deux grappes de raisin bleu sombre suspendues à un cep, parmi des feuilles vertes',
    },
    {
      name: 'port-cover',
      file: 'port-cover.jpg',
      alt: 'Deux chalutiers amarrés dans un port au coucher du soleil, avec une forêt de mâts de voiliers derrière eux',
    },
    {
      name: 'port-quay',
      file: 'port-quay.jpg',
      alt: 'Un quai pavé de nuit, avec des bidons rouges et un lampadaire, et les lumières d’un ferry et d’un phare de l’autre côté de l’eau',
    },
    {
      name: 'port-dusk',
      file: 'port-dusk.jpg',
      alt: 'Un bassin portuaire au crépuscule sous de lourds nuages, avec des grues, des remorqueurs et un navire éclairé qui se reflète dans l’eau',
    },
    {
      name: 'port-marina',
      file: 'port-marina.jpg',
      alt: 'Des mâts de voiliers et des façades aux teintes pastel le long d’une marina à l’heure bleue, avec un palmier',
    },
    {
      name: 'forest-cover',
      file: 'forest-cover.jpg',
      alt: 'Une piste enneigée qui serpente dans un bois aux arbres chargés de neige',
    },
    {
      name: 'forest-birch',
      file: 'forest-birch.jpg',
      alt: 'Des troncs de bouleaux dans un bois clair, avec des plaques de neige au sol',
    },
    {
      name: 'forest-branches',
      file: 'forest-branches.jpg',
      alt: 'Une branche courbée sous le poids de la neige fraîche',
    },
    {
      name: 'forest-beech',
      file: 'forest-beech.jpg',
      alt: 'Un chemin couvert de feuilles de hêtre rousses entre de grands hêtres nus, sous un soleil bas',
    },
    {
      name: 'glacier-cover',
      file: 'glacier-cover.jpg',
      alt: 'Des blocs de glace bleu et blanc flottent sur un lac glaciaire gris, avec le front du glacier et des montagnes sombres au fond',
    },
    {
      name: 'glacier-tongue',
      file: 'glacier-tongue.jpg',
      alt: 'La glace grise d’une langue glaciaire qui mène à des falaises sombres, sous de lourds nuages',
    },
    {
      name: 'glacier-melt',
      file: 'glacier-melt.jpg',
      alt: 'Un ruisseau de fonte creuse un chenal bleu dans la glace sale d’un glacier',
    },
    {
      name: 'glacier-cave',
      file: 'glacier-cave.jpg',
      alt: 'L’entrée d’une grotte de glace au bord d’un glacier, entre des crêtes de débris sombres',
    },
    {
      name: 'coast-cover',
      file: 'coast-cover.jpg',
      alt: 'Des caps dorés par le soleil bas au-dessus d’une mer sombre et calme, avec un sentier rugueux au premier plan',
    },
    {
      name: 'coast-ridge',
      file: 'coast-ridge.jpg',
      alt: 'Une crête d’herbe sèche piquetée de quelques pins, au-dessus d’une longue côte qui se perd dans la brume',
    },
    {
      name: 'coast-water',
      file: 'coast-water.jpg',
      alt: 'Des rochers calcaires pâles au-dessus d’une eau d’un turquoise intense',
    },
    {
      name: 'coast-boats',
      file: 'coast-boats.jpg',
      alt: 'Un haut promontoire de roche orange au-dessus d’une petite baie remplie de bateaux au mouillage, sous un ciel bleu profond',
    },
    {
      name: 'towers-cover',
      file: 'towers-cover.jpg',
      alt: 'De hautes tours carrées en pierre, coiffées de toits de pierre à pans, dans une vallée de montagne au crépuscule',
    },
    {
      name: 'towers-single',
      file: 'towers-single.jpg',
      alt: 'Une seule tour de pierre étroite sur un versant vert, avec des montagnes et une route de vallée derrière elle',
    },
    {
      name: 'towers-green',
      file: 'towers-green.jpg',
      alt: 'Une fine tour de pierre en ruine contre un ciel nuageux, sur un pâturage de montagne verdoyant',
    },
    {
      name: 'towers-valley',
      file: 'towers-valley.jpg',
      alt: 'Une large vallée de montagne verte, avec une route, des fermes dispersées et un village, vue d’en haut',
    },
  ],
  pages: (studio, mail) => ({
    titles: {
      home: 'Accueil',
      work: 'Projets',
      studio: 'Studio',
      contact: 'Contact',
      privacy: 'Confidentialité et mentions légales',
      credits: 'Crédits photos',
    },
    home: {
      heroTitle: `${studio} photographie les paysages, les ports et les lieux où l’on travaille.`,
      heroSubtitle:
        'Un studio de photographie indépendant de neuf personnes, installé à la Croix-Rousse, à Lyon, qui travaille depuis 2012 pour des réserves naturelles, des parcs régionaux, des vignerons, des ports et des fondations du patrimoine.',
      heroAction: 'Tous les projets',
      workTitle: 'Projets choisis',
      disciplinesTitle: 'Disciplines',
      figuresTitle: 'Depuis 2012',
      figures: [
        { value: '9', label: 'personnes au studio' },
        { value: '143', label: 'commandes réalisées' },
        { value: '26', label: 'clients revenus pour une deuxième commande' },
        { value: '1 900', label: 'grands tirages réalisés et accrochés' },
      ],
      quote: {
        text: 'Ils ont parcouru le sentier avant de faire la moindre image, et le guide se lit comme s’ils l’avaient parcouru avec chaque visiteur.',
        author: 'Élodie Duval',
        role: 'Responsable de l’accueil du public, Parc naturel régional de la Presqu’île',
      },
      clientsTitle: 'Clients',
      clients: [
        'Cave coopérative des Hautes-Garrigues',
        'Conservatoire de l’étang de Vissan',
        'Fondation du patrimoine des Hautes-Vallées',
        'Institut de glaciologie de Valmeyer',
        'Musée de la mer de Marenne',
        'Office forestier de Haute-Roche',
        'Parc naturel régional de la Presqu’île',
        'Prud’homie de pêche de Saint-Aubin',
        'Régie du port de Port-Bellon',
      ],
      indexTitle: 'Index',
      ctaTitle: 'Nouvelle commande',
      ctaText:
        'Dites-nous ce que vous voulez montrer, où et pour quand. Mara Lindgren répond à chaque demande sous deux jours ouvrés.',
    },
    work: { disciplinesTitle: 'Par discipline' },
    studio: {
      about: [
        { h2: 'Le studio' },
        {
          p: `${studio} est un studio de photographie de neuf personnes, installé à la Croix-Rousse, à Lyon. Mara Lindgren l’a fondé en 2012, après dix ans passés à faire des images pour d’autres studios et pour des agences ; trois associés le dirigent depuis 2018.`,
        },
        {
          p: 'Nous travaillons pour des institutions qui prennent soin d’un lieu : réserves naturelles, parcs régionaux, ports, coopératives de vignerons et fondations du patrimoine. La plupart des commandes sont des ensembles à construire sur une saison ou sur une année, et beaucoup se terminent par un livre, une exposition et une série d’images à l’usage du client.',
        },
        {
          p: 'Le studio reste petit, volontairement. Le ou la photographe qui rencontre un client suit la commande jusqu’à sa livraison, et chacun, ici, édite, tire et légende ses propres images.',
        },
      ],
      how: [
        { h2: 'Notre manière de travailler' },
        {
          p: 'Une commande commence par une visite. Avant de faire une image, nous parcourons le lieu avec celles et ceux qui le connaissent, un garde, un vigneron, un capitaine de port, et nous leur demandons ce que les visiteurs ne voient jamais. La plupart de nos meilleurs points de vue ont été choisis par quelqu’un qui travaille sur place.',
        },
        {
          p: 'Nous photographions lentement et nous éditons sévèrement. Une commande de trois cents images est ramenée à trente avec le client dans la pièce, et celles que nous écartons restent aux archives, légendées, pour qui en aura besoin dans dix ans.',
        },
        {
          p: 'Puis nous remettons le travail comme il se doit : tirages calibrés, fichiers en trois tailles avec leurs légendes intégrées, une note de droits rédigée en langage clair, et la liste précise du lieu et de la date de chaque image.',
        },
      ],
      principlesTitle: 'Principes',
      principles: [
        {
          title: 'Parcourir d’abord',
          text: 'Nous visitons chaque lieu avant de le photographier, avec les personnes qui y travaillent. L’image vient ensuite.',
        },
        {
          title: 'Revenir au même endroit',
          text: 'Un point de vue photographié douze fois en dit plus que douze points de vue photographiés une fois.',
        },
        {
          title: 'Tirer sur le vrai papier',
          text: 'Les tirages sont faits dans notre propre atelier sur papier coton, et comparés au fichier sous une lampe lumière du jour. Un écran flatte tout.',
        },
        {
          title: 'Tout légender',
          text: 'Chaque image quitte le studio avec son lieu, sa date et son heure, pour rester utile quand nous ne serons plus là pour l’expliquer.',
        },
      ],
      numbersTitle: 'Le studio en chiffres',
      numbers: [
        { value: '2012', label: 'Fondation' },
        { value: '9', label: 'Personnes' },
        { value: '3', label: 'Associés' },
        { value: '143', label: 'Commandes réalisées' },
        { value: '12', label: 'Pays photographiés' },
      ],
      partnersTitle: 'Associés',
      partners: [
        {
          slug: 'mara-lindgren',
          name: 'Mara Lindgren',
          text: 'Associée fondatrice. Paysage et expéditions. Avant de créer le studio, elle a photographié pour un service de secours en montagne et pour deux équipes de recherche polaire.',
        },
        {
          slug: 'joel-okafor',
          name: 'Joël Okafor',
          text: 'Associé depuis 2018. Ports et industrie. Il enseigne la photographie documentaire un jour par semaine dans une école d’art de Lyon.',
        },
        {
          slug: 'ines-carvalho',
          name: 'Inès Carvalho',
          text: 'Associée depuis 2018. Édition et production. Elle a été directrice photo d’une maison d’édition à Lisbonne pendant huit ans avant de nous rejoindre.',
        },
      ],
      testimonial: {
        text: 'Les vignerons de la cave reconnaissent leurs parcelles dans chaque image, et c’est pour cela qu’ils s’en servent.',
        name: 'Hélène Roux',
        role: 'Directrice, Cave coopérative des Hautes-Garrigues',
      },
      faqTitle: 'Travailler avec nous',
      faq: [
        [
          'Comment commence une commande ?',
          'Par une conversation et un cahier des charges écrit, le plus souvent après une visite du lieu. Nous envoyons ensuite une proposition à prix fixe pour la première étape, qui comprend la visite et un court essai, afin que le client puisse s’arrêter là si nous ne sommes pas faits pour travailler ensemble.',
        ],
        [
          'Combien coûte une commande ?',
          'Une commande d’une journée démarre autour de 2 500 €. Une série réalisée sur une saison démarre autour de 18 000 €, et une commande sur une année, avec un livre ou une exposition, autour de 45 000 €. Nous donnons ces ordres de grandeur parce qu’une première conversation se passe mieux quand chacun les connaît.',
        ],
        [
          'À qui appartiennent les images ?',
          'Nous conservons le droit d’auteur, et le client reçoit une licence pour les usages prévus dans la commande, dont l’impression, le web et l’exposition, sans date de fin. Un client qui a besoin de détenir lui-même les droits, un organisme public par exemple, peut les acquérir : nous le chiffrons à part.',
        ],
        [
          'Travaillez-vous hors de France ?',
          'Plus de la moitié de nos commandes se font à l’étranger, surtout en Islande et en Italie. Nous voyageons pour le travail et revenons à Lyon pour éditer et tirer.',
        ],
        [
          'Proposez-vous des stages ?',
          'Deux stages rémunérés par an, en janvier et en juillet. Nous répondons à chaque candidature.',
        ],
      ],
    },
    contact: {
      ctaTitle: 'Nouvelles commandes',
      ctaText:
        'Écrivez à Mara Lindgren pour lui dire ce que vous voulez montrer, où et pour quand. Elle répond à chaque demande sous deux jours ouvrés.',
      phoneLabel: 'Téléphone : 04 65 71 00 84',
      phoneHref: 'tel:+33465710084',
      visit: [
        { h2: 'Nous rendre visite' },
        { p: '2e étage, 14 rue Saint-Polycarpe, 69001 Lyon.' },
        {
          p: 'Le studio est à dix minutes à pied de la station de métro Croix-Paquet. Nous montrons volontiers des tirages et des travaux en cours, sur rendez-vous, du lundi au jeudi.',
        },
      ],
      jobs: [
        { h2: 'Recrutement' },
        {
          p: `Nous recrutons un ou une photographe ou technicien la plupart des années, en général au printemps, et nous cherchons des personnes qui savent éditer leurs propres images et rédiger une légende claire. Envoyez une courte lettre et un portfolio de vingt images au plus à ${mail.jobs}.`,
        },
      ],
      press: [
        { h2: 'Presse' },
        {
          p: `Pour obtenir des images de nos projets et l’autorisation de les reproduire, écrivez à Inès Carvalho à ${mail.press}. Merci de nous indiquer où les images paraîtront.`,
        },
      ],
    },
    privacy: [
      { h2: 'Mentions légales' },
      {
        p: `${studio} SAS, société au capital de 10 000 €, immatriculée au RCS de Lyon sous le numéro 531 000 184. Siège social : 2e étage, 14 rue Saint-Polycarpe, 69001 Lyon. Directrice de la publication : Mara Lindgren.`,
      },
      { h2: 'Confidentialité' },
      {
        p: 'Ce site ne dépose aucun cookie publicitaire ni de suivi. Il compte les visites sans rien enregistrer qui permette de vous identifier.',
      },
      {
        p: `Si vous nous écrivez, nous conservons votre message et votre adresse le temps nécessaire pour vous répondre et garder la trace des travaux que nous faisons ensemble, et nous ne les transmettons à personne. Pour consulter ou faire supprimer ce que nous détenons à votre sujet, écrivez à ${mail.hello}.`,
      },
    ],
    credits: {
      intro: [
        {
          p: 'Les photographies de ce site proviennent de Wikimedia Commons, où leurs auteurs les ont publiées sous licence Creative Commons ou dans le domaine public. Nous les remercions. Elles ont été recadrées et redimensionnées pour le web.',
        },
        {
          p: 'Les commandes, les clients et les personnes cités dans ces pages sont inventés pour les besoins de l’exemple.',
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
      home: 'Accueil',
      work: 'Projets',
      studio: 'Studio',
      contact: 'Contact',
      privacy: 'Confidentialité',
      credits: 'Crédits photos',
    },
  },
  settings: {
    tagline: 'Paysage, nature, ports et patrimoine.',
    footerNote:
      '2e étage, 14 rue Saint-Polycarpe, 69001 Lyon. Visites du studio sur rendez-vous, du lundi au jeudi.',
  },
  widgets: {
    disciplines: 'Disciplines',
    clients: 'Clients',
    team: 'Le studio',
    moreWork: 'Autres projets',
    ctaTitle: 'Nouvelle commande',
    ctaHeading: 'Dites-nous ce que vous voulez montrer.',
    ctaBody: 'Où, et pour quand : Mara Lindgren répond à chaque demande sous deux jours ouvrés.',
    ctaLabel: 'Lancer une commande',
  },
})
