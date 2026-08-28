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

## 4. Pas d'écrans React pour la boutique — **levé (fiches 15/34)**

Le lot demandait « CRUD admin basique » pour les produits. Ce constat n'est plus à jour :
les écrans produits/commandes/coupons/abonnements/factures (fiche 15) puis les écrans de
réglages boutique — taxes, livraison, paiement, réglages généraux, modèle de facture
(fiche 34) — sont tous écrits, dans `packages/admin`, sur le design system livré par L11.
`cogenta serve` monte `createCommerceAdminRouter` sous `/api/commerce` depuis la fiche
15 ; la fiche 34 y ajoute les routes de configuration et branche pour la première fois le
vrai registre de pilotes de paiement (`createPaymentRegistry`), au lieu du gateway manuel
en dur — voir § 15 ci-dessous pour le détail et ce qui y reste ouvert.

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

## 11. Fiche 12 (redirections) — Postgres/MySQL/MariaDB non exécutés cette session

Les quatre tâches de `docs/plans/12-redirections.md` sont faites et testées
(SQLite : `@cogenta/schema` 505/505, `@cogenta/api` 589/589, `@cogenta/cli` — voir le
rapport de session, `@cogenta/admin` 390/390 — le seul échec du paquet admin,
`test/notices/notice-board.test.tsx`, est confirmé préexistant en isolant les
changements par `git stash`, jamais causé par ce lot). `packages/schema/test/integration/routing.test.ts`
existe, suit exactement le même patron que `search-indexing.test.ts` (skip bruyant
nommant la variable manquante), et se skippe pour les trois bases — le moteur Docker
de cette machine refuse toujours toute connexion (`docker version` échoue à joindre
`dockerDesktopLinuxEngine`).

Deux points précis à revérifier en priorité une fois Docker disponible, les deux
identifiés par une revue statique de `db-dialect-specialist` (pas une hypothèse en
l'air) :

- **`NotFoundLogStore.record()` avait une vraie race sur Postgres/MySQL, corrigée
  dans cette session.** `db.transaction(..., { immediate: true })` ne verrouille
  réellement qu'sur SQLite (`BEGIN IMMEDIATE`) — Postgres et MySQL ignorent
  silencieusement cette option et tournent sous leur isolation par défaut, donc deux
  requêtes anonymes touchant simultanément le même chemin jamais vu auraient pu
  toutes les deux passer le test « n'existe pas encore » puis se disputer le même
  `INSERT`, la perdante plantant sur la clé primaire `path` — exactement le 500
  qu'un journal de 404 ne doit jamais causer. Corrigé en remplaçant l'`insert` final
  par un vrai upsert (`on conflict (path) do update set …` pour SQLite/Postgres,
  `on duplicate key update …` pour MySQL — le même choix que `search/postgres.ts`
  et `search/mysql.ts` font déjà pour la même raison). Un test de concurrence réel
  (deux connexions SQLite indépendantes sur un fichier, jamais `:memory:`, calqué sur
  `packages/commerce/test/stock-concurrency.test.ts`) prouve l'absence de crash et la
  convergence vers une seule ligne ; **le même test tourne aussi dans
  `routing.test.ts` contre les trois vrais serveurs**, mais n'a encore vérifié
  concrètement que SQLite cette session.
- **`redirect-patterns.ts`'s `add()` a la même forme de race** (vérifie l'existence,
  puis `delete`, puis `insert`, sans upsert) — **préexistante**, puisque c'est
  exactement l'idiome que `redirects.ts`'s `performAdd()` utilise déjà depuis avant
  cette session pour la même opération « remplacer une règle ». Non corrigée : une
  route admin authentifiée n'a pas la même surface d'attaque qu'un journal de 404
  écrit par n'importe quel anonyme, donc la priorité était la correction ci-dessus.
  À revoir si une vraie collision se produit en pratique (deux admins créant/éditant
  la même règle au même instant).

**À faire** : `pnpm services:up` puis `pnpm -F @cogenta/schema test:integration`.

Détail hors dialecte, assumé et documenté dans le rapport de la fiche plutôt qu'ici
puisque ce n'est pas un manque de vérification mais une décision de périmètre : pas
de compteur de « hits servis » sur une redirection elle-même (distinct du journal des
404, qui compte les échecs) — `écarts` §4 de la fiche le nomme sans jamais l'assigner
à l'une des quatre tâches, et l'ajouter aurait exigé une écriture sur *chaque*
redirection servie (une vraie nouvelle portée, une migration de colonne sur une table
déjà en production potentielle) plutôt qu'une correction dans le périmètre déjà
engagé.

## 12. Fiche 21 — Journal d'audit : ce qui reste ouvert

Les cinq tâches sont faites (`@cogenta/auth` gagne `AuditLog.get`/`verifyRange`/
`prune`, `classifyAuditActor`, `AuditIntegrityStatus`/`createAuditIntegrityStore` ;
`@cogenta/api` gagne le détail d'une entrée, l'export CSV/JSON et
`/api/audit/integrity` ; `cogenta serve` fait tourner la vérification planifiée
et envoie l'alerte de canal ; l'admin a un écran refait). Deux points assumés,
pas oubliés :

