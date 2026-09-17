# BLOCKERS — état vérifié le 2026-09-17

Ce fichier ne liste que ce qui est **réellement bloqué ou réellement ouvert
aujourd'hui**. Chaque point ci-dessous a été revérifié contre le code du dépôt
à cette date ; ce qui ne l'est plus a été retiré et figure en §4 avec sa preuve.

Le texte précédent (25 sections accumulées de L10 à la fiche 46, dont une bonne
moitié périmée) reste dans l'historique git de ce fichier — il n'est pas perdu,
il n'est simplement plus servi comme s'il décrivait le présent.

---

## 1. Ce qui attend un accès que cette machine n'a pas

### 1.1 Postgres / MySQL / MariaDB : aucune suite d'intégration n'a jamais tourné

`docker version` échoue toujours aujourd'hui :

```
request returned 500 Internal Server Error for API route and version
.../v1.56/version, check if the server supports the requested API version
```

Donc `pnpm services:up` ne démarre rien, et **toutes** les suites d'intégration
du dépôt se skippent bruyamment (un `describe.skip` nommant la variable
manquante), jamais silencieusement :

| Paquet | Suites concernées |
|---|---|
| `@cogenta/schema` | contenu, taxonomies, migration `schema@2.0`, recherche, routage/404, permissions de rôle, aperçus d'embed |
| `@cogenta/auth` | réinitialisation de mot de passe, colonnes de session |
| `@cogenta/commerce` | catalogue, commande, coupons/abonnements |
| `@cogenta/forms`, `@cogenta/comments` | tables du paquet |
| `@cogenta/core` | dossiers de médiathèque |
| `@cogenta/agents` | driver `pgvector` |

```bash
pnpm services:up
pnpm -F @cogenta/schema test:integration   # puis auth, commerce, forms, comments, core, agents
```

**Les six points où les dialectes divergent réellement**, à vérifier en
priorité là-bas — le vert SQLite ne prouve rien pour eux :

1. **Le chemin matérialisé des taxonomies** : tout son intérêt est qu'un `like`
   se comporte pareil partout, là où un CTE récursif ne le ferait pas.
2. **La migration `schema@2.0`** : MySQL committe le DDL implicitement, donc un
   échec à mi-parcours y laisse le schéma entre deux états.
3. **`rowsAffected`** : la sûreté du stock (`update … where on_hand >= n`) et
   l'unicité d'usage d'un jeton de réinitialisation (`where used_at is null`) en
   dépendent, et MySQL a son propre avis sur « ligne affectée ».
4. **`int8` rendu en chaîne par `pg`** : tout montant de `@cogenta/commerce` est
   un `bigint` ; `toInt()` existe pour ça et n'a jamais vu Postgres.
5. **Les courses que `{ immediate: true }` masque sur SQLite** : le verrou
   fichier sérialise tout, l'isolation par défaut de Postgres/MySQL non — c'est
   ce que les contrats de concurrence (`role-permission-concurrency.contract.ts`,
   `media-folders`, `NotFoundLogStore`) doivent prouver sur un vrai serveur.
6. **`pgvector`** : `1 - (embedding <=> $1::vector)` doit rendre exactement la
   même similarité que `vectorRank` en mémoire, sinon « changer de driver ne
   change rien d'observable » cesse d'être vrai.

### 1.2 Stripe : aucun bac à sable réel

`packages/commerce/test/integration/stripe.test.ts` attend
`COGENTA_TEST_STRIPE_SECRET_KEY` et refuse toute clé qui ne commence pas par
`sk_test_`. Ce qui est déjà prouvé sans clé : format de fil, mapping des sept
statuts, vérification de signature de webhook (serveur `node:http` réel). Ce que
seule une vraie clé prouve : que Stripe accepte encore ces champs.

Même limite pour le bouton « tester la connexion » de l'écran Paiement.

### 1.3 Hébergement mutualisé cPanel (L9 tâche 13)

`docs/hebergement-mutualise.md` décrit la procédure ; personne ne l'a jouée sur
un vrai cPanel. Accès humain, pas du travail en attente.

### 1.4 Trusted Publisher OIDC — ~~seize paquets à lier à la main~~ **levé**

Cette section affirmait que seize paquets n'avaient jamais reçu leur lien
« Trusted Publisher » sur npmjs.com, et qu'une publication par la CI y échouerait
en 404. **Ce n'est plus vrai, vérifié le 2026-09-17** : la publication de 20 h 38
a publié par OIDC, sans intervention humaine, exactement les paquets que cette
liste nommait —

