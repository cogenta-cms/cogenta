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

## T-COM-03 (P1) — Recherche et filtres avancés sur la liste des commandes

**Fait, avec un correctif à l'audit.**

**Ce qui existait déjà, contrairement à ce que le travail détaillé de l'audit
supposait** : `OrderStore.list()`/`OrderListOptions` (`packages/commerce/src/order/store.ts`)
avait déjà `search` (référence/e-mail, sous-chaîne insensible à la casse),
`customerId`, `placedFrom`/`placedTo` — le tout réellement en SQL, déjà testé
(`packages/commerce/test/checkout.contract.ts:258-267`). Le routeur admin
(`GET /api/commerce/orders`) lisait déjà `?q=`/`?from=`/`?to=` et les transmettait au
store. Le client admin (`listOrders`) avait déjà un troisième paramètre `q`. **Rien de
tout cela n'était donc à écrire.**

**Ce qui manquait réellement** : l'écran (`commerce-orders.tsx`) appelait
`listOrders(token, statusFilter, undefined, {...})` — le troisième argument, `q`, était
codé en dur à `undefined` : aucune boîte de recherche n'existait, malgré une route et
un client déjà prêts. C'est le seul vrai trou, et le seul critère d'acceptation
explicite de la fiche (« trouver une commande par les quatre derniers caractères de sa
référence ou par l'e-mail du client, sans quitter l'écran »).