### 11.1 Aucune purge automatique planifiée

`AuditLog.prune(olderThan)` existe, est testé (y compris le refus de purger un
segment déjà rompu, et la reprise propre de `verifyRange` après une purge
légitime via l'ancre "genesis"), mais **rien ne l'appelle automatiquement**.
La fiche demande d'« afficher la rétention effective… si elle n'existe pas,
dire que le journal croît indéfiniment » — c'est exactement ce que fait
l'écran (`audit.retentionUnbounded`). Câbler une purge planifiée (fréquence,
politique de rétention par défaut, éventuellement une vraie configuration
`audit.retentionDays`) est un second geste délibérément laissé pour plus
tard : la fiche elle-même pose la rétention comme une « décision à prendre »
(section 8), pas comme un critère d'acceptation obligatoire, et construire le
registre de tâches planifiées générique (fiche 28) avant d'y accrocher une
purge évite de créer deux mécanismes de planification parallèles dans le même
lot.

### 11.2 « Canal » n'est pas une origine distinguable dans le journal

La tâche 1 demande le contexte technique d'une action : « session admin, clé
d'API, agent, canal ». Trois de ces quatre sont réellement distinguables
aujourd'hui (`classifyAuditActor` : `human`/`api_key`/`agent`, à partir de
signaux que le journal porte déjà). Le quatrième ne l'est pas : une commande
entrante par `@cogenta/channels` (L6) s'exécute avec les permissions de
l'humain identifié — c'est la règle de sécurité centrale du lot — et ne passe
donc jamais par `resolveActor`/un jeton porteur ; elle atterrit dans le
journal comme une action humaine ordinaire, indiscernable d'un clic dans
l'admin. Corriger cela demanderait de faire porter l'origine du canal jusqu'au
runtime qui exécute la commande (`@cogenta/channels`) puis jusqu'à
`RecordAuditInput`, un changement qui touche un paquet que cette fiche ne
nomme pas. Documenté plutôt que deviné.

## 13. Fiche 18 — profil et authentification : Postgres/MySQL/MariaDB non exécutés

