# L10-L14 — De « ça marche » à « plateforme professionnelle »

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

Cinq lots parallélisables, **L10 à L14**, chacun exécutable par un agent différent sans
attendre les autres au-delà des dépendances explicitement listées. Chaque lot a son
périmètre, ses tâches dans l'ordre, ses critères d'acceptation. Un agent peut recevoir
« exécute L12 » sans lire les autres sections.

**Contrats à surveiller** : `docs/04-contrats.md` fige A (`schema@1.0`) et B
(`blocks@1.0`) depuis le 2026-08-13 — toute tâche qui ajoute un champ système (statut
de corbeille, verrou de workflow) ou un type de champ (taxonomie) touche le contrat A
et exige une montée en `2.0` avec note de migration, pas un ajout silencieux. C'est
signalé à chaque tâche concernée par **[CONTRAT A]**. Avant de commencer une tâche
marquée ainsi, écrire l'ADR de montée de version (skill `write-adr`) et la faire
valider — ne pas la contourner en douce, la règle du projet est explicite là-dessus.

**Hors périmètre de ces cinq lots, assumé** : e-commerce (produits/paniers/paiements —
un CMS n'est pas une plateforme e-commerce, ce serait un lot séparé si jamais décidé),
fonctionnalités IA avancées au-delà de ce que `@cogenta/agents` fait déjà (RAG sur le
contenu, chat avec le site — un lot L15 séparé, après que ces cinq-là donnent une base
stable), marketplace commerciale de plugins, page builder drag & drop pixel-perfect
(L11 pose l'UI de blocs modernisée, pas un éditeur visuel type Elementor).

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

## Vue d'ensemble pour l'exécution parallèle

| Lot | Peut démarrer maintenant | Touche un contrat figé | Dépend de |
|---|---|---|---|
| L10 | Oui | Non | — |
| L11 | Oui (après décision design system) | Non | — |
| L12 | Oui | Possible (B, si nouveau champ de bloc) | — |
| L13 | Oui | Oui (A, tâches 2-3 ; possiblement C, tâche 8) | — |
| L14 | Partiellement (tâches 1-4) | Non | L13 tâche 8 pour OAuth2 |

Aucun lot n'attend qu'un autre soit *terminé* pour démarrer — seules quelques tâches
précises (notées ci-dessus) ont une vraie dépendance. Cinq agents peuvent travailler
en parallèle dès l'accord sur ce document, à condition que L11 tranche sa décision de
design system avant que L12 fige sa propre palette de tokens, pour éviter deux
systèmes visuels incohérents entre admin et thème public.

## Ce que « la prochaine version coche toutes les cases » veut dire ici, honnêtement

Toutes les cases du tableau **P0 et P1** que l'utilisateur a donné sont couvertes par
L10-L14, sauf : page builder visuel drag & drop (P2, explicitement hors périmètre —
L12 fait des sections réutilisables, pas un éditeur visuel), marketplace commerciale
(P2, hors périmètre), e-commerce (P2, hors périmètre), fonctionnalités IA avancées
au-delà de l'existant (P2, hors périmètre, lot séparé si décidé plus tard). C'est un
choix de scope assumé, pas un oubli — le signaler explicitement plutôt que de
prétendre à l'exhaustivité totale de la liste.
