import type { SaasCopy, SaasFeatureCopy, SaasUpdateCopy } from './saas-copy.js'

/** Le site `saas` en français. Voir `saas-copy.ts` pour la forme. */

const FEATURES: readonly SaasFeatureCopy[] = [
  {
    name: 'Circuits de validation',
    slug: 'circuits-de-validation',
    short: 'Montant, centre de coûts, fournisseur : chaque demande part vers les bons validateurs.',
    description:
      'Écrivez votre matrice de délégation une fois, sous forme de règles sur le montant, le centre de coûts, le fournisseur et la catégorie. Chaque demande trouve ses validateurs sans que personne ait à la transférer.',
    icon: 'layers',
    screenshot: 'policy-editor',
    body: (name) => [
      { h2: 'Votre matrice de délégation, en règles' },
      {
        p: `La plupart des équipes financières ont déjà une matrice de délégation : un tableur qui dit qui signe quoi, à partir de quel montant, pour quel centre de coûts. Dans ${name}, ce tableur devient une politique. Chaque ligne est une étape avec ses conditions, ses validateurs et un délai, et chaque demande est confrontée à la politique dès qu’elle est déposée.`,
      },
      {
        p: 'Les validateurs peuvent être des personnes nommées, des rôles comme le responsable budgétaire d’un centre de coûts, ou des groupes synchronisés depuis votre annuaire. Les étapes se suivent par défaut. Une étape peut aussi se dérouler en parallèle d’une autre : les achats examinent un nouveau fournisseur pendant que le responsable budgétaire examine la dépense.',
      },
      { h2: 'Modifier sans risque' },
      {
        p: 'Les politiques sont versionnées. Une modification est enregistrée en brouillon, et avant de la publier vous pouvez la rejouer sur les demandes des 90 derniers jours pour voir lesquelles auraient été acheminées autrement. Chaque version publiée reste dans le journal d’audit, avec le nom de la personne qui l’a publiée.',
      },
      {
        ul: [
          'Conditions sur le montant, la devise, le centre de coûts, le fournisseur, la catégorie et tout champ personnalisé',
          'Délais en jours ouvrés, avec un rappel la veille',
          'Délégués pour les validateurs absents, et repli sur leur responsable',
          'Politiques distinctes pour les demandes d’achat, les factures fournisseurs et les avenants',
        ],
      },
    ],
    details: [
      [
        'Que se passe-t-il quand aucune règle ne correspond à une demande ?',
        'Elle part vers l’étape par défaut que vous choisissez pour la politique, en général le contrôle de gestion, et elle est signalée pour que le trou dans la matrice soit comblé.',
      ],
      [
        'Une même personne peut-elle valider deux étapes ?',
        'Seulement si vous l’autorisez. Par défaut, la personne qui a validé une étape est ignorée à la suivante, et l’étape passe au validateur éligible suivant.',
      ],
      [
        'Combien de politiques peut-on créer ?',
        'Dix avec la formule Équipe, autant que nécessaire avec Business et Entreprise.',
      ],
    ],
  },
  {
    name: 'Journal d’audit',
    slug: 'journal-d-audit',
    short: 'Chaque décision est écrite une fois et jamais réécrite. Les auditeurs le lisent seuls.',
    description:
      'Chaque demande, modification, commentaire et décision est inscrit dans un journal qu’on ne peut pas réécrire, et vos auditeurs peuvent le filtrer et l’exporter eux-mêmes.',
    icon: 'shield',
    screenshot: 'audit-log',
    body: (name) => [
      { h2: 'Une trace pour chaque décision' },
      {
        p: `Quand une demande est créée, modifiée, commentée ou tranchée, ${name} écrit un événement : qui, quoi, quand, et d’où. Les événements s’ajoutent et ne se modifient jamais. Chacun porte l’empreinte du précédent, de sorte qu’un trou ou une altération n’importe où dans la chaîne est détecté à la prochaine vérification.`,
      },
      {
        p: 'Le journal garde ce que les personnes font dans le navigateur et ce que les intégrations font en leur nom. Une facture comptabilisée dans Sage X3, une ligne budgétaire lue depuis votre ERP et une décision prise depuis un message Slack apparaissent dans la même liste, dans l’ordre.',
      },
      { h2: 'Des preuves que vos auditeurs vont chercher eux-mêmes' },
      {
        p: 'Donnez à un commissaire aux comptes un rôle en lecture seule, limité à une période. Il filtre par demande, personne, événement ou montant, et exporte exactement l’échantillon dont il a besoin, sans capture d’écran de votre équipe et sans voir autre chose dans l’espace de travail.',
      },
      {
        ul: [
          'Exports en CSV et en PDF, signés pour qu’un fichier puisse être vérifié contre le journal',
          'Conservation d’un an avec Équipe, de sept ans avec Business et de dix ans avec Entreprise',
          'Vérification de la chaîne à la demande et chaque nuit',
        ],
      },
    ],
    details: [
      [
        'Un administrateur peut-il supprimer un événement ?',
        'Non. Un administrateur peut masquer les données personnelles d’un événement après une demande d’effacement valable, et ce masquage est lui-même inscrit comme un événement.',
      ],
      [
        'Quel fuseau horaire le journal utilise-t-il ?',
        'Les événements sont stockés en UTC et affichés dans le fuseau de la personne qui lit. Les exports sont en UTC.',
      ],
    ],
  },
  {
    name: 'Synchronisation comptable',
    slug: 'synchronisation-comptable',
    short:
      'Factures et commandes validées passent dans Sage X3, Cegid, NetSuite ou Business Central.',
    description:
      'Les factures fournisseurs et les bons de commande validés arrivent dans votre ERP en moins d’une minute, et les lignes budgétaires remontent toutes les quinze minutes pour que les validateurs voient ce qu’il reste.',
    icon: 'cloud',
    screenshot: 'erp-sync',
    body: (name) => [
      { h2: 'Une validation qui se termine dans la comptabilité' },
      {
        p: `Une validation n’est terminée que lorsque l’ERP la connaît. ${name} se connecte à Sage X3, Cegid, NetSuite et Microsoft Dynamics 365 Business Central. À la dernière validation, la facture fournisseur ou le bon de commande est créé ou mis à jour dans l’ERP, avec les validateurs, les dates et un lien vers la demande.`,
      },
      {
        p: 'La connexion fonctionne dans les deux sens. Fournisseurs, centres de coûts, filiales et lignes budgétaires sont lus depuis l’ERP : une demande est donc imputée comme vos écritures, et le validateur voit le budget restant avant de décider.',
      },
      { h2: 'Des échecs qu’on voit' },
      {
        p: 'Chaque synchronisation est listée avec son résultat. Quand l’ERP refuse un enregistrement ou limite le débit des appels, la synchronisation est relancée après un délai, et l’équipe finance est prévenue si elle échoue encore au bout d’une heure. Rien n’est perdu en silence.',
      },
      {
        ul: [
          'Correspondance des filiales, des devises et des codes de TVA',
          'Comptabilisation en brouillon ou validée, selon le type de pièce',
          'Un import CSV nocturne pour les ERP sans API',
        ],
      },
    ],
    details: [
      [
        'Combien de temps faut-il pour paramétrer une connexion ?',
        'En général une heure avec l’administrateur de votre ERP. Nous lui envoyons au préalable la liste des droits dont l’utilisateur d’intégration a besoin.',
      ],
      [
        'La synchronisation écrit-elle quelque chose que nous n’avons pas validé ?',
        'Non. Elle écrit les pièces validées et le détail des validations, et lit les données de référence citées plus haut.',
      ],
    ],
  },
  {
    name: 'SSO et SCIM',
    slug: 'sso-et-scim',
    short: 'Connexion par Okta, Entra ID ou Google. Les accès suivent votre annuaire.',
    description:
      'Les membres se connectent par votre fournisseur d’identité, et SCIM garde les personnes, les groupes et les rôles alignés sur votre annuaire.',
    icon: 'lock',
    screenshot: 'sso-scim',
    body: () => [
      { h2: 'Connexion par votre fournisseur d’identité' },
      {
        p: 'L’authentification unique SAML fonctionne avec Okta, Microsoft Entra ID, Google Workspace et tout fournisseur qui respecte la norme. Une fois activée, vous pouvez désactiver la connexion par mot de passe pour tout l’espace de travail, et la durée des sessions suit la politique que vous fixez.',
      },
      { h2: 'Provisionnement depuis votre annuaire' },
      {
        p: 'Avec SCIM, une personne ajoutée à un groupe de votre annuaire apparaît dans l’espace de travail avec le bon rôle, et une personne retirée de l’annuaire perd aussitôt son accès. Les groupes correspondent à des rôles : le groupe des contrôleurs de gestion dans Okta devient les validateurs finance dans le produit, sans que personne ne mette une liste à jour à la main.',
      },
      { h2: 'Des accès qui s’arrêtent à temps' },
      {
        p: 'Les auditeurs et les prestataires peuvent recevoir une date de fin dès leur invitation. À cette date, leur accès s’arrête, les étapes qui les attendaient passent à la personne qui les a invités, et le changement est inscrit dans le journal d’audit.',
      },
      {
        ul: [
          'Rôles de demandeur, de validateur, de comptabilité fournisseurs, d’administrateur et d’auditeur',
          'Accès d’auditeur limité dans le temps, clos automatiquement à la date fixée',
          'Connexions inscrites dans le journal d’audit',
        ],
      },
    ],
    details: [
      [
        'Quelles formules incluent le SSO ?',
        'La connexion Google est incluse dans toutes les formules. SAML et SCIM sont inclus dans Business et Entreprise.',
      ],
      [
        'Que deviennent les validations en cours quand quelqu’un part ?',
        'Ses étapes en attente passent à son délégué, ou à son responsable s’il n’en avait pas, et la réaffectation est enregistrée.',
      ],
    ],
  },
  {
    name: 'Suivi des dépenses',
    slug: 'suivi-des-depenses',
    short: 'Où les demandes attendent, qui est lent, quels budgets dérapent.',
    description:
      'Des rapports sur le délai de validation, les dépenses par rapport au budget et les demandes qui attendent trop longtemps, construits sur les mêmes données que le journal d’audit.',
    icon: 'chart',
    screenshot: 'spend-reporting',
    body: () => [
      { h2: 'Où les validations attendent' },
      {
        p: 'Le rapport sur le délai de validation montre le temps médian entre la demande et la décision finale, par semaine, par mois ou par trimestre, et le détaille par étape et par validateur. Quand une étape est lente, vous voyez laquelle, et si elle l’est pour tous les montants ou seulement pour les gros.',
      },
      { h2: 'La dépense face au budget' },
      {
        p: 'Les lignes budgétaires étant lues depuis l’ERP, chaque demande validée est comptée dans son centre de coûts dès sa validation, des semaines avant l’arrivée de la facture. Les responsables budgétaires voient l’engagé, et la finance voit quels centres de coûts dépasseront avant la clôture du mois.',
      },
      { h2: 'Des chiffres qu’on peut retracer' },
      {
        p: 'Chaque chiffre d’un rapport ouvre les demandes à partir desquelles il a été calculé, avec leur circuit de validation et leur historique dans le journal d’audit. Une médiane citée dans un dossier de conseil d’administration se retrace jusqu’aux demandes une à une en deux clics.',
      },
      {
        ul: [
          'Vues enregistrées, partageables par un lien',
          'Un e-mail hebdomadaire aux responsables budgétaires avec leur engagé',
          'Export CSV de chaque rapport, et une API en lecture seule pour votre entrepôt de données',
        ],
      },
    ],
    details: [
      [
        'Les rapports incluent-ils les demandes refusées ?',
        'Oui, dans une série à part, pour que le temps passé sur les demandes refusées soit visible aussi.',
      ],
    ],
  },
  {
    name: 'API et webhooks',
    slug: 'api-et-webhooks',
    short: 'Une API REST versionnée et des webhooks signés, avec les droits de l’application.',
    description:
      'Tout ce que le produit fait dans le navigateur peut se faire par une API REST versionnée, et des webhooks signés préviennent vos systèmes quand une décision est prise.',
    icon: 'code',
    screenshot: 'api-webhooks',
    body: () => [
      { h2: 'Le même produit, par une API' },
      {
        p: 'L’API REST est versionnée par date et couvre les demandes, les validations, les politiques, les fournisseurs, le journal d’audit et les rapports. Les clés d’API sont limitées en lecture ou en écriture et aux parties de l’espace de travail dont elles ont besoin, et chaque appel qu’elles font est inscrit dans le journal d’audit comme n’importe quelle action.',
      },
      { h2: 'Un webhook pour chaque décision' },
      {
        p: 'Les webhooks partent quand une demande est créée, validée, refusée ou modifiée. Chaque envoi est signé en HMAC-SHA256 et rejoué pendant 24 heures au plus quand votre point de terminaison ne répond pas, et les derniers envois de chaque point de terminaison sont listés avec leur code de réponse.',
      },
      { h2: 'Des changements annoncés à l’avance' },
      {
        p: 'Une nouvelle version de l’API est publiée avec une date, et la précédente continue de fonctionner au moins 12 mois après elle. Chaque changement est listé dans les nouveautés, et les titulaires des clés qui appellent encore une version en fin de vie sont prévenus par e-mail trois mois avant son arrêt.',
      },
      {
        ul: [
          'Clés d’idempotence sur chaque écriture',
          'Un espace de test avec des données fictives pour chaque client',
          'Une limite de 600 requêtes par minute et par clé',
        ],
      },
    ],
    details: [
      [
        'Existe-t-il une bibliothèque cliente ?',
        'Nous publions des clients pour TypeScript et Python. Tout langage capable d’émettre une requête HTTPS peut utiliser l’API directement.',
      ],
    ],
  },
]