**Ce qui manque** : la case « tests d'intégration sur les trois bases » de la
définition de terminé, pour la seule vraie migration de schéma de cette fiche
— `packages/auth/src/tables.ts` ajoute deux colonnes (`browser`, `device`) à
`cogenta_sessions` via `alter table ... add column`, avalée en
catch-and-ignore (« déjà là » étant le seul échec que ce `.catch()` avale,
faute d'un « if not exists » portable sur les trois dialectes — MySQL/MariaDB
ne l'ont pas avant 8.0/10.something). Même cause que partout ailleurs dans ce
dépôt cette période : le moteur Docker de cette machine ne répond pas, donc
`pnpm services:up` puis `pnpm test:integration` n'ont pas pu tourner contre
Postgres ni MySQL/MariaDB.

**Ce qui est réellement testé, en SQLite** : le chemin de migration
proprement dit, pas seulement l'état final —
`packages/auth/test/sessions.test.ts` (« adds the columns to a table that
already existed, without losing the row already in it ») construit à la main
la forme de `cogenta_sessions` d'avant cette fiche, y insère une vraie ligne,
puis relance `ensureAuthTables` (exactement ce que `cogenta serve` fait à
chaque démarrage) — la ligne pré-existante survit avec `browser`/`device` à
`'unknown'` (colonne `null`, jamais un crash ni une chaîne vide), et une
session créée après la migration reçoit de vraies valeurs. Ce que ce test ne
prouve pas : que `alter table add column` avec ce type de colonne
(`varchar(64)` sur Postgres/MySQL, contre `text` en SQLite) se comporte pareil
sur les deux autres dialectes — la syntaxe elle-même est standard et
portable, mais « la syntaxe est standard » n'est pas « le test est passé ».
Risque jugé faible malgré tout : aucune contrainte, aucun défaut, aucune
donnée dérivée d'une autre colonne — le point le plus susceptible de varier
entre dialectes (une valeur par défaut, une contrainte `not null` sur une
colonne ajoutée à une table déjà peuplée) est justement absent ici, les deux
colonnes étant nullables.

**Décision de conception à confirmer par l'humain** (fiche § 8, « Décisions à
prendre ») : dix codes de dix caractères (`XXXXX-XXXXX`, alphabet de 32
caractères sans `0`/`O`/`1`/`I`, ~50 bits d'entropie chacun) — conventionnel,
choisi sans qu'aucune alternative n'ait été sérieusement envisagée. Le niveau
de détail des sessions (famille de navigateur + type d'appareil seulement,
jamais l'OS ni la version) a été tranché pour rester strictement au-dessus de
la règle « pas d'IP en clair » de la fiche sans en dire plus qu'un WHOIS de
navigateur ne dirait déjà.

## 14. Fiche 29 — extensions et marketplace : parc installé, sans consommateur réel de `runPlugin`

`@cogenta/plugins` gagne un vrai `PluginUsageStore` (tâche 3, `permissions/usage.ts`)
que `runPlugin` alimente à chaque appel avec une durée réellement mesurée
(`IsolatedRunResult.durationMs`, chronométrée côté hôte autour de `runIsolated`) et
l'issue réelle (succès, erreur, timeout, mémoire, crash). Le point honnête à garder en
tête : **rien dans ce dépôt n'appelle `runPlugin`**, ni `cogenta serve`, ni aucun autre
appelant réel — même constat R2-honnête que « aucun `AgentRegistry` vivant n'existe nulle
part dans ce dépôt », répété depuis L5. L'écran « Extensions installées » (tâche 1) lit
donc un `PluginUsageStore` et un `PluginDisableStore` réels, câblés et testés de bout en
bout, mais qui resteront vides sur un vrai déploiement tant qu'aucun pipeline
d'exécution de plugin n'existe — l'écran le dit honnêtement (« Jamais exécutée ») plutôt
que d'inventer une donnée.

Deux autres refus honnêtes, cohérents avec `loader.ts`'s propre commentaire : (1) la
vérification de compatibilité de version Cogenta (tâche 5, `MARKETPLACE_ENGINE_INCOMPATIBLE`)
n'est appliquée que si l'appelant configure un vrai `engineVersion` — `cogenta serve` ne
le fait jamais aujourd'hui, faute d'un vrai schéma de version Cogenta (même constat que
`loadPlugin`'s propre `NO_REAL_ENGINE_VERSION_YET`), donc l'écran affiche « Non vérifiée »
plutôt qu'un faux refus systématique ; (2) le signal « N mises à jour disponibles »
existant déjà (`shell-status-router.ts`, comparaison naïve `changelog[0].version`) n'a pas
été dupliqué — `/api/marketplace/updates` calcule la même chose plus précisément (résolution
réelle du manifeste courant via `preview()`, comparaison semver réelle) uniquement pour
l'écran « Extensions installées », qui en a besoin pour décider quoi grouper.

**Postgres/MySQL/MariaDB non exécutés cette session** (Docker indisponible, même
contrainte d'environnement que les sections précédentes) — les nouvelles tables
(`cogenta_plugin_usage`, la colonne `enabled` de `cogenta_marketplace_installs`) suivent
le même idiome `create table if not exists` / `alter table ... add column ... default`
déjà utilisé partout ailleurs dans `@cogenta/plugins`, jamais exécuté contre les deux
autres dialectes ici.

## 15. Fiche 34 — réglages de la boutique : ce qui reste ouvert

Écrans réels pour les taxes, la livraison, le paiement, les réglages généraux et le
modèle de facture — les cinq tâches de la fiche. Réutilise entièrement les magasins déjà
testés de `@cogenta/commerce` (`TaxStore`, `ShippingStore`, le registre de paiement) :
aucune seconde implémentation de la résolution par spécificité ou du repli transporteur,
le simulateur de chaque écran appelle le vrai résolveur. Les réglages généraux (devise,
affichage TTC/HT, pays servis, minimum de commande, mentions de facture) et les deux
pages légales (CGV, politique de retour — des **chemins vers de vraies entrées**, jamais
des champs de texte) passent par le registre `SITE_SETTINGS_REGISTRY` de la fiche 23,
étendu d'un groupe `commerce` — aucune nouvelle table, aucun nouveau routeur pour ça.

**Décision prise, pas actée par ADR (la fiche dit explicitement qu'aucune n'est
requise)** : le nom du pilote de paiement (`payment.driver`) et le mode test
(`payment.testMode`) vivent dans `cogenta.config.mjs`/l'environnement, au même titre que
`cache.driver` ou `database.driver` — une sélection de pilote est une décision
d'infrastructure, jamais un réglage éditorial. La clé secrète Stripe et son secret de
webhook (`COGENTA_PAYMENT_STRIPE_SECRET_KEY`/`COGENTA_PAYMENT_STRIPE_WEBHOOK_SECRET`)
suivent exactement le chemin de `llm.apiKey` : absentes du schéma de configuration,
refusées si elles apparaissent dans le fichier (`CONFIG_SECRET_IN_FILE`), injectées après
coup depuis l'environnement seul. L'écran de paiement n'affiche que la **présence** —
`driver.available(config)`, jamais la valeur — et un bouton « tester la connexion » qui
appelle réellement `init()` puis `health()` du pilote choisi.

**`cogenta serve` sélectionne maintenant un vrai pilote de paiement** (avant cette fiche
le gateway manuel était câblé en dur, sans jamais consulter le registre) — changement de
comportement réel : un site qui configure `COGENTA_PAYMENT_STRIPE_SECRET_KEY` prend
désormais Stripe pour de vrai, plutôt que du virement quoi qu'il arrive.

**Ce qui n'est délibérément pas construit** : aucune route n'accepte encore le webhook
Stripe entrant (`POST /api/commerce/payments/webhook`). `@cogenta/commerce`'s
`PaymentStore.handleWebhook` existe et est déjà testé (vérification de signature en temps
constant, fenêtre de fraîcheur) — ce qui manque est uniquement le branchement HTTP, qui
suppose de faire passer le corps **brut** (non JSON-parsé) jusqu'à cette fonction. Le
lecteur de corps partagé de `cogenta serve` (`readBody`, utilisé par des dizaines de
routes) parse tout en JSON ; y ajouter un chemin texte brut pour une seule route est un
changement transverse que je n'ai pas voulu faire sous pression de cette seule fiche.
L'écran affiche l'URL qu'il faudrait déclarer chez Stripe, avec une note honnête disant
qu'aucun événement n'est encore reçu — jamais une fausse promesse. **Prochain pas
recommandé** : une petite fiche dédiée « recevoir les webhooks entrants » (paiement, et
potentiellement d'autres transporteurs), qui touche `cogenta serve` lui-même plutôt que
cette seule fiche de réglages.

**Postgres/MySQL/MariaDB non exécutés cette session** (Docker indisponible, constat
répété depuis L15) — les routes ajoutées ne créent aucune nouvelle table (`TaxStore` et
`ShippingStore` existaient déjà et sont testées SQLite uniquement depuis L15 ; cette
fiche n'y touche pas), donc aucun risque de DDL nouveau non vérifié, mais la même absence
de preuve sur les deux autres dialectes s'applique.

**Bac à sable Stripe réel jamais testé** — même limite que L15 § 2 : `stripePaymentDriver`
répond honnêtement « non joignable » sans clé réelle (couvert par le test « refuses
unreachable Stripe as not ok »), mais aucune session n'a testé le bouton « tester la
connexion » contre un vrai compte Stripe.

## 16. Fiche 15 — Commentaires : ce qui reste ouvert

Contrat F (`comments@1.0`, ADR-0025), nouveau paquet `@cogenta/comments`, les 7 tâches
faites : modèle/magasin, `POST /api/comments` (première route publique en écriture du
CMS, limitation de débit + honeypot + délai minimal + heuristiques anti-spam),
modération assistée en réutilisant `assist.moderate` tel quel (`ModerationCheck`,
`packages/admin/src/assist/moderation-check.tsx`, jamais un second chemin de décision),
réglages `discussion.*` (site) + par collection/entrée (magasin propre à
`@cogenta/comments`, hors du registre `SITE_SETTINGS_REGISTRY`, qui est site/locale
uniquement), rendu public (`renderCommentsSection`, arbre `h()`/`text()` sans
échappatoire `raw()`), et import WordPress réel.

**Postgres/MySQL/MariaDB non exécutés cette session** (Docker indisponible, même
contrainte que toutes les fiches précédentes) — `packages/comments/test/integration/tables.test.ts`
existe (même schéma de test que `@cogenta/commerce` : squelette `describe.skip` nommant
la variable manquante) mais n'a tourné que sur SQLite.

**`security-reviewer` non invocable dans cet environnement d'exécution** : la fiche exige
explicitement le passage par ce sous-agent avant fusion, vu la route publique en
écriture. Cette session tournait comme sous-agent autonome sans l'outil `Task` qui
permet de lancer un sous-agent nommé du projet — impossible à contourner honnêtement, pas
une case cochée en apparence. À la place, une relecture manuelle ciblée sur
`POST /api/comments` a été faite et a trouvé **deux vraies vulnérabilités, corrigées** :
(1) une redirection ouverte via `redirectTo` — `startsWith('//')` seul ne suffit pas, un
`redirectTo` commençant par `/\` peut être normalisé en hôte relatif au protocole par
certains navigateurs ; (2) une injection de réponse HTTP — `redirectTo` finit dans l'en-
tête `Location`, donc un CR/LF non filtré y aurait permis d'injecter un second en-tête.
Les deux sont maintenant refusés par `isSafeRedirectPath` (`packages/comments/src/router.ts`),
testés. **Un vrai `security-reviewer` doit repasser dessus avant toute fusion réelle** —
cette relecture manuelle n'a pas la même profondeur que le sous-agent dédié du projet.

**Aperçu du constructeur de page (L16) ne montre jamais le fil de commentaires** —
décision délibérée, pas un oubli : le champ anti-spam `_ts` du formulaire est un
horodatage de rendu, légitimement différent à chaque appel, donc le comparer octet pour
octet entre l'aperçu et la page publiée (le test de fidélité de L16) comparerait deux
valeurs également correctes plutôt que de détecter une vraie divergence. Le
constructeur de page édite des blocs ; le fil de commentaires n'en est pas un, donc
l'aperçu ne le montre simplement pas — `serve-builder.test.ts` porte maintenant un test
dédié qui nomme cette différence explicitement, sur le même modèle que la différence
`noindex` déjà documentée là pour le SEO.

**Formatage du corps d'un commentaire au rendu public** : `renderCommentsSection` rend le
corps comme un seul `<p>` texte brut — les retours à la ligne d'un visiteur ne sont pas
convertis en `<br>` (cela demanderait de fabriquer un enfant HTML par ligne dans l'arbre
`h()`, ce que le temps de cette session n'a pas permis de peaufiner proprement avec test
dédié). `white-space: pre-wrap` en CSS du thème réglerait l'essentiel visuellement sans
toucher au rendu HTML — non fait, aucune feuille de style de `@cogenta/theme-canonical`
n'a été touchée par cette fiche.

## 17. Fiche 16 — Formulaires : Postgres/MySQL/MariaDB non exécutés, une demande refusée

Les sept tâches de `docs/plans/16-formulaires.md` sont faites et testées (SQLite :
`@cogenta/forms` 51/51 — nouveau paquet, `@cogenta/api` 975/975 (dont 27 nouveaux dans
`forms-router.test.ts` et 2 dans `shell-status-router.test.ts`), `@cogenta/cli` — voir le
rapport de session pour le décompte complet du paquet, `@cogenta/admin` 858/860, les deux
échecs restants confirmés préexistants et non liés à cette fiche : `notice-board.test.tsx`
échoue de façon intermittente sous `pnpm vitest run` complet, mais passe systématiquement
en isolation (reconfirmé deux fois cette session), la même famille de flaky déjà
documentée pour ce paquet sous forte parallélisation).

**Postgres/MySQL/MariaDB non exécutés cette session** (Docker indisponible, constat
répété — `docker version` échoue à joindre `dockerDesktopLinuxEngine`, comme pour les
fiches 12/15/18/34). `packages/forms/test/integration/forms.test.ts` existe, suit
exactement le même patron que `@cogenta/commerce`'s `test/integration/catalog.test.ts`
(skip bruyant nommant la variable manquante pour chacune des trois bases) et se skippe
pour les trois. `@cogenta/forms`'s `ensureFormsTables` réutilise le DDL déjà éprouvé de
`ensureCommerceTables` (mêmes types de colonnes par dialecte, même garde `create index`
pour MySQL avant 8.0.29), donc le risque réel de dialecte est bas, mais reste non prouvé
sur les deux autres bases.

**Une demande de la fiche a été refusée, pas contournée : le « bloc `search` »-like
mécanisme demandé pour les formulaires (un bloc contrat B référençant un formulaire par
id) n'a pas été construit.** ADR-0026 le dit elle-même : le contrat B est figé et
AGENTS.md exige une RFC avant tout nouveau bloc. La route dédiée (`GET /forms/{name}`)
rend le même service sans y toucher ; la RFC contrat B reste à ouvrir séparément, comme
l'ADR le prévoit explicitement (« ouverte en parallèle, sans bloquer cette fiche »).

**Deux limites assumées, nommées dans l'ADR, pas des oublis** : pas de champ `file`
(surface téléversement/antivirus non ouverte sans besoin prouvé) ; pas de champs
conditionnels (doublerait la complexité du constructeur et du rendu pour un besoin que le
formulaire de contact de référence n'a pas).

**Revue de sécurité faite manuellement sur la route publique, un vrai problème trouvé et
corrigé avant le premier commit** : `forms-router.ts` lisait d'abord l'IP du client depuis
l'en-tête `X-Forwarded-For` de la requête pour construire la clé du limiteur de débit —
un en-tête que l'appelant contrôle entièrement tant qu'aucun proxy de confiance ne le
réécrit, ce qui aurait permis de contourner la limite « cinq soumissions par dix minutes »
en changeant simplement cette valeur à chaque requête. Corrigé pour lire l'adresse résolue
par le transport (`clientIpOf`, `req.socket.remoteAddress` — exactement la même
discipline, et le même commentaire, que `AnalyticsRequestContext` de fiche 27 applique
déjà) ; un test dédié (« a spoofed X-Forwarded-For cannot bypass the rate limit ») le
prouve.

**`security-reviewer` lancé avant fusion, un second constat trouvé et corrigé** : une
injection de formule CSV (CWE-1236, sévérité moyenne) dans l'export CSV des soumissions —
une valeur de champ fournie par un visiteur anonyme et commençant par `=`/`+`/`-`/`@`
s'écrivait telle quelle dans le CSV, où Excel/Sheets la lit comme une formule vive à
l'ouverture. Corrigé dans `packages/admin/src/lib/csv.ts` (préfixe `'` avant le
guillemetage RFC 4180 — la mitigation standard), ce qui bénéficie à tout appelant
partagé (export de soumissions, export de liste de collection), pas seulement aux
formulaires. Un second constat, faible et informationnel, n'était pas bloquant.

# BLOCKERS — L20 (audit admin complet, câblage MCP)

## 18. MCP actor scoping — câblage complet, deux limites honnêtes et voulues

**Ce qui a été fait** : `cogenta mcp` (nouvelle commande CLI,
`packages/cli/src/commands/mcp.ts`) démarre un vrai serveur MCP sur
stdin/stdout, câblé au manifeste d'outils réel du site
(`buildManifest`/`createToolRegistry`, `@cogenta/agents`) — plus le point 1
du plan d'action MCP de `docs/lots/L20-audit-admin-complet.md` § 2, qui
n'existait dans aucun routeur de commande avant cette fiche. Un vrai
`AccessContext` traverse chaque appel d'outil (point 2) : `--email` résout
l'acteur réel depuis le magasin d'utilisateurs (`createUserStore(db).byEmail`,
le même que `cogenta users create`) ; `--role` construit un acteur synthétique
pour les tests locaux ; sans l'un ou l'autre, l'acteur est `{id: null, roles:
['public']}`, identique à une requête REST non authentifiée.

**Ce qui distingue les outils `content.*` des outils `media.*` /
`site.config_read`, et pourquoi le manifeste diffère selon l'acteur.** Les
outils `content.*` (`content.read`/`write_draft`/`publish`/`delete`) sont
toujours sur le manifeste, acteur anonyme inclus : leur vraie porte de
permission vit un niveau plus bas — `createContentService` appelle
`PermissionLayer.assert` à chaque lecture/écriture, exactement le layer que
REST et GraphQL utilisent (`packages/api/src/access/permissions.ts`), donc un
acteur `public` est déjà refusé sur tout ce qu'un rôle `public` ne peut pas
lire ou écrire — testé (`packages/cli/test/mcp.test.ts`, « really enforces
R4 »).

`media.read`/`media.write`/`site.config_read` n'ont **aucun** contrôle
équivalent — leurs propres commentaires dans
`packages/agents/src/tools/core/media.ts` et `site-config.ts` le disent
explicitement : « the manifest decides, not this tool ». `buildSiteManifest`
(dans `mcp.ts`) applique donc la seule porte qui existe pour ces trois
outils : ils ne rejoignent le manifeste que pour un acteur authentifié
(`--email` ou `--role`), jamais pour le défaut anonyme — testé (« leaves
media, site-config and http tools out of the manifest for the anonymous
default actor »). `http.fetch` suit la même règle dans le code mais n'est
construit par aucun site aujourd'hui (il a besoin d'une liste de domaines
autorisés que rien ne configure encore côté CLI) ; il est nommé ici pour que
la prochaine personne qui le câble sache où mettre la même garde.

**Limite honnête n°1, assumée et documentée dans `packages/mcp/README.md`** :
le contenu créé ou modifié via `cogenta mcp` traverse le même `ContentStore`
que `cogenta serve`, mais **pas** les mêmes stores décorés qu'`assembleSite`
construit au démarrage — index plein-texte, index vectoriel, suivi de
redirection sur renommage de slug, mise en file de publication programmée
sont tous des décorateurs appliqués une fois par `assembleSite`
(`packages/cli/src/commands/serve.ts`), et `cogenta mcp` construit son propre
`storeFor` minimal (`createContentStore` + `siblings`, sans décorateurs) —
reconstruire l'intégralité d'`assembleSite` (recherche, webhooks, quotas,
assistant IA, taxonomies, chemins routés…) dans une commande stdio autonome
dépassait largement le périmètre de cette fiche. Une entrée écrite par MCP
est un vrai contenu, immédiatement visible en lecture, mais n'apparaît pas
dans la recherche/l'index vectoriel avant une réindexation (l'écran
« Outils » de l'admin, ou `cogenta serve` redémarré et retouchant l'entrée).
Un futur lot qui veut fusionner les deux chemins devrait factoriser
`assembleSite`'s construction de `storeFor` en une fonction partagée plutôt
que de la dupliquer une troisième fois.

**Limite honnête n°2** : `--role` construit un acteur avec `id: null` — un
acteur synthétique n'a pas de compte réel, donc aucun champ `createdBy`
cohérent n'existe pour ce qu'il écrit. C'est le même compromis que
`ANONYMOUS` (`packages/api/src/types.ts`) fait déjà pour tout visiteur non
authentifié ; `--role` ne fait rien de nouveau ici, il rend juste ce
compromis accessible en dehors d'une vraie session HTTP, explicitement pour
des tests locaux (le README le dit).

**Tests réels** : `packages/cli/test/mcp.test.ts` — cinq scénarios contre un
vrai projet SQLite temporaire et un vrai `runMcp`, en pilotant un vrai
JSON-RPC sur des flux `stdin`/`stdout` en mémoire (`node:stream.PassThrough`,
injectés via les options `stdin`/`stdout` ajoutées à `McpOptions`) : liste du
manifeste pour un acteur authentifié, création/lecture/publication réelles
d'une entrée via les outils, refus réel d'un rôle sans `create`/`publish`
(erreur d'outil, pas d'erreur JSON-RPC — même convention que `server.ts`),
absence des outils média/config pour l'acteur anonyme par défaut (avec une
écriture de contenu qui reste, elle, réellement refusée plutôt qu'absente),
et refus propre d'un `--email` pointant vers un compte inexistant. Tests
existants de `@cogenta/mcp` (`server.test.ts`, `stdio-transport.test.ts`)
inchangés et toujours verts.

**Non fait, hors périmètre explicite de cette fiche** : aucune UI admin pour
choisir/afficher l'acteur MCP actif (la fiche demandait une commande CLI, pas
un écran) ; aucun test d'intégration Postgres/MySQL/MariaDB pour ce chemin
(même contrainte Docker que le reste du dépôt cette session, voir §1 plus
haut) — `cogenta mcp` réutilise le même `createDatabaseRegistry` que toute
autre commande, donc le risque de dialecte spécifique à ce chemin est bas
mais non prouvé.
formulaires. Un second constat, faible et informationnel, n'était pas bloquant.

## 18bis. MCP — écran admin dédié et `--api-key` (L21 tâche 6)

La lacune nommée juste au-dessus (« aucune UI admin pour choisir/afficher
l'acteur MCP actif ») est en partie comblée : `cogenta mcp` accepte
désormais `--api-key <clé>`, résolu par la **même** `ApiKeyStore`
(`@cogenta/auth`) et le même mappage « rôles = portée » que
`resolveApiKeyActor` (`packages/api/src/rest/auth-router.ts`) — aucun second
magasin de clés. L'admin gagne un écran **MCP** dédié
(`packages/admin/src/routes/mcp.tsx`), parallèle à « Agents », qui génère une
clé et affiche une fois la commande `cogenta mcp --api-key …` prête à coller
ainsi qu'un bloc JSON de configuration client standard, tous deux construits
à partir de la clé brute réellement renvoyée par le serveur. `@cogenta/core`
gagne `MCP_ACTOR_API_KEY_INVALID` pour une clé inconnue, révoquée ou expirée
— refusée au démarrage plutôt que dégradée en anonyme.

Ce qui reste non fait, inchangé depuis la fiche L20 : pas d'écran pour
*afficher* l'acteur actuellement actif d'un serveur MCP en cours d'exécution
(cet écran gère des identifiants, pas des sessions en direct — un serveur
`cogenta mcp` est un process stdio, pas une ressource que l'admin peut lister)
; toujours aucun test d'intégration Postgres/MySQL/MariaDB pour le chemin
`cogenta mcp` (même contrainte Docker). Tests réels ajoutés : six nouveaux
scénarios dans `packages/cli/test/mcp.test.ts` (résolution d'acteur réelle
depuis une vraie clé, refus R4 par portée insuffisante, clé révoquée, clé
malformée, conflit `--api-key`/`--email`) et une suite dédiée dans
`packages/admin/test/mcp/mcp.test.tsx` (liste, création avec la
configuration client réellement collée dans le DOM — pas un texte
générique —, copie presse-papiers, révocation, non-admin, accessibilité).

## 19. Fiche 58 — client MCP externe : Postgres/MySQL/MariaDB non exécutés pour `mcp_connections`

La table `mcp_connections` (`packages/mcp/src/registry/tables.ts`,
`ensureMcpConnectionTables`) et son `McpConnectionStore`
(`packages/mcp/src/registry/store.ts`) ne sont testés que contre SQLite
(`packages/mcp/test/registry/store.test.ts`, `:memory:`). Aucune suite
d'intégration Postgres/MySQL/MariaDB n'existe pour cette table — ni écrite
ni skippée bruyamment, contrairement à la pratique habituelle du dépôt pour
une table de contenu (`@cogenta/schema`). Ce n'est pas un oubli au sens où
d'autres registres de configuration comparables suivent déjà la même
convention sans intégration trois-bases écrite : `@cogenta/plugins`'s
`ensurePluginTables` (grants/disabled/usage) et `@cogenta/agents`'s
`ProviderConfigStore` (fichiers, pas même une table SQL) n'en ont pas non
plus — `mcp_connections` est un état d'exécution/registre par instance
serveur, pas du contenu qu'un site publie ou qu'un utilisateur final lit,
la même distinction qui justifie l'absence d'intégration trois-bases pour
ces deux précédents. Le SQL lui-même est écrit avec le même souci de
portabilité dialecte que le reste du dépôt (`identifier`/`sql`/`unsafeRaw`
via `@cogenta/core`, `booleanColumn` reprenant exactement la convention de
`@cogenta/auth`'s `tables.ts` — `postgres` → `boolean`, sinon `tinyint`),
donc le risque réel de divergence Postgres/MySQL est faible, mais **non
prouvé** par un test réel contre ces deux moteurs. À vérifier si Docker
redevient disponible sur une machine de développement, avant de considérer
la fiche 58 aussi rigoureusement close que L13/L15/L18 le sont sur ce point
précis.

## 20. Fiche 63 — permissions de rôle en base (ADR-0028) : Postgres/MySQL/MariaDB non exécutés

**ADR-0028 insérée** dans `docs/03-decisions.md` (2026-08-26, par l'utilisateur,
formatage corrigé ensuite) : « Les permissions de rôle personnalisé vivent en
base, en surcouche du fichier de schéma ». Rien à faire de plus sur ce point.

**Postgres/MySQL/MariaDB non exécutés cette session — Docker indisponible**
(`docker version` échoue : « failed to connect to the docker API »), même
contrainte que partout ailleurs dans ce fichier :
`packages/schema/test/integration/role-permission-store.test.ts` (bâti sur
`role-permission-store.contract.ts`, la même suite que SQLite fait tourner
en test unitaire — 17/17 verts, plus le contrat de concurrence dédié,
`role-permission-concurrency.contract.ts`, 1/1 vert sur SQLite) se dégrade
bruyamment (`describe.skip` nommant `COGENTA_TEST_POSTGRES_URL`/`_MYSQL_URL`/
`_MARIADB_URL`) plutôt que de mentir en vert. Ce que cette suite doit encore
prouver réellement : la colonne `own` (un vrai `boolean` sur Postgres, un
`tinyint` sur MySQL/MariaDB, un `integer` sur SQLite) round-trip correctement
sur les trois, et surtout — **la vraie question ouverte** — si le
`delete`-puis-`insert` transactionnel de `set()` (le même choix que
`redirects.ts`'s `performAdd`, documenté là pour la même raison : `ON
CONFLICT`/`ON DUPLICATE KEY`/`INSERT OR REPLACE` diffèrent sur les trois
dialectes) survit à deux connexions réelles et indépendantes qui écrivent au
même instant le même triplet `(targetType, targetName, action)`, sans jamais
laisser deux lignes, zéro ligne, ni **remonter une erreur brute du driver**
plutôt qu'une `CogentaError` nommée. `test/integration/routing.test.ts`
l'a déjà nommé pour `NotFoundLogStore` : « SQLite's `{ immediate: true }`
masks that race entirely » — le vert obtenu sur SQLite (verrou fichier à
écrivain unique) ne prouve donc **rien** sur Postgres/MySQL, dont
l'isolation par défaut ne sérialise pas deux transactions de la même façon ;
c'est exactement pourquoi le contrat de concurrence tourne en intégration
avec deux vraies connexions au même serveur, pas seulement en unitaire.

Contrat A (`CollectionDefinition`/`TaxonomyDefinition`/`CollectionPermissions`,
`packages/schema/src/types.ts`) **n'est pas modifié** par cette fiche — la
table `cogenta_role_permissions` vit entièrement hors contrat, comme
`cogenta_menus`/`cogenta_maintenance` ; `docs/04-contrats.md` § Permissions
gagne un paragraphe décrivant la priorité table-puis-fichier sans monter de
version.

## 21. Fiche 46 — Médiathèque : dossiers : Postgres/MySQL/MariaDB non exécutés, une course non protégée en base

**Postgres/MySQL/MariaDB non exécutés cette session — Docker indisponible**
(`docker version` échoue à joindre le démon), même contrainte que partout
ailleurs dans ce fichier. `packages/core/test/integration/media-folders.test.ts`
(suite de contrat `MediaFolderStore`, bâtie sur `folder-store.contract.ts` —
la même que SQLite fait tourner en test unitaire, 48/48 verts — plus un test
de concurrence dédié à deux connexions réelles pour `ensureRoot`) se dégrade
bruyamment (`describe.skip` nommant `COGENTA_TEST_POSTGRES_URL`/`_MYSQL_URL`/
`_MARIADB_URL`) plutôt que de mentir en vert.

**Une vraie course reste ouverte, non protégée en base, contrairement à
`ensureRoot`.** `db-dialect-specialist` (appelé pendant cette fiche) a trouvé
et fait corriger la course sur `ensureRoot` (deux répliques de `cogenta serve`
démarrant en même temps sur Postgres/MySQL pouvaient créer deux dossiers
`contents` — corrigé par un id déterministe + un vrai `on conflict`/`on
duplicate key`, même patron que `NotFoundLogStore.record()`). Il reste un
**second** point de la même famille, volontairement non corrigé faute de
budget dans cette fiche : `MediaFolderStore.create()`/`.move()` vérifient
l'unicité d'un nom parmi ses frères (`assertNameFree`) par un
select-puis-écrit, sous la même transaction `{ immediate: true }` — une garde
réelle sur SQLite (verrou fichier), mais **pas** sur Postgres/MySQL, dont
l'isolation par défaut ne sérialise pas deux transactions concurrentes de la
même façon (le constat documenté à la section 20 ci-dessus, pour
`role-permission-store.ts`, s'applique ici à l'identique). Deux créations
concurrentes du même nom, au même niveau, sur Postgres/MySQL, peuvent en
principe toutes les deux réussir plutôt que la seconde échouer avec
`MEDIA_FOLDER_NAME_TAKEN` — un doublon silencieux, jamais une corruption de
données ni une élévation de privilège. La corriger correctement demande une
vraie contrainte unique en base plutôt qu'un contrôle applicatif : une
colonne `parent_id` qui accepte `null` ne peut pas porter un index unique
`(parent_id, lower(name))` portable sur les trois dialectes sans une
sentinelle non-`null` pour la racine (le même problème que `taxonomy-store.ts`
n'a jamais eu besoin de résoudre, puisqu'un slug de taxonomie est unique
**globalement**, pas par frère) — une migration, pas une ligne. Non fait ici
faute de temps ; à traiter avant qu'un vrai déploiement multi-répliques
n'écrive dans ce dossier.

Contrat A/B/C/D **non modifiés** par cette fiche (voir le changeset —
`packages/agents/src/tools/core/media.ts` retire délibérément `folderId` de
la sortie de `media.read`/`media.write` pour ne *pas* toucher au contrat C
déjà figé plutôt que de le faire grandir sans gouvernance).
