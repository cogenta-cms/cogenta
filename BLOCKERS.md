# BLOCKERS — L13/L10 (résumé courant)

Ce fichier ne liste que ce qui est réellement bloqué, pas ce qui est fait.

## 1. Intégration Postgres / MySQL / MariaDB non exécutée (environnement)

**Ce qui manque** : la case « Tests d'intégration sur les trois bases » de la
définition de terminé, pour les deux surfaces de données ajoutées ici
(`ContentStore.duplicate` et `PasswordResetStore`).

**Pourquoi** : le moteur Docker de cette machine répond `500 Internal Server
Error` à tout appel d'API (`docker ps`, `docker compose ... up`), donc
`pnpm services:up` échoue avant de démarrer quoi que ce soit. Ce n'est pas
une régression du dépôt : le même constat est déjà consigné dans `CLAUDE.md`
pour l'intégration `MediaStore`.

```
unable to get image 'postgres:17-alpine': request returned 500 Internal Server
Error for API route and version .../v1.51/images/postgres:17-alpine/json
```

**Ce qui a quand même été fait** : les tests *sont écrits* et rejoués sur les
quatre dialectes par construction, pas seulement sur SQLite.

- `duplicate()` : les douze tests vivent dans la suite de contrat unique
  `packages/schema/test/store/content-store.contract.ts`, que
  `test/integration/content-store.test.ts` exécute déjà contre Postgres, MySQL
  et MariaDB.
- `PasswordResetStore` : nouvelle suite de contrat
  `packages/auth/test/resets.contract.ts`, plus un nouveau
  `packages/auth/test/integration/resets.test.ts` — c'est le **premier**
  répertoire `test/integration/` de `@cogenta/auth`, qui n'en avait aucun
  jusqu'ici alors que `vitest.integration.config.ts` en attendait un.

Les deux fichiers d'intégration sautent **bruyamment** (un `describe.skip`
nommant la variable d'environnement manquante), jamais silencieusement. Il
n'y a donc rien à écrire pour lever ce blocage : il suffit de le rejouer sur
une machine où Docker fonctionne.

```bash
pnpm services:up
pnpm -F @cogenta/schema test:integration
pnpm -F @cogenta/auth   test:integration
```

Le point le plus sensible à vérifier là-bas est l'unicité d'usage du jeton de
réinitialisation : elle repose sur `update ... where used_at is null` et sur
la valeur de `rowsAffected`, et MySQL a historiquement sa propre définition de
« ligne affectée ».

## 2. Ce qui n'est **pas** un blocage, et pourquoi

- ~~**Taxonomies et corbeille** : non codées, délibérément.~~ **Levé** :
  ADR-0022 est actée, le contrat A est figé en `schema@2.0`, et les deux
  fonctionnalités sont implémentées (voir la section « Corbeille et taxonomies »
  plus bas pour ce qui reste réellement non vérifié).
- **Absence de transport SMTP réel** : `cogenta users reset-password` écrit un
  vrai message dans `.cogenta/mail` via le transport fichier de
  `@cogenta/channels`, et le dit explicitement dans sa sortie. C'est un manque
  déjà documenté dans `packages/channels/src/providers/email/transport.ts`, pas
  un blocage introduit ici.
- **Absence de route admin de réinitialisation** : le lot L13 demande
  explicitement « CLI d'abord, puis admin une fois L11 avancé ». Le message
  envoyé porte donc le jeton et la commande exacte, jamais un lien qui
  renverrait un 404 aujourd'hui.

---

# Blocages — Corbeille et taxonomies (`schema@2.0`, ADR-0022)

Un seul blocage réel, et c'est le même que le point 1 ci-dessus : **aucun test
d'intégration n'a pu être exécuté sur Postgres, MySQL ou MariaDB depuis cette
machine.** Le reste de cette section dit exactement ce qui a tourné et ce qui
n'a pas tourné, pour que personne n'ait à le deviner.

## Ce qui a réellement tourné

**SQLite uniquement**, mais sur toute la surface :

| Suite | Résultat |
|---|---|
| `packages/schema` (dont les nouvelles suites de contrat corbeille, taxonomies et migration) | 435/435 |
| `packages/api` (dont `trash-router` et `taxonomy-router`, permissions par rôle) | 403/403 |
| `packages/admin` (dont `trash` et `taxonomies`) | 191/191 |
| `packages/cli` (dont le test de bout en bout sur un vrai serveur HTTP) | 140/140 |

## Ce qui n'a **pas** tourné, et pourquoi

Le moteur Docker de cette machine répond `500 Internal Server Error` à tout
appel d'API, donc `pnpm services:up` échoue avant de démarrer un conteneur.

```
request returned 500 Internal Server Error for API route and version
http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.52/info
```

