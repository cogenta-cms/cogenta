# 46 — Médiathèque : dossiers et gestion de fichiers enrichie

> **État** : le travail serveur de la fiche 11 (recherche, filtres, tri, pagination,
> upload multipart, remplacement, étiquettes, usage, EXIF/GPS) est déjà écrit et
> testé — **rien n'est câblé côté écran admin**, qui porte encore le commentaire
> d'origine L2. Les dossiers n'existent nulle part.
> **Fichiers** : `packages/core/src/media/{types,store}.ts`,
> `packages/api/src/rest/media-router.ts`, `packages/admin/src/routes/media.tsx`,
> `packages/admin/src/api/media-client.ts`, `packages/admin/src/media/media-detail.tsx`
> **Effort** : 6–9 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

**Backend, réellement livré** (fiche 11) : `MediaAsset` a `tags`, `contentHash` —
**aucun `folderId`/`path`**. `media-router.ts` (964 lignes) : recherche `q`, filtres,
tri, pagination par curseur, upload multipart réel, `POST .../replace`
(remplacement en place, cache-bust), `GET .../usage`, `GET .../exif` + suppression
GPS à l'upload, `POST /-/bulk-delete`, `/-/bulk-tag`, `/-/bulk-untag`.
`packages/schema/src/media-usage.ts` : scan borné (5000 par défaut), testé.

**Écran admin — jamais mis à jour** : `packages/admin/src/routes/media.tsx` (122
lignes) porte encore `/** L2 task 11: upload, list, focal point, alt-text/decorative
— no crop, no variant picker */`. Un fichier à la fois, upload base64, grille sans
recherche/filtre/pagination/tri, aucune sélection multiple. `media-client.ts` (171
lignes) : pas de `tags`, pas de `tag`/`sort`/`direction` dans `ListMediaOptions`,
aucune fonction pour replace/bulk-delete/bulk-tag/usage/exif. `media-detail.tsx`
(130 lignes) : seulement alt/décoratif/point focal/suppression — pas de dimensions,
poids, type, date, tags, usage, URL copiable.

**Aucune notion de dossier nulle part** (vérifié par recherche exhaustive).

## 2. Diagnostic

La table `cogenta_media` est indépendante du contrat A — ajouter `folder_id` et une
table `cogenta_media_folders` est un changement interne au sous-système média, sans
impact contrat A/schema@2.0, de la même classe que l'ajout de `tags`/`content_hash`
en fiche 11 (migration mineure, réversible). Le module
`packages/schema/src/store/taxonomy-path.ts` (ADR-0022) fournit déjà tout
l'outillage de chemin matérialisé (`childPath`, `depthOf`, `isWithin`, `isBelow`,
`rebasedPath`, `assertDepth`, profondeur bornée à 12) — à réutiliser tel quel.

La fiche 11 avait tranché « étiquettes plutôt que dossiers » en notant
explicitement que la taxonomie hiérarchique fournit déjà le modèle si des dossiers
sont réellement voulus — préférence non retenue par le retour utilisateur direct,
pas une décision actée à contredire. Les étiquettes restent utiles en complément
(multi-appartenance).

## 3. Ce que font les CMS de référence

WordPress : pas de dossiers natifs (plugins tiers type FileBird). Strapi 5 :
dossiers natifs de premier niveau, un fichier par dossier, glisser-déposer,
breadcrumb, recherche récursive ou limitée au dossier courant.

## 4. Plan de développement

### (a) Modèle de dossiers + migration

**Tâche 1** — `packages/core/src/media/types.ts` : `MediaFolder { id, parentId:
string|null, name, path, position, createdAt }`, `folderId: string|null` sur
`MediaAsset`/`CreateMediaInput`/`UpdateMediaInput`, `ListMediaOptions.folderId`
(+ `includeSubfolders?`).

**Tâche 2** — `store.ts`/nouveau `folder-store.ts` : table `cogenta_media_folders`,
`folder_id` sur `cogenta_media` (`ALTER TABLE ADD COLUMN` try/catch, pattern
`tags`), index sur `(folder_id)`/`(path)`. Réutiliser `taxonomy-path.ts`.
**Critère** : migration up/down/up testée SQLite/Postgres/MySQL (skill
`write-migration`, agent `db-dialect-specialist`).

**Tâche 3** — Suite de contrat `MediaFolderStore` (create/rename/move/delete/
list-tree), y compris « dossier non vide » et « déplacement dans son propre
sous-arbre » (refusé, même garde que taxonomie).

### (b) Écran arborescence + déplacement

**Tâche 4** — `media-router.ts` : routes `/api/media/folders` (CRUD), `POST
/api/media/{id}/move`, `POST /-/bulk-move`.

**Tâche 5** — Nouveau composant admin (arborescence latérale, glisser-déposer un
asset vers un dossier, breadcrumb, création/renommage/suppression de dossier avec
avertissement si non vide). **Critère** : créer un sous-dossier de « contents », y
déplacer 5 assets, les retrouver en filtrant par ce dossier.

### (c) Dossier par défaut « contents »

**Tâche 6** — Amorçage : à la première utilisation, créer le dossier racine
`contents` (`parentId: null`, non supprimable ou suppression bloquée si non vide).
Tout média existant sans `folderId` reste non classé (racine virtuelle) plutôt que
forcé dans `contents`, pour ne rien casser. **Critère** : un site neuf a `contents`
créé automatiquement ; on peut créer un dossier frère de `contents` à la racine et
un sous-dossier de `contents`.

### (d) Gestion enrichie (câblage du travail déjà écrit + nouveau)

**Tâche 7 — prioritaire, faible risque, fort gain** : `media-client.ts` +
`routes/media.tsx` + `media-detail.tsx` — recherche/filtre/tri/pagination (déjà en
API, réutilise le composant de pagination de la fiche 67), upload multipart
multiple avec progression, sélection multiple + actions groupées, panneau détail
enrichi (dimensions/poids/type/date/tags/usage/EXIF, déjà en API), copier l'URL,
remplacement de fichier.

**Tâche 8** — Nouveau : sélecteur de dossier dans le formulaire d'upload, filtre
par dossier dans le sélecteur de média des champs.

## 5. Critères d'acceptation

- Un dossier « contents » existe par défaut, avec sous-dossiers et dossiers frères
  possibles.
- Glisser un média dans un dossier le déplace, retrouvable par filtre.
- Recherche, filtre, tri, pagination, sélection multiple et actions groupées
  fonctionnent à l'écran (pas seulement en API).
- Le panneau détail affiche dimensions, poids, type, date, tags, usage.

## 6. Tests exigés

- Migration up/down/up sur les trois dialectes (skill `write-migration`).
- Contrat : `MediaFolderStore`, cas « non vide » et « déplacement dans son propre
  sous-arbre ».
- Bout en bout : upload multiple, déplacement, filtre par dossier, suppression
  groupée.

## 7. Pièges connus

- Ne pas forcer les médias existants dans `contents` à la migration — casserait
  silencieusement des usages déjà en place.
- Le driver dégradé (SQLite) doit être testé, pas seulement Postgres/MySQL — piège
  déjà documenté pour le pattern try/catch de fiche 11, jamais exécuté sur les
  trois dialectes réels en session précédente.

## 8. Décisions à prendre

Aucune bloquante.