/** Du plus ancien au plus récent : semé dans cet ordre, listé du plus récent au plus ancien par identifiant. */
const UPDATES: readonly SaasUpdateCopy[] = [
  {
    title: 'Rattachement des groupes SCIM aux rôles',
    slug: 'groupes-scim',
    summary:
      'Les groupes de votre fournisseur d’identité correspondent désormais à des rôles : un changement dans l’annuaire règle aussi les droits.',
    publishedAt: '2026-05-14T09:00:00.000Z',
    screenshot: 'sso-scim',
    caption:
      'Les paramètres de connexion et de provisionnement, avec cinq groupes Okta rattachés à des rôles.',
    body: () => [
      {
        p: 'Jusqu’ici, SCIM créait et supprimait des membres, et les rôles se réglaient à la main. Dès aujourd’hui, vous pouvez rattacher un groupe d’Okta, de Microsoft Entra ID ou de Google Workspace à un rôle, et l’appartenance à ce groupe fixe le rôle.',
      },
      {
        ul: [
          'Un groupe peut correspondre à demandeur, validateur, comptabilité fournisseurs, administrateur ou auditeur',
          'Un rôle de validateur peut être limité aux centres de coûts que le groupe possède',
          'Les changements s’appliquent dans la minute qui suit leur envoi par l’annuaire',
        ],
      },
      {
        p: 'Les rôles existants restent tels quels tant que vous n’enregistrez pas de rattachement. Paramètres, puis Connexion et provisionnement, liste tous les groupes envoyés par votre annuaire.',
      },
    ],
  },
  {
    title: 'Échéances et rappels à chaque étape',
    slug: 'echeances-et-rappels',
    summary:
      'Chaque étape d’une politique peut porter une échéance en jours ouvrés, avec un rappel la veille.',
    publishedAt: '2026-06-04T09:00:00.000Z',
    body: () => [
      {
        p: 'Une demande qui attend une seule personne retient tous ceux qui viennent après elle. Les étapes portent désormais une échéance, comptée en jours ouvrés à partir de l’ouverture de l’étape et qui suit les jours fériés du pays du validateur.',
      },
      {
        p: 'Le validateur reçoit un rappel le jour ouvré précédant l’échéance, par e-mail et dans Slack ou Microsoft Teams s’ils sont connectés. Quand une échéance est dépassée, la demande est marquée en retard dans la file et l’étape peut passer automatiquement à un délégué.',
      },
    ],
  },
  {
    title: 'Délégation pendant vos absences',
    slug: 'delegation-pendant-les-absences',
    summary:
      'Un validateur peut nommer un délégué pour une période, et ses étapes lui sont confiées pendant son absence.',
    publishedAt: '2026-06-25T09:00:00.000Z',
    body: () => [
      {
        p: 'Fixez une période et un délégué depuis votre profil, ou laissez votre agenda le faire : quand Google Agenda ou Outlook vous indique absent, le délégué que vous avez choisi reçoit vos étapes pour ces jours-là.',
      },
      {
        ul: [
          'Un délégué ne peut pas valider une demande qu’il a lui-même déposée',
          'Les décisions déléguées montrent les deux noms dans la demande et dans le journal d’audit',
          'Les administrateurs peuvent désigner un délégué pour une personne absente sans préavis',
        ],
      },
    ],
  },
  {
    title: 'Connecteur Sage X3',
    slug: 'connecteur-sage-x3',
    summary: 'Sage X3 rejoint Cegid et NetSuite parmi les ERP connectés dans les deux sens.',
    publishedAt: '2026-07-16T09:00:00.000Z',
    screenshot: 'erp-sync',
    caption:
      'L’activité récente d’une connexion à l’ERP, avec une synchronisation relancée après une limite de débit.',
    body: () => [
      {
        p: 'Le connecteur Sage X3 lit les fournisseurs, les sections analytiques et les écritures budgétaires, et écrit les factures d’achat et les bons de commande validés. Les sections analytiques correspondent aux centres de coûts : une politique rédigée pour un service fonctionne donc sur la section que votre comptabilité utilise déjà.',
      },
      {
        p: 'Les connexions sont disponibles avec Business et Entreprise. Pour en monter une, il faut un utilisateur Sage X3 disposant des droits listés dans l’écran de paramétrage, et environ une heure.',
      },
    ],
  },
  {
    title: 'Exports d’audit signés',
    slug: 'exports-d-audit-signes',
    summary:
      'Les exports CSV et PDF du journal d’audit sont désormais signés : un fichier peut être vérifié contre le journal.',
    publishedAt: '2026-08-06T09:00:00.000Z',
    screenshot: 'audit-log',
    caption: 'Le journal d’audit filtré sur une demande d’achat, prêt à être exporté.',
    body: () => [
      {
        p: 'Chaque export du journal d’audit est maintenant accompagné d’une signature portant sur son contenu et sur l’empreinte du dernier événement qu’il inclut. Toute personne qui détient le fichier peut le vérifier avec la clé publique de l’espace de travail, et un auditeur peut confirmer qu’aucune ligne n’a été ajoutée, retirée ou modifiée après l’export.',
      },
      {
        p: 'La signature est active pour tous les exports des espaces Business et Entreprise, sans rien à paramétrer. Les étapes de vérification sont décrites dans Paramètres, puis Journal d’audit.',
      },
    ],
  },
  {
    title: 'Étapes de validation en parallèle',
    slug: 'validations-en-parallele',
    summary:
      'Deux étapes peuvent désormais se dérouler en même temps : les achats et un responsable budgétaire examinent une demande ensemble.',
    publishedAt: '2026-08-27T09:00:00.000Z',
    screenshot: 'policy-editor',
    caption:
      'Une politique de demandes d’achat où les achats examinent les nouveaux fournisseurs en parallèle de l’étape 1.',
    body: () => [
      {
        p: 'Les étapes se suivaient strictement l’une après l’autre. Une politique peut maintenant en ouvrir deux à la fois : les achats examinent un nouveau fournisseur pendant que le responsable budgétaire examine la dépense, et la demande avance quand les deux ont validé.',
      },
      {
        ul: [
          'Marquez une étape comme parallèle à la précédente dans l’éditeur de politique',
          'Un refus à l’une ou l’autre étape clôt la demande, avec le motif affiché au demandeur',
          'Les rapports comptent la durée d’une étape parallèle à partir de son ouverture',
        ],
      },
      {
        p: 'Dans les espaces qui l’ont essayé en août, les demandes de nouveaux fournisseurs ont abouti à une décision un jour et demi plus tôt.',
      },
    ],
  },
]

