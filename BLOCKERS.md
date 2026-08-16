# BLOCKERS — L14 (sécurité, headless, durcissement production)

Ce fichier note ce que le lot L14 n'a **pas** construit et pourquoi, plus les
constats réels rencontrés en chemin qui appartiennent à un autre lot. Il n'y a
aucun blocage au sens « je ne peux pas avancer » : les quatre tâches du
périmètre confié (1 à 4) sont faites, testées et commitées.

---

## 1. OAuth2 (tâche 6) — délibérément non construit

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
