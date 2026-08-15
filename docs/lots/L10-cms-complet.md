# L10-L19 — De « ça marche » à « CMS complet »

## Pourquoi ce document existe

Après L0-L9, Cogenta a un moteur de contenu réel et testé, mais l'expérience qu'il
produit — l'admin, le thème public, ce qu'un visiteur ou un éditeur voit — est très en
retrait de ce qu'un CMS professionnel (WordPress, Strapi, Drupal) offre. Un audit du
code réel (pas de la documentation, pas de la mémoire de session) mené le 2026-08-15
sur trois axes — contenu/SEO/workflow, admin/éditeur/médias/design, API/plugins/
recherche/performance/sécurité — donne le diagnostic suivant, qui change la forme du
travail à venir :

**Une bonne partie de ce qui « manque » à l'usage existe déjà en code réel, testé,
juste jamais branché.** `@cogenta/seo` (meta/OG/Twitter/JSON-LD/sitemap/robots/
hreflang/redirections/IndexNow/flux) n'est importé nulle part dans `cogenta serve` ni
`@cogenta/theme-canonical` — le HTML produit aujourd'hui n'a qu'un `<title>`. Le moteur
de recherche plein texte (`packages/schema/src/search/`, un driver par base) n'est
appelé par aucune route REST/GraphQL ni par l'admin. L'historique/diff/restauration de
version existe complètement côté `ContentStore` sans aucune UI. Les traductions liées
(`translationOf`), le routage multilingue par préfixe, la publication programmée, sont
robustes et déjà exploitables. `@cogenta/render` porte même un pipeline d'images
(resize/srcset) et un embryon de PWA, non câblés.

Ce qui manque *vraiment* (pas seulement du branchement) : gestion des utilisateurs
dans l'admin (aujourd'hui CLI seule), taxonomies hiérarchiques natives, corbeille/
restauration, duplication de contenu, autosave, workflow éditorial configurable
(au-delà de draft/scheduled/published/archived), clés API pour un client headless,
CORS, CSRF, en-têtes de sécurité (CSP/HSTS), sauvegardes réelles, analytics de
fréquentation, et — le point que l'utilisateur a nommé en premier — un design admin et
un thème public qui ne ressemblent pas à un formulaire HTML par défaut.

## Comment lire ce document

**Périmètre : tout.** Version précédente de ce document excluait explicitement
l'e-commerce, le page builder visuel, la marketplace et l'IA avancée. L'utilisateur a
tranché : aucune exclusion — l'objectif est un CMS complet, qui couvre absolument
toutes les fonctionnalités qu'on trouve sur WordPress/Strapi/Drupal/Joomla, plus des
améliorations. Un dixième lot, **L19**, ajoute ce que l'utilisateur a nommé comme le
cœur du caractère agentique du produit : téléverser des documents de spécification et
laisser l'IA comprendre le besoin, proposer un modèle de contenu et plusieurs gabarits,
que l'utilisateur valide — à l'installation et après. Dix lots parallélisables,
**L10 à L19**, chacun exécutable par un agent différent sans attendre les autres
au-delà des dépendances explicitement listées. Chaque lot a son périmètre, ses tâches dans l'ordre, ses critères
d'acceptation. Un agent peut recevoir « exécute L12 » sans lire les autres sections.

**Contrats à surveiller** : `docs/04-contrats.md` fige A (`schema@1.0`) et B
(`blocks@1.0`) depuis le 2026-08-13 — toute tâche qui ajoute un champ système (statut
de corbeille, verrou de workflow) ou un type de champ (taxonomie) touche le contrat A
et exige une montée en `2.0` avec note de migration, pas un ajout silencieux. C'est
signalé à chaque tâche concernée par **[CONTRAT A]**. Avant de commencer une tâche
marquée ainsi, écrire l'ADR de montée de version (skill `write-adr`) et la faire
valider — ne pas la contourner en douce, la règle du projet est explicite là-dessus.
Le e-commerce (L15) et la marketplace (L17) ajoutent chacun un domaine de données
entier — probablement leur propre montée de contrat ou un nouveau contrat E dédié
(produits/commandes) plutôt que de forcer ce vocabulaire dans le contrat A pensé pour
du contenu éditorial ; à trancher dans l'ADR de la tâche 1 de chaque lot, pas deviné en
cours de route.

---

## L10 — Brancher l'existant (rapide, fort impact, faible risque)

### Objectif

Rendre visible, dans `cogenta serve` et l'admin, tout ce qui existe déjà comme code
backend testé mais jamais appelé. Aucune nouvelle capacité serveur ; uniquement du
câblage. C'est le lot au meilleur ratio impact/effort — à faire en premier ou en
parallèle des autres, puisqu'il ne touche presque aucun contrat.

### Dépendances

Aucune. Peut démarrer immédiatement, en parallèle de L11-L14.

### Périmètre

**SEO dans le rendu réel** (`packages/cli/src/commands/theme-render.ts` et
`serve.ts`) :
- Appeler `@cogenta/seo`'s `renderMetadata`/`renderOpenGraph`/`renderTwitterCard`/
  `renderJsonLd` pour chaque page rendue, à partir des champs SEO déjà modélisables par
  collection.
- Router `GET /sitemap.xml` et `GET /robots.txt` vers les fonctions déjà écrites
  (`sitemap.ts`, `robots.ts`).
- Appliquer les redirections 301/302 déjà stockées (`packages/schema/src/routing/
  redirects.ts`) avant la résolution de route, pas seulement via l'API `-/by-path`.
- `hreflang` sur les pages ayant des traductions liées (`translationOf` déjà réel).

**Recherche plein texte** :
- Nouvelle route REST `GET /api/search?q=...` dans `packages/api`, appelant le driver
  de recherche déjà sélectionné par `createDatabaseRegistry` (même schéma de sélection
  driver optimal/dégradé que le reste du projet).
- Champ de recherche réel dans l'admin (actuellement les listes n'ont qu'un filtre de
  statut).
- Un bloc `search` optionnel côté thème public (formulaire + page de résultats).

