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
 * « de Le Courrier » et « à Le Courrier » ne se disent pas : le nom que la
 * personne a donné à son magazine peut commencer par un article.
 */
function contract(name: string, preposition: 'de' | 'à'): string {
  const article = /^(le|les) /i.exec(name)
  if (article === null) return `${preposition} ${name}`
  const rest = name.slice(article[0].length)
  const plural = article[1]?.toLowerCase() === 'les'
  if (preposition === 'de') return plural ? `des ${rest}` : `du ${rest}`
  return plural ? `aux ${rest}` : `au ${rest}`
}
const du = (name: string): string => contract(name, 'de')
const au = (name: string): string => contract(name, 'à')

/**
 * Le `magazine` en français : un magazine indépendant d’actualité et de
 * culture pour Belmarais, une ville moyenne de fiction. La ville, ses
 * institutions et chaque personne citée sont inventées ; les photographies
 * montrent des lieux du même genre, jamais les lieux nommés (voir
 * `magazine-credits.ts`).
 */

export const DEFAULT_PUBLICATION_NAME_FR = 'Le Méridien'

export const MAGAZINE_DEMO_SECTIONS_FR: readonly MagazineDemoSection[] = [
  {
    name: 'Actualité',
    slug: 'news',
    description: 'La mairie, les écoles, les transports, le logement et la justice.',
  },
  {
    name: 'Économie',
    slug: 'business',
    description:
      'Les entreprises, les salariés et les décisions immobilières qui font l’économie locale.',
  },
  {
    name: 'Culture',
    slug: 'culture',
    description:
      'Critiques et reportages sur l’art, le théâtre, la musique et la table de la ville.',
  },
  {
    name: 'Opinions',
    slug: 'opinion',
    description: 'Des chroniqueurs et des lecteurs qui vivent ici et débattent de bonne foi.',
  },
]

export const MAGAZINE_DEMO_AUTHORS_FR: readonly MagazineDemoAuthor[] = [
  { name: 'Aïcha Benali', slug: 'aicha-benali' },
  { name: 'Thibault Lemaire', slug: 'thibault-lemaire' },
  { name: 'Samuel Koné', slug: 'samuel-kone' },
  { name: 'Prisca Rey', slug: 'prisca-rey' },
  { name: 'Olivier Mercier', slug: 'olivier-mercier' },
  { name: 'Célia Marchetti', slug: 'celia-marchetti' },
  { name: 'Jonas Feldmann', slug: 'jonas-feldmann' },
  { name: 'Lucie Ferrer', slug: 'lucie-ferrer' },
  { name: 'Nadia Haddad', slug: 'nadia-haddad' },
  { name: 'Gabriel Orsini', slug: 'gabriel-orsini' },
  { name: 'Esther Kowalski', slug: 'esther-kowalski' },
  { name: 'Marc Delbos', slug: 'marc-delbos' },
]

// ---------------------------------------------------------------------------
// Le journalisme, du plus ancien au plus récent
// ---------------------------------------------------------------------------

