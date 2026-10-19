# BLOCKERS — état documentaire actualisé le 2026-10-19

Les résultats ci-dessous distinguent les constats historiques, les corrections
vérifiées et les limites encore ouvertes. Cette mise à jour ne certifie pas que
l'ensemble du produit est prêt pour la production : le [suivi des 43 constats de
la recette du 3 octobre](docs/qa/remediation-2026-10-03/tracking.json) porte leur
validation individuelle. Le [rapport initial](docs/qa/audit-2026-10-03/README.md)
et ses preuves restent conservés sans modification.

Les points sans nouvelle preuve gardent leur date de constat ou leur limite
explicite. Les anciennes listes restent également consultables dans l'historique
git de ce fichier.

---

## 1. Validations d’environnement et accès externes

### 1.1 PostgreSQL / MySQL / MariaDB, Redis et S3 : les suites réelles tournent

Rejoué le **2026-10-19** sur la branche d'audit, services lancés par
`pnpm services:up` (PostgreSQL 17 + pgvector, MySQL 8.4, MariaDB 11.8,
Redis 7, MinIO), paquet par paquet : **29 paquets, 0 échec**. Les tests ont
utilisé les vrais serveurs ; aucun mock de base ne les remplace.

| Paquet | Tests d'intégration réussis |
|---|---:|
| `@cogenta/core` | 470 |
| `@cogenta/schema` | 627 |
| `@cogenta/commerce` | 159 (+ 1 sauté : Stripe, voir 1.2) |
| `@cogenta/forms` | 93 |
| `@cogenta/auth` | 48 |
| `@cogenta/agents` | 36 |
| `@cogenta/widgets` | 21 |
| `@cogenta/api` | 9 |
| `@cogenta/starters` | 9 |
| `@cogenta/import` | 6 |
| `@cogenta/comments` | 3 |
| `@cogenta/analytics` | 2 |
| **Total** | **1 483** |

Changement depuis la campagne du 2026-10-04 (1 334 tests, 4 Redis/S3 sautés) :
les drivers Redis et S3 sont maintenant exercés. MinIO ne publie plus d'image
publique (Docker Hub supprimé, quay.io répond 401), ce qui faisait échouer
**tous** les jobs d'intégration de la CI avant le premier test ;
`docker-compose.test.yml` épingle désormais `pgsty/minio`, build communautaire
du même serveur.

Preuves de la campagne du 2026-10-04, conservées hors git :
`.cogenta/remediation-2026-10-03/integration-all.log`,
`import-integration.log` et `approvals-integration.log` dans le même dossier.
Sources des contrats : [core](packages/core/test/integration/),
[schema](packages/schema/test/integration/),
[commerce](packages/commerce/test/integration/),
[import](packages/import/test/integration/target-preflight.test.ts) et
[approbations](packages/api/test/integration/agent-approvals.test.ts).
Les autres paquets de la table ont leur dossier `test/integration/` correspondant.

Pour rejouer sur des bases **de test** dédiées, renseigner
`COGENTA_TEST_POSTGRES_URL`, `COGENTA_TEST_MYSQL_URL` et
`COGENTA_TEST_MARIADB_URL`, puis :

```bash
corepack pnpm test:integration
corepack pnpm --filter @cogenta/import test:integration
corepack pnpm --filter @cogenta/api exec vitest run --config vitest.integration.config.ts test/integration/agent-approvals.test.ts --maxWorkers=1
```

Les suites créent et suppriment leurs tables : ces URL ne doivent jamais viser
une base de production. `pnpm services:up` reste une possibilité locale, sans
rendre Docker obligatoire pour le CMS.

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
publication précédente du même jour. Cette publication du 2026-09-17 a donc
validé le chemin CI/OIDC des trente et un paquets concernés. À ne plus recopier.

### 1.5 DeepSeek : le manque de crédit était un constat historique

Le **2026-09-17**, DeepSeek répondait `402 Insufficient Balance` lors du premier
essai réel. Le compte a depuis été rechargé. La campagne du **2026-10-03** a
obtenu une réponse valide HTTP 200 avec `deepseek-v4-flash`, ainsi qu'avec OpenAI :
[preuve des appels réels](docs/qa/audit-2026-10-03/exhaustif/evidence/provider-health-real.json).
Il ne faut donc plus présenter ce compte comme actuellement dépourvu de crédit.
Cette preuve datée ne garantit pas le solde futur.

La question du repli après erreur de fournisseur reste distincte du solde et
reste décrite au §2.6 ; cette mise à jour ne change pas son comportement.

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

### 2.3 Vie privée : l'adresse saisie lors d'une connexion échouée reste journalisée