export const SAAS_COPY_FR: SaasCopy = {
  locale: 'fr',
  defaultProductName: 'Ledgerline',
  schema: {
    routes: { feature: '/fonctionnalites/:slug', changelog: '/nouveautes/:slug' },
    labels: {
      feature: { singular: 'Fonctionnalité', plural: 'Fonctionnalités' },
      changelog: { singular: 'Nouveauté', plural: 'Nouveautés' },
    },
  },
  slugs: {
    home: 'home',
    product: 'produit',
    pricing: 'tarifs',
    security: 'securite',
    changelog: 'nouveautes',
    about: 'entreprise',
    demo: 'demo',
    legal: 'mentions-legales',
    privacy: 'confidentialite',
    credits: 'credits-photos',
  },
  // Un numéro parisien de la plage que l’ARCEP réserve à la fiction : il ne sonne chez personne.
  phone: { display: '+33 1 99 00 67 21', href: 'tel:+33199006721' },
  customers: [
    { key: 'logo-marenne-logistique', name: 'Marenne Logistique' },
    { key: 'logo-cliniques-du-vivier', name: 'Cliniques du Vivier' },
    { key: 'logo-castellan-alimentaire', name: 'Castellan Alimentaire' },
    { key: 'logo-tessaly-energies', name: 'Tessaly Énergies' },
    { key: 'logo-orrin-and-vale', name: 'Orrin & Vale' },
    { key: 'logo-nordgate-habitat', name: 'Nordgate Habitat' },
  ],
  features: FEATURES,
  updates: UPDATES,
  media: [
    {
      name: 'app',
      file: 'approvals-queue-fr.png',
      alt: 'La file de validations d’une entreprise de transport, avec une demande de révision de freins ouverte à côté de la liste et son circuit de validation',
    },
    {
      name: 'policy-editor',
      file: 'policy-editor-fr.png',
      alt: 'L’éditeur de politique des demandes d’achat, avec quatre étapes de validation et leurs conditions sur le montant, le fournisseur et la catégorie',
    },
    {
      name: 'audit-log',
      file: 'audit-log-fr.png',
      alt: 'Le journal d’audit filtré sur une demande d’achat, avec six événements, leur heure, leur auteur et leur empreinte de chaîne',
    },
    {
      name: 'erp-sync',
      file: 'erp-sync-fr.png',
      alt: 'Les paramètres de la connexion à Sage X3 et son activité récente, avec quatre enregistrements synchronisés',
    },
    {
      name: 'sso-scim',
      file: 'sso-scim-fr.png',
      alt: 'Les paramètres de connexion et de provisionnement, avec l’authentification unique SAML par Okta et cinq groupes rattachés à des rôles',
    },
    {
      name: 'spend-reporting',
      file: 'spend-reporting-fr.png',
      alt: 'Le rapport sur le délai de validation, un histogramme du délai médian qui passe de 6,8 à 3,6 heures en treize semaines',
    },
    {
      name: 'api-webhooks',
      file: 'api-webhooks-fr.png',
      alt: 'Les paramètres de l’API et des webhooks, avec une requête HTTP qui crée une demande d’achat et deux points de terminaison de webhook',
    },
    {
      name: 'office-1',
      file: 'office-paris.jpg',
      alt: 'Les toits de Paris au crépuscule, avec la coupole du Panthéon à l’horizon et des immeubles du 20e siècle au premier plan',
    },
    {
      name: 'office-2',
      file: 'office-montreal.jpg',
      alt: 'Les tours du centre-ville de Montréal vues du mont Royal en hiver, avec le fleuve et un pont au fond',
    },
    {
      name: 'security-racks',
      file: 'security-racks.jpg',
      alt: 'Une rangée de baies noires avec des panneaux de brassage et des câbles réseau bleus, dans une salle de centre de données à plancher technique',
    },
  ],
  tiers: [
    {
      key: 'tier-team',
      name: 'Équipe',
      price: '11 €',
      interval: 'par validateur et par mois, facturé à l’année',
      features: [
        'Validateurs : jusqu’à 25',
        'Demandeurs : illimités, gratuits',
        'Politiques de validation : 10',
        'Connexions à l’ERP : 1',
        'Historique du journal d’audit : 1 an',
        'Authentification unique : Google',
        'Assistance : e-mail, jour ouvré suivant',
      ],
      actionLabel: 'Démarrer un essai',
    },
    {
      key: 'tier-business',
      name: 'Business',
      price: '22 €',
      interval: 'par validateur et par mois, facturé à l’année',
      features: [
        'Validateurs : jusqu’à 250',
        'Demandeurs : illimités, gratuits',
        'Politiques de validation : illimitées',
        'Connexions à l’ERP : 3',
        'Historique du journal d’audit : 7 ans',
        'Authentification unique : SAML et SCIM',
        'Assistance : e-mail et messagerie, le jour ouvré même',
        'Étapes de validation en parallèle',
        'Exports d’audit signés',
      ],
      actionLabel: 'Démarrer un essai',
      primary: true,
      highlighted: true,
    },
    {
      key: 'tier-enterprise',
      name: 'Entreprise',
      price: 'Sur devis',
      interval: 'contrat annuel, à partir de 100 validateurs',
      features: [
        'Validateurs : illimités',
        'Demandeurs : illimités, gratuits',
        'Politiques de validation : illimitées',
        'Connexions à l’ERP : illimitées',
        'Historique du journal d’audit : 10 ans',
        'Authentification unique : SAML et SCIM',
        'Assistance : ingénieur dédié, réponse en 1 heure',
        'Étapes de validation en parallèle',
        'Exports d’audit signés',
        'Hébergement des données en France ou en Allemagne',
        'Facturation à 30 jours',
      ],
      actionLabel: 'Parler à un conseiller',
    },
  ],
  homeQuestions: (name) => [
    [
      'Combien de temps faut-il pour démarrer ?',
      'La plupart des équipes valident leur première vraie demande en deux semaines. Un ingénieur solutions transforme avec vous votre matrice de délégation actuelle en politique, et la connexion à l’ERP prend environ une heure avec votre administrateur.',
    ],
    [
      'Les demandeurs ont-ils besoin d’une licence payante ?',
      `Non. Toute personne de l’entreprise peut déposer une demande ou une facture dans ${name} sans frais. Vous payez les validateurs, et seulement les mois où ils valident quelque chose.`,
    ],
    [
      'À quels ERP vous connectez-vous ?',
      'Sage X3, Cegid, NetSuite et Microsoft Dynamics 365 Business Central, dans les deux sens. Tout autre système passe par l’API ou par un import CSV nocturne.',
    ],
    [
      'Nos auditeurs peuvent-ils avoir un accès ?',
      'Oui. Le rôle d’auditeur est en lecture seule, limité à la période que vous fixez. Les auditeurs filtrent et exportent le journal eux-mêmes, et leur accès s’arrête tout seul.',
    ],
    [
      'Où nos données sont-elles stockées ?',
      'À Paris ou à Francfort, au choix lors de la création de l’espace de travail. Les sauvegardes restent dans la même région, et les clients Entreprise peuvent les conserver dans une seconde région de leur choix.',
    ],
    [
      'Que deviennent nos données si nous partons ?',
      'Vous pouvez exporter à tout moment chaque demande, chaque décision et chaque pièce jointe. Nous supprimons l’espace de travail 30 jours après la fin du contrat et nous vous envoyons un certificat de suppression.',
    ],
  ],
  detailsTitle: 'Détails',
  otherFeaturesTitle: 'Autres fonctionnalités',
  moreUpdatesTitle: 'Autres nouveautés',
  pages: (name, mail) => ({
    titles: {
      home: 'Accueil',
      product: 'Produit',
      pricing: 'Tarifs',
      security: 'Sécurité',
      changelog: 'Nouveautés',
      about: 'Entreprise',
      demo: 'Réserver une démo',
      legal: 'Mentions légales',
      privacy: 'Politique de confidentialité',
      credits: 'Crédits photos',
    },
    demoAction: 'Réserver une démo',
    home: {
      heroEyebrow: 'Pour les équipes finance et opérations',
      heroTitle: 'La validation des dépenses, avec la piste d’audit intégrée',
      heroSubtitle: `${name} achemine les demandes d’achat, les factures fournisseurs et les avenants vers les bons validateurs selon le montant, le centre de coûts et le fournisseur, puis inscrit chaque décision dans un journal que vos auditeurs peuvent lire eux-mêmes.`,
      heroSecondary: 'Voir les tarifs',
      customersCaption: `Les équipes finance de 1 100 entreprises valident leurs dépenses dans ${name}`,
      featuresTitle: 'Un seul système pour chaque décision de dépense',
      stepsTitle: `Le trajet d’une demande dans ${name}`,
      steps: [
        {
          title: 'Une demande arrive',
          text: 'Depuis un formulaire, un e-mail envoyé à votre adresse de validation ou un brouillon de facture synchronisé depuis l’ERP, devis joint.',
        },
        {
          title: 'Votre politique l’achemine',
          text: 'Le montant, le centre de coûts, le fournisseur et la catégorie décident qui valide, dans quel ordre et sous quel délai.',
        },
        {
          title: 'La décision est enregistrée',
          text: 'Les validateurs tranchent depuis le web, Slack ou l’e-mail. L’ERP est mis à jour et le journal d’audit garde qui, quoi et quand.',
        },
      ],
      tourTitle: 'Le produit de plus près',
      figuresTitle: 'Dans tous les espaces de travail, le trimestre dernier',
      figures: [
        {
          value: '3,6',
          unit: 'h',
          label: 'de délai médian entre la demande et la validation finale',
        },
        { value: '2,1', unit: 'M', label: 'de demandes et de factures validées' },
        { value: '99,99', unit: '%', label: 'de disponibilité sur les douze derniers mois' },
        { value: '7', unit: 'ans', label: 'd’historique d’audit conservés avec Business' },
      ],
      quote: [
        'Nous clôturions le mois avec un classeur d’e-mails transférés pour seule preuve. Désormais, les commissaires aux comptes filtrent eux-mêmes le journal et ne nous demandent plus de captures d’écran.',
        'Le délai de validation des factures est passé de neuf jours à moins de deux dès le premier trimestre, et personne dans mon équipe n’a relancé une signature depuis mars.',
      ],
      quoteName: 'Camille Aubry',
      quoteRole: 'Contrôleuse financière, Marenne Logistique',
      pricingTitle: 'Un tarif par validateur',
      questionsTitle: 'Les questions que nous posent les équipes finance',
      ctaTitle: 'Voyez-le avec votre propre politique de validation',
      ctaText:
        'Envoyez-nous votre matrice de délégation. Un ingénieur solutions la construit dans un espace d’essai avant un appel de 30 minutes.',
      ctaSecurity: 'Lire la présentation de la sécurité',
    },
    product: {
      heroEyebrow: 'Produit',
      heroTitle: 'De la demande à l’écriture comptable, dans un seul système',
      heroSubtitle: `${name} remplace la chaîne d’e-mails de validation, le tableur de la matrice et le classeur de preuves par un seul dossier par demande, du moment où elle est déposée au moment où elle est comptabilisée.`,
      stepsTitle: 'Ce qui change dans le premier mois',
      steps: [
        {
          title: 'Semaine 1',
          text: 'Votre matrice de délégation devient une politique, testée sur les demandes du trimestre passé avant que quiconque l’utilise.',
        },
        {
          title: 'Semaine 2',
          text: 'L’ERP est connecté, et les demandeurs déposent leurs demandes par un formulaire plutôt que par e-mail.',
        },
        {
          title: 'Semaine 4',
          text: 'Le premier mois se clôt avec chaque validation dans le journal et les preuves exportées en un seul fichier.',
        },
      ],
      ctaTitle: 'Voyez votre propre politique à l’œuvre',
      ctaText:
        'Nous la construisons dans un espace d’essai avant l’appel : la démonstration utilise vos centres de coûts et vos montants.',
      ctaCompare: 'Comparer les formules',
    },
    pricing: {
      heroEyebrow: 'Tarifs',
      heroTitle: 'Payez pour ceux qui valident',
      heroSubtitle: `Toute personne de l’entreprise peut déposer des demandes et des factures dans ${name} sans frais. Les formules sont facturées à l’année par validateur, et un validateur qui ne décide rien pendant un mois n’est pas compté ce mois-là.`,
      trialAction: 'Démarrer un essai',
      plansTitle: 'Comparer les formules',
      billingTitle: 'Facturation',
      billing: [
        [
          'Comment fonctionne l’essai ?',
          'Un ingénieur solutions prépare un espace de travail avec votre politique de validation et une copie des demandes du mois dernier. Vous l’utilisez pendant 14 jours. Il ne se transforme pas tout seul en abonnement, et aucune carte bancaire n’est demandée.',
        ],
        [
          'Qui compte comme validateur ?',
          'Toute personne qui a validé ou refusé au moins une étape dans le mois. Les personnes qui déposent seulement des demandes, des factures ou consultent des rapports ne paient rien.',
        ],
        [
          'Peut-on payer sur facture ?',
          'Oui. Business et Entreprise sont facturés à l’année, à 30 jours, avec votre numéro de bon de commande sur la facture. La formule Équipe se règle par carte.',
        ],
        [
          'Et si nous grandissons en cours d’année ?',
          'Les validateurs supplémentaires sont facturés à la fin de chaque trimestre pour les mois où ils ont été actifs, au tarif de votre formule. Rien n’est facturé d’avance.',
        ],
        [
          'Proposez-vous des remises ?',
          'Les associations et les établissements scolaires bénéficient de 40 % de remise sur Équipe et Business. Écrivez-nous depuis l’adresse de votre organisation.',
        ],
        [
          'Peut-on changer de formule plus tard ?',
          'Oui. Une montée en gamme s’applique tout de suite, au prorata des jours. Une baisse s’applique au renouvellement suivant.',
        ],
      ],
      ctaTitle: 'Un avis pour choisir une formule',
      ctaText:
        'Dites-nous combien de personnes valident des dépenses et quel ERP vous utilisez, et nous vous recommandons une formule en un seul e-mail.',
      ctaEmail: 'Écrire aux ventes',
    },
    security: {
      heroEyebrow: 'Sécurité',
      heroTitle: 'Comment nous protégeons vos données financières',
      heroSubtitle: `${name} contient vos fournisseurs, vos budgets et la trace de qui a validé quoi. Voici comment ces données sont hébergées, chiffrées, consultées et conservées.`,
      packAction: 'Demander le dossier de sécurité',
      controlsTitle: 'Les mesures en place',
      controls: [
        {
          icon: 'lock',
          title: 'Chiffrement',
          text: 'TLS 1.3 en transit et AES-256 au repos, avec des clés renouvelées tous les 90 jours.',
        },
        {
          icon: 'globe',
          title: 'Localisation des données',
          text: 'Les espaces de travail sont hébergés à Paris ou à Francfort, et les données restent dans la région.',
        },
        {
          icon: 'users',
          title: 'Accès',
          text: 'Authentification unique, SCIM et droits par rôle, avec chaque connexion enregistrée.',
        },
        {
          icon: 'shield',
          title: 'Journal infalsifiable',
          text: 'Chaque événement porte l’empreinte du précédent, et la chaîne est vérifiée toutes les nuits.',
        },
        {
          icon: 'refresh',
          title: 'Sauvegardes',
          text: 'Des sauvegardes chiffrées toutes les heures, conservées 35 jours et restaurées lors d’un test chaque mois.',
        },
        {
          icon: 'check',
          title: 'Audits indépendants',
          text: 'Un rapport SOC 2 Type II chaque année et un test d’intrusion externe tous les six mois.',
        },
      ],
      detail: [
        { h2: 'Hébergement' },
        {
          p: 'Les espaces de travail tournent sur Amazon Web Services, à Paris (eu-west-3) ou à Francfort (eu-central-1). La région est choisie à la création de l’espace et nos équipes ne peuvent pas la changer. La production s’étend sur trois zones de disponibilité, et la base de données est répliquée entre elles.',
        },
        { h2: 'Accès de nos équipes' },
        {
          p: 'Personne dans l’entreprise ne peut lire votre espace de travail par défaut. Un ingénieur du support peut recevoir l’accès à un espace pendant 24 heures, seulement après accord d’un administrateur de cet espace, et chaque action menée pendant ce temps est inscrite dans votre journal d’audit.',
        },
        { h2: 'Conserver la trace' },
        {
          p: 'Le journal d’audit s’écrit sans jamais revenir en arrière. Les événements sont chaînés par leur empreinte, la chaîne est vérifiée chaque nuit et à la demande, et les exports sont signés pour qu’un fichier puisse être vérifié contre l’espace de travail. Les demandes supprimées restent dans le journal sous forme de suppressions.',
        },
        { h2: 'Signaler une vulnérabilité' },
        {
          p: `Écrivez à ${mail('securite')}. Nous accusons réception sous un jour ouvré, nous vous tenons informé pendant la correction, et nous vous citons une fois le problème résolu si vous le souhaitez.`,
        },
      ],
      logCaption: 'Le journal d’audit d’une demande d’achat, chaîne vérifiée.',
      racksCaption:
        'Des baies réseau dans une salle de centre de données. Notre hébergeur exploite les bâtiments ; nous exploitons le logiciel qui tourne dessus.',
      subprocessorsTitle: 'Sous-traitants',
      subprocessors: [
        [
          'Amazon Web Services',
          'Hébergement, stockage et sauvegardes, dans la région de l’espace de travail. Accord de sous-traitance signé.',
        ],
        [
          'Cloudflare',
          'Protection du réseau et diffusion de l’application web. Métadonnées des requêtes uniquement, jamais le contenu d’un espace de travail.',
        ],
        [
          'Brevo',
          'E-mails transactionnels : demandes de validation, rappels et accusés de réception. L’objet et le résumé d’une demande, jamais ses pièces jointes.',
        ],
        [
          'Slack et Microsoft Teams',
          'Seulement quand un client les connecte. Messages de validation envoyés aux canaux que le client choisit.',
        ],
      ],
      ctaTitle: 'Questionnaires de sécurité',
      ctaText:
        'Notre dossier de sécurité comprend le rapport SOC 2, le résumé du dernier test d’intrusion et les réponses aux questionnaires habituels.',
    },
    changelog: {
      heroEyebrow: 'Nouveautés',
      heroTitle: `Ce qui change dans ${name}`,
      heroSubtitle:
        'Nous livrons chaque semaine. Voici les changements qui modifient votre façon de travailler, du plus récent au plus ancien.',
    },
    about: {
      heroEyebrow: 'Entreprise',
      heroTitle: 'Créé par des gens qui ont déjà bouclé les comptes',
      heroSubtitle: `${name} est né à Paris en 2019, fondé par deux anciens responsables financiers qui avaient passé trop de clôtures à courir après des validations par e-mail.`,
      story: [
        {
          p: `Claire Delmas et Mathieu Roussel se sont rencontrés dans un groupe de logistique où valider un achat voulait dire un e-mail, un tableur et une signature sur un bon papier. Chaque fin de mois, l’équipe finance passait deux jours à reconstituer qui avait validé quoi. Ils ont écrit la première version de ${name} pour cette équipe, et elle y a tourné un an avant que quelqu’un d’autre ne l’utilise.`,
        },
        {
          p: 'Aujourd’hui, 58 personnes travaillent sur le produit, à Paris et à Montréal. La moitié écrit du logiciel. La plupart des autres ont travaillé en finance, aux achats ou en audit, et chaque ingénieur solutions a déjà conduit une clôture mensuelle.',
        },
        { h2: 'Notre façon de travailler' },
        {
          ul: [
            'Un seul produit, vendu aux équipes finance et opérations, et rien d’autre',
            'Des tarifs publiés sur le site, les mêmes pour tous les clients de même taille',
            'Un support assuré par les personnes qui construisent le produit',
            'Des nouveautés qui listent chaque changement modifiant votre façon de travailler',
          ],
        },
        { h2: 'Financement' },
        {
          p: 'Nous avons levé des fonds d’amorçage en 2020 puis une série A en 2023, et nous sommes rentables depuis le dernier trimestre 2025.',
        },
      ],
      numbersTitle: 'L’entreprise aujourd’hui',
      numbers: [
        { value: '1 100', label: 'clients' },
        { value: '19', label: 'pays' },
        { value: '58', label: 'personnes' },
        { value: '2', label: 'bureaux' },
      ],
      places: [
        { h2: 'Où nous travaillons' },
        {
          p: 'Paris. L’équipe produit et le support travaillent côte à côte, à quelques stations de métro de la Bourse.',
        },
        {
          p: 'Montréal. Notre second bureau, ouvert en 2023, couvre les horaires d’Amérique du Nord.',
        },
      ],
      customersTitle: 'Quelques-uns de nos clients',
      ctaTitle: 'Travailler avec nous',
      ctaText:
        'Nous recrutons des ingénieurs, des ingénieurs solutions et des spécialistes du support à Paris et à Montréal.',
      ctaAction: 'Nous écrire',
    },
    demo: {
      heroEyebrow: 'Réserver une démo',
      heroTitle: 'Parlez à quelqu’un qui a déjà conduit une clôture mensuelle',
      heroSubtitle:
        'Un appel de 30 minutes avec un ingénieur solutions, puis un espace d’essai paramétré avec votre propre politique de validation.',
      emailAction: `Écrire à ${mail('demo')}`,
      emailSubject: 'Demande de démonstration',
      contactTitle: 'Nous joindre',
      emailText: `${mail('demo')}, réponse sous un jour ouvré.`,
      phoneText: 'Du lundi au vendredi, de 9 h à 18 h, heure de Paris.',
      securityTitle: 'Revue de sécurité',
      securityText: 'Commencez votre revue de sécurité avant l’appel.',
      how: [
        { h2: 'Avant l’appel' },
        {
          p: 'Écrivez-nous avec le nombre de personnes qui valident des dépenses, l’ERP que vous utilisez, et votre matrice de délégation actuelle si vous pouvez la partager. Un tableur suffit. Nous répondons sous un jour ouvré pour convenir d’un horaire.',
        },
        { h2: 'Pendant l’appel' },
        {
          p: 'Un ingénieur solutions présente le produit avec votre politique déjà construite, répond aux questions de la finance, des achats et de la DSI, et passe en revue ce que demanderait un déploiement pour votre équipe.',
        },
        { h2: 'L’essai' },
        {
          p: 'Après l’appel, vous recevez un espace de travail pendant 14 jours, avec votre politique et une copie des demandes du mois dernier à partir d’un export CSV. Votre équipe peut y déposer et y valider des demandes. L’essai ne se transforme pas tout seul en abonnement, et nous ne demandons pas de carte bancaire.',
        },
      ],
    },
    legal: [
      { h2: 'Éditeur du site' },
      {
        p: `${name} est exploité par ${name} SAS, société par actions simplifiée au capital de 120 000 €, dont le siège social est situé 27 rue de la Chaussée-d’Antin, 75009 Paris. Immatriculée au registre du commerce et des sociétés de Paris sous le numéro 000 000 000. Numéro de TVA intracommunautaire : FR00 000000000.`,
      },
      { p: 'Directrice de la publication : Claire Delmas, présidente.' },
      { h2: 'Hébergement' },
      {
        p: 'Le site est hébergé par Amazon Web Services EMEA SARL, 38 avenue John F. Kennedy, L-1855 Luxembourg.',
      },
      { h2: 'Conditions d’utilisation' },
      {
        p: 'L’usage du produit est régi par le contrat d’abonnement signé avec chaque client, ou, pour la formule Équipe, par les conditions acceptées à la création de l’espace de travail. En cas de différence entre les deux, le contrat signé prévaut.',
      },
      { h2: 'Traitement des données' },
      {
        p: 'Nous traitons les données personnelles des espaces de travail de nos clients en tant que sous-traitant, dans le cadre d’un accord de sous-traitance conforme à l’article 28 du RGPD. La liste des sous-traitants ultérieurs figure sur la page Sécurité, et les clients sont prévenus 30 jours avant l’ajout d’un nouveau.',
      },
      { h2: 'Contact' },
      { p: `Pour toute question juridique, écrivez à ${mail('juridique')}.` },
    ],
    privacy: [
      {
        p: 'Cette politique couvre les données personnelles que nous collectons par ce site et lorsque vous nous contactez. Les données contenues dans l’espace de travail d’un client relèvent du contrat que ce client a signé avec nous.',
      },
      { h2: 'Ce que nous collectons' },
      {
        ul: [
          'Le nom, l’adresse e-mail professionnelle et l’entreprise que vous nous indiquez quand vous demandez une démonstration ou nous écrivez',
          'La trace de nos e-mails et de nos appels avec vous',
          'Des pages vues anonymes, comptées sans cookie et sans vous suivre d’un site à l’autre',
        ],
      },
      { h2: 'Combien de temps nous les conservons' },
      {
        p: 'Les demandes qui n’aboutissent pas à un contrat sont supprimées au bout de trois ans sans contact de votre part. Les contacts des clients sont conservés pendant la durée du contrat puis cinq ans après, comme le prévoit le droit commercial.',
      },
      { h2: 'Vos droits' },
      {
        p: `Vous pouvez demander l’accès aux données que nous détenons sur vous, leur rectification, leur effacement ou vous opposer à leur traitement en écrivant à ${mail('confidentialite')}. Vous pouvez aussi introduire une réclamation auprès de la CNIL.`,
      },
    ],
    credits: {
      intro: [
        {
          p: 'Les photographies de ce site viennent de Wikimedia Commons et sont utilisées selon les licences ci-dessous. Les captures de l’interface et les logotypes des clients ont été dessinés pour ce site, et les personnes et entreprises qu’ils montrent sont fictives.',
        },
      ],
      sourceWord: 'source',
    },
  }),
  menus: {
    header: [
      { label: 'Produit', page: 'product' },
      { label: 'Sécurité', page: 'security' },
      { label: 'Tarifs', page: 'pricing' },
      { label: 'Nouveautés', page: 'changelog' },
      { label: 'Entreprise', page: 'about' },
    ],
    action: 'Réserver une démo',
  },
  footer: [
    {
      heading: 'Produit',
      links: [
        { label: 'Vue d’ensemble', page: 'product' },
        { label: 'Circuits de validation', feature: 'circuits-de-validation' },
        { label: 'Journal d’audit', feature: 'journal-d-audit' },
        { label: 'Tarifs', page: 'pricing' },
      ],
    },
    {
      heading: 'Entreprise',
      links: [
        { label: 'À propos', page: 'about' },
        { label: 'Sécurité', page: 'security' },
        { label: 'Réserver une démo', page: 'demo' },
      ],
    },
    {
      heading: 'Ressources',
      links: [
        { label: 'Nouveautés', page: 'changelog' },
        { label: 'API et webhooks', feature: 'api-et-webhooks' },
        { label: 'Synchronisation comptable', feature: 'synchronisation-comptable' },
      ],
    },
    {
      heading: 'Mentions',
      links: [
        { label: 'Mentions légales', page: 'legal' },
        { label: 'Confidentialité', page: 'privacy' },
        { label: 'Crédits photos', page: 'credits' },
      ],
    },
  ],
  settings: {
    tagline: 'Validation des dépenses et piste d’audit pour les équipes finance et opérations.',
    footerNote:
      '27 rue de la Chaussée-d’Antin\n75009 Paris\nFrance\n\nSupport les jours ouvrés, de 9 h à 18 h (heure de Paris).',
  },
  widgets: {
    searchPlaceholder: 'Audit, ERP',
    archivesTitle: 'Nouveautés par mois',
    recentTitle: 'Livré récemment',
    resourcesTitle: 'Ressources',
    resources: [
      { label: 'Présentation du produit', page: 'product' },
      { label: 'API et webhooks', feature: 'api-et-webhooks' },
      { label: 'Synchronisation comptable', feature: 'synchronisation-comptable' },
      { label: 'Sécurité et conformité', page: 'security' },
      { label: 'Tarifs', page: 'pricing' },
    ],
    ctaHeading: 'Voyez-le avec votre propre politique de validation',
    ctaBody:
      'Un appel de 30 minutes avec un ingénieur solutions, puis un espace d’essai paramétré avec votre politique.',
    ctaLabel: 'Réserver une démo',
  },
}