```
@cogenta/theme-kit  0.7.1   20:42      @cogenta/commerce  0.5.9   20:38
@cogenta/export     0.2.12  20:40      @cogenta/forms     0.2.14  20:39
@cogenta/theme-saas 0.5.7   20:45      (et les neuf autres thèmes)
```

et `analytics`, `observability`, `comments` l'avaient été à 13 h 33 lors de la
publication précédente du même jour. Les trente et un paquets d'une release
passent donc aujourd'hui par la CI seule. À ne plus recopier.

### 1.5 DeepSeek : le compte n'a plus de crédit (constaté le 2026-09-17)

Premier essai réel de l'assistant avec les deux clés enregistrées dans le
playground : DeepSeek répond `402 Insufficient Balance` sur chaque appel, OpenAI
répond normalement. Ce n'est pas un défaut du CMS — l'erreur est nommée et
remontée telle quelle (`PROVIDER_REQUEST_FAILED`, message du fournisseur) — mais
tant que le solde n'est pas rechargé, un site dont l'agent « Cogenta Agent »
préfère `deepseek` verra ses appels échouer **sans basculer** sur le repli
`openai` : la préférence est résolue avant l'appel, pas après son échec.
Décision à prendre (voir §2.6).

### 1.6 Search Console / Bing / IndexNow : jamais confirmés en vrai

La balise `<meta>` de vérification est rendue et testée, mais aucun compte
Search Console réel n'a confirmé qu'un jeton collé y est accepté ; `pingIndexNow`
n'a jamais appelé le vrai `api.indexnow.org` (les tests interceptent `fetch` pour
ce seul hôte). Risque résiduel faible : tout ce qui n'est pas `ok` est déjà
journalisé comme un échec, jamais levé.

---

## 2. Ce qui attend une décision humaine

### 2.1 OAuth2 pour un client tiers : toujours non construit, délibérément

Le lot L14 le conditionnait lui-même à « un vrai besoin headless au-delà des
clés API simples ». Depuis, **la première des trois conditions est remplie** :
les clés API existent (`ApiKeyStore`, `/api/api-keys`, résolution d'acteur
dédiée). Les deux autres ne le sont pas : aucun modèle de portée plus fin qu'un
rôle (il faudrait une ADR), et aucun besoin réel constaté d'agir *au nom d'un
utilisateur* depuis un tiers.

### 2.2 Blocs de vitrine commerce et bloc « formulaire » : une RFC contrat B

Rien n'affiche un produit ni un formulaire depuis le vocabulaire de blocs. Le
contrat B est figé et AGENTS.md exige une RFC. Les deux fiches concernées
(L15 §5, ADR-0026) ont choisi la route dédiée (`/forms/{name}`) plutôt que de
contourner la gouvernance. La RFC reste à ouvrir.

### 2.3 L'e-mail d'une tentative de connexion échouée survit à l'anonymisation

`recordAuthAudit` (`packages/cli/src/commands/serve.ts`) enregistre l'e-mail
tenté verbatim pour **toute** tentative échouée. Un compte anonymisé (fiche 17)
dont l'ancienne adresse est retentée laisse donc une trace en clair dans le
journal — ce que `serve-users.test.ts` détecte (test rouge, reproductible,
antérieur à toute session récente). Décision produit : garder le détail pour la
détection de force brute, ou hacher/omettre l'adresse. Non tranché, donc non
corrigé.

### 2.4 `commerce@1.0` n'est délibérément pas figé

Choix écrit dans l'ADR-0024 : figer un modèle de commerce jamais confronté à une
vraie boutique reviendrait à figer des devinettes.

### 2.5 ADR-0038 à insérer — le tri par une date déclarée

`docs/04-contrats.md` annonce le contrat A en `schema@2.4` « (ADR-0038) » et le
code l'implémente, mais `docs/03-decisions.md` s'arrête à ADR-0037 : ce fichier est
protégé en écriture, donc l'insertion est une action humaine, comme pour ADR-0021,
ADR-0023 et ADR-0029. Le texte exact que le code implémente est dans
`docs/lots/L40-tri-par-date-de-collection.md`, section « ADR à insérer ».

### 2.6 Un fournisseur qui échoue ne bascule pas sur son repli