**Changements** :
- `packages/admin/src/routes/commerce-orders.tsx` : nouveau champ de recherche
  (`type="search"`), relié à l'état déjà porté par `listOrders`/`exportOrdersCsv`. Total
  de la période affichée ajouté sous la liste (`periodTotals`, `useMemo`, sommé
  côté client à partir des lignes déjà chargées, **aucune route nouvelle** — exactement
  ce que le travail détaillé de l'audit demandait), groupé par devise pour ne jamais
  additionner deux devises en un seul nombre trompeur.
- `packages/admin/src/api/commerce-client.ts` : `exportOrdersCsv` gagne un filtre `q`
  optionnel (jusqu'ici l'export ignorait totalement la recherche — une recherche qui
  réduisait l'écran à trois commandes exportait quand même tout le magasin).
- `packages/commerce/src/admin/router.ts` : `GET /orders/export.csv` lit désormais
  `?q=` lui aussi et le transmet à `orders.list({ search })`, exactement comme
  `GET /orders` le fait déjà juste au-dessus dans le même fichier.
- `packages/admin/test/helpers/mock-fetch.ts` : le mock `GET /orders` filtre
  maintenant par `q` (référence/e-mail), pour que l'écran ait quelque chose de réel à
  filtrer dans un test — pur ajout, `status`/`from`/`to` inchangés.

**Décision autonome tranchée sans s'arrêter** : `customerId` (déjà dans le store) et
`paymentMethod` (n'existe nulle part — le mode de paiement vit sur `Payment`, une
table séparée liée par `orderId`, jamais sur `Order` lui-même) n'ont **pas** été ajoutés
comme filtres d'écran. Le seul critère d'acceptation explicite de la fiche porte sur la
référence/l'e-mail, déjà couvert ; un filtre par mode de paiement exigerait une
jointure ou une deuxième requête que rien dans l'audit ne justifie pour un correctif
P1 d'un jour — hors périmètre assumé, pas oublié.

**Tests réels** :
- `packages/commerce/test/fiche-52-export-filters.test.ts` (nouveau test) : l'export
  ne contient que les commandes correspondant à `?q=`, la même chose que
  `GET /orders` fait déjà — deux commandes seedées à des dates différentes, l'export
  filtré ne contient que l'e-mail de la commande recherchée.
- `packages/admin/test/commerce/commerce.test.tsx` (nouveau test dans « the order list
  and detail ») : crée une deuxième commande via le flux manuel existant de l'écran,
  vérifie que les deux apparaissent, tape un terme de recherche, vérifie qu'une seule
  reste visible — et que le total de la période s'affiche. Note technique : le premier
  `findByText` après création de la commande manuelle a montré une vraie instabilité de
  minuterie sous forte charge de cette machine (imports de test à 40-95 s observés
  pendant le débogage) — passée de manière non déterministe avec le délai par défaut de
  1000 ms de Testing Library ; portée à `{ timeout: 3000 }`, avec quoi le test passe de
  façon répétée en isolation et dans le fichier complet. Ce n'est pas un bug de logique
  (la même exécution, avec juste plus de temps accordé, réussit systématiquement) —
  même famille de flake sous charge déjà abondamment documentée dans ce dépôt pour
  d'autres suites `test/commerce/`.

**Preuve — commandes exécutées** :
```
pnpm turbo run typecheck --filter=@cogenta/commerce --filter=@cogenta/admin
                                                             # 8/8 tâches, aucune erreur
pnpm -F @cogenta/commerce exec vitest run test/fiche-52-export-filters.test.ts
                                                             # 5/5 tests verts
pnpm -F @cogenta/commerce test                              # 302 verts + 1 échec (payment-stripe.test.ts,
                                                             # jamais touché par cette tâche), reconfirmé
                                                             # non reproductible en isolation (30/30 verts) —
                                                             # même famille de flake, pas une régression
pnpm -F @cogenta/admin exec vitest run test/commerce/commerce.test.tsx \
  test/commerce/coupons-subscriptions.test.tsx              # 18/18 tests verts (exécution propre)
pnpm exec biome check --write packages/commerce/src/admin/router.ts \
  packages/commerce/test/fiche-52-export-filters.test.ts packages/admin/src/routes/commerce-orders.tsx \
  packages/admin/src/api/commerce-client.ts packages/admin/test/commerce/commerce.test.tsx \
  packages/admin/test/helpers/mock-fetch.ts packages/admin/src/i18n/locales/en.json \
  packages/admin/src/i18n/locales/fr.json
                                                             # 8 infos préexistants dans mock-fetch.ts sans
                                                             # rapport (mêmes lignes que T-COM-01/02), aucune
                                                             # erreur
```

**Changeset** : `.changeset/audit-t-com-03-order-search-filter.md` (`@cogenta/commerce`
patch — `GET /orders/export.csv` gagne `?q=`, aucun changement de forme de
`OrderListOptions`).

## P1 — Tests admin pour `commerce-customer-detail.tsx` (export/anonymisation RGPD)

**Fait.**

**Constat de l'audit confirmé** : 221 lignes d'écran (fiche/export/anonymisation) sans
aucun test admin — pour une action irréversible (anonymisation), un vrai risque.
Aucune modification de l'écran lui-même n'était nécessaire : les routes serveur, le
client (`readCustomer`/`exportCustomer`/`anonymizeCustomer`) et les routes mockées
existaient déjà en entier.

**Nouveau fichier** : `packages/admin/test/commerce/commerce-customer-detail.test.tsx`,
cinq tests :
- La fiche affiche les champs agrégés côté serveur (total dépensé, section
  Commandes) sans les recalculer.
- L'export déclenche un vrai téléchargement JSON (`URL.createObjectURL` espionné,
  appelé une fois).
- L'anonymisation **n'agit qu'après une confirmation réelle**
  (`window.confirm` espionné) — le texte affiché après succès et l'e-mail anonymisé
  apparaissent bien ensuite.
- **Refuser la confirmation n'anonymise rien** — ni le message de succès, ni l'e-mail
  anonymisé n'apparaissent.
- Un rôle sans `commerce.order.write` (`viewer`, qui n'a que `commerce.read`) ne voit
  **aucun** bouton Exporter/Anonymiser — courtoisie côté client, la vraie porte
  restant côté serveur (R4), déjà vérifiée par les routes mockées
  (`commerceRefused('commerce.order.write')` pour l'anonymisation,
  `commerceRefused('commerce.read')` pour l'export/la lecture).

**Bug de test trouvé et corrigé pendant l'écriture** (pas dans le code de production) :
ma première version supposait le client seed sans nom (`customer.name` `null`), donc un
lien/titre affichant l'e-mail — en réalité `mockCustomers[0].name` vaut `'Shopper One'`
dans `mock-fetch.ts`, donc le lien de la liste et le titre H1 de la fiche affichent le
nom, l'e-mail restant une ligne séparée en dessous. Corrigé en relisant le seed avant de
réécrire les assertions.

**Preuve — commandes exécutées** :
```
pnpm turbo run typecheck --filter=@cogenta/admin --force   # 5/5 tâches, aucune erreur
pnpm -F @cogenta/admin exec vitest run test/commerce/commerce-customer-detail.test.tsx
                                                             # 5/5 tests verts
pnpm exec biome check --write packages/admin/test/commerce/commerce-customer-detail.test.tsx
                                                             # aucune erreur, aucun fix nécessaire
```

**Changeset** : aucun — nouveau fichier de test uniquement, `@cogenta/admin` est privé.

## P2 — Déclenchement automatique de `abandon()` pour les paniers inactifs

**Fait.**

**Constat confirmé** : `CartStore.abandon(cartId)` existe depuis la fiche 32 mais rien
ne l'appelait jamais automatiquement — un panier ouvert restait `status: 'open'` pour
toujours, même des semaines après que le client a disparu. Sans conséquence pratique
aujourd'hui (aucun pont vitrine n'existe, donc aucun vrai panier public n'est créé —
`BLOCKERS.md`), mais un vrai trou une fois T-COM-04 livrée, exactement comme l'audit le
notait.

**Changements** :
- `packages/commerce/src/cart/store.ts` : nouvelle méthode
  `abandonInactive(options?: { olderThanMs?: number })` sur `CartStore` — un seul
  `UPDATE ... where status = 'open' and updated_at <= seuil` gardé, la même discipline
  `rowsAffected`-driven que `takeStock`/`CouponStore.redeem` dans ce même paquet.
  Nouvelle constante exportée `DEFAULT_CART_ABANDON_MS` (24h). Additif : `abandon()`
  (par id) reste inchangé, `abandonInactive()` est sa sœur en masse pour un
  planificateur.
- `packages/cli/src/commands/serve.ts` : nouvelle tâche planifiée `commerce-carts`
  (toujours enregistrée, même raisonnement que `commerce-subscriptions` — pas besoin de
  transport e-mail), cadence horaire par défaut (`CART_ABANDON_TICK_MS`), avec les
  options de test `cartAbandonTickMs`/`cartAbandonAfterMs` (ce dernier permettant aussi
  à un opérateur de choisir sa propre définition de « abandonné »). **Le nouvel
  intervalle de test a été ajouté au `Math.min(...)` de `scheduledTasksHeartbeatMs`**
  dès l'écriture — la leçon retenue de T-COM-01 — pas de bug à corriger cette fois.

**Tests réels** :
- `packages/commerce/test/cart-abandon.test.ts` (nouveau, 4 tests, store direct) :
  seul le panier resté inactif au-delà du seuil est marqué abandonné, un panier récent
  reste `open` ; un panier déjà `ordered` ou déjà `abandoned` n'est jamais retouché ; un
  rejeu avant qu'un autre panier ne devienne inactif ne trouve rien de nouveau
  (idempotence) ; le seuil par défaut de 24h fonctionne sans option.
- `packages/cli/test/serve-commerce.test.ts` (nouveau test bout en bout) : preuve que
  la tâche planifiée `commerce-carts` marque réellement un panier périmé comme
  abandonné après un tick, sans qu'aucun humain n'appelle quoi que ce soit, et laisse
  un panier récent intact. Comme aucune route HTTP n'existe pour un panier (aucune
  vitrine — même constat que l'audit), le test sème et relit le panier directement via
  le vrai store, la même astuce déjà prise par `seedPaidOrder` plus haut dans ce
  fichier.
- `packages/cli/test/serve-scheduled-tasks.test.ts` : `TASK_NAMES` mis à jour
  (`'commerce-carts'` ajouté, dix → onze tâches, libellé du test corrigé).

**Preuve — commandes exécutées** :
```
pnpm turbo run typecheck --filter=@cogenta/cli --filter=@cogenta/commerce --force
                                                             # 27/27 tâches, aucune erreur
pnpm -F @cogenta/commerce exec vitest run test/cart-abandon.test.ts
                                                             # 4/4 tests verts
pnpm -F @cogenta/commerce test                              # 307/307 tests verts (aucun échec cette fois,
                                                             # y compris le flake payment-stripe.test.ts déjà
                                                             # documenté plus haut)
pnpm -F @cogenta/cli exec vitest run test/serve-commerce.test.ts test/serve-scheduled-tasks.test.ts
                                                             # 25/25 tests verts
pnpm exec biome check --write packages/commerce/src/cart/store.ts packages/commerce/src/index.ts \
  packages/commerce/test/cart-abandon.test.ts packages/cli/src/commands/serve.ts \
  packages/cli/test/serve-commerce.test.ts packages/cli/test/serve-scheduled-tasks.test.ts
                                                             # 1 avertissement réel (variable `server` non
                                                             # utilisée dans mon propre nouveau test) — corrigé
                                                             # en ne liant plus le retour de startServer ;
                                                             # infos restants préexistants et sans rapport
```

**Changeset** : `.changeset/audit-a1-commerce-cart-abandon.md` (`@cogenta/commerce`
minor — nouvelle méthode additive `abandonInactive` + `DEFAULT_CART_ABANDON_MS` exportée
; `@cogenta/cli` patch — câblage pur du planificateur).

---

## Synthèse — mission A1 (commerce)

Toutes les tâches de la mission sont **faites** : T-COM-01 (P0), T-COM-02 (P1),
T-COM-03 (P1), le test admin `commerce-customer-detail.tsx` (P1), et l'abandon
automatique de panier (P2). Cinq commits, un par tâche, sur la branche
`worktree-agent-aac6f1e0f6cb3a596`. T-COM-04 (le pont vitrine, 10-15 jours, exige une
ADR tranchée avant tout code) reste explicitement hors périmètre de cette mission, comme
prévu par l'audit lui-même — c'est son propre chantier.

**Un correctif à l'audit, dans les deux sens** : T-COM-01 et le constat P0 « aucun
pont vitrine » étaient exacts et confirmés par le code. En revanche, T-COM-02
(`changeSubscriptionPlan` existait déjà côté client sous un nom différent) et T-COM-03
(`OrderStore.list` avait déjà `search`/`customerId`/dates, le routeur les lisait déjà)
étaient partiellement inexacts sur ce qui existait déjà — dans les deux cas le vrai
trou (l'écran, pas le câblage serveur) était néanmoins bien réel et corrigé.


