# Audit Médiathèque et pipeline d'images — 2026-09-01

## 1. Résumé exécutif

Contrairement à ce que l'en-tête de la fiche 11 laisse croire (« état minimal »),
**fiche 11 et fiche 46 ont toutes les deux été fusionnées dans `main`**
(commits `ce296e0`, `a8199ea`, `411edc4`) : dossiers, recherche, filtres, tri,
pagination par curseur, sélection multiple, actions groupées, étiquettes, usage,
EXIF/GPS, remplacement de fichier sont du vrai code, testé côté serveur. La
médiathèque est aujourd'hui bien plus riche que la fiche ne le documente.

Mais deux vérifications à la lettre révèlent que **le cœur de la tâche 1 de la
fiche 11 — le vrai problème bloquant nommé en premier — n'a jamais été fait côté
écran**, malgré un commentaire de code qui prétend le contraire, et que **le
piège le plus coûteux explicitement documenté par la fiche (cache d'un an sur
`/_image`) n'est pas corrigé en pratique** malgré toute la plomberie de données
nécessaire déjà en place.

**Décompte** (critères des fiches 11 + 46, ~54 items vérifiés) : **FAIT 34**,
**PARTIEL 8**, **ABSENT 7**, **POINT MORT 5**.

**Les deux bugs P0** :
1. L'upload admin envoie toujours du JSON+base64 (`uploadMedia`/`fileToBase64`),
   jamais `multipart/form-data`, malgré une route serveur multipart réelle et un
   commentaire de code affirmant le contraire (`upload-form.tsx:8`).
2. Le champ `MediaAsset.version` (render) censé porter le `contentHash` dans
   l'URL `/_image?...&v=` pour casser le cache d'un an après un remplacement de
   fichier n'est **jamais renseigné** par `cogenta serve` et **jamais lu** par
   `variantUrl()` — remplacer un logo laisse l'ancien fichier servi un an à tout
   visiteur qui l'a déjà en cache, exactement le piège que la fiche nommait.

Both sont documentés en détail en §4 et §6.

## 2. Ce qui existe réellement

**Modèle et store** (`packages/core/src/media/`) : `types.ts` (231 lignes,
`MediaAsset`/`MediaFolder`/interfaces store) ; `store.ts` (467 lignes,
`createDatabaseMediaStore`, table `cogenta_media`, colonnes ajoutées en place par
`alter table … catch(() => undefined)` — même patron que `@cogenta/auth`'s
`tables.ts`) ; `folder-store.ts` (chemin matérialisé, réutilise
`folder-path.ts`, copie locale de l'arithmétique de `taxonomy-path.ts` car
`@cogenta/core` ne peut pas dépendre de `@cogenta/schema`) ; `exif.ts` (lecteur
EXIF + scrubber GPS zéro dépendance) ; `format-sniff.ts` (détection par octets) ;
`sql-fragments.ts`.

**API** (`packages/api/src/rest/media-router.ts`, 1293 lignes) : `GET/POST
/api/media`, `GET/PATCH/PUT/DELETE /api/media/{id}`, `GET .../usage`, `GET
.../exif`, `POST .../replace`, `POST .../move`, `POST /-/bulk-delete`,
`/-/bulk-tag`, `/-/bulk-untag`, `/-/bulk-move`, `GET /-/limits`, et tout
`/api/media/folders/*` (CRUD + `/move`).

**Écrans admin** : `routes/media.tsx` (668 lignes — grille, recherche, filtres
type/étiquette, tri, pagination, sélection multiple, arborescence de dossiers,
glisser-déposer vers un dossier) ; `media/upload-form.tsx` (200 lignes,
sélection multi-fichiers séquentielle) ; `media/media-detail.tsx` (438 lignes —
dimensions/poids/type/date, EXIF appareil/date, usage, remplacement, copier
l'URL, étiquettes, déplacement) ; `media/media-folder-tree.tsx` (250 lignes,
nouveau en fiche 46) ; `media/focal-point-editor.tsx` (92) ;
`media/media-thumbnail.tsx` (55, placeholder pour non-image) ;
`api/media-client.ts` (408 lignes).

**Sélecteur de champ** : `fields/media-picker.tsx` (430 lignes) — recherche,
pagination, glisser-déposer d'upload, mais **sans aucune notion de dossier**.

**Pipeline d'images** (`packages/render/src/images/`, pas
`packages/core/src/drivers/image` comme le laissait supposer la mission —
c'est le paquet de rendu, pas core) : `sharp.ts` (driver optimal) / `wasm.ts`
(driver dégradé, libvips WebAssembly) enregistrés dans un
`DriverRegistry<ImageTransformer, ImageConfig>` (`index.ts`), une seule suite
de contrat (`test/images/image.contract.ts`) jouée contre les deux (R1/R10
respectées). `pipeline.ts`/`geometry.ts`/`srcset.ts` calculent la ladder de
largeurs, le point focal, et construisent les URLs `/_image`.