`preferred`/`fallback` (déclaration d'agent) choisit **avant** l'appel : le repli
sert quand le préféré n'est pas configuré, jamais quand il répond 402, 429 ou
500. Rendre le repli réactif (réessayer une fois sur le fournisseur suivant)
change le coût et la latence d'un appel raté et mérite d'être décidé, pas
improvisé.

---

## 3. Limites réelles encore ouvertes dans le code

### 3.1 Recherche sémantique : embedder local uniquement, un chunk par entrée

`embeddings.provider` accepte `local` et `openai` ; seul `local` a un adaptateur
(hachage, sans clé ni service). Conséquence **constatée en vrai le 2026-09-17** :
une question posée en français sur un contenu anglais ne retrouve rien, alors
que la même question en anglais répond correctement avec ses sources. Et
`withVectorIndexing` crée un seul chunk par entrée (`chunkDocument` attend une
liste de blocs, `searchDocumentFor` a déjà tout aplati), donc une citation est
plus longue que nécessaire.

### 3.2 Aucune route ne reçoit le webhook Stripe entrant

`PaymentStore.handleWebhook` existe et est testé ; ce qui manque est le
branchement HTTP, qui suppose de faire passer le corps **brut** jusqu'à lui — le
lecteur de corps partagé de `cogenta serve` parse tout en JSON. L'écran affiche
l'URL à déclarer chez Stripe avec une note honnête disant qu'aucun événement
n'est reçu.

### 3.3 `cogenta mcp` écrit par un `ContentStore` sans décorateurs

La commande construit son propre `storeFor` minimal : une entrée écrite par MCP
est du vrai contenu, immédiatement lisible, mais n'entre ni dans l'index
plein-texte ni dans l'index vectoriel avant une réindexation. Fusionner les deux
chemins demande de factoriser la construction de `storeFor` d'`assembleSite`.

### 3.4 `mcp_connections` n'a pas de suite trois-bases

Table de registre par instance, même statut que `ensurePluginTables` — SQL écrit
avec les mêmes précautions de dialecte, jamais exécuté ailleurs que sur SQLite.

### 3.5 Deux noms de dossier de médiathèque identiques restent possibles

`MediaFolderStore.create()`/`.move()` vérifient l'unicité parmi les frères par un
select-puis-écrit sous `{ immediate: true }` — une vraie garde sur SQLite, pas
sur Postgres/MySQL. Le corriger demande un index unique portable, donc une
sentinelle non-`null` pour la racine : une migration, pas une requête.

### 3.6 Le plancher de réglage LLM par défaut n'atteint le runtime d'agents qu'à
la prochaine mutation de fournisseur

Les trois réglages `assistant.default*` sont relus à chaque `refresh()` du
registre de fournisseurs, mais rien ne déclenche ce `refresh()` quand seul un
réglage change. **Réduit le 2026-09-17** : l'assistant de rédaction, le
planificateur de site et le générateur de thème résolvent désormais leur
fournisseur (et ces réglages) à chaque appel, donc ils suivent immédiatement ;
seul un agent en cours d'exécution attend encore.

### 3.7 Le corps d'un commentaire est rendu en un seul paragraphe

`renderCommentsSection` rend le texte tel quel : les retours à la ligne d'un
visiteur n'apparaissent pas. `white-space: pre-wrap` côté thème réglerait
l'essentiel sans toucher au HTML.

### 3.8 « Canal » n'est pas une origine distinguable dans le journal d'audit

Une commande entrante par `@cogenta/channels` s'exécute avec les permissions de
l'humain identifié — c'est la règle de sécurité du lot — donc elle atterrit dans
le journal comme une action humaine ordinaire. Distinguer l'origine demanderait
de la porter jusqu'à `RecordAuditInput`.

### 3.9 Limites assumées des lots récents

Cinq limites de cette liste ont été **levées le 2026-09-17** et ne sont donc plus
ici : l'occurrence coupée par une mise en forme et l'annulation groupée (L34), la
vue semaine (L35), les pages de secours au-delà du français et de l'anglais (L36),
l'actualisation d'un aperçu d'embed (L38) et le miroir d'image (L39). Chaque
document de lot porte le détail sous « Limite levée ».

Restent vraies :

- **L34** : pas d'expressions régulières — volontaire (une recherche qu'on ne peut
  pas relire avant d'appliquer ne s'offre pas en masse).
- **L35** : le filtre de date vit au-dessus du magasin (une plage dans
  `ListOptions` serait une modification du contrat A).
- **L16/fiche 43 (page builder)** : l'édition en place ne couvre que les champs
  texte simples, et pas les champs d'un bloc de plugin.
