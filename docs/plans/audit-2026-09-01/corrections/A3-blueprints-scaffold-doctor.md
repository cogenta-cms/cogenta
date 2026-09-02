# A3 — Blueprints, scaffold, doctor

Agent de correction A3. Périmètre : `packages/create-cogenta/**`,
`packages/cli/src/commands/doctor.ts` et ses tests, `docs/getting-started.md`.

Statut : **terminé (5/5 tâches)**.

## 1. P0 — Champs SEO dans tous les blueprints (fiche 06, T01)

**Fait.** Noms de champs vérifiés par grep contre `seo-panel.tsx`
(`packages/admin/src/seo/seo-panel.tsx`) et `packages/seo/src/metadata.ts`/
`indexable.ts` avant tout code : `seoTitle`, `seoDescription`, `seoImage`,
`seoNoindex` (`seoCanonical` volontairement exclu, comme demandé par T01).

- Nouveau `SEO_FIELDS` exporté par `blueprints/content-pack.ts`, spread dans
  chaque collection routée plutôt que dupliqué neuf fois — `f.text({max:60})`,
  `f.text({max:160, multiline:true})`, `f.media({accept:['image']})` (nom de
  clé vérifié : `accept`, pas `accepts`), `f.boolean({default:false})`.
- `definePageCollection()` (helper partagé par 8 des 9 blueprints pour leur
  collection `page`) gagne `...SEO_FIELDS` — un seul point d'ajout couvre
  `association`/`documentation`/`magazine`/`portfolio`/`restaurant`/`saas`/
  `store`/`vitrine`.
- Ajouté directement sur la collection routée principale de chacun de ces
  9 blueprints (`event`, `post`, `doc_page`, `article`, `project`,
  `menu_item`, `feature`, `product`, `service`) — `blog.ts` a sa propre
  collection `page` écrite à la main (pas le helper), donc `post` et `page`
  y reçoivent le spread directement.
- `admin.label`/`admin.help` en anglais uniquement : `FieldAdminOptions.label`
  (`packages/schema/src/types.ts`) est une simple `string`, sans mécanisme
  par-locale — contrairement à `TaxonomyDefinition.labels`, qui lui est
  indexé par locale. Documenté dans le commentaire de `SEO_FIELDS` ; tout le
  reste du contenu de blueprint est déjà anglais uniquement, donc pas de
  régression de cohérence.
- `testimonial` (vitrine) et `category`/`tag` (blog, non routés même avant
  T02) exclus à raison — pas de `routing`, donc le panneau SEO n'y est de
  toute façon jamais atteignable.

**Tests** : un test ajouté par fichier `*-blueprint.test.ts` existant
(9 fichiers) vérifiant `Object.keys(collection.fields)` sur chaque
collection routée. Nouveau `test/seo-fields-blueprint.test.ts` : test de
bout en bout réel — scaffold du blueprint `blog`, écriture directe de
`seoTitle` sur l'article de démo via le vrai `ContentStore`, **`publish()`
explicite** (le premier essai a échoué : `post` a `versioning:{drafts:true}`,
donc `update()` sur une entrée déjà publiée atterrit en brouillon et ne
touche jamais ce que le public voit — bug de test trouvé et corrigé, pas un
bug produit), démarrage d'un vrai `cogenta serve`, requête HTTP réelle sur
`/blog/welcome-to-cogenta`, assertion que `<title>` contient exactement le
`seoTitle` saisi et plus l'ancien titre.

Preuve : `pnpm -F create-cogenta typecheck` (vert) ; `vitest run` sur les
9 fichiers `*-blueprint.test.ts` touchés + `seo-fields-blueprint.test.ts` :
**42/42 verts** (voir §6).

## 2. P1 — Taxonomies natives dans le blueprint `blog` (fiche 04, T02)

**Fait.** `category`/`tag` remplacés par `defineTaxonomy()` (au lieu de
`defineCollection()`), `post.category`/`post.tags` remplacés par
`f.taxonomy({of:'category', many:false})`/`f.taxonomy({of:'tag', many:true})`
au lieu de `f.relation(...)`. `category` reste hiérarchique (valeur par
défaut) ; `tag` déclaré `hierarchical:false` (plat, conforme au commentaire
de `defineTaxonomy` sur les taxonomies de type étiquette).

- `BLOG_COLLECTIONS` ne contient plus que `[post, page]` ; nouveau
  `BLOG_TAXONOMIES = [category, tag]`, validé par `validateTaxonomySet`
  (en plus de `validateCollectionSet`) — au niveau import, comme le reste
  du fichier.
- `seedBlogDemoContent` : les catégories/étiquettes de démo passent
  maintenant par `createTaxonomyStore({db, taxonomy})` au lieu de
  `createContentStore`. `TaxonomyStore.list()` renvoie un tableau, pas une
  page `{items}` — différence trouvée et corrigée dans le test.
