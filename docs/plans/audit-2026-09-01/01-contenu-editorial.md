# Audit 01 — Contenu éditorial — 2026-09-01

## 1. Résumé exécutif

Ce domaine (liste de contenu, éditeur d'entrée, champs de formulaire, éditeur de
texte riche, extrait IA) est, de loin, le plus mûr de l'admin Cogenta. Les six fiches
auditées (`01`, `02`, `03`, `04`, `42`, `44`) décrivaient un état ancien, largement
dépassé par le code réel : la quasi-totalité des tâches qu'elles listaient comme
« à faire » sont aujourd'hui écrites, câblées et testées. Sur les **33 tâches**
réparties dans les six fiches, le verdict est :

- **FAIT : 29**
- **PARTIEL : 2** (édition concurrente — code réel, zéro test ; extrait/word-count —
  détail mineur sans impact)
- **ABSENT (assumé et documenté dans le code) : 2** (autosave serveur ; verrouillage
  d'édition façon WordPress, remplacé par la détection recommandée par la fiche)

Deux vrais bugs trouvés : une clé i18n manquante en français
(`richText.imageDropHint`, §4) et des labels de champ non humanisés quand
`admin.label` n'est pas déclaré (`title`, `slug` bruts — bug déjà noté par L20,
toujours présent, §4). Aucun `any`, `@ts-ignore`, `console.log` ni `throw new Error`
nu trouvé dans les fichiers du domaine. Le point le plus sérieux du point de vue
« Définition de terminé » est l'absence totale de test pour la détection d'écriture
concurrente (`CONTENT_STALE_WRITE`) — une fonctionnalité réelle et câblée de bout en
bout, jamais vérifiée par une seule assertion automatisée.

La comparaison marché montre un socle aujourd'hui **comparable ou supérieur** à
WordPress/Strapi/Sanity sur plusieurs points structurels (aperçu de builder sur le
vrai rendu serveur, historique diffable, éditeur de relation avec accès refusé
explicite, vocabulaire de blocs synchronisé par test) et **en retard** sur un nombre
réduit de points de confort assumés (vue grille, édition rapide en ligne, tableau
dans l'éditeur riche — RFC contrat B requise).

## 2. Ce qui existe réellement

### 2.1 Liste de contenu — `packages/admin/src/routes/collection-list.tsx` (1133 lignes)

Recherche plein texte scopée, filtres (statut en onglets avec compteurs serveur,
locale, plage de dates, terme de taxonomie), tri (`id`/`updatedAt`), pagination par
curseur, sélection multiple avec quatre actions groupées
(`publish`/`unpublish`/`duplicate`/`trash`, `Promise.allSettled` + rapport d'échec
nommé), actions par ligne (voir/modifier/dupliquer/publier-dépublier/corbeille)
gardées par `canPerform`, colonnes supplémentaires configurables et mémorisées par
collection (`packages/admin/src/lib/table-prefs.ts`), taille de page choisie
(20/50/100), export CSV de ce qui est affiché, titre résolu par
`packages/admin/src/lib/entry-title.ts` (jamais deviné).

### 2.2 Accueil des collections — `packages/admin/src/routes/collections.tsx` (194 lignes)

Grille de cartes avec compteur d'entrées réel (`?counts=1`), date de dernière
modification, bouton « Nouveau » gardé par `canPerform('create')`.

### 2.3 Éditeur d'entrée — `packages/admin/src/routes/entry-edit.tsx` (1801 lignes)

Mise en page à deux colonnes (formulaire + barre latérale collante : statut,
programmation, langue, permalien, auteur affiché, actions), garde-fou de sortie
(`packages/admin/src/lib/use-dirty-guard.ts`, `beforeunload` + `useBlocker`),
validation structurelle avant envoi (`aria-invalid`/`aria-describedby`, focus sur le
premier champ en erreur), `required` vérifié uniquement à la publication (choix
documenté, cohérent avec le serveur), corbeille/annulation immédiate depuis
l'éditeur, auteur (`createdBy`/`updatedBy`) résolu en e-mail, permalien recalculé
en direct (`packages/admin/src/lib/permalink.ts`), raccourcis `⌘/Ctrl+S` et
`⌘/Ctrl+Shift+P`, groupes de champs via `admin.group` (déjà porté par le contrat A,
aucune ADR nécessaire), détection d'écriture concurrente
(`CONTENT_STALE_WRITE`, `expectedUpdatedAt`), panneau SEO par entrée (fiche 13),
panneaux d'assistant IA (accordéon, message de repli explicite sans fournisseur —
L20 point 16 corrigé), blocs de départ pour une nouvelle entrée à zone de blocs
(`content.newEntryDefaultBlocks`, réglage configurable, L21 tâche 5).

