import type { StoreCopy } from './store-copy.js'

const SHIPS = 'Expédié depuis Lyon sous deux jours ouvrés. Retour gratuit sous 30 jours.'

/** The `store` blueprint in French: a shop of the Croix-Rousse, in Lyon. */
export const STORE_COPY_FR: StoreCopy = {
  locale: 'fr',
  defaultShopName: 'Atelier Goods',
  schema: {
    routes: { product: '/boutique/:slug', category: '/categorie/:slug' },
    labels: {
      product: { singular: 'Produit', plural: 'Produits' },
      category: { singular: 'Catégorie', plural: 'Catégories' },
    },
  },
  pageSlugs: {
    home: 'home',
    shop: 'boutique',
    about: 'a-propos',
    order: 'commander',
    delivery: 'livraison-et-retours',
    repairs: 'reparations',
    contact: 'contact',
    terms: 'conditions',
    credits: 'credits-photos',
  },
  categories: [
    {
      id: 'kitchen',
      slug: 'cuisine',
      name: 'Cuisine',
      summary:
        'Fonte, cuivre, émail et aluminium\u00a0: des ustensiles qui servent tous les jours, achetés à des ateliers qui savent aussi fournir les pièces de rechange.',
      photoOf: 'skillet',
      relatedTitle: 'Encore pour la cuisine',
      makers: [
        'Rien dans la cuisine n’est revêtu et rien n’a besoin d’être ménagé. La fonte, le cuivre, l’émail et l’aluminium durent des décennies quand on s’en sert tous les jours, ce qui est la seule façon dont nous les éprouvons.',
        'Nous cuisinons avec chaque pièce à l’atelier avant de la vendre, et nous remettons en état les poêles en fonte de nos clients pour le prix de l’huile.',
      ],
    },
    {
      id: 'home',
      slug: 'maison',
      name: 'Maison',
      summary:
        'Un plaid crocheté, un vase en grès, un bol en bois tourné et un savon séché trois ans\u00a0: des pièces faites à la main, une par une, dans de petits ateliers.',
      photoOf: 'stoneware-bottles',
      relatedTitle: 'Encore pour la maison',
      makers: [
        'Les pièces de la maison viennent de quatre ateliers de moins de cinq personnes, à La Borne, à Saint-Claude, à Roanne et à Tripoli. Elles sont faites une à une, et deux vases tournés le même jour ne se ressemblent jamais tout à fait.',
        'Ces ateliers fabriquent en séries courtes, deux ou trois fois par an. Une pièce épuisée revient avec la série suivante, et nous prévenons ceux qui nous l’ont demandé.',
      ],
    },
    {
      id: 'carry',
      slug: 'a-porter',
      name: 'À porter',
      summary:
        'Du cuir et de la laine pour le dos, les pieds et les mains\u00a0: des bottines qui se ressemellent, un sac de voyage, un portefeuille et un pull qui se reprise.',
      photoOf: 'leather-duffel',
      relatedTitle: 'Encore à porter',
      makers: [
        'Le cuir vient d’une tannerie à l’écorce de la Drôme et la laine d’une bonneterie de l’Aube. Les bottines et le sac de voyage sont montés à Romans-sur-Isère, le portefeuille est cousu à l’atelier, derrière la boutique.',
        'Chaque pièce se répare tant que nous la vendons\u00a0: couture, boucle, semelle, bout de manche. Rapportez-la à l’atelier ou renvoyez-la nous, et nous la remettons en état.',
      ],
    },
  ],
  products: [
    {
      key: 'enamel-mug',
      slug: 'mug-emaille',
      name: 'Mug émaillé',
      category: 'kitchen',
      price: 22,
      inStock: true,
      description:
        'Un mug de 35\u00a0cl en acier émaillé blanc, au liseré noir sur le bord roulé. Assez léger pour le sac à dos, assez beau pour la table.',
      material: 'Acier émaillé blanc, bord noir.',
      capacity: '35\u00a0cl',
      dimensions: '8,5\u00a0cm de diamètre, 8\u00a0cm de haut.',
      origin: 'Olkusz, Pologne',
      care: 'Passe au lave-vaisselle. Un éclat dans l’émail ne s’étend pas\u00a0: continuez à vous en servir.',
      delivery: SHIPS,
      story: [
        'Embouti et émaillé à Olkusz, une ville qui fabrique de la vaisselle émaillée depuis plus d’un siècle. Chaque mug est trempé deux fois puis cuit à 800\u00a0°C, ce qui donne à l’émail sa profondeur et une surface que le café ne tache pas.',
        'Il va sur un réchaud de camping comme au four. Nous buvons dans ces mugs au comptoir de l’atelier chaque matin, et certains servent tous les jours depuis six ans.',
      ],
      alt: 'Mug émaillé blanc au liseré noir, vu de trois quarts sur un fond clair',
    },
    {
      key: 'skillet',
      slug: 'poele-en-fonte',
      name: 'Poêle en fonte',
      category: 'kitchen',
      price: 89,
      inStock: true,
      description:
        'Une poêle de 26\u00a0cm coulée d’une seule pièce, avec un bec verseur de chaque côté et une anse d’appoint. Culottée à l’huile de lin, elle est prête à cuire.',
      material: 'Fonte, culottée avec trois couches d’huile de lin.',
      dimensions: '26\u00a0cm de diamètre, 5\u00a0cm de profondeur, 45\u00a0cm avec le manche.',
      weight: '2,6\u00a0kg',
      origin: 'Ardennes, France',
      care: 'Rincer à l’eau chaude avec une brosse, sécher sur le feu, passer un voile d’huile. Jamais au lave-vaisselle.',
      delivery:
        'Expédiée depuis Lyon sous deux jours ouvrés par transporteur suivi. Retour gratuit sous 30 jours.',
      story: [
        'Coulée en moule de sable dans une fonderie des Ardennes qui fabrique par ailleurs des pièces de pompes à eau. La surface de cuisson est usinée plus lisse que sur la plupart des fontes\u00a0: le culottage prend vite et les œufs se détachent après quelques semaines d’usage.',
        'Elle va sur le gaz, l’électrique, l’induction, au four et sur un feu de bois. Une poêle rouillée ou décapée n’est pas perdue\u00a0: nous la ponçons et la culottons de nouveau à l’atelier, pour le prix de l’huile.',
      ],
      alt: 'Poêle en fonte noire avec un bec verseur et une anse d’appoint, vue de dessus en perspective sur fond blanc',
    },
    {
      key: 'aleppo-soap',
      slug: 'savon-d-alep',
      name: 'Savon d’Alep',
      category: 'home',
      price: 9,
      inStock: true,
      description:
        'Un pain de 200\u00a0g à l’huile d’olive et à l’huile de baie de laurier, séché trois ans à l’air libre. Il mousse peu, lave en douceur et se garde jusqu’au dernier copeau.',
      material: 'Huile d’olive, huile de baie de laurier, soude. Sans parfum ni colorant.',
      dimensions: 'Environ 8\u00a0×\u00a08\u00a0×\u00a05\u00a0cm.',
      weight: '200\u00a0g',
      origin: 'Tripoli, Liban',
      care: 'Le poser sur un support qui draine. Il sèche entre deux usages et dure plusieurs mois.',
      delivery: SHIPS,
      story: [
        'Cuit en chaudron avec de l’huile d’olive et de l’huile de baie de laurier, coulé à la main, puis découpé en cubes et empilé en quinconce pour sécher pendant trois ans. L’extérieur brunit, le cœur reste vert\u00a0: c’est ainsi qu’on reconnaît un savon qui a vieilli comme il faut.',
        'Chaque pain porte le sceau de la savonnerie, pressé à la main avant le séchage. Nous le prenons à une famille de savonniers de Tripoli que nous visitons depuis 2017, et nous le gardons à l’atelier jusqu’à la vente, pour qu’il finisse de sécher.',
      ],
      alt: 'Pain de savon d’Alep brun-orangé, au sceau gravé, posé sur une surface brillante qui le reflète',
    },
    {
      key: 'copper-pan',
      slug: 'bassine-a-confiture',
      name: 'Bassine à confiture en cuivre',
      category: 'kitchen',
      price: 165,
      inStock: true,
      description:
        'Une bassine de 32\u00a0cm en cuivre martelé, à fond rond et à deux anses rivetées. Le cuivre répartit la chaleur\u00a0: le sucre cuit sans attacher et la confiture prend en vingt minutes.',
      material: 'Cuivre martelé de 2\u00a0mm, anses rivetées.',
      capacity: '8 litres',
      dimensions: '32\u00a0cm de diamètre, 16\u00a0cm de profondeur.',
      weight: '2,1\u00a0kg',
      origin: 'Villedieu-les-Poêles, Manche',
      care: 'Nettoyer au citron et au gros sel, rincer, sécher aussitôt. Réservée aux confitures et aux sucres, jamais au lave-vaisselle.',
      delivery:
        'Expédiée depuis Lyon sous deux jours ouvrés, calée dans du papier recyclé. Retour gratuit sous 30 jours.',
      story: [
        'Martelée à la main à Villedieu-les-Poêles, la ville des chaudronniers, dans un atelier de trois personnes qui travaille encore le cuivre à la planche. Le fond rond suit la flamme et évite les angles où le sucre brunit trop vite.',
        'Elle sert pour la confiture, les fruits au sirop et le caramel, et pour rien d’autre\u00a0: le cuivre nu ne va pas avec les plats salés ou acides. Il fonce avec les années\u202f; un coup de citron et de gros sel lui rend son éclat.',
      ],
      alt: 'Bassine à confiture en cuivre rouge posée sur un feu, une louche en bois appuyée contre le bord',
    },
    {
      key: 'stoneware-bottles',
      slug: 'vase-bouteille-en-gres',
      name: 'Vase bouteille en grès',
      category: 'home',
      price: 48,
      inStock: true,
      description:
        'Un vase à col étroit en grès émaillé, tourné à la main. Il se vend en trois émaux\u00a0: céladon, vert sauge et noir mat. Une seule tige y tient, trois y vivent bien.',
      material: 'Grès émaillé, trois couleurs\u00a0: céladon, vert sauge, noir mat.',
      dimensions: '22\u00a0cm de haut, 11\u00a0cm de diamètre.',
      origin: 'La Borne, Cher',
      care: 'Étanche. Rincer à l’eau tiède, sans produit abrasif. Les variations d’émail font partie de la pièce.',
      delivery:
        'Expédié depuis Lyon sous deux jours ouvrés, calé dans du papier. Retour gratuit sous 30 jours, et remplacement en cas de casse.',
      story: [
        'Tourné puis émaillé à La Borne, le village du Cher où l’on cuit le grès depuis le XVIe siècle, par une potière qui travaille seule et cuit au gaz. Les émaux coulent légèrement au pied\u00a0: c’est la seule façon de reconnaître deux vases tournés le même jour.',
        'Chaque couleur est cuite à 1\u202f280\u00a0°C, ce qui rend le grès non poreux et l’émail dur comme du verre. Le col étroit retient une tige ou un bouquet de graminées, et le vase tient debout même vide.',
      ],
      alt: 'Rangées de vases bouteilles en grès émaillé céladon, vert sauge et noir mat, au col étroit',
    },
    {
      key: 'leather-wallet',
      slug: 'portefeuille-en-cuir',
      name: 'Portefeuille en cuir',
      category: 'carry',
      price: 62,
      inStock: true,
      description:
        'Un portefeuille à deux volets en cuir tanné végétal, cousu au fil ciré, avec des fentes pour les cartes et un compartiment pour les billets. Il se patine à l’usage.',
      material: 'Cuir de vachette tanné végétal, 1,4\u00a0mm. Fil de lin ciré.',
      dimensions: '11\u00a0×\u00a09\u00a0cm fermé. Six fentes pour cartes et deux compartiments.',
      origin: 'Lyon, France',
      care: 'Le garder au sec. Un peu de baume neutre une fois par an.',
      delivery: SHIPS,
      story: [
        'Coupé dans les chutes de nos poignées de sac, pour qu’aucune peau ne soit perdue. Chaque portefeuille est piqué à la main à l’atelier, à deux aiguilles et un seul fil ciré, un point qui tient même si une boucle est coupée.',
        'Le cuir est tanné à l’écorce pendant plusieurs semaines\u00a0: ferme et clair au début, il prend en quelques mois la couleur de votre poche. Les rayures s’effacent d’un passage du pouce.',
      ],
      alt: 'Portefeuille en cuir brun à deux volets, aux coutures apparentes, plié devant une chaussure de cuir',
    },
    {
      key: 'turned-bowl',
      slug: 'bol-en-bois-tourne',
      name: 'Bol en bois tourné',
      category: 'home',
      price: 210,
      inStock: false,
      description:
        'Un grand bol tourné dans un érable moucheté, dont les fentes naturelles sont comblées de poudre de turquoise. Chaque pièce est unique, veinée comme aucune autre.',
      material: 'Érable moucheté, finition à l’huile dure. Fentes comblées de turquoise.',
      dimensions: '28\u00a0cm de diamètre, 13\u00a0cm de haut.',
      weight: '820\u00a0g',
      origin: 'Saint-Claude, Jura',
      care: 'Essuyer avec un chiffon humide, ne jamais le laisser tremper ni le passer au lave-vaisselle. Une goutte d’huile alimentaire tous les six mois.',
      delivery:
        'Pièce unique, déjà vendue. Le tourneur en prépare d’autres cet hiver\u00a0: écrivez-nous pour être prévenu.',
      story: [
        'Tourné en vert dans un bloc d’érable que les champignons avaient commencé à marbrer\u00a0: les lignes sombres qui courent dans le bois sont la trace de ce travail, arrêté au bon moment par le séchage. Le tourneur laisse reposer chaque ébauche six mois avant de la finir.',
        'Les fentes et les nœuds qu’un menuisier écarterait sont comblés à la main avec de la poudre de turquoise et de la résine, puis poncés au niveau du bois. Le bol sert de saladier comme de vide-poche\u202f; il se patine à l’huile et ne craint ni l’eau ni les années.',
      ],
      alt: 'Grand bol en érable moucheté, veiné de lignes sombres et de plages turquoise, posé sur un socle blanc',
    },
    {
      key: 'leather-duffel',
      slug: 'sac-de-voyage-en-cuir',
      name: 'Sac de voyage en cuir',
      category: 'carry',
      price: 245,
      inStock: true,
      description:
        'Un sac de 50\u00a0cm en cuir de buffle patiné, à deux poches plaquées et à bandoulière amovible. Assez large pour deux jours de voyage, assez souple pour passer sous un siège.',
      material: 'Cuir de buffle pleine fleur, boucles et rivets en laiton. Doublure en coton.',
      dimensions:
        '50\u00a0×\u00a028\u00a0×\u00a026\u00a0cm. Bandoulière réglable de 90 à 130\u00a0cm.',
      weight: '2,4\u00a0kg',
      origin: 'Romans-sur-Isère, Drôme',
      care: 'Brosser, essuyer avec un chiffon humide, nourrir le cuir une fois par an avec un baume neutre.',
      delivery: SHIPS,
      story: [
        'Découpé et cousu par un maroquinier de Romans-sur-Isère, une ville qui travaille le cuir depuis plus d’un siècle. Chaque couture qui porte du poids est piquée deux fois, et les anses traversent le sac de part en part, rivetées sous le fond.',
        'Le cuir est livré déjà patiné, avec des plis de travail qui s’estompent à l’usage. Après un an, il est sombre aux anses, plus clair aux angles, et chaque rayure raconte un trajet. Nous gardons des sangles et des boucles de rechange pour réparer le sac.',
      ],
      alt: 'Sac de voyage en cuir brun patiné, à deux poches plaquées et sangles bouclées, posé au pied d’un tronc',
    },
    {
      key: 'moka-pot',
      slug: 'cafetiere-italienne',
      name: 'Cafetière italienne',
      category: 'kitchen',
      price: 39,
      inStock: true,
      description:
        'Une cafetière italienne en aluminium laqué bleu, à huit pans et poignée noire. Trois tasses d’un café court et dense en cinq minutes, sur le gaz ou l’électrique.',
      material: 'Aluminium coulé laqué bleu, poignée en résine noire.',
      capacity: '3 tasses, 150\u00a0ml',
      dimensions: '16\u00a0cm de haut couvercle fermé, 9\u00a0cm de diamètre à la base.',
      origin: 'Piémont, Italie',
      care: 'Rincer à l’eau claire sans produit. Ne pas passer au lave-vaisselle, qui ternit l’aluminium.',
      delivery: SHIPS,
      story: [
        'Fondue et assemblée dans le Piémont, autour du lac d’Orta, où l’on fait des cafetières depuis les années 1930. Les huit pans ne sont pas un décor\u00a0: ils augmentent la surface qui chauffe et se tiennent bien dans la main.',
        'Le principe n’a pas changé depuis\u00a0: l’eau monte par une soupape et traverse le café moulu. La soupape, le filtre et le joint se remplacent. Nous vendons les pièces au prix coûtant et nous en gardons à l’atelier pour toutes les cafetières que nous avons vendues.',
      ],
      alt: 'Cafetière italienne bleu pastel à huit pans, couvercle ouvert, posée sur une table en bois',
    },
    {
      key: 'crochet-throw',
      slug: 'plaid-au-crochet',
      name: 'Plaid au crochet',
      category: 'home',
      price: 165,
      inStock: false,
      description:
        'Un plaid de 130\u00a0×\u00a0170\u00a0cm crocheté à la main en laine, rayé de rouge brique, de vert olive et de jaune safran. Assez lourd pour couvrir un canapé, assez souple pour se plier sur un accoudoir.',
      material: 'Laine, 100\u00a0%, teinte en bain avant le filage.',
      dimensions: '130\u00a0×\u00a0170\u00a0cm.',
      weight: '1,4\u00a0kg',
      origin: 'Roanne, Loire',
      care: 'L’aérer dehors plutôt que le laver. Au besoin, lavage à la main à l’eau froide avec un savon pour laine, séchage à plat.',
      delivery:
        'La prochaine série est sur le crochet, pour décembre. Écrivez-nous et nous vous en mettons un de côté.',
      story: [
        'Crocheté en rangs de mailles serrées par un atelier de quatre ouvrières, à Roanne, qui travaillent trois couleurs à la fois et ne comptent pas les rangs\u00a0: elles mesurent à la main. Chaque rayure fait la largeur d’une paume.',
        'La laine est teinte en bain avant le filage, ce qui lui garde sa profondeur après des années de lavages. Le plaid pèse son poids et se fait vite oublier sur un canapé. Nous en commandons deux séries par an, à l’automne et au printemps.',
      ],
      alt: 'Plaid crocheté à larges rayures rouge brique et vert olive, jeté sur l’accoudoir d’un canapé',
    },
    {
      key: 'knit-sweater',
      slug: 'pull-en-grosse-maille',
      name: 'Pull en grosse maille',
      category: 'carry',
      price: 128,
      inStock: true,
      description:
        'Un pull écru en laine épaisse, à col rond et à maille côtelée. Chaud sans peser, coupé droit, assez long pour couvrir une ceinture.',
      material: 'Laine mérinos et laine d’agneau, écru non teint.',
      dimensions:
        'Tailles XS à XL. Taille M\u00a0: 68\u00a0cm de longueur, 56\u00a0cm de poitrine.',
      origin: 'Troyes, Aube',
      care: 'Lavage à la main à l’eau froide avec un savon pour laine, séchage à plat. Un peigne à laine enlève les bouloches.',
      delivery: SHIPS,
      story: [
        'Tricoté à Troyes, capitale de la bonneterie, dans une maille épaisse qui se travaille sur des machines des années 1970 que l’atelier entretient lui-même. La laine reste écrue\u00a0: la couleur du pull est celle de la brebis.',
        'Les premières semaines, il bouloche un peu aux coudes. Un peigne à laine règle la question et le pull s’assouplit ensuite pendant des années. Une manche trouée ou un col détendu se reprennent à l’atelier\u00a0: envoyez-le-nous.',
      ],
      alt: 'Pull écru en grosse maille, plié et froissé sur un plan de travail en bois, dans une lumière chaude',
    },
    {
      key: 'leather-boots',
      slug: 'bottines-en-cuir',
      name: 'Bottines en cuir',
      category: 'carry',
      price: 310,
      inStock: true,
      description:
        'Des bottines à lacets en cuir grainé couleur miel, à bout rapporté et à semelle de cuir cousue. Elles se ressemellent à l’atelier tant que nous les vendons.',
      material: 'Cuir de vachette pleine fleur grainé, doublure en cuir, semelle de cuir cousue.',
      dimensions: 'Pointures 39 à 46, avec des demi-pointures de 40 à 45.',
      origin: 'Romans-sur-Isère, Drôme',
      care: 'Brosser après chaque sortie, nourrir deux fois par an avec un baume neutre, garder des embauchoirs en bois.',
      delivery: SHIPS,
      story: [
        'Montées à Romans-sur-Isère dans un atelier de dix personnes qui fait des chaussures depuis quatre générations. La semelle est cousue à la trépointe et non collée\u00a0: c’est elle qui permet de les ressemeler, et c’est pour cela que nous les vendons.',
        'Le cuir est naturellement grainé, clair et un peu raide à l’achat. Il se plie au pied en une dizaine de sorties et fonce aux plis. Quand la semelle est usée, nous la remplaçons au tarif de l’atelier, entre 70 et 90\u00a0€, et les bottines repartent pour dix ans.',
      ],
      alt: 'Paire de bottines à lacets en cuir grainé couleur miel, à bout rapporté, sur un parquet clair',
    },
  ],
  media: {
    hero: 'Des tasses émaillées blanches et rouges posées sur une table en bois dans une cuisine de campagne',
    story:
      'Deux bouilloires anciennes, l’une en cuivre et l’autre en fonte noire, sur un petit poêle à bois',
  },
  orderSubject: 'Commande\u00a0: {product}',
  pages: ({ name, hello, orders, repairs, letters }) => ({
    titles: {
      home: 'Accueil',
      shop: 'Boutique',
      about: 'À propos',
      order: 'Commander',
      delivery: 'Livraison et retours',
      repairs: 'Réparations',
      contact: 'Contact',
      terms: 'Conditions de vente et confidentialité',
      credits: 'Crédits photos',
    },
    home: {
      heroTitle: 'Des objets pour tous les jours, faits pour durer et pour être réparés',
      heroSubtitle:
        'Cuisine, maison et vêtements venus de onze petits ateliers, vendus dans notre boutique de Lyon et expédiés dans toute l’Europe.',
      heroAction: 'Voir la boutique',
      commitments: [
        { title: 'Livraison en France et dans l’UE sous 2 à 5 jours ouvrés', page: 'delivery' },
        { title: '30 jours pour nous rendre ce qui ne convient pas', page: 'delivery' },
        { title: 'Réparations tant que nous vendons la pièce', page: 'repairs' },
      ],
      newTitle: 'Nouveautés de la saison',
      storyCaption: `${name} a ouvert en 2014 au fond d’une mercerie de la Croix-Rousse, avec pour seul équipement un établi de réparation. Deux bouilloires de brocante y attendent un manche neuf.`,
      letter: {
        quote:
          'J’ai acheté la bassine à confiture en 2019 et je l’ai rapportée l’hiver dernier\u00a0: une anse avait pris du jeu. Elle m’a été rendue trois semaines plus tard, rerivetée, avec un mot du chaudronnier qui l’avait faite.',
        name: 'Hélène Marchand',
        role: 'Bassine à confiture, achetée en 2019',
      },
      faqTitle: 'Avant de commander',
      faq: [
        [
          'Comment passer commande\u202f?',
          'Utilisez le bouton de commande d’une fiche produit pour nous écrire, ou passez à la boutique. Nous répondons sous un jour ouvré avec le total, livraison comprise, et un lien de paiement sécurisé. Rien n’est débité avant votre confirmation.',
        ],
        [
          'Quel est le délai de livraison\u202f?',
          'Deux à trois jours ouvrés en France métropolitaine, trois à cinq dans le reste de l’Union européenne. Une commande confirmée avant midi part de Lyon le jour même.',
        ],
        [
          'Puis-je retirer ma commande à la boutique\u202f?',
          'Oui. Demandez le retrait en nous écrivant, et votre commande vous attend au 12 rue Imbert-Colomès dès le lendemain, du mardi au samedi.',
        ],
        [
          'Et si la taille ne convient pas\u202f?',
          'Renvoyez la pièce non portée sous 30 jours pour un remboursement ou une autre taille. Les retours sont gratuits en France\u202f; depuis le reste de l’UE, nous remboursons le service suivi le moins cher.',
        ],
      ],
      lettersTitle: 'Lettres de l’atelier',
      lettersText:
        'Quatre lettres par an sur les nouvelles séries, les réparations et les gens qui fabriquent nos objets. Écrivez-nous et nous vous inscrivons.',
      lettersAction: 'Demander les lettres',
      lettersSubject: 'Lettres de l’atelier',
    },
    shop: {},
    about: {
      intro: [
        `${name} a commencé en 2014 comme un établi de réparation au fond d’une mercerie de la rue Imbert-Colomès, sur les pentes de la Croix-Rousse. On nous apportait des manteaux aux fermetures cassées et des sacs aux anses arrachées\u202f; après un an passé à réparer les affaires des autres, nous avons commencé à fabriquer les nôtres, pensées pour être réparées aussi.`,
        'Aujourd’hui la boutique vend une soixantaine de pièces venues de onze ateliers. La plupart sont en France, à une journée de train les uns des autres\u00a0: une fonderie dans les Ardennes, un chaudronnier dans la Manche, une potière dans le Cher, un tourneur dans le Jura, une bonneterie à Troyes. Nous les visitons au moins deux fois par an et nous achetons en séries assez courtes pour les vendre avant la saison suivante.',
        '## Comment nous choisissons',
        'Une pièce entre dans la boutique quand nous l’avons utilisée assez longtemps pour savoir comment elle vieillit, et quand celui qui l’a faite peut fournir de quoi la réparer. Cela écarte la plupart des semelles collées, des poêles antiadhésives et des fermetures que nous ne saurions pas remplacer. Cela veut aussi dire que la gamme change lentement et que certaines pièces sont épuisées pendant des mois.',
        'Nous payons nos ateliers avant la livraison et nous publions sur demande le prix que nous avons payé. Rien n’est fabriqué en quantité que nous ne saurions vendre\u00a0: rien n’est donc jamais soldé pour vider un entrepôt.',
      ],
      figureCaption:
        'Les tasses du comptoir, émaillées et un peu cabossées, servent tous les matins à l’atelier.',
      figuresTitle: 'La boutique en chiffres',
      figures: [
        { value: '11', label: 'ateliers où nous achetons, dont neuf en France' },
        { value: '1\u202f380', label: 'réparations faites à l’établi l’an dernier' },
        { value: '2014', label: 'l’année de notre ouverture à la Croix-Rousse' },
      ],
      visitTitle: 'Passez à la boutique et à l’établi',
      visitText:
        '12 rue Imbert-Colomès, 69001 Lyon. Ouvert du mardi au samedi, de 11\u00a0h à 19\u00a0h.',
      visitAction: 'Horaires et accès',
    },
    order: {
      intro: [
        'Nous vendons à la boutique et par courriel, pour que chaque commande soit lue par celui qui l’emballera. C’est un peu plus long qu’un panier en ligne, et cela nous permet de répondre à une question de taille ou de livraison avant que vous ne payiez.',
        '## Commander par courriel',
        `Utilisez le bouton de commande d’une fiche produit, ou écrivez à [${orders}](mailto:${orders}) avec les pièces, les tailles et l’adresse de livraison. Nous répondons sous un jour ouvré, du mardi au samedi, avec le total livraison comprise et un lien de paiement sécurisé par carte bancaire. Votre commande part de Lyon dès que le paiement arrive.`,
        '## Commander à la boutique',
        'Tout ce qui figure sur le site est à la boutique, 12 rue Imbert-Colomès, et la plupart des tailles s’essaient. Nous pouvons aussi vous garder une pièce pendant une semaine si vous nous dites quand vous comptez passer.',
      ],
      notesTitle: 'Paiement et livraison',
      notes: [
        [
          'Quels moyens de paiement acceptez-vous\u202f?',
          'Carte bancaire par lien de paiement sécurisé, virement sur notre compte, et espèces ou carte à la boutique. Les prix sont en euros, TVA à 20\u00a0% comprise.',
        ],
        [
          'Combien coûte la livraison\u202f?',
          'La livraison coûte 5\u00a0€ en France métropolitaine et 12\u00a0€ dans le reste de l’Union européenne\u202f; elle est offerte à partir de 150\u00a0€ d’achats. Les poêles et les plaids voyagent par transporteur suivi, au même tarif.',
        ],
        [
          'Livrez-vous hors de l’Union européenne\u202f?',
          'Nous livrons au Royaume-Uni, en Suisse et en Norvège au prix coûtant. Les droits et taxes sont payés par le destinataire à l’arrivée, et nous vous en donnons l’estimation avant le paiement.',
        ],
        [
          'Pouvez-vous faire un paquet cadeau\u202f?',
          'Oui, dans du papier kraft et de la ficelle de coton, avec un mot écrit à la main si vous nous envoyez les phrases. C’est gratuit.',
        ],
      ],
    },
    delivery: {
      intro: [
        'Les commandes quittent l’atelier à Lyon chaque jour ouvré à 14\u00a0h, emballées dans du papier et du carton recyclés, sans plastique. Vous recevez un numéro de suivi par courriel dès que le colis est pris en charge.',
      ],
      faqTitle: 'Livraison et retours',
      faq: [
        [
          'Quel est le délai de livraison\u202f?',
          'Deux à trois jours ouvrés en France métropolitaine, trois à cinq jours ouvrés dans le reste de l’Union européenne, et cinq à huit jours vers le Royaume-Uni, la Suisse et la Norvège.',
        ],
        [
          'Comment renvoyer un article\u202f?',
          `Écrivez à [${orders}](mailto:${orders}) dans les 30 jours suivant la livraison, avec votre numéro de commande. Nous envoyons une étiquette prépayée pour la France, et une adresse de retour pour les autres pays.`,
        ],
        [
          'Quand serai-je remboursé\u202f?',
          'Dans les cinq jours ouvrés suivant l’arrivée du colis chez nous, sur la carte ou le compte utilisé pour payer. Les frais de livraison sont remboursés quand toute la commande est retournée.',
        ],
        [
          'Puis-je échanger une taille\u202f?',
          'Oui. Dites-nous la taille voulue en nous écrivant, et nous l’envoyons dès que la première pièce est repartie vers nous.',
        ],
        [
          'Qu’est-ce qui ne peut pas être retourné\u202f?',
          'Les pièces portées, lavées ou modifiées, ainsi que celles que nous avons réparées ou fabriquées sur mesure pour vous.',
        ],
      ],
    },
    repairs: {
      intro: [
        'Nous réparons tout ce que nous vendons tant que nous le vendons, et la plupart des choses bien après. L’établi est au fond de la boutique\u202f; deux d’entre nous y travaillent chaque après-midi.',
        '## Ce que nous réparons',
        'Coutures, poches, poignets et boutons des vêtements. Sangles, boucles, rivets et piqûres des sacs et du cuir. Anses, soupapes et joints des ustensiles. Rouille et culottage perdu de la fonte. Trous de mites dans la maille, quand ils sont assez petits pour être reprisés.',
        '## Ce que cela coûte',
        'Les réparations d’un article acheté chez nous depuis moins de deux ans sont gratuites. Au-delà, nous facturons les matières et jamais le temps, soit entre 5 et 25\u00a0€ pour la plupart des réparations. Nous vous donnons le prix avant de commencer.',
        '## Comment nous l’envoyer',
        `Apportez-le à la boutique, ou écrivez à [${repairs}](mailto:${repairs}) avec une photo du dommage. Nous répondons avec le prix, le délai (le plus souvent deux à trois semaines) et l’adresse où l’envoyer.`,
      ],
      figuresTitle: 'L’an dernier à l’établi',
      figures: [
        { value: '1\u202f380', label: 'réparations terminées' },
        { value: '62\u00a0%', label: 'faites gratuitement' },
        { value: '16', label: 'jours en moyenne entre l’arrivée et le retour' },
      ],
    },
    contact: [
      '## La boutique',
      '12 rue Imbert-Colomès, 69001 Lyon. À cinq minutes à pied du métro Croix-Paquet (ligne C).',
      'Du mardi au samedi, de 11\u00a0h à 19\u00a0h. Fermé le dimanche, le lundi et les jours fériés.',
      '## Nous écrire',
      `Pour les commandes, [${orders}](mailto:${orders}). Pour les réparations, [${repairs}](mailto:${repairs}). Pour nos lettres de l’atelier, quatre par an, [${letters}](mailto:${letters}). Pour tout le reste, y compris les ateliers qui voudraient travailler avec nous, [${hello}](mailto:${hello}).`,
      'Téléphone 04\u00a065\u00a071\u00a042\u00a017, du mardi au samedi pendant les heures d’ouverture.',
    ],
    terms: [
      `Ces conditions s’appliquent à toute commande passée auprès de ${name}, SAS, 12 rue Imbert-Colomès, 69001 Lyon, immatriculée au RCS de Lyon sous le numéro 912 345 678.`,
      '## Commandes et prix',
      'Une commande est confirmée quand nous avons reçu le paiement et que nous vous avons répondu pour vous le dire. Les prix sont en euros, toutes taxes comprises (TVA à 20\u00a0%). Les frais de livraison sont indiqués avant le paiement.',
      '## Droit de rétractation',
      'Vous pouvez vous rétracter dans les 14 jours suivant la réception, sans donner de motif, comme le prévoit le code de la consommation. Notre propre délai de retour de 30 jours prolonge ce droit. Le remboursement intervient dans les 14 jours suivant le retour des marchandises.',
      '## Garanties',
      'Toutes les pièces bénéficient de la garantie légale de conformité de deux ans et de la garantie contre les vices cachés. Notre service de réparation s’y ajoute sans la remplacer.',
      '## Médiation',
      'En cas de litige que nous n’aurions pas su régler, vous pouvez saisir gratuitement le médiateur de la consommation dont nous relevons. Ses coordonnées vous sont données sur simple demande.',
      '## Données personnelles',
      `Nous conservons vos nom, adresse et courriel le temps de livrer, de reprendre ou de réparer une commande, puis pendant les dix ans que la loi nous impose pour les factures. Nous ne les vendons ni ne les partageons, sauf avec le transporteur qui livre votre colis. Écrivez à [${hello}](mailto:${hello}) pour les consulter, les rectifier ou les effacer\u202f; vous pouvez aussi saisir la CNIL. Ce site ne dépose aucun cookie publicitaire ni de suivi.`,
    ],
    credits: {
      intro: [
        'Les photographies de ce site sont publiées sous licence libre ou dans le domaine public. Nous remercions leurs auteurs. Elles ont été recadrées et redimensionnées pour le web.',
      ],
      sourceWord: 'source',
    },
  }),
  menus: {
    shop: 'Boutique',
    about: 'À propos',
    action: 'Commander',
    footer: [
      { label: 'À propos', page: 'about' },
      { label: 'Commander', page: 'order' },
      { label: 'Livraison et retours', page: 'delivery' },
      { label: 'Réparations', page: 'repairs' },
      { label: 'Contact', page: 'contact' },
      { label: 'Conditions de vente', page: 'terms' },
      { label: 'Crédits photos', page: 'credits' },
    ],
  },
  settings: {
    tagline: 'Des objets du quotidien, faits pour durer et pour être réparés.',
    footerNote:
      '12 rue Imbert-Colomès, 69001 Lyon, France. Boutique et établi de réparation ouverts du mardi au samedi, de 11\u00a0h à 19\u00a0h.\n\nSAS immatriculée au RCS de Lyon, n°\u00a0912\u00a0345\u00a0678.',
  },
  widgets: {
    newTitle: 'Nouveautés à la boutique',
    careTitle: 'Service client',
    careLabels: {
      order: 'Commander',
      delivery: 'Livraison et retours',
      repairs: 'Réparations',
      contact: 'Contact',
      terms: 'Conditions de vente',
    },
    beforeTitle: 'Avant de commander',
    beforeHeading: 'Une question sur une taille ou une livraison\u202f?',
    beforeBody:
      'Écrivez-nous ou appelez la boutique. Nous répondons sous un jour ouvré, du mardi au samedi, et rien n’est débité avant votre confirmation.',
    beforeLabel: 'Contacter la boutique',
    phoneTitle: 'Appeler la boutique',
    phone: '04\u00a065\u00a071\u00a042\u00a017',
    phoneHoursLabel: 'Réponse',
    phoneHoursValue: 'Du mardi au samedi, aux heures d’ouverture',
    lettersTitle: 'Lettres de l’atelier',
    lettersHeading: 'Quatre lettres par an',
    lettersBody:
      'Les nouvelles séries, les réparations et ceux qui fabriquent nos objets, écrits depuis l’établi de Lyon.',
    lettersLabel: 'Comment les recevoir',
  },
}
