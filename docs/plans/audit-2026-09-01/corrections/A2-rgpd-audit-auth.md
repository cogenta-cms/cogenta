# A2 — RGPD, journal d'audit, authentification

Agent de correction pour la vague `audit-2026-09-01`. Périmètre : `packages/auth/**`,
routeurs utilisateurs/clés API/audit de `packages/api`, `packages/export` (lecture),
écrans `users`/`profile`/`api-keys`/`audit` de `packages/admin`, insertions minimales
dans `packages/cli/src/commands/serve.ts`.

## Tâche 1 — P0 export RGPD (T09-04 / 11-exploitation.md T02)

**Fait.** `exportPersonalData` (`@cogenta/export`) avait zéro appelant dans tout le
dépôt. Ajouté :

- `GET /api/users/{id}/personal-data` (`packages/api/src/rest/users-router.ts`) :
  self-or-admin (`requireSelfOrAdmin`, même règle que `GET /{id}`), assemble compte +
  contenu rédigé (via `storeFor`, nouveau champ optionnel de `UsersRouterOptions`) +
  `gaps` honnêtes (commentaires/formulaires/commerce absents). L'export journalise
  lui-même (`user.personal_data_export`, `diff: { subjectEmail, self }`).
- `packages/api/package.json` : nouvelle dépendance directe `@cogenta/export` (R9 :
  réutilisation d'une fonction déjà écrite et testée, pas une nouvelle implémentation).
- `packages/cli/src/commands/serve.ts` : `storeFor` câblé dans `createUsersRouter(...)`
  (insertion minimale, une ligne).
- `packages/admin/src/api/users-client.ts` : `fetchPersonalDataExport` + type local
  `PersonalDataExport` (miroir du type serveur, pas de nouvelle dépendance vers
  `@cogenta/export` côté admin).
- `packages/admin/src/routes/profile.tsx` : bouton « Exporter mes données
  personnelles » (tout rôle, ses propres données), téléchargement JSON par
  `Blob`+`<a download>` (même patron que `downloadRecoveryCodes`).
- `packages/admin/src/routes/users.tsx` : action « Exporter les données personnelles de
  {{email}} » par ligne de compte (admin seulement, tiers).
- i18n `profile.*`/`users.*` (FR+EN).

**Preuve** :
- `pnpm -F @cogenta/api exec vitest run test/rest/users-router.test.ts` → **100/100**
  verts, dont 7 nouveaux tests dans `describe('GET /api/users/{id}/personal-data …')` :
  self-export avec contenu, export par un admin pour un tiers, refus non-admin, refus
  anonyme, absence de fuite de mot de passe haché, entrée d'audit journalisée, 404 pour
  un id inconnu.
- `pnpm -F @cogenta/admin exec vitest run test/users/profile.test.tsx
  test/users/users.test.tsx` → **38/38** verts, dont 2 nouveaux tests (téléchargement
  JSON pour soi-même, téléchargement JSON par un admin pour un tiers — assertions sur
  `URL.createObjectURL`/type de blob).
- `pnpm -F @cogenta/api typecheck`, `pnpm -F @cogenta/cli typecheck`,
  `pnpm -F @cogenta/admin typecheck` : tous verts.
- `pnpm -F @cogenta/cli exec vitest run test/serve.test.ts` → 23/23 verts (aucune
  régression sur le test existant d'audit `user.create`/`user.update`).

## Tâche 2 — P1 câblage de `AuditLog.prune()` (T09-01)

**Fait.** `AuditLog.prune()` (`@cogenta/auth`, fiche 21 tâche 5) n'avait aucun appelant
planifié.

- `packages/core/src/config/schema.ts`/`types.ts`/`resolve-config.ts` : nouveau champ
  `security.audit.retainDays` (optionnel — absent = comportement inchangé, aucune
  purge ; `0` = opt-out explicite « jamais » ; positif = fenêtre de rétention en jours).
- `packages/cli/src/commands/serve.ts` : `Site.tickAuditPrune()` (no-op quand
  `retainDays` absent/`0`, sinon `auth.audit.prune(cutoff)` puis journalise la purge
  elle-même — action `audit.prune`, `diff: { retainDays, cutoff, prunedCount }`) ;
  nouvelle tâche planifiée `audit-prune` (quotidienne, `destructive: true`, même
  registre que `audit-integrity`/`trash-purge`) ; `auditPruneTickMs` ajouté au test seam
  et à `scheduledTasksHeartbeatMs` (le bug de la leçon retenue L22 : un override de tick
  oublié dans le `Math.min(...)` — évité ici en le fold dedans dès l'écriture).

**Preuve** :
- `pnpm -F @cogenta/core exec vitest run test/config/resolve-config.test.ts` →
  **76/76** verts, dont 4 nouveaux tests (`retainDays` absent par défaut, valeur
  explicite, `0` accepté comme « jamais », valeur négative refusée).
- `pnpm -F @cogenta/cli exec vitest run test/serve-scheduled-tasks.test.ts` →
  **6/6** verts : `audit-prune` apparaît dans la liste des tâches planifiées (la liste
  figée `TASK_NAMES` a été mise à jour — c'est exactement le bug déjà documenté dans
  `CLAUDE.md` pour une tâche précédente, évité ici en le corrigeant au même endroit) ;
  un run manuel sans configuration ne purge rien (`0 purged`, `R1`) ; un run manuel avec
  `retainDays: 30` n'efface aucune entrée fraîche et la chaîne reste vérifiable
  (`GET /api/audit/verify` → 200).
- **Limite assumée** : la mécanique de suppression réelle et l'intégrité de la chaîne de
  hachage sont déjà prouvées à fond par `packages/auth/test/audit.test.ts`'s
  `describe('AuditLog.prune (fiche 21 task 5)')` (entrées réellement plus vieilles que
  le cutoff, `verify()` après troncature, refus si le segment est déjà altéré) — non
  dupliqué ici. Prouver au niveau `cogenta serve` qu'une entrée *réellement backdatée*
  disparaît demanderait un seam d'horloge (`now`) traversant
  `runServe`→`createAuthStore`→`createAuditLog`, qui n'existe pas aujourd'hui dans le
  harnais de test CLI (`serve-harness.ts`) — hors budget de cette tâche, à ajouter si un
  futur test l'exige.

## Tâche 3 — P2 `Retry-After` sur `AUTH_RATE_LIMITED` (T09-02)

**Fait.** Généralisé plutôt que dupliqué (l'alternative que la fiche elle-même
recommandait) : `errorResponse()` (`packages/api/src/rest/http.ts`) pose désormais un
en-tête `retry-after` (en secondes entières) pour **tout** `CogentaError` dont
`details.retryAfterMs` est un nombre — `AUTH_RATE_LIMITED` (`rate-limit.ts`) en
bénéficie immédiatement, et `FORM_RATE_LIMITED` (fiche 16, même besoin identifié par la
fiche) en bénéficiera sans code supplémentaire s'il adopte un jour la même forme de
`details`. `details` lui-même ne quitte toujours jamais la réponse — seul l'entier
dérivé atteint l'en-tête.

**Preuve** :
- `pnpm -F @cogenta/api exec vitest run test/rest/auth-router.test.ts` → **55/55**
  verts ; le test existant de rate-limit (`forgot-password`, 20 tentatives puis la
  21ᵉ) gagne deux assertions : `retry-after` présent et > 0.
- `pnpm -F @cogenta/api typecheck` vert, y compris le fixture `ops-status-router.test.ts`
  mis à jour pour le nouveau champ `security.audit`.

## Tâche 4 — P2 portée de clé API visible sans survol (T09-03)

**Fait.** `packages/admin/src/routes/api-keys.tsx` : le `title=` (hover uniquement,
inatteignable au clavier/tactile) remplacé par un `<details>`/`<summary>` natif — même
patron déjà utilisé ailleurs dans cet admin (`collection-list.tsx`'s sélecteur de
colonnes, `entry-edit.tsx`'s sections historique/traductions/raccourcis) : accessible
au clavier et au lecteur d'écran sans ARIA, aucun nouveau composant de design system
pour un usage unique (R9). `roleDetail()` inchangé, seule sa présentation a bougé.

**Preuve** :
- `pnpm -F @cogenta/admin exec vitest run test/api-keys/api-keys.test.tsx` →
  **14/14** verts, dont un nouveau test « makes the scope detail reachable by keyboard,
  not only a hover title » : `summary.focus()` + `document.activeElement`, puis
  `fireEvent.click` (équivalent Entrée/Espace sur un `<summary>` natif) ouvre le
  détail et son contenu (`Articles: read`) devient réellement présent/consultable.
- `pnpm -F @cogenta/admin typecheck` vert.

## Tâche 5 — P3 journalisation directe (T09-05), partielle

**Fait pour `users-router.ts`** (les trois cas explicitement listés comme restants par
la fiche) : création de compte (les deux branches — invitation et repli mot de passe
généré), changement de mot de passe, révocation de session écrivent désormais
`auth.audit.record` directement au point de mutation, plutôt que par le sniffing de
chemin HTTP de `cogenta serve` (`recordUserAudit`, désormais **supprimée** — pas
laissée en second écrivain redondant). Chaque migration est accompagnée d'un test
appelant le routeur directement, sans passer par `serve.ts` — donc qui échouerait si
l'appel direct était retiré, puisqu'il n'y a plus de repli.

**Preuve** :
- `pnpm -F @cogenta/api exec vitest run test/rest/users-router.test.ts` → 100/100
  verts, dont 3 nouveaux tests d'audit direct (création de compte, changement de mot de
  passe — vérifie qu'aucun des deux mots de passe n'apparaît dans l'entrée —, révocation
  de session).
- `pnpm -F @cogenta/cli exec vitest run test/serve.test.ts` (23/23) confirme qu'après
  suppression du sniffing, le test de bout en bout existant qui attendait `user.create`
  dans le journal continue de passer — via le nouveau chemin direct uniquement (un
  premier passage avait échoué avant un `pnpm turbo run build --filter=@cogenta/cli...
  --force` : le paquet `@cogenta/api` compilé en `dist/` était périmé après l'édition de
  `users-router.ts`, leçon déjà documentée ailleurs dans ce projet — toujours forcer un
  rebuild après une édition de paquet consommé par `dist/`, jamais se fier au cache).

**Non fait, hors budget de cette vague** : `api-keys-router.ts` (5 mutations —
create/rotate/recover/purge/revoke, avec une subtilité sur l'id sujet d'une rotation) et
`role-permissions-router.ts` continuent de passer par le sniffing de `cogenta serve`
(`recordApiKeyAudit`/`recordRolePermissionAudit`, tous deux inchangés). Le geste est
strictement le même que celui appliqué à `users-router.ts` ci-dessus ; à reprendre dans
un prochain lot budgété pour cela.

## Changesets

- `.changeset/rgpd-personal-data-export.md` (`@cogenta/api`, `@cogenta/core`,
  `@cogenta/cli` — minor) : export RGPD (T09-04), rétention d'audit (T09-01),
  `Retry-After` générique (T09-02).
- `.changeset/audit-direct-writes-users.md` (`@cogenta/api`, `@cogenta/cli` — patch) :
  journalisation directe pour `users-router.ts` (T09-05, partiel).
- `@cogenta/admin` est privé — pas de changeset pour T09-03 (écran uniquement).

## Vérifications globales exécutées

- `pnpm -F @cogenta/api test` (suite complète) → **verte** (76 fichiers, 1218 tests —
  dernier passage après toutes les modifications de cette tâche).
- `pnpm -F @cogenta/core test` (suite complète) → **501/501 verts**.
- `pnpm -F @cogenta/cli exec vitest run test/serve.test.ts
  test/serve-scheduled-tasks.test.ts test/serve-users.test.ts` → voir détail par tâche
  ci-dessus ; `serve-users.test.ts` en cours de vérification finale, résultat ajouté
  ci-dessous si terminé avant la fin de la mission.
- `pnpm -F @cogenta/admin test` (suite complète) → en cours au moment de la rédaction de
  ce paragraphe ; résultat final ajouté ci-dessous.
- `pnpm exec biome check --write` sur chaque fichier touché : aucune erreur nouvelle
  (quelques suggestions `unsafe fix` pré-existantes, sans rapport avec cette tâche,
  laissées intactes par discipline de changement minimal).

## Vérification finale et bug hors périmètre trouvé, non corrigé

- `pnpm -F @cogenta/api test` (suite complète) → **vert** (76 fichiers, 1218 tests).
- `pnpm -F @cogenta/core test` (suite complète) → **501/501 verts**.
- `pnpm -F @cogenta/cli exec vitest run test/serve.test.ts test/serve-scheduled-tasks.test.ts`
  → verts (23/23 puis 6/6 — a nécessité un `pnpm turbo run build --filter=@cogenta/cli...
  --force` après coup : `@cogenta/api` compilé en `dist/` était périmé après l'édition
  tardive de `users-router.ts` pour T09-05, `pnpm -F @cogenta/cli typecheck` seul ne
  l'aurait pas révélé — même leçon que celle déjà documentée dans `CLAUDE.md` pour L22).
- `pnpm -F @cogenta/admin test` (suite complète, 126 fichiers) → 7 fichiers/26 tests en
  échec, mais **aucun des trois fichiers touchés par cette mission** (`profile.test.tsx`,
  `users.test.tsx`, `api-keys.test.tsx` — tous verts isolément, voir tâches 1/4
  ci-dessus) — correspond à la famille de flake déjà documentée abondamment dans
  `CLAUDE.md` pour un `pnpm -F @cogenta/admin test` lancé d'un coup sous forte
  parallélisation (`documentation.test.tsx` notamment, aperçu dans la sortie tronquée).
- `pnpm -F @cogenta/cli exec vitest run test/serve-users.test.ts` → **1 échec réel,
  reproductible en isolation**, signalé ici plutôt que contourné (hors périmètre de
  cette mission — le fichier n'est pas dans le périmètre listé, et le code en cause
  n'a pas été touché par cette tâche) : `anonymizes an account irreversibly, keeps the
  audit log and content attribution coherent` échoue parce que `GET /api/audit` contient
  une entrée `auth.login_failed` avec `diff: { email: 'leaving@example.com' }` — la
  tentative de connexion sur l'ancienne adresse, faite exprès par le test pour prouver
  que l'anonymisation bloque l'accès, se retrouve elle-même journalisée avec l'email
  tapé. Le test vérifie `not.toContain('leaving@example.com')` sur **toutes** les
  entrées, pas seulement celle d'anonymisation, et cette assertion large est ce qui
  révèle la fuite. Ni ce fichier de test ni le code de journalisation
  `auth.login_failed` (bien antérieur à cette mission) n'ont été touchés ici — vérifié
  par `git status`/`git diff`, aucune de mes modifications ne peut expliquer cette
  entrée. **Blocage signalé, non corrigé** : décider si `auth.login_failed` doit cesser
  de porter l'email tapé (régresserait la correction "tentatives de connexion échouées
  non journalisées" faite pendant la passe QA de L24) ou si c'est le test qui doit se
  scoper à l'entrée `user.anonymize` est un choix produit/sécurité qui dépasse le
  périmètre de cette tâche.