**Historique et restauration dans l'admin** :
- Nouvelle route `packages/admin/src/routes/` : onglet « Historique » sur une fiche de
  contenu, listant les versions (`ContentStore.history()`), un diff visuel entre deux
  versions (`diff()` existe déjà côté store), un bouton de restauration
  (`restore()`).

**Images** :
- Brancher `packages/render/src/images/pipeline.ts` et `srcset.ts` dans le flux
  d'upload média (`packages/api` media routes) : génération de variantes
  redimensionnées + conversion WebP/AVIF au moment de l'upload, pas à la volée.
- Le champ `media` dans le rendu de thème utilise le `srcset` généré plutôt qu'une
  URL unique.

**Sécurité de base sur `cogenta serve`** :
- CORS configurable (`cogenta.config`), désactivé par défaut, activable pour un usage
  headless.
- En-têtes CSP/HSTS/`X-Content-Type-Options` sur toutes les réponses.
- Cache-control cohérent : pages publiques cacheables courtement, `/api/*`
  `no-store`, médias déjà corrects.

### Tâches, dans l'ordre

1. SEO dans `theme-render.ts` (meta/OG/Twitter/JSON-LD)
2. `sitemap.xml`, `robots.txt`, redirections dans le routeur de `serve.ts`
3. Route de recherche REST + branchement admin
4. Historique/diff/restauration dans l'admin (fiche de contenu)
5. Pipeline images à l'upload + `srcset` dans le rendu
6. CORS + en-têtes de sécurité + cache-control

### Critères d'acceptation

- Une page rendue par `cogenta serve` a un `<title>`, une meta description, des
  balises Open Graph et un bloc JSON-LD réels, dérivés du contenu, pas statiques
- `curl /sitemap.xml` et `curl /robots.txt` renvoient un contenu réel et à jour
- Une recherche depuis l'admin renvoie des résultats classés, testée sur les trois
  bases (SQLite/Postgres/MySQL, driver dégradé inclus)
- Restaurer une ancienne version depuis l'admin fonctionne de bout en bout, vérifié
  par un test réel (pas mocké)
- Une image uploadée produit plusieurs tailles + une variante WebP, servie via
  `srcset`

### Tests exigés

Intégration sur les trois bases pour la recherche et l'historique. E2E pour le
flux complet upload → variantes → rendu avec `srcset`.

### Pièges connus

`@cogenta/seo` a été écrit sans jamais tourner contre un vrai serveur — s'attendre à
des frictions d'intégration (types qui ne s'alignent pas exactement avec
`ContentEntry` de `theme-render.ts`, contrairement à `@cogenta/theme-canonical` dont
le contrat a déjà été confronté au réel). Vérifier chaque fonction contre un vrai
rendu avant de la déclarer branchée.

---

## L11 — Admin : design system et gestion des utilisateurs

### Objectif

L'admin fonctionne (permissions réelles, testées) mais ressemble à un formulaire HTML
par défaut (569 lignes de CSS au total, aucune bibliothèque de composants, aucune
icône, sections empilées sans grille). Ce lot lui donne un vrai visage de produit 2026
et comble le trou le plus visible : il n'existe **aucune** interface pour gérer les
utilisateurs — créer un compte exige la CLI.

### Dépendances

Aucune dépendance dure sur L10/L12-L14, mais coordonner le design system avec L12
(même palette de tokens si le projet veut un air de famille visuel entre admin et
thème public — décision à trancher en premier, voir Tâche 1).

### Périmètre

