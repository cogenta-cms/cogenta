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