**Endpoint public** `/_image?id=&w=` (`packages/cli/src/commands/serve.ts`,
fonction `serveImageVariant`, ~ligne 3552) : sert l'original ou la variante
webp correspondant à `w`, restreint à `kind === 'image'`, `Cache-Control:
public, max-age=31536000, immutable`.

## 3. Vérification des fiches, critère par critère

| Fiche | Tâche / critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| 11 T1 | Multipart/form-data au lieu de JSON+base64 | **ABSENT** | `media-client.ts:194` `uploadMedia()` envoie `JSON.stringify({...data: base64})`; `upload-form.tsx:85` appelle `fileToBase64` puis `uploadMedia` | Le serveur sait parser le multipart (`isMultipartFormData`, `media-router.ts:713`) et l'appelle même `legacyJsonUpload` dans son propre code — mais rien côté admin ne l'utilise jamais |
| 11 T1 | Progression réelle (XHR/stream) | **ABSENT** | `upload-form.tsx` n'a ni `XMLHttpRequest` ni `onprogress`; seul un texte « fichier N sur M » | Pas de barre de progression par octet, juste un compteur de lot |
| 11 T1 | File d'attente, 2-3 en parallèle, retry par ligne | **PARTIEL** | `upload-form.tsx:66-100` — une file existe (`queue`) mais **séquentielle** (un à la fois), pas de bouton « réessayer » par ligne, un échec bloque le formulaire (`error` global) | Le concept de file existe, la parallélisation et le rattrapage par ligne n'existent pas |
| 11 T1 | Zone de dépôt sur toute la page média | **ABSENT** | Aucun `onDrop`/`onDragOver` d'upload dans `routes/media.tsx` — seul `onDragStart`/`onDropAsset` pour déplacer un asset **déjà présent** vers un dossier | Confondu avec le drag-and-drop de fiche 46 (déplacement), qui existe bien lui |
| 11 T1 | Règle alt obligatoire non affaiblie en masse | FAIT | `upload-form.tsx:143-165` — champ requis par fichier, la file avance un par un donc chaque fichier repasse par le même formulaire | Pas de liste « à compléter » séparée après coup — mais la règle n'est jamais contournée |
| 11 T1 | Limites affichées avant upload | **ABSENT** | `GET /api/media/-/limits` existe (`media-router.ts:490`) mais grep ne trouve aucun appel côté admin (`media-client.ts`, `upload-form.tsx`) | Route écrite, jamais consommée — point mort |
| 11 T2 | `GET /api/media?q=&kind=&from=&to=&sort=&after=` | **PARTIEL** | `q`/`kind`/`tag`/`sort`/`direction`/`cursor` tous supportés et câblés (`media.tsx:127-131`) ; `from`/`to` supportés côté `ListMediaOptions`/routeur mais **aucun contrôle de date dans l'écran** | Filtre par plage de dates absent de l'UI malgré l'API prête |
| 11 T2 | Sélecteur de média des formulaires consomme la même route | FAIT | `fields/media-picker.tsx:318` appelle `listMedia` avec pagination et recherche | — |
| 11 T2 | Compteur total | **POINT MORT** | `MediaStore.count()` existe, `media-router.ts:691` le retourne en `page.total`, `media-client.ts` le décode — **jamais affiché** dans `routes/media.tsx` | Donnée calculée à chaque requête, jamais rendue |
| 11 T3 | Sélection multiple, `Shift`, actions groupées | FAIT | `media.tsx:86-92`, cases à cocher + `selected` Set | — |
| 11 T3 | Avertissement d'usage avant suppression (info) | **PARTIEL** | Suppression individuelle : le panneau d'usage est visible au-dessus du bouton Supprimer (`media-detail.tsx:350-366`) mais **aucune confirmation** — un clic supprime immédiatement, sans modale, sans re-citer l'usage au moment de l'action | Le critère strict de la fiche (« un avertissement qui nomme… ») n'est vérifié qu'en suppression individuelle et seulement par proximité visuelle, pas par une étape explicite |
| 11 T3 | Avertissement d'usage avant suppression **groupée** | **ABSENT** | `runBulkDelete` (`media.tsx:184`) et `bulkDelete` serveur (`media-router.ts:1020`) ne consultent jamais `findMediaUsage` ; la modale de confirmation (`media.tsx:648-664`) affiche seulement `t('media.bulkDeleteConfirmBody')` = « Cette action est définitive. » — pas d'usage nommé | Contredit directement le critère d'acceptation §5 de la fiche : « supprimer une image utilisée par trois pages provoque un avertissement qui nomme les trois pages » |
| 11 T4 | Remplacer un fichier en conservant l'id | FAIT | `store.replace()` (`store.ts:435`), route `POST .../replace` (multipart réel), client `replaceMedia()` (`media-client.ts:239`), UI dans `media-detail.tsx:203` | **Zéro test** : ni `media-router.test.ts`, ni `core/test/integration/media.test.ts` ne testent `replace`/`contentHash` |
| 11 T4 | Cache-bust via `&v=` dérivé du hash | **ABSENT (point mort)** | `contentHash` calculé et stocké ; `MediaAsset.version` (render) documenté « Added in theme@1.2 » et « Folded into every `/_image` URL as `&v=` when present » (`render/src/images/types.ts:82-89`) — mais `variantUrl()` (`srcset.ts:33`) ne lit jamais `.version`, et `loadRenderMedia()` (`serve.ts:3624`) ne le renseigne jamais depuis `asset.contentHash` | Voir §4, item critique — le piège nommé par la fiche elle-même n'est pas corrigé |
| 11 T4 | Rotation ou recadrage | **ABSENT** | Aucune trace de `rotate`/`crop` dans `media-detail.tsx`, `focal-point-editor.tsx`, ou le routeur | La fiche recommandait au moins la rotation seule — même ça n'existe pas |
| 11 T4 | Copier l'URL publique | FAIT | `media-detail.tsx:219-230`, `navigator.clipboard.writeText` | URL sans `&v=` (cohérent avec l'absence du câblage ci-dessus) |
| 11 T5 | Étiquettes, filtrage, étiquetage groupé | FAIT | `tags` colonne + `TAG_DELIMITER`, `bulk-tag`/`bulk-untag` routes, `tagFilter` dans l'écran | — |
| 11 T5→46 | Dossiers (décision changée par retour utilisateur direct) | FAIT | Fiche 46 en entier, voir tableau suivant | — |
| 11 T6 | Dimensions, poids, type, date | FAIT | `media-detail.tsx:243-258` | Pas de « téléverseur » (`createdBy`) affiché — champ existe dans `MediaAsset` mais jamais rendu |
| 11 T6 | Liste des variantes générées | **ABSENT** | Aucun rendu de `variantNames`/liste de renditions dans `media-detail.tsx` | Confort, non bloquant |
| 11 T6 | Prévisualisation PDF/vidéo | **ABSENT** | `media-thumbnail.tsx:47-49` — placeholder vide pour tout ce qui n'est pas `previewable` (image) | Pas de `<video>` ni de première page PDF, ni en grille ni en détail |
| 11 T6 | EXIF + retrait GPS proposé | FAIT | `exif.ts`, GPS strippé par défaut à l'upload (`finishUpload`, `media-router.ts:750-757`), admin n'affiche jamais les coordonnées (seulement appareil/date) | — |
| 11 §5 | 30 fichiers en une opération avec progression | **ABSENT** | Voir T1 ci-dessus | — |
| 11 §5 | Aucun fichier transporté en base64 | **ABSENT** | Voir T1 | Contredit directement |
| 11 §5 | Médiathèque de 2000 assets reste utilisable | PARTIEL | Pagination par curseur fonctionne ; recherche/tri fonctionnent ; mais le picker et la grille chargent les vignettes via `fetchMediaBlobUrl` (un fetch authentifié par image, pas `/_image`) — coût réseau par page, à mesurer | Pas mesuré, pas un blocage avéré |
| 11 §5 | Remplacer un fichier ne laisse aucun cache servir l'ancien | **ABSENT** | Voir T4 cache-bust | Contredit directement, non testé |
| 46 T1-3 | Modèle de dossiers + migration + suite de contrat | FAIT | `types.ts` (`MediaFolder`), `folder-store.ts`, `folder-store.contract.ts` (17 cas : cycle, non-vide, profondeur, ensureRoot idempotent/concurrent) | Suite très complète, y compris un test de concurrence réel sur `ensureRoot` |
| 46 T4 | Routes `/api/media/folders`, `/{id}/move`, `/-/bulk-move` | FAIT | `media-router.ts` `routeFolders`, testées dans `media-folder-router.test.ts` (15 cas) | — |
| 46 T5 | Écran arborescence, glisser-déposer, breadcrumb, CRUD dossier | FAIT | `media-folder-tree.tsx`, `media.tsx` (breadcrumb ligne 291, modales create/rename/delete) | Chaque action a un bouton nommé en plus du glisser-déposer (clavier-accessible) |
| 46 T6 | Dossier racine `contents` amorcé, non forcé sur l'existant | FAIT | `ensureRoot()`, appelé au démarrage (`serve-media-folders.test.ts:68`), `folderId` reste `null` pour l'historique | — |
| 46 T7 | Câblage recherche/filtre/tri/pagination/multi-upload/panneau enrichi | **PARTIEL** | Recherche/filtre/tri/pagination/panneau enrichi : FAIT. « Upload multipart multiple avec progression » : **ABSENT**, malgré le commentaire de code (`upload-form.tsx:8`) qui affirme le contraire | Écart entre le commentaire et le comportement réel — voir §4 |
| 46 T8 | Sélecteur de dossier dans le formulaire d'upload | FAIT | `UploadForm.defaultFolderId` suit le dossier actuellement affiché (`media.tsx:354`) | Implicite (dossier courant), pas un menu déroulant explicite — accepté, cohérent avec WordPress/Strapi |
| 46 T8 | Filtre par dossier dans le sélecteur de média des champs | **ABSENT** | `fields/media-picker.tsx` : aucune mention de `folderId`/`folder` | Contredit le critère explicite de la fiche |
| 46 §5 | Dossier `contents` par défaut, sous-dossiers, frères | FAIT | Testé en e2e (`serve-media-folders.test.ts`) et en contrat | — |
| 46 §5 | Glisser un média dans un dossier le déplace, retrouvable par filtre | FAIT | `dropAssetOnFolder` (`media.tsx:274`) + `?folderId=` | Alternative clavier : `<select>` « déplacer vers » dans `media-detail.tsx:189` |
| 46 §5 | Recherche/filtre/tri/pagination/sélection/actions groupées à l'écran | FAIT | Voir T7 | — |
| 46 §5 | Panneau détail : dimensions/poids/type/date/tags/usage | FAIT | `media-detail.tsx` | — |
| 46 §6 | Migration up/down/up 3 dialectes | **PARTIEL** | Pattern `try`/`catch` sur `alter table` (pas de vrai down/up réversible formel — cohérent avec le patron `tags`/`content_hash` déjà en place) ; SQLite exécuté (48/48 tests verts, cette session) ; **Postgres/MySQL/MariaDB non exécutés** (Docker indisponible), suites écrites et sautent bruyamment (`media-folders.test.ts`) | Même blocage récurrent documenté dans tout le projet |
| 46 §6 | Contrat `MediaFolderStore`, cas non-vide + cycle | FAIT | `folder-store.contract.ts` lignes 127-182 | — |
| 46 §6 | e2e upload multiple, déplacement, filtre, suppression groupée | **PARTIEL** | Déplacement/filtre/suppression groupée testés (`media.test.tsx`) ; upload **multiple réel (multipart)** non testé puisqu'il n'existe pas | — |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P0** | `packages/admin/src/media/upload-form.tsx:8` + `packages/admin/src/api/media-client.ts:194` | Le commentaire de tête de `UploadForm` affirme « fiche 46 task 7 — upload multipart multiple avec progression » ; le code appelle `fileToBase64` puis `uploadMedia()` qui envoie un `POST /api/media` en `Content-Type: application/json` avec `data` en base64. Le serveur route ce corps vers `legacyJsonUpload` (`media-router.ts:719`), son propre nom de fonction indiquant que c'est un chemin de compatibilité, pas le chemin normal. Le plafond réel (`DEFAULT_MAX_UPLOAD_BYTES = 250 Mo`, `media-router.ts:169`) reste donc exposé au gonflement base64 et au chargement en mémoire complet, exactement le « vrai plafond technique » que la fiche 11 nommait en premier. | Réécrire `uploadMedia`/`UploadForm` pour poster un vrai `multipart/form-data` (`isMultipartFormData` sait déjà le parser côté serveur), avec suivi de progression par `XMLHttpRequest.upload.onprogress` |
| **P0** | `packages/render/src/images/types.ts:82-89`, `packages/render/src/images/srcset.ts:33-44`, `packages/cli/src/commands/serve.ts:3624-3641` | `MediaAsset.version` (render) est documenté comme « Folded into every `/_image` URL as `&v=` when present », « Added in `theme@1.2` ». Mais (a) `variantUrl()` ne construit jamais de paramètre `v` — seuls `id`/`w`/`h`/`f`/`fit` sont posés dans `URLSearchParams` ; (b) `loadRenderMedia()`, l'unique fonction qui construit un render-`MediaAsset` depuis le `MediaAsset` de `@cogenta/core` pour `cogenta serve`, ne renseigne jamais `version` depuis `asset.contentHash`. Résultat : remplacer un fichier en place (`POST .../replace`) change bien `contentHash` en base, mais l'URL `/_image?id=…` servie par chaque page rendue est **strictement identique** avant et après — sous `Cache-Control: public, max-age=31536000, immutable`, tout visiteur ayant déjà vu l'image continue de voir l'ancienne pendant un an. C'est exactement le piège que la fiche 11 §7 appelle « le plus coûteux ». De plus, `docs/04-contrats.md`'s `ImageSource`/`MediaReference` frozen à `theme@1.2` (ligne 603, 709-748) **ne mentionne `version` nulle part** — le champ n'a jamais été porté dans le contrat figé lui-même, malgré le commentaire de code qui prétend une montée de version. | Ajouter `version` à `loadRenderMedia()` (depuis `asset.contentHash`), le lire dans `variantUrl()`, documenter réellement le champ dans `docs/04-contrats.md` (ou le retirer si la fiche 11 §4 T4's alternative « rotation seule » est choisie à la place) |
| **P1** | `packages/admin/src/routes/media.tsx` (fonction `runBulkDelete`/modale ligne 648) + `packages/api/src/rest/media-router.ts:1020` `bulkDelete` | La suppression groupée ne consulte jamais `findMediaUsage`/`scanUsage`, ni côté serveur ni côté écran — la modale de confirmation dit seulement « Cette action est définitive. » sans nommer un seul usage. Contredit le critère d'acceptation explicite de la fiche 11 (§5 : « Aucune suppression sans savoir où le média est utilisé » — vrai seulement pour la suppression individuelle, faux pour la suppression groupée, qui est le cas où l'oubli coûte le plus) | Avant `runBulkDelete`, appeler `getMediaUsage` pour chaque id sélectionné (ou une route `bulk-usage` dédiée) et lister dans la modale les entrées affectées, avec le même bornage/troncature que le scan individuel |
| **P1** | `packages/admin/src/fields/media-picker.tsx` | Aucune notion de dossier (pas de `folderId`, pas de filtre par dossier) alors que la fiche 46 tâche 8 l'exige explicitement | Ajouter un sélecteur de dossier au `BrowsePanel`, propager `folderId` à `listMedia` |
| **P1** | `packages/api/test/rest/media-router.test.ts` (344 lignes, 13 `it`) | Aucun test pour `POST .../replace`, `GET .../usage`, `GET .../exif`, `POST /-/bulk-delete`, `POST /-/bulk-tag`, `POST /-/bulk-untag`, le filtre `tag`, le tri `sort`/`direction`, le filtre `from`/`to`. Idem `packages/core/test/integration/media.test.ts` : aucun test de `store.replace()`/`contentHash`. Viole AGENTS.md « Définition de terminé » (tests unitaires sur la logique métier) et la fiche 11 §6 qui exige explicitement un test bout en bout du remplacement et du cache | Ajouter la couverture manquante avant de considérer le lot clos |
| **P2** | `packages/admin/src/routes/media.tsx` | Pas de filtre de plage de dates (`from`/`to`) dans l'écran alors que l'API le supporte entièrement | Ajouter deux champs date dans le panneau de filtres |
| **P2** | `packages/admin/src/routes/media.tsx` | `MediaStore.count()`/`page.total` calculé par le serveur à chaque requête, jamais affiché (le compteur « 2 000 assets » que le propre commentaire de `count()` annonce comme raison d'être) | Afficher `total` à côté de la liste |
| **P2** | `packages/cli/src/commands/doctor.ts` | Le driver d'images (`createImageRegistry`, sharp/wasm) n'apparaît dans aucun `check(...)` de `cogenta doctor`, contrairement à `database`/`cache`/`storage`/`rateLimit` — viole la règle R1/skill `new-driver` (« doctor reporting ») pour ce driver précis | Ajouter `await check('images', () => createImageRegistry(...).select(config.images))` (ou équivalent) |
| **P3** | `packages/cli/src/commands/serve.ts:3552` `serveImageVariant` | `/_image` ignore silencieusement `h`/`f`/`fit` alors que `variantUrl()` peut les émettre (`ImageOptions` en contrat D) — sert toujours la variante par largeur, jamais un format ou un ratio demandé. Aucun thème actuel ne s'en sert, donc pas de régression visible aujourd'hui, mais c'est une divergence entre ce que le contrat promet et ce que le serveur honore | Soit implémenter `h`/`f`/`fit` côté `/_image`, soit retirer ces champs d'`ImageOptions` tant qu'ils ne sont pas honorés |
| **P3** | `packages/admin/src/media/media-thumbnail.tsx:47` | Aucune prévisualisation pour vidéo/PDF (grille et détail) — fiche 11 tâche 6 | `<video>` en détail pour `kind === 'video'`, première page pour un PDF via une variante déjà produite si possible |
| **P3** | `packages/admin/src/media/media-detail.tsx` | `createdBy` (téléverseur) jamais affiché malgré sa présence dans `MediaAsset` | Ajouter une ligne « Téléversé par » |

Aucune violation trouvée de R3/R4/R7/R8/R9/R10 dans le code média lui-même :
pas de `any`, pas de `@ts-ignore`, pas de `console.log`, pas de `throw new
Error` nu, `requireActor` (authentification, pas de contrôle de rôle dans un
outil puisqu'il n'y a pas d'outil ici), zéro dépendance native nouvelle (le
lecteur EXIF et le sniffing de format sont zéro-dépendance, R9/R10 respectées),
SVG refusé par défaut avec une ADR citée en hint (ADR-0017, `media-router.ts:356`).
i18n FR/EN complet et parallèle (90 clés `media.*` de chaque côté, aucune
manquante). Alternatives clavier présentes pour tout ce qui se fait aussi en
glisser-déposer (boutons nommés + `<select>`).

## 5. Comparaison marché

### WordPress (médiathèque native + plugins cités)

| Fonction | Cogenta |
|---|---|
| Vue grille | OUI (`media.tsx`) |
| Vue liste | NON |
| Filtre par type | OUI (`kindFilter`) |
| Filtre par date | **PARTIEL** (API prête, aucun contrôle à l'écran) |
| Recherche par nom/texte alternatif | OUI (`q`, casse/accent-insensible selon les tests) |
| Téléversement multiple glisser-déposer | **NON** — un champ fichier multi-sélection, séquentiel, pas de zone de dépôt sur la page |
| Barre de progression | **NON** — compteur « fichier N/M » seulement |
| Recadrage / rotation / miroir | **NON** — point focal seulement |
| Texte alternatif, légende, description, titre | **PARTIEL** — alt oui (obligatoire, mieux que WordPress) ; pas de champ légende/description/titre distinct de `filename` |
| URL | OUI (copier l'URL publique) |
| Remplacer le fichier en conservant l'id | OUI (`replace`), mais **non testé** et **cache non cassé** en pratique (P0 ci-dessus) |
| Attaché à / « où ce média est-il utilisé ? » (plugin) | OUI — Cogenta le fait nativement, mieux que WordPress natif (scan borné et honnête sur son coût) |
| Actions groupées | OUI (supprimer, étiqueter/désétiqueter, déplacer) — WordPress a aussi télécharger en masse, absent ici |
| Suppression avec avertissement d'usage | **PARTIEL** (individuel visible, groupé absent — voir P1) |
| Tailles d'image réglables | **NON** — ladder fixe (`SRCSET_WIDTHS`), pas de configuration par site |
| Lazy loading | Non vérifié dans ce domaine (rendu de page, hors périmètre médiathèque) |
| WebP/AVIF | **PARTIEL** — WebP généré à l'upload ; AVIF listé dans `ImageFormat`/accepté en entrée mais aucune génération de variante AVIF trouvée dans `pipeline.ts` côté sortie |
| Dossiers (Media Library Folders) | **OUI, natif** — au-dessus de WordPress qui n'a ça qu'en plugin |
| Remplacement de fichier (Enable Media Replace) | OUI, natif (voir ci-dessus pour les réserves) |
| Compression (EWWW/Smush) | NON — hors périmètre R10 (pas de service externe requis, mais aucune optimisation de poids au-delà du redimensionnement/WebP) |
| Régénération des vignettes (Regenerate Thumbnails) | NON — pas de commande pour regénérer les variantes d'un asset existant après un changement de ladder |
| Support SVG | **NON, intentionnel** (ADR-0017, tant qu'aucun assainisseur revu n'existe) |

### Strapi 5 Media Library

| Fonction | Cogenta |
|---|---|
| Dossiers de premier niveau | OUI |
| Un fichier par dossier (hiérarchie stricte) | OUI (`folderId` unique, pas de multi-appartenance — les étiquettes couvrent ce besoin séparément) |
| Glisser-déposer (upload et déplacement) | **PARTIEL** — déplacement OUI, upload par glisser-déposer NON dans l'écran médiathèque (existe dans `media-picker.tsx` en revanche) |
| Breadcrumb | OUI (`media.tsx` §breadcrumb) |
| Recherche récursive ou limitée au dossier | OUI (`includeSubfolders`) |
| Recadrage | NON |
| Point focal | OUI (Cogenta et Strapi l'ont tous les deux) |

### Drupal 11 Media

| Fonction | Cogenta |
|---|---|
| Types de média multiples (image/vidéo/audio/document) | OUI (`MEDIA_KINDS`) |
| Usage tracking natif | OUI (scan borné, équivalent fonctionnel) |
| Recadrage responsive par style d'image | NON |
| Alt obligatoire | OUI (les deux l'ont, Cogenta l'impose aussi côté serveur) |

### Cloudinary / Sanity (transformations à la volée, point focal/hotspot)

| Fonction | Cogenta |
|---|---|
| Point focal | OUI (`FocalPoint`, appliqué par le pipeline sharp/wasm) |
| Hotspot multi-zone | NON — un seul point focal par asset, pas de zones multiples par usage |
| Transformation à la volée par URL (largeur/hauteur/format/fit arbitraires) | **PARTIEL** — le contrat (`ImageOptions`) le promet, `/_image` n'honore que `w` (voir P3 ci-dessus) ; pas de génération à la demande, seulement une ladder pré-calculée à l'upload (délibéré, documenté, cohérent avec R1 : pas de dépendance à un service de transformation à la volée) |

## 6. Spécification ultra détaillée des corrections et ajouts

### T01 — Upload multipart réel avec progression et parallélisme

**Priorité** : P0. **Effort** : 2-3 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/api/media-client.ts`,
`packages/admin/src/media/upload-form.tsx`, `packages/admin/src/fields/media-picker.tsx`
(même correction, deux appelants).

**Travail détaillé** :
- Ajouter `uploadMediaMultipart(token, file, metadata, onProgress)` dans
  `media-client.ts`, utilisant `XMLHttpRequest` (pas `fetch`, qui ne donne pas
  `upload.onprogress`) postant un `FormData` vers `POST /api/media` — le
  serveur sait déjà router ce corps vers `normaliseMultipartUpload`
  (`media-router.ts:713`), aucun changement serveur nécessaire.
- Remplacer tous les appels à `uploadMedia`/`fileToBase64` dans
  `upload-form.tsx` et `media-picker.tsx` par la nouvelle fonction.
- File d'attente réelle : 2-3 téléversements concurrents (`Promise` limitée
  par un petit pool, pas de dépendance nouvelle — une boucle avec un
  compteur suffit), état par fichier (`pending`/`uploading`/`done`/`failed`)
  avec bouton « réessayer » individuel.
- Zone de dépôt sur toute la page `routes/media.tsx` (`onDragOver`/`onDrop`
  au niveau de la `<section>` racine, filtré pour ne pas intercepter le
  drag-and-drop de déplacement d'asset déjà géré par `setMediaDragData`).
- Afficher `GET /api/media/-/limits` avant le premier fichier choisi
  (poids max, types acceptés) — fonction déjà exposée côté client via
  `request()`, il ne manque qu'un appel et un rendu.

**Critères d'acceptation** :
- Trente fichiers de quelques Mo se téléversent en une opération, avec une
  vraie barre de progression par octet (pas un texte « N/M »).
- Aucun `fileToBase64` n'est appelé sur le chemin d'upload normal (peut
  rester en interne pour un cas dégradé si vraiment nécessaire, mais pas le
  chemin par défaut).
- Un fichier qui échoue n'annule pas les autres, et propose un bouton
  « réessayer » qui ne relance que lui.
- Déposer un fichier n'importe où sur la page médiathèque démarre l'upload.

**Tests exigés** : bout en bout (`packages/cli/test`) — upload multipart
d'un fichier de plusieurs Mo contre un vrai serveur, vérifiant le type
stocké (règle de sécurité L10, à ne pas régresser) ; unitaire — la file
d'attente admin (échec d'un fichier n'annule pas les autres, capé à 2-3
concurrents) ; composant — zone de dépôt, limites affichées avant upload.

### T02 — Casser le cache d'un an après un remplacement de fichier

**Priorité** : P0. **Effort** : 0.5-1 j. **ADR requise** : non (complète une
fonctionnalité déjà actée en `theme@1.2`, ne change aucune signature figée —
à confirmer par `contract-guardian` avant fusion puisque `docs/04-contrats.md`
devra être mis à jour pour documenter `version`, ce que la note « Added in
theme@1.2 » du code prétendait déjà à tort).

**Fichiers** : `packages/cli/src/commands/serve.ts` (`loadRenderMedia`),
`packages/render/src/images/srcset.ts` (`variantUrl`), `docs/04-contrats.md`.

**Travail détaillé** :
- `loadRenderMedia()` : ajouter `version: asset.contentHash` au `RenderMediaAsset`
  construit pour chaque id.
- `variantUrl()` : si `media.version` est présent, poser
  `parameters.set('v', media.version)`.
- `docs/04-contrats.md` §`ImageSource`/`MediaReference` : documenter
  réellement `version` (champ optionnel, rétrocompatible — un thème qui
  l'ignore continue de fonctionner, cohérent avec la justification « minor »
  déjà utilisée pour `kind`/`poster`).
- Vérifier `og:image`/toute autre construction d'URL d'image dérivée d'un
  `MediaAsset` (recherche `_image?id=` dans `serve.ts`) pour s'assurer que
  `&v=` y apparaît partout où l'id apparaît, pas seulement dans `srcset`.

**Critères d'acceptation** : remplacer un fichier via `POST .../replace`
change l'URL servie par la page suivante (`&v=<nouveau hash>`) sans
qu'aucune page continue de pointer vers l'ancienne query string.

**Tests exigés** : bout en bout — uploader un asset, noter son URL rendue
sur une page, le remplacer, re-rendre la même page, vérifier que l'URL a
changé et que l'ancienne query string, si redemandée, sert toujours
l'ancien contenu (immutabilité de l'ancienne URL, comportement correct d'un
cache basé sur l'URL) tandis que la nouvelle sert le nouveau contenu.

### T03 — Avertissement d'usage avant suppression groupée

**Priorité** : P1. **Effort** : 1 j. **ADR requise** : non.

**Fichiers** : `packages/api/src/rest/media-router.ts` (nouvelle route ou
extension), `packages/admin/src/api/media-client.ts`,
`packages/admin/src/routes/media.tsx`.

**Travail détaillé** :
- Route `POST /api/media/-/bulk-usage` (`{ids}` → `{[id]: MediaUsageReport}`),
  réutilisant `scanUsage`/`findMediaUsage` existants, avec le même
  `maxEntries` borné.
- Avant d'ouvrir la modale `confirmBulkDelete`, appeler cette route et
  afficher, pour chaque asset ayant au moins un usage, le nombre et
  éventuellement la liste (bornée) des entrées concernées — même
  vocabulaire que le panneau de détail individuel (`media.usageItem`).
- Ne pas bloquer la suppression (cohérent avec le reste du produit — R6
  exige réversible/journalisé, pas verrouillé), mais rendre l'usage
  impossible à manquer.

**Critères d'acceptation** : sélectionner trois assets dont un est utilisé
par deux entrées fait apparaître, dans la modale de confirmation, le nom de
cet asset et les deux entrées qui le référencent.

**Tests exigés** : composant (modale affiche l'usage) ; router (`bulk-usage`
retourne un rapport par id, tronque proprement au-delà de `maxEntries`).

### T04 — Dossier dans le sélecteur de média des champs

**Priorité** : P1. **Effort** : 0.5-1 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/fields/media-picker.tsx`.

**Travail détaillé** : ajouter un contrôle de dossier (arborescence compacte
ou simple menu déroulant plat, moins de code qu'un arbre complet vu
l'espace disponible dans le panneau) au-dessus de la recherche dans
`BrowsePanel`, propager `folderId`/`includeSubfolders` à `listMedia`.

**Critères d'acceptation** : dans un champ média d'un formulaire d'entrée,
filtrer par le dossier « logos » ne montre que les assets de ce dossier.

**Tests exigés** : composant `media-picker.test.tsx`.

### T05 — Couverture de test manquante (replace, usage, exif, bulk-tag, filtres)

**Priorité** : P1. **Effort** : 1-1.5 j. **ADR requise** : non.

**Fichiers** : `packages/api/test/rest/media-router.test.ts`,
`packages/core/test/integration/media.test.ts`.

**Travail détaillé** : ajouter les cas listés en §4 (P1, ligne
`media-router.test.ts`) — un test par route non couverte, plus un test de
`store.replace()` qui vérifie que `contentHash` change et que l'ancien
`storageKey` n'est plus référencé.

**Critères d'acceptation** : `pnpm -F @cogenta/api test` et
`pnpm -F @cogenta/core test` couvrent chaque route/méthode de
`media-router.ts`/`store.ts` au moins une fois, succès et refus anonyme.

### T06 — Rapport `cogenta doctor` pour le driver d'images

**Priorité** : P2. **Effort** : 0.5 j. **ADR requise** : non.

**Fichiers** : `packages/cli/src/commands/doctor.ts`.

**Travail détaillé** : ajouter un `check('images', …)` utilisant
`createImageRegistry` de `@cogenta/render`, au même endroit que
`database`/`cache`/`storage`/`rateLimit`, reportant sharp vs wasm et la
raison du choix — cohérence avec la règle R1/skill `new-driver`.

**Critères d'acceptation** : `cogenta doctor` sur une machine sans `sharp`
installable affiche explicitement « images: wasm (degraded) — sharp
unavailable » plutôt que de ne rien dire du tout sur ce driver.

### T07 — Filtre de date et compteur total à l'écran

**Priorité** : P2. **Effort** : 0.5 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/routes/media.tsx`.

**Travail détaillé** : deux champs date (`from`/`to`, déjà supportés par
l'API) dans le panneau de filtres ; afficher `total` (déjà dans la réponse)
à côté du nombre d'éléments chargés (« 42 affichés sur 2 000 »).

**Critères d'acceptation** : filtrer par plage de dates réduit la liste ;
le total s'affiche et se met à jour avec les filtres.

### T08 — Prévisualisation vidéo/PDF

**Priorité** : P3. **Effort** : 1 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/media/media-thumbnail.tsx`,
`packages/admin/src/media/media-detail.tsx`.

**Travail détaillé** : en détail, un `<video controls>` pour `kind ===
'video'` (source = route authentifiée existante, pas `/_image`) ; pour un
PDF, une prévisualisation reste coûteuse sans dépendance (rendu de première
page) — a minima une icône de type distincte et un lien « ouvrir » est déjà
implicite via le téléchargement, donc traiter cette tâche comme confort
pur, vidéo d'abord, PDF si le temps le permet.

**Critères d'acceptation** : ouvrir le détail d'une vidéo la lit sur place.

## 7. Ordre d'exécution recommandé et dépendances

1. **T01** (upload multipart) et **T02** (cache-bust) d'abord et en
   parallèle — indépendants l'un de l'autre, tous deux P0, tous deux
   touchent des points nommés « les plus coûteux » par la fiche d'origine.
2. **T05** (tests manquants) juste après T02, pendant que le contexte de
   `replace`/`contentHash` est encore chaud — sinon la dette de test
   documentée ici se reproduit à la prochaine session.
3. **T03** (usage avant suppression groupée) et **T04** (dossier dans le
   picker) peuvent suivre en parallèle, indépendants entre eux et de T01/T02.
4. **T06**, **T07**, **T08** en confort, sans dépendance, à caser dans
   n'importe quel ordre selon la disponibilité.

Aucun item de cette liste ne touche un contrat figé A/B/C ; T02 est la
seule qui touche le contrat D (`theme@1.2`, déjà « figé » nominalement pour
`kind`/`poster` — `version` y est ajouté en pratique, pas en droit,
c'est cette incohérence que T02 corrige). `contract-guardian` doit valider
T02 avant fusion.
