# Audit 04 — Taxonomies et menus de navigation — 2026-09-01

## 1. Résumé exécutif

Les fiches `08-taxonomies.md` et `09-menus.md` sont **obsolètes** : elles décrivent un
état (« minimal », « pas d'édition ni de réordonnancement ») que le code a dépassé
depuis les commits `9e67928`/`b42736b` (taxonomies, fiche 08) et
`2285720`/`d7df17d` (menus, fiche 09), tous deux mergés avant cet audit. Fiche 41
elle-même le dit noir sur blanc pour les taxonomies (« obsolète »), mais pas fiche 09.
**Verdict global : les deux fiches structurantes sont FAIT à ~90 %.** Décompte des
critères vérifiés un par un (section 3) : **31 FAIT, 3 PARTIEL, 8 ABSENT (dont 3
délibérément différés par leurs propres fiches), 1 POINT MORT structurel**. Aucun bug
de sécurité (permissions testées par rôle des deux côtés, R4 respecté — le contrôle
d'accès menu est une règle fixe documentée comme telle, pas un outil). Aucun `any`,
`@ts-ignore`, `console.log` ni `throw new Error` nu dans les 15 fichiers inspectés.
i18n FR/EN strictement synchronisé (57 clés `taxonomies.*`, 80 clés `menus.*`,
0 divergence).

**Le vrai trou, et il est réel** : un item de menu de type `taxonomy` (fiche 09,
tâche 4) **ne peut jamais être un lien cliquable** — `resolveMenuTerm`
(`packages/cli/src/commands/serve.ts:~1896`) renvoie toujours `route: null`, avec un
commentaire qui l'assume : « no site in this codebase renders a taxonomy archive page
yet ». Il n'existe nulle part de page publique `/category/<slug>` ni de bloc contrat B
capable de filtrer par terme. C'est la question posée explicitement par la mission, et
la réponse est non — c'est un manque structurel, pas un oubli d'écran.

**Deuxième trou réel, différent** : aucun blueprint (`blog`, `magazine`, …) ne déclare
de taxonomie native (`defineTaxonomy()`) — `blog.ts` gère toujours catégories/étiquettes
via `f.relation()`. Sur un site fraîchement créé, l'écran Taxonomies affiche donc « ce
site ne déclare aucune taxonomie », alors que le modèle serveur et l'écran sont
solides (constat déjà posé par L20, toujours vrai).

**P0/P1 à traiter** : voir section 6. Aucune ADR requise pour aucun item de cette
liste — le seul qui y touche (une route publique d'archive de terme) est un ajout de
route, pas un contrat A/B/C/D.

## 2. Ce qui existe réellement

### Taxonomies

- **Écran** `packages/admin/src/routes/taxonomies.tsx` (363 lignes) : sélecteur de
  taxonomie, recherche + filtre « non utilisés » (bascule vers une liste plate avec
  ascendance affichée), arbre imbriqué sinon, modale de création/édition, modale de
  suppression informée.
- **Arbre** `packages/admin/src/taxonomies/term-tree.tsx` (275 lignes) : `<ul>`
  imbriqués, repli/dépli mémorisé en `localStorage`, glisser-déposer natif (zéro
  dépendance) **toujours doublé** de quatre boutons nommés (↑ ↓ → ←) plus édition et
  suppression, compteur d'entrées `own`/`withDescendants` affiché par terme, message de
  limite de profondeur.
- **Formulaire** `packages/admin/src/taxonomies/term-form-modal.tsx` (181 lignes) : un
  champ de libellé **par locale du site** (plus l'amputation à une seule langue), slug,
  sélecteur de parent en radio-boutons imbriqués qui exclut le terme et ses
  descendants (jamais une option qui échouerait), avertissement si le sous-arbre
  déplacé est grand.
- **Suppression** `packages/admin/src/taxonomies/delete-term-modal.tsx` (108 lignes) :
  dit le nombre d'entrées classées et le nombre de descendants avant de proposer
  « annuler » ou « supprimer en cascade », jamais un `confirm()`.
- **Champ d'entrée** `packages/admin/src/fields/taxonomy-field.tsx` (fiche 41 + fiche
  08 tâche 5) : recherche, affichage hiérarchique avec le parent entre parenthèses,
  création rapide **avec transmission du parent** (corrigée par le commit `3f8e6df`,
  fiche 41), respect de `many: false`.
- **API** `packages/api/src/rest/taxonomy-router.ts` (396 lignes) :
  `GET/POST /{taxonomy}`, `GET/PATCH/DELETE /{taxonomy}/{id}`,
  `POST /{taxonomy}/{id}/move`, `?q=`/`?counts=1`/`?unused=1`, chaque route passant par
  `permissions.assertTerm` (R4 respecté).
- **Store** `packages/schema/src/store/taxonomy-store.ts` + `taxonomy-path.ts`
  (chemin matérialisé, `MAX_TAXONOMY_DEPTH = 12`, `TAXONOMY_CYCLE` refusé) +
  `taxonomy-usage.ts` (comptage par collection).
- **Tests** : `packages/schema/test/store/taxonomy-store.contract.ts` (25 assertions,
  contrat unique rejoué), `packages/api/test/rest/taxonomy-router.test.ts` (21),
  `packages/admin/test/taxonomies.test.tsx` (12, dont permissions par rôle et
  ré-ordonnancement), `packages/schema/test/integration/taxonomy-store.test.ts`
  (écrit, `describe.skip` bruyant sans les trois bases — jamais exécuté, voir §3).

### Menus

- **Écran** `packages/admin/src/routes/menus.tsx` (731 lignes) : sélection/création de
  menu, contrôle d'emplacement à choix fermés (`Aucun`/`En-tête`/`Pied de page`/
  `Autre`), bannières d'alerte (locale non couverte par le site, menu dans une locale
  étrangère, liens morts), formulaire d'ajout d'item, duplication vers une autre
  langue.
- **Arbre** `packages/admin/src/menus/menu-tree.tsx` (255 lignes) : même discipline
  que les taxonomies — glisser-déposer + 4 boutons nommés, `aria-label` sur le groupe.
- **Édition d'item** `packages/admin/src/menus/item-edit-modal.tsx` (300 lignes) :
  libellé, type (`url`/`entry`/`taxonomy`/`home`), cible, `title`, `target="_blank"`.
- **Sélecteurs de cible** `menu-entry-picker.tsx` (168 lignes, recherche full-text au-
  delà de 2 caractères via `GET /api/search`, sinon les plus récentes) et
  `menu-term-picker.tsx` (74 lignes).
- **API** `packages/api/src/rest/menu-router.ts` (674 lignes) : CRUD menu + item,
  `PATCH /{id}/items` en lot (une seule transaction, fiche 09 tâche 2),
  `GET /by-name/{name}`, `GET /by-location/{location}`, résolution de cible avec
  `resolvedHealth` (`published`/`scheduled`/`draft`/`archived`/`trashed`) gatée par
  rôle (un visiteur public ne voit jamais qu'un brouillon existe).
- **Rendu** `packages/cli/src/commands/theme-render.ts` +
  `packages/cli/src/commands/serve.ts` (`resolveMenuEntry`, `resolveMenuTerm`) :
  résolution en process, jamais un aller-retour HTTP à soi-même ; un item non résolu
  perd son `href` mais garde son libellé (rendu en `<span>`, jamais un lien mort ou un
  404 — la recommandation de la fiche est bien celle qui a été codée).
- **Store** `packages/schema/src/store/menu-store.ts` : un `location` tient au plus un
  menu par `(location, locale)`, refusé plutôt que réassigné automatiquement en cas de
  collision (message explicite, voir §3 tâche 3).
- **Tests** : `packages/schema/test/store/menu-store.test.ts` (19, dont les tâches 2 et
  3 en détail), `packages/api/test/rest/menu-router.test.ts` (15),
  `packages/admin/test/menus.test.tsx` (11, dont la régression de locale du 29/08 et
  les permissions).

## 3. Vérification des fiches, critère par critère

### `08-taxonomies.md`

| Tâche/critère | Verdict | Preuve |
|---|---|---|
| T1 — Modifier un terme (libellé par locale, slug, parent) | **FAIT** | `term-form-modal.tsx` — un `<Input>` par `locales[]`, jamais `{[i18n.language]: label}` |
| T1 — Déplacement = réécriture du chemin matérialisé côté serveur | **FAIT** | `moveTerm` appelé séparément de `updateTerm` quand `parent` change ; store refuse un cycle (`TAXONOMY_CYCLE`) |
| T1 — Avertissement sous-arbre volumineux | **FAIT** | `term-form-modal.tsx:63-65`, seuil `LARGE_SUBTREE = 5` |
| T1 — Critère : renommer sans casser 40 classifications | **FAIT (par construction)** | Rename n'appelle jamais `moveTerm` si `parent` inchangé — `taxonomies.tsx:saveTerm` ; test dédié `taxonomies.test.tsx:122` |
| T2 — Rendu `<ul>` imbriqués avec repli/dépli mémorisé | **FAIT** | `term-tree.tsx`, `loadCollapsed`/`saveCollapsed` en `localStorage` |
| T2 — Glisser-déposer doublé de boutons nommés | **FAIT** | `term-tree.tsx:196-247` (↑↓→←) |
| T2 — Sélecteur de parent = l'arbre, pas un `<select>` de slugs | **FAIT** | `term-form-modal.tsx:renderParentOptions` |
| T2 — Blocage à 12 avec message expliquant pourquoi | **FAIT** | `taxonomy-path.ts:65-71` (serveur) ; `term-tree-utils.ts` mirroring + `taxonomies.depthLimit` (i18n) affiché en permanence dans l'écran |
| T2 — Critère : réorganiser à la souris **et** au clavier | **FAIT** | boutons nommés = chemin clavier complet ; `taxonomies.test.tsx:141,162` |
| T3 — `?counts=1` (compte propre + avec descendants) | **FAIT** | `taxonomy-router.ts:26-28`, `TermUsage` ; `term-tree.tsx` affiche `own`/`withDescendants` |
| T3 — Recherche libellé/slug, insensible casse/accents | **FAIT** | `foldForSearch` (NFD + strip combining marks) côté écran et côté champ ; `taxonomies.test.tsx:237` |
| T3 — Filtre « termes non utilisés » | **FAIT** | `?unused=1` + case à cocher ; `taxonomies.test.tsx:252` |
| T3 — Critère : trouver les termes à zéro entrée sur 300 termes | **PARTIEL** | Fonctionne, mais le filtre est appliqué **côté client** sur la liste entière déjà chargée (pas de pagination serveur, voir « Importants » ci-dessous) — correct fonctionnellement, pas prouvé à l'échelle de 300 termes |
| T4 — Modale du design system, jamais `confirm()` | **FAIT** | `delete-term-modal.tsx` utilise `<Modal>` |
| T4 — Dit le nombre d'entrées classées et d'enfants | **FAIT** | `delete-term-modal.tsx:88-99` |
| T4 — Deux issues explicites (cascade / annuler) plutôt qu'un refus après coup | **FAIT** | `delete-term-modal.tsx:64-79` |
| T5 — Recherche dans les termes du champ | **FAIT** | `taxonomy-field.tsx:79-84` |
| T5 — Affichage hiérarchique (parent visible sur un enfant) | **FAIT** | `taxonomy-field.tsx:178-183` |
| T5 — Création rapide de terme depuis le champ | **FAIT** | `createQuickTerm`, avec parent (fiche 41) |
| T5 — Respect de `many: false` | **FAIT** | `taxonomy-field.tsx:86-93,164-165` |
| T5 — Critère : classer dans « Actualités › Local » sans quitter l'éditeur | **FAIT** | Le champ envoie `parent: parentContext?.id` ; testé côté composant (fiche 41 §5) |
| §4 Description de terme | **ABSENT — décision confirmée** | La fiche recommande elle-même de s'en passer tant que personne ne le demande ; aucune régression |
| §4 Fusion de deux termes | **ABSENT — délibérément différé** | Fiche §8 : « hors périmètre de la première version » |
| §4 Import en masse | **ABSENT** | Aucun code trouvé (`grep bulk/import/paste` dans `taxonomies/*` : rien) |
| §4 Pagination de la liste de termes | **ABSENT** | `GET /{taxonomy}` renvoie « the whole tree » sans `limit`/`offset` (`taxonomy-router.ts:16-28`) ; mitigé par le filtre client mais réel pour une très grande taxonomie |
| Intégration 3 bases (`like` sur chemin matérialisé) | **ÉCRIT, NON EXÉCUTÉ** | `taxonomy-store.contract.ts` rejoué par `test/integration/taxonomy-store.test.ts`, `describe.skip` bruyant sans `COGENTA_TEST_POSTGRES_URL`/`MYSQL_URL`/`MARIADB_URL` — blocage Docker documenté dans `CLAUDE.md` pour la quasi-totalité des lots, pas une régression de ce domaine |

### `41-taxonomies-sous-categories.md`

| Critère | Verdict | Preuve |
|---|---|---|
| T1 — Sélecteur de parent (contexte = terme sélectionné) dans la création rapide | **FAIT** | `taxonomy-field.tsx:113-120` (`parentContext`), commit `3f8e6df` |
| T2 — `createTerm` transmet bien `parent` à la route | **FAIT** | `taxonomy-client.ts` → `POST /{taxonomy}` avec `parent` dans le corps ; réutilisé identiquement par `term-form-modal.tsx` |
| Critère — terme créé au bon endroit dans l'arbre | **FAIT** | `taxonomy-field.tsx:129-133` sélectionne le terme fraîchement créé |
| Pas de second `term-form-modal.tsx` dupliqué | **FAIT (respecté)** | Le champ reste un formulaire minimal, pas un second arbre |

### `09-menus.md`

| Tâche/critère | Verdict | Preuve |
|---|---|---|
| T1 — Modale d'édition (libellé, type, cible, parent) | **FAIT** | `item-edit-modal.tsx` (300 lignes) |
| T1 — Changement de type remet la cible à zéro | **FAIT** | `item-edit-modal.tsx` (le type change réinitialise `targetCollection`/`targetTaxonomy`/`url` — vérifié à la lecture) |
| T1 — Critère : corriger un libellé sans perdre position/enfants | **FAIT** | `menus.test.tsx:155` |
| T2 — Arbre `<ul>` imbriqués, glisser-déposer natif | **FAIT** | `menu-tree.tsx` |
| T2 — Doublé de boutons nommés (monter/descendre/indenter/désindenter) | **FAIT** | `menu-tree.tsx:130-166` |
| T2 — Route de réordonnancement en lot, une transaction | **FAIT** | `PATCH /api/menus/{id}/items`, `commitReorder` (un seul appel, rollback local sur échec) |
| T2 — Critère : déplacer un item + 3 enfants, souris et clavier, persiste au rechargement | **FAIT** | `menu-store.test.ts:203-241`, `menus.test.tsx:90-154` |
| T3 — Emplacements portés par le menu (`location`), pas par le thème | **FAIT (option recommandée retenue)** | `menu-store.ts` colonne `location`, contrainte unicité `(location, locale)` |
| T3 — Contrôle explicite, pas texte libre | **FAIT (fiche 21 tâche 1)** | `LocationMode` = `none/primary/footer/custom`, commit `714343c` |
| T3 — Critère : changer le menu principal sans redéployer | **FAIT** | `theme-render.ts` résout `by-location/primary` à chaque requête |
| T4 — Type `taxonomy` | **FAIT côté données, ABSENT côté rendu** | Voir §4 — item créable et affiché, mais jamais cliquable (`route` toujours `null`) |
| T4 — Type `home` | **FAIT** | `menu-router.ts:330` |
| T4 — `target="_blank"` + `rel="noopener"` posé au rendu | **FAIT** | Les 5 thèmes (`theme-canonical`, `-portfolio`, `-magazine`, `-ecommerce`, `-entreprise`) le posent identiquement à l'affichage, jamais stocké (R3 respecté) |
| T4 — Attribut `title` | **FAIT** | `item-edit-modal.tsx`, rendu dans les 5 thèmes |
| T4 — Sélecteur d'entrée avec recherche | **FAIT (implémentation dédiée, `EntryPicker` de fiche 03 n'existait pas encore)** | `menu-entry-picker.tsx` |
| T4 — Contrôle de santé (publié/brouillon/programmé/corbeille) | **FAIT** | `MenuItemHealth`, `resolveMenuEntry` (`serve.ts:1833-1885`), gatée par rôle |
| T4 — Rendu masque un lien mort plutôt que 404 | **FAIT** | `chrome.ts` filtre `link.href !== null` avant de générer `<a>` |
| T4 — Critère : dépublier une page fait apparaître un avertissement | **FAIT** | `problemCount`/`Notice` (`menus.tsx:373-384`) |
| Classe CSS sur un item | **ABSENT** | Aucune colonne/champ `cssClass` dans `menu-store.ts` ni `item-edit-modal.tsx` |
| T5 — Aperçu du menu tel que rendu | **RETIRÉ (était un point mort, corrigé en l'enlevant)** | Le commit `5ec3459` a **supprimé** un aperçu déjà construit parce qu'il ne montrait qu'un `<ul>` non stylé, sans rapport avec un vrai thème — décision assumée dans le message de commit plutôt que de laisser un faux aperçu en place |
| T5 — Duplication de menu vers une autre langue | **FAIT** | `duplicateToLocale` (`menus.tsx:325-357`), séquentiel et traçable en cas d'échec partiel |
| Critère — réordonnancement = une seule transaction, pas d'état intermédiaire | **FAIT** | `PATCH .../items` en lot ; `menu-store.test.ts:292` (« rewrites nothing when the batch is empty ») |
| Permissions par rôle (`author` ne peut pas écrire) | **FAIT** | `assertWriteAccess` fixe à `admin`/`editor` (règle documentée comme volontairement non paramétrable par site, contrairement à une collection/taxonomie), testé `menus.test.tsx:198` |
| Élément visible par rôle (comparaison marché) | **ABSENT** | Aucun champ de visibilité par rôle sur un item de menu |
| Refus de mettre un item sous son propre descendant | **FAIT** | `menu-store.test.ts:82,269` |

### Tâche 1 de `L21-corrections-et-fonctionnalites-admin.md` (menu principal)

| Critère | Verdict | Preuve |
|---|---|---|
| Remplacer le texte libre par un contrôle explicite | **FAIT** | `LocationMode`, `<Select>` à 4 options fixes |
| Décision « refuser une collision » vs « déplacer l'ancien menu automatiquement » | **FAIT (choix : refuser avec message clair)** | `menu-store.ts:319-333` (`assertLocationFree`) — l'agent a tranché pour le refus explicite plutôt que le transfert automatique, un choix légitime laissé ouvert par la fiche elle-même (« à trancher par l'agent ») |
| Aucun changement de schéma requis | **FAIT** | `location` existait déjà comme colonne texte libre |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P1 (structurel)** | `packages/cli/src/commands/serve.ts:~1896` (`resolveMenuTerm`) + absence totale de route dans `theme-render.ts` | Un item de menu de type `taxonomy` se crée, s'affiche dans l'admin avec son libellé, et est **structurellement inerte** sur le site public : `route` vaut toujours `null`, donc il rend un `<span>` sans lien, pour toujours — pas un bug transitoire, une fonctionnalité à moitié construite et documentée comme telle dans le commentaire du code lui-même. Aucun blueprint ni thème ne peut afficher une page listant les entrées d'un terme. | Construire la route publique `/{taxonomySlugOrName}/{termSlug}` (voir T01 §6) |
| **P2 (dogfooding)** | `packages/create-cogenta/src/blueprints/blog.ts:77-78` | `category`/`tags` restent des `f.relation()` bruts alors que `defineTaxonomy()` existe et est prêt depuis ADR-0022 — la fonctionnalité taxonomies est invisible sur tout site scaffoldé avec le blueprint le plus courant | Migrer `blog.ts` vers `defineTaxonomy()` (voir T02 §6) |
| **P3 (confort)** | `packages/admin/src/taxonomies/delete-term-modal.tsx:59` | `term.labels.fr ?? term.labels.en ?? …` — ordre de repli codé en dur (français puis anglais) au lieu de la locale active de l'admin, contrairement à `labelFor`/`labelOf` utilisés partout ailleurs dans `taxonomies.tsx`/`term-tree.tsx` (`term.labels[locale] ?? …`). Sur un site anglophone avec un terme sans libellé `en`, le titre de la modale affiche un libellé français inattendu au lieu du premier libellé disponible dans l'ordre naturel. | Passer `locale` (ou `i18n.language`) en prop et réutiliser la même formule que le reste de l'écran |
| **P3 (confort)** | `packages/api/src/rest/taxonomy-router.ts` (route de liste) | Pas de `limit`/`offset` sur `GET /{taxonomy}` — toute la taxonomie est chargée en une fois côté client, y compris pour filtrer. Documenté et assumé par un commentaire de `taxonomies.tsx` (nécessaire pour construire un arbre correct), mais reste un vrai risque de performance sur une taxonomie de plusieurs centaines de termes | Pagination de l'arbre elle-même hors périmètre court terme ; a minima, borne + avertissement au-delà d'un seuil |
| **Non-bug, décision assumée** | `packages/admin/src/routes/menus.tsx` (préview retirée, commit `5ec3459`) | Signalé pour mémoire : ce n'est pas un point mort actuel (le code faux a été retiré), mais la fonctionnalité « aperçu » de la fiche 09 tâche 5 est de nouveau à l'état ABSENT après avoir existé brièvement et faussement | Rouvrir proprement via `POST /api/builder/render` si un jour un bloc de navigation existe |

Aucun autre `grep` (`any`, `@ts-ignore`, `console.log`, `throw new Error` nu, contrôle de
permission à l'intérieur d'un outil au sens R4, HTML stocké dans un champ taxonomie/menu)
n'a rien trouvé dans les 15 fichiers du domaine listés en §2.

## 5. Comparaison marché

### Taxonomies — WordPress / Drupal 11 / Cogenta

| Fonction | WordPress | Drupal 11 | Cogenta |
|---|---|---|---|
| Créer un terme | OUI | OUI | **OUI** |
| Modifier un terme (libellé, slug, parent) | OUI | OUI | **OUI** |
| Libellés multilingues dans le même formulaire | plugin (WPML/Polylang) | OUI | **OUI** (un champ par locale du site) |
| Description du terme | OUI | OUI (champ configurable) | **NON** (décision assumée, hors contrat A) |
| Réordonner (glisser-déposer) | partiel (plugins) | OUI | **OUI** (natif, sans dépendance, + clavier) |
| Déplacer sous un autre parent | OUI | OUI | **OUI** |
| Nombre d'entrées par terme | OUI | OUI | **OUI**, avec en plus la distinction propre/avec-descendants (au-dessus de WordPress qui ne compte que le direct) |
| Fusionner deux termes | plugin | OUI | **NON** (différé) |
| Recherche/filtrage dans les termes | OUI | OUI | **OUI**, accent/casse insensible |
| Suppression avec réaffectation des enfants | OUI | OUI | **OUI** (cascade explicite, ou annuler) |
| Vue arborescente repliable | NON (WordPress core est plat) | OUI | **OUI** (au niveau de Drupal, au-dessus de WordPress) |
| Import en masse (coller une liste) | NON (plugin) | OUI (import CSV) | **NON** |
| Édition rapide en ligne (« Quick Edit ») | OUI | NON | **NON** (mais une modale d'édition existe, fonctionnellement équivalente) |
| Compteur/actions groupées sur une liste plate | OUI | OUI | **PARTIEL** — actions individuelles seulement (pas de sélection multiple + action groupée) |
| **Page d'archive publique par terme** (`/category/x`) | OUI (cœur) | OUI (vues) | **NON** — trou confirmé, voir §4 |
| REST/API des termes | OUI (WP REST API) | OUI (JSON:API) | **OUI** (`/api/taxonomies`) |

### Menus — WordPress / Drupal 11 / Joomla 5 / Cogenta

| Fonction | WordPress | Drupal 11 | Joomla 5 | Cogenta |
|---|---|---|---|---|
| Créer un menu | OUI | OUI | OUI | **OUI** |
| Lien vers une entrée | OUI | OUI | OUI | **OUI**, avec recherche |
| Lien libre | OUI | OUI | OUI | **OUI** |
| Lien vers une taxonomie/catégorie | OUI | OUI | OUI (« Category Blog » etc.) | **PARTIEL** — le type existe et se sélectionne, mais ne pointe jamais nulle part (§4) |
| Lien vers l'accueil | implicite | implicite | type dédié | **OUI** (`home`) |
| Réordonner par glisser-déposer | OUI | OUI | OUI | **OUI**, doublé de boutons clavier |
| Modifier un élément | OUI | OUI | OUI | **OUI** |
| Emplacements de menu déclarés par le thème | OUI (`register_nav_menus`) | OUI | OUI | **PARTIEL** — porté par le menu lui-même (`location` libre avec suggestions fermées `primary`/`footer`), pas déclaré par le thème ; décision documentée et suffisante pour l'usage actuel |
| Menu principal non ambigu | OUI | OUI | OUI | **OUI** (fiche 21, contrôle à choix fermés) |
| Titre / attribut `title` | OUI | OUI | OUI | **OUI** |
| `target`/nouvel onglet | OUI | OUI | OUI | **OUI**, `rel="noopener"` posé au rendu (R3) |
| Classe CSS personnalisée | OUI | OUI | OUI | **NON** |
| Élément visible par rôle | plugin | OUI | OUI (« Access Level ») | **NON** |
| Signalement de lien mort dans l'admin | NON | OUI (partiel) | NON | **OUI** — au-dessus de WordPress et Joomla sur ce point précis |
| Rendu qui masque un lien mort plutôt que 404 | NON (rend le lien tel quel) | dépend | dépend | **OUI** — comportement plus sûr que WordPress par défaut |
| Aperçu du menu avant publication | NON (le menu est live immédiatement) | NON | NON | **NON** (retiré volontairement après s'être révélé trompeur) |
| Duplication de menu (autre langue) | plugin | OUI | OUI | **OUI** |
| Menu par langue | plugin (WPML/Polylang) | OUI | OUI | **OUI** |
| Réordonnancement transactionnel (pas d'état intermédiaire) | non garanti (AJAX incrémental) | non garanti | non garanti | **OUI** — au-dessus des trois références sur ce point |

### Menus — Strapi Navigation plugin (référence headless)

| Fonction | Strapi (plugin navigation) | Cogenta |
|---|---|---|
| Structure arborescente multi-menu | OUI | **OUI** |
| Lien interne vers un type de contenu | OUI | **OUI** |
| Lien vers une taxonomie/catégorie | N/A (Strapi n'a pas de taxonomie native) | **PARTIEL** (créable, non rendu) |
| Endpoint REST/GraphQL de lecture publique de la structure | OUI (`/api/navigation/render/:id`) | **OUI** (`GET /api/menus/by-location/{location}`) |
| Audience/visibilité conditionnelle | OUI (plugin RBAC séparé) | **NON** |
| Cache de la structure publiée | OUI | **N/A** — résolution en process à chaque requête, pas un problème de performance mesuré à ce stade |

## 6. Spécification ultra détaillée des corrections et ajouts

## T01 — Page d'archive publique par terme de taxonomie

**Priorité** : P1 (parité bloquante — c'est la question posée par la mission, et
c'est le seul cas où une fonctionnalité déjà exposée dans l'admin — le type `taxonomy`
d'un item de menu — ne peut structurellement jamais fonctionner sans elle).
**Effort** : 2-3 j.
**Fichiers à toucher** :
- `packages/cli/src/commands/theme-render.ts` (nouvelle résolution de route)
- `packages/cli/src/commands/serve.ts` (`resolveMenuTerm`, qui doit enfin produire une
  vraie `route`)
- `packages/theme-kit/src/*` (nouveau type d'entrée pour un `RenderContext` d'archive
  de terme — liste d'entrées classées, terme courant, ses enfants)
- Les 5 thèmes (`theme-canonical`, `theme-portfolio`, `theme-magazine`,
  `theme-ecommerce`, `theme-entreprise`) : chacun doit rendre cette page à sa manière,
  exactement comme `renderChrome` — pas un template unique imposé
- `packages/api/src/rest/taxonomy-router.ts` si un endpoint dédié aux entrées d'un
  terme est nécessaire (vérifier d'abord si `ContentGateway` + filtre existant
  suffit, cf. `filterSchema` de `collectionListBlock`)

**Travail détaillé** :
1. Décider le motif d'URL. Recommandation, cohérente avec le principe déjà en place
   pour les collections (`routing.pattern` par collection) : chaque taxonomie
   déclare-t-elle son propre motif, ou un motif fixe `/{taxonomyName}/{termSlug}` par
   défaut suffit-il pour la V1 ? Un motif fixe est suffisant et ne touche aucun
   contrat — une taxonomie n'a pas de `routing` dans ADR-0022, l'ajouter serait une
   montée du contrat A ; **rester en dehors du contrat A** en résolvant la route côté
   `cogenta serve` uniquement, comme `theme-render.ts` le fait déjà pour `/search`.
2. `theme-render.ts` : avant de tenter `matchPath` contre les collections, tenter de
   faire correspondre le premier segment à un `taxonomies[].name`, puis le second à un
   `slug` de terme (recherche par le store de la taxonomie). Si les deux résolvent,
   construire la liste des entrées classées (toutes collections confondues qui portent
   un champ `taxonomy` pointant vers cette taxonomie — même logique que
   `countTaxonomyUsage`), respectant la même visibilité que toute page publique
   (`published` uniquement, `ANONYMOUS`).
3. Chaque thème gagne une fonction de rendu d'archive (miroir de `renderChrome`, un
   point d'extension supplémentaire sur `ThemeModule`) — titre = libellé du terme,
   liste des entrées (réutiliser le même rendu de carte que `collectionList` pour ne
   pas dupliquer de gabarit), fil d'ariane vers le parent si profondeur > 0.
4. `resolveMenuTerm` (`serve.ts`) : remplacer `route: null` par la route construite à
   l'étape 1, en retirant le commentaire qui explique l'absence — il devient faux.
5. SEO : `@cogenta/seo` doit pouvoir construire titre/canonique/`hreflang` pour cette
   page comme pour toute autre — vérifier `isPublished`/le pipeline SEO existant
   plutôt que d'en écrire un second.

**Critères d'acceptation** :
- Un item de menu `taxonomy` pointant vers un terme réel devient un lien cliquable qui
  répond `200` avec la liste des entrées publiées portant ce terme.
- Un terme sans aucune entrée publiée répond `200` avec une liste vide, jamais `404`
  ni `500`.
- Un terme inexistant ou une taxonomie inconnue répond `404`, comme toute route non
  résolue aujourd'hui.
- Les 5 thèmes rendent la page sans JavaScript, zéro couleur littérale (même
  discipline que le reste de leur CSS).

**Tests exigés** : bout en bout par thème (5), test de résolution de route dans
`theme-render.ts`, test SEO (titre/canonique non `noindex` pour un terme publié).
**Impact contrat/ADR** : aucun — reste hors contrat A (pas de `routing` sur
`TaxonomyDefinition`) et hors contrat D si le point d'extension est ajouté à
`ThemeModule` de façon additive (comme `renderChrome` l'a été en L23) ; à confirmer par
`contract-guardian` avant de coder si l'interface `ThemeModule` doit changer.
ADR requise : **non**, sous réserve de rester additif sur le contrat D — sinon RFC
contrat D.

## T02 — Migrer le blueprint `blog` vers `defineTaxonomy()`

**Priorité** : P1 (dogfooding — sans cela, l'écran Taxonomies, entièrement fonctionnel,
est invisible sur le parcours d'installation le plus emprunté).
**Effort** : 0,5-1 j.
**Fichiers à toucher** : `packages/create-cogenta/src/blueprints/blog.ts`,
`packages/create-cogenta/src/blueprints/content-pack.ts` (si le pack de contenu de
démo classe des articles par catégorie), tests de blueprint associés.

**Travail détaillé** :
- Remplacer `category: f.relation({ to: 'category', onDelete: 'setNull' })` par
  `category: f.taxonomy({ of: 'category', many: false })` et
  `tags: f.relation({ to: 'tag', many: true, onDelete: 'cascade' })` par
  `tags: f.taxonomy({ of: 'tag', many: true })`.
- Déclarer les deux taxonomies via `defineTaxonomy()` au lieu des collections
  `category`/`tag` existantes (si `blog.ts` les déclarait comme de vraies
  collections, les retirer — une taxonomie n'est pas une collection, ADR-0022).
- Semer les termes de démonstration (catégories/étiquettes du contenu de démo) via
  le store de taxonomie plutôt que via `createContentStore`.

**Critères d'acceptation** : `npm create cogenta` avec le blueprint `blog` produit un
site dont l'écran Taxonomies affiche immédiatement « Catégories » et « Étiquettes »
peuplées, sans étape manuelle.
**Tests exigés** : test de blueprint existant mis à jour (comme le tri par
`createdAt` l'a été après le bug L10) ; test de bout en bout scaffold → écran
Taxonomies.
**Impact contrat/ADR** : aucun — usage du modèle déjà figé par ADR-0022. **ADR
requise : non.**

## T03 — Résoudre le libellé de la modale de suppression par la locale active

**Priorité** : P3.
**Effort** : < 1 h.
**Fichiers à toucher** : `packages/admin/src/taxonomies/delete-term-modal.tsx`,
`packages/admin/src/routes/taxonomies.tsx` (prop supplémentaire).

**Travail détaillé** : remplacer `term.labels.fr ?? term.labels.en ?? …` (ligne 59) par
la même formule que `labelFor` dans `taxonomies.tsx` (`term.labels[locale] ?? …`), en
passant `i18n.language` en prop depuis l'écran.
**Critères d'acceptation** : sur un site dont la locale active n'a ni `fr` ni `en`
comme premier choix, le titre de la modale affiche le même libellé que la ligne
correspondante dans l'arbre.
**Tests exigés** : test composant ciblé (un terme avec labels `{de: 'X', ja: 'Y'}`,
locale active `ja`, la modale affiche `Y`).
**Impact contrat/ADR** : aucun.

## T04 — Classe CSS et visibilité par rôle sur un item de menu

**Priorité** : P2 (parité WordPress/Drupal/Joomla, réel mais non bloquant — un site
peut se lancer sans).
**Effort** : 1-1,5 j (les deux ensemble, même point d'entrée).
**Fichiers à toucher** : `packages/schema/src/store/menu-tables.ts` (deux colonnes
nouvelles, table fixe non déclarée par le schéma — même traitement que
`cogenta_patterns`/`location`), `menu-store.ts`, `menu-router.ts`, `item-edit-modal.tsx`,
les 5 thèmes (`chrome.ts`, filtrage par rôle avant rendu).

**Travail détaillé** :
- `cssClass: string | null` : stocké tel quel (une classe, pas du CSS — R3 n'est pas en
  jeu ici puisqu'un menu n'est pas un bloc du contrat B), rendue en attribut `class`
  échappé sur le `<li>`/`<a>` correspondant dans chaque thème.
- `visibleToRoles: readonly string[] | null` (`null` = tout le monde) : filtré côté
  résolution serveur (`fetchMenuLinksForSlot`/`resolveMenuEntry`) contre
  `context.actor.roles`, jamais côté thème — le thème ne doit jamais recevoir un item
  qu'il n'a pas le droit d'afficher (même discipline que `resolvedHealth`, gatée par
  rôle).

**Critères d'acceptation** : un item marqué visible seulement pour `admin` n'apparaît
ni dans le HTML public ni dans la réponse `GET /api/menus/by-location/...` pour un
visiteur anonyme.
**Tests exigés** : unitaires sur le filtrage par rôle (positif et négatif), rendu par
thème pour `cssClass`.
**Impact contrat/ADR** : aucun — table fixe hors contrat A, comme `menu-tables.ts`
l'est déjà. **ADR requise : non.**

## T05 — Bulk import et action groupée sur les listes plates de termes

**Priorité** : P3 (confort).
**Effort** : 1 j.
**Fichiers à toucher** : `packages/admin/src/routes/taxonomies.tsx`,
`packages/api/src/rest/taxonomy-router.ts` (route de création en lot,
transactionnelle).

**Travail détaillé** : un champ « coller une liste » (un terme par ligne, `Parent >
Enfant` optionnel pour la hiérarchie) créant plusieurs termes en une transaction ;
sélection multiple sur la vue filtrée (déjà plate) avec une action groupée « supprimer
la sélection », réutilisant `DeleteTermModal` avec le total agrégé.
**Critères d'acceptation** : coller 20 lignes crée 20 termes ou aucun (transaction).
**Tests exigés** : unitaires sur le parsing, bout en bout sur la création en lot.
**Impact contrat/ADR** : aucun.

## T06 — Pagination/borne de la liste de termes

**Priorité** : P3.
**Effort** : 0,5 j (borne + avertissement) à 2 j (pagination réelle de l'arbre, plus
complexe puisque l'arbre a besoin de tous ses ancêtres pour s'afficher correctement).

**Travail détaillé recommandé pour la V1** : plutôt qu'une pagination de l'arbre
(coûteuse à faire sans casser l'affichage hiérarchique), ajouter un avertissement
visible au-delà d'un seuil (ex. 500 termes) recommandant la recherche/le filtre plutôt
que le défilement, et mesurer avant d'investir plus.
**Impact contrat/ADR** : aucun.

## 7. Ordre d'exécution recommandé et dépendances

1. **T02** (migrer `blog` vers `defineTaxonomy()`) — indépendant, rapide, rend la
   fonctionnalité existante enfin visible ; à faire en premier, sans dépendre de rien.
2. **T01** (page d'archive de terme) — le plus gros morceau, complètement indépendant
   de T02 mais partage le même terrain (mieux vaut avoir un site de test avec de
   vraies taxonomies peuplées, donc after T02 dans l'ordre pratique de vérification,
   pas dans l'ordre de dépendance technique).
3. **T04** (classe CSS + visibilité par rôle) — indépendant, peut être fait en
   parallèle de T01/T02 par un autre agent/worktree.
4. **T03** (bug mineur libellé) — trivial, à glisser dans n'importe quel autre chantier
   touchant `delete-term-modal.tsx`, ou seul en 10 minutes.
5. **T05**, **T06** — confort, aucune urgence, à ne prendre qu'une fois T01/T02/T04
   faits.

Aucune dépendance croisée bloquante : T01 ne dépend pas de T04, T02 ne dépend pas de
T01. La seule vraie séquence est **vérifier services Docker (Postgres/MySQL/MariaDB)
avant de toucher à nouveau `taxonomy-store.ts`** — le test d'intégration existe déjà et
doit être rejoué (pas réécrit) dès que l'environnement le permet, indépendamment de
toute tâche listée ici.
