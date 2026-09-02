# A5 — Médiathèque : rapport de correction

Branche : `worktree-agent-aebd910e16b0a2b10`. Suit `docs/plans/audit-2026-09-01/05-mediatheque.md` §6.

## T02 — Casser le cache d'un an après un remplacement de fichier (P0) — FAIT

Commit `86fc9cf`.

- `packages/render/src/images/srcset.ts` (`variantUrl`) : lit désormais `media.version`
  et l'ajoute comme `&v=` sur chaque URL candidate quand présent ; absent, comportement
  inchangé (aucun `&v=`).
- `packages/cli/src/commands/serve.ts` (`loadRenderMedia`) : renseigne
  `version: asset.contentHash` sur chaque `RenderMediaAsset` construit — c'était le seul
  maillon manquant, le champ `version` existait déjà sur le type depuis `theme@1.2` et
  n'était simplement jamais rempli.
- `og:image`/JSON-LD `image` héritent automatiquement du correctif : ils passent par
  `describeMedia`/`variantUrl` avec les mêmes `mediaAssets` peuplés par `loadRenderMedia`,
  aucun code séparé à toucher.
- `docs/04-contrats.md` § Contrat D : `interface MediaReference` documente maintenant le
  champ `version` (optionnel, additif à `theme@1.2`, backward compatible).

**Point honnête sur le critère d'acceptation de l'audit** : le texte demandait que
« l'ancienne query string, si redemandée, serve toujours l'ancien contenu ». Ce n'est
pas ce que fait l'implémentation, et je n'ai pas écrit de test l'affirmant faussement.
`replace()` (`media-router.ts`) supprime bel et bien les anciens fichiers (original et
variantes) après avoir écrit les nouveaux — donc réclamer l'URL exacte d'avant après un
remplacement sert désormais les **nouveaux** octets, pas les anciens, puisque le serveur
relit toujours `asset.storageKey` courant et ignore le paramètre `v` à la lecture. Ce
qui protège réellement un visiteur qui a déjà l'ancienne URL en cache, c'est que son
navigateur/CDN ne la redemande jamais (`Cache-Control: immutable`) — pas une double
copie côté origine. Le test écrit reflète ce mécanisme réel : l'URL change après un
remplacement, et le contenu à la nouvelle URL diffère de celui capturé à l'ancienne
avant le remplacement.

**Preuves** :
- `pnpm -F @cogenta/render exec vitest run images/image.test.ts` → 86/86 verts (2
  nouveaux tests : `v=` présent et absent).
- `pnpm -F @cogenta/render typecheck` → vert (après build de `@cogenta/blocks`/
  `@cogenta/schema`, dépendances manquantes dans ce worktree fraîchement créé).
- `pnpm -F @cogenta/cli exec vitest run serve-images.test.ts` → 7/7 verts (1 nouveau
  test bout en bout : upload → page rendue → URL notée → `replace()` multipart réel →
  page re-rendue → URL différente, `v=` différent, octets différents ; 2 tests
  préexistants ajustés pour la présence du nouveau `&v=`, sans changement de ce qu'ils
  prouvent).
- `pnpm -F @cogenta/cli typecheck` → vert.
- `pnpm exec biome check` sur les fichiers touchés → propre (3 infos préexistantes dans
  `serve.ts`, lignes non touchées par ce commit, non corrigées pour rester localisé).
- Changeset `.changeset/media-cache-bust-version.md` (`@cogenta/render` minor,
  `@cogenta/cli` patch).

## T01 — Upload multipart réel avec progression et parallélisme (P0) — FAIT

Commit `f16df54` (inclut aussi T04, même commit, mêmes fichiers touchés).

- `packages/admin/src/api/media-client.ts` : nouvelle `uploadMediaMultipart(token,
  file, metadata, onProgress)` — `XMLHttpRequest` (seul moyen d'avoir
  `upload.onprogress`, `fetch` n'a pas d'équivalent côté requête), `FormData` réel
  posté sur `POST /api/media` (déjà routé côté serveur vers
  `normaliseMultipartUpload` depuis la fiche 11 — aucun changement serveur
  nécessaire). Envoie `kind` explicitement (comme le faisait toujours le chemin
  JSON) — sans ça, `verifyRealType` côté serveur ne re-sniffe jamais un fichier
  déclaré avec un mauvais type MIME dans la partie multipart, puisqu'il ne le fait
  que pour `kind === 'image'` : un vrai bug de sécurité que j'ai trouvé et corrigé
  en écrivant le test e2e (voir plus bas), pas seulement une omission de style.
  Nouvelle `getMediaLimits()` (`GET /api/media/-/limits`).
- `packages/admin/src/media/upload-queue.ts` (nouveau) : `useUploadQueue`, une
  file à concurrence bornée (3, `MAX_CONCURRENT_UPLOADS`) avec état par fichier
  (`pending`/`uploading`/`done`/`failed`), progression `0..1`, et `retry(id)` qui
  ne relance que l'entrée échouée sans perturber les autres.
