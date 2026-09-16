import type { VitrineCopy } from './vitrine-copy.js'

/** Le site vitrine en français (L36). Voir `vitrine-copy.ts` pour la forme. */
export const VITRINE_COPY_FR: VitrineCopy = {
  locale: 'fr',
  schema: {
    taxonomy: { name: 'secteur', singular: 'Secteur', plural: 'Secteurs' },
    routes: {
      solution: '/solutions/:slug',
      caseStudy: '/references/:slug',
      job: '/carrieres/:slug',
      post: '/actualites/:slug',
    },
    labels: {
      solution: { singular: 'Solution', plural: 'Solutions' },
      caseStudy: { singular: 'Référence', plural: 'Références' },
      testimonial: { singular: 'Témoignage', plural: 'Témoignages' },
      teamMember: { singular: 'Membre de la direction', plural: 'Direction' },
      job: { singular: 'Offre d’emploi', plural: 'Offres d’emploi' },
      post: { singular: 'Article', plural: 'Actualités' },
    },
    fields: {
      icon: 'Icône',
      iconHelp:
        'Un nom de symbole reconnu par le thème (par exemple « bolt », « shield », « chart »).',
      client: 'Client',
      location: 'Lieu',
      keyFigure: 'Chiffre clé',
      keyFigureLabel: 'Ce que mesure le chiffre clé',
      company: 'Entreprise',
      team: 'Équipe',
      contract: 'Contrat',
      author: 'Auteur',
    },
  },
  pageSlugs: {
    solutions: 'solutions',
    caseStudies: 'references',
    company: 'entreprise',
    careers: 'carrieres',
    news: 'actualites',
    contact: 'contact',
    legal: 'mentions-legales',
    privacy: 'confidentialite',
    credits: 'credits-photos',
  },
  sectors: [
    {
      slug: 'energie',
      name: 'Énergie',
      icon: 'bolt',
      text: 'Postes sources, lignes, transformateurs et parcs éoliens, suivis en continu pour anticiper les défaillances plutôt que les subir.',
    },
    {
      slug: 'eau',
      name: 'Eau',
      icon: 'globe',
      text: 'Réseaux de distribution, usines de traitement et stations de pompage : détecter une fuite en jours, et non en mois.',
    },
    {
      slug: 'ferroviaire',
      name: 'Ferroviaire',
      icon: 'truck',
      text: 'Aiguillages, caténaires et ouvrages d’art instrumentés, pour intervenir avant qu’un train ne soit arrêté.',
    },
    {
      slug: 'industrie',
      name: 'Industrie',
      icon: 'settings',
      text: 'Turbines, compresseurs et lignes de production dont l’arrêt coûte plus cher que la surveillance.',
    },
  ],
  solutions: [
    {
      slug: 'capteurs',
      name: 'Capteurs et nœuds de mesure',
      description:
        'Des nœuds autonomes pour les lignes, les postes, les canalisations et les voies. Température, vibration, courant et pression, sur batterie ou sur le réseau.',
      icon: 'layers',
      media: 'solution-sensors',
      body: (firm) => [
        {
          p: `Nos nœuds de mesure sont conçus et assemblés en France. Ils s’installent sans coupure, sur une ligne sous tension comme sur une canalisation en service, et transmettent leurs mesures par radio longue portée, par réseau cellulaire ou par fibre selon le site.`,
        },
        { h2: 'Ce que nous mesurons' },
        {
          bullets: [
            'Température de conducteurs, de bornes et d’huile de transformateur, toutes les dix secondes.',
            'Vibration et spectre acoustique sur les machines tournantes et les aiguillages.',
            'Courant de fuite, décharges partielles et humidité dans les armoires.',
            'Pression, débit et bruit hydraulique sur les réseaux d’eau.',
          ],
        },
        { h2: 'Conçus pour durer sur le terrain' },
        {
          p: 'Boîtier IP68, fonctionnement de −40 °C à +85 °C, dix ans d’autonomie sur pile pour les modèles basse consommation. Chaque nœud se met à jour à distance et signe ses mesures, pour qu’une donnée falsifiée ne soit jamais prise pour une donnée réelle.',
        },
        {
          p: `Les capteurs ${firm} parlent les protocoles que vos systèmes connaissent déjà, IEC 61850, Modbus et DNP3, et s’intègrent à une supervision existante sans en remplacer une ligne.`,
        },
      ],
    },
    {
      slug: 'plateforme-vigie',
      name: 'Plateforme de supervision Vigie',
      description:
        'Une seule vue de l’état de vos équipements, des alertes qui disent quoi faire et un historique que les équipes de maintenance consultent vraiment.',
      icon: 'chart',
      media: 'solution-platform',
      body: () => [
        {
          p: 'Vigie rassemble les mesures de vos capteurs, celles de vos systèmes existants et l’historique de vos interventions. Un exploitant y voit en un écran ce qui se dégrade, où, et depuis quand.',
        },
        { h2: 'Des alertes qui servent à décider' },
        {
          p: 'Une alerte Vigie ne se contente pas de franchir un seuil. Elle compare la mesure à ce que l’équipement devrait faire dans les mêmes conditions de charge et de météo, estime la gravité, et propose l’intervention adaptée avec son délai.',
        },
        { h2: 'Ce que vos équipes y trouvent' },
        {
          bullets: [
            'Le schéma du réseau, avec l’état de chaque poste et de chaque liaison en temps réel.',
            'La fiche de chaque équipement : mesures, durée de vie résiduelle estimée, documents et interventions passées.',
            'Des rapports mensuels prêts pour le régulateur, exportables en PDF et en CSV.',
            'Une application mobile hors ligne pour les techniciens sur site.',
          ],
        },
        {
          p: 'Vigie est hébergée en France, chez un hébergeur qualifié SecNumCloud, ou dans votre propre centre de données si votre politique de sécurité l’exige.',
        },
      ],
    },
    {
      slug: 'maintenance-predictive',
      name: 'Maintenance prédictive',
      description:
        'Des modèles entraînés sur vos équipements, qui estiment combien de temps il reste avant une défaillance et à quelle date intervenir.',
      icon: 'trending-up',
      media: 'solution-predictive',
      body: (firm) => [
        {
          p: 'Remplacer un équipement à date fixe coûte cher, attendre qu’il casse coûte davantage. La maintenance prédictive consiste à intervenir entre les deux, au moment où les mesures montrent qu’une dégradation a commencé.',
        },
        { h2: 'Comment nous construisons un modèle' },
        {
          bullets: [
            'Nous partons de votre historique de pannes et d’interventions, même incomplet.',
            'Nous le croisons avec les mesures des capteurs, les conditions de charge et la météo.',
            'Chaque modèle est validé sur des pannes réelles qu’il n’a jamais vues avant sa mise en service.',
          ],
        },
        {
          p: `Les ingénieurs ${firm} restent responsables de chaque recommandation. Un modèle dont la précision baisse est signalé, réentraîné, et retiré s’il ne retrouve pas son niveau.`,
        },
        { h2: 'Ce qui change pour la maintenance' },
        {
          p: 'Chez nos clients, la part des interventions correctives non planifiées baisse en moyenne de 40 % la deuxième année, et les équipements critiques sont remplacés en moyenne quatorze mois plus tard qu’avec un plan à date fixe.',
        },
      ],
    },
    {
      slug: 'ingenierie-integration',
      name: 'Ingénierie et intégration',
      description:
        'Études, qualification en laboratoire et raccordement à vos systèmes de contrôle, pour qu’un nouveau capteur ne dérange rien de ce qui fonctionne.',
      icon: 'settings',
      media: 'solution-engineering',
      body: () => [
        {
          p: 'Chaque déploiement commence par une étude du site et de ses contraintes : accès, alimentation, compatibilité électromagnétique, cybersécurité, procédures d’exploitation.',
        },
        { h2: 'Notre laboratoire' },
        {
          p: 'À Lyon, notre laboratoire de 900 m² reproduit les conditions du terrain : chambre climatique, banc de vibration, cage de Faraday et banc haute tension. Aucun matériel ne part sur un site client sans y avoir été qualifié.',
        },
        { h2: 'Raccordement à l’existant' },
        {
          bullets: [
            'Intégration à vos systèmes SCADA et à votre GMAO, sans remplacement.',
            'Documentation conforme aux exigences de vos procédures et de vos auditeurs.',
            'Recette conjointe avec vos équipes d’exploitation avant toute mise en service.',
          ],
        },
      ],
    },
    {
      slug: 'interventions-terrain',
      name: 'Interventions terrain',
      description:
        'Pose, mise en service et maintenance des capteurs par nos propres techniciens, habilités pour les ouvrages sous tension et les sites sensibles.',
      icon: 'map-pin',
      media: 'solution-field',
      body: (firm) => [
        {
          p: `Les techniciens ${firm} sont salariés de l’entreprise, pas sous-traités. Ils sont habilités pour les travaux sous tension, les interventions en hauteur et les sites classés, et connaissent les capteurs qu’ils installent parce qu’ils ont participé à leur qualification.`,
        },
        { h2: 'Ce que nous prenons en charge' },
        {
          bullets: [
            'Relevé du site, plan d’implantation et demandes d’accès.',
            'Pose et mise en service, sans coupure pour la plupart des ouvrages.',
            'Maintenance préventive des capteurs et remplacement sous 72 heures en cas de panne.',
          ],
        },
        {
          p: 'Nos équipes interviennent depuis Paris, Lyon, Reims et Nantes, et couvrent l’ensemble du territoire métropolitain ainsi que la Belgique et la Suisse.',
        },
      ],
    },
    {
      slug: 'cybersecurite-industrielle',
      name: 'Cybersécurité des systèmes industriels',
      description:
        'Cartographie, segmentation et surveillance des réseaux d’exploitation, par une équipe qui sait qu’un correctif ne s’installe pas sur un poste en service comme sur un ordinateur de bureau.',
      icon: 'shield',
      media: 'solution-security',
      body: () => [
        {
          p: 'Un capteur connecté est aussi une porte d’entrée. Nous concevons nos matériels et nos logiciels avec cette contrainte, et nous aidons nos clients à protéger l’ensemble de leurs réseaux d’exploitation.',
        },
        { h2: 'Nos engagements' },
        {
          bullets: [
            'Chiffrement des mesures de bout en bout et signature de chaque mise à jour.',
            'Tests d’intrusion annuels par un prestataire qualifié PASSI.',
            'Accompagnement à la conformité NIS 2 pour les opérateurs de services essentiels.',
          ],
        },
        {
          p: 'Notre centre de surveillance fonctionne jour et nuit. Un incident de sécurité sur un site client est qualifié en moins de trente minutes, et le client est prévenu avant la fin de la première heure.',
        },
      ],
    },
  ],
  caseStudies: [
    {
      slug: 'ardenne-energies-duree-des-coupures',
      title: 'Ardenne Énergies réduit de 38 % la durée moyenne des coupures sur son réseau',
      client: 'Ardenne Énergies',
      location: 'Charleville-Mézières',
      sector: 'energie',
      keyFigure: '−38 %',
      keyFigureLabel: 'de durée moyenne de coupure en deux ans',
      summary:
        'Un distributeur d’électricité de 410 000 clients a instrumenté 140 postes sources et 2 300 km de lignes. Les défauts sont désormais localisés en quelques minutes.',
      media: 'case-grid',
      body: (firm) => [
        { h2: 'Le contexte' },
        {
          p: 'Ardenne Énergies exploite un réseau rural étendu, exposé aux tempêtes et à la végétation. Localiser un défaut demandait souvent plusieurs heures de patrouille, et la durée moyenne de coupure dépassait l’objectif fixé par le régulateur depuis trois ans.',
        },
        { h2: 'Ce que nous avons fait' },
        {
          bullets: [
            'Pose de 3 100 indicateurs de passage de défaut communicants sur les lignes moyenne tension.',
            'Surveillance thermique des transformateurs des 140 postes sources.',
            'Raccordement de Vigie au système de conduite existant, sans le remplacer.',
          ],
        },
        {
          p: `Les équipes ${firm} et celles de la conduite ont travaillé ensemble pendant six mois pour régler les seuils d’alerte, poste par poste, avant la généralisation.`,
        },
        { h2: 'Les résultats' },
        {
          bullets: [
            'Durée moyenne de coupure en baisse de 38 % en deux ans.',
            'Temps de localisation d’un défaut ramené de 2 h 40 à 11 minutes.',
            'Deux transformateurs remplacés avant leur défaillance, sur alerte de dérive thermique.',
          ],
        },
      ],
    },
    {
      slug: 'eaux-de-castelane-fuites',
      title: 'Eaux de Castelane détecte ses fuites en trois jours au lieu de trois mois',
      client: 'Eaux de Castelane',
      location: 'Métropole de Castelane',
      sector: 'eau',
      keyFigure: '2,1 millions',
      keyFigureLabel: 'de m³ d’eau économisés par an',
      summary:
        'Une régie publique de l’eau a équipé 1 800 km de canalisations de capteurs acoustiques. Son rendement de réseau est passé de 79 % à 87 % en deux ans.',
      media: 'case-water',
      body: () => [
        { h2: 'Le contexte' },
        {
          p: 'Un litre sur cinq produit par la régie était perdu avant d’atteindre un robinet. Les campagnes de recherche de fuites mobilisaient quatre équipes toute l’année et ne couvraient le réseau qu’une fois tous les trois ans.',
        },
        { h2: 'Ce que nous avons fait' },
        {
          bullets: [
            'Installation de 2 600 capteurs acoustiques sur les vannes et les bouches à clé.',
            'Modélisation du bruit normal de chaque tronçon, heure par heure.',
            'Envoi des alertes directement dans l’outil de planification des équipes de la régie.',
          ],
        },
        { h2: 'Les résultats' },
        {
          bullets: [
            'Délai moyen de détection d’une fuite ramené de 94 à 3 jours.',
            'Rendement du réseau passé de 79 % à 87 %.',
            '2,1 millions de m³ d’eau économisés chaque année, l’équivalent de la consommation de 38 000 habitants.',
          ],
        },
      ],
    },
    {
      slug: 'railvia-aiguillages',
      title: 'Railvia instrumente 1 400 km de voies et divise par deux les pannes d’aiguillage',
      client: 'Railvia',
      location: 'Grand Est et Hauts-de-France',
      sector: 'ferroviaire',
      keyFigure: '−47 %',
      keyFigureLabel: 'de pannes d’aiguillage en dix-huit mois',
      summary:
        'Un gestionnaire d’infrastructure ferroviaire régional suit en continu l’effort de manœuvre de 1 150 aiguillages et intervient avant la défaillance.',
      media: 'case-rail',
      body: (firm) => [
        { h2: 'Le contexte' },
        {
          p: 'Les pannes d’aiguillage étaient la première cause de retard sur le réseau de Railvia. La maintenance reposait sur des tournées calendaires qui ne voyaient pas les dégradations apparues entre deux passages.',
        },
        { h2: 'Ce que nous avons fait' },
        {
          bullets: [
            'Mesure du courant et de l’effort de manœuvre de chaque moteur d’aiguillage.',
            'Détection des dérives liées au graissage, au gel et au désalignement.',
            'Priorisation automatique des tournées selon l’état réel des équipements.',
          ],
        },
        {
          p: `Le déploiement s’est fait de nuit, par tranches de quarante aiguillages, sans aucune interruption de circulation imputable aux équipes ${firm}.`,
        },
        { h2: 'Les résultats' },
        {
          bullets: [
            'Pannes d’aiguillage en baisse de 47 % en dix-huit mois.',
            'Minutes de retard imputables aux aiguillages divisées par 2,3.',
            'Tournées de maintenance réduites d’un tiers, à effectif constant.',
          ],
        },
      ],
    },
    {
      slug: 'marea-offshore-disponibilite',
      title: 'maréa offshore porte la disponibilité de son parc éolien en mer à 97,8 %',
      client: 'maréa offshore',
      location: 'Manche',
      sector: 'energie',
      keyFigure: '97,8 %',
      keyFigureLabel: 'de disponibilité du parc en 2025',
      summary:
        'Un exploitant de 62 éoliennes en mer anticipe désormais l’usure des roulements et planifie ses interventions sur les fenêtres météo favorables.',
      media: 'case-offshore',
      body: () => [
        { h2: 'Le contexte' },
        {
          p: 'En mer, chaque intervention dépend de la météo et d’un navire disponible. Une panne de roulement découverte trop tard pouvait immobiliser une éolienne plusieurs semaines, le temps que la mer se calme et que la pièce arrive.',
        },
        { h2: 'Ce que nous avons fait' },
        {
          bullets: [
            'Analyse vibratoire des trains de puissance des 62 éoliennes.',
            'Estimation de la durée de vie résiduelle de chaque roulement principal.',
            'Croisement des recommandations avec les prévisions de houle pour planifier les sorties.',
          ],
        },
        { h2: 'Les résultats' },
        {
          bullets: [
            'Disponibilité du parc portée de 94,1 % à 97,8 %.',
            'Neuf remplacements de roulements planifiés au lieu d’être subis.',
            'Sorties de navire réduites de 22 % grâce au regroupement des interventions.',
          ],
        },
      ],
    },
  ],
  testimonials: [
    {
      authorName: 'Hélène Morvan',
      authorRole: 'Directrice de l’exploitation, Ardenne Énergies',
      quote: (firm) =>
        `Nous pensions acheter des capteurs. Nous avons surtout gagné une méthode : les équipes de ${firm} ont passé des nuits en salle de conduite avec nous avant de régler la moindre alerte, et cela se voit dans nos indicateurs.`,
    },
    {
      authorName: 'Bruno Castaing',
      authorRole: 'Directeur technique, Eaux de Castelane',
      quote: () =>
        'La première semaine, le système a trouvé onze fuites que nos équipes cherchaient depuis des mois. Aujourd’hui, nos agents partent le matin avec la liste des tronçons à vérifier, et ils la trouvent juste.',
    },
    {
      authorName: 'Ingrid Solberg',
      authorRole: 'Responsable maintenance, maréa offshore',
      quote: () =>
        'Un roulement se change désormais quand la mer est calme et que la pièce est à quai. Cela paraît simple, mais c’est exactement ce qui nous manquait.',
    },
  ],
  team: [
    {
      name: 'Claire Dumont',
      role: 'Présidente-directrice générale',
      description:
        'Ingénieure de formation, vingt ans dans l’exploitation de réseaux électriques avant de cofonder l’entreprise en 2014.',
    },
    {
      name: 'Karim Benali',
      role: 'Directeur technique',
      description:
        'A conçu la première génération de nos capteurs. Dirige aujourd’hui l’électronique, le logiciel embarqué et la plateforme Vigie.',
    },
    {
      name: 'Sofia Lindqvist',
      role: 'Directrice des opérations',
      description:
        'Responsable des déploiements et des interventions terrain dans les quatre pays où nous opérons.',
    },
    {
      name: 'Thomas Nguyen',
      role: 'Directeur de l’ingénierie',
      description:
        'Dirige le laboratoire de Lyon et les études de raccordement aux systèmes de contrôle de nos clients.',
    },
    {
      name: 'Amina Diallo',
      role: 'Responsable des données et des modèles',
      description:
        'Docteure en statistique, elle encadre les dix-huit data scientists qui construisent et surveillent nos modèles.',
    },
    {
      name: 'Julien Marchetti',
      role: 'Responsable de la sécurité des systèmes',
      description:
        'Ancien auditeur en sécurité industrielle, il dirige le centre de surveillance et la conformité de nos produits.',
    },
  ],
  jobs: [
    {
      slug: 'ingenieur-systemes-embarques',
      title: 'Ingénieur·e systèmes embarqués',
      team: 'Capteurs',
      location: 'Paris',
      contract: 'CDI · hybride',
      summary:
        'Concevoir le logiciel embarqué de nos prochains nœuds de mesure : basse consommation, mise à jour à distance et sécurité.',
      body: (firm) => [
        { h2: 'Vos missions' },
        {
          bullets: [
            'Développer le logiciel embarqué en C et en Rust sur microcontrôleurs ARM Cortex-M.',
            'Optimiser la consommation pour atteindre dix ans d’autonomie sur pile.',
            'Concevoir la chaîne de mise à jour sécurisée à distance.',
            'Participer à la qualification des matériels au laboratoire de Lyon.',
          ],
        },
        { h2: 'Votre profil' },
        {
          bullets: [
            'Au moins trois ans d’expérience en logiciel embarqué contraint.',
            'Une pratique des protocoles radio basse consommation.',
            'Le goût du terrain : vous viendrez voir vos capteurs fonctionner sur site.',
          ],
        },
        {
          p: `Chez ${firm}, les ingénieurs embarqués travaillent dans la même équipe que ceux qui posent les capteurs. Deux jours de télétravail par semaine, et une journée par trimestre sur un site client.`,
        },
      ],
    },
    {
      slug: 'data-scientist-maintenance-predictive',
      title: 'Data scientist, maintenance prédictive',
      team: 'Données et modèles',
      location: 'Lyon ou Paris',
      contract: 'CDI · hybride',
      summary:
        'Construire et surveiller les modèles qui estiment la durée de vie résiduelle des transformateurs, des turbines et des aiguillages.',
      body: () => [
        { h2: 'Vos missions' },
        {
          bullets: [
            'Construire des modèles de dégradation à partir de séries temporelles de capteurs.',
            'Valider chaque modèle sur des défaillances réelles avant sa mise en service.',
            'Surveiller la précision des modèles en production et décider de leur réentraînement.',
            'Expliquer vos résultats aux ingénieurs d’exploitation de nos clients.',
          ],
        },
        { h2: 'Votre profil' },
        {
          bullets: [
            'Une formation en statistique, en apprentissage automatique ou en physique.',
            'Une pratique de Python et des séries temporelles en production.',
            'La rigueur de dire qu’un modèle ne marche pas quand il ne marche pas.',
          ],
        },
      ],
    },
    {
      slug: 'technicien-intervention-reseaux',
      title: 'Technicien·ne d’intervention réseaux électriques',
      team: 'Interventions terrain',
      location: 'Reims',
      contract: 'CDI · déplacements',
      summary:
        'Poser, mettre en service et maintenir nos capteurs sur les postes et les lignes de nos clients du Grand Est.',
      body: () => [
        { h2: 'Vos missions' },
        {
          bullets: [
            'Préparer les interventions avec les exploitants et les services de sécurité.',
            'Installer et mettre en service les capteurs sur postes et lignes.',
            'Diagnostiquer et remplacer les équipements défaillants.',
          ],
        },
        { h2: 'Votre profil' },
        {
          bullets: [
            'Un BTS ou un DUT en électrotechnique, ou une expérience équivalente.',
            'Les habilitations électriques, ou l’envie de les obtenir avec nous.',
            'Le permis B et la disponibilité pour des déplacements dans la région.',
          ],
        },
        {
          p: 'Véhicule de service, équipement complet et formation aux travaux sous tension pris en charge. Les déplacements sont planifiés au moins une semaine à l’avance.',
        },
      ],
    },
    {
      slug: 'product-designer-supervision',
      title: 'Product designer, interfaces de supervision',
      team: 'Plateforme Vigie',
      location: 'Paris',
      contract: 'CDI · hybride',
      summary:
        'Concevoir les écrans que des exploitants regardent huit heures par jour, et où une erreur de lecture peut couper une ville.',
      body: () => [
        { h2: 'Vos missions' },
        {
          bullets: [
            'Observer le travail des exploitants en salle de conduite et sur le terrain.',
            'Concevoir les interfaces de Vigie, du schéma de réseau à l’application mobile hors ligne.',
            'Faire évoluer notre système de design et sa documentation.',
          ],
        },
        { h2: 'Votre profil' },
        {
          bullets: [
            'Au moins quatre ans d’expérience sur des produits complexes et denses en données.',
            'Un portfolio qui montre votre démarche, pas seulement vos écrans.',
            'Un intérêt réel pour l’accessibilité et la lisibilité dans la durée.',
          ],
        },
      ],
    },
  ],
  posts: [
    {
      slug: 'temperature-transformateurs-dix-secondes',
      title: 'Pourquoi nous mesurons la température des transformateurs toutes les dix secondes',
      summary:
        'Une mesure par heure suffit à voir un transformateur chauffer. Elle ne suffit pas à comprendre pourquoi, ni à savoir s’il faut intervenir cette nuit.',
      author: 'Karim Benali',
      publishedAt: '2026-09-02T08:00:00.000Z',
      sector: 'energie',
      media: 'post-transformer',
      body: () => [
        {
          p: 'La température de l’huile d’un transformateur suit sa charge avec un retard de plusieurs dizaines de minutes. Mesurée une fois par heure, elle raconte une histoire lissée, où une surchauffe brève et un défaut naissant se ressemblent.',
        },
        { h2: 'Ce que montre une mesure fine' },
        {
          p: 'Toutes les dix secondes, la réponse thermique à chaque variation de charge devient lisible. Un défaut de refroidissement se trahit par une pente de montée plus raide que d’habitude, bien avant que la température absolue n’atteigne un seuil.',
        },
        { h2: 'Et le volume de données' },
        {
          p: 'Nos nœuds ne transmettent pas chaque mesure. Ils calculent localement les indicateurs utiles et n’envoient la série complète que lorsqu’un écart apparaît. Un transformateur produit ainsi moins de 2 Mo de données par mois.',
        },
      ],
    },
    {
      slug: 'vibrations-turbines-hydroelectriques',
      title: 'Hydroélectricité : ce que les vibrations disent d’une turbine avant la panne',
      summary:
        'Le spectre vibratoire d’une turbine change des semaines avant qu’un palier ne lâche. Encore faut-il savoir le lire à débit variable.',
      author: 'Amina Diallo',
      publishedAt: '2026-07-15T08:00:00.000Z',
      sector: 'industrie',
      media: 'post-hydro',
      body: () => [
        {
          p: 'Une turbine hydroélectrique ne tourne jamais deux jours de suite dans les mêmes conditions. Le débit, la hauteur de chute et la charge demandée modifient son spectre vibratoire bien plus qu’un début d’usure.',
        },
        { h2: 'Comparer ce qui est comparable' },
        {
          p: 'Nos modèles regroupent les mesures par régime de fonctionnement avant de les comparer. Une hausse de 15 % de l’énergie vibratoire à 300 Hz n’a de sens que si elle apparaît à débit et à charge équivalents.',
        },
        {
          p: 'Sur les huit groupes suivis pour un producteur alpin, cette méthode a signalé deux usures de paliers avec six et neuf semaines d’avance, assez pour planifier l’arrêt pendant la période de basses eaux.',
        },
      ],
    },
    {
      slug: 'erosion-des-pales-depuis-le-sol',
      title: 'Érosion des pales : voir depuis le sol ce qu’on ne voyait qu’en nacelle',
      summary:
        'L’érosion du bord d’attaque coûte jusqu’à 3 % de production. Nous la détectons désormais sans arrêter l’éolienne ni envoyer un cordiste.',
      author: 'Sofia Lindqvist',
      publishedAt: '2026-06-10T08:00:00.000Z',
      sector: 'energie',
      media: 'post-blades',
      body: () => [
        {
          p: 'La pluie, le sable et le sel usent le bord d’attaque des pales. L’inspection classique demande d’arrêter l’éolienne et d’envoyer un technicien sur corde, une opération rare et coûteuse.',
        },
        { h2: 'Une signature acoustique' },
        {
          p: 'Une pale érodée ne fait pas le même bruit qu’une pale saine. Des microphones posés au pied du mât, combinés aux données de vent et de production, suffisent à repérer les pales à inspecter en priorité.',
        },
        {
          p: 'Sur un parc de 24 éoliennes, cette méthode a réduit de moitié le nombre d’inspections sur corde, en concentrant les interventions sur les pales réellement abîmées.',
        },
      ],
    },
    {
      slug: 'ou-vivent-vos-donnees',
      title: 'Où vivent vos données : notre hébergement expliqué simplement',
      summary:
        'Les mesures d’un réseau d’eau ou d’électricité sont des données sensibles. Voici où nous les stockons, qui peut les lire et comment nous le prouvons.',
      author: 'Julien Marchetti',
      publishedAt: '2026-05-06T08:00:00.000Z',
      sector: 'industrie',
      media: 'post-storage',
      body: (firm) => [
        {
          p: `Les données de nos clients sont stockées dans deux centres de données situés en France, chez un hébergeur qualifié SecNumCloud. Aucune copie n’est conservée hors de l’Union européenne, y compris les sauvegardes.`,
        },
        { h2: 'Qui peut y accéder' },
        {
          bullets: [
            'Les équipes du client, selon les droits qu’il définit lui-même.',
            `Les ingénieurs ${firm} habilités, uniquement sur demande du client et avec une trace de chaque consultation.`,
            'Personne d’autre, et aucun sous-traitant hors de l’Union européenne.',
          ],
        },
        { h2: 'Et si vous préférez garder vos données chez vous' },
        {
          p: 'Vigie peut être installée dans votre propre centre de données, sans aucune connexion sortante. Les mises à jour sont alors livrées sur support signé et installées par vos équipes.',
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
      alt: 'Pylône de ligne à haute tension se découpant sur un ciel de fin de journée, au-dessus d’un champ',
    },
    {
      name: 'platform-overview',
      file: 'vigie-overview-fr.png',
      alt: 'Écran de vue d’ensemble de la plateforme Vigie : indicateurs du réseau, schéma des postes, liste des alertes et courbe de température d’un transformateur',
    },
    {
      name: 'platform-detail',
      file: 'vigie-detail-fr.png',
      alt: 'Fiche d’un transformateur dans Vigie : durée de vie résiduelle estimée, recommandation de maintenance, spectre de vibration et historique des interventions',
    },
    {
      name: 'solution-sensors',
      file: 'solution-sensor-node.jpg',
      alt: 'Boîtier de mesure communicant fixé sur un câble électrique, vu depuis le sol',
    },
    {
      name: 'solution-platform',
      file: 'solution-control-room.jpg',
      alt: 'Poste de supervision avec plusieurs écrans affichant le schéma d’un réseau ferroviaire',
    },
    {
      name: 'solution-predictive',
      file: 'sector-industry-turbines.jpg',
      alt: 'Salle des turbines d’une centrale hydroélectrique, groupes alignés peints en bleu et en rouge',
    },
    {
      name: 'solution-engineering',
      file: 'solution-clean-room.jpg',
      alt: 'Deux ingénieurs en combinaison de salle blanche devant un instrument de mesure',
    },
    {
      name: 'solution-field',
      file: 'solution-field-fibre.jpg',
      alt: 'Mains d’un technicien utilisant une cliveuse de fibre optique',
    },
    {
      name: 'solution-security',
      file: 'about-servers.jpg',
      alt: 'Baies de serveurs éclairées par leurs voyants bleus',
    },
    {
      name: 'case-grid',
      file: 'case-grid-pylons.jpg',
      alt: 'Pylônes d’une ligne très haute tension sous un ciel bleu nuageux',
    },
    {
      name: 'case-water',
      file: 'case-water-pipes.jpg',
      alt: 'Galerie de canalisations dans une usine de traitement d’eau',
    },
    {
      name: 'case-rail',
      file: 'case-rail-bridge.jpg',
      alt: 'Pont ferroviaire métallique dans la brume d’un matin d’hiver',
    },
    {
      name: 'case-offshore',
      file: 'case-offshore-array.jpg',
      alt: 'Parc éolien en mer vu d’avion, éoliennes alignées jusqu’à l’horizon',
    },
    {
      name: 'post-transformer',
      file: 'news-transformer.jpg',
      alt: 'Transformateur haute tension installé dans un poste électrique',
    },
    {
      name: 'post-hydro',
      file: 'news-hydro-aerial.jpg',
      alt: 'Vue aérienne d’une centrale hydroélectrique au fil de l’eau sur un fleuve',
    },
    {
      name: 'post-blades',
      file: 'news-blades.jpg',
      alt: 'Deux pales d’éolienne posées au sol en forme de V',
    },
    {
      name: 'post-storage',
      file: 'news-drive-internals.jpg',
      alt: 'Face inférieure d’un disque dur de serveur, avec sa carte électronique',
    },
    {
      name: 'company-studio',
      file: 'careers-studio.jpg',
      alt: 'Espace commun lumineux de bureaux, avec canapés et grandes fenêtres',
    },
    {
      name: 'company-lab',
      file: 'about-instrument.jpg',
      alt: 'Ingénieur inspectant un détecteur à la lampe dans un laboratoire',
    },
    {
      name: 'field-rail',
      file: 'sector-rail-viaduct.jpg',
      alt: 'Train traversant un viaduc métallique rouge au-dessus d’une forêt',
    },
    {
      name: 'field-water',
      file: 'sector-water-plant.jpg',
      alt: 'Machines et tuyauteries d’une usine de traitement d’eau',
    },
    {
      name: 'field-energy',
      file: 'sector-energy-offshore.jpg',
      alt: 'Éoliennes en mer sous un ciel voilé',
    },
    {
      name: 'careers-hero',
      file: 'careers-open-office.jpg',
      alt: 'Personne travaillant sur un ordinateur portable dans un bureau ouvert, derrière des plantes',
    },
    {
      name: 'contact-office',
      file: 'contact-loft.jpg',
      alt: 'Grand plateau de bureaux aux fenêtres industrielles',
    },
  ],
  pages: (firm) => ({
    titles: {
      home: 'Accueil',
      solutions: 'Solutions',
      caseStudies: 'Références',
      company: 'Entreprise',
      careers: 'Carrières',
      news: 'Actualités',
      contact: 'Contact',
      legal: 'Mentions légales',
      privacy: 'Politique de confidentialité',
      credits: 'Crédits photos',
    },
    home: {
      heroEyebrow: 'Ingénierie et logiciel pour les infrastructures critiques',
      heroTitle: 'Voir une panne venir, avant qu’elle ne coupe une ville',
      heroSubtitle: `${firm} conçoit les capteurs, la plateforme et les services qui surveillent en continu les réseaux d’électricité, d’eau et de rail. Nos clients interviennent au bon moment, et non plus après la panne.`,
      heroPrimary: 'Parler de votre réseau',
      heroSecondary: 'Voir nos références',
      clientsCaption: 'Ils surveillent leurs réseaux avec nous',
      solutionsTitle: 'Du capteur à la décision',
      figuresTitle: 'En chiffres',
      figures: [
        { value: '12 400', label: 'capteurs en service chez nos clients' },
        { value: '3 200', unit: 'km', label: 'de réseaux surveillés en continu' },
        { value: '99,98', unit: '%', label: 'de disponibilité de la plateforme en 2025' },
        { value: '140', label: 'ingénieurs, data scientists et techniciens' },
      ],
      platformIntro: [
        { h2: 'Vigie, une seule vue de tout le réseau' },
        {
          p: 'Les mesures de nos capteurs, celles de vos systèmes existants et l’historique de vos interventions, réunis dans une plateforme pensée pour les salles de conduite. Chaque alerte dit ce qui se dégrade, avec quelle gravité, et quelle intervention prévoir.',
        },
      ],
      platformCaption:
        'Vue d’ensemble d’un réseau de distribution dans Vigie : état des postes, alertes classées par gravité et température d’un transformateur comparée à son modèle.',
      sectorsTitle: 'Les réseaux que nous surveillons',
      workTitle: 'Références',
      newsTitle: 'Actualités',
      faqTitle: 'Questions fréquentes',
      faq: [
        [
          'Faut-il remplacer nos systèmes de supervision existants ?',
          'Non. Nos capteurs et Vigie se raccordent à vos systèmes SCADA et à votre outil de gestion de maintenance par des protocoles standards. Vos équipes continuent de conduire le réseau avec les outils qu’elles connaissent.',
        ],
        [
          'Combien de temps dure un premier déploiement ?',
          'Un site pilote est opérationnel en huit à douze semaines, étude comprise. La généralisation se fait ensuite par tranches, au rythme de vos contraintes d’exploitation.',
        ],
        [
          'Où sont hébergées nos données ?',
          'En France, chez un hébergeur qualifié SecNumCloud, sans aucune copie hors de l’Union européenne. Vigie peut aussi être installée dans votre propre centre de données.',
        ],
        [
          'Comment le service est-il facturé ?',
          'Les capteurs sont vendus ou loués, la plateforme fait l’objet d’un abonnement annuel selon le nombre d’équipements suivis, et les interventions terrain sont forfaitisées. Un devis détaillé est établi après l’étude de site.',
        ],
        [
          'Travaillez-vous hors de France ?',
          'Oui. Nous intervenons en Belgique, en Suisse et au Québec, depuis notre bureau de Montréal.',
        ],
      ],
      ctaTitle: 'Parlons de votre réseau',
      ctaText:
        'Décrivez-nous vos équipements et ce qui vous préoccupe. Un ingénieur vous répond sous deux jours ouvrés pour organiser une première visite.',
      ctaPrimary: 'Nous contacter',
      ctaSecondary: 'Découvrir les solutions',
    },
    solutions: {
      intro: [
        {
          p: `${firm} couvre toute la chaîne de la surveillance d’un réseau : les capteurs qui mesurent, la plateforme qui analyse, les modèles qui anticipent et les équipes qui installent et entretiennent. Chaque brique fonctionne seule, et elles donnent le meilleur ensemble.`,
        },
      ],
      listTitle: 'Nos solutions',
      methodTitle: 'Comment se déroule un déploiement',
      method: [
        [
          'Étude de site',
          'Deux à quatre semaines. Nous visitons vos installations, étudions vos données existantes et définissons avec vos équipes ce qui doit être mesuré, et pourquoi.',
        ],
        [
          'Pilote',
          'Huit à douze semaines. Un périmètre limité est équipé et raccordé à Vigie. Les seuils d’alerte sont réglés avec vos exploitants, sur des situations réelles.',
        ],
        [
          'Généralisation',
          'Par tranches, sans coupure. Chaque tranche fait l’objet d’une recette conjointe avant sa mise en service.',
        ],
        [
          'Exploitation',
          'Nos équipes assurent la maintenance des capteurs, la surveillance des modèles et un bilan trimestriel avec vos responsables.',
        ],
      ],
      detailCaption:
        'Fiche d’un transformateur dans Vigie : la durée de vie résiduelle estimée conduit à une recommandation d’intervention datée.',
    },
    caseStudies: {
      intro: [
        {
          p: 'Quelques-uns des projets que nos clients ont accepté de présenter. Les chiffres proviennent de leurs propres indicateurs d’exploitation, et chaque texte a été relu par le client avant publication.',
        },
      ],
      figuresTitle: 'Chez nos clients',
      figures: [
        { value: '−41', unit: '%', label: 'd’interventions correctives non planifiées en moyenne' },
        {
          value: '14',
          unit: 'mois',
          label: 'de durée de vie supplémentaire des équipements critiques',
        },
        { value: '8', unit: 'sem.', label: 'd’avance moyenne sur une défaillance détectée' },
      ],
      logosTitle: 'Ils nous font confiance',
    },
    company: {
      heroEyebrow: 'L’entreprise',
      heroTitle: 'Des ingénieurs qui ont conduit des réseaux avant de les équiper',
      heroSubtitle: `${firm} a été fondée en 2014 par des exploitants de réseaux électriques qui ne trouvaient pas les outils dont ils avaient besoin.`,
      story: [
        { h2: 'Notre histoire' },
        {
          p: `Claire Dumont et Karim Benali travaillaient dans l’exploitation d’un réseau de distribution quand une tempête a privé d’électricité 90 000 foyers pendant quatre jours. Les données qui auraient permis de localiser les défauts existaient, mais personne ne pouvait les lire à temps. ${firm} est née de ce constat.`,
        },
        {
          p: 'Les premiers capteurs ont été posés en 2015 sur un réseau rural des Ardennes. Aujourd’hui, nos équipements surveillent des réseaux d’électricité, d’eau et de rail dans quatre pays.',
        },
        { h2: 'Indépendants et européens' },
        {
          p: 'L’entreprise appartient à ses fondateurs, à ses salariés et à deux fonds d’investissement européens. Nous concevons nos matériels en France, les assemblons à Lyon, et hébergeons toutes les données de nos clients dans l’Union européenne.',
        },
      ],
      figuresTitle: 'Depuis 2014',
      figures: [
        { value: '140', label: 'salariés, dont 90 ingénieurs et techniciens' },
        { value: '4', label: 'pays : France, Belgique, Suisse et Canada' },
        { value: '38', label: 'clients exploitants de réseaux' },
        { value: '12 %', label: 'du chiffre d’affaires consacré à la recherche' },
      ],
      principlesTitle: 'Nos principes',
      principles: [
        {
          icon: 'check',
          title: 'La mesure avant l’opinion',
          text: 'Nous ne recommandons une intervention que lorsque les mesures la justifient, et nous montrons toujours lesquelles.',
        },
        {
          icon: 'users',
          title: 'Le terrain d’abord',
          text: 'Nos ingénieurs passent du temps en salle de conduite et sur les ouvrages avant de concevoir quoi que ce soit.',
        },
        {
          icon: 'lock',
          title: 'La sécurité par conception',
          text: 'Chaque capteur, chaque mise à jour et chaque accès aux données est pensé pour un réseau critique.',
        },
        {
          icon: 'leaf',
          title: 'Durer',
          text: 'Nos matériels sont réparables, conçus pour dix ans de service, et repris en fin de vie.',
        },
      ],
      labCaption:
        'Qualification d’un détecteur au laboratoire. Aucun matériel ne part sur un site client sans avoir passé ces essais.',
      teamTitle: 'Direction',
      fieldTitle: 'Sur le terrain',
    },
    careers: {
      heroEyebrow: 'Carrières',
      heroTitle: 'Rendre les réseaux plus fiables, avec des gens qui aiment comprendre',
      heroSubtitle:
        'Nous recrutons des ingénieurs, des data scientists, des techniciens et des designers qui veulent voir leur travail fonctionner sur le terrain.',
      heroAction: 'Voir les offres',
      intro: [
        {
          p: `Chez ${firm}, celui qui écrit un modèle rencontre celui qui pose le capteur, et tous deux passent du temps chez le client. C’est ce qui nous permet de livrer des outils que les exploitants utilisent vraiment.`,
        },
      ],
      benefitsTitle: 'Ce que nous proposons',
      benefits: [
        {
          icon: 'clock',
          title: 'Un rythme soutenable',
          text: 'Deux jours de télétravail par semaine pour les postes qui le permettent, et des astreintes limitées et rémunérées.',
        },
        {
          icon: 'book',
          title: 'Apprendre en continu',
          text: 'Un budget de formation individuel et une semaine par an consacrée à un projet de votre choix.',
        },
        {
          icon: 'heart',
          title: 'Une protection solide',
          text: 'Mutuelle prise en charge à 100 %, prévoyance et congé parental complété pour tous les parents.',
        },
        {
          icon: 'award',
          title: 'Partager la réussite',
          text: 'Chaque salarié devient actionnaire après un an, et l’intéressement est versé à parts égales.',
        },
      ],
      rolesTitle: 'Offres ouvertes',
      processTitle: 'Notre processus de recrutement',
      process: [
        [
          'Un premier échange',
          'Trente minutes avec la personne qui dirigera votre équipe, pour parler du poste et de vos attentes.',
        ],
        [
          'Un exercice court',
          'Un cas proche du travail réel, préparé chez vous en deux heures au plus, puis discuté ensemble.',
        ],
        [
          'Une demi-journée avec l’équipe',
          'Vous rencontrez vos futurs collègues et, pour les postes techniques, vous visitez le laboratoire ou un site.',
        ],
        ['Une réponse sous une semaine', 'Quelle que soit la décision, nous vous l’expliquons.'],
      ],
      ctaTitle: 'Aucune offre ne vous correspond',
      ctaText:
        'Écrivez-nous quand même. Nous lisons toutes les candidatures spontanées et vous répondons dans tous les cas.',
      ctaAction: 'Envoyer une candidature',
    },
    news: {
      intro: [
        {
          p: 'Ce que nous apprenons en surveillant des réseaux : retours de terrain, méthodes, et coulisses de nos produits.',
        },
      ],
    },
    contact: {
      intro: [
        {
          p: 'Pour un projet, une question sur nos solutions ou une demande de visite, écrivez-nous. Un ingénieur vous répond sous deux jours ouvrés.',
        },
        { h2: 'Paris · siège' },
        { p: '18 rue des Ateliers, 75011 Paris. Téléphone +33 1 99 00 42 17. contact@example.com' },
        { h2: 'Lyon · laboratoire' },
        { p: '42 quai Perrache, 69002 Lyon. Téléphone +33 4 99 00 18 64. lyon@example.com' },
        { h2: 'Montréal' },
        {
          p: '1250 rue Ottawa, Montréal (Québec) H3C 0B6. Téléphone +1 514 555 0142. montreal@example.com',
        },
        { h2: 'Presse et partenariats' },
        { p: 'presse@example.com' },
      ],
      officeCaption: 'Le plateau du siège parisien.',
      ctaTitle: 'Décrivez-nous votre réseau',
      ctaText:
        'Type d’équipements, étendue, préoccupations actuelles : quelques lignes suffisent pour préparer un premier échange utile.',
      ctaAction: 'Écrire à un ingénieur',
    },
    legal: [
      { h2: 'Éditeur du site' },
      {
        p: `${firm}, société par actions simplifiée au capital de 850 000 €, dont le siège social est situé 18 rue des Ateliers, 75011 Paris. Immatriculée au registre du commerce et des sociétés de Paris sous le numéro 000 000 000. Numéro de TVA intracommunautaire : FR00 000000000.`,
      },
      { p: 'Directrice de la publication : Claire Dumont, présidente-directrice générale.' },
      { h2: 'Hébergement' },
      {
        p: 'Le site est hébergé en France. Les coordonnées complètes de l’hébergeur sont communiquées sur simple demande à contact@example.com.',
      },
      { h2: 'Propriété intellectuelle' },
      {
        p: 'Les textes, logos et interfaces présentés sur ce site sont protégés. Les photographies sont utilisées selon leurs licences respectives, détaillées sur la page Crédits photos.',
      },
    ],
    privacy: [
      {
        p: `${firm} attache une grande importance à la protection des données personnelles. Cette page explique quelles données nous collectons sur ce site, pourquoi, et comment exercer vos droits.`,
      },
      { h2: 'Données collectées' },
      {
        bullets: [
          'Les informations que vous nous transmettez en nous écrivant : nom, adresse électronique, entreprise et contenu du message.',
          'Des statistiques de fréquentation anonymes, sans cookie de suivi publicitaire.',
        ],
      },
      { h2: 'Finalités et durée de conservation' },
      {
        p: 'Vos messages sont utilisés uniquement pour vous répondre et sont conservés trois ans après notre dernier échange. Les candidatures sont conservées deux ans, sauf demande contraire de votre part.',
      },
      { h2: 'Vos droits' },
      {
        p: 'Vous pouvez accéder à vos données, les rectifier, les effacer ou vous opposer à leur traitement en écrivant à dpo@example.com. Vous pouvez également adresser une réclamation à la CNIL.',
      },
    ],
    credits: {
      intro: [
        {
          p: 'Les photographies de ce site sont publiées sous licence libre ou dans le domaine public. Nous remercions leurs auteurs. Elles ont été recadrées et redimensionnées pour le web.',
        },
      ],
      licenceWord: 'licence',
      sourceWord: 'source',
    },
  }),
  menus: {
    header: [
      { label: 'Solutions', page: 'solutions' },
      { label: 'Références', page: 'caseStudies' },
      { label: 'Entreprise', page: 'company' },
      { label: 'Carrières', page: 'careers' },
      { label: 'Actualités', page: 'news' },
    ],
    footer: [
      { label: 'Solutions', page: 'solutions' },
      { label: 'Références', page: 'caseStudies' },
      { label: 'Entreprise', page: 'company' },
      { label: 'Carrières', page: 'careers' },
      { label: 'Actualités', page: 'news' },
      { label: 'Contact', page: 'contact' },
      { label: 'Mentions légales', page: 'legal' },
      { label: 'Confidentialité', page: 'privacy' },
      { label: 'Crédits photos', page: 'credits' },
    ],
    action: 'Nous contacter',
  },
  settings: () => ({
    tagline:
      'Capteurs, logiciel et services pour surveiller les réseaux d’électricité, d’eau et de rail.',
    footerNote: [
      'Paris\n18 rue des Ateliers\n75011 Paris',
      'Lyon\n42 quai Perrache\n69002 Lyon',
      'Montréal\n1250 rue Ottawa\nMontréal QC H3C 0B6',
    ].join('\n\n'),
  }),
  widgets: {
    sectors: 'Secteurs',
    moreCaseStudies: 'Autres références',
    otherSolutions: 'Nos autres solutions',
    recentPosts: 'Articles récents',
    contactTitle: 'Parler à un ingénieur',
    contactHours: 'Du lundi au vendredi',
    contactHoursValue: '8 h 30 à 18 h 30',
    ctaHeading: 'Un réseau comparable à surveiller ?',
    ctaBody: 'Décrivez-le en quelques lignes. Un ingénieur vous répond sous deux jours ouvrés.',
    ctaLabel: 'Nous contacter',
    searchTitle: 'Rechercher',
    searchPlaceholder: 'Un client, un équipement',
    relatedWork: 'Références associées',
    openRoles: 'Autres offres',
  },
}