**Décision préalable (à trancher avec l'utilisateur, pas à deviner)** : bibliothèque
de composants. Trois options réalistes, à choisir avant de coder quoi que ce soit :
(a) un design system maison léger (cohérent avec R9 « pas de dépendance sans
justification », mais plus de travail) ; (b) une bibliothèque existante non stylée
(Radix UI / Ariakit — logique d'accessibilité gratuite, style maison par-dessus) ;
(c) une bibliothèque stylée (shadcn/ui sur Tailwind — le plus rapide à un résultat
« pro », le plus de dépendances). Vu l'urgence exprimée, (b) ou (c) sont les choix
réalistes ; (c) est probablement le bon calcul vitesse/qualité ici mais c'est un choix
produit, pas une évidence technique.

**Gestion des utilisateurs (le trou le plus visible)** :
- Liste des utilisateurs, filtrable par rôle
- Création, modification de rôle, désactivation/révocation — dans l'admin, plus
  seulement en CLI
- Page « mon profil » (changer son mot de passe, gérer sa MFA, voir ses sessions
  actives)
- Vue des sessions actives par utilisateur + révocation individuelle
  (`packages/auth` a déjà le modèle de session, juste pas exposé)
- Réinitialisation de mot de passe — actuellement absente même en CLI (voir L13)

**Dashboard réel** :
- Grille de widgets déplaçables/masquables (au lieu de sections empilées)
- Recherche globale dans le header (contenu + médias + utilisateurs)
- Les deux widgets actuellement vides (CVE ouvertes, Core Web Vitals) : soit une vraie
  source de données, soit retirés — jamais un placeholder qui prétend avoir une donnée

**Listes de contenu** :
- Export CSV/Excel
- Recherche texte (branchée sur L10)
- Filtres avancés (plage de dates, auteur)

**Éditeur riche** — extension du Slate existant (`packages/admin/src/rich-text/`) :
- Image inline dans le corps du texte
- Tableaux
- Couleur/surlignage, alignement
- Undo/redo dédié dans la toolbar, commandes slash (`/`)

**Marketplace de plugins** : une vraie UI de découverte/installation dans l'admin —
aujourd'hui seul l'écran de permissions existe (`granted-permissions.tsx`,
`permission-review.tsx`).

### Tâches, dans l'ordre

1. Décision design system (voir ci-dessus) + fondations de tokens/composants
2. Gestion des utilisateurs (liste, CRUD, rôles, sessions, profil)
3. Dashboard en grille avec vrais widgets, recherche globale
4. Refonte visuelle des listes de contenu existantes sur les nouveaux composants
5. Export CSV, filtres avancés
6. Éditeur riche étendu
7. Marketplace de plugins (UI)

### Critères d'acceptation

- Un admin peut créer, modifier le rôle et révoquer un autre utilisateur sans jamais
  toucher la CLI
- Un utilisateur peut voir et révoquer ses propres sessions actives
- Le dashboard n'affiche aucun widget avec une donnée fictive ou vide sans
  explication
- L'éditeur riche produit du contenu qui passe par le même bloc `prose` déjà testé —
  aucune nouvelle sérialisation parallèle
- Audit d'accessibilité (axe-core, déjà une dépendance du projet) sans régression sur
  les écrans refaits

### Tests exigés

Tests de permissions par rôle sur chaque nouvelle route de gestion des utilisateurs
(R4 : jamais de contrôle d'accès uniquement côté UI). Tests d'accessibilité sur les
nouveaux composants.

### Pièges connus

**Le design system devient un projet dans le projet.** Fixer un scope de composants
avant de commencer (bouton, champ, table, carte, modale, notification — pas plus pour
ce lot), et refuser d'en ajouter un sixième sans un vrai deuxième usage (règle du
projet : pas d'abstraction avant trois usages réels).

**La gestion des utilisateurs touche l'auth.** Chaque nouvelle route est une nouvelle
surface de permission — passer par `security-reviewer` avant de fusionner.

---

## L12 — Thème public : refonte visuelle et performance

### Objectif

Le thème `@cogenta/theme-canonical` fonctionne et est testé (rendu réel, skin
validé contre contract D), mais son niveau de sophistication visuelle est basique.
Ce lot en fait un thème « prod ready », au niveau visuel d'un thème premium moderne,
et branche le peu de performance qui manque.

### Dépendances

Aucune dépendance dure. Coordination souhaitable avec L11 sur la palette de tokens
partagée si un air de famille visuel admin/public est voulu.

### Périmètre

**Refonte visuelle des 11 blocs existants** (`packages/theme-canonical/src/blocks/
*.astro` : hero, cta, embed, faq, feature-grid, gallery, logos, media-figure, prose,
quote, stats) — chacun repensé pour un rendu 2026 : typographie soignée, espacements
cohérents, micro-interactions, mode sombre réel (pas juste des tokens inversés
mécaniquement), animations d'entrée discrètes.

**Nouveaux blocs manquants pour un thème complet** : navigation/header riche
(méga-menu), footer structuré, témoignages/avis, tarification, timeline, équipe,
newsletter (formulaire, branché sur L13 si les emails sortants existent déjà via
`@cogenta/channels`), section de recherche (branchée sur L10).

**Sections réutilisables** : un mécanisme pour qu'un site compose une page à partir
de sections nommées réutilisables, pas seulement une liste de blocs à plat (rapproche
Cogenta de ce qu'un vrai page builder permet sans en être un).

**Performance / Core Web Vitals** :
- Minification CSS/JS du rendu produit par `cogenta serve`
- `srcset`/lazy loading sur toutes les images (branché sur le pipeline de L10)
- Préchargement des polices, `font-display: swap`
- Mesure réelle Lighthouse en CI sur au moins un blueprint, avec seuil qui fait
  échouer la build en cas de régression (le projet a déjà une règle DoD « aucune
  régression Lighthouse » — actuellement non vérifiée automatiquement)

**Les neuf blueprints** (`create-cogenta`) reçoivent chacun une passe de contenu de
démonstration alignée sur le nouveau visuel, pas seulement le CSS qui change sous
eux.

### Tâches, dans l'ordre

1. Système de tokens visuel (couleurs, typo, espacement, ombres, radius) — la base
   dont chaque bloc hérite
2. Refonte des 11 blocs existants sur ce système
3. Nouveaux blocs (nav riche, footer, témoignages, tarification, équipe, newsletter,
   recherche)
4. Mécanisme de sections réutilisables
5. Performance (minification, srcset partout, polices, mesure Lighthouse en CI)
6. Passe de contenu sur les neuf blueprints

### Critères d'acceptation

- Chaque blueprint scaffoldé produit un site qui ne ressemble visiblement plus à un
  thème par défaut — vérifié par capture d'écran comparée avant/après
- Lighthouse Performance et Accessibility ≥ 90 sur au moins trois blueprints
  représentatifs, mesuré en CI
- Mode sombre réel, pas une inversion mécanique — vérifié visuellement, pas
  seulement par contraste WCAG
- Aucune régression sur les tests de rendu existants (`packages/theme-canonical/
  test/`)

### Tests exigés

Tests de rendu existants inchangés + nouveaux tests de rendu pour chaque nouveau
bloc. Lighthouse CI. Test visuel (capture d'écran) sur au moins un blueprint par
famille (blog, portfolio, documentation).

### Pièges connus

**Refaire visuellement sans casser le contrat B.** Les blocs restent des données
sémantiques (R3 : jamais de HTML/CSS stocké) — la refonte change le rendu `.astro`,
jamais la forme des données qu'un bloc stocke, sauf si un nouveau champ optionnel est
réellement nécessaire (auquel cas **[CONTRAT B]**, même règle de montée de version
que le contrat A).

**Onze blocs à refaire, c'est du volume, pas de la difficulté.** Bon candidat à
paralléliser bloc par bloc entre plusieurs agents une fois le système de tokens (tâche
1) posé et stable — ne pas commencer les blocs avant que la tâche 1 soit mergée,
sinon chaque agent invente sa propre variante de tokens.

---

## L13 — Fonctionnalités manquantes du modèle de contenu

### Objectif

Le seul lot qui ajoute de la vraie capacité serveur nouvelle (pas du branchement).
Regroupe ce qu'aucune bibliothèque existante ne couvre déjà.

### Dépendances

Aucune dépendance dure sur L10-L12, L14. Peut démarrer en parallèle. **Contient les
tâches les plus susceptibles de toucher le contrat A** — les traiter en premier dans
ce lot pour que l'ADR de montée de version soit actée tôt, avant que d'autres lots
n'aient à s'y adapter.

### Périmètre

**Taxonomies hiérarchiques natives [CONTRAT A]** : aujourd'hui une catégorie est un
`relation` ou un `select` bricolé par site. Un vrai concept de taxonomie
(arborescence, réutilisable entre collections) est un ajout de contrat A — écrire
l'ADR avant de coder.

**Corbeille et restauration [CONTRAT A]** : `delete()` est aujourd'hui un vrai
`DELETE SQL` sans filet. Ajouter un état « supprimé » (soft-delete) avec purge
différée configurable — touche le champ `status` existant ou en ajoute un, donc
contrat A.

**Duplication de contenu** : une méthode `duplicate()` sur `ContentStore`, qui copie
une entrée (et ses traductions ? à trancher) vers un nouveau brouillon. Probablement
sans impact de contrat si elle ne fait que composer les opérations existantes.

**Autosave** : sauvegarde périodique d'un brouillon en cours d'édition côté admin,
sans polluer l'historique de versions réel (voir comment `history()` distingue déjà
une sauvegarde explicite d'une autre, sinon [CONTRAT A] aussi).

**Workflow éditorial configurable** : au-delà de `draft/scheduled/published/
archived`. Statuts personnalisables par collection, assignation d'un contenu à un
utilisateur, notification (réutiliser `@cogenta/channels`, déjà réel, pour la
notification — ne pas réinventer un système de messages). Portée large ; possible de
livrer d'abord une version simple (assignation + notification sur changement de
statut) avant les statuts entièrement personnalisables.

**Réinitialisation de mot de passe** : absente même en CLI aujourd'hui (`cogenta
users create` seulement). Un flux réel (lien signé à durée de vie courte, envoyé par
email via `@cogenta/channels`) — actuellement un utilisateur qui oublie son mot de
passe n'a aucun recours sauf qu'un admin lui recrée un compte.

**Clés API pour usage headless** : un client externe (app mobile, autre frontend) a
besoin d'une authentification machine-to-machine, pas d'une session utilisateur.
Nouveau concept `ApiKey` (scope de permissions, révocable, jamais en clair après
création) — [CONTRAT C] si le scope recoupe le modèle de permissions d'outil déjà
figé (`tools@1.0`), à vérifier avant de coder.

**CSRF** : protection réelle sur les routes de mutation qu'un navigateur peut
déclencher (l'admin lui-même, principalement).

**Sauvegarde réelle** : `cogenta backup` est aujourd'hui explicitement différé
(« Not built yet » dans l'usage CLI). Un vrai mécanisme (dump de la base + export des
médias, restauration testée) — c'est une action destructive potentielle si mal faite,
suivre la règle du projet sur les migrations destructives (confirmation explicite,
backup vérifié avant toute opération qui l'exige déjà ailleurs dans le code).

**Analytics de fréquentation minimal** : comptage de pages vues respectueux de la
vie privée (pas de cookie tiers, agrégation locale) — pas une intégration Google
Analytics, cohérent avec R1 (pas de dépendance dure à un service externe) et la
posture du projet.

### Tâches, dans l'ordre

1. ADR de montée de version du contrat A (taxonomies + corbeille + éventuellement
   autosave) — préalable bloquant pour les tâches 2-3
2. Taxonomies hiérarchiques
3. Corbeille et restauration
4. Duplication de contenu
5. Autosave
6. Réinitialisation de mot de passe (CLI d'abord, puis admin une fois L11 avancé)
7. Workflow éditorial (version simple : assignation + notification)
8. Clés API headless
9. CSRF
10. Sauvegarde réelle
11. Analytics minimal

### Critères d'acceptation

- Chaque tâche marquée [CONTRAT A]/[CONTRAT C] a une ADR actée avant merge, pas
  après
- Un contenu supprimé est restaurable pendant sa fenêtre de purge, jamais perdu par
  accident
- Un utilisateur qui a oublié son mot de passe le réinitialise seul, sans
  intervention admin
- Une clé API révoquée cesse immédiatement de fonctionner (testé, pas supposé)
- `cogenta backup` produit une sauvegarde réellement restaurable, vérifié par un
  test qui restaure pour de vrai, pas qui vérifie juste que le fichier existe

### Tests exigés

Intégration sur les trois bases pour toute nouvelle table/colonne. Test de
restauration réelle pour la sauvegarde (pas un mock). Permissions par rôle sur
chaque nouvelle route.

### Pièges connus

**La tentation de faire toutes les tâches [CONTRAT A] d'un coup dans une seule
montée de version 2.0.** C'est probablement le bon choix ici (une seule migration de
contenu existant plutôt que plusieurs), mais c'est une décision à écrire dans l'ADR,
pas une évidence — la trancher tôt (tâche 1) évite un contrat A qui bouge trois fois.

**Le workflow éditorial peut enfler sans fin.** Livrer la version simple d'abord
(assignation + notification), les statuts personnalisables ensuite si le besoin réel
se confirme — ne pas construire un moteur de workflow générique pour un besoin
hypothétique (règle du projet).

---

## L14 — Sécurité, headless et durcissement production

### Objectif

Ce que la liste de l'utilisateur nomme « sécurité » et « API-first » au sens large,
au-delà de ce que L10 branche déjà (CORS, CSP/HSTS) et L13 ajoute (CSRF, clés API).
Regroupe le durcissement transverse nécessaire avant de dire « prod ready ».

### Dépendances

Dépend de L13 tâche 8 (clés API) pour la partie OAuth2/scopes le cas échéant.
Sinon indépendant.

### Périmètre

- Revue de sécurité complète (agent `security-reviewer`) sur l'ensemble des nouvelles
  surfaces créées par L10-L13 avant toute publication
- Détection de liens cassés (crawl interne périodique, réutilisable avec le contenu
  déjà indexé par la recherche de L10)
- Gestion des URLs 404 personnalisées par site
- OAuth2 pour un client tiers, si un vrai besoin headless au-delà des clés API simples
  se confirme (ne pas construire en spéculatif)
- Détection d'activité suspecte basique (nombreuses tentatives de connexion échouées
  déjà limitées par `rate-limit.ts` — exposer ça comme alerte dans le dashboard/
  canaux, réutilisant `@cogenta/channels`)
- Webhooks sortants réellement branchés sur le cycle de vie du contenu
  (`content.publish` déclenche un appel au webhook déjà signé HMAC de
  `@cogenta/channels` — le canal existe, il n'est juste jamais appelé par
  `packages/schema` ou `packages/api` au moment de la publication)

### Tâches, dans l'ordre

1. Webhooks sortants branchés sur `content.publish` (le plus proche du « juste
   câbler », comme L10)
2. Pages 404 personnalisables
3. Détection de liens cassés
4. Alertes d'activité suspecte dans le dashboard/canaux
5. Revue de sécurité complète de L10-L13
6. OAuth2 (uniquement si confirmé nécessaire après retour d'usage réel)

### Critères d'acceptation

- Publier un contenu déclenche réellement un webhook sortant signé, vérifiable par
  un test qui reçoit l'appel HTTP, pas qui vérifie juste que la fonction a été
  appelée
- La revue de sécurité ne trouve aucun `CONFIRMED` non corrigé avant la première
  publication de cette vague de lots

### Tests exigés

Test d'intégration bout en bout pour le webhook de publication (un vrai serveur HTTP
de test qui reçoit l'appel). Revue de sécurité formelle documentée.

### Pièges connus

Ce lot dépend du fait que L10-L13 soient assez avancés pour avoir une vraie surface
à auditer — le placer en dernier dans l'exécution même s'il démarre tôt sur ses
tâches indépendantes (1-4).

---

## L15 — E-commerce

### Objectif

Produits, panier, commandes, paiements — le domaine commerce complet listé par
l'utilisateur (catégorie 15 : produits, variantes, prix, promotions, coupons, panier,
commandes, clients, paiements, factures, taxes, livraison, stocks, abonnements,
remboursements, passerelles de paiement).

### Dépendances

Indépendant de L10-L14. Dépend de L13 (clés API) si le paiement passe par un webhook
entrant signé (réutiliser la primitive HMAC de `@cogenta/channels`, jamais un nouveau
mécanisme de signature).

### Périmètre

**Modèle de données [nouveau contrat, ADR obligatoire en tâche 1]** : `Product`
(variantes, prix, stock), `Order` (lignes, statut, historique), `Customer`
(distinct d'un `User` de `@cogenta/auth` — un client n'est pas forcément un compte
admin), `Coupon`/`Promotion`, `Cart` (persistant, lié à une session ou un compte).
Décider en ADR si ce vocabulaire vit dans une extension du contrat A (collections
`product`/`order` prédéfinies) ou dans un contrat E séparé — l'e-commerce a des
invariants (un stock ne doit jamais devenir négatif sous écriture concurrente, un
total de commande doit rester cohérent avec ses lignes) que le modèle de contenu
éditorial n'a pas à porter.

**Panier et commande** : panier persistant, calcul de totaux (taxes, livraison,
remises), passage de commande, statuts de commande (en attente/payée/expédiée/
livrée/annulée/remboursée), historique client.

**Paiement** : intégration d'au moins une passerelle réelle (Stripe — la plus
standard, webhooks entrants pour la confirmation asynchrone), architecture en
interface + implémentations comme tout driver du projet (R1 : pas de dépendance
dure à un service externe — un mode « paiement manuel/virement » comme driver
dégradé, pour qu'un site fonctionne sans compte Stripe).

**Taxes et livraison** : règles de taxe configurables par zone, méthodes de
livraison avec tarifs, intégration transporteur en driver optionnel (pas de
dépendance dure).

**Factures** : génération PDF réelle, numérotation séquentielle non modifiable
(contrainte comptable, pas juste un nice-to-have).

**Abonnements** : cycle de facturation récurrent, lié à la passerelle de paiement.

### Tâches, dans l'ordre

1. ADR du modèle de données commerce (contrat A étendu vs contrat E séparé)
2. `Product`/variantes/stock + admin CRUD
3. `Cart` + calcul de totaux
4. `Order` + statuts + historique
5. Driver de paiement (interface + Stripe + manuel dégradé)
6. Taxes et livraison
7. Coupons/promotions
8. Factures PDF
9. Abonnements

### Critères d'acceptation

- Une commande passée avec le driver de paiement dégradé (virement manuel) fonctionne
  de bout en bout sans aucune clé API externe configurée (R1/R2 : le cœur marche sans
  service tiers)
- Un stock ne devient jamais négatif sous deux achats concurrents du dernier
  exemplaire — testé avec de vraies requêtes concurrentes, pas supposé
- Une facture générée a un numéro séquentiel jamais réutilisé, même après une
  commande annulée

### Tests exigés

Intégration sur les trois bases pour le modèle produit/commande. Test de
concurrence réel sur la décrémentation de stock. Test d'intégration avec un vrai
sandbox Stripe (pas mocké) pour le driver de paiement optimal.

### Pièges connus

**L'argent ne pardonne pas l'approximatif.** Toute opération touchant un total de
commande ou un stock doit être une transaction de base de données réelle, jamais une
suite de lectures/écritures séparées — c'est le genre de lot où le driver dégradé
(SQLite) doit être testé aussi rigoureusement que l'optimal, la règle du projet le
dit déjà mais elle compte double ici.

---

## L16 — Page builder visuel

### Objectif

Un vrai constructeur de page par glisser-déposer, au-delà du formulaire de champs
actuel (`block-form.tsx`) et des sections réutilisables de L12. C'est la
fonctionnalité P2 que la V1 de ce document excluait explicitement — elle rentre
maintenant dans le périmètre.

### Dépendances

Dépend de L12 (système de tokens visuel, blocs refaits) — construire le builder sur
des blocs déjà modernisés, pas sur les anciens qu'il faudrait refaire une deuxième
fois.

### Périmètre

- Glisser-déposer de blocs dans la page, réordonnancement visuel (au lieu des
  boutons monter/descendre actuels du `block-form.tsx`)
- Édition inline : cliquer un texte dans l'aperçu pour l'éditer directement, plutôt
  que via un formulaire séparé
- Aperçu en temps réel fidèle au rendu public (même pipeline que `theme-render.ts`,
  pas une approximation React qui diverge du HTML réellement servi)
- Bibliothèque de blocs avec recherche/catégories dans le panneau d'insertion
- Undo/redo sur les actions de mise en page
- Prévisualisation responsive (desktop/tablette/mobile) dans le builder lui-même

### Tâches, dans l'ordre

1. Décision d'architecture : rendre l'aperçu via un iframe pointant le vrai rendu
   serveur (fidélité garantie, plus simple) vs. réimplémentation React des blocs
   (plus réactif, risque de divergence avec le rendu réel) — trancher avant de coder,
   la fidélité au rendu réel est non négociable pour ce projet (même philosophie que
   « le thème ne touche jamais la base », le builder ne doit jamais mentir sur ce qui
   sera réellement publié)
2. Glisser-déposer + réordonnancement
3. Édition inline
4. Panneau de blocs avec recherche
5. Undo/redo
6. Prévisualisation responsive

### Critères d'acceptation

- Ce qui s'affiche dans le builder est pixel-identique à ce que `cogenta serve` rend
  réellement pour la même page — vérifié par comparaison, pas par confiance
- Un contenu construit visuellement reste des données sémantiques en base (contrat B
  intact) — le builder ne stocke jamais de HTML/CSS généré

### Tests exigés

Test de fidélité visuelle (capture d'écran builder vs rendu public réel, même
contenu). Test que le contrat B reste respecté après une session d'édition visuelle
complète.

### Pièges connus

**La divergence builder/rendu réel est le bug de tous les page builders.** Elle
apparaît des mois après le lancement, sur un cas limite (police custom, breakpoint
particulier). L'architecture en iframe sur le vrai rendu serveur (option 1 de la
tâche 1) élimine structurellement ce risque ; la réimplémentation React ne fait que
le repousser. Le choisir sciemment, pas par défaut.

---

## L17 — Marketplace

### Objectif

Une vraie marketplace de plugins/thèmes/skins, au-delà de l'écran de permissions
actuel (`packages/admin/src/plugins/`) qui ne fait que réviser ce qu'un plugin déjà
installé demande.

### Dépendances

Dépend de L13 (clés API) si la marketplace est un service distinct interrogé par
API. Dépend de la signature Ed25519 déjà réelle dans `@cogenta/plugins` (L7) — la
marketplace distribue des paquets déjà signés, elle ne réinvente pas la confiance.

### Périmètre

- Registre de plugins/thèmes/skins consultable (recherche, catégories, notes/avis)
- Installation/mise à jour/désactivation depuis l'admin, un clic, réutilisant le
  pipeline de vérification de signature déjà réel
- Fiche détaillée par extension : capacités demandées en langage clair (déjà fait
  pour l'écran de permissions, réutiliser), captures d'écran, changelog
- Volet « commercial » explicitement optionnel : un plugin/thème peut être payant —
  si ce choix est confirmé, ça implique un vrai flux de paiement (réutiliser le
  driver de paiement de L15, pas un deuxième système)

### Tâches, dans l'ordre

1. Registre consultable (recherche/catégories) — commencer en lecture seule
2. Installation en un clic depuis l'admin
3. Fiche détaillée par extension
4. Mises à jour groupées avec diff de permissions avant d'accepter (ne jamais
   auto-accorder une capacité élargie silencieusement — c'est déjà une règle actée
   du projet pour les mises à jour de plugins, L7)
5. Volet commercial (si confirmé), réutilisant le driver de paiement de L15

### Critères d'acceptation

- Installer une extension depuis la marketplace vérifie sa signature avant toute
  exécution, jamais une confiance implicite parce qu'elle vient « du registre
  officiel »
- Une mise à jour qui élargit les permissions s'arrête et demande confirmation
  explicite, ne s'applique jamais silencieusement

### Tests exigés

Réutiliser la suite de tests d'évasion déjà exigée pour `@cogenta/plugins` (L7) sur
tout ce qui transite par la marketplace — aucune extension installée via ce canal ne
doit contourner le sandbox existant.

### Pièges connus

**Une marketplace est une nouvelle surface de confiance.** Le sandbox worker_threads
+vm et la signature Ed25519 existent déjà et sont éprouvés (L7) — la marketplace ne
doit rien affaiblir de ça pour aller plus vite. Passer par `security-reviewer` avant
toute mise en service.

---

## L18 — IA avancée

### Objectif

Ce que la liste de l'utilisateur nomme en catégorie 18 : génération de contenu,
réécriture, correction grammaticale, résumé, traduction, génération de meta
descriptions/titres/tags/alt text, génération d'images, recherche sémantique,
assistant IA dans l'admin, chat avec le contenu du site, RAG, classification
automatique, modération automatique, détection de doublon, suggestions SEO,
génération automatique de FAQ/Schema.org.

### Dépendances

Dépend de L10 (recherche full-text branchée — la recherche sémantique s'ajoute à
côté, pas à la place) et s'appuie sur `@cogenta/agents` (existant, runtime agentique
déjà réel) plutôt que de construire un système parallèle. R2 reste non négociable :
rien ici ne doit rendre le CMS dépendant d'une clé API pour fonctionner — chaque
fonctionnalité de cette liste est un outil d'agent optionnel, jamais un chemin
obligatoire.

### Périmètre

**Assistant dans l'admin** : panneau de suggestions IA sur une fiche de contenu —
réécriture, correction, résumé, traduction, génération de meta description/titre/
tags/alt text — chacun un outil d'agent réel (contrat C `tools@1.0`, déjà figé,
donc chaque nouvel outil respecte ce contrat existant plutôt que d'en inventer un
autre).

**Génération d'images** : outil d'agent qui appelle un fournisseur d'image
(driver, comme les fournisseurs LLM existants — plusieurs implémentations,
jamais un seul fournisseur en dur).

**Recherche sémantique** : embeddings sur le contenu (nouveau driver `vector`,
suivre le même patron interface+implémentations que `packages/core` applique déjà à
cache/queue/storage — chercher si un driver vecteur existe déjà avant d'en créer un,
`docs/02-architecture.md` en parle peut-être déjà comme prévu et jamais implémenté).

**Chat avec le contenu du site / RAG** : agent conversationnel qui répond en citant
ses sources dans le contenu réel du site (R8 : le contenu externe/interne cité est
toujours balisé comme donnée, jamais confondu avec une instruction).

**Classification et modération automatiques** : agent qui suggère des tags/
catégories, détecte un contenu dupliqué (utile aussi hors contexte IA — recouvre une
partie du besoin de L13), signale un contenu à modérer sans jamais le supprimer tout
seul (une action à effet de bord irréversible passe par la validation humaine, R6,
déjà une règle actée du projet).

**Génération automatique de FAQ/Schema.org** : agent qui propose un bloc `faq` ou un
JSON-LD à partir du contenu existant — jamais publié automatiquement, toujours en
brouillon proposé.

### Tâches, dans l'ordre

1. Vérifier l'existant : driver `vector` déjà prévu dans l'architecture ou pas —
   ne pas dupliquer si `packages/core` a déjà une interface
2. Outils d'agent d'écriture (réécriture/correction/résumé/traduction/meta/tags/alt)
3. Panneau assistant dans l'admin, branché sur ces outils
4. Génération d'images (driver fournisseur)
5. Recherche sémantique (driver vector + branchement recherche de L10)
6. Chat/RAG sur le contenu du site
7. Classification/détection de doublon/modération (jamais d'action destructive
   automatique)
8. Génération FAQ/Schema.org (toujours en brouillon)

### Critères d'acceptation

- Le CMS entier continue de fonctionner à 100 % (R2) sans aucun fournisseur LLM
  configuré — chaque fonctionnalité de ce lot disparaît proprement, rien ne casse
- Aucune action de ce lot ne modifie ou supprime du contenu sans validation humaine
  explicite (R6)
- Le chat/RAG cite ses sources et ne peut jamais faire passer un texte de commentaire
  ou de contenu importé pour une instruction (R8, testé avec un cas d'injection
  réel dans le contenu)

### Tests exigés

Test que chaque fonctionnalité se dégrade proprement sans fournisseur configuré.
Test d'injection de prompt via du contenu marqué comme donnée (R8) pour le RAG/chat.
Test que la modération/classification ne supprime ni ne publie jamais rien seule.

### Pièges connus

**Le driver dégradé de l'IA, c'est « absent, pas cassé ».** Contrairement à
cache/storage où un driver dégradé fait le même travail plus lentement, il n'existe
pas de version dégradée locale crédible de « génère un résumé » — la dégradation
correcte ici est que la fonctionnalité disparaît de l'UI plutôt que d'échouer
bruyamment, cohérent avec comment le reste du produit traite déjà l'absence de LLM.

---

## L19 — Création de site pilotée par l'IA (agentique de bout en bout)

### Objectif

C'est le chantier que l'utilisateur a nommé comme central, pas périphérique : « comme
c'est un CMS agentique, il faut que ça soit vraiment au cœur du fonctionnement ».
Aujourd'hui, `npm create cogenta` produit un squelette (blueprint + skin par défaut ou
généré depuis une simple description texte, `chooseSkin`/`generateSkin`). Ce lot va
plus loin : l'utilisateur peut téléverser de vrais documents (cahier des charges,
brief client, spécifications), un agent les lit, comprend le besoin, et propose une
structure de site complète (modèle de contenu, pages, choix de gabarit) que
l'utilisateur valide et affine — pas seulement un skin de couleurs, un vrai plan de
site. Et ce n'est pas réservé à l'installation : la même capacité doit exister dans
l'admin après coup, pour qu'un site existant puisse être restructuré à partir de
nouveaux documents.

### Dépendances

Réutilise le runtime agentique existant (`@cogenta/agents`) et le patron déjà
éprouvé de `chooseSkin`/`generateSkin` (génération avec validation, régénération si
invalide, jamais livré tel quel si ça ne passe pas la validation) — ce lot l'étend,
ne le réinvente pas. Dépend de L11 (l'admin a besoin d'une UI de téléversement et de
validation) pour le volet post-installation. Le volet installeur peut démarrer
indépendamment.

### Périmètre

**Téléversement et analyse de documents** : accepter PDF, DOCX, Markdown, texte brut
— un nouvel outil d'agent (contrat C `tools@1.0`) qui extrait le texte, puis un agent
qui structure le besoin exprimé (type d'activité, pages nécessaires, contenus
attendus, ton, contraintes explicites). Le contenu du document est une donnée, jamais
une instruction (R8) — un cahier des charges qui contiendrait par accident une
formulation ressemblant à une instruction système ne doit jamais changer le
comportement de l'agent au-delà de structurer un site.

**Proposition de plan de site** : à partir de l'analyse, l'agent propose :
- un modèle de contenu (quelles collections, quels champs — en s'appuyant sur les 13
  types de champs déjà réels de contrat A, jamais en inventant un format parallèle)
- une arborescence de pages
- **entre deux et cinq gabarits/designs proposés**, que l'utilisateur choisit et
  peut affiner (extension directe de `generateSkin`, qui aujourd'hui n'en propose
  qu'un ; ici plusieurs candidats générés et présentés côte à côte)
- du contenu de démonstration cohérent avec le besoin exprimé, pas un texte
  générique

**Rien n'est jamais appliqué automatiquement** (R6) : la proposition est un
brouillon présenté à l'utilisateur, qui valide section par section (accepter le
modèle de contenu, choisir un gabarit parmi les propositions, ajuster avant
application) — jamais un site généré et publié sans repasser par un humain.

**Deux points d'entrée, une seule capacité** :
1. **Dans `npm create cogenta`** : une étape optionnelle avant le scaffold —
   « avez-vous un document de spécification à téléverser ? » — qui, si oui, lance le
   flux d'analyse avant même de poser les questions actuelles (nom, type de site,
   base de données…), et peut pré-remplir ces réponses à partir de ce qui a été
   compris (l'utilisateur les confirme ou les corrige, jamais un remplissage
   silencieux).
2. **Dans l'admin, après installation** : un site déjà en production peut recevoir
   de nouveaux documents à tout moment (nouvelle phase du projet, besoin qui évolue)
   et l'agent propose une évolution du modèle de contenu / des pages / du design,
   toujours en brouillon validable — jamais une réécriture destructive du site
   existant sans confirmation explicite par section touchée.

**Type de site par défaut, sans document** : quand l'utilisateur ne téléverse rien,
garder et enrichir ce qui existe déjà (le choix « Site type » du wizard, déjà réel,
mappé sur les neuf blueprints) — ajouter des paramètres par défaut sensés par type de
site (ex. portfolio → pas de panier, e-commerce → collections produit/commande
pré-câblées avec L15) que l'utilisateur valide au fur et à mesure plutôt que de tout
redéfinir à la main.

### Tâches, dans l'ordre

1. Outil d'agent d'extraction de texte (PDF/DOCX/Markdown/texte brut) — contrat C
2. Agent d'analyse du besoin (structuration : type d'activité, pages, contenus,
   ton, contraintes) à partir du texte extrait, avec balisage explicite R8
3. Extension de `generateSkin` pour produire deux à cinq candidats au lieu d'un,
   avec la même boucle de validation existante appliquée à chacun
4. Agent de proposition de modèle de contenu (collections/champs) à partir de
   l'analyse
5. UI de validation en admin : présentation du plan proposé, choix du gabarit parmi
   les candidats, validation section par section, jamais une case « tout accepter »
   qui masque le détail
6. Intégration dans le wizard `npm create cogenta` (étape optionnelle de
   téléversement avant les questions actuelles, pré-remplissage confirmable)
7. Volet post-installation dans l'admin (mêmes agents, réutilisés sur un site déjà
   vivant — évolution plutôt que création)
8. Paramètres par défaut enrichis par type de site (sans document), validables au
   fur et à mesure

### Critères d'acceptation

- Téléverser un vrai cahier des charges produit un plan de site cohérent avec son
  contenu réel (testé sur un corpus de documents réels et variés, pas un seul
  document propre fabriqué pour l'occasion — même piège déjà documenté pour l'import
  WordPress de L9, il se répète ici)
- L'utilisateur voit et choisit explicitement entre deux et cinq gabarits proposés,
  jamais un seul choix imposé
- Rien n'est appliqué à un site existant sans validation explicite, section par
  section
- Le CMS scaffoldé sans aucun document ni fournisseur LLM configuré continue de
  fonctionner exactement comme aujourd'hui (R2 non négociable — cette capacité est un
  ajout, jamais un chemin obligatoire)
- Un contenu de document conçu comme une tentative d'injection de prompt ne fait
  jamais dévier l'agent de sa tâche de structuration (testé avec un cas réel, R8)

### Tests exigés

Corpus de documents réels et variés (formats différents, qualité différente,
longueurs différentes) pour l'analyse de besoin — même discipline que l'import
WordPress. Test d'injection de prompt via le contenu d'un document téléversé. Test
que la boucle de validation de gabarits rejette et régénère un candidat invalide
(réutilise directement la logique déjà testée de `chooseSkin`). Test que le CMS
fonctionne sans LLM configuré (R2).

### Pièges connus

**C'est le lot le plus proche de « magie » du produit — donc celui qui déçoit le
plus s'il ment.** Un plan de site généré qui ignore une contrainte explicite du
document (« pas de blog », « en anglais uniquement ») casse la confiance
immédiatement. Construire le test d'acceptation autour de contraintes explicites
extraites d'un document réel, vérifier qu'elles sont respectées dans la proposition,
pas seulement que « quelque chose de plausible » est généré.

**La tentation de tout auto-appliquer pour aller vite.** L'utilisateur a explicitement
demandé la validation (« que l'utilisateur peut valider », « affiner ») — ne jamais
publier un site généré sans repasser par cette étape, même en mode `--yes` de
l'installeur (dans ce cas, soit l'étape de document est simplement absente du flux
non interactif, soit elle produit un brouillon qui attend d'être validé au premier
lancement de l'admin, jamais une publication automatique).

---

## Vue d'ensemble pour l'exécution parallèle

| Lot | Peut démarrer maintenant | Touche un contrat figé | Dépend de |
|---|---|---|---|
| L10 | Oui | Non | — |
| L11 | Oui (après décision design system) | Non | — |
| L12 | Oui | Possible (B, si nouveau champ de bloc) | — |
| L13 | Oui | Oui (A, tâches 2-3 ; possiblement C, tâche 8) | — |
| L14 | Partiellement (tâches 1-4) | Non | L13 tâche 8 pour OAuth2 |
| L15 | Oui | Oui (nouveau domaine, ADR tâche 1) | — |
| L16 | Non | Non | L12 (blocs modernisés) |
| L17 | Partiellement (registre lecture seule) | Non | L13 (clés API), L15 (paiement, volet commercial) |
| L18 | Partiellement (vérif driver vector) | Possible (C, si un nouvel outil en a besoin) | L10 (recherche) |
| L19 | Partiellement (volet installeur) | Non | L11 (UI de validation post-install) |

Aucun lot ne bloque un autre au-delà des dépendances listées. Dix agents peuvent
travailler en parallèle dès l'accord sur ce document, avec trois points de
coordination réels : L11 tranche sa décision de design system avant que L12 fige sa
palette de tokens, L16 attend que L12 ait modernisé les blocs avant de construire le
builder par-dessus, et L19 attend l'UI de validation de L11 pour son volet
post-installation (le volet installeur, lui, démarre sans attendre).

## Ce que « CMS complet » veut dire ici

Toutes les dix-neuf catégories de la liste de l'utilisateur sont couvertes par
L10-L19, sans exclusion : gestion de contenu et médias (L10, L13), design admin et
public (L11, L12), SEO (L10), utilisateurs/permissions/workflow (L11, L13),
multilingue (déjà robuste, exposé par L11), extensions/marketplace (L11, L17), API/
headless (L10, L13, L14), performance (L10, L12), sécurité (L10, L13, L14),
analytics (L13), recherche (L10, L18), communication (L13 notifications, L15
factures/emails via `@cogenta/channels`), e-commerce (L15), architecture technique
(déjà largement en place, L0-L9), administration (L11), IA (L18, plus la création de
site pilotée par IA de L19 — le point que l'utilisateur a nommé comme central au
caractère agentique du produit), content model (déjà le point fort du projet, étendu
par L13). Rien de la liste n'est laissé de côté ; ce qui reste ouvert, ce sont des
décisions d'architecture précises (données commerce dans le contrat A ou un contrat E
séparé, iframe ou réimplémentation pour le page builder) explicitement signalées comme
telles dans chaque lot concerné, plutôt que tranchées en silence.
