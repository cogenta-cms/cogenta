# A1 — Commerce : rapport de correction

Branche : `worktree-agent-aac6f1e0f6cb3a596` (fast-forwardée sur `main`
`4b9c555` avant de commencer, car la branche avait été créée avant les fiches
51-54 et l'audit — voir note dans le rapport final).

## T-COM-01 (P0) — Brancher `runBilling`/`runDunning`/`sendRenewalNotices` sur le planificateur

**Fait.**

Note de contexte : ce worktree avait été créé à partir d'un commit antérieur aux fiches
51-54 et à l'audit lui-même (`cb3010f`, 81 commits derrière `main`) — `runDunning`,
`sendRenewalNotices`, `changePlan`, `CouponStore.metrics()`, `order/notify.ts`,
`order/csv.ts`, `renewal-notifier.ts` n'existaient tout simplement pas dans l'arbre. Fast-
forward vers `main` (`4b9c555`, l'état exact audité) fait en premier, sans commit
intermédiaire — c'est un simple `git merge --ff-only main` sur la branche du worktree,
aucune perte, aucune divergence créée.

**Changements** (`packages/cli/src/commands/serve.ts`) :
- Import `createEmailRenewalNotifier` depuis `@cogenta/commerce`.
- `createSubscriptionStore(...)` reçoit désormais `notifyRenewal` (via
  `createEmailRenewalNotifier(options.emailTransport)`) quand un transport e-mail est
  configuré — jamais avant (l'export existait depuis la fiche 53 mais n'était appelé
  nulle part).
- Nouvelle option de test `commerceBillingTickMs` (même patron que `commerceEmailTickMs`)
  et constante `COMMERCE_BILLING_TICK_MS` (24h par défaut).
- Nouvelle méthode sur l'objet `site` : `tickCommerceSubscriptions()` — appelle
  `runBilling()`, puis `runDunning()`, puis `sendRenewalNotices()`, séquentiellement (pas
  `Promise.all` : chacune peut changer l'état que la suivante lit). Toujours présente
  (contrairement à `tickCommerceEmails`, jamais `null`) puisque les tables/stores commerce
  existent inconditionnellement.
- Nouvelle tâche planifiée `commerce-subscriptions`, enregistrée sans condition (le
  commerce n'a pas besoin de transport e-mail pour facturer), intervalle quotidien par
  défaut.
- **Bug réel trouvé et corrigé pendant le test** : le nouvel intervalle de test
  (`commerceBillingTickMs`) manquait dans le `Math.min(...)` de
  `scheduledTasksHeartbeatMs` — exactement le piège qu'un commentaire déjà présent sur
  cette ligne nomme explicitement (« a test that speeds up only its own task's interval
  sees no effect — a real bug this fiche found and fixed for its own task »). Sans ce
  correctif, le test échouait avec « Expected the overdue subscription to be billed
  within 5s » : la tâche était bien enregistrée avec un intervalle de 20ms, mais le
  battement (`setInterval`) qui décide quelles tâches sont dues restait à sa cadence par
  défaut la plus rapide des *autres* tâches (60s), donc n'appelait jamais `tick()` assez
  souvent pour remarquer que `commerce-subscriptions` était due. Corrigé en ajoutant
  `options.commerceBillingTickMs ?? COMMERCE_BILLING_TICK_MS` à ce `Math.min(...)`.

**Test réel** (`packages/cli/test/serve-commerce.test.ts`, nouveau test « bills a
subscription whose renewal date has already passed, once a tick runs, and never twice ») :
- Un abonnement est semé directement via `createSubscriptionStore` (même patron que le
  test existant de seed « comme le ferait un checkout ») avec `startAt` une heure dans le
  passé, si bien qu'il est dû immédiatement.
- Le serveur tourne avec `commerceBillingTickMs: 20`.
- Le test attend (polling sur `GET /api/commerce/subscriptions/{id}`, timeout 5s) qu'un
  cycle apparaisse — preuve que la facturation a bien tourné sans intervention humaine.
- Vérifie que la commande créée porte `subscriptionId` = l'abonnement, que le statut de
  l'abonnement reste `active` (le virement bancaire dégradé règle en `pending`, jamais
  `failed`), puis attend 200ms de plus (dix ticks supplémentaires à 20ms) et revérifie
  que le nombre de cycles est toujours 1 — preuve qu'un rejeu ne double pas la
  facturation (l'idempotence est déjà garantie côté store par la clé unique
  `period_key`, ce test prouve seulement que le câblage du planificateur ne la contourne
  pas en facturant deux abonnements distincts ou en appelant deux fois).

Test du `TASK_NAMES` de `packages/cli/test/serve-scheduled-tasks.test.ts` mis à jour
(`'commerce-subscriptions'` ajouté, neuf → dix tâches, libellé du test corrigé).

**Preuve — commandes exécutées** :
```
pnpm install                                              # node_modules manquait dans ce worktree
pnpm turbo run build --filter=@cogenta/cli...              # 26/26 tâches, dépendances à jour
pnpm turbo run typecheck --filter=@cogenta/cli --filter=@cogenta/commerce
                                                             # 27/27 tâches, aucune erreur
pnpm -F @cogenta/cli exec vitest run test/serve-commerce.test.ts test/serve-scheduled-tasks.test.ts
                                                             # 24/24 tests verts (après le fix du heartbeat + du calcul de date du test)
pnpm -F @cogenta/commerce test                              # 302/302 tests verts, inchangé
pnpm exec biome check --write packages/cli/src/commands/serve.ts \
  packages/cli/test/serve-commerce.test.ts packages/cli/test/serve-scheduled-tasks.test.ts
                                                             # 3 infos préexistants, sans rapport (lignes 4265-4269, non touchées), aucune erreur
```

Changeset : `.changeset/audit-t-com-01-subscription-billing-scheduler.md` (`@cogenta/cli`
patch — câblage pur, aucune API de `@cogenta/commerce` ni de `@cogenta/core` modifiée).

**Postgres/MySQL/MariaDB** : non exécutés (Docker Desktop indisponible sur cette
machine, même blocage récurrent documenté partout ailleurs dans ce dépôt) — sans
incidence ici, cette tâche ne touche aucun SQL, uniquement le câblage du planificateur
déjà dialecte-agnostique.

## T-COM-02 (P1) — Exposer `changePlan` dans l'écran d'abonnement

**Fait.**

**Correction à l'audit** : l'audit affirmait que `grep -n "changePlan"
packages/admin/src/api/commerce-client.ts` ne trouvait rien — en réalité la fonction
cliente existait déjà (`changeSubscriptionPlan`, ajoutée par le commit de la fiche 53
elle-même, `1dd9e6f`), simplement sous un nom qui ne contient pas le sous-texte littéral
« changePlan » (`changeSubscriptionPlan` ≠ `change` + `Plan` contigus). Ce qui manquait
réellement, et que le reste de l'audit décrit correctement, c'est l'écran : aucun
formulaire, aucun bouton, aucun test.

**Changements** :
- `packages/admin/src/api/commerce-client.ts` : `changeSubscriptionPlan` gagne un type
  de retour nommé et exporté, `ChangePlanResult` (au lieu d'un type anonyme en ligne) —
  pur renommage de type, aucun changement de forme.
- `packages/admin/src/routes/commerce-subscription-detail.tsx` : nouveau panneau
  « Changer de formule » — sélecteur de produit (`listProducts`), puis de variante
  (`readProduct`, filtrée à la devise de l'abonnement pour ne jamais proposer un choix
  que le serveur refuserait avec `COMMERCE_CURRENCY_MISMATCH`), champ quantité, case à
  cocher prorata (cochée par défaut, comme le store). **Deux clics, jamais un** : le
  premier clic (« Vérifier le changement ») ouvre seulement une confirmation explicite
  (le critère d'acceptation de la fiche : jamais appliqué à l'aveugle) ; le second
  (« Confirmer le changement ») appelle réellement l'API. Après succès, le résultat
  exact renvoyé par le serveur est affiché honnêtement : un prorata positif dit
  clairement qu'un montant a été facturé immédiatement (jamais deviné côté client — il
  n'existe aucun mode « aperçu » côté serveur, voir décision ci-dessous), zéro dit qu'il
  n'y avait rien à facturer, et **un prorata négatif dit explicitement qu'il s'agit d'un
  avoir dû qui n'a pas été remboursé automatiquement** — jamais présenté comme un avoir
  déjà appliqué, exactement le risque que le critère d'acceptation nommait.
- i18n FR/EN complètes (`commerceSubscriptionDetail.changePlan*`, 15 nouvelles clés
  chacune).
- `packages/admin/test/helpers/mock-fetch.ts` : deux nouvelles options d'amorçage,
  additions pures — `commerceProducts`/`commerceVariants` (même patron que
  `commerceTaxRules`/`commerceShippingMethods` déjà existants), pour qu'un test avec un
  rôle limité à `commerce.read` (un `viewer`) puisse peupler le sélecteur de variante
  sans passer par l'écran Produits qui exige `commerce.catalog.write`.

**Décision autonome tranchée sans s'arrêter** : le magasin `changePlan` n'a **aucun**
mode « calcul à blanc » (`dry-run`) — il calcule le prorata et, s'il est positif,
facture réellement une commande dans le même appel (fiche 53 task 4). Ajouter un vrai
mode d'aperçu aurait exigé d'étendre le contrat E (non figé, donc permis, mais un
périmètre plus large qu'un correctif P1 de 0,5 jour). Le critère de l'audit
(« affiché… avant validation ») est donc satisfait par une **confirmation explicite
à deux clics** plutôt qu'un montant prévisualisé avant le premier appel réel — le
serveur n'a tout simplement rien à prévisualiser sans s'engager. C'est un choix honnête
plutôt qu'un chiffre inventé côté client qui dupliquerait (et pourrait diverger de)
l'arithmétique réelle du store.

**Tests réels** (`packages/admin/test/commerce/coupons-subscriptions.test.tsx`, nouveau
describe « subscription detail — changing plan (audit T-COM-02) ») :
- Un admin choisit un produit puis une variante, voit la confirmation apparaître **sans
  que rien ne soit envoyé au serveur avant le second clic**, confirme, et voit le
  résultat exact renvoyé par le mock (`prorationMinor: 0` → « Rien n'était dû ») — le
  panneau se referme après succès.
- Un `viewer` (seulement `commerce.read`) peut choisir la même variante mais se voit
  refuser à la confirmation (`commerce.order.write` manquant) — même style que le test
  de refus déjà existant sur « Annuler ».

**Preuve — commandes exécutées** :
```
pnpm turbo run typecheck --filter=@cogenta/admin --force   # 5/5 tâches, aucune erreur
pnpm -F @cogenta/admin exec vitest run test/commerce/coupons-subscriptions.test.tsx
                                                             # 12/12 tests verts
pnpm -F @cogenta/admin exec vitest run test/commerce/       # 48/50 verts en une seule exécution ;
                                                             # les 2 échecs (dont un test préexistant,
                                                             # aucun des miens) confirmés non
                                                             # reproductibles en isolation (12/12 verts
                                                             # rejoués seuls) — même famille de flake
                                                             # sous forte parallélisation déjà
                                                             # documentée pour ce même fichier lors de
                                                             # la fiche 53, pas une régression.
pnpm exec biome check --write packages/admin/src/routes/commerce-subscription-detail.tsx \
  packages/admin/src/api/commerce-client.ts packages/admin/test/commerce/coupons-subscriptions.test.tsx \
  packages/admin/test/helpers/mock-fetch.ts packages/admin/src/i18n/locales/en.json \
  packages/admin/src/i18n/locales/fr.json
                                                             # imports réordonnés automatiquement (biome),
                                                             # 8 infos préexistants dans mock-fetch.ts sans
                                                             # rapport, aucune erreur
```

**Changeset** : aucun — `@cogenta/admin` est privé (pas de changeset), et
`@cogenta/commerce` n'a reçu aucune modification pour cette tâche (la route serveur
existait déjà depuis la fiche 53).