export const MAGAZINE_DEMO_ARTICLES_FR: readonly MagazineDemoArticle[] = [
  {
    title: 'Permis de louer : ce que la nouvelle règle change pour les petits bailleurs',
    slug: 'permis-de-louer-petits-bailleurs',
    kicker: 'Logement',
    excerpt:
      'La délibération qui entre en vigueur le 1er novembre a été pensée pour les grands bailleurs. Ses 40 € de frais de dossier toucheront aussi quelque 1 200 personnes qui louent un sous-sol ou un studio de jardin.',
    section: 'business',
    authors: ['olivier-mercier'],
    publishedAt: '2026-08-24T07:00:00.000Z',
    frontPage: false,
    body: ({ siteName }) => [
      prose(
        p(
          'Le débat sur le permis de louer, à Belmarais, a surtout porté sur les grands immeubles : visite annuelle, registre public des propriétaires, amendes pour les logements non déclarés. La disposition qui concernera le plus de monde tient en quelques lignes, à l’article 4.',
        ),
        p(
          'Cet article impose à tout propriétaire qui met en location plus d’un logement de déclarer chacun d’eux et de verser 40 € de frais de visite par an, quelle que soit la taille du bien. Selon l’Office municipal du logement, environ 1 200 habitants louent un sous-sol, un studio sur cour ou la seconde moitié d’un pavillon où ils vivent eux-mêmes, et la plupart n’ont jamais rien déclaré à la ville.',
        ),
        p(
          `Une note de service que ${siteName} a pu consulter qualifie ce chevauchement de « contrepartie acceptable pour combler le retard de déclaration ». Elle n’estime pas combien de petits bailleurs pourraient renoncer à louer plutôt que de se déclarer.`,
        ),
        p(
          'Les défenseurs du logement ne s’accordent pas sur la réponse. Théo Wéry, de la Coalition pour le logement de la Rive-Est, s’attend à un effet limité. « Quarante euros, c’est moins qu’une journée de loyer pour un sous-sol », dit-il. Maria Castellanos, qui anime une permanence juridique pour les locataires aux Tanneries, est moins sûre. La déclaration déclenche aussi une visite, et beaucoup de vieux sous-sols devraient recevoir une fenêtre de secours ou une installation électrique neuve pour la passer.',
        ),
        p(
          '« Certains logements seront remis aux normes, et c’est tant mieux, dit-elle. D’autres sortiront du marché, et leurs occupants ne retrouveront rien de moins cher. »',
        ),
        h2('Ce que les petits bailleurs doivent faire'),
        p(
          'La déclaration ouvre le 1er octobre sur le site de la ville et au guichet des permis, au deuxième étage de l’hôtel de ville. Les bailleurs qui se déclarent avant le 31 janvier ne paient pas leur première visite. Un logement qui échoue à la visite dispose de 90 jours pour être mis en conformité avant qu’une amende ne s’applique.',
        ),
        p(
          'La ligne téléphonique de l’Office du logement a reçu, en deux semaines, plus d’appels sur ces 40 € que sur tout le reste d’une délibération de soixante pages, d’après l’un des agents qui y répondent.',
        ),
      ),
    ],
  },
  {
    title: 'Deux bibliothèques ouvertes jusqu’à 21 heures pendant un an, et on compte qui vient',
    slug: 'bibliotheques-ouvertes-le-soir-et-compter',
    kicker: 'Marc Delbos',
    excerpt:
      'Le conseil des bibliothèques veut fermer les antennes des Hauts-de-Lanne et de la Rive-Est pour faire des économies. Une expérience moins coûteuse dirait à la ville ce que valent ces deux bâtiments.',
    section: 'opinion',
    authors: ['marc-delbos'],
    publishedAt: '2026-08-25T07:00:00.000Z',
    frontPage: false,
    body: ({ siteName }) => [
      prose(
        p(
          'Le conseil des bibliothèques de Belmarais envisage de fermer deux antennes, celles des Hauts-de-Lanne et de la Rive-Est, pour combler un trou de 2,1 millions d’euros dans son budget. Avant qu’il ne vote, en novembre, je voudrais qu’il essaie l’inverse pendant un an.',
        ),
        p(
          'Garder les deux antennes ouvertes jusqu’à 21 heures en semaine, compter qui entre après dix-huit heures, et publier les chiffres chaque mois. Les heures de personnel supplémentaires coûteraient environ 380 000 € par an, d’après les chiffres que la bibliothèque a elle-même publiés pour une proposition semblable en 2023. C’est une fraction des économies recherchées, et un prix modeste pour obtenir des preuves.',
        ),
        p(
          'J’ai enseigné en classe de quatrième au collège des Hauts-de-Lanne pendant vingt-six ans. L’antenne, de l’autre côté de la rue, était l’endroit où mes élèves allaient quand la maison était bruyante, froide ou vide. Elle ferme aujourd’hui à 18 heures, c’est-à-dire à peu près quand leurs parents finissent de travailler.',
        ),
        p(
          'Les chiffres du conseil comptent 88 000 entrées l’an dernier aux Hauts-de-Lanne, malgré des horaires réduits. Ils ne disent rien de ceux qui sont restés dehors parce que les portes étaient déjà closes quand ils ont pu venir.',
        ),
        p(
          'Un bibliobus qui passe deux fois par semaine est un bon service pour un quartier qui a déjà son antenne. C’est un mauvais remplaçant pour un bâtiment chauffé, avec internet gratuit, où un enfant de treize ans peut aller à pied un mercredi.',
        ),
        p(
          'Les horaires du soir répondraient aussi à une question que le conseil ne s’est jamais posée : qui fréquente une bibliothèque quand elle est ouverte aux heures où les actifs sont libres ? Deux réseaux de la région restent ouverts jusqu’à 20 heures, et tous deux disent que leur heure de plus forte affluence est celle qui suit le dîner.',
        ),
        p(
          'Faites l’expérience. Si personne ne vient après dix-huit heures, le conseil aura sa réponse, et j’écrirai une chronique pour le reconnaître.',
        ),
        p(
          `*Marc Delbos a enseigné au collège des Hauts-de-Lanne de 1994 à 2020 et écrit pour ${siteName}.*`,
        ),
      ),
    ],
  },
  {
    title: 'La radio associative a enfin trouvé son animateur de nuit',
    slug: 'radio-associative-animateur-de-nuit',
    kicker: 'Radio',
    excerpt:
      'Pendant deux ans, un infirmier de nuit a sauvé l’antenne de Radio Vieux-Port chaque fois que la programmation automatique plantait. Cette saison, la station lui a donné ces heures pour de bon.',
    section: 'culture',
    authors: ['samuel-kone'],
    publishedAt: '2026-08-26T07:00:00.000Z',
    frontPage: false,
    body: () => [
      prose(
        p(
          'Pendant deux ans, chaque fois que la programmation automatique de Radio Vieux-Port plantait en pleine nuit, la station restait muette quelques minutes, puis revenait avec une voix humaine. Cette voix était celle de Karim Doucet, infirmier de nuit au centre hospitalier de Belmarais, qui habite à trois rues du studio et en possède une clé.',
        ),
        p(
          'Ce mois-ci, la station bénévole, qui émet sur 91,3 MHz depuis un ancien débarras converti, au-dessus du centre social de la Rive-Est, lui a confié le créneau de 1 h à 5 h, le jeudi soir. Il n’est pas rémunéré, comme tous les autres programmes de la grille, et il est à lui.',
        ),
        p(
          'Il compte y passer l’essentiel d’une collection de 3 000 disques qu’un ancien animateur a donnée en 2019 et que personne n’a eu le temps de répertorier. « Je vais les jouer dans l’ordre où ils sortent des cartons, dit Karim Doucet, et découvrir ce qu’on a. » Sa première lettre est déjà arrivée, d’un auditeur qui travaille de nuit sur le port et réclame davantage de jazz.',
        ),
        p(
          'L’émission de nuit est l’une des quatre nouveautés de la saison. Les autres sont un journal en espagnol réalisé par deux étudiants en journalisme de l’IUT, une heure de maquettes envoyées par des groupes locaux, et une série de récits de vie d’habitants arrivés en ville comme réfugiés. Trois émissions anciennes s’arrêtent, dont un programme sportif avec appels d’auditeurs qui, selon la directrice de la station, Claire Anselme, n’avait pas reçu un seul appel en onze mois.',
        ),
        p(
          'La station vit avec environ 40 000 € par an, en grande partie collectés lors d’une unique campagne de dons, chaque printemps. Claire Anselme dit que la nouvelle grille a été construite autour d’une règle : aucune émission n’est diffusée sans qu’un second bénévole soit formé pour la tenir.',
        ),
        p(
          '« Nous avons perdu deux programmes de la mauvaise façon, quand la seule personne qui savait les faire est partie, dit-elle. Karim a déjà formé son remplaçant. »',
        ),
      ),
    ],
  },
  {
    title: 'Le projectionniste qui gardait quarante ans d’histoire du cinéma dans son garage',
    slug: 'projectionniste-notes-de-cabine-eden',
    kicker: 'Archives',
    excerpt:
      'Chaque film projeté à l’Éden entre 1963 et 2003 a laissé une page dactylographiée de notes. Francis Delorme les a toutes gardées, et l’université de Belmarais a accepté de les accueillir.',
    section: 'culture',
    authors: ['celia-marchetti'],
    publishedAt: '2026-08-28T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'archive-stacks',
      caption:
        'Rayonnages d’un magasin d’archives universitaire, où les papiers de l’Éden seront répertoriés.',
    },
    body: () => [
      prose(
        p(
          'Pendant quarante ans, chaque film passé à l’Éden, rue des Tanneries, a reçu une page dactylographiée. Elle donnait le titre, les dates de l’exploitation et le nombre de bobines, suivis de quelques lignes pour le projectionniste de service : la bobine où le son décroche, le changement qui arrive trop tôt, la copie rayée sur toute sa seconde moitié.',
        ),
        p(
          'Personne n’avait demandé de les garder. Quand l’Éden a fermé, en 2003, son propriétaire a dit au personnel d’emporter ce qu’il voulait avant le vidage du bâtiment. Francis Delorme, qui travaillait en cabine depuis 1971, a emporté les classeurs.',
        ),
        p(
          'Ils sont restés dans son garage de la Rive-Est pendant vingt et un ans. Le mois dernier, la bibliothèque universitaire de Belmarais a accepté de répertorier et de numériser l’ensemble, qui remplit 61 cartons et compte un peu moins de 9 000 pages.',
        ),
        h2('La trace de ce qui a échoué'),
        p(
          'L’archiviste Théodora Vuković a passé trois week-ends de ce printemps à trier les papiers sur la table de cuisine de Francis Delorme avant de recommander à la bibliothèque de les prendre. Ce qui fait la valeur de la collection, dit-elle, c’est la trace des films dont plus personne ne se souvient.',
        ),
        p(
          '« Les succès sont documentés partout, dit-elle. Ce qu’on ne trouve presque jamais, c’est la trace des films sortis un vendredi, vus par quarante personnes et partis le mardi. Francis les a notés aussi, parce que quelqu’un devait bien monter la bobine. »',
        ),
        p(
          'On y trouve une série de westerns italiens à l’été 1968, un film de guerre resté deux soirs à l’affiche en 1974 pour 83 spectateurs en tout, et des dizaines de copies de distributeurs régionaux qui ne figurent dans aucun catalogue national. Théodora Vuković a relevé des notes sur 214 films dont elle n’a pu retrouver aucune autre trace publiée.',
        ),
        p(
          'Le plus ancien classeur, qui date des années où l’Éden ne projetait qu’en soirée, montre à quel point le métier tenait aux gens : les changements de bobine y sont parfois suivis d’une remarque sur le temps, parce qu’un orage, certains soirs, faisait sauter le projecteur. D’autres pages portent, à l’encre, les noms de ceux qui se sont succédé en cabine, vingt-trois en tout, dont deux femmes, la première arrivée en 1979.',
        ),
        p(
          'Les pages disent aussi comment l’Éden a changé. Les notes du début des années 1960 décrivent des doubles programmes et des actualités. À la fin des années 1970, elles évoquent une seconde salle aménagée dans l’ancien balcon, et en 1990 presque chaque page porte un avertissement sur la nouvelle machine à pellicule qui rayait les copies neuves.',
        ),
        h2('La cabine, par écrit'),
        p(
          'Les notes sont aussi un récit du métier lui-même. Francis Delorme et ses collègues y consignaient les bobines arrivées abîmées, les distributeurs qui envoyaient les copies trop tard pour une séance d’essai et, en 1977, un récit de deux pages sur un incendie dans la salle de rembobinage qui a fermé la cabine pendant onze jours.',
        ),
        p(
          'Il a commencé comme ouvreur à seize ans et il est monté en cabine quand le premier projectionniste s’est cassé le poignet. Il a appris à coller la pellicule sur le tas, raconte-t-il, auprès d’un homme qui gardait une lame de rasoir dans la poche de sa chemise et la liste de tous les films qu’il avait jamais montés.',
        ),
      ),
      pullQuote(
        'Personne ne m’a jamais demandé de les garder. Je ne pouvais pas les jeter, voilà tout.',
        'Francis Delorme',
        'Projectionniste à l’Éden de 1971 à 2003',
      ),
      prose(
        p(
          'La bibliothèque universitaire prévoit d’ouvrir la collection aux chercheurs au printemps, et de numériser les pages au fil de leur catalogage. Une exposition est envisagée pour l’automne, à condition de trouver un lieu qui accepte l’odeur : les classeurs sentent encore le garage.',
        ),
        p(
          'Le catalogage devrait occuper deux archivistes pendant dix-huit mois. L’université a obtenu 45 000 € de la région pour l’opération, et cherche encore un financement pour la numérisation des pages les plus fragiles, celles que l’humidité du garage a collées entre elles.',
        ),
        p(
          'À l’automne, Francis Delorme sera invité à la présentation du fonds. Il a déjà prévenu qu’il n’y parlerait pas longtemps : « Les films, c’est l’affaire des autres. Mes notes, c’est juste ce que je voyais depuis la cabine. » Les archivistes comptent bien le convaincre de lire quelques pages à voix haute, ne serait-ce que celle de l’incendie de 1977.',
        ),
        p(
          'Francis Delorme, lui, dit qu’il se sent plus léger. « Pendant vingt ans, j’ai garé ma voiture dehors pour laisser la place à ces papiers, dit-il. Cet hiver, je la rentrerai. »',
        ),
      ),
    ],
  },
  {
    title: 'Les rames du matin sont pleines. Celles de la mi-journée roulent presque à vide',
    slug: 'rames-du-matin-pleines-midi-vides',
    kicker: 'Transports',
    excerpt:
      'La fréquentation de la ligne A du tramway a retrouvé son niveau d’avant 2020 entre 7 h 15 et 8 h 30. Le reste de la journée, les rames circulent aux deux tiers vides.',
    section: 'business',
    authors: ['olivier-mercier'],
    publishedAt: '2026-08-29T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'empty-tram-stop',
      caption: 'Un arrêt de quai à la mi-journée, entre la pointe du matin et celle du soir.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'À 7 h 52, la rame pour le centre-ville s’arrête aux Hauts-de-Lanne avec les dernières places debout. À 11 h 30, elle passe presque vide, et la conductrice dit qu’elle a pris l’habitude de compter les voyageurs à voix haute pour ne pas perdre le fil.',
        ),
        p(
          'Les chiffres du Syndicat des transports de Belmarais, que le syndicat a publiés à la demande de plusieurs élus, confirment l’impression des usagers. Entre 7 h 15 et 8 h 30, la ligne transporte autant de monde qu’en 2019. Entre 10 h et 15 h, elle en transporte un peu plus du tiers.',
        ),
        p(
          'Le syndicat y voit une conséquence du télétravail, qui s’est installé le mardi, le mercredi et le jeudi pour une partie des salariés du centre. Les commerçants du centre y voient autre chose : une ville où l’on ne vient plus faire ses courses en tramway, faute d’une offre à des horaires qui aient du sens.',
        ),
        p(
          'La question est de savoir quoi faire d’une ligne qui doit être calibrée pour deux heures de pointe et qui coûte le même prix toute la journée. Le syndicat étudie une grille où une rame sur deux serait supprimée entre 10 h et 15 h, ce qui économiserait environ 900 000 € par an.',
        ),
        p(
          `Les usagers consultés par ${siteName} ne sont pas tous contre, mais ils posent une condition : que la fréquence ne tombe pas sous une rame toutes les vingt minutes, seuil en dessous duquel, disent-ils, personne ne planifie plus rien autour des horaires.`,
        ),
        p(
          'Aux Hauts-de-Lanne, une association de parents d’élèves a relevé que la rame de 12 h 40, celle des collégiens qui sortent à midi le mercredi, est l’une des plus chargées de la journée creuse. La supprimer, disent-ils, reviendrait à punir les rares qui prennent le tramway en dehors des heures de bureau.',
        ),
        p(
          'Le syndicat promet une décision avant la fin de l’année. En attendant, il a proposé un test de six mois : conserver toutes les rames, mais afficher aux arrêts, chaque semaine, leur taux de remplissage. « On ne peut pas discuter de ce qu’on ne mesure pas », dit son président. Les élus de l’opposition y voient surtout une manière de gagner du temps.',
        ),
      ),
    ],
  },
  {
    title: 'Un local vide, c’est parfois simplement un départ à la retraite',
    slug: 'local-vide-depart-a-la-retraite',
    kicker: 'Esther Kowalski',
    excerpt:
      'On compte les vitrines éteintes comme un symptôme. Dans ma rue, la plupart sont fermées parce que celui qui les tenait avait soixante-sept ans et personne pour reprendre.',
    section: 'opinion',
    authors: ['esther-kowalski'],
    publishedAt: '2026-08-31T07:00:00.000Z',
    frontPage: false,
    body: ({ siteName }) => [
      prose(
        p(
          'Chaque fois que la ville publie son décompte des locaux commerciaux vacants, quelqu’un y lit le déclin du centre. J’habite rue des Moulins depuis 1998 et je connais l’histoire de presque chacune des onze vitrines éteintes entre le pont et la place. Ce n’est pas du tout la même histoire.',
        ),
        p(
          'Le quincaillier a fermé à soixante-sept ans, après quarante ans derrière son comptoir. Il avait proposé le fonds à ses deux employés, qui n’avaient pas les moyens de le racheter, et à son fils, qui est ingénieur à Lyon. La retoucheuse a pris sa retraite l’an dernier, et sa machine à coudre est toujours dans la vitrine, sous un drap. Le disquaire est parti parce que son bail a doublé. Un seul des onze locaux, à ma connaissance, a fermé faute de clients.',
        ),
        p(
          'La différence compte, parce qu’on ne soigne pas un départ à la retraite comme on soigne un loyer trop cher. Le premier se prépare : il faut qu’un artisan de soixante ans sache, cinq ans avant, à qui il peut transmettre, et à quelles conditions. La seconde demande un bail commercial qu’on ne peut pas multiplier par deux d’un trimestre à l’autre.',
        ),
        p(
          'La chambre de commerce propose déjà un service de mise en relation entre cédants et repreneurs. Il compte, d’après ses propres chiffres, quatorze dossiers pour l’agglomération entière. Je ne crois pas que ce soit parce que personne n’a de fonds à céder. Je crois que personne ne sait que ce service existe.',
        ),
        p(
          'Ce que je demande à la mairie tient en une phrase : que le décompte des locaux vides distingue les fermetures par défaut de reprise de celles qui tiennent au loyer ou à la clientèle, et qu’on envoie une lettre, l’année de leurs soixante ans, à chaque commerçant qui n’a pas encore trouvé de successeur.',
        ),
        p(`*Esther Kowalski tient une librairie rue des Moulins et écrit pour ${siteName}.*`),
      ),
    ],
  },
  {
    title: 'Trois petits théâtres, une saison inattendue',
    slug: 'trois-petits-theatres-une-saison',
    kicker: 'Théâtre',
    excerpt:
      'Le Hangar, l’Atelier du Port et le théâtre de poche de la Rive-Est ont programmé ensemble, sans se concurrencer. Leurs salles n’ont pas été aussi pleines depuis dix ans.',
    section: 'culture',
    authors: ['jonas-feldmann'],
    publishedAt: '2026-09-01T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'theatre',
      caption: 'La salle d’un petit théâtre, quelques minutes avant la représentation.',
    },
    body: () => [
      prose(
        p(
          'Il y a un an, les directeurs du Hangar, de l’Atelier du Port et du théâtre de poche de la Rive-Est se sont retrouvés un soir autour d’une table pour constater que, sur le même week-end, leurs trois salles jouaient à moitié vides des spectacles que le même public aurait voulu voir. Ils ont décidé, à la fin du dîner, de ne plus jamais programmer le même soir.',
        ),
        p(
          'La règle est modeste et elle a tout changé. Les trois théâtres se partagent désormais un calendrier commun, qui place leurs représentations sur sept soirs de la semaine plutôt que sur les deux que tout le monde convoitait. Ils vendent aussi un abonnement unique, à 36 € pour quatre places à utiliser dans la salle de son choix.',
        ),
        p(
          'Les chiffres de la saison sont sans équivoque. Le Hangar, qui jouait à 41 % de sa jauge, a atteint 78 %. L’Atelier du Port a ajouté une séance le jeudi et la remplit. Le théâtre de poche, 49 places, affiche complet la plupart des vendredis, ce qui ne lui était pas arrivé depuis l’ouverture.',
        ),
        p(
          '« On pensait se partager un gâteau qui rétrécissait, dit Mireille Tardieu, qui dirige le Hangar. On a découvert qu’une partie de nos spectateurs ne sortait pas parce qu’ils ne savaient jamais ce qui jouait où. »',
        ),
        h2('Un public qui change de salle'),
        p(
          'La billetterie commune permet de voir qui va où. Près d’un quart des abonnés fréquentent désormais les trois salles dans la même saison, contre presque aucun auparavant. Ce public-là est aussi plus jeune que celui de chaque théâtre pris isolément : la moyenne d’âge des abonnés est tombée de 58 à 47 ans.',
        ),
        p(
          'Tout n’est pas réglé. Les trois équipes se partagent un seul permanent pour la billetterie, et la mairie, qui finance une part des trois lieux, n’a pas encore décidé si elle versera la subvention à chacun séparément ou à l’ensemble. Les directeurs demandent un seul guichet. Ils attendent la réponse en décembre.',
        ),
        p(
          'En attendant, ils préparent la saison prochaine ensemble. Une création commune, jouée successivement dans les trois salles, est annoncée pour mars. Personne n’a encore trouvé de titre.',
        ),
      ),
    ],
  },
  {
    title: 'Les jardiniers de la Colline-aux-Genêts obtiennent un bail de dix ans',
    slug: 'colline-aux-genets-jardin-bail-dix-ans',
    kicker: 'Quartiers',
    excerpt:
      'Après quatre ans d’occupation précaire, l’association du jardin partagé signera lundi avec la ville un bail de dix ans sur un terrain que la municipalité comptait vendre.',
    section: 'news',
    authors: ['samuel-kone'],
    publishedAt: '2026-09-02T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'allotments',
      caption:
        'Oignons, pommes de terre et tomates en rangs, dans le jardin partagé de la Colline-aux-Genêts.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'Lundi, à 11 heures, les présidents de l’association des Jardins de la Colline et l’adjoint aux espaces verts signeront à l’hôtel de ville un bail de dix ans sur le terrain de 4 200 mètres carrés que l’association cultive depuis quatre ans sans autre garantie qu’une autorisation d’occupation renouvelée d’une année sur l’autre.',
        ),
        p(
          'Le terrain, une ancienne friche ferroviaire de la Colline-aux-Genêts, figurait sur la liste des biens que la ville comptait mettre en vente pour boucler son budget d’investissement. Il en a été retiré en juillet, après une pétition de 2 300 signatures et une visite du maire sur place, un samedi matin, bottes aux pieds.',
        ),
        p(
          'Le bail prévoit un loyer symbolique de 1 € par an, une clause de renouvellement et l’obligation, pour l’association, de garder un tiers des parcelles ouvertes aux habitants de moins de trente ans et aux familles inscrites à l’épicerie sociale voisine. Cette dernière condition est celle que les jardiniers ont le plus discutée.',
        ),
        p(
          '« On avait peur de devenir un jardin pour ceux qui ont déjà un balcon, dit Aminata Sy, qui préside l’association. Cette règle nous oblige à rester ce qu’on est censés être. »',
        ),
        h2('Quatre ans de rangs bien tenus'),
        p(
          'Le jardin compte aujourd’hui quatre-vingt-quatre parcelles, un abri à outils bâti par les adhérents, une cuve de récupération d’eau de 5 000 litres et une liste d’attente de cinquante-deux noms. Une partie des récoltes, de l’ordre de 1,8 tonne l’an dernier, part à l’épicerie sociale.',
        ),
        p(
          `La signature ne règle pas tout. Le terrain est en pente, et l’association a besoin d’un mur de soutènement dont le devis atteint 38 000 €. Elle a lancé une souscription, que ${siteName} a vu dépasser les 11 000 € cette semaine. Une partie des fonds viendra d’un budget participatif de la ville, dont le vote a lieu en octobre.`,
        ),
        p(
          'Lundi, les jardiniers ont prévu de signer à l’hôtel de ville, puis de revenir sur la colline pour un repas où chacun apporte ce qu’il a récolté. Il reste encore des tomates.',
        ),
      ),
    ],
  },
  {
    title: 'Dans le centre, les tours de bureaux se transforment en logements',
    slug: 'tours-de-bureaux-du-centre-en-logements',
    kicker: 'Immobilier',
    excerpt:
      'Un cinquième des surfaces de bureaux du centre de Belmarais est vide. Trois immeubles seront transformés en appartements d’ici 2029, et la ville en espère mille de plus.',
    section: 'business',
    authors: ['prisca-rey'],
    publishedAt: '2026-09-03T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'office-block-dusk',
      caption:
        'Un immeuble de bureaux à la tombée de la nuit, rue du Canal : seuls quelques étages sont encore éclairés.',
    },
    body: () => [
      prose(
        p(
          'Le soir, quelques étages seulement restent allumés dans les immeubles de bureaux construits dans les années 1970 autour de la rue du Canal. D’après l’agence d’urbanisme, 21 % des surfaces de bureaux du centre de Belmarais sont désormais vacantes, contre 8 % en 2019, et la tendance ne s’est pas retournée depuis deux ans.',
        ),
        p(
          'Pour la première fois, des propriétaires envisagent autre chose que d’attendre des locataires. Trois immeubles, représentant ensemble 290 logements, ont déposé ou annoncé un permis de transformer leurs étages en appartements. Le premier chantier, rue du Canal, doit commencer au printemps.',
        ),
        p(
          'La mairie y voit une chance. Elle a modifié son plan local d’urbanisme en juin pour autoriser le changement d’usage sans passer par une enquête publique, et elle étudie un fonds de garantie pour les opérations qui comprendraient au moins 30 % de logements aidés. Son adjointe à l’urbanisme parle de « mille logements en cinq ans » sans les garantir.',
        ),
        h2('Des plateaux trop profonds'),
        p(
          'Les promoteurs sont plus prudents. Un immeuble de bureaux n’est pas un immeuble d’habitation : les plateaux sont trop profonds, les fenêtres trop éloignées du cœur du bâtiment, et il faut créer des colonnes de plomberie à chaque étage. Selon un architecte qui a étudié deux des trois projets, le coût de la transformation atteint, sur certains plateaux, 80 % de celui d’une construction neuve.',
        ),
        p(
          '« La plupart des bâtiments de cette époque ne se prêtent pas à l’opération, dit-il. Ceux qui s’y prêtent ont de petits plateaux, de grandes fenêtres, et un propriétaire qui a déjà amorti son immeuble. Il y en a peut-être six dans le centre. »',
        ),
        p(
          'Pour les commerçants de la rue du Canal, qui ont vu leurs clients de la pause-déjeuner disparaître, l’arrivée d’habitants serait une bonne nouvelle, même si elle prend des années. Le boulanger du coin dit qu’il préfère mille voisins à mille bureaux qui ne se remplissent plus.',
        ),
      ),
    ],
  },
  {
    title: 'Ce sont les petites histoires que cette ville retient',
    slug: 'les-petites-histoires-que-la-ville-retient',
    kicker: 'Gabriel Orsini',
    excerpt:
      'On se souvient rarement du jour du vote. On se souvient de la dame qui s’est levée dans la salle, ou de l’enfant qui a ouvert la porte du gymnase.',
    section: 'opinion',
    authors: ['gabriel-orsini'],
    publishedAt: '2026-09-04T07:00:00.000Z',
    frontPage: false,
    body: ({ siteName }) => [
      prose(
        p(
          'Dans quelques années, personne à Belmarais ne se rappellera le numéro de la délibération qui a créé la ligne du Port, ni le montant exact du marché. On se rappellera peut-être le conseiller qui a refusé de partir avant minuit, ou la retraitée qui a lu à voix haute, devant la salle, la liste des arrêts que la ligne ne desservirait pas.',
        ),
        p(
          'Je dirige la rédaction de ce magazine depuis 2019, et la question qu’on me pose le plus souvent est de savoir comment nous choisissons nos sujets. La réponse qui m’embarrasse est la plus honnête : nous cherchons l’histoire qu’un habitant racontera encore à son voisin dans six mois.',
        ),
        p(
          'Ce critère n’a rien de sentimental. Une ville se comprend par les anecdotes qui circulent plus que par les rapports qui dorment. Le jour où le conseil des bibliothèques a failli fermer deux antennes, ce n’est pas le déficit de 2,1 millions d’euros qui a mobilisé les gens. C’est l’idée que le collège n’aurait plus d’endroit où envoyer ses élèves à 17 heures.',
        ),
        p(
          'Nous tenons à publier les chiffres, parce que ce sont eux qui permettent de discuter. Nous tenons aussi, et ça se voit moins, à entendre les gens qu’ils concernent, y compris quand ils ne savent pas parler de leurs propres chiffres. Un journal local, c’est cela : une présence au bout du couloir quand le vote a eu lieu et que tout le monde est rentré.',
        ),
        p(
          'Cette présence a un coût, que les lecteurs finissent par comprendre : elle suppose de ne pas tout dire, de revenir, de rectifier. Nous préférons cela à une réputation qui tiendrait à ne jamais se tromper.',
        ),
        p(
          'Je ne sais pas si ce travail sauvera quoi que ce soit. Je sais que la prochaine fois qu’un habitant dira « on ne nous a rien dit », nous voulons pouvoir répondre : si, c’était dans le numéro de jeudi, page trois.',
        ),
        p(`*Gabriel Orsini est rédacteur en chef ${du(siteName)} depuis 2019.*`),
      ),
    ],
  },
  {
    title: 'À La Maison Larquin, une cuisine enfin à la hauteur de la salle',
    slug: 'maison-larquin-critique-cuisine-a-la-hauteur-de-la-salle',
    kicker: 'Critique de restaurant',
    excerpt:
      'Sa verrière de 1924 et ses boiseries ont survécu à trois propriétaires. Sous le quatrième, la cuisine a fini par rattraper le décor.',
    section: 'culture',
    authors: ['lucie-ferrer'],
    publishedAt: '2026-09-05T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'dining-room',
      caption: 'La salle de La Maison Larquin, dressée pour le service du soir.',
    },
    body: () => [
      prose(
        p(
          'Pendant trente ans, on est allé à La Maison Larquin pour la salle. Sa verrière de 1924, ses boiseries claires, ses banquettes en laine grise : un décor qui faisait oublier l’assiette, souvent tiède, parfois juste fatiguée. On y allait pour les anniversaires, pour la lumière du jeudi soir, pour la conversation.',
        ),
        p(
          'Depuis mars, la cuisine appartient à Inès Barbier, trente-quatre ans, longtemps chef de partie dans une brasserie du Vieux-Port. Elle a conservé trois plats de l’ancienne carte, dont un bœuf bourguignon que personne n’aurait osé retirer, et rebâti le reste autour de ce que l’on trouve sur le marché des Tanneries le mercredi matin.',
        ),
        p(
          'Le menu du déjeuner, à 24 €, tient en deux lignes par service et change chaque semaine. Un soir de septembre, j’y ai mangé une soupe froide de concombre et de menthe, d’une netteté rare, puis un pigeon rôti, jus court, petits pois, parfaitement saisi. Le dessert, une tarte aux prunes tiède, n’avait rien à prouver.',
        ),
        p(
          'Tout n’est pas encore au niveau. Le pain arrive trop vite et repart trop tard, la carte des vins, longue de cinq pages, sert d’abord le nom de l’étiquette, et l’un des plats, une raie au beurre noisette, manquait de caractère. Mais ce sont des défauts d’une cuisine qui cherche, plus des défauts d’une cuisine qui se repose.',
        ),
        p(
          'Le service, lui, a changé de ton : plus direct, plus chaleureux, moins attentif à l’uniforme. La salle est toujours aussi belle, et c’est, pour la première fois depuis longtemps, une bonne raison parmi d’autres d’y dîner.',
        ),
        p(
          'Une dernière réserve : à ce niveau de prix, on attend de la constance. Le restaurant aura besoin de plusieurs mois pour montrer que ce déjeuner n’était pas un coup de chance.',
        ),
        p(
          'La Maison Larquin, rue du Vieux-Port. Menu du déjeuner à 24 €, carte le soir autour de 55 €. Fermé le dimanche et le lundi.',
        ),
      ),
    ],
  },
  {
    title: 'Salles des fêtes réservées jusqu’en juin, traiteurs en manque de personnel',
    slug: 'salles-des-fetes-reservees-traiteurs-en-manque-de-personnel',
    kicker: 'Réceptions',
    excerpt:
      'Les mariages et les banquets d’associations ont rempli les agendas bien avant l’été. Faute de serveurs, plusieurs traiteurs refusent désormais des dates.',
    section: 'business',
    authors: ['prisca-rey'],
    publishedAt: '2026-09-07T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'reception-hall',
      caption: 'Une salle de réception dressée et vide, avant une soirée.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'À Belmarais, une famille qui voudrait fêter un mariage au mois de juin et n’a pas encore choisi de salle risque d’être déçue. Les quatre salles de réception de la ville, dont la grande salle de l’hôtel de ville et la salle Saint-Éloi, sont complètes pour tous les samedis de mai à septembre, et le gestionnaire de l’une d’elles a cessé de tenir une liste d’attente.',
        ),
        p(
          'La demande a explosé depuis deux ans, portée par les fêtes qu’on avait reportées, puis par l’habitude de se retrouver. Le problème, aujourd’hui, n’est plus la salle. C’est ce qui se passe à l’intérieur : les traiteurs de l’agglomération disent manquer de personnel de service, de cuisiniers, de plongeurs, et d’extras formés qui acceptent de travailler un samedi soir.',
        ),
        p(
          `« Je refuse une date sur trois, dit Ahmed Kaci, qui emploie quatre salariés à l’année et jusqu’à quinze extras en haute saison. Je préfère dire non que décevoir une famille le jour J. » Son témoignage, que ${siteName} a recoupé auprès de cinq autres traiteurs, revient presque mot pour mot d’une cuisine à l’autre.`,
        ),
        h2('Des prix qui montent, des fêtes qui rétrécissent'),
        p(
          'Les tarifs ont suivi. Un repas de noces pour cent vingt invités, qui coûtait 52 € par personne il y a trois ans, en coûte aujourd’hui 71 € dans la plupart des maisons. Les associations, dont les banquets annuels sont une source de revenus, ont dû renoncer à certaines dates ou réduire leurs menus.',
        ),
        p(
          'Plusieurs traiteurs plaident pour une formation commune. La chambre des métiers a ouvert à la rentrée une session de huit semaines pour devenir serveur en réception, financée à moitié par la région. Elle compte vingt et un inscrits sur trente places. La directrice du centre y voit un début, pas une réponse.',
        ),
        p(
          'En attendant, les familles prudentes s’y prennent désormais dix-huit mois à l’avance, et beaucoup choisissent un dimanche ou un vendredi, moins chers et plus faciles à servir. Au moins ces jours-là, dit un gestionnaire, il y a encore de la place.',
        ),
      ),
    ],
  },
  {
    title: 'À la galerie Kell, une exposition dense et généreuse de quarante peintres belmarais',
    slug: 'galerie-kell-couleur-locale-critique',
    kicker: 'Critique d’art',
    excerpt:
      '« Couleur locale » accroche quarante peintres de la ville sur deux étages. Le parti pris de la profusion fatigue parfois, et fait surtout du bien.',
    section: 'culture',
    authors: ['celia-marchetti'],
    publishedAt: '2026-09-08T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'gallery',
      caption: 'Une salle de la galerie Kell, accrochée pour « Couleur locale » avant l’ouverture.',
    },
    body: () => [
      prose(
        p(
          'On entre dans « Couleur locale » comme dans une fête de quartier : par le bruit, c’est-à-dire par le nombre. Quarante peintres de Belmarais, âgés de vingt-quatre à quatre-vingt-un ans, se partagent les deux étages de la galerie Kell, accrochés du sol au plafond, parfois sur trois rangs, avec une indifférence aux hiérarchies que les musées ont cessé de s’autoriser.',
        ),
        p(
          'Le commissaire, Pierre-Yves Haller, a donné à chaque artiste le même espace, un mètre quarante de mur, et la même règle : une œuvre peinte dans les trois dernières années, choisie par celui qui la signe. Le résultat n’a pas de thème, et tant mieux. Il a une géographie. Les peintres de la Rive-Est travaillent la brique et l’eau, ceux des Hauts-de-Lanne l’intérieur et la lampe.',
        ),
        p(
          'Dans cette profusion, quelques toiles s’imposent. Les grands bleus de Salomé Verdier, ces rives de la Lanne vues à contre-jour, tiennent la salle du premier étage à eux seuls. Les petits formats d’André Cazal, quatre-vingt-un ans, peintre du dimanche devenu peintre tout court, montrent des tables de cuisine avec une précision qui fait presque rire. Et un autoportrait de Yanis Meddah, vingt-quatre ans, en maillot de foot devant un mur d’atelier, rappelle que la ville a aussi des peintres qui ne ressemblent pas à leurs aînés.',
        ),
        p(
          'Le parti pris de la profusion a un prix. À mi-parcours, l’œil se lasse, et l’on passe devant des toiles honnêtes sans s’y arrêter. Un accrochage de trente œuvres aurait été plus net. Mais cette exposition ne cherche pas la netteté. Elle cherche à dire que la ville peint, et que personne ne le savait vraiment.',
        ),
        p(
          'La galerie Kell, qui a réalisé l’an dernier un tiers de son chiffre d’affaires avec des œuvres d’artistes locaux, a déjà vendu onze toiles à des particuliers belmarais. Les prix, de 150 à 2 400 €, expliquent en partie le succès. On peut acheter à Belmarais un tableau fait à Belmarais, c’est assez rare pour être noté.',
        ),
        p(
          '« Couleur locale », galerie Kell, rue des Tanneries, jusqu’au 15 novembre. Entrée libre du mardi au samedi, de 11 h à 19 h.',
        ),
      ),
    ],
  },
  {
    title:
      'Les habitants des Hauts-de-Lanne remplissent un gymnase pour s’opposer à la fermeture de deux bibliothèques',
    slug: 'hauts-de-lanne-habitants-contre-fermeture-bibliotheques',
    kicker: 'Bibliothèques',
    excerpt:
      'Plus de 400 personnes sont venues mardi soir au gymnase du collège. Le conseil des bibliothèques, qui votera en novembre, a promis de présenter une autre option.',
    section: 'news',
    authors: ['samuel-kone'],
    publishedAt: '2026-09-09T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'reading-room',
      caption:
        'Une salle de lecture, un jour de semaine : les antennes menacées sont plus petites, et tout aussi fréquentées.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'Il a fallu installer des chaises supplémentaires dans les coursives du gymnase du collège des Hauts-de-Lanne, mardi soir, pour accueillir les plus de 400 personnes venues protester contre la fermeture, envisagée par le conseil des bibliothèques, de l’antenne du quartier et de celle de la Rive-Est.',
        ),
        p(
          'La réunion, convoquée par le conseil de quartier, a duré deux heures et demie. Elle a donné la parole à une quarantaine d’habitants : des retraités, des parents, des collégiens, un menuisier qui venait chaque samedi chercher des plans, une jeune femme qui a passé son concours d’infirmière dans la salle de lecture.',
        ),
        p(
          '« J’ai appris à lire à mon fils dans cette antenne, dit Fatoumata Diop, qui est restée debout au fond de la salle. S’ils la ferment, on lui dit quoi ? Qu’il y a un bibliobus le jeudi ? »',
        ),
        p(
          'Le conseil des bibliothèques, représenté par sa directrice, Hélène Roussel, a défendu un plan qui doit combler 2,1 millions d’euros de déficit sur trois ans. Fermer deux antennes, a-t-elle expliqué, économiserait 640 000 € par an. Elle a reconnu que le bibliobus proposé en remplacement « ne rend pas le même service », et promis qu’une autre option serait présentée avant le vote.',
        ),
        h2('Une autre option sur la table'),
        p(
          `Le principe d’un maintien des deux antennes avec des horaires réduits a été évoqué à plusieurs reprises, ainsi que l’idée, défendue ce mois-ci dans les colonnes ${du(siteName)} par un ancien enseignant du quartier, d’une année d’horaires du soir avec comptage des visiteurs. Hélène Roussel a dit que l’idée « méritait d’être chiffrée ».`,
        ),
        p(
          'Le conseil de quartier a décidé, à l’issue de la réunion, de déposer une pétition. Elle comptait plus de 3 100 signatures mercredi à midi. Les élus de la majorité municipale, dont aucun n’était présent, ont fait savoir qu’ils attendraient le vote du conseil des bibliothèques avant de se prononcer.',
        ),
        p(
          'Le vote doit avoir lieu le 18 novembre, à l’hôtel de ville. Le conseil de quartier appelle déjà les habitants à remplir la salle.',
        ),
      ),
    ],
  },
  {
    title: 'Belmarais prépare toujours les déplacements de 2019',
    slug: 'belmarais-planifie-les-deplacements-de-2019',
    kicker: 'Nadia Haddad',
    excerpt:
      'Les études qui justifient chaque grand projet de transport reposent sur des habitudes que plus personne n’a. Il serait temps de refaire les comptages.',
    section: 'opinion',
    authors: ['nadia-haddad'],
    publishedAt: '2026-09-10T07:00:00.000Z',
    frontPage: false,
    photo: {
      media: 'tram-stop',
      caption: 'Un arrêt de tramway devant la gare. Le plan suppose un trajet qui n’existe plus.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'La ligne du Port a été votée sur la base d’une étude de fréquentation qui date de 2019. Les cartes de déplacements du plan de mobilité aussi. Le calendrier des travaux, les gabarits des stations, le nombre de rames commandées : tout a été calculé sur les trajets d’une ville qui, depuis, a changé de rythme.',
        ),
        p(
          'Ce n’est pas une critique de principe. Un transport en commun se construit pour trente ans, et personne ne peut prédire ce que seront les usages de 2050. Mais il y a une différence entre ne pas pouvoir prédire et ne pas vouloir regarder. Le trafic de la ligne A, par exemple, montre un creux de mi-journée que l’étude de 2019 ne contient pas.',
        ),
        p(
          'Je ne plaide ni pour ni contre le tramway. Je demande qu’on refasse les comptages, qu’on publie les nouvelles données avant l’ouverture des chantiers, et qu’on dise clairement, pour chaque hypothèse de l’étude, si elle tient encore. Cela coûterait quelques dizaines de milliers d’euros, soit une fraction d’un pour cent du marché.',
        ),
        p(
          'Les élus répondent que le projet est trop avancé pour revenir en arrière. C’est vrai, et ce n’est pas la question. Il s’agit de savoir si les décisions encore ouvertes, le nombre de rames, la place des parkings relais, la fréquence en journée, reposent sur des chiffres exacts.',
        ),
        p(
          'Un journal peut refaire un comptage à sa mesure. Nous l’avons fait aux Hauts-de-Lanne, à trois horaires, un mardi de septembre, et nous publierons les chiffres. Il n’y a aucune raison pour que la ville ne fasse pas mieux.',
        ),
        p(
          'Il y a là, au fond, une question de méthode : on décide d’un projet de trente ans avec les chiffres d’une année qui ne ressemble plus à aucune autre. Ce n’est pas une faute de la ville, c’est une habitude, et les habitudes se corrigent quand on les nomme.',
        ),
        p(`*Nadia Haddad est urbaniste et chroniqueuse pour ${siteName}.*`),
      ),
    ],
  },
  {
    title:
      'Rue de la Treille, une boulangerie a refusé trois offres de rachat. Son patron explique pourquoi',
    slug: 'rue-de-la-treille-boulangerie-refuse-trois-rachats',
    kicker: 'Petits commerces',
    excerpt:
      'Trois groupes ont proposé à Rémi Bouchard de racheter sa boulangerie, ouverte il y a dix-sept ans. Il a dit non trois fois, et il a ses raisons.',
    section: 'business',
    authors: ['olivier-mercier'],
    publishedAt: '2026-09-11T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'baguettes',
      caption: 'Des baguettes sur le comptoir de la boulangerie de la rue de la Treille.',
    },
    body: () => [
      prose(
        p(
          'La première offre est arrivée par courrier, en janvier. La deuxième, en mai, par un représentant venu un mardi matin, à l’heure où le fournil est encore chaud. La troisième, en août, était plus généreuse que les deux autres réunies. Rémi Bouchard, quarante-neuf ans, a dit non à chaque fois, et il explique avec une patience un peu lasse que ce n’est pas une question de prix.',
        ),
        p(
          'Sa boulangerie de la rue de la Treille emploie neuf salariés et produit chaque jour environ 900 baguettes, 120 pains de campagne et une trentaine de viennoiseries. Elle a ouvert il y a dix-sept ans, sur un fonds repris à bout de souffle. Le chiffre d’affaires, d’après lui, est « correct, sans plus ». Les offres de rachat valaient entre six et huit fois son bénéfice annuel.',
        ),
        p(
          '« Ils veulent la boutique, pas le métier, dit-il. L’un d’eux m’a expliqué que la pâte serait préparée dans un laboratoire à vingt kilomètres et finie ici, à la cuisson. Je n’ai pas besoin de réfléchir longtemps pour savoir que le client ne reconnaîtrait pas le pain. »',
        ),
        p(
          'Les groupes qui rachètent des boulangeries indépendantes se multiplient dans l’agglomération. Selon la chambre des métiers, une boulangerie sur cinq a changé de main depuis 2021, et la plupart des acquéreurs ont gardé l’enseigne et changé la production. Les clients s’en aperçoivent rarement tout de suite.',
        ),
        h2('Ce qui le retient'),
        p(
          'Rémi Bouchard dit tenir à deux choses. D’abord à son équipe, dont deux apprentis qu’il a formés lui-même et qu’il voudrait voir reprendre le fonds un jour, ce qui suppose de leur laisser le temps de réunir un financement. Ensuite à la rue : il loue l’arrière-boutique à un cordonnier et prête son four, le dimanche, à l’association des jardins de la colline.',
        ),
        p(
          'Il ne se fait aucune illusion sur l’avenir. Sa propriétaire, qui a quatre-vingt-trois ans, a déjà reçu des propositions pour les murs, et le bail vient à échéance dans six ans. Il espère qu’elle attendra, ou qu’elle préférera vendre à quelqu’un qui sait ce qu’on cuit au rez-de-chaussée.',
        ),
        p(
          'La quatrième offre est arrivée la semaine dernière. Elle est restée sur le comptoir, sous une pile de bons de commande.',
        ),
      ),
    ],
  },
  {
    title: 'Le départ discret de ceux qui quittent Belmarais',
    slug: 'ceux-qui-quittent-belmarais',
    kicker: 'Logement',
    excerpt:
      'La ville perd moins d’habitants qu’elle n’en change. Les départs concernent surtout les trente-cinq à quarante-cinq ans, et le logement en est la première raison.',
    section: 'news',
    authors: ['thibault-lemaire'],
    publishedAt: '2026-09-12T07:00:00.000Z',
    frontPage: true,
    body: ({ siteName }) => [
      prose(
        p(
          'Sur le papier, Belmarais ne se vide pas. Le dernier recensement lui compte 118 400 habitants, soit 600 de plus qu’il y a cinq ans, et les élus s’en félicitent volontiers. Ce chiffre global masque un mouvement plus discret, que ni les statistiques publiées ni les débats du conseil ne mettent en avant : ceux qui partent ne sont pas ceux qui arrivent.',
        ),
        p(
          `${siteName} a croisé les données nationales sur les migrations résidentielles, les fichiers de la caisse d’allocations familiales que la ville a fournis à l’agence d’urbanisme et les chiffres des déménagements déclarés auprès de la mairie. Le tableau est net. Entre 2019 et 2024, la ville a perdu environ 4 900 habitants âgés de trente-cinq à quarante-cinq ans, et gagné environ 5 700 étudiants et jeunes adultes de moins de vingt-cinq ans.`,
        ),
        p(
          'Autrement dit, Belmarais accueille bien ceux qui arrivent pour étudier, et retient mal ceux qui voudraient s’y installer pour de bon. Les familles avec deux enfants, en particulier, partent vers les communes voisines de Lanne-sur-Mer, de Saint-Aubin et de Vauclair, où le prix du mètre carré est inférieur d’un tiers.',
        ),
        h2('Le logement avant l’emploi'),
        p(
          'La raison la plus souvent donnée n’est pas l’emploi. Parmi les 312 personnes interrogées par l’agence d’urbanisme à leur départ, 61 % citent d’abord le logement : un appartement trop petit pour une deuxième chambre d’enfant, un loyer qui a augmenté de 27 % en six ans, une maison inaccessible sans apport. L’emploi arrive loin derrière, à 14 %.',
        ),
        p(
          'Le marché explique une partie de l’écart. Entre 2019 et 2025, le prix médian d’un appartement de trois pièces est passé de 2 650 € à 3 420 € le mètre carré dans le centre, et de 2 200 € à 2 780 € dans les quartiers périphériques. Dans le même temps, la production de logements neufs a ralenti : 540 par an en moyenne depuis 2022, contre 810 par an dans les cinq années précédentes.',
        ),
        p(
          '« Le problème n’est pas qu’on ne construit pas du tout, dit Nathalie Perrin, économiste à l’université de Belmarais. C’est qu’on construit des studios, que les étudiants et les investisseurs achètent, et pas des quatre-pièces. Une famille qui cherche trois chambres n’a presque rien à visiter. »',
        ),
        h2('Une ville qui change d’âge'),
        p(
          'Les conséquences se voient déjà dans les écoles. Les effectifs des maternelles de la ville ont baissé de 9 % depuis 2021, et deux classes ont fermé à la rentrée. Le collège des Hauts-de-Lanne a perdu soixante élèves en quatre ans. À l’inverse, les résidences étudiantes affichent complet, et le centre compte moins de commerces de proximité et plus de salons de thé.',
        ),
        p(
          'Pour les élus, la réponse est de construire davantage. Le plan local d’habitat, adopté en juin, prévoit 900 logements par an d’ici 2030, dont un tiers de logements familiaux. Il reste à trouver le foncier et les opérateurs. La transformation de bureaux en logements, discutée en ce moment dans le centre, ne produirait pas plus de trois cents logements dans les trois ans qui viennent.',
        ),
      ),
      pullQuote(
        'Ce n’est pas la ville qu’on quitte. C’est la possibilité d’y rester une fois qu’on a des enfants.',
        'Camille Rousseau',
        'Ancienne habitante des Tanneries, installée à Vauclair en 2024',
      ),
      prose(
        p(
          'Camille Rousseau, trente-huit ans, a quitté les Tanneries il y a deux ans avec son compagnon et leurs deux fils. Elle travaille toujours à Belmarais, et prend le train chaque matin. « On aurait aimé rester, dit-elle. Mais pour quatre-vingts mètres carrés, on nous demandait 1 650 € par mois. À Vauclair, c’est une maison avec un jardin, pour moins. »',
        ),
        p(
          'Le phénomène a une conséquence moins visible : ceux qui partent continuent de venir travailler et de passer par les routes, mais ils ne votent plus en ville, ne fréquentent plus ses écoles et ne dépensent plus leur samedi dans ses commerces. Une ville qui se vide ainsi de ses actifs de quarante ans perd, avec eux, une part de ce qui la fait tenir.',
        ),
        p(
          'La mairie dit étudier un dispositif d’accession aidée pour les ménages avec enfants. Il n’est pas encore chiffré. Les chiffres de l’agence d’urbanisme, eux, le sont : au rythme actuel, Belmarais perdra, d’ici 2030, un habitant de cet âge sur sept.',
        ),
        p(
          'Pour l’agence d’urbanisme, ces chiffres appellent une réponse qui ne se limite pas au logement neuf : réhabiliter des logements vacants, qui sont au nombre de 3 100 dans la ville, et ouvrir aux familles une partie des programmes aujourd’hui réservés aux investisseurs. Aucune de ces pistes n’a pour l’instant de calendrier.',
        ),
      ),
    ],
  },
  {
    title: 'Le conseil approuve la ligne du Port après dix ans de faux départs',
    slug: 'le-conseil-approuve-la-ligne-du-port',
    kicker: 'Transports',
    excerpt:
      'Par 29 voix contre 3, le conseil municipal a voté la nouvelle ligne de tramway entre la gare et le Vieux-Port. Elle sera construite à prix fixe par un seul groupement, qui l’exploitera quinze ans.',
    section: 'news',
    authors: ['aicha-benali', 'thibault-lemaire'],
    publishedAt: '2026-09-13T07:00:00.000Z',
    frontPage: true,
    photo: {
      media: 'town-hall',
      caption:
        'L’hôtel de ville au lendemain du vote. La salle du conseil était pleine jusqu’à un peu après 23 heures.',
    },
    body: ({ siteName }) => [
      prose(
        p(
          'Il était 23 h 05, mardi soir, quand la maire a proclamé le résultat : 29 voix pour, 3 contre, 1 abstention. Après dix ans de projets abandonnés, de bureaux d’études et de promesses de campagne, le conseil municipal de Belmarais a approuvé la construction de la ligne du Port, un tramway de 9,4 kilomètres entre la gare et le Vieux-Port.',
        ),
        p(
          'Dans les tribunes, quelques applaudissements. Une partie de la salle, venue en nombre pour réclamer une station à la Rive-Est, que la ligne ne dessert pas, a quitté la salle sans un mot. Le conseil avait siégé près de cinq heures.',
        ),
        p(
          'La ligne comptera quatorze stations et coûtera 412 millions d’euros, financés à 40 % par l’État, à 25 % par la région et pour le reste par la ville et l’agglomération. Les premiers travaux, le déplacement des canalisations et des câbles le long du quai Mercier, doivent débuter en avril. Le syndicat des transports annonce une mise en service sur l’ensemble de la ligne à l’automne 2030, et prévoit 41 000 voyages par jour en 2032. Les opposants jugent ce chiffre optimiste : l’actuelle ligne de bus la plus chargée du couloir, la 12, a transporté 9 800 voyageurs par jour l’an dernier.',
        ),
        h2('Ce qui a changé cette fois'),
        p(
          `La version de 2019 est morte en commission, sur le coût de son tunnel. Celle de 2022 a perdu sa subvention nationale quand le syndicat a manqué une date de dépôt de neuf jours. Ce qui a fait aboutir celle-ci, selon trois élus qui se sont confiés à ${siteName} avant le vote, c’est une formule contractuelle que la ville n’a jamais employée pour un projet de cette taille. Un seul groupement, le Groupement Rive-Nord, conçoit et construit la ligne pour un prix fixe, puis l’exploite pendant quinze ans.`,
        ),
        p(
          '« On a passé dix ans à payer des cabinets pour nous dire ce que ça coûterait, a déclaré l’adjointe aux transports, Adèle Ndiaye, qui préside la commission. Le prix fixe est le premier chiffre que quelqu’un a accepté de signer. »',
        ),
        p(
          'Les trois voix contre sont venues des élus qui avaient fait échouer le projet de 2022. Le conseiller Léonard Pruvost, dont le quartier de la Rive-Est n’est pas traversé par la ligne, a soutenu qu’un contrat d’exploitation de quinze ans donne à une entreprise privée trop de poids sur les tarifs et sur l’offre.',
        ),
        p(
          '« Si la fréquentation déçoit, c’est la ville qui paie la différence, a-t-il dit. Si elle réussit, c’est le groupement qui garde le gain. J’ai lu deux fois le résumé du contrat, et je ne trouve toujours pas la clause qui protège l’usager. »',
        ),
        p(
          'Adèle Ndiaye lui a répondu que le contrat prévoit des pénalités en cas de retards ou de pannes, et un plafond de tarifs indexé sur l’inflation. Elle a admis que la clause qui partage les gains au-delà d’un certain seuil de fréquentation « mérite d’être précisée par avenant », et s’est engagée à la présenter au conseil de décembre.',
        ),
        h2('Une ligne qui laisse des quartiers de côté'),
        p(
          'Le tracé n’a pas été modifié depuis 2023. Il longe le quai Mercier, traverse les Tanneries et remonte jusqu’à la gare par le boulevard Foch. La Rive-Est et les Hauts-de-Lanne, deux des quartiers les plus peuplés de la ville, ne sont pas desservis, et la ville renvoie leurs habitants à un réseau de bus rabattus sur les stations.',
        ),
        p(
          'Une habitante de la Rive-Est, Joëlle Carpentier, a pris la parole pendant les interventions du public. « On nous dit qu’il y aura des bus, a-t-elle dit. On nous dit ça depuis le premier plan, et il n’y a toujours pas de bus qui passe le dimanche. » Sa phrase a été suivie de la plus longue salve d’applaudissements de la soirée.',
        ),
        p(
          'Le syndicat a répondu en annonçant que la fréquence des bus de rabattement serait garantie dans le contrat : un passage toutes les dix minutes en semaine, toutes les vingt minutes le dimanche. Les habitants, eux, attendent de voir.',
        ),
        h2('Quatre séances publiques cet automne'),
        p(
          'Les habitants pourront commenter les plans des stations lors de quatre séances publiques cet automne, la première le 24 septembre à l’antenne de bibliothèque des Hauts-de-Lanne. Le syndicat a aussi accepté de publier les prévisions de fréquentation de chaque station, un document que les opposants réclamaient depuis 2022 sans l’obtenir.',
        ),
        p(
          'Pour Léonard Pruvost, le vote tranche la question de savoir si la ligne sera construite et ouvre celle de la manière dont elle sera exploitée. « J’ai perdu ce soir, a-t-il dit en quittant la salle. J’ai l’intention d’être la personne la plus assidue à chacune de ces séances. »',
        ),
      ),
    ],
  },
]