Les trois dialectes manquants sont donc **écrits mais non exécutés**. Deux
nouveaux fichiers d'intégration les attendent, et sautent bruyamment (un
`describe.skip` nommant la variable d'environnement absente) plutôt que de
passer au vert sans rien faire :

- `packages/schema/test/integration/taxonomy-store.test.ts`
- `packages/schema/test/integration/schema-2-migration.test.ts`

Les tests eux-mêmes vivent dans les suites de contrat uniques
(`test/store/taxonomy-store.contract.ts`, `test/store/schema-2-migration.contract.ts`,
et les nouveaux cas ajoutés à `content-store.contract.ts`), donc rien n'est à
écrire pour lever ce blocage : il suffit de le rejouer là où Docker marche.

```bash
pnpm services:up
pnpm -F @cogenta/schema test:integration
```

**Les deux points les plus sensibles à vérifier là-bas**, parce que ce sont
ceux où les dialectes divergent réellement :

1. **Le chemin matérialisé.** Toute sa justification (ADR-0022, ADR-0006) est
   qu'un `like` sur un chemin se comporte identiquement sur les trois moteurs
   là où un CTE récursif ne le fait pas. Tant que
   `taxonomy-store.test.ts` n'a pas tourné sur les trois, c'est une intention
   de conception, pas un fait vérifié. À surveiller en particulier : la
   collation par défaut de MySQL est insensible à la casse, ce qui ne change
   rien pour des UUID minuscules mais rendrait un `like` sur des slugs
   trompeur si quelqu'un changeait la composition du chemin.