- `BlueprintContentPack` (`content-pack.ts`) gagne un champ optionnel
  `taxonomies?: readonly TaxonomyDefinition[]` — absent partout ailleurs
  (les 8 autres blueprints n'en déclarent aucune), donc rétrocompatible par
  construction.
- `scaffold.ts` : `schemaFileContents()` écrit désormais un second export
  nommé `export const taxonomies = [...]` (uniquement si non vide) à côté
  du `export default` des collections — exactement le nom que
  `loadSchemaModule`/`loadCollections` (`@cogenta/cli`, déjà écrit avant
  cette session) lisent. `createSchemaTables(db, merged.all, taxonomies)`
  reçoit désormais le tableau réel au lieu du défaut `[]` implicite.
- `playground-reset.ts` : `dropSchemaTables`/`createSchemaTables` reçoivent
  aussi `pack.taxonomies ?? []`, pour que la réinitialisation du bac à
  sable public (L9 tâche 12) recrée les bonnes tables de termes.

**Comportement changé, assumé** : `category` n'a plus de route propre —
une taxonomie ne déclare pas de `routing` (contrat A, `schema@2.0`), donc
`/blog/category/:slug` disparaît avec l'ancienne collection. Une page
d'archive de terme n'est pas ce que cette correction ajoute (hors périmètre
de T02). Documenté dans un commentaire et le test de routage mis à jour en
conséquence, plutôt que silencieusement supprimé.

**Tests** : `blog-blueprint.test.ts` — premier test renommé et étendu pour
vérifier `loadCollections` (`['page','post']`, plus `category`/`tag`) et le
contenu brut du fichier écrit pour son export `taxonomies` nommé (choix
délibéré : ne pas élargir la surface publique de `@cogenta/cli` juste pour
un test — `loadSchemaModule`/`LoadedSchema` ne sont pas exportés par
`packages/cli/src/index.ts`, donc lus via le fichier lui-même plutôt que
d'ajouter un export). Test de seed mis à jour pour `TaxonomyStore`. Test de
routage renommé, l'assertion `/blog/category/:slug` retirée avec
explication. `playground-reset.test.ts` : le test d'attribution d'auteur
utilisait `category`(désormais sans `createdBy`, un terme n'a pas d'auteur,
ADR-0022) — changé pour vérifier l'attribution sur `post` à la place.

Preuve : `pnpm -F create-cogenta typecheck` vert ; `blog-blueprint.test.ts` +
`playground-reset.test.ts` isolés : **14/14 verts**.

## 3. P1 — `packageJsonContents` : `scripts.start` / `engines.node` (fiche 15, T04)

**Fait.** `package.json` scaffoldé gagne `"scripts": {"start": "cogenta serve"}`
et `"engines": {"node": ">=22.13"}` — version alignée sur celle déjà vérifiée
par `doctor.ts` (`process.versions.node < 22.13` → problème) et par
l'installeur lui-même.

**Tests** : nouveau test dans `scaffold.test.ts` lisant le `package.json`
réellement écrit sur disque et vérifiant les deux champs. Preuve :
`vitest run scaffold.test.ts` : **4/4 verts**.

## 4. P2 — `cogenta doctor` : drivers `images`/`vector`/`imageGeneration` (fiche 15 T05 + fiche 05 T06)

**Fait, avec un écart assumé sur `imageGeneration`.**

- **`images`** (fiche 05, item « ne rapporte pas le driver d'images ») :
  `check('images', () => createImageRegistry(registryOptions).select({}))` —
  exactement l'appel réel (`media-images.ts`'s `buildImageProcessing`,
  `createImageRegistry({logger}).select({})`, aucune section de config pour
  ce besoin). `@cogenta/render` était déjà une dépendance de `@cogenta/cli`
  (aucune dépendance nouvelle, R9).
- **`vector`** (fiche 15, T05) : `check('vector', ...)` ouvre sa **propre**
  connexion base (jamais celle, déjà disposée, du `check('database', ...)`
  précédent) parce que le driver `pgvector` a besoin d'un vrai
  `DatabaseHandle` — `check()` gagne un paramètre `cleanup` optionnel
  exécuté après la disposition de la sélection, pour fermer cette connexion
  dédiée sans dupliquer toute la logique de `check()`. `config.embeddings.
  dimensions` a toujours une valeur par défaut (384), donc le contrôle
  tourne inconditionnellement, cohérent avec R1/R2 (un défaut dégradé
  existe toujours). `@cogenta/agents` était déjà une dépendance de
  `@cogenta/cli` (aucune dépendance nouvelle).
- **`imageGeneration`** : **écart assumé et documenté dans le commit** —
  le plan suggérait `await check('imageGeneration', ...)`, mais
  `createImageProviderRegistry` (`@cogenta/agents`) n'a **aucun** concept de
  palier optimal/dégradé ni de `health()`/`dispose()` (il n'existe pas de
  génération d'image sans service externe — R2 est la raison même pour
  laquelle cette section n'a aucun défaut). Le forcer dans `check()` aurait
  fabriqué un `DriverSelection` qui n'existe pas dans le code réel. Rapporté
  comme une **note** (même patron que la note LLM déjà existante) : nom du
  fournisseur, modèle, présence de la clé API — uniquement quand
  `config.imageGeneration` est défini, jamais un problème sinon.

**Tests** : `doctor.test.ts` — jeu de checks existant (« reports a working
install ») mis à jour (`images`/`vector` apparaissent désormais dans
l'ordre réel des checks ; `images:sharp` est `optimal` sur cette machine
puisque `sharp` compile nativement ici — un module natif local, pas un
service externe, donc explicitement exclu de l'assertion « tout est
dégradé » avec un commentaire expliquant pourquoi). Deux nouveaux tests
exigés par T05 : `vector.driver:'pgvector'` sur un site SQLite échoue avec
un problème nommé `vector: ...` (`DRIVER_UNAVAILABLE`, jamais une pile
d'appels) ; `vector` absent du tout ne produit aucun problème (palier
dégradé `file`, jamais `optimal` sur cette configuration). Deux tests
supplémentaires pour `imageGeneration` (silence si absent ; nom du
fournisseur + clé API manquante si présent).

Preuve : `pnpm -F @cogenta/cli typecheck` vert ; `doctor.test.ts` :
**23/23 verts** ; `serve-health.test.ts` (compare `GET /api/health-report`
à un appel direct de `runDoctor`, non modifié, vérifié pour non-régression
puisqu'il consomme `report.checks`) : **5/5 verts**.

## 5. P3 — `docs/getting-started.md` : liste réelle des blueprints (fiche 15)

**Fait**, plus une correction de dérive documentaire trouvée en cours de
route (pas dans le périmètre initial de T05/T10, mais causée directement
par la tâche 2 de cette même mission) :

- « blank ou blog — plus de blueprints à venir » remplacé par la liste
  réelle des dix (`blank` + les neuf blueprints réels), avec un lien vers
  `packages/create-cogenta/src/blueprints/registry.ts` comme source de
  vérité plutôt qu'une liste à retenir manuellement à jour.
- Le paragraphe « Choosing the blog site type additionally writes... »
  mis à jour : mention des champs SEO désormais déclarés, et de
  `category`/`tag` comme taxonomies plutôt que collections.
- La section « 5. A first real edit » proposait d'ajouter
  `tags: f.relation({to:'tag', ...})` en renvoyant vers `post`/`tag` de
  `blog.ts` comme « exemple complet avec une vraie relation » — **devenu
  faux après la tâche 2** (`tag` n'est plus une collection, ce `f.relation`
  littéral échouerait désormais à la validation du jeu de collections).
  Corrigé : l'exemple utilise maintenant `f.taxonomy()` (l'idiome correct
  pour ce cas, `schema@2.0`) et renvoie vers `category`/`tag` de `blog.ts` ;
  `f.relation()` reste documenté comme le bon outil quand la cible a son
  propre cycle de vie, avec un exemple réel toujours valide
  (`comment.post` dans `packages/import/src/wordpress/collections.ts`).
- Bullet « What you get » mise à jour pour mentionner `scripts.start`/
  `engines.node` (tâche 3).

Preuve : `node scripts/check-docs-examples.mjs` → « All documentation
examples match their source files. » (les deux seuls blocs `<!-- embed -->`
n'ont pas été touchés).

## 6. Vérification globale

- `pnpm -F create-cogenta typecheck` : vert.
- `pnpm -F @cogenta/cli typecheck` : vert.
- `pnpm exec biome check --write` sur tous les fichiers touchés : deux
  correctifs de forme automatiques appliqués (`scaffold.ts`,
  `doctor.ts`), aucune modification de comportement.
- Suite complète `create-cogenta` lancée une fois en cours de route
  (avant les derniers correctifs) : **143/145 verts**, 2 échecs — tous
  deux des timeouts (`index.test.ts`, `search-indexing.e2e.test.ts`) sous
  forte parallélisation, **sans rapport avec cette correction** (déjà
  documentés comme famille de flake connue dans `CLAUDE.md` — confirmé en
  isolant les fichiers réellement touchés par cette mission, tous verts,
  voir ci-dessus §1-3).
- `doctor.test.ts` + `serve-health.test.ts` : 28/28 verts.

## 7. Changesets

- `.changeset/blueprints-seo-taxonomies-scaffold.md` — `create-cogenta`
  minor (champs SEO + taxonomies + `scripts.start`/`engines.node`).
- `.changeset/doctor-images-vector-imagegen.md` — `@cogenta/cli` patch
  (rapport de drivers `images`/`vector` + note `imageGeneration`).

## 8. Hors périmètre, non traité

- T02 (fiche 06, insertion ADR-0032) — geste humain, hors du périmètre de
  cet agent (fichier de décisions protégé en écriture).
- T10 (fiche 15) chevauche entièrement T01+T02 déjà traités ici pour les
  champs concernés ; les autres tâches de la fiche 15 (T06 cron,
  T07 `cogenta update`, T11 importeurs Ghost/Markdown) sont hors du
  périmètre explicite de cette mission.
- Le reste de la fiche 05 (`05-mediatheque.md`) au-delà du point doctor
  cité dans la mission n'a pas été touché.