export const MAGAZINE_COPY_FR: MagazineCopy = {
  locale: 'fr',
  publicationName: DEFAULT_PUBLICATION_NAME_FR,
  sections: MAGAZINE_DEMO_SECTIONS_FR,
  authors: MAGAZINE_DEMO_AUTHORS_FR,
  articles: MAGAZINE_DEMO_ARTICLES_FR,
  mediaAlts: {
    'town-hall':
      'La façade en pierre d’un hôtel de ville, avec son horloge et ses hautes fenêtres cintrées, vue depuis le pied de son perron',
    gallery:
      'Une salle d’exposition où des tableaux dans des cadres dorés sont accrochés sur un mur clair, au-dessus d’un parquet',
    theatre:
      'Un rideau de scène en velours rouge encadré de balcons dorés, vu depuis le balcon d’un petit théâtre',
    'archive-stacks':
      'Une longue allée entre des rayonnages métalliques verts chargés de cartons d’archives ficelés',
    allotments:
      'Des rangs d’oignons, de pommes de terre et de tomates sur tuteurs dans un jardin partagé, avec de petits abris en bois au loin',
    'reception-hall':
      'Une grande salle de réception vide, avec un plafond de bois sculpté, des lustres et des portraits au-dessus des boiseries',
    'tram-stop':
      'Un tramway qui arrive à un arrêt entre deux bâtiments de pierre, avec un panneau bleu de voie de tramway au premier plan',
    'empty-tram-stop':
      'Un arrêt de tramway désert et ses rails, le long d’un quai bordé de platanes nus sous un ciel nuageux',
    'reading-room':
      'Une salle de lecture circulaire sous une verrière, avec de longues tables en bois et quelques lecteurs',
    baguettes: 'Des baguettes dorées dressées dans un panier devant un mur rouge sombre',
    'office-block-dusk':
      'Un immeuble de bureaux sombre à la tombée de la nuit, avec une colonne de fenêtres éclairées sur un ciel bleu',
    'dining-room':
      'La salle d’un restaurant, avec des tables en chêne dressées, des chaises en tissu gris et des boiseries',
  },
  leadCredit: (author, licence) => `Photo : ${author} (${licence})`,
  pages: {
    home: {
      title: 'À la une',
      opinionRail: 'Opinions',
      cultureRail: 'Culture',
      mostRead: 'Les plus lus',
      businessRail: 'Économie',
      ctaTitle: 'Un journalisme pour Belmarais, financé par ses lecteurs',
      ctaText: (siteName) =>
        `${siteName} garde en accès libre son suivi de l’hôtel de ville. Les abonnements commencent à 8 € par mois et font vivre seize journalistes.`,
      ctaSubscribe: 'S’abonner',
      ctaStandards: 'Lire notre charte',
    },
    about: {
      title: 'À propos',
      slug: 'a-propos',
      body: (siteName) => [
        p(
          `${siteName} est un magazine indépendant d’actualité et de culture pour Belmarais. Il paraît en ligne chaque jour de la semaine et sur papier chaque jeudi, et il suit la ville depuis que son premier numéro est sorti, en 2011, de l’arrière-boutique d’un imprimeur de la rue des Moulins.`,
        ),
        p(
          'Il appartient à la Coopérative de presse du Port, dont les sociétaires sont ses abonnés et ses salariés. Aucun propriétaire extérieur à la ville ne peut le racheter, et aucun annonceur ne siège à son conseil.',
        ),
        h2('Ce que nous couvrons'),
        p(
          'L’Actualité suit l’hôtel de ville, les écoles, les transports, le logement et la justice. L’Économie s’intéresse aux entreprises, aux salariés et aux décisions immobilières qui font l’économie locale. La Culture rend compte de l’art, du théâtre, de la musique et de la table de la ville. Les Opinions accueillent des chroniqueurs et des lecteurs qui vivent ici et débattent de bonne foi.',
        ),
        h2('Qui nous finance'),
        p(
          'Les abonnements représentent 94 % de nos recettes. Le reste vient d’un petit nombre d’annonceurs locaux, dont les publicités sont signalées comme telles et jamais placées à côté d’un article sur leur entreprise. Notre suivi de l’action municipale reste en accès libre pour tous.',
        ),
        h2('Quand nous nous trompons'),
        p(
          'Nous corrigeons l’article, ajoutons en pied de page une note datée et disons ce qui a changé. Notre règle complète sur les corrections, les sources et les conflits d’intérêts est publiée sur la page de la charte.',
        ),
      ],
      figuresTitle: 'La rédaction en chiffres',
      figures: [
        { value: '2011', label: 'Premier numéro imprimé' },
        { value: '16', label: 'Journalistes, éditeurs et photographes' },
        { value: '31 200', label: 'Abonnés payants' },
        { value: '94', unit: '%', label: 'Des recettes viennent des lecteurs' },
      ],
      sectionsTitle: 'Quatre rubriques',
      quote: {
        text: 'Nous publions l’ordre du jour du conseil municipal le jeudi qui précède chaque séance, parce que c’est le moment où un lecteur peut encore changer ce qui s’y décide.',
        author: 'Gabriel Orsini',
        role: 'Rédacteur en chef depuis 2019',
      },
    },
    subscribe: {
      title: 'S’abonner',
      slug: 's-abonner',
      body: (siteName) => [
        p(
          `Un abonnement finance le travail ${du(siteName)}. Il fait vivre seize journalistes, une édition papier hebdomadaire et des archives qui remontent à 2011, et il garde en accès libre notre suivi de l’hôtel de ville.`,
        ),
        p(
          'Chaque abonnement donne un accès illimité au site et aux archives, la lettre du matin, et une invitation à la réunion trimestrielle de la rédaction, où les abonnés interrogent l’équipe sur ses choix éditoriaux.',
        ),
      ],
      plansTitle: 'Choisir son abonnement',
      plans: [
        {
          key: 'numerique',
          name: 'Numérique',
          price: '8 €',
          interval: 'par mois',
          features: [
            'Tous les articles et l’intégralité des archives',
            'La lettre du matin',
            'Résiliable en ligne à tout moment',
          ],
          actionLabel: 'Choisir Numérique',
          href: '/s-abonner#numerique',
        },
        {
          key: 'papier',
          name: 'Papier et numérique',
          price: '19 €',
          interval: 'par mois',
          features: [
            'L’édition papier du jeudi, livrée chez vous',
            'Tout ce que comprend Numérique',
            'Cinq articles par mois à offrir à qui vous voulez',
          ],
          actionLabel: 'Choisir Papier et numérique',
          href: '/s-abonner#papier',
          highlighted: true,
        },
        {
          key: 'etudiant',
          name: 'Étudiant',
          price: '3 €',
          interval: 'par mois',
          features: [
            'Tout ce que comprend Numérique',
            'Une adresse e-mail ou une carte d’étudiant suffit',
            'Renouvelé à chaque année universitaire',
          ],
          actionLabel: 'Choisir Étudiant',
          href: '/s-abonner#etudiant',
        },
        {
          key: 'soutien',
          name: 'Soutien',
          price: '150 €',
          interval: 'par an',
          features: [
            'Tout ce que comprend Papier et numérique',
            'Une voix à l’assemblée générale de la coopérative',
            'Votre nom dans le rapport annuel, si vous le souhaitez',
          ],
          actionLabel: 'Devenir soutien',
          href: '/s-abonner#soutien',
        },
      ],
      letter: {
        text: 'J’ai résilié deux abonnements nationaux pour garder celui-ci. C’est le seul journal qui m’a dit que la bibliothèque près de chez moi risquait de fermer, trois mois avant que quiconque me demande mon avis.',
        name: 'Denise Alvarez',
        role: 'Abonnée aux Hauts-de-Lanne depuis 2019',
      },
      faqTitle: 'Questions sur les abonnements',
      faq: [
        {
          key: 'resiliation',
          question: 'Puis-je résilier en ligne ?',
          answer:
            'Oui. Choisissez « Résilier l’abonnement » sur la page de votre compte. Vous gardez l’accès jusqu’à la fin de la période que vous avez payée.',
        },
        {
          key: 'livraison',
          question: 'Où l’édition papier est-elle livrée ?',
          answer:
            'Partout à Belmarais et dans les communes voisines de Lanne-sur-Mer et de Saint-Aubin, le jeudi matin. En dehors de cette zone, elle est envoyée par la poste et arrive en général le samedi.',
        },
        {
          key: 'cadeau',
          question: 'Peut-on offrir un abonnement ?',
          answer:
            'Oui, pour trois, six ou douze mois. Vous choisissez la date de début, et nous envoyons une carte à la personne qui le reçoit.',
        },
        {
          key: 'tarif-reduit',
          question: 'Existe-t-il un tarif réduit pour les petits revenus ?',
          answer:
            'Oui. Toute personne qui perçoit un minimum social peut s’abonner à Numérique pour 1 € par mois. Écrivez au service des abonnements : nous le mettrons en place sans vous demander de justificatif.',
        },
      ],
      newsletterTitle: 'Commencez par la lettre du matin',
      newsletterText:
        'Chaque jour de la semaine à 6 h, l’actualité de la ville en cinq minutes. Elle est gratuite, et c’est ainsi que la plupart de nos abonnés nous ont découverts.',
      newsletterAction: 'Recevoir la lettre',
    },
    standards: {
      title: 'Charte et corrections',
      slug: 'charte-et-corrections',
      body: (siteName) => [
        p(
          `Voici les règles auxquelles les journalistes ${du(siteName)} se tiennent. Nous les publions pour que les lecteurs puissent nous les opposer.`,
        ),
        h2('Exactitude et corrections'),
        p(
          'Nous corrigeons une erreur de fait dès que nous l’avons confirmée. La correction est ajoutée en pied d’article, datée, et dit ce qui était faux. Nous ne modifions jamais discrètement un article publié pour faire disparaître une erreur.',
        ),
        h2('Sources'),
        p(
          'Nous nommons nos sources chaque fois que c’est possible. Nous n’accordons l’anonymat que lorsqu’une source risque réellement un préjudice ou de perdre son emploi, que l’information compte, et que nous ne pouvons pas l’obtenir à visage découvert. Un rédacteur en chef connaît l’identité de chaque source anonyme.',
        ),
        h2('Indépendance'),
        p(
          'Nos journalistes n’acceptent ni cadeaux, ni voyages offerts, ni conférences rémunérées de la part de ceux qu’ils couvrent. Les critiques de restaurant et de théâtre paient leurs repas et leurs places, et le magazine les rembourse.',
        ),
        h2('Photographies'),
        p(
          'Nous ne modifions jamais le contenu d’une photographie d’actualité. Une image peut être recadrée et corrigée en exposition et en couleur, rien de plus.',
        ),
      ],
      contactTitle: 'Joindre le médiateur de la rédaction',
      contact: [
        {
          key: 'erreur',
          question: 'Signaler une erreur',
          answer:
            'Écrivez au service de la charte, 212 quai Mercier, Belmarais. Dites-nous de quel article il s’agit, ce qui est inexact et, si vous le pouvez, comment vous le savez.',
        },
        {
          key: 'plainte',
          question: 'Se plaindre de notre traitement d’un sujet',
          answer:
            'Les réclamations vont à la médiatrice de la rédaction, Awa Boateng, qui répond à chacune sous dix jours ouvrés. Si sa réponse ne vous satisfait pas, le conseil de la coopérative la réexamine.',
        },
        {
          key: 'actualisation',
          question: 'Demander la mise à jour d’un ancien article',
          answer:
            'Nous retirons rarement un article publié. Nous étudierons la mise à jour ou l’anonymisation d’un article relatant une infraction mineure vieille de plus de sept ans. Écrivez à la médiatrice avec les précisions utiles.',
        },
      ],
    },
    credits: {
      title: 'Crédits photographiques',
      slug: 'credits-photographiques',
      intro:
        'Chaque photographie de ce site est réelle et utilisée selon la licence choisie par son auteur. La ville et ses histoires sont inventées : chaque image montre donc un lieu du même genre, plutôt que le lieu nommé. Recadrées et redimensionnées, sans autre modification.',
      sourceWord: 'Source',
      licenceName: (licence) => (licence === 'Public domain' ? 'Domaine public' : licence),
    },
  },
  menu: {
    about: 'À propos',
    subscribe: 'S’abonner',
    standards: 'Charte et corrections',
    credits: 'Crédits photographiques',
  },
  widgets: {
    searchTitle: 'Chercher dans les archives',
    searchPlaceholder: 'Articles, personnes, lieux',
    latestTitle: 'Dernières publications',
    sectionsTitle: 'Rubriques',
    ctaHeading: 'Une information locale, financée par ses lecteurs',
    ctaBody:
      'Pas de mur payant, pas de milliardaire propriétaire. Les adhérents gardent la rédaction ouverte à tous.',
    ctaLabel: 'Devenir adhérent',
    relatedTitle: 'À lire aussi',
  },
  tagline: 'L’actualité et la culture de Belmarais, en toute indépendance.',
  footerNote:
    'Publié par la Coopérative de presse du Port, 212 quai Mercier, Belmarais. Les lettres à la rédaction et les demandes de correction vont au service de la charte, à la même adresse.',
}