### 2.4 Formulaire — `packages/admin/src/collections/entry-form.tsx` (192 lignes)

Rendu champ par champ dans l'ordre déclaré, groupé par `admin.group`, extrait
positionné après le corps (fiche 44), auto-remplissage de l'extrait depuis le début
du texte du corps, bouton « Générer l'extrait avec l'IA »
(`packages/admin/src/collections/excerpt-assist-button.tsx`, absent sans fournisseur).

### 2.5 Champs — `packages/admin/src/fields/` (20 fichiers)

Les quinze types du contrat A ont chacun un éditeur réel :
`relation-field.tsx` délègue à `entry-picker.tsx` (462 lignes — recherche,
pagination, jetons réordonnables, refus d'accès explicite, badge « à la corbeille »),
`media-field.tsx`/`media-picker.tsx` (430 lignes — multi-valeur, filtre par
`options.accept`, glisser-déposer, téléversement sur place), listes du contrat B
rendues par `repeater-field.tsx` (266 lignes, jamais un textarea JSON),
`geo-field.tsx` avec carte statique facultative et **vide par défaut**
(`VITE_MAP_TILE_URL`, R1/R2/R9/R10 respectées), `color-field.tsx` avec pastille
d'aperçu, `field-wrapper.tsx` avec compteur de caractères et bouton « valeur par
défaut ». Une suite de contrat unique (`packages/admin/test/fields/field-input.test.tsx`,
« the fifteen kinds of contract A ») couvre les quinze types en une passe. Le
vocabulaire de blocs de l'admin (`packages/admin/src/blocks/vocabulary.ts`) est
gardé synchrone avec `packages/blocks/src/vocabulary.ts` par un test dédié
(`packages/admin/test/blocks/vocabulary-sync.test.ts`) — le piège que la fiche 03
signalait est comblé.

### 2.6 Éditeur de texte riche — `packages/admin/src/rich-text/` (17 fichiers)

Slate avec : marques (gras, italique, code, barré), blocs (paragraphe, h2-h4,
citation, listes à puces/numérotées, bloc de code, trait horizontal), lien externe
et **lien interne** (`internal-link-picker.tsx`, résolution par `buildPath`, texte
simple — jamais un lien mort — si la cible est à la corbeille ou introuvable, avertit
si brouillon), **image inline** (`image-picker.tsx`, glisser-déposer + modale,
rendu avec `srcset` et `alt` réel via `@cogenta/theme-kit`), annuler/rétablir
visibles, compteur de mots (`word-count.ts`), plein écran, menu slash
(`slash-menu.tsx`), collage HTML normalisé (`paste-html.ts`) et Markdown
(`markdown.ts`), bascule de vue source Texte enrichi/Markdown/HTML
(`source-view.ts`). Le bug de hauteur signalé par la fiche 42 est corrigé
(`rich-text.css:29`, `min-height: 16rem`). Le tableau reste absent, **par choix
documenté** : bloc du contrat B figé, RFC nécessaire, à ne traiter que si
redemandé.

## 3. Vérification des fiches, critère par critère

### Fiche 01 — Liste de contenu

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 1. Titre non deviné | FAIT | `packages/admin/src/lib/entry-title.ts` — convention (b) documentée, priorité `title`/`name`/`label` puis premier champ texte déclaré puis id | Aucun |
| 2. Actions par ligne | FAIT | `collection-list.tsx:900-1010` — voir/modifier/dupliquer/publier/corbeille, gardées par `canPerform` | Aucun |
| 3. Actions groupées | FAIT | `collection-list.tsx:44,397-441` — `BulkAction`, `Promise.allSettled`, `BulkReport` nommant chaque échec | Aucun |
| 4. Compteurs par statut | FAIT | `packages/api/src/rest/content-service.ts:574-613` — `counts()` fondé sur `store.count()` (un `GROUP BY`), champs masqués (`null`) selon `canUnpublished`/`canTrash` — le piège de fuite de permission signalé par la fiche est explicitement traité | Aucun |
| 5. Filtres avancés | FAIT | `collection-list.tsx:103-107,182-236` — `updatedFrom`/`updatedTo`/`locale`/`term` (taxonomie), reflétés dans l'URL | Aucun |
| 6. Colonnes/densité/pagination | FAIT | `packages/admin/src/lib/table-prefs.ts`, `PAGE_SIZES = [20,50,100]`, mémorisation `localStorage` par collection | Confort restant : pas de vue grille (voir §4) |
| 7. Écran d'accueil collections | FAIT | `collections.tsx` — grille de cartes, compteur, dernière modification, bouton Nouveau | Pas de description : contrat A n'en porte pas (assumé, cohérent avec la fiche) |

### Fiche 02 — Éditeur d'entrée

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 1. Deux colonnes | FAIT | `entry-edit.tsx:1186-1470` — barre latérale collante, repasse au-dessus sous 1024px | Aucun |
| 2. Garde-fou de sortie | FAIT | `packages/admin/src/lib/use-dirty-guard.ts`, `entry-edit.tsx:937,1761` — `beforeunload` + `useBlocker`, modale réelle | Aucun |
| 3. Validation champ par champ | FAIT | `entry-edit.tsx:557-580` (`validateEntry`, structurel à chaque sauvegarde) et `:711-730` (`required` à la publication seulement — décision documentée, alignée sur le serveur) | Aucun |
| 4. Corbeille/auteur/permalien | FAIT | `entry-edit.tsx:1426-1467` (permalien via `lib/permalink.ts`), auteur résolu (`:448-473`), corbeille avec annulation immédiate | Aucun |
| 5. Raccourcis/confort | FAIT | `entry-edit.tsx:988-1020` (`⌘/Ctrl+S`, `⌘/Ctrl+Shift+P`), compteur de mots (`collections/word-count.ts`) | Aucun |
| 6. Groupes de champs | FAIT | Option (a) retenue : `admin.group` existait déjà dans `FieldAdminOptions` (`packages/schema/src/types.ts:73`) — aucune ADR nécessaire, exactement la voie que la fiche préférait | Aucun |
| 7. Édition concurrente | **PARTIEL** | `packages/schema/src/store/store.ts:1216-1240` (détection `CONTENT_STALE_WRITE` par comparaison `expectedUpdatedAt`), câblé côté admin (`entry-edit.tsx:621,638-687`, notice de conflit avec « recharger »/« garder le mien ») — approche « détection » recommandée par la fiche, retenue. **Mais aucun test ne couvre ce chemin** : `grep` de `CONTENT_STALE_WRITE`/`expectedUpdatedAt` sur tout `*.test.ts*` du dépôt ne trouve **aucun résultat** hors un mock d'aide de test. Le critère d'acceptation explicite de la fiche (« deux onglets… refus explicite ») n'est pas vérifié par une seule assertion |
| 8. Autosave serveur | **ABSENT, assumé** | `packages/admin/src/collections/autosave.ts` — commentaire de tête explique le choix : un autosave passant par `update()` pousserait de vraies versions hors de la fenêtre de rétention (`versioning.keep`, 20 par défaut). Reste **local uniquement**, limite énoncée explicitement (« quelqu'un dont l'ordinateur portable meurt ne récupère rien d'une autre machine ») | Une v2 exigerait une ADR (nouvel état de version ou table de scratch) — non traitée, correctement signalée comme hors périmètre |

### Fiche 03 — Champs de formulaire

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 1. Sélecteur de relation | FAIT | `packages/admin/src/fields/entry-picker.tsx` — pagination, recherche (`GET /api/search`), titre résolu, statut affiché, `canPerform('read', …)` avec message d'accès refusé explicite (pas une liste vide), `many` réordonnable au glisser-déposer et boutons nommés, badge « à la corbeille » | Aucun |
| 2. Répéteur | FAIT | `packages/admin/src/fields/repeater-field.tsx` — rend `BLOCK_VOCABULARY`, invente aucun champ, valeur = même tableau JSON qu'avant | Aucun |
| 3. Média multiple | FAIT | `media-field.tsx`/`media-picker.tsx` — `options.accept` (jamais `kind: 'image'` en dur), `many`, glisser-déposer + téléversement sur place réutilisant `UploadForm` | Aucun |
| 4. Champs restants | FAIT | `select-field.tsx` (many en jetons), `geo-field.tsx` (carte facultative, vide par défaut, R1/R9/R10), `color-field.tsx` (pastille), `field-wrapper.tsx` (compteur de caractères, valeur par défaut) | Aucun |
| 5. Suite de contrat | FAIT | `packages/admin/test/fields/field-input.test.tsx` — « the fifteen kinds of contract A », monte chacun, vérifie `onChange` et `disabled` | Aucun |

### Fiche 04 — Éditeur de texte riche

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 0. ADR portable-text | FAIT (déjà couvert) | ADR-0013 (`docs/03-decisions.md`) actait déjà « annotations référençant des entités du site (lien interne, média, note) » — la répartition nœud/bloc que la fiche recommandait était donc déjà décidée ; aucune nouvelle ADR nécessaire | — |
| 1. Marques/blocs manquants | FAIT | `toolbar.tsx` — barré, trait horizontal, bloc de code, citation, liste numérotée ; rendu vérifié côté `@cogenta/theme-kit` (`rich-text.ts`) | Surlignage/exposant/indice non ajoutés — reportés à la fiche 42 tâche 3 (optionnelle) |
| 2. Lien interne | FAIT | `internal-link-picker.tsx`, résolution `theme-kit/src/rich-text.ts:43-51` (`ctx.link` renvoie `'#'` pour une cible non résolue → texte simple, jamais un lien mort) | Aucun |
| 3. Image dans le texte | FAIT | `image-picker.tsx`, rendu via `@cogenta/theme-kit`'s `media.ts` (`srcset`/`alt` toujours écrits) | Aucun |
| 4. Collage/undo-redo/confort | FAIT | `paste-html.ts`, `markdown.ts`, `toolbar.tsx` (undo/redo visibles, désactivés à vide), `word-count.ts`, classe plein écran | Aucun |
| 5. Commandes slash | FAIT | `slash-menu.tsx` | Aucun |

### Fiche 42 — Zone visible et enrichissement

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 1. Hauteur par défaut | FAIT | `packages/admin/src/styles/rich-text.css:28-29` — `min-height: 16rem` hors plein écran | Aucun |
| 2. Barré/trait horizontal | FAIT | `toolbar.tsx` (bouton dédié `insertThematicBreak`), snapshots `theme-kit` mis à jour | Aucun |
| 3. Surlignage/tableau | ABSENT, assumé | Non traité — la fiche le dit explicitement optionnel, « à ne traiter que si explicitement redemandé » ; tableau exige une RFC contrat B | Correct tel quel |

### Fiche 44 — Extrait et IA

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 1. Extrait après le corps | FAIT | `packages/create-cogenta/src/blueprints/blog.ts:68-75` — ordre `title → slug → body → excerpt` (commentaire dédié) | Aucun |
| 2. Défaut auto-rempli | FAIT | `entry-form.tsx:88-121`, `collections/word-count.ts`'s `truncateAtWordBoundary` — coupe au dernier espace | Aucun |
| 3. Bouton IA | FAIT | `packages/admin/src/collections/excerpt-assist-button.tsx` — `assist.summarise`, absent sans fournisseur (R2), suggestion jamais appliquée sans clic | Aucun |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| P1 (i18n cassée) | `packages/admin/src/i18n/locales/fr.json` (clé absente) vs `en.json:137` | `richText.imageDropHint` (aria-label de la zone de dépôt d'image dans l'éditeur riche, `rich-text-editor.tsx:329`) existe en anglais, **absent du fichier français** — vérifié par un diff programmatique des deux arbres de clés (0 clé manquante en anglais, 1 manquante en français, exactement celle-ci). Un utilisateur FR entend/lit soit la clé brute soit un texte anglais selon la config i18next | Ajouter la clé manquante dans `fr.json`, section `richText` |
| P2 (ergonomie, régression L20 non corrigée) | `packages/admin/src/fields/field-wrapper.tsx:47` | `const label = field.admin?.label ?? field.name` — aucune humanisation : un champ `slug`/`title`/`excerpt` sans `admin.label` explicite (cas du blueprint `blog.ts`, qui n'en déclare aucun) affiche le nom technique brut dans le formulaire. C'est exactement le constat L20 « labels de champs bruts non humanisés », toujours vrai après vérification directe du code | Ajouter un repli d'humanisation (`camelCase`/`snake_case` → « Title Case », ou table de correspondance pour les noms conventionnels `title`/`slug`/`excerpt`/`body`) dans `field-wrapper.tsx`, appliqué seulement quand `admin.label` est absent |
| P1 (DoD non respectée) | `packages/schema/src/store/store.ts:1216-1240` (code réel) — **aucun fichier de test** | La détection d'écriture concurrente (`CONTENT_STALE_WRITE`, fiche 02 tâche 7) est du code de production réel, câblé de bout en bout (store → routeur REST → client admin → UI de conflit), mais recherche exhaustive (`grep -r "CONTENT_STALE_WRITE\|expectedUpdatedAt"` sur tous les `*.test.ts*` du dépôt, hors `dist/`) ne renvoie **aucun test métier** — seule une valeur de mock existe dans un fichier d'aide admin, jamais exercée par un `it(...)`. Le critère d'acceptation propre de la fiche (« deux onglets… refus explicite, jamais un écrasement muet ») n'est vérifié par rien d'automatisé | Écrire (a) un test `packages/schema/test/store/` : deux `update()` successifs sur la même ligne, le second avec un `expectedUpdatedAt` périmé, doit lever `CONTENT_STALE_WRITE` ; (b) un test composant admin simulant la réponse 409-équivalente et vérifiant l'affichage de la notice de conflit |
| P3 (confort, non bloquant) | — | `packages/admin/src/collections/word-count.ts`'s `plainTextOfRichText` duplique (sobrement) la logique interne non exportée `textOf` de `packages/admin/src/rich-text/word-count.ts` | Pas un bug : la fiche 44 elle-même sanctionne explicitement cette seconde duplication (« pas d'abstraction avant trois usages réels ») ; à factoriser seulement si un troisième site d'usage apparaît |

Aucun `any`, `@ts-ignore`, `console.log` ni `throw new Error(` nu trouvé dans les
fichiers du domaine (`packages/admin/src/fields/*`, `routes/collection-list.tsx`,
`routes/entry-edit.tsx`, `routes/collections.tsx`, `collections/*`, `rich-text/*`).
Toutes les listes non bornées vérifiées (liste d'entrées, sélecteur de relation,
sélecteur de média) sont paginées par curseur ou par page ; `collections.tsx`
n'a pas besoin de pagination (nombre de collections borné par le schéma).

## 5. Comparaison marché

### WordPress 6.x

| Fonctionnalité | Cogenta |
|---|---|
| Compteurs par statut en onglets | OUI |
| Édition rapide en ligne (Quick Edit) | NON |
| Actions groupées (statut, corbeille, dupliquer) | OUI (publier/dépublier/dupliquer/corbeille) |
| Actions par ligne au survol | OUI |
| Colonnes configurables et mémorisées | OUI (par collection, `localStorage`) |
| Filtre par date/auteur/taxonomie | PARTIEL (date et taxonomie OUI, auteur NON) |
| Nombre d'éléments par page | OUI (20/50/100) |
| Vue grille/liste (médiathèque) | NON (hors domaine — voir audit médiathèque) |
| Colonne principale + barre latérale de publication | OUI |
| Métaboxes / groupes de champs | OUI (`admin.group`) |
| Champs conditionnels (afficher si…) | NON |
| Garde-fou « modifications non enregistrées » | OUI |
| `Ctrl+S` | OUI |
| Validation champ par champ avant envoi | OUI |
| Verrouillage d'édition concurrente (exclusif, avec reprise forcée) | PARTIEL (détection avec refus, pas un verrou exclusif — choix assumé) |
| Permalien éditable + aperçu | OUI (aperçu ; l'édition du slug existe via le champ `slug` lui-même) |
| Auteur assignable | NON (affichage seul ; assignation reportée à la fiche 37) |
| Extrait / image à la une conventionnels | OUI (extrait) |
| Panneau SEO dans l'éditeur (Yoast/RankMath) | OUI (fiche 13, SERP preview) |
| Compteur de mots / temps de lecture | OUI |
| Corbeille depuis l'éditeur | OUI |
| Autosave serveur (révision brouillon) | NON (local uniquement, décision documentée) |
| Barré/souligné/exposant | PARTIEL (barré OUI, souligné/exposant NON) |
| Tableau dans l'éditeur riche | NON (RFC contrat B requise) |
| Image dans le corps du texte | OUI |
| Lien interne (pas juste une URL) | OUI — **au-dessus** de WordPress natif (résolution par id, survit au renommage) |
| Commandes slash | OUI |
| Collage Markdown/HTML propre | OUI |

### Strapi 5 Content Manager

| Fonctionnalité | Cogenta |
|---|---|
| Vues configurables | PARTIEL (colonnes oui, pas de vue custom par rôle) |
| Relations avec recherche | OUI |
| Relations multiples réordonnables | OUI |
| Création de l'entrée liée sans quitter le formulaire | NON |
| Composants/listes typées | OUI (répéteur, contrat B) |
| Publication (statuts) | OUI |
| Actions groupées publier/dépublier | OUI |
| i18n par entrée | OUI (sélecteur de traduction, `TranslationSwitcher`) |

### Sanity Studio / Ghost editor

| Fonctionnalité | Cogenta |
|---|---|
| Historique de versions avec diff visuel | OUI — **au-dessus** de Ghost, comparable à Sanity |
| Portable Text structuré (jamais de HTML stocké) | OUI (ADR-0013, R3) |
| Aperçu en direct sur le vrai rendu | OUI — page builder L16, iframe sur le rendu serveur réel |
| Mode plein écran / sans distraction | OUI |
| Vue source Markdown/HTML | OUI (Sanity ne l'a pas nativement) |

## 6. Spécification ultra détaillée des corrections et ajouts

### T01 — Clé i18n française manquante pour la zone de dépôt d'image

**Priorité** : P0 (texte non traduit, règle projet violée). **Effort** : 15 min.
**Fichiers** : `packages/admin/src/i18n/locales/fr.json`.
**Travail** : ajouter, dans la section `richText`, la clé `imageDropHint` avec un
texte français équivalent à l'anglais (« Drop an image here to insert it » →
« Déposez une image ici pour l'insérer »).
**Critère d'acceptation** : le script de comparaison des deux arbres de clés
(`Object.keys` récursif) renvoie zéro clé manquante dans les deux sens.
**Tests exigés** : un test qui charge les deux fichiers JSON et vérifie que
l'ensemble des clés est identique (ce test n'existe pas aujourd'hui — l'écrire
prévient toute régression future de ce type, pour l'ensemble de l'admin, pas
seulement ce domaine).
**Impact contrat/ADR** : aucun.

### T02 — Humaniser les libellés de champ sans `admin.label`

**Priorité** : P2. **Effort** : 3–4h.
**Fichiers** : `packages/admin/src/fields/field-wrapper.tsx`, nouveau
`packages/admin/src/lib/humanize-field-name.ts`, tests associés.
**Travail détaillé** : écrire une fonction pure `humanizeFieldName(name: string):
string` qui convertit `camelCase`/`snake_case` en mots capitalisés espacés
(`internalCode` → `Internal Code`), sans traduction (le nom du champ n'est pas une
clé i18n — c'est un nom technique arbitraire déclaré par le schéma). L'utiliser
comme repli dans `field-wrapper.tsx` : `field.admin?.label ?? humanizeFieldName(field.name)`.
Ne changer aucun comportement pour un champ qui déclare déjà `admin.label`
(rétrocompatible à 100 %, aucune régression visuelle pour un site déjà configuré).
**Critère d'acceptation** : un champ `internalCode` sans `admin.label` affiche
« Internal Code », pas « internalCode » ; un champ avec `admin.label: "Mon titre"`
continue d'afficher exactement ça.
**Tests exigés** : unitaire sur `humanizeFieldName` (`camelCase`, `snake_case`,
acronymes `seoTitle` → `Seo Title` — accepté, un dictionnaire d'acronymes serait une
sur-ingénierie non justifiée par un cas réel) ; composant sur `field-wrapper.tsx`
avec et sans `admin.label`.
**Impact contrat/ADR** : aucun — pure UX admin, aucun champ du contrat A ne change.

### T03 — Couvrir la détection d'écriture concurrente par des tests réels

**Priorité** : P1 (DoD non respectée sur une fonctionnalité de sécurité des données
déjà en production). **Effort** : 1 jour.
**Fichiers** : nouveau `packages/schema/test/store/stale-write.test.ts`, nouveau
`packages/admin/test/entry-edit-stale-write.test.tsx` (ou section ajoutée à
`entry-edit-workflow.test.tsx`).
**Travail détaillé** :
1. Test de store (SQLite, base réelle éphémère — jamais de mock) : créer une
   entrée, lire son `updatedAt`, la modifier une fois par un appel `update()` direct
   (simulant un second éditeur), puis appeler `update()` avec l'`expectedUpdatedAt`
   périmé — vérifier que `CONTENT_STALE_WRITE` est levée avec `details.expected`/
   `details.actual` corrects. Un second test vérifie qu'un `update()` **sans**
   `expectedUpdatedAt` (un appelant qui ne l'envoie pas, comme un client headless
   ancien) réussit toujours — non-régression du champ optionnel.
2. Test bout en bout admin : simuler la réponse `CONTENT_STALE_WRITE` au clic sur
   « Enregistrer » et vérifier que la notice de conflit s'affiche avec les deux
   boutons (« Recharger », « Garder le mien ») et que chacun produit l'état attendu
   (`staleWrite`, `loadedUpdatedAt` mis à jour).
3. Rejouer, si possible, en intégration Postgres/MySQL (le mécanisme est un
   `UPDATE ... WHERE updated_at = ?` générique — vérifier qu'aucun dialecte n'a un
   comportement de comparaison de timestamp divergent, cf. règle du projet sur le
   driver dégradé testé).
**Critère d'acceptation** : les trois tests ci-dessus passent ; supprimer la garde
`expectedUpdatedAt` dans `store.ts` fait échouer le test 1 (le test doit être un
vrai filet, pas un test qui passerait aussi sans la fonctionnalité).
**Impact contrat/ADR** : aucun — le code existe déjà, seule la preuve manque.

### T04 — Verrouillage exclusif (WordPress-style), en complément de la détection

**Priorité** : P3 (confort — la détection couvre déjà le cas réel signalé par la
fiche : l'écrasement silencieux). **Effort** : 2–3 jours. **ADR requise : oui**
(nouvelle table de verrous avec TTL, nouvel état qui survit à un crash — la fiche
elle-même le classe différemment de la détection sans état).
**Fichiers** (proposés, non codés) : nouvelle table `cogenta_content_locks`
(`collection`, `entry_id`, `locked_by`, `locked_at`, `expires_at`), routeur REST
`POST/DELETE /api/content/{c}/{id}/lock`, indicateur visuel dans
`collection-list.tsx` et `entry-edit.tsx` (« Modifié actuellement par… »).
**Recommandation** : ne pas coder avant qu'un besoin réel (deux éditeurs simultanés
fréquents sur le même site) ne soit rapporté — la détection déjà en place couvre
la conséquence la plus grave (écrasement muet) sans l'état supplémentaire à
maintenir. Rédiger l'ADR seulement si le besoin se confirme.
**Texte d'ADR proposé (si retenu)** : *Titre* — « Verrouillage exclusif d'édition
de contenu ». *Contexte* — la détection d'écriture concurrente (ADR-free, additive)
empêche l'écrasement silencieux mais laisse un éditeur découvrir le conflit après
coup. *Décision* — ajouter une table de verrous à TTL, acquise à l'ouverture de
l'éditeur, visible dans la liste et l'éditeur, jamais bloquante au-delà du TTL
(auto-expiration, pas de verrou orphelin permanent). *Conséquences* — nouvelle
table hors contrat A (verrou n'est pas un champ de contenu), coût d'un
`SELECT`/`UPSERT` de plus par ouverture d'entrée.

### T05 — Vue grille pour les collections à vignette

**Priorité** : P3. **Effort** : 1–1,5 jour.
**Fichiers** : `collection-list.tsx`, `packages/admin/src/lib/table-prefs.ts`
(ajout d'un mode `view: 'table' | 'grid'`).
**Travail détaillé** : une bascule (icônes liste/grille) au-dessus du tableau ;
en mode grille, chaque entrée devient une carte avec la première image du premier
champ `media` déclaré (si aucun, replier sur le mode table pour cette collection —
ne pas afficher une grille de cartes sans image, ce serait pire que la table).
Mémorisé par collection comme les colonnes.
**Critère d'acceptation** : sur une collection `product` avec un champ `photo`,
basculer en grille affiche une vignette par produit ; une collection sans champ
média n'offre pas la bascule.
**Tests exigés** : composant, bascule + mémorisation ; pas de régression sur le
mode table existant.
**Impact contrat/ADR** : aucun.

### T06 — Édition rapide en ligne (Quick Edit)

**Priorité** : P2 (parité WordPress citée trois fois dans les fiches et par L20).
**Effort** : 2 jours.
**Fichiers** : `collection-list.tsx`, nouveau
`packages/admin/src/collections/quick-edit-row.tsx`.
**Travail détaillé** : un bouton « Édition rapide » par ligne (à côté des actions
existantes, gardé par `canPerform('update')`) transforme la ligne en formulaire
inline limité aux champs `text`/`slug`/`select`/statut/date de publication —
jamais les champs `blocks`/`richText`/`media` multiples (hors de portée d'une
ligne de tableau, cohérent avec le choix de WordPress lui-même qui exclut le corps
de l'article de son Quick Edit). Un `PATCH` ciblé, rechargement de la ligne
seulement (pas toute la page).
**Critère d'acceptation** : changer le statut et le slug d'un article depuis la
liste, sans ouvrir l'éditeur complet, avec `expectedUpdatedAt` envoyé comme
n'importe quel autre `PATCH` (T03 s'applique aussi ici).
**Tests exigés** : composant (édition inline, permissions par rôle), bout en bout
(un `PATCH` réel change le statut, la ligne le reflète sans rechargement de page).
**Impact contrat/ADR** : aucun.

### T07 — Champs conditionnels (afficher si…)

**Priorité** : P3. **Effort** : 3–4 jours. **ADR requise : oui** si portée par le
contrat A (`SchemaField.admin.condition`) — seule option réaliste : contrairement
à `group`, une condition référence un autre champ et sa valeur, ce qu'aucune
convention purement admin ne peut deviner sans dupliquer une logique métier.
**Recommandation** : ne pas coder avant l'ADR. Proposer un champ `admin.showIf:
{ field: string, equals: unknown }` simple (une seule condition, pas d'opérateurs
booléens composés — la fiche prévient explicitement contre la sur-ingénierie
prématurée) dans une future montée mineure de `schema` (additif, pas de rupture).
**Texte d'ADR proposé** : *Titre* — « Champs conditionnels dans le formulaire
d'entrée ». *Décision* — `FieldAdminOptions` gagne `showIf?: { field: string;
equals: unknown }`, lu uniquement par l'admin (aucune validation serveur : un champ
caché reste un champ valide côté API, cohérent avec R2/les clients headless qui
n'ont pas cette notion). *Conséquences* — montée mineure additive du contrat A
(pas de `schema@3.0`, comparable à l'ajout de `group`).

### T08 — Auteur assignable

**Priorité** : Renvoyée à la fiche 37 (workflow éditorial), hors périmètre de ce
domaine — confirmé par la lecture du code (`entry-edit.tsx` commente
explicitement « display only — assigning it is fiche 37's job »). Aucune action
ici.

## 7. Ordre d'exécution recommandé et dépendances

1. **T01** (clé i18n) — 15 minutes, aucune dépendance, à faire immédiatement.
2. **T03** (tests de la détection concurrente) — aucune dépendance, priorité DoD ;
   à faire avant tout nouveau développement sur `entry-edit.tsx` pour ne pas ajouter
   de code non testé par-dessus du code non testé.
3. **T02** (humanisation des labels) — indépendant, peut être fait en parallèle de
   T03.
4. **T06** (Quick Edit) — dépend de T03 si l'édition rapide doit elle-même envoyer
   `expectedUpdatedAt` (recommandé, pour rester cohérent) ; sinon indépendant.
5. **T05** (vue grille) — indépendant, purement additif à `collection-list.tsx`.
6. **T07** (champs conditionnels) — dépend d'une ADR actée par l'humain ; ne pas
   commencer avant.
7. **T04** (verrouillage exclusif) — dépend d'une ADR actée par l'humain, et
   recommandé de n'être fait qu'après un besoin réel rapporté ; dernier de la
   liste, potentiellement jamais si le besoin ne se confirme pas.