- `packages/admin/src/media/upload-form.tsx` : commentaire mensonger corrigé (il
  prétendait déjà faire du multipart). La description reste **séquentielle,
  un fichier à la fois** — décision délibérée maintenue : le texte alternatif est
  une exigence WCAG 1.1.1 qui ne se relâche pas pour un lot, documentée dans le
  fichier lui-même. Ce qui change : soumettre la description d'un fichier
  n'attend plus la fin du transfert réseau avant de passer au suivant —
  `enqueue()` rend la main immédiatement, jusqu'à trois transferts tournent en
  parallèle avec une vraie barre de progression par octet chacun. Limites
  affichées (`GET /api/media/-/limits`) avant le premier fichier choisi.
  `fileToBase64`/`uploadMedia` (JSON) ne sont plus appelés sur ce chemin.
- `packages/admin/src/fields/media-picker.tsx` : même transport
  (`uploadMediaMultipart` via la file), fichiers déposés toujours
  décoratif-par-nécessité (précédent déjà établi dans ce fichier), désormais
  réellement 3 en parallèle avec progression/échec par fichier affichés.
- `packages/admin/src/routes/media.tsx` : zone de dépôt sur **toute la page**
  (`onDragOver`/`onDrop` sur la `<section>` racine), filtrée sur
  `dataTransfer.types.includes('Files')` pour ne jamais intercepter le
  glisser-déposer interne d'un asset vers un dossier (`setMediaDragData` utilise
  un type MIME personnalisé, jamais `'Files'`). File d'attente affichée en pied
  de page avec bouton réessayer par fichier échoué.
- `packages/admin/test/helpers/mock-fetch.ts` : le mock `fetch` partagé
  comprenait déjà `FormData` pour `/replace` mais pas pour l'upload initial —
  étendu (`mockUploadBody`) pour lire les deux formes indifféremment. Nouveau
  stub `XMLHttpRequest` (`installMockXhr`) qui délègue au `fetch` déjà stubé —
  aucune logique de route dupliquée une seconde fois.

**Bug de sécurité réel trouvé en écrivant le test e2e** : ma première version de
`uploadMediaMultipart` n'envoyait pas de champ `kind`. Un test contre un vrai
serveur (fichier PNG déclaré `text/html` dans la partie multipart) a montré que
l'asset gardait `mimeType: 'text/html'` — `verifyRealType` ne re-sniffe les octets
que quand `kind === 'image'`, et sans champ `kind` explicite le serveur le dérive
du type MIME *déclaré*, donc un fichier déguisé n'était jamais détecté. Corrigé en
envoyant `kind` explicitement, exactement ce que l'ancien chemin JSON faisait déjà
— la même protection L10 que le test `serve-images.test.ts` existant prouve pour
le chemin JSON, maintenant prouvée aussi pour le multipart.

**Preuves** :
- `pnpm -F @cogenta/admin typecheck` → vert.
- `pnpm -F @cogenta/admin exec vitest run test/media.test.tsx
  test/fields/media-picker.test.tsx test/media/upload-queue.test.ts` → 16/16 verts
  (3 nouveaux tests media.tsx : limites affichées, entrée de progression qui se
  nettoie après succès, dépôt sur toute la page ; 3 nouveaux tests unitaires de la
  file — plafond à 3, un échec ne bloque pas les autres, `retry()` cible bien la
  seule entrée échouée).
- `pnpm -F @cogenta/cli exec vitest run serve-media-multipart.test.ts
  serve-images.test.ts` → 10/10 verts (nouveau fichier bout en bout : upload
  multipart de plusieurs Mo avec vraies dimensions, type stocké correct même
  déguisé, refus d'un upload non-décoratif sans alt).
- `pnpm -F @cogenta/cli typecheck` → vert.
- `pnpm exec biome check --write` sur tous les fichiers touchés → propre (biome
  a reformulé des lignes préexistantes sans rapport, aucune régression).

**Hors périmètre, trouvé mais non corrigé** : `POST /api/media` (upload initial,
JSON comme multipart) n'a **jamais** accepté de `folderId` — `NormalisedUpload`
et `uploadSchema` ne le déclarent pas, et `finishUpload`/`store.create()` ne le
passent nulle part. `UploadForm`'s `defaultFolderId` (fiche 46 tâche 8) était donc
déjà silencieusement sans effet avant cette tâche, sur les deux chemins. Documenté
dans le code (`upload-form.tsx`) et laissé tel quel — corriger ce point relève de
la tâche 4/8 de la fiche, pas de T01, et sort du périmètre confié.

## T04 — Dossier dans le sélecteur de média des champs (P1) — FAIT

Même commit `f16df54`.

- `packages/admin/src/fields/media-picker.tsx` (`BrowsePanel`) : nouveau
  `<Select>` de dossier au-dessus de la recherche (`listMediaFolders` chargé une
  fois), options « tous les dossiers » / « non classé » / chaque dossier réel ;
  `folderId` propagé à `listMedia()`, la liste se recharge à chaque changement de
  filtre, avec les autres filtres (recherche, type).

**Preuve** : `packages/admin/test/fields/media-picker.test.tsx` — nouveau test
« filters the browse panel by folder » (sélectionner « Logos » dans le panneau de
navigation déclenche bien un appel `GET /api/media?...folderId=folder-1...`).
`pnpm -F @cogenta/admin exec vitest run test/fields/media-picker.test.tsx` →
3/3 verts. Commit `4721cad`.

## T03 — Avertissement d'usage avant suppression groupée (P1) — FAIT

Commit `d8a5cf7`.

- `packages/api/src/rest/media-router.ts` : nouvelle route
  `POST /api/media/-/bulk-usage` (`{ids}` → `{[id]: MediaUsageReport}`), réutilise
  `scanUsage` déjà utilisé par la route individuelle `GET .../usage`, même borne
  `maxEntries`.
- `packages/admin/src/api/media-client.ts` : `bulkMediaUsage(token, ids)`.
- `packages/admin/src/routes/media.tsx` : `openBulkDeleteConfirm()` lance l'appel
  **avant** d'ouvrir la modale de confirmation (jamais un blocage — R6 veut
  réversible et journalisé, pas verrouillé) ; la modale affiche, par asset
  concerné, son nom de fichier et la liste (bornée) des entrées qui le
  référencent, même vocabulaire que le panneau de détail individuel
  (`media.usageItem`).