`recordAuthAudit` dans `packages/cli/src/commands/serve.ts` conserve l'adresse
saisie pour un événement `auth.login_failed`. C'est une trace de tentative de
connexion, distincte des données du compte ensuite anonymisé.

Le [test d'anonymisation](packages/cli/test/serve-users.test.ts) ne constitue
**pas un test rouge actuel** : il vérifie l'effacement des données du compte
hors l'événement `auth.login_failed` qu'il provoque lui-même pour démontrer que
les anciens identifiants ne fonctionnent plus. Son commentaire explicite cette
distinction. L'ancienne affirmation de ce fichier sur un échec reproductible
était périmée.

Le choix de vie privée reste explicite : conserver cette adresse pour la
détection des tentatives, avec la politique de rétention du journal, ou décider
de la hacher/omettre. Le test vert ne tranche pas ce choix et cette mise à jour
ne modifie ni la politique ni le code d'audit.

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

## 3. État des branchements et limites du code

### 3.1 Recherche sémantique : embedder local uniquement, un chunk par entrée

`embeddings.provider` accepte `local` et `openai` ; seul `local` a un adaptateur
(hachage, sans clé ni service). Conséquence **constatée en vrai le 2026-09-17** :
une question posée en français sur un contenu anglais ne retrouve rien, alors
que la même question en anglais répond correctement avec ses sources. Et
`withVectorIndexing` crée un seul chunk par entrée (`chunkDocument` attend une
liste de blocs, `searchDocumentFor` a déjà tout aplati), donc une citation est
plus longue que nécessaire.

### 3.2 Webhook de paiement entrant : branchement HTTP corrigé, bac à sable externe restant

Le défaut de branchement est corrigé : `cogenta serve` monte
`POST /api/commerce/payments/webhook` et transmet le corps brut au routeur de
paiement. Les [tests du transport serveur](packages/cli/test/serve-commerce.test.ts),
le [contrat webhook](packages/commerce/test/payment-webhook.contract.ts) et ses
[tests SQL réels](packages/commerce/test/integration/payment-webhook.test.ts)
vérifient la réception, les refus et le traitement avec les drivers disponibles.
La validation avec une vraie clé de bac à sable Stripe reste ouverte (§1.2) ;
le passage de ces tests ne vaut pas certification du fournisseur externe.

### 3.3 Assemblage MCP : dérivés communs et validation humaine

**Corrigé le 2026-10-03** : REST et MCP consomment la même fabrique de magasins
avec index plein-texte, redirections et programmation. Les appels MCP passent
par les décorateurs d'audit et d'autonomie ; le manifeste suit les grants réels,
et la création conserve la locale du site ainsi que l'acteur.

Les mutations non réversibles attendent une décision humaine dans une file
fichier partagée avec `cogenta serve` (`.cogenta/agents-runtime/approvals`).
La décision est immuable et publiée atomiquement ; un appel MCP déconnecté ne
peut pas s'exécuter après validation tardive. Cette partie est levée avec le
branchement de la surface admin de validation. Passer un compte admin ne vaut
jamais validation de l'action.
L'index vectoriel et les callbacks de cycle de vie restent optionnels et
requièrent leur fournisseur/runtime configuré, comme côté HTTP.

### 3.4 `mcp_connections` : couverture SQL dédiée non établie

La campagne SQL globale ne permet pas à elle seule d'affirmer que chaque table
est couverte. Aucune suite dédiée à ce registre par instance n'a été identifiée
lors de cette mise à jour ; cette limite reste ouverte. Son implémentation est
`packages/mcp/src/registry/tables.ts`.

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

### 3.10 Recette navigateur : configuration bornée ajoutée, résultat à suivre

Le défaut constaté le **2026-09-17** (découverte de toute l'arborescence sans
configuration, jusqu'à épuisement du tas) est corrigé dans le dépôt :
[playwright.config.ts](playwright.config.ts) limite la découverte à `tests/e2e`,
utilise un worker et lance un serveur QA isolé avec
[scripts/playwright-server.mjs](scripts/playwright-server.mjs).

`corepack pnpm test:e2e` dispose maintenant d'un périmètre explicite. La recette
navigateur et les mesures Lighthouse des corrections restent à consulter dans
le [suivi des 43 constats](docs/qa/remediation-2026-10-03/tracking.json).
Les tests HTTP `packages/cli/test/serve-*.test.ts` restent utiles mais ne
remplacent pas une mesure de rendu, de clavier ou de largeur dans un navigateur.

### 3.11 `/tmp` est de la RAM sur cette machine

Constat de machine du **2026-09-17** : `findmnt /tmp` indiquait **tmpfs**,
9,4 Go, soit la moitié des 18 Go de RAM. Ce n'est pas une propriété du CMS. Un `/tmp`
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
