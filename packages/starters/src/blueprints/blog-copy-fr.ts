import type { BlogCopy } from './blog-copy.js'
import { bullet, figure, h2, numbered, p, quote, rule } from './blog-rich.js'

/**
 * Le blog en français. Voir `blog-copy.ts` pour la forme.
 *
 * Écrit pour un lecteur français, pas traduit de l’anglais : l’autrice vit à
 * Toulouse, corrige des manuscrits pour une maison d’édition universitaire à
 * Montauban et lit dans le train. Les espaces insécables devant `: ; ? !` et
 * à l’intérieur des « guillemets » sont écrites telles quelles (U+00A0) ;
 * un test interdit l’espace ordinaire devant la ponctuation haute.
 */
export const BLOG_COPY_FR: BlogCopy = {
  locale: 'fr',
  defaultPublicationName: 'Carnets de quai',
  schema: {
    category: { name: 'categorie', singular: 'Catégorie', plural: 'Catégories' },
    tag: { name: 'etiquette', singular: 'Étiquette', plural: 'Étiquettes' },
    post: { singular: 'Article', plural: 'Articles' },
    page: { singular: 'Page', plural: 'Pages' },
  },
  categories: [
    {
      name: 'Lecture',
      slug: 'lecture',
      description:
        'Des livres relus et des livres abandonnés, et ce qu’un trajet en train fait à l’attention.',
    },
    {
      name: 'Écriture',
      slug: 'ecriture',
      description: 'Brouillons, révision, carnets, et le travail peu glorieux d’en finir.',
    },
    {
      name: 'Marche',
      slug: 'marche',
      description: 'Des itinéraires pris lentement, et la pensée qui se fait en chemin.',
    },
    {
      name: 'Lettres',
      slug: 'lettres',
      description: 'De courtes notes un dimanche sur deux, plus proches de la correspondance.',
    },
  ],
  tags: [
    { name: 'Brouillons', slug: 'brouillons' },
    { name: 'Révision', slug: 'revision' },
    { name: 'Carnets', slug: 'carnets' },
    { name: 'Habitudes', slug: 'habitudes' },
    { name: 'Trains', slug: 'trains' },
    { name: 'Bibliothèques', slug: 'bibliotheques' },
    { name: 'Relire', slug: 'relire' },
    { name: 'Attention', slug: 'attention' },
  ],
  featuredSlug: 'a-quoi-sert-la-deuxieme-version',
  latestLetterSlug: 'lettre-ce-que-jai-lu-en-aout',
  lettersCategorySlug: 'lettres',
  slugs: {
    home: 'home',
    about: 'a-propos',
    archive: 'archives',
    newsletter: 'lettre-du-dimanche',
    credits: 'credits-photo',
  },
  home: {
    title: 'Accueil',
    seoDescription: (siteName) =>
      `${siteName} : essais et lettres sur la lecture, l’écriture et la marche.`,
    eyebrow: 'Pour commencer',
    readEssay: 'Lire l’essai',
    latestTitle: 'Dernières parutions',
    epigraph: {
      text: 'Je n’ai pas plus fait mon livre que mon livre ne m’a fait.',
      author: 'Michel de Montaigne',
      role: 'Essais, livre II, chapitre 18',
    },
    archiveTitle: 'Dans les archives',
    moreTitle: 'Quelques essais de plus',
    subjectsTitle: 'De quoi je parle',
    letterTitle: 'La lettre du dimanche',
    letterText:
      'Un dimanche sur deux, une courte lettre sur ce que j’ai lu et sur ce que mes carnets ressassent. Chacune est publiée ici et dans le flux.',
    letterFollow: 'Comment la suivre',
    letterLatest: 'Lire la dernière lettre',
  },
  about: {
    title: 'À propos',
    body: ({ siteName, desk }) => [
      p(
        `${siteName} est l’endroit où je publie des essais et des lettres sur la lecture, l’écriture et la marche. ` +
          'Il est né en 2024 pour une raison simple : finir des choses. J’avais treize ans de carnets ' +
          'et presque rien dedans qu’une autre personne puisse lire.',
      ),
      p(
        'J’habite Toulouse et je travaille trois jours par semaine comme correctrice dans une maison ' +
          'd’édition universitaire installée à Montauban, ce qui explique que tant de ces pages aient ' +
          'été écrites dans un train. Les deux autres jours, j’écris, surtout le matin, et d’abord à la main.',
      ),
      ...figure(
        desk,
        'Le bureau près de la fenêtre, où ont été écrits les textes qui ne l’ont pas été dans le train.',
      ),
      h2('Ce que vous trouverez ici'),
      p(
        'Des essais, à peu près un par mois, de mille à deux mille mots, sur ce que mes carnets ' +
          'tournent et retournent. Des lettres un dimanche sur deux, plus courtes, plus proches de ce ' +
          'que j’écrirais à une amie. Tout est classé dans l’une de quatre rubriques, et les ' +
          'archives rangent le tout par année.',
      ),
      h2('Comment c’est fabriqué'),
      p(
        'Chaque texte commence dans un fichier de texte brut et passe par deux versions complètes au ' +
          'moins avant de paraître ici. Pas de publicité, pas de lien sponsorisé, pas de traçage au-delà ' +
          'd’un compteur de visites qui ne retient rien de vous. Les corrections se font sur place et ' +
          'sont signalées à la fin du texte.',
      ),
    ],
    faqTitle: 'Les questions des lecteurs',
    faq: (siteName) => [
      {
        key: 'demo-faq-cadence',
        question: 'À quel rythme publiez-vous ?',
        answer:
          'Un essai environ une fois par mois, une lettre un dimanche sur deux. Rien ne paraît pour boucher un trou : un essai qui n’est pas prêt attend le mois suivant.',
      },
      {
        key: 'demo-faq-quoting',
        question: 'Puis-je citer ou reprendre un texte ?',
        answer:
          'Citez autant que nécessaire, avec un lien vers l’original. Pour reprendre un texte en entier, écrivez-moi d’abord ; la réponse est presque toujours oui.',
      },
      {
        key: 'demo-faq-guests',
        question: 'Publiez-vous des textes d’invités ?',
        answer: `Non. Tout ce qui paraît sur ${siteName} est écrit par une seule personne, et c’est à peu près tout l’intérêt de la chose.`,
      },
      {
        key: 'demo-faq-feed',
        question: 'Y a-t-il un flux RSS ?',
        answer:
          'Oui. Il contient chaque essai et chaque lettre en entier, et son adresse figure au bas de toutes les pages.',
      },
    ],
  },
  archive: {
    title: 'Archives',
    intro: (siteName) =>
      `Tous les essais et toutes les lettres parus sur ${siteName}, du plus récent au plus ancien, regroupés par année.`,
  },
  newsletter: {
    title: 'La lettre du dimanche',
    paragraphs: (siteName) => [
      'Un dimanche sur deux, j’écris une courte lettre : ce que j’ai lu, un paragraphe ou deux sur ' +
        'ce que mes carnets ressassent en ce moment, et parfois la première version d’une idée qui ' +
        'deviendra un essai quelques mois plus tard.',
      `Chaque lettre paraît sur ${siteName} le dimanche matin, classée dans Lettres, et le flux ` +
        'la diffuse en entier à la même heure. Un lecteur de flux est le moyen le plus simple de ' +
        'suivre, et c’est celui que j’utilise moi-même.',
      'Pas de sponsors, pas de série de messages de bienvenue. Les réponses m’arrivent directement, ' +
        'et plusieurs lettres sont nées d’une réponse.',
    ],
    ctaTitle: 'Suivre les lettres',
    ctaText:
      'Le flux contient chaque lettre et chaque essai en entier, le matin même de leur parution.',
    subscribe: 'S’abonner au flux',
    past: 'Lire les lettres passées',
  },
  credits: {
    title: 'Crédits photo',
    intro:
      'Toutes les photographies de ce site sont réelles, aucune n’est générée, et chacune est utilisée selon la licence choisie par son auteur. Elles ont été recadrées et redimensionnées ; rien d’autre n’a été modifié.',
    line: (credit) =>
      `${credit.title}, de ${credit.author}. Licence ${credit.licence}. ${credit.source}`,
  },
  menus: {
    header: [
      { label: 'Archives', url: '/archives' },
      { label: 'À propos', url: '/a-propos' },
    ],
    footer: [
      { label: 'Archives', url: '/archives' },
      { label: 'À propos', url: '/a-propos' },
      { label: 'La lettre du dimanche', url: '/lettre-du-dimanche' },
      { label: 'Flux RSS', url: '/feed.xml' },
      { label: 'Crédits photo', url: '/credits-photo' },
    ],
    headerAction: { label: 'S’abonner', url: '/lettre-du-dimanche' },
  },
  settings: {
    tagline: 'Essais et lettres sur la lecture, l’écriture et la marche.',
    footerNote:
      'Écrit à Toulouse et dans le train de Montauban. Citez librement, avec un lien vers l’original.',
    socialLinks: [
      { label: 'Mastodon', url: 'https://mastodon.social/@example' },
      { label: 'Bluesky', url: 'https://bsky.app/profile/example.bsky.social' },
      { label: 'Instagram', url: 'https://instagram.com/example' },
    ],
  },
  widgets: {
    aboutTitle: 'À propos',
    aboutBody:
      'Essais et lettres d’une correctrice qui vit à Toulouse et écrit presque chaque matin, souvent dans le train de Montauban. Un essai par mois, une lettre un dimanche sur deux.',
    aboutLink: 'En savoir plus',
    searchTitle: 'Rechercher',
    searchPlaceholder: 'Essais et lettres',
    recentTitle: 'Récemment',
    subjectsTitle: 'Rubriques',
    tagsTitle: 'Étiquettes',
    yearTitle: 'Par année',
    relatedTitle: 'À lire ensuite',
  },
  mediaAlt: {
    'notebook-and-coffee':
      'Un carnet fermé et une enveloppe kraft à côté d’un café au lait et d’un stylo sur une table en bois',
    desk: 'Un bureau clair près d’une fenêtre à rideaux, avec un ordinateur portable ouvert et une petite plante',
    notebooks: 'Une haute pile de carnets usés, tenus par des élastiques, sur un établi en bois',
    platform:
      'Un quai de gare désert éclairé par le soleil levant, avec un train qui approche au loin',
    'pour-over':
      'De l’eau versée sur du café moulu dans un filtre en papier conique, lors d’une préparation à la main',
    typing:
      'Gros plan sur deux mains qui tapent sur le clavier d’un ordinateur portable, l’une portant une alliance',
    library:
      'La façade en brique rouge d’une petite bibliothèque municipale, sa porte encadrée d’une arche et de deux lampadaires',
  },
  posts: [
    {
      title: 'Pourquoi j’écris encore mes brouillons en texte brut',
      slug: 'pourquoi-jecris-en-texte-brut',
      topic: 'Brouillons',
      cover: 'typing',
      excerpt:
        'Neuf applications d’écriture en huit ans, et le seul format de fichier qui les a toutes survécu.',
      publishedAt: '2024-02-11T08:30:00.000Z',
      categorySlug: 'ecriture',
      tagSlugs: ['brouillons', 'habitudes'],
      body: () => [
        p(
          'Entre 2016 et 2024, j’ai payé neuf applications d’écriture. J’ai gardé les reçus parce que ' +
            'j’en avais honte, ce qui est aussi une façon de tenir ses comptes. Chacune promettait un ' +
            'endroit plus calme pour penser. Chacune, en moins de deux ans, avait ajouté une barre ' +
            'latérale, un témoin de synchronisation, un compteur de séries et une bannière annonçant ' +
            'la nouvelle formule.',
        ),
        p(
          'Les brouillons de ces années sont aujourd’hui éparpillés dans des formats d’export que je ' +
            'ne sais plus ouvrir sans l’application qui les a produits. Deux de ces applications ' +
            'n’existent plus. L’une avait transformé mes notes de bas de page en un bloc propriétaire ' +
            'qui s’exporte en une rangée de points d’interrogation.',
        ),
        h2('Ce que garde un fichier texte'),
        p(
          'Un fichier texte garde trois choses que les autres ont fini par me perdre. Il s’ouvre sur ' +
            'toutes les machines que j’ai eues, y compris l’ordinateur prêté sur la table de cuisine ' +
            'de ma sœur. Il s’ouvrira encore dans vingt ans, puisque son format, c’est les mots et ' +
            'rien d’autre. Et il ne me demande rien pendant que j’écris : pas de score à battre, pas ' +
            'de badge à gagner.',
        ),
        bullet('Un dossier par texte, nommé d’après la date à laquelle je l’ai commencé.'),
        bullet('Un fichier par version, numéroté, jamais écrasé.'),
        bullet(
          'Un fichier de notes à côté, pour tout ce que je coupe, car je finis toujours par le vouloir.',
        ),
        p(
          'Le dossier de ce texte contient quatre versions et un fichier de notes plus long que chacune ' +
            'd’elles. Presque tout ce que j’aime encore dans la version finale vient de ce fichier de ' +
            'notes, au troisième passage.',
        ),
        p(
          'La mise en forme attend la fin. Les italiques sont des tirets bas, les titres une ligne de ' +
            'majuscules, et un lien une adresse seule sur sa ligne. Quand un texte est terminé, je le ' +
            'colle dans le site et je passe dix minutes à le composer proprement ; ces dix minutes sont ' +
            'agréables justement parce que l’écriture, elle, est déjà faite.',
        ),
        quote('L’outil en qui j’ai confiance est celui qui n’a rien à dire sur mon écriture.'),
        p(
          'Je n’ai rien contre les bons logiciels. J’utilise tous les jours un très bon éditeur au ' +
            'travail, où je corrige les manuscrits des autres et où j’ai besoin du suivi des ' +
            'modifications. Pour mes premiers jets, je veux moins que cela : un curseur qui clignote, ' +
            'et la certitude que le fichier sera encore là quand je reviendrai, en quelque année que ce soit.',
        ),
      ],
    },
    {
      title: 'Le long chemin jusqu’à la bibliothèque',
      slug: 'le-long-chemin-jusqua-la-bibliotheque',
      topic: 'Bibliothèques',
      cover: 'library',
      excerpt:
        'Quarante minutes à pied au lieu de douze en métro, deux fois par semaine, et ce à quoi servait finalement cette demi-heure de plus.',
      publishedAt: '2024-05-19T07:15:00.000Z',
      categorySlug: 'marche',
      tagSlugs: ['bibliotheques', 'attention'],
      body: () => [
        p(
          'Deux fois par semaine, je vais écrire à la bibliothèque municipale. Le métro met douze ' +
            'minutes et s’arrête devant la porte. À pied, il faut quarante minutes, par le jardin, le ' +
            'long du canal et une grande rue droite qui longe l’ancien dépôt des tramways. Pendant ' +
            'un an, je me suis dit que cette marche était de l’exercice. Il m’a fallu presque tout ' +
            'ce temps pour admettre que c’était la partie la plus productive de ma matinée.',
        ),
        p(
          'Je pars de chez moi avec une question sur ce que j’écris, souvent petite : pourquoi la ' +
            'deuxième partie traîne, si un exemple a sa place, ce que doit faire la dernière phrase. Je ' +
            'ne prends aucune note en chemin. Au canal, la question a généralement changé de forme, et ' +
            'au bout de la grande rue, je sais le plus souvent quel paragraphe ouvrir en premier.',
        ),
        h2('Pourquoi le trajet compte'),
        p(
          'J’ai essayé d’autres itinéraires. Le plus court suit l’avenue, et il ne vaut rien pour ' +
            'penser : chaque traversée réclame de l’attention, chaque arrêt de bus est une petite ' +
            'décision, celle de renoncer et de monter. Le trajet long compte trois passages piétons en ' +
            'quarante minutes et une portion de chemin de halage où personne n’attend rien de moi.',
        ),
        p(
          'Le jardin aide aussi, mais plus simplement qu’un article de bien-être ne le dirait. C’est ' +
            'le seul endroit du trajet où je croise les mêmes personnes les mêmes jours : un monsieur ' +
            'qui dresse un épagneul très réticent, et deux femmes qui courent la même boucle en sens ' +
            'inverse et se saluent à chaque croisement. Leur régularité rend la mienne moins semblable ' +
            'à un tour que je me jouerais à moi-même.',
        ),
        h2('La salle de lecture'),
        p(
          'La salle de lecture ouvre à neuf heures. Il y a vingt-quatre tables, des lampes vertes que ' +
            'personne n’allume l’été, et une règle de silence que le personnel fait respecter d’un ' +
            'regard plutôt que par un panneau. Je prends la même table quand je peux, la quatrième ' +
            'depuis la fenêtre, et j’écris à la main pendant la première heure avant d’ouvrir l’ordinateur.',
        ),
        p(
          'Le chemin du retour sert à me relire dans la tête, et c’est là que je trouve la plupart des ' +
            'phrases à supprimer. J’ai appris à me fier à ce verdict plus qu’à celui du bureau, peut-être ' +
            'parce que j’ai alors oublié combien chaque phrase m’avait coûté.',
        ),
        bullet('Laisser le téléphone dans le sac jusqu’à la porte de la bibliothèque.'),
        bullet('Emporter une seule question, jamais une liste.'),
        bullet('Prendre toujours le même chemin, pour qu’il cesse de réclamer des décisions.'),
        p(
          'Rien de tout cela ne résiste à une échéance, et je ne prétends pas le contraire. Quand le ' +
            'travail presse, je prends le métro comme tout le monde. Les textes de ce site que j’aime ' +
            'encore ont presque tous été commencés sur le chemin de halage.',
        ),
      ],
    },
    {
      title: 'Lettre : à quoi sert un cahier de citations',
      slug: 'lettre-le-cahier-de-citations',
      topic: 'Carnets',
      excerpt:
        'Une lectrice m’a demandé comment je garde les passages que je veux retenir des livres que je lis. La réponse passe par un crayon et beaucoup de pages vides.',
      publishedAt: '2024-08-04T06:45:00.000Z',
      categorySlug: 'lettres',
      tagSlugs: ['carnets', 'relire'],
      body: () => [
        p(
          'Cette lettre est née d’une réponse à une lectrice de Bordeaux, qui voulait savoir comment ' +
            'je garde la trace de mes citations, et si j’utilise une application pour cela. Je tiens un ' +
            'cahier de citations, c’est-à-dire un cahier où l’on recopie à la main les passages qui ' +
            'comptent, et j’en tiens un depuis 2015.',
        ),
        p(
          'Les règles sont peu nombreuses. Un passage n’entre que si je le recopie à la main, avec le ' +
            'numéro de page et la date. Si je n’ai pas envie de le recopier, c’est qu’il ne m’importait ' +
            'pas assez, et cette seule règle élimine neuf dixièmes de ce que j’aurais surligné.',
        ),
        bullet('Recopier à la main, ne jamais coller.'),
        bullet('Noter la date, le livre et la page sur la même ligne que le passage.'),
        bullet('Laisser vierge la page en regard, pour ce qu’on en pensera plus tard.'),
        p(
          'La page en regard est la partie qui compte. Des mois après, en relisant, j’écris une ligne ou ' +
            'deux face à la citation : où elle est revenue, avec quoi elle discutait, si j’y crois encore. ' +
            'Les meilleures entrées portent trois ou quatre de ces notes, à des stylos différents, ' +
            'étalées sur plusieurs années.',
        ),
        p(
          'J’appelais cela un registre de lecture. C’est plutôt un registre de relecture. Un passage est ' +
            'rarement utile le jour où je le recopie. Il le devient la troisième fois que j’ouvre le ' +
            'livre au hasard dans un train et que je découvre qu’une phrase de 2014 a discrètement ' +
            'répondu à une question qui me bloque cette semaine.',
        ),
        p(
          'Merci d’avoir écrit. Les réponses à ces lettres me parviennent directement, et c’est ' +
            'souvent d’elles que naît la suivante.',
        ),
      ],
    },
    {
      title: 'À quoi sert la deuxième version',
      slug: 'a-quoi-sert-la-deuxieme-version',
      topic: 'Révision',
      excerpt:
        'Un premier jet dit de quoi parle un texte. La deuxième version dit à quoi il sert, et l’essentiel du travail consiste à décider de ce dont il peut se passer.',
      publishedAt: '2024-10-20T08:00:00.000Z',
      cover: 'notebook-and-coffee',
      categorySlug: 'ecriture',
      tagSlugs: ['revision', 'brouillons'],
      body: () => [
        p(
          'Trois jours par semaine, je corrige les manuscrits des autres pour une maison d’édition ' +
            'universitaire, et ce que je rencontre le plus souvent, c’est un premier jet abouti que son ' +
            'auteur prend pour une deuxième version. Les phrases ont été améliorées, les virgules sont ' +
            'à leur place. Le texte fait pourtant ce qu’il faisait la première fois : il se dirige ' +
            'vers son idée en flânant et y parvient à la dernière page, un peu surpris.',
        ),
        p(
          'Je le reconnais parce que je le fais aussi. Un premier jet, c’est la façon dont on découvre ' +
            'ce qu’on pense, et il suit presque toujours l’ordre dans lequel la pensée est venue, ' +
            'rarement celui dont un lecteur a besoin. La deuxième version existe pour corriger cela, et ' +
            'polir les phrases est le moyen le plus commode de s’en dispenser.',
        ),
        h2('Se lire comme un inconnu'),
        p(
          'La première étape ne demande aucune écriture. J’imprime le texte et je le lis là où je lirais ' +
            'celui d’un autre : dans le train, ou dans le fauteuil près de la fenêtre, avec un café qui ' +
            'refroidit. Je ne corrige rien à ce passage. Je mets seulement un trait en marge chaque fois ' +
            'que mon attention décroche.',
        ),
        p(
          'Ces traits sont l’éditeur le plus honnête que je connaisse, et ils s’agglutinent. Il y a ' +
            'presque toujours, au milieu, trois ou quatre paragraphes où moi, l’autrice, la seule ' +
            'lectrice assurée d’être intéressée, me suis mise à penser au déjeuner. Ce passage-là, ' +
            'c’est le texte qui s’explique à lui-même.',
        ),
        p(
          'Une fois les traits posés, je relis à voix haute les passages marqués. Ma voix trouve ce que ' +
            'l’œil pardonne : une phrase qui me laisse à bout de souffle, un mot répété à trois lignes ' +
            'd’intervalle, une plaisanterie qui ne fonctionne que dans le silence. Je le fais à mi-voix, ' +
            'dans une pièce vide, et j’ai cessé de me sentir ridicule.',
        ),
        h2('Écrire la phrase unique'),
        p(
          'Avant de toucher au texte, j’écris sur une feuille à part une seule phrase qui dit ce que le ' +
            'texte doit permettre au lecteur de voir ou de faire, et qu’il ne pouvait pas avant. Il me ' +
            'faut plusieurs essais, et les essais ratés sont utiles : chacun décrit un autre essai que je ' +
            'pourrais écrire à la place.',
        ),
        p(
          'Pour celui-ci, la phrase était : le lecteur doit sortir capable de distinguer une version ' +
            'révisée d’une version simplement polie. Tout ce qui ne sert pas cette phrase devient un ' +
            'candidat au fichier de notes.',
        ),
        quote('L’essentiel de la révision consiste à décider de ce dont le texte peut se passer.'),
        h2('Couper dans le bon ordre'),
        p(
          'Couper, c’est là que la plupart des révisions s’enlisent, parce qu’on a l’impression de ' +
            'perdre du travail. Je coupe dans un ordre fixe, qui rend la chose supportable.',
        ),
        numbered(
          'Les sections entières qui servent une autre phrase. Elles partent intactes dans le fichier ' +
            'de notes, souvent avec une ligne sur l’autre essai auquel elles appartiennent.',
        ),
        numbered(
          'Les paragraphes qui répètent une idée déjà claire. La seconde formulation est en général la ' +
            'meilleure ; je la remonte et je supprime la première.',
        ),
        numbered(
          'Les exemples qui illustrent deux fois le même point. Un exemple précis fait plus que trois ' +
            'exemples convenables.',
        ),
        numbered(
          'Les précautions oratoires : *sans doute*, *peut-être*, *d’une certaine façon*. J’en garde ' +
            'une là où le doute est réel et j’enlève les autres.',
        ),
        p(
          'C’est seulement après ces quatre passes que je regarde les phrases. Il y en a alors moins, et ' +
            'celles qui restent ont une fonction, ce qui rend beaucoup plus clair la manière de les écrire.',
        ),
        h2('Mettre la fin au début'),
        p(
          'Le changement le plus fiable que je fais, dans mes textes comme dans les manuscrits que je ' +
            'corrige, consiste à repérer le paragraphe où l’auteur énonce enfin son idée et à demander ' +
            'si elle pourrait ouvrir le texte. Une fois sur deux, oui. Il faut alors reconstruire le ' +
            'texte autour d’un lecteur qui sait déjà où il va, et cette reconstruction est l’essentiel ' +
            'd’une deuxième version.',
        ),
        p(
          'C’est inconfortable, parce que l’ancienne ouverture est souvent ce que j’aimais le mieux. ' +
            'C’est ce que j’ai écrit quand l’idée était neuve. Je garde aussi ces ouvertures dans le ' +
            'fichier de notes, et de temps en temps l’une d’elles devient la première ligne d’un ' +
            'autre texte.',
        ),
        h2('Un exemple de ce printemps'),
        p(
          'Ce printemps, j’ai travaillé sur une histoire du canal du Midi, écrite par un ancien ' +
            'éclusier qui en savait plus que quiconque. Son premier jet faisait quatre cents pages et ' +
            'suivait le canal de Toulouse à l’étang de Thau, écluse après écluse, parce que c’était ' +
            'l’ordre dans lequel il l’avait parcouru pendant quarante ans.',
        ),
        p(
          'Les phrases étaient bonnes. Le problème, c’est que le vrai sujet du livre, les familles qui ' +
            'avaient fait fonctionner les écluses sur trois générations, n’apparaissait que dans le ' +
            'dernier chapitre, où il parlait de son propre grand-père. Nous avons passé deux mois à ' +
            'remonter ce chapitre en tête et à reconstruire tout le reste pour suivre ces familles le ' +
            'long de l’eau.',
        ),
        p(
          'Il a coupé quatre-vingt-dix pages, surtout des descriptions d’écluses bâties exactement ' +
            'comme les précédentes. Il les a toutes gardées dans un dossier, et il m’a dit à la fin ' +
            'que ce dossier était le livre qu’il avait dû écrire pour trouver l’autre.',
        ),
        h2('Savoir s’arrêter'),
        p(
          'Une deuxième version est finie quand je peux la lire en inconnue sans mettre un seul trait ' +
            'en marge, et quand la phrase écrite au départ est toujours vraie d’elle. Elle l’est ' +
            'rarement quand elle donne l’impression de l’être. Cette impression arrive une version trop ' +
            'tôt, au moment où j’ai cessé de trouver des problèmes parce que j’ai cessé d’en chercher.',
        ),
        p(
          'Dans le doute, je la laisse une semaine. Le texte qui se lit encore bien au bout de sept jours ' +
            'part. Celui qui ne tient pas retourne dans son dossier avec les nouveaux traits, et le ' +
            'train fait le reste.',
        ),
        rule(),
        h2('Notes'),
        numbered(
          'Le papier me réussit le mieux, mais le cadre compte plus que le support. Le même texte dans ' +
            'une autre police, sur un autre écran, fait apparaître presque autant de défauts.',
        ),
        numbered(
          'Le fichier de notes de cet essai fait 2 300 mots. Trois ouvertures plus anciennes y sont ' +
            'rangées, et l’une d’elles est devenue le premier paragraphe d’une lettre.',
        ),
      ],
    },
    {
      title: 'Les livres que je relis chaque hiver',
      slug: 'les-livres-que-je-relis-chaque-hiver',
      topic: 'Relire',
      cover: 'pour-over',
      excerpt:
        'Cinq livres qui quittent l’étagère la première semaine de janvier, et pourquoi relire m’est devenu plus utile que lire du neuf.',
      publishedAt: '2025-01-12T09:10:00.000Z',
      categorySlug: 'lecture',
      tagSlugs: ['relire', 'habitudes'],
      body: () => [
        p(
          'Chaque année, la première semaine de janvier, les mêmes cinq livres descendent de l’étagère. ' +
            'Je n’ai pas prévu ce rituel. Il s’est constitué en une dizaine d’années, un livre après ' +
            'l’autre, et un jour j’ai remarqué que je les prenais toujours dans le même ordre.',
        ),
        p(
          'Relire a mauvaise réputation chez ceux qui tiennent des listes de lectures, parce que cela ' +
            'ressemble à un refus d’avancer. J’en suis venue à penser que c’est la seule lecture où je ' +
            'me vois changer : le livre reste exactement où il était, et moi non.',
        ),
        bullet(
          '*Vies minuscules*, de Pierre Michon. Des vies de gens obscurs, chacune tenue en quelques ' +
            'dizaines de pages. Je le lis d’une traite le premier dimanche de l’année, et il remet à ' +
            'sa juste mesure ce qu’un petit livre peut contenir.',
        ),
        bullet(
          '*Le Livre de l’été*, de Tove Jansson. Une grand-mère et sa petite-fille sur une île du golfe ' +
            'de Finlande. Chaque année, un autre chapitre est mon préféré, ce qui m’en apprend plus sur ' +
            'l’année que sur le livre.',
        ),
        bullet(
          '*Les Anneaux de Saturne*, de W. G. Sebald. Une marche sur la côte du Suffolk qui ne cesse ' +
            'de devenir autre chose. J’y ai appris qu’un essai peut flâner aussi longtemps que le ' +
            'lecteur fait confiance à celui qui marche.',
        ),
        bullet(
          '*Espèces d’espaces*, de Georges Perec. Lu en deux soirées, de la page à la chambre, de la ' +
            'chambre à la rue, puis reposé jusqu’à l’année suivante.',
        ),
        bullet(
          '*Middlemarch*, de George Eliot. Celui qui dure tout janvier. Je lis une soixantaine de pages ' +
            'par soir et je tombe encore sur des phrases dont je n’ai aucun souvenir.',
        ),
        h2('Ce que je cherche la seconde fois'),
        p(
          'La première lecture d’un bon livre porte surtout sur ce qui arrive. À la troisième ou à la ' +
            'quatrième, l’histoire s’est effacée et je peux regarder comment le livre est fait : où un ' +
            'chapitre choisit de finir, combien de temps une scène dure avant que l’auteur coupe, quels ' +
            'détails sont plantés tôt pour être repris deux cents pages plus loin.',
        ),
        p(
          'Je tiens une page de notes pour chacun des cinq, à la fin de mon cahier de citations, et j’y ' +
            'ajoute chaque année une ligne datée. Celles de *Vies minuscules* vont maintenant de 2016 à ' +
            '2025. Les lire dans l’ordre, c’est un peu lire le journal d’une version de moi plus patiente et ' +
            'un peu plus lente.',
        ),
        p(
          'En février, j’ai faim de nouveauté, et les livres neufs profitent de l’attente. Je les lis ' +
            'avec plus d’attention après un mois à regarder comment fonctionnent les anciens.',
        ),
      ],
    },
    {
      title: 'Un bureau presque vide',
      slug: 'un-bureau-presque-vide',
      topic: 'Habitudes',
      excerpt:
        'Chaque version de mon bureau qui a duré plus de quelques semaines portait moins d’objets que la précédente.',
      publishedAt: '2025-04-06T08:20:00.000Z',
      cover: 'desk',
      categorySlug: 'ecriture',
      tagSlugs: ['habitudes', 'attention'],
      body: () => [
        p(
          'Pendant des années, j’ai refait mon bureau chaque fois que je lisais un bon récit de la ' +
            'manière de travailler de quelqu’un d’autre. Un bras pour l’écran, une meilleure lampe, ' +
            'un clavier qui claque avec satisfaction. Chaque changement m’apportait une semaine à me ' +
            'sentir organisée, puis un lent retour aux mêmes brouillons inachevés.',
        ),
        p(
          'Le bureau que j’ai aujourd’hui n’a pas bougé depuis deux ans, ce qui est un record. C’est ' +
            'une table blanche, toute simple, près de la fenêtre, avec un ordinateur portable, deux ' +
            'carnets, un stylo et une petite plante qui a survécu à force d’être ignorée. Tout le reste ' +
            'vit dans un tiroir que je dois me lever pour ouvrir.',
        ),
        h2('La règle du tiroir'),
        p(
          'Le tiroir est tout le système. Pour figurer sur le bureau, un objet doit avoir été sorti du ' +
            'tiroir au moins une fois par jour pendant une semaine. Le casque a échoué. Un deuxième ' +
            'écran a échoué en deux jours. Les carnets n’ont jamais été rangés une seule fois.',
        ),
        p(
          'Ça marche parce qu’un bureau dégagé ne me demande rien quand je m’assois. Je n’ai pas à ' +
            'décider par quoi commencer. Le seul objet qui réclame de l’attention est le carnet de ' +
            'gauche, qui contient la dernière ligne de la veille.',
        ),
        h2('Ce qui est resté'),
        bullet('Un ordinateur à la luminosité baissée, sans notifications de neuf heures à midi.'),
        bullet(
          'Un carnet à spirale pour le travail du jour, et un carnet cousu pour ce qui mérite d’être gardé.',
        ),
        bullet('Un stylo, un modèle bon marché que je remplace dans n’importe quel tabac-presse.'),
        bullet('Une lampe pour les après-midi d’hiver, qui vit dans le tiroir d’avril à octobre.'),
        p(
          'La fenêtre compte plus que tout ce qu’il y a sur le bureau. Elle donne sur une rangée de ' +
            'jardinets, et le matin je regarde la lumière les traverser en attendant la première ' +
            'phrase. J’avais l’habitude de compter ce moment comme du temps perdu. Je pense maintenant ' +
            'que c’est la partie de la matinée où la phrase s’écrit quelque part où je ne la vois pas.',
        ),
        p(
          'Je n’ai aucun conseil de matériel. Le bureau qui marche est celui qu’on cesse de remarquer, ' +
            'et pour moi cela n’est arrivé que lorsqu’il n’y est plus resté presque rien à remarquer.',
        ),
      ],
    },
    {
      title: 'Quarante carnets',
      slug: 'quarante-carnets',
      topic: 'Carnets',
      excerpt:
        'Quatorze ans de carnets remplissent une étagère et demie. Cet automne, je les ai tous relus dans l’ordre, et ils contenaient autre chose que des idées.',
      publishedAt: '2025-11-09T08:05:00.000Z',
      cover: 'notebooks',
      categorySlug: 'ecriture',
      tagSlugs: ['carnets', 'habitudes'],
      body: () => [
        p(
          'En septembre, j’ai descendu de l’étagère tous les carnets que j’ai remplis depuis 2011 et je ' +
            'les ai lus dans l’ordre. Il y en a quarante. Cela m’a pris presque cinq semaines, une ' +
            'heure ou à peu près chaque soir, et c’est la chose la plus utile que j’aie faite pour mon ' +
            'écriture depuis des années, bien que très peu de cette utilité soit celle que j’attendais.',
        ),
        p(
          'J’imaginais retrouver des idées oubliées, et il y en avait quelques-unes. Ce que j’ai surtout ' +
            'trouvé, c’est la trace de ma façon de travailler, tenue sans que je remarque que je la tenais.',
        ),
        h2('Ce qu’il y a dedans'),
        p(
          'Les onze premiers ont tous le même format, de poche, à petits carreaux, achetés par ' +
            'trois. Ensuite les tailles se dispersent. Il y a un grand carnet de croquis de 2016 que ' +
            'je n’ai utilisé qu’un mois, une série de cahiers d’écolier de l’année où je voulais ' +
            'dépenser moins, et, depuis 2020, une lignée régulière de carnets A5 unis, cousus, qui ' +
            'restent ouverts à plat.',
        ),
        p('Sur l’ensemble des quarante, les pages se rangent en quatre sortes.'),
        bullet('Des listes de choses à écrire, dont la plupart n’ont jamais été écrites.'),
        bullet(
          'Des passages recopiés dans des livres, jusqu’en 2015, date à laquelle ils ont rejoint un cahier à part.',
        ),
        bullet('Des débuts de textes, souvent cinq ou six versions du même premier paragraphe.'),
        bullet(
          'Des relevés de journées ordinaires : à quelle heure j’ai commencé, où j’étais, ce qui m’a gênée.',
        ),
        p(
          'J’aurais parié que les listes et les débuts étaient la partie précieuse. Ce sont les moins ' +
            'intéressants. Les relevés de journées ordinaires, eux, je n’arrivais plus à les lâcher.',
        ),
        p(
          'Il y a aussi des trous. Le carnet dix-neuf couvre onze mois de 2018, et en l’ouvrant je me suis ' +
            'souvenue pourquoi : c’est l’année où mon père a été malade, et je n’y écrivais que sur le ' +
            'trajet vers l’hôpital Purpan. Ces pages sont courtes et très simples, et certaines des ' +
            'meilleures phrases des quarante carnets s’y trouvent.',
        ),
        h2('Les jours où j’ai vraiment écrit'),
        p(
          'Depuis 2014 environ, je note l’heure et le lieu en haut de chaque page. Je le faisais pour ' +
            'me sentir tenue de rendre des comptes. Lus ensemble, ces petits en-têtes forment une carte ' +
            'des moments où l’écriture a eu lieu.',
        ),
        p(
          'Elle a eu lieu le matin, avant neuf heures, bien plus souvent que je ne le croyais. Elle a ' +
            'eu lieu dans les trains sans commune mesure avec le temps que j’y passe. Elle n’a presque ' +
            'jamais eu lieu les soirs que je lui réservais, et pas une seule fois pendant les trois ' +
            'mois de 2017 où j’avais loué une chambre uniquement pour écrire.',
        ),
        quote(
          'Les carnets se souviennent de ma vie de travail plus exactement que moi, parce qu’ils ont été écrits avant que j’en fasse une histoire.',
        ),
        p(
          'J’ai eu pendant des années une histoire sur cette chambre. J’en gardais l’idée d’une bonne ' +
            'période. Le carnet de ces mois n’est guère que des listes de ce que je comptais faire le ' +
            'lendemain, d’une écriture de plus en plus soignée.',
        ),
        h2('L’écriture comme jauge'),
        p(
          'L’écriture elle-même est devenue le signal le plus fiable de tout l’ensemble. Quand je ' +
            'travaillais bien, les pages sont brouillonnes : ratures, flèches, une phrase glissée de ' +
            'travers dans la marge. Quand j’évitais le travail, les pages sont nettes et les listes ' +
            'longues. Je regarde maintenant les pages de la semaine le vendredi après-midi, pour cette ' +
            'raison précise. Des pages soignées veulent dire que quelque chose ne va pas.',
        ),
        p(
          'Elle montre aussi le moment où un texte prend. Il y a une page du carnet vingt-six où les ' +
            'notes d’un essai sur le jardin ouvrier de mon grand-père cessent d’être des notes pour ' +
            'devenir des phrases, à mi-page, au milieu d’une pensée. Le stylo change aussi. J’ai dû ' +
            'aller en chercher un meilleur.',
        ),
        h2('Les idées qui ont survécu'),
        p(
          'Quelques idées sont revenues de l’étagère, et la manière dont elles sont revenues est ' +
            'instructive. Le carnet sept, de 2013, porte au bas d’une page une ligne qui dit, en ' +
            'entier : la marche est le brouillon. Je l’ai écrite sur un banc au bord du canal et je n’en ' +
            'ai rien fait pendant onze ans. Elle est devenue l’essai sur le long chemin jusqu’à la ' +
            'bibliothèque, et quand je l’ai écrit je n’avais aucun souvenir de cette ligne.',
        ),
        p(
          'La même chose s’est produite trois autres fois. Chaque idée devenue un texte achevé ' +
            'apparaît dans les carnets au moins deux fois, à des années d’écart et avec d’autres mots, ' +
            'comme s’il avait fallu que j’y arrive plus d’une fois pour qu’elle reste. Les idées que j’ai ' +
            'notées une seule fois, si enthousiaste que soit l’écriture, n’ont rien donné.',
        ),
        p(
          'Cela m’a rendue plus sereine devant l’oubli. Une idée qui doit compter reviendra, et le rôle du ' +
            'carnet est de l’attraper quand elle revient.',
        ),
        h2('Ce que j’ai changé'),
        p('Les relire a changé trois choses dans ma façon de travailler, toutes petites.'),
        numbered(
          'J’écris de nouveau l’heure et le lieu en haut de chaque page. J’avais cessé vers 2021, et les ' +
            'carnets de ces années sont beaucoup plus difficiles à relire.',
        ),
        numbered(
          'Je protège les matins et les trains, et je ne planifie plus de soirées d’écriture. Les ' +
            'preuves contre elles remontent à quatorze ans.',
        ),
        numbered(
          'J’ai cessé de tenir des listes d’idées. Ce qui compte revient tout seul, généralement dans ' +
            'le mois, et les listes consignaient surtout ce dont je me sentais coupable.',
        ),
        p(
          'J’ai aussi numéroté les dos, enfin, au crayon blanc. Quarante est un chiffre satisfaisant à ' +
            'atteindre et un peu inquiétant à voir sur une étagère. Le quarante et unième est sur le ' +
            'bureau pendant que j’écris, rempli au tiers, avec le premier début de cet essai en page six.',
        ),
        rule(),
        h2('Notes'),
        numbered(
          'Les petits carreaux étaient le bon choix et je n’aurais jamais dû les quitter. Le Seyès impose ' +
            'à l’écriture une taille que les carreaux n’imposent pas.',
        ),
        numbered(
          'Plusieurs lecteurs m’ont demandé quels carnets j’utilise. Cela varie selon ce que le papetier ' +
            'du coin a en rayon, et c’est peut-être pour cela qu’ils se remplissent : aucun n’est trop ' +
            'beau pour qu’on ose y écrire.',
        ),
      ],
    },
    {
      title: 'Lettre : la semaine au ralenti',
      slug: 'lettre-la-semaine-au-ralenti',
      topic: 'Habitudes',
      excerpt:
        'La crue de la Garonne a coupé la ligne de Montauban pendant cinq jours, et ces matins sans programme sont devenus l’écriture la plus reposée de mon année.',
      publishedAt: '2026-02-15T07:30:00.000Z',
      categorySlug: 'lettres',
      tagSlugs: ['habitudes', 'attention'],
      body: ({ media }) => [
        p(
          'La crue de la Garonne a coupé la ligne de Montauban pendant cinq jours la semaine dernière, ' +
            'et la maison d’édition a demandé à ceux d’entre nous qui font le trajet de rester chez eux. ' +
            'J’avais un texte à rendre à la fin du mois et je comptais l’écrire le soir. J’ai eu ' +
            'à la place cinq matins vides et pas de train.',
        ),
        p(
          'Le premier jour a été gâché, joyeusement. J’ai fait le café lentement, lu le journal du ' +
            'samedi un lundi, et marché jusqu’au bout de la rue pour voir le canal, qui affleurait ' +
            'son quai. Le deuxième jour, je me suis assise à neuf heures par habitude et j’ai écrit ' +
            'pendant trois heures sans voir le temps passer.',
        ),
        ...figure(
          media['pour-over'],
          'Le café qui donne le rythme d’un matin lent. Il faut environ quatre minutes, à peu près le temps d’une première phrase.',
        ),
        p(
          'Le vendredi, le texte était fini, avec quinze jours d’avance, ce qui ne m’était jamais arrivé. ' +
            'J’ai cherché ce qui avait changé, et la réponse honnête est presque rien, sinon l’emploi du ' +
            'temps. Chaque matin avait la même longueur, et rien n’attendait à la fin.',
        ),
        p(
          'Je ne peux pas faire de chaque semaine une semaine de crue, mais j’en ai gardé une chose. Les ' +
            'deux jours où je travaille chez moi, la première heure n’a plus d’heure de fin. Quand la ' +
            'phrase est prête, je commence ; quand elle ne l’est pas, je refais un café. Jusqu’ici, cela ne ' +
            'm’a coûté aucune échéance.',
        ),
        p(
          'La ligne a rouvert lundi. Le train était plein de gens qui racontaient leur propre semaine ' +
            'au ralenti, et je soupçonne quelques-uns d’entre eux de chercher eux aussi comment en garder une.',
        ),
      ],
    },
    {
      title: 'Lire dans le 7 h 52',
      slug: 'lire-dans-le-7-h-52',
      topic: 'Trains',
      excerpt:
        'Trois matins par semaine, vingt-cinq minutes de Toulouse à Montauban. En six ans, ce train est devenu la meilleure salle de lecture que je connaisse, pour des raisons qui n’ont presque rien à voir avec le paysage.',
      publishedAt: '2026-05-31T08:40:00.000Z',
      cover: 'platform',
      categorySlug: 'lecture',
      tagSlugs: ['trains', 'attention'],
      body: () => [
        p(
          'Trois matins par semaine, je prends le 7 h 52 de Toulouse à Montauban. Le trajet dure ' +
            'vingt-cinq minutes, un peu plus quand la rame attend à la sortie de Saint-Jory qu’un train ' +
            'de fret se dégage, et en six ans il est devenu l’endroit où je fais l’essentiel de mes ' +
            'lectures. Je l’ai calculé le mois dernier : un peu plus de trois cents heures, soit, à mon ' +
            'rythme, une quarantaine de livres.',
        ),
        p(
          'Le train n’a aucune vertu particulière en tant que lieu. C’est une rame courte, souvent trop ' +
            'chauffée et parfois trop pleine. Ce qu’il a, c’est une structure qu’aucun autre moment de ' +
            'ma semaine n’offre : un début fixe, une fin fixe, et rien que j’aie le droit de faire entre les deux.',
        ),
        h2('Une salle de lecture avec un horaire'),
        p(
          'La plupart des conseils pour lire davantage sont des conseils pour trouver du temps, et le ' +
            'temps n’a jamais été mon problème. J’ai largement des soirées où une heure est libre. Ce qui ' +
            'leur manque, c’est une limite. Chez moi, une heure de lecture est une heure que je pourrais ' +
            'passer à autre chose, et le livre doit gagner cette discussion toutes les quelques pages.',
        ),
        p(
          'Dans le train, la discussion est close avant de commencer. Il n’y a nulle part où aller, ' +
            'le travail ne commencera pas avant Montauban, et vingt-cinq minutes suffisent pour lire ' +
            'un chapitre sans suffire à me faire penser que je devrais en faire quelque chose de plus sérieux.',
        ),
        quote('Dans le train, le livre n’a pas à gagner une discussion contre le reste de ma vie.'),
        h2('Ce que j’y lis'),
        p(
          'Au bout d’un an, j’ai remarqué que je choisis autrement mes livres de train. Ce ne sont ' +
            'presque jamais ceux que j’ai le plus envie de lire. Ils ont des sections assez courtes pour ' +
            'survivre à une annonce sur la gare suivante, et assez de longueur pour durer quelques ' +
            'semaines, si bien que le livre fait partie du voyage.',
        ),
        bullet(
          'Des recueils d’essais, qui se terminent avant Montauban plus souvent que des chapitres.',
        ),
        bullet(
          'De longs romans en chapitres brefs. Dickens, écrit pour paraître par livraisons, est idéal.',
        ),
        bullet('Des livres de voyage, lus en traversant un autre pays que celui de l’auteur.'),
        bullet('Tout ce que j’aurais honte de lire chez moi, c’est-à-dire surtout de la poésie.'),
        p(
          'Ce que je ne lis pas dans le train, c’est tout ce qui est pour le travail. La maison d’édition ' +
            'envoie les manuscrits en fichiers, et dès le premier mois je me suis fixé une règle : ' +
            'l’ordinateur reste dans le sac jusqu’au quai de Montauban. Je l’ai enfreinte peut-être cinq ' +
            'fois, chaque fois par nécessité, et chaque fois le reste de la journée m’a semblé un peu plus courte.',
        ),
        h2('Du papier, surtout'),
        p(
          'Je lis du papier dans le train. J’ai essayé une liseuse pendant presque toute l’année 2022 : ' +
            'elle était plus légère, elle contenait plus, et je lisais moins. Sur un écran, un livre est ' +
            'à un geste du suivant, et en vingt-cinq minutes je passais trop de ces minutes à choisir.',
        ),
        p(
          'Un livre de poche a l’avantage de n’être que lui-même. Il garde aussi une trace : un ticket ' +
            'servant de marque-page, un rond de café d’un matin où la rame a tangué, un coin de page ' +
            'plié au paragraphe que je voulais recopier en arrivant à mon bureau. Certains livres sont ' +
            'désormais inséparables de la ligne.',
        ),
        bullet(
          '*La Maison d’Âpre-Vent*, sur onze semaines de l’hiver 2021, un chapitre par trajet, ce qui reste ' +
            'bien plus rapide que pour ses premiers lecteurs.',
        ),
        bullet(
          '*L’Usage du monde*, de Nicolas Bouvier, au printemps 2023, pendant que les champs derrière la ' +
            'vitre passaient du brun au vert.',
        ),
        bullet(
          'Les *Essais* de Montaigne, en un gros volume de poche qui a fait le trajet de Montauban ' +
            'environ deux cents fois et que je n’ai toujours pas fini.',
        ),
        h2('La compagnie'),
        p(
          'Le 7 h 52 a ses habitués. Un homme au blouson vert fait les mots croisés et les termine, pour ' +
            'autant que je puisse en juger, tous les jours avant Saint-Jory. Un étudiant lit des manuels ' +
            'de droit avec un surligneur dans chaque main. Pendant trois ans, une femme en face de moi a ' +
            'lu le même gros livre de poche, et je n’ai jamais su lequel, parce qu’elle y gardait une ' +
            'couverture en papier.',
        ),
        p(
          'Personne ne parle. Une voiture pleine de gens qui lisent en silence a une qualité particulière, ' +
            'et j’en suis venue à penser qu’elle fait une partie du travail. Il est plus facile de garder ' +
            'son attention quand tout le monde autour garde la sienne.',
        ),
        h2('Les soirs sont différents'),
        p(
          'Le 17 h 20 du retour est un autre train. Il est plus rempli, les gens sont fatigués, et le ' +
            'trajet qui me porte si aisément jusqu’à Montauban paraît plus long dans l’autre sens. J’ai ' +
            'cessé d’essayer d’y lire. Je regarde les champs après Saint-Jory et je laisse le manuscrit ' +
            'de la journée se déposer.',
        ),
        p(
          'Pendant longtemps, j’ai compté cela comme du temps perdu. Les carnets ne sont pas d’accord : un ' +
            'nombre surprenant de premières lignes sont datées du soir, du 17 h 20, quelque part entre ' +
            'Montauban et Toulouse.',
        ),
        p(
          'Si je quittais la maison d’édition demain, c’est le train qui me manquerait. Je me suis ' +
            'demandé si je pourrais le recréer à une table de cuisine, avec vingt-cinq minutes ' +
            'fixes, un livre choisi pour l’occasion et l’ordinateur dans une autre pièce. Je soupçonne ' +
            'que l’horaire fait plus que ce que je pourrais reproduire. Pour l’instant, je suis ' +
            'reconnaissante au 7 h 52, retards compris.',
        ),
        rule(),
        h2('Notes'),
        numbered(
          'Mon rythme est d’environ quarante pages à l’heure pour un roman, et plutôt vingt-cinq pour ' +
            'tout ce qui a des notes de bas de page.',
        ),
        numbered(
          'L’homme au blouson vert a été absent presque tout le mois de mars. Il est revenu en avril ' +
            'avec un blouson neuf, vert aussi.',
        ),
      ],
    },
    {
      title: 'Lettre : ce que j’ai lu en août',
      slug: 'lettre-ce-que-jai-lu-en-aout',
      topic: 'Relire',
      excerpt:
        'Un mois avec moins de trains et plus de temps au jardin : trois livres finis, un abandonné, et une note sur la lecture lente quand il fait chaud.',
      publishedAt: '2026-08-30T07:00:00.000Z',
      categorySlug: 'lettres',
      tagSlugs: ['relire', 'trains'],
      body: () => [
        p(
          'Août est le mois le plus calme à la maison d’édition, et je n’ai pris le train que quatre ' +
            'fois. La lecture est passée au jardin, où elle est plus lente, parce qu’il y a toujours ' +
            'une raison de lever les yeux.',
        ),
        bullet(
          '*Un balcon en forêt*, de Julien Gracq. Un blockhaus dans les Ardennes, l’attente, la forêt. ' +
            'Écrit avec une telle intensité que je ne pouvais en lire que dix pages à la fois. Je l’ai ' +
            'fini en trois semaines et je ne l’aurais pas voulu plus vite.',
        ),
        bullet(
          '*L’Art de marcher*, de Rebecca Solnit. Une histoire de la marche que je voulais lire depuis ' +
            'des années. Les chapitres sur la marche en ville m’ont donné le début d’un essai sur le ' +
            'canal, qui paraîtra peut-être ici à l’automne.',
        ),
        bullet(
          '*Stoner*, de John Williams. Une relecture, la quatrième. Chaque fois, je remarque une ' +
            'bonté différente.',
        ),
        bullet(
          'Un roman abandonné à la page quatre-vingt-dix. Je ne le nommerai pas, car la faute tenait ' +
            'probablement à la météo.',
        ),
        p(
          'Lire dans la chaleur m’a appris ce que mes carnets savaient déjà. Je lis mieux en séances ' +
            'courtes qui ont une fin nette, et au jardin il n’y a pas de Montauban où arriver. J’ai donc ' +
            'commencé à régler un minuteur sur trente minutes, ce qui m’a paru ridicule pendant deux ' +
            'jours environ, puis m’a rappelé le train.',
        ),
        p(
          'Septembre ramène l’horaire, et avec lui le 7 h 52. Le premier livre de train de l’automne est ' +
            'déjà dans mon sac : un recueil d’essais assez courts pour être finis avant Montauban.',
        ),
        p(
          'Comme toujours, les réponses à cette lettre m’arrivent directement. Deux des livres de ce mois ' +
            'étaient des suggestions de lecteurs, et je les en remercie.',
        ),
      ],
    },
  ],
}