- **Bonus fait en écrivant le test** : `GET /api/media/{id}/usage` n'avait
  **aucun test** dans `packages/api/test/rest/media-router.test.ts` malgré son
  existence depuis la fiche 11 — comblé dans le même commit avec un vrai
  `ContentStore` (même fixture que `packages/schema/test/media-usage.test.ts`),
  couvrant lecture individuelle, 404, refus anonyme, et la nouvelle route bulk
  (par id, refus anonyme, refus d'une liste vide).

**Preuves** :
- `pnpm -F @cogenta/api typecheck` → vert.
- `pnpm -F @cogenta/api exec vitest run rest/media-router.test.ts` → 19/19 verts
  (6 nouveaux tests usage/bulk-usage).
- `pnpm -F @cogenta/admin typecheck` → vert.
- `pnpm -F @cogenta/admin exec vitest run test/media.test.tsx` → 12/12 verts (1
  nouveau test : sélection de 2 fichiers usés sur 3, la modale affiche
  « 2 des fichiers sélectionnés sont encore référencés » et les deux lignes
  d'usage).

## T07 — Filtre de date et compteur total (P2) — FAIT

Commit `53706b1`.

- `packages/admin/src/routes/media.tsx` : deux champs `<input type="date">`
  (`from`/`to`, déjà acceptés par `GET /api/media` — `ListMediaOptions` les
  avait déjà côté client) propagés à `load()`/`loadMore()` ; `page.total`
  (déjà renvoyé par l'API) affiché à côté du nombre chargé
  (« N affichés sur total »).

**Preuves** : `pnpm -F @cogenta/admin typecheck` → vert ;
`pnpm -F @cogenta/admin exec vitest run test/media.test.tsx` → 13/13 verts
(compteur vérifié sur le test de pagination existant à 25 puis 30 sur 30 ;
nouveau test vérifiant que remplir les deux champs de date envoie bien
`from=`/`to=` à l'API — le mock partagé ne simule pas des dates de création
distinctes par asset, donc ce test prouve le câblage, pas le filtrage
serveur réel, déjà couvert côté serveur par `parseDateBound`/`media-router.ts`).

## Non fait, périmètre restant

- **T05 — couverture de test manquante** : partiellement comblé en incident de
  route (les 6 tests `usage`/`bulk-usage` de T03 en font partie), mais la liste
  complète de l'audit (`replace()` changeant `contentHash` et libérant
  l'ancien `storageKey`, strip EXIF, étiquetage groupé) n'a pas été reprise
  faute de temps dans cette session. `store.replace()` a un test indirect
  (`packages/cli/test/serve-images.test.ts`, nouveau test T02) qui prouve le
  changement de `contentHash`/URL, mais pas un test unitaire dédié dans
  `packages/core/test/integration/media.test.ts` comme demandé par l'audit.
- **T06 — `cogenta doctor` pour le driver d'images** (P2) : non fait.
- **T08 — prévisualisation vidéo/PDF** (P3) : non fait, explicitement cadré
  comme confort pur par l'audit lui-même.

## Résumé des commits

- `86fc9cf` fix(render,cli): break the year-long image cache after a media replace (T02)
- `f16df54` fix(admin): real multipart upload with progress and bounded concurrency (T01, T04)
- `4721cad` test(admin): cover the media picker's folder filter (T04, complément)
- `d8a5cf7` feat(api,admin): warn before a bulk delete orphans a real reference (T03)
- `53706b1` feat(admin): date range filter and total count on the media screen (T07)

Changesets écrits : `.changeset/media-cache-bust-version.md` (`@cogenta/render` minor,
`@cogenta/cli` patch — T02) et `.changeset/media-bulk-usage.md` (`@cogenta/api` minor
— T03, `POST /api/media/-/bulk-usage`). T01/T04/T07 ne touchent que `@cogenta/admin`,
privé, donc sans changeset.