- **L38** : Mastodon exclu **pour raison de sécurité** (une instance par domaine,
  donc une adresse arbitraire à appeler côté serveur : c'est exactement le SSRF que
  la liste fermée d'adresses oEmbed évite) ; résolution d'arrière-plan par
  processus.
- **L39** : pas de rotation à angle libre — elle interpole, exige une couleur de
  fond derrière les coins découverts, et devrait rendre les mêmes pixels sur les
  deux niveaux de driver pour que la suite de contrat reste honnête.
- **L40** : le tri par date déclarée **n'est pas indexable** (l'expression
  `case when … is null` empêche l'usage d'un index sur les quatre moteurs), et
  GraphQL ne l'expose pas (son enum de tri est fermé ; l'ouvrir demanderait un
  enum construit par collection). REST l'expose.

### 3.10 `pnpm test:e2e` est cassé, et dangereux à lancer ici

`package.json` déclare `test:e2e` = `playwright test`, mais **aucun
`playwright.config.*` n'existe dans le dépôt**. Playwright part donc de la racine,
balaie toute l'arborescence et meurt avant d'avoir collecté un seul test — mesuré
le 2026-09-17 : ~3,9 Go de tas tenus pendant ~20 minutes, puis
`FATAL ERROR: Ineffective mark-compacts near heap limit`, en saturant la machine
pendant que d'autres suites tournaient.

Ce n'est pas nouveau, mais cela veut dire que la case « test e2e » de la Définition
de terminé n'est **pas** atteignable par la commande que le dépôt annonce : elle
l'est par les suites `packages/cli/test/serve-*.test.ts`, qui lancent un vrai
serveur HTTP sur une vraie base. À trancher : écrire la configuration manquante, ou
retirer `test:e2e` du `package.json` pour ne plus tendre le piège.

### 3.11 `/tmp` est de la RAM sur cette machine

`findmnt /tmp` : **tmpfs**, 9,4 Go, soit la moitié des 18 Go de RAM. Un `/tmp`
plein fait échouer `createSqliteHandle` (`disk I/O error`), ce qui empêche les
`afterEach` d'effacer leurs répertoires, ce qui remplit `/tmp` davantage. Avant
d'accuser le parallélisme des tests, regarder `df -h /tmp`, et nettoyer :

```bash
find /tmp -maxdepth 1 -name 'cogenta-*' -type d -mmin +60 -exec rm -rf {} +
```

### 3.12 L5 tâche 10 — ce qui reste après la livraison des sept agents

La spécification manquante est écrite (`docs/lots/L5-agents-priorite-2-3.md`) et
les sept agents sont livrés, semés désactivés, avec leurs cœurs déterministes
testés. **Reste ouvert** : le harnais d'évaluation en CI (tâche 2 du même lot) ne
fait pas tourner leurs jeux de cas — les fonctions déterministes sont testées
unitairement, ce qui couvre les faux positifs, mais aucun score comparatif entre
versions de prompt n'existe pour eux.

---

## 4. Levé depuis la dernière rédaction (vérifié le 2026-09-17)

Ces points étaient écrits comme ouverts et ne le sont plus. Ils sont listés avec
leur preuve, pour que personne ne les recopie une fois de plus.

| Ancien point | État réel |
|---|---|
| `ContentStore.unpublish` joignable par aucun transport | `POST /{collection}/{id}/unpublish` existe (`packages/api/src/rest/router.ts`) |
| `ctx.image()` lève toujours, pas de `srcset` réel | Pipeline d'images branché depuis L10 ; les médias d'une page sont préchargés avant le rendu |
| Aucune page publique ne montre un menu | `theme-render.ts` résout les menus par emplacement et les passe au thème |
| `pnpm lint` rouge sur un import inutilisé de `gateway.ts` | L'import est utilisé ; le lint est propre sur ce fichier |
| Aucune purge automatique du journal d'audit | `tickAuditPrune` tourne, bornée par `security.audit.retainDays`, et journalise sa propre exécution |
| Flux RSS/Atom écrits mais non branchés | `/feed.xml` et `/atom.xml` sont servis par `cogenta serve` |
| Le panneau d'admin ne montre que les outils de rédaction | Écrans dédiés pour les doublons, la classification, la FAQ/schema.org, la génération d'images et la discussion |
| Le CMS publié sur npm est impossible à installer | Faux depuis le 2026-09-13 ; la chaîne complète `npm create cogenta` → `cogenta serve` fonctionne |
| Aucun essai contre un vrai fournisseur LLM (L19, L26, L31) | Fait le 2026-09-17 avec les clés de l'utilisateur : assistant (13 outils), chat RAG, génération d'image, superagent, plan de site depuis un cahier des charges, générateur de thème — voir le rapport de session |
| L'assistant ignore les fournisseurs configurés dans l'admin | Corrigé le 2026-09-17 : magasin d'abord, `config.llm` en repli, relu à chaque appel |