2. **La migration.** MySQL committe le DDL implicitement : une migration qui
   échoue à mi-parcours y laisse le schéma entre deux états sans rollback. Le
   migrateur le dit fort plutôt que de faire semblant, mais savoir si *cette*
   migration passe en un seul coup sur un vrai MySQL est un fait que seul un
   vrai MySQL établit. Le `down` est aussi le cas où SQLite est le plus
   contraignant (`drop column` refuse une colonne couverte par un index, d'où
   l'ordre de suppression) — et celui-là, au moins, a bien tourné.

## Ce qui n'est **pas** un blocage, et pourquoi

- **`siblings` est optionnel sur `createContentStore`.** Sans lui, seules les
  auto-références sont vérifiées au moment de la mise à la corbeille. Ce n'est
  pas un trou silencieux laissé ouvert par facilité : le rendre obligatoire
  cassait une quarantaine d'appelants dont la plupart n'ont aucune relation
  `restrict`, et la dégradation est bornée — rien n'est détruit, puisque
  `purge()` rencontre toujours la vraie clé étrangère. `cogenta serve` passe
  l'ensemble complet.
- **L'isolation par site n'a pas de nouveau test.** Les taxonomies vivent dans
  la base du site, comme le contenu ; il n'y a pas de nouvelle frontière
  inter-sites à prouver.
- **Pas de test e2e Playwright sur les deux écrans d'admin.** Ils sont testés
  au niveau composant contre un stub HTTP qui applique les mêmes règles de
  rôle que le vrai serveur, et le chemin serveur est prouvé de bout en bout
  par `packages/cli/test/serve-taxonomies-trash.test.ts` contre un vrai
  serveur. L11 reprendra ces écrans pour de bon.

---

# BLOCKERS — L12 (thème public)

**Décision : rien n'est construit.** Le lot le dit lui-même — « OAuth2 pour un
client tiers, **si un vrai besoin headless au-delà des clés API simples se
confirme** (ne pas construire en spéculatif) » — et AGENTS.md l'interdit une
seconde fois (« Introduire une abstraction pour un cas hypothétique »).

**Ce que dit le code réel**, vérifié avant de trancher :

- Il n'existe **aucune identité machine** dans ce dépôt. `resolveActor`
  (`packages/api/src/rest/auth-router.ts`) ne connaît qu'une chose : un jeton
  porteur qui résout vers une **session d'utilisateur humain**. Pas de clé API,
  pas de client, pas de `scope` — le mot n'apparaît nulle part dans
  `packages/auth/src` au sens d'une portée d'autorisation.
- Les clés API sont la tâche 8 du **L13**, et elles ne sont pas encore dans ce
  worktree (`git log` s'arrête à `eea27be feat(schema):
  duplicate/autosave/password-reset, contract A v2 draft (L13)`). La ligne
  « Dépendances » du L14 est explicite : « Dépend de L13 tâche 8 (clés API)
  pour la partie OAuth2/scopes le cas échéant. »
- L'autorisation elle-même est entièrement **par rôle** (`permissions:
  { read, create, update, delete, publish }` du contrat A, figé). Un OAuth2
  utile suppose des **portées** plus fines qu'un rôle, ou au minimum une
  traduction portée→rôle. Ni l'une ni l'autre n'existe, et inventer la seconde
  sans la première produirait un jeton OAuth2 qui n'est qu'un jeton de session
  avec plus de cérémonie.

**Ce que coûterait de le faire quand même**, honnêtement : un serveur
d'autorisation complet — enregistrement de client, écran de consentement,
`authorization_code` + PKCE, point de jeton, rafraîchissement, révocation,
métadonnées de découverte — plus le modèle de portées qui n'existe pas. C'est
un lot à lui seul, pas une tâche, et il serait construit sur une fondation
(l'identité machine) qui n'est pas encore posée.

**Ce qui doit être vrai avant de le reprendre**, dans cet ordre :

1. L13 tâche 8 livrée : une vraie identité non-humaine, avec sa propre table,
   sa propre révocation et sa propre trace d'audit.
2. Un modèle de portée réel, décidé par ADR — soit une extension du contrat A
   (donc `schema@3.0`), soit une couche d'autorisation à côté.
3. **Un besoin réel constaté**, pas supposé : un intégrateur tiers qui doit
   agir *au nom d'un utilisateur du site*. Tant que le seul client headless est
   le front-end du site lui-même, une clé API par déploiement le sert mieux
   qu'un flux à trois parties.

Aucun de ces trois points n'est vrai aujourd'hui.

---

## 2. Revue de sécurité formelle L10-L13 (tâche 5) — hors de ce worktree

Explicitement retirée du périmètre confié à cet agent : « un autre processus
s'en chargera séparément, ne la fais pas toi-même dans ce worktree ». Rien
n'a été fait de ce côté ici. La case reste ouverte pour le lot.

---

## 3. Constats réels trouvés en chemin, appartenant à un autre lot

### 3.1 `ContentStore.unpublish` n'est joignable par aucun transport

`ContentStore` expose `unpublish(id, { status })` depuis L1, et il fonctionne.
Mais **aucune route REST ni GraphQL ne l'appelle** :

- `packages/api/src/rest/router.ts` route `publish`, `history`, `translations`,
  `diff`, `restore` — pas `unpublish`.
- `update()` du store ne change **jamais** le `status` (voir
  `packages/schema/src/store/store.ts`), donc un `PATCH { status: 'draft' }` ne
  dépublie pas non plus.

Conséquence concrète : **une page publiée ne peut pas être retirée du site par
l'API**. Le seul retrait possible est la suppression (`DELETE`), qui est
destructive. Ce n'est pas un manque de L14 — c'est une lacune du modèle de
contenu exposé, donc du L13 (qui touche déjà `status`, la corbeille et le
workflow éditorial dans son propre périmètre).

Le décorateur `withLifecycleEvents` livré par la tâche 1 **couvre déjà**
`unpublish()` : le jour où la route existe, l'événement `content.unpublish`
part sans une ligne de plus. Le test de bout en bout du webhook prouve le
retrait via `DELETE` (`content.delete`), qui est le seul chemin réellement
atteignable aujourd'hui.

### 3.2 L'index de recherche ne peut pas servir à la détection de liens

Le lot suggérait de réutiliser « le contenu déjà indexé par la recherche de
L10 ». Ce n'est pas possible, et ce n'est pas un oubli :
`packages/schema/src/search/extract.ts` retire délibérément `href`, `url`,
`src`, `markDefs` et `rel` de `STRUCTURAL_KEYS` avant d'indexer — indexer une
URL ferait de `https` un terme de recherche et classerait une page selon son
nombre de liens. **L'index ne contient donc aucune URL.** La tâche 3 fait donc
le crawl des entrées publiées, qui est le repli que le lot prévoyait lui-même.

### 3.3 `pnpm lint` était déjà rouge avant L14

`packages/api/src/graphql/gateway.ts:8` importe `ContentEntry` sans jamais
l'utiliser (`lint/correctness/noUnusedImports`). Le fichier n'a été touché par
aucun commit de L10 à L14 (`git diff --name-only 48d8e83..HEAD` ne le liste
pas) : la dette est antérieure. **Non corrigé ici**, volontairement — AGENTS.md
demande « une PR = un sujet », et ce fichier appartient à un lot qu'un autre
agent peut être en train de modifier en parallèle. C'est un correctif d'une
ligne pour qui reprend le fichier.

Le reste de la sortie de `pnpm lint` est de niveau `info` (`useLiteralKeys`,
`noImportantStyles`), pré-existant lui aussi et non bloquant.

### 3.4 Le rate limiter : audité, rien à ajouter

Vérifié avant d'écrire quoi que ce soit, comme demandé. `createRateLimiter` est
appliqué partout où il y a une surface d'attaque en ligne :

| Chemin | Limité ? | Sujet |
|---|---|---|
| `passwordLogin` | oui | l'email essayé |
| `totpLogin` | oui | `mfa:<userId>` |
| `confirmTotpEnrolment` | oui | `totp-setup:<userId>` |
| WebAuthn (login et registration) | **non, à dessein** | aucun secret devinable — le `hint` de l'erreur le dit déjà à l'utilisateur |
| Redemption d'un jeton de réinitialisation | non | **aucune route HTTP n'existe** (`packages/api/src/rest/users-router.ts` le dit explicitement) — attaque en ligne impossible |

Une seule vraie faiblesse trouvée, et **corrigée dans la tâche 4** : la table
`cogenta_login_attempts` n'était jamais purgée. `clear(subject)` ne s'exécute
qu'après une connexion **réussie**, donc un sujet qui n'aboutit jamais — c'est
exactement le profil d'un script — accumulait des lignes indéfiniment.
`recentFailures()` purge maintenant ce qui est sorti de la fenêtre.

À surveiller si une route de réinitialisation par HTTP est ajoutée (L13) :
elle devra passer par le limiteur, sans quoi le point 3.3 cesse d'être vrai.

---

## 4. Limites assumées de ce qui a été livré

**Ce que demande le lot (tâche 4)** : composer une page à partir de sections
nommées réutilisables, pas seulement d'une liste plate de blocs.

**Le fait** : « réutilisable » veut dire qu'une page **référence** une section
stockée ailleurs. C'est une nouvelle forme de donnée (une collection de sections,
et une référence depuis une zone de blocs), donc contrat A et contrat B, tous deux
figés. Le rendu, lui, est trivial une fois la donnée définie : `renderPage` prend
déjà une liste de blocs, et une section n'est qu'une liste de blocs nommée.

**Ce qu'il faudrait** : une ADR qui tranche **où** vit une section — une
collection système (contrat A) ou un type de bloc « référence de section »
(contrat B) — avant toute ligne de code. Deviner ce choix en cours de route est
exactement ce que la règle de gouvernance interdit.

---

## 4. Lighthouse CI n'est pas branché

**Ce que demande le lot (tâche 5)** : « Mesure réelle Lighthouse en CI sur au
moins un blueprint, avec seuil qui fait échouer la build en cas de régression ».

**Ce qui manque** : la mesure a besoin (a) d'un Chrome headless dans le runner,
(b) d'une nouvelle dépendance directe `@lhci/cli` — R9 impose de la justifier
explicitement, et (c) d'un site réel qui tourne : scaffolder via `create-cogenta`,
générer une clé de signature, lancer `cogenta serve`, mesurer, arrêter. C'est un
workflow e2e complet, que je ne peux pas exécuter ici pour le vérifier (pas de
Chrome dans l'environnement de build). Écrire un workflow CI non exécuté serait
pire que de ne rien écrire : il passerait vert sans rien mesurer.

**Ce qui a été fait à la place, et qui est réel** : le CSS servi est minifié et
mis en cache avec un ETag ; le thème n'embarque toujours aucun JavaScript client ;
les images portent déjà `loading="lazy"` (sauf le média du hero, `eager`, parce
que c'est le LCP par construction), `sizes` et `srcset` dès que le contexte de
rendu en fournit un ; les animations d'entrée sont derrière `@supports
(animation-timeline: view())` et `prefers-reduced-motion`, donc elles ne bloquent
jamais le rendu.

---

## 5. Le `srcset` du thème attend le pipeline d'images (L10)

**Le fait** : `src/render/media.ts` émet déjà `srcset`, `sizes`, `width`,
`height`, `loading` et `decoding` — la moitié « thème » de la tâche 5 est faite
depuis L3. Ce qu'elle rend dépend entièrement de ce que `ctx.image()` retourne.

Dans `cogenta serve`, `ctx.image()` **lève** aujourd'hui
`THEME_IMAGE_UNSUPPORTED` (`packages/cli/src/commands/theme-render.ts`) : aucun
pipeline n'y est câblé. Vérifié : aucun des neuf blueprints ne place de média dans
un bloc, donc aucun site scaffoldé ne déclenche ce refus — mais une page éditée à
la main qui ajoute un `hero` avec média fera une 500, pas une image manquante.

**Ce qu'il faudrait** : que L10 branche `packages/render/src/images/` au média
téléversé et fournisse un `ctx.image()` réel. Le thème n'a alors **rien** à
changer : le `srcset` s'allume tout seul. Il y a aussi une décision de permissions
à prendre au passage — la route de fichier média (`/api/media/:id/file`) exige une
session, donc un visiteur anonyme ne peut pas voir une image ; c'est un choix
L10/L14, pas un choix de thème.

---

## 6. Aucune police ne peut être préchargée dans le contrat D actuel

**Ce que demande le lot (tâche 5)** : « Préchargement des polices,
`font-display: swap` ».

**Le fait** : contract D donne trois tokens de police (`sans`, `serif`, `mono`) et
ce sont des **familles**, pas des fichiers. La skin par défaut n'y met que des
piles système (`ui-sans-serif, system-ui, …`) : rien n'est téléchargé, donc il n'y
a ni `@font-face` à écrire, ni fichier à précharger, et `font-display` n'a rien
sur quoi agir. Une skin qui nommerait une police web ne dit nulle part **où** est
le fichier — le contrat n'a pas de token pour ça.

**Ce qu'il faudrait** : un token de source de police dans le contrat D (donc
`theme@2.0`, même ADR que le point 1). Tant qu'il n'existe pas, « précharger les
polices » n'a pas de référent, et le thème est déjà dans le meilleur cas possible
pour les Core Web Vitals : zéro requête de police.

---

## 7. Tâche 6 (passe de contenu sur les blueprints) — faite

Plus un blocage. Les huit blueprints à pack de contenu ont reçu leur passe
(`featureGrid` partout, `faq` sur quatre, `quote` sur `magazine`, `stats` sur
`vitrine`), et un test valide désormais chaque bloc de démonstration contre le
vrai registre du contrat B. Le neuvième blueprint, `blank`, n'a par définition
aucun contenu à enrichir.

Reste volontairement en dehors : aucun bloc de démonstration ne référence de
média, parce que `cogenta serve` n'a pas encore de pipeline d'images (point 5) et
qu'un site fraîchement scaffoldé doit rendre au premier lancement.

---

# Blocages — L19, « création de site pilotée par l'IA »

## 8. Appliquer un plan sur un site **en production** : refusé, ADR requise

**Le conflit.** `docs/lots/L10-cms-complet.md`, section L19, demande
explicitement le volet post-installation : « un site déjà **en production** peut
recevoir de nouveaux documents à tout moment […] et l'agent propose une
évolution du modèle de contenu / des pages / du design ».

ADR-0010, actée, dit le contraire, mot pour mot : « L'éditeur visuel de schéma
écrit ces fichiers, mais **uniquement en mode développement**. En production le
schéma est en lecture seule. »

Appliquer un plan de site écrit `cogenta.schema.*` et crée des tables. C'est
l'éditeur de schéma, arrivé par une autre porte. La décision s'y applique sans
adaptation.

**Ce qui a été fait, plutôt que de contourner.** AGENTS.md est sans ambiguïté :
« Ne jamais rediscuter une décision actée. Si elle semble mauvaise, le dire et
attendre — ne pas contourner. » Donc :

- Proposer et relire un plan restent disponibles **partout**, y compris en
  production : c'est de la lecture et de l'écriture dans `.cogenta/site-plans/`,
  pas dans le schéma.
- **Appliquer** n'est possible que sous `cogenta dev`. `cogenta serve` ne
  construit aucun applier ; la route répond `CONTENT_READ_ONLY` avec le chemin
  de sortie réel (« lancez `cogenta dev` sur une copie de développement,
  appliquez-y, committez le fichier de schéma »). La relecture déjà faite est
  conservée, pas perdue.
- Un test le prouve dans les deux sens :
  `packages/cli/test/serve-site-plan.test.ts`, « refuses to apply on
  `cogenta serve`, because ADR-0010 keeps the schema read-only in production ».

**Levé** : ADR-0023 est actée dans `docs/03-decisions.md`, exactement telle que
proposée ci-dessus — appliquer un plan reste soumis à ADR-0010 sans exception,
`cogenta serve` refuse, `cogenta dev` seul l'autorise.

## 9. Aucune exécution contre un vrai fournisseur LLM

**Ce qui manque** : tout le pipeline L19 (analyse de brief, modèle de contenu,
gabarits, contenu de démo) est testé contre un `ProviderClient` scripté, et
côté installeur contre le vrai `fetchImpl` de `llm-setup.ts`. Le câblage est
donc prouvé de bout en bout ; la **qualité réelle** des sorties d'un modèle ne
l'est pas.

**Pourquoi** : aucune clé API dans cet environnement — c'est un accès humain,
pas du travail en attente (même statut que la case cPanel de L9).

**Ce qui limite la casse en attendant** : rien dans ce lot ne fait confiance au
modèle sur le point qui compte. Les contraintes explicites sont lues du texte
brut de façon déterministe et **imposées** après coup (`enforceOn*`), les
gabarits passent par la validation contrat D existante, les collections par le
vrai `defineCollection`, et les entrées de démo par `collectionInputSchema`. Un
modèle qui répond mal produit un refus nommé, pas un site faux.

---

# BLOCKERS — L14 (sécurité, headless, durcissement production)

Ce qui suit note ce que le lot L14 n'a **pas** construit et pourquoi, plus les
constats réels rencontrés en chemin qui appartiennent à un autre lot. Il n'y a
aucun blocage au sens « je ne peux pas avancer » : les quatre tâches du
périmètre confié (1 à 4) sont faites, testées et commitées.

## L14.1 OAuth2 (tâche 6) — délibérément non construit

**Décision : rien n'est construit.** Le lot le dit lui-même — « OAuth2 pour un
client tiers, **si un vrai besoin headless au-delà des clés API simples se
confirme** (ne pas construire en spéculatif) » — et AGENTS.md l'interdit une
seconde fois (« Introduire une abstraction pour un cas hypothétique »).

**Ce que dit le code réel**, vérifié avant de trancher :

- Il n'existe **aucune identité machine** dans ce dépôt. `resolveActor`
  (`packages/api/src/rest/auth-router.ts`) ne connaît qu'une chose : un jeton
  porteur qui résout vers une **session d'utilisateur humain**. Pas de clé API,
  pas de client, pas de `scope` — le mot n'apparaît nulle part dans
  `packages/auth/src` au sens d'une portée d'autorisation.
- Les clés API sont la tâche 8 du **L13**, pas encore livrées quand ce
  worktree a démarré. La ligne « Dépendances » du L14 est explicite : « Dépend
  de L13 tâche 8 (clés API) pour la partie OAuth2/scopes le cas échéant. »
- L'autorisation elle-même est entièrement **par rôle** (`permissions:
  { read, create, update, delete, publish }` du contrat A, figé). Un OAuth2
  utile suppose des **portées** plus fines qu'un rôle, ou au minimum une
  traduction portée→rôle. Ni l'une ni l'autre n'existe, et inventer la seconde
  sans la première produirait un jeton OAuth2 qui n'est qu'un jeton de session
  avec plus de cérémonie.

**Ce qui doit être vrai avant de le reprendre**, dans cet ordre : une vraie
identité non-humaine (clés API, table propre, révocation, audit) ; un modèle
de portée réel décidé par ADR ; un besoin réel constaté, pas supposé. Aucun
des trois n'est vrai aujourd'hui.

## L14.2 Revue de sécurité formelle L10-L13 (tâche 5) — hors de ce worktree

Explicitement retirée du périmètre confié à cet agent. Rien n'a été fait de ce
côté ici. La case reste ouverte pour le lot.

## L14.3 Limites assumées de ce qui a été livré

- **Aucune livraison de webhook n'est réessayée.** R1 garantit qu'aucun worker
  durable n'existe ; une boucle de réessai serait une promesse que le
  déploiement ne peut pas tenir. Un échec est journalisé de façon structurée,
  jamais silencieux, et le récepteur qui a besoin d'une garantie
  « au moins une fois » interroge l'API.
- **Le crawl de liens ne s'auto-planifie pas.** Même raison. `cogenta links
  check` sort avec le code 1 quand il trouve quelque chose, donc une entrée
  cron ou un job CI joue le rôle du « périodique » demandé par le lot.
- **L'alerte d'activité suspecte est déclenchée par une requête refusée**, pas
  par un timer — encore la même raison. Elle a donc un angle mort théorique :
  un site que personne n'attaque plus depuis dix minutes n'émettra pas
  d'alerte finale. La notice d'admin, elle, est recalculée à chaque chargement
  de page et couvre ce cas.

---

# Ce qui attend une décision ou un accès humain — L15 (e-commerce)

Rien ici n'est du travail en attente que j'aurais pu faire et laissé de côté. Ce sont
des points qui exigent soit une validation humaine, soit un accès que je n'ai pas.

## 1. L'ADR-0024 est actée — **levé**

ADR-0024 est insérée dans `docs/03-decisions.md`, exactement telle que proposée dans
`ADR-DRAFT-commerce.md` (supprimé, son contenu est maintenant la décision actée) : le
commerce vit dans un **contrat E séparé**, jamais dans une extension du contrat A. La
section « Contrat E » de `docs/04-contrats.md` a perdu son bandeau « Proposé, non
figé » — elle porte maintenant « Acté (ADR-0024), non figé », puisque le contrat lui-même
reste délibérément non figé (L15 est son premier et seul consommateur).

## 2. Le test Stripe contre un vrai bac à sable n'a jamais tourné — **accès manquant**

`packages/commerce/test/integration/stripe.test.ts` est écrit et attend
`COGENTA_TEST_STRIPE_SECRET_KEY`. Sans la variable il se **skippe bruyamment** en la
nommant, jamais silencieusement.

Il refuse par ailleurs de tourner contre une clé qui ne commence pas par `sk_test_` :
une suite de tests capable de déplacer de l'argent réel est une erreur qui attend son
mauvais jour.

Ce qui est déjà prouvé sans clé : le format de fil, le mapping des sept statuts Stripe,
et le schéma de signature de webhook — testés contre un vrai serveur `node:http` sur une
socket réelle (`test/payment-stripe.test.ts`, 30 tests). Ce que seule une vraie clé
prouve : que Stripe **lui-même** accepte encore les champs envoyés et renvoie encore les
statuts attendus, c'est-à-dire ce qui casse en silence quand une version d'API bouge.

## 3. Postgres / MySQL / MariaDB non exécutés cette session — **Docker indisponible**

`packages/commerce/test/integration/catalog.test.ts` et `checkout.test.ts` rejouent les
mêmes suites de contrat que SQLite contre les vrais serveurs. Elles se skippent
bruyamment en nommant `COGENTA_TEST_POSTGRES_URL` / `COGENTA_TEST_MYSQL_URL` /
`COGENTA_TEST_MARIADB_URL`.

C'est le point le plus important de cette liste, parce que trois affirmations du paquet
sont **sensibles au dialecte** et qu'aucune n'est vérifiée tant que ces suites n'ont pas
tourné :

- la sûreté du stock repose sur `update … where on_hand >= n` qui rapporte
  `rowsAffected` de la même façon partout — et **MySQL a son propre avis** sur ce que
  « affecté » veut dire quand une mise à jour trouve une ligne sans la changer
  (`CLIENT_FOUND_ROWS`). Si ça diffère, la survente est silencieuse.
- tout montant est un `bigint`, et `pg` rend `int8` sous forme de **chaîne**. Le
  décodeur `toInt()` existe précisément pour ça, mais il n'a été exercé que contre
  SQLite.
- `create index if not exists` n'existe pas sur les MySQL anciens : le schéma lui-même a
  une branche par dialecte que seul un vrai serveur peut valider.

**À faire** : `pnpm services:up` puis `pnpm -F @cogenta/commerce test:integration`.

## 4. Pas d'écrans React pour la boutique — **choix de périmètre, pas un oubli**

Le lot demande « CRUD admin basique » pour les produits. Ce qui est livré est un routeur
sans transport (`createCommerceAdminRouter`) avec le vocabulaire de permissions du
contrat E, testé rôle par rôle — c'est-à-dire toute la partie qui porte une décision de
sécurité.

Les écrans eux-mêmes ne sont pas écrits : `packages/admin` reçoit son design system dans
le **L11**, et écrire maintenant des formulaires qui seront refaits dans quelques jours
coûterait deux fois. Le routeur est prêt à être branché derrière eux.

Conséquence à connaître : `@cogenta/commerce` n'est branché nulle part aujourd'hui.
`cogenta serve` ne monte pas le routeur commerce, et rien dans `create-cogenta` ne
propose une boutique. C'est du câblage, pas de la capacité manquante — mais tant qu'il
n'est pas fait, la boutique n'est atteignable que par du code appelant.

## 5. Pas de blocs de vitrine — **hors périmètre, à confirmer**

Rien n'affiche un produit sur le site public : pas de bloc `productList`, pas de bloc
`addToCart`. Le contrat B est figé et `AGENTS.md` exige une RFC pour ajouter un bloc au
vocabulaire, donc je ne l'ai pas fait de mon propre chef — c'est exactement la règle que
le L10 a déjà respectée en renonçant à son bloc `search`.

**Décision attendue** : soit une RFC pour deux ou trois blocs commerce (et une montée du
contrat B), soit des pages servies par le routeur comme `/search` l'est aujourd'hui.

## 6. `commerce@1.0` n'est délibérément pas figé

Contrairement à A et B, le contrat E ne l'est pas le jour de sa création. C'est un choix
assumé et écrit dans l'ADR : figer un modèle de commerce jamais confronté à une vraie
boutique serait figer des devinettes. Les sites très précoces paieront une migration.

---

## 8. L18 (IA avancée) — ce qui reste ouvert, et pourquoi

Le lot est fait. Ces quatre points ne sont pas des oublis : ce sont des choix
tracés, chacun avec sa raison.

### 8.1 Le driver `pgvector` n'a jamais été exécuté

Même blocage que le point 1 : le moteur Docker de cette machine ne répond pas,
donc `pnpm services:up` n'a pas pu démarrer Postgres. Le driver optimal du
besoin `vector` est écrit et **rejoue la même suite de contrat** que les deux
drivers dégradés (`packages/agents/test/rag/vector/vector-store.contract.ts`,
exécutée par `packages/agents/test/integration/pgvector.test.ts`). Le fichier
d'intégration saute **bruyamment** en nommant la variable manquante.

```bash
pnpm services:up
COGENTA_TEST_POSTGRES_URL=… pnpm -F @cogenta/agents test:integration
```

Le point le plus sensible à vérifier là-bas : `1 - (embedding <=> $1::vector)`
doit rendre exactement la même similarité cosinus que `vectorRank` en mémoire,
sans quoi « changer de driver ne change rien d'observable » cesse d'être vrai.

### 8.2 Aucun adaptateur d'embeddings distant

`embeddings.provider` accepte `local` et `openai` depuis L0 ; seul `local` a un
adaptateur (le hachage local de L4, sans clé ni service). Avec `openai`,
`buildAssistant` **éteint** la recherche sémantique et la détection de doublon
avec un avertissement nommant ce qui manque, plutôt que (a) substituer
silencieusement un autre espace vectoriel — ce qui classerait n'importe quoi —
ou (b) refuser de démarrer pour une fonctionnalité que le site n'utilise
peut-être pas. Écrire l'adaptateur est un travail à part entière (il change la
dimension par défaut, donc impose une réindexation).

### 8.3 Le découpage en chunks est d'une granularité par entrée

`withVectorIndexing` (`packages/cli/src/commands/assistant.ts`) crée **un seul
chunk par entrée**, pas le vrai découpage de `chunkDocument` (L4). Raison
technique, écrite dans le code : `chunkDocument` attend une liste de blocs avec
un drapeau de titre, et `searchDocumentFor` a déjà aplati tout cela en une
chaîne — lui donner la chaîne produirait des frontières de chunk aux mauvais
endroits. Conséquence réelle : la récupération trouve les **bonnes** entrées,
mais en cite plus de texte que nécessaire. Le vrai découpage demande de relire
les blocs de l'entrée directement, ce qui est une tâche en soi.

### 8.4 Le panneau de l'admin ne montre que les outils de rédaction

Le panneau (`packages/admin/src/assist/assistant-panel.tsx`) n'affiche que les
outils dont il peut remplir les entrées : les huit outils d'écriture. `chat`,
`find_duplicates`, `generate_image`, `classify` et `schema_org_draft` demandent
respectivement une question, une portée de site, une invite d'image, une
taxonomie ou un type — aucun de ces champs n'existe dans un panneau de champ
texte. Ils sont **réels et exposés sur `/api/assistant`**, simplement sans
surface d'admin dédiée. C'est exactement le périmètre de la tâche 3 du lot
(« panneau de suggestions IA sur une fiche de contenu — réécriture, correction,
résumé, traduction, génération de meta description/titre/tags/alt text »), pas
un manque : afficher un bouton qui échouerait au clic serait pire.

### 8.5 Ce qui n'est **pas** ouvert

- **Le test d'injection de prompt** : fait, réel, et adversarial —
  `packages/agents/test/assist/chat-injection.test.ts`. L'injection est une
  vraie entrée, réellement indexée, réellement retrouvée par la vraie recherche
  hybride, et le faux fournisseur est réglé pour **obéir entièrement** à
  l'injection. Onze assertions couvrent ce qui se passe quand même : rien.
- **La dégradation sans fournisseur** : fait, en table
  (`packages/agents/test/assist/degradation.test.ts`) et de bout en bout sur un
  vrai serveur (`packages/cli/test/serve-assistant.test.ts`).

## 10. Menus de navigation — le rendu thème n'est pas câblé

Backend (`createMenuStore`/`ensureMenuTables`, `@cogenta/schema`), API
(`createMenuRouter`, `@cogenta/api`, monté sur `/api/menus/*` par
`cogenta serve`) et admin (`packages/admin/src/routes/menus.tsx`) sont faits,
testés et câblés en intégralité — un menu réel se crée, se peuple, se
réordonne et se supprime par les vraies routes, aujourd'hui.

Ce qui manque : **aucune page publique ne montre encore un menu.**
`packages/theme-canonical/src/Base.astro` a des slots pour l'en-tête et le
pied de page, mais rien ne les alimente. Le point d'entrée exact pour le
brancher :

1. Dans `packages/cli/src/commands/theme-render.ts`, avant l'appel à
   `renderPage`, résoudre le ou les menus du site via
   `GET /api/menus/by-name/{name}?locale=` (le même routeur que l'admin
   utilise, pas un second chemin) et passer le résultat au `RenderContext`.
2. `@cogenta/theme-canonical` doit accepter ce menu résolu dans son contexte
   de rendu et le passer aux slots d'en-tête/pied de page de `Base.astro`
   — probablement un nouveau composant `Nav.astro` consommant `items`
   (`label`, `resolvedRoute` ou `url`, `openInNewTab`, la profondeur pour
   l'imbrication).
3. Décider quel(s) nom(s) de menu un thème s'attend à trouver (`main` pour
   l'en-tête semble le choix évident ; un pied de page pourrait en vouloir un
   second) — c'est une convention du thème canonique, pas du contrat D, donc
   aucune ADR requise pour la poser.

Non fait par manque de temps dans cette session, pas par blocage technique :
`resolveEntry` du routeur (résolution d'un item `entry` vers un `label`/`route`
réel) est déjà câblé et testé de bout en bout côté API
(`packages/api/test/rest/menu-router.test.ts`), il ne reste qu'à consommer la
même route depuis le rendu de thème.
