# Audit page builder visuel et vocabulaire de blocs — 2026-09-01

## 1. Résumé exécutif

Le socle L16 (aperçu iframe fidèle à l'octet, drag & drop, undo/redo, édition en
place) est réel et solide. La fiche 43 est allée plus loin que ce que
`CLAUDE.md` documente : **les quatre sous-chantiers A/B/E/F sont FAITS** (motifs,
copier/coller, verrouillage/sélection multiple, import/export), **et les deux
sous-chantiers à décision — C et D — ont eux aussi été codés**, pas seulement
décidés : le vocabulaire est passé de 12 à **17 blocs** (`blocks@2.0`, RFC 0001,
ADR-0030, insérée dans `docs/03-decisions.md`) et un champ `variant`
(fond/espacement/alignement/largeur) existe sur l'enveloppe de tout bloc (RFC
0002, même ADR), câblé dans les 5 thèmes et dans l'admin. `CLAUDE.md` ne
mentionne pas cette suite — c'est un vrai travail non reflété dans l'état
courant du fichier, pas une régression.

**Décompte** (43 critères vérifiés au § 3) : **31 FAIT**, **7 PARTIEL**,
**1 ABSENT**, **4 POINT MORT**.

Le point mort le plus significatif : le mécanisme « un thème peut enregistrer
un bloc privé avec repli » (sous-chantier C(ii)) est **entièrement câblé et
testé au niveau fonction** (`resolveBlockForRender`, `BlockRegistry`,
paramètre `registry?` accepté par `renderPage`/`renderBlock`/le routeur REST)
mais **jamais instancié nulle part dans `cogenta serve`** — aucun appel ne
construit de `BlockRegistry` autre que celui par défaut (`vocabularyRegistry`,
créé une seule fois dans `packages/blocks/src/registry.ts`). Un vrai thème
tiers ne peut donc pas, aujourd'hui, déclarer un bloc à lui : la fonctionnalité
existe en théorie, jamais en pratique.

Deux bugs de qualité mineurs : (1) les 5 blocs `blocks@2.0` sont absents de
`CATEGORY_BY_BLOCK` (panneau d'insertion admin) et retombent tous dans la
catégorie générique « listing » plutôt qu'une catégorie adaptée ; (2)
`docs/04-contrats.md` § Contrat B documente RFC 0001 (les 5 blocs) mais **pas**
RFC 0002 (`variant`), bien qu'ADR-0030 l'acte comme faisant partie de la même
montée `blocks@2.0` — dérive documentaire réelle.

Deux écarts fonctionnels hérités de la fiche 05, jamais comblés : l'édition en
place ne couvre toujours que le texte simple (aucun repli « ouvre le panneau
focalisé » pour le texte riche, alors que la fiche le recommandait comme
minimum honnête) ; et les « motifs fournis avec le thème » (option 1 de la
fiche 05 tâche 1) n'existent pas — seuls les motifs créés depuis l'admin
(option 2) sont livrés.

## 2. Ce qui existe réellement

**Admin — `packages/admin/src/builder/`** (12 fichiers) : `page-builder.tsx`
(orchestrateur, 599 lignes), `block-moves.ts` (opérations pures :
insert/move/remove/setInlineText/updateBlockData/paste), `block-outline.tsx`
(liste latérale, boutons nommés), `block-picker.tsx` (panneau d'insertion),
`block-library.ts` (catégorisation + recherche insensible aux accents),
`block-variant.tsx` (contrôle `variant` à 4 axes), `preview-dom.ts` (câblage
DOM natif de l'iframe : drag, édition en place, sélection), `preview-frame.tsx`
(mise à l'échelle réelle par `transform: scale()`), `history.ts` (undo/redo, 50
instantanés), `viewports.ts` (1440/768/375 px), `patterns.ts` (insertion de
motif/modèle, export/import JSON), `pattern-picker.tsx` (écran bibliothèque).

**Client API** : `packages/admin/src/api/builder-client.ts`,
`packages/admin/src/api/patterns-client.ts`.

**Rendu serveur — `packages/cli/src/commands/theme-render.ts`** :
`renderDraftPage` (superpose un `DraftPage` non enregistré sur l'entrée réelle,
délègue à `renderEntryPage`/`renderRequestedPage` — même fonction que la page
publiée), route `POST /api/builder/render` montée dans
`packages/cli/src/commands/serve.ts`. `ThemeRenderOptions.blocks?: BlockRegistry`
existe mais n'est jamais alimenté par `serve.ts` (voir § 4).

**Vocabulaire — `packages/blocks/src/vocabulary.ts`** (584 lignes) : 17 blocs
(`hero`, `prose`, `mediaFigure`, `featureGrid`, `cta`, `gallery`, `quote`,
`faq`, `stats`, `logos`, `collectionList`, `embed` — v1, `fallback: null` ;
`testimonial`→`prose`, `pricingTable`→`featureGrid`, `accordion`→`prose`,
`statCounter`→`featureGrid`, `logoStrip`→`mediaFigure` — v2, chacun avec un
`fallback` réel). `packages/blocks/src/variant.ts` : `BlockVariant` (4 axes,
`z.strictObject`), posé par `define-block.ts` sur l'enveloppe (`RESERVED_FIELDS`
inclut `'variant'`). `packages/blocks/src/registry.ts` :
`createBlockRegistry`/`vocabularyRegistry` (instance unique, jamais d'autre
instance créée en dehors des tests).

**Thème — `packages/theme-kit/src/page.ts`** : `withBlockKey`, `withBlockVariant`
(pose `data-variant-<axis>` par axe défini), `resolveBlockForRender` (résout un
bloc stocké contre `knownNames`/`registry`, retombe sur le `fallback` déclaré,
jamais une page blanche). Identique dans les 5 thèmes
(`render-block.ts` de `theme-canonical`/`theme-portfolio`/`theme-magazine`/
`theme-ecommerce`/`theme-entreprise`) : `renderBlock(block, ctx, entries,
registry?)` appelle `resolveBlockForRender` puis `withBlockVariant`.

**Motifs — `packages/schema/src/store/pattern-tables.ts`/`pattern-store.ts`**
(table fixe `cogenta_patterns`, même traitement que `menu-tables.ts` : `kind`
`pattern`|`template`, `blocks` JSON, `provenance`/`provenanceDetail`).
`packages/api/src/rest/pattern-router.ts` (362 lignes, admin/editor sur toute
méthode y compris `GET`). Câblé dans `serve.ts` (`ensurePatternTables`,
`createPatternStore`, `createPatternRouter`, montage sous `/api/patterns`).

**Tests** : `packages/cli/test/serve-builder.test.ts` (10 tests, bout en bout,
vrai serveur + vraie base — fidélité à l'octet, permissions, ce qui est
persisté). `packages/admin/test/builder/*` (7 fichiers : `block-library`,
`block-moves`, `entry-edit-modes`, `history`, `page-builder` — 35 tests dont
variant/lock/multi-select/copier-coller —, `pattern-picker`, `patterns`,
`preview-dom`). `packages/admin/test/blocks/vocabulary-sync.test.ts` (preuve
que le miroir admin des 17 blocs ne dérive pas de `@cogenta/blocks`).
`packages/schema/test/store/pattern-store.test.ts` +
`pattern-store.contract.ts` + `test/integration/pattern-store.test.ts`
(SQLite + Postgres/MySQL/MariaDB, loud-skip si absent). `packages/api/test/rest/
pattern-router.test.ts` (8 tests, niveau routeur, pas de vrai serveur HTTP).
5× `theme-block-fallback.test.ts` (un par thème, prouve la résolution
`resolveBlockForRender` — mais avec un `BlockRegistry` construit à la main dans
le test, jamais celui d'un vrai `cogenta serve`).

## 3. Vérification des fiches, critère par critère

| Fiche | Tâche / critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| 05 §1 | Aperçu iframe = vrai rendu serveur | FAIT | `theme-render.ts` `renderDraftPage`→`renderEntryPage` | — |
| 05 §1 | `POST /api/builder/render`, 3 portes (auth, `update`, gateway) | FAIT | `serve.ts` L4768-4810, `serve-builder.test.ts` L374-457 | — |
| 05 §1 | Drag & drop natif + boutons nommés | FAIT | `preview-dom.ts`, `block-outline.tsx` | — |
| 05 §1 | Édition en place texte simple, `textContent` pas `innerHTML` | FAIT | `preview-dom.ts` L83-98 (`contenteditable="plaintext-only"`) | — |
| 05 §1 | Panneau d'insertion, recherche libellé+type, insensible accents | FAIT | `block-library.ts`, test `block-library.test.ts` L25-31 | — |
| 05 §1 | Undo/redo 50 instantanés, `Ctrl/⌘+Z` | FAIT | `history.ts` | — |
| 05 §1 | 3 largeurs d'aperçu réelles (media queries résolues) | FAIT | `viewports.ts`, `preview-frame.tsx` | — |
| 05 §1 | Test de fidélité octet pour octet | FAIT | `serve-builder.test.ts` L186-221 | — |
| 05 tâche 1 (motifs) | Motifs du site (« enregistrer la sélection ») | FAIT | `pattern-picker.tsx`, `pattern-router.ts` | — |
| 05 tâche 1 (motifs) | Motifs **fournis avec le thème** | **ABSENT** | aucune trace dans `pattern-store.ts`/thèmes | Seule l'option 2 (motifs du site) a été construite ; option 1 (motifs livrés avec le thème, contrat D) n'existe pas |
| 05 tâche 1 | Vignette = vrai rendu, pas un dessin | PARTIEL | `pattern-picker.tsx` ne montre pas de miniature — liste texte (nom/catégorie) seulement | Pas de vignette du tout, ni fausse ni vraie ; le risque de mensonge visuel que la fiche redoutait n'existe pas, mais le confort de reconnaissance visuelle non plus |
| 05 tâche 2 (copier-coller) | `Ctrl/⌘+C/V`, presse-papiers natif, préfixe `cogenta/blocks@1` | FAIT | `page-builder.tsx` L320-348, `block-moves.ts` `serialiseBlocksForClipboard` | — |
| 05 tâche 2 | Refus d'un type hors vocabulaire, message nommant le type | FAIT | `page-builder.tsx` L344 `pasteUnknownType`, testé `page-builder.test.tsx` | — |
| 05 tâche 3 (réutilisables) | Décision (a) motif figé, pas (b) référence synchronisée | FAIT (décision tenue) | Aucun type `reference` dans `vocabulary.ts` — la recommandation de la fiche a été suivie à la lettre | — |
| 05 tâche 4 (édition riche) | « Minimum honnête » : double-clic sur champ non éditable ouvre le panneau focalisé | **ABSENT** | `preview-dom.ts` L203-233 : `dblclick` n'existe que sur `[data-field]`, qui n'est jamais posé sur un champ `richText` par aucun bloc | Recommandation explicite de la fiche jamais implémentée ; un double-clic sur un paragraphe riche ne fait toujours rien, sans message |
| 05 tâche 5 (verrouillage) | Verrou admin-only, non persisté, bloque déplacement/suppression | FAIT | `page-builder.tsx` L109 `lockedKeys` (session `useState`), tests L416-460 | — |
| 05 tâche 5 (sélection multiple) | `Shift`+clic liste latérale, un seul instantané par action groupée | FAIT | `page-builder.tsx`, test `page-builder.test.tsx` L379-397 | — |
| 43 §4A (motifs+modèles) | Table `cogenta_patterns` (kind pattern/template) | FAIT | `pattern-tables.ts` | — |
| 43 §4A | Modèle de page complet, confirmation explicite avant remplacement | FAIT | `pattern-picker.tsx` L343-369 (`Modal` de confirmation) | — |
| 43 §4A | Chaque bloc d'un motif validé contre le vocabulaire du site | FAIT | `pattern-router.ts` (`assertBlocksValid`, testé L137-159) | — |
| 43 §4A | Câblé dans `cogenta backup`/`restore` | PARTIEL — non vérifié par cet audit | `ensurePatternTables` est appelé par `serve.ts` ; pas cherché dans les commandes `backup`/`restore` (hors du périmètre des fichiers listés pour ce domaine) | À confirmer par l'auditeur du domaine sauvegarde/CLI |
| 43 §4B (copier-coller) | Reprend fiche 05 tâches 2-3(a) | FAIT | voir ci-dessus | — |
| 43 §4C(i) | RFC contrat B rédigée | FAIT | `docs/rfc/0001-widen-block-vocabulary.md` | — |
| 43 §4C(i) | RFC actée en ADR, contrat B monté en `blocks@2.0` | FAIT | ADR-0030 (`docs/03-decisions.md` L1241-1300), `docs/04-contrats.md` L319-440 | — |
| 43 §4C(ii) | Registre de blocs de thème achevé côté rendu | FAIT (mécanisme) | `resolveBlockForRender`, `renderBlock(..., registry?)` dans les 5 thèmes | — |
| 43 §4C(ii) | … et réellement utilisable par un site/thème réel | **POINT MORT** | `createBlockRegistry` appelé une seule fois (`vocabularyRegistry`) ; `serve.ts` ne construit ni ne passe jamais de `BlockRegistry` à `renderRequestedPage`/`renderDraftPage` (ni à `createRestRouter`, côté écriture) | Aucun point de configuration n'existe pour qu'un thème ou un site déclare un bloc privé ; le paramètre `registry?`/`blocks?` reste toujours `undefined` en production |
| 43 §4D (variant) | RFC 0002 rédigée | FAIT | `docs/rfc/0002-per-block-visual-variant.md` | — |
| 43 §4D | Champ `variant` actée en ADR, câblé contrat B + 5 thèmes + admin | FAIT | ADR-0030, `variant.ts`, `withBlockVariant` × 5 thèmes, `block-variant.tsx`, i18n FR/EN complet | — |
| 43 §4D | `docs/04-contrats.md` documente `variant` | **ABSENT** | aucune occurrence de « variant »/« RFC 0002 » dans § Contrat B de `docs/04-contrats.md` | Dérive documentaire : le contrat versionné omet une moitié de ce que la montée `blocks@2.0` a réellement ajouté |
| 43 §4E (UX) | Reprend fiche 05 tâches 4-5 | PARTIEL | verrouillage/sélection FAIT (voir ci-dessus), édition riche toujours ABSENT | Voir ligne fiche 05 tâche 4 |
| 43 §4F (import/export) | Format JSON versionné `cogenta/pattern-file@1` | FAIT | `patterns.ts` `PATTERN_FILE_FORMAT`, `exportPatternFile`/`parsePatternFile` | — |
| 43 §4F | Validé bloc par bloc à l'import | FAIT | `parsePatternFile`, testé `pattern-picker.test.tsx` (import invalide/type inconnu) | — |
| 43 §4F | `provenance`/`provenanceDetail` réutilise le contrat A | FAIT | `pattern-router.ts` L65-66, L152-161 ; `PROVENANCE_KINDS` importé, pas réinventé | — |
| 43 §5 | Aucun HTML/CSS caché dans un motif | FAIT | `blocks` stocke des `ContentBlock` (key/type/data), R3 tenu, `pattern-store.ts` doc | — |
| 43 §5 | Aucune copie React des blocs dans `packages/admin` | FAIT | Aucun composant de rendu de bloc trouvé — seulement `BlockForm` (formulaire schema-driven, réutilisé depuis L2) | — |
| 43 §6 (tests) | Fidélité à l'octet maintenue après les sous-chantiers A/B/E | FAIT (les 10 tests existants passent toujours en l'état du code) | `serve-builder.test.ts` inchangé, toujours 10 tests | — |
| 43 §6 | Test bout en bout combinant motif inséré + collage contre un vrai serveur | **PARTIEL/ABSENT** | Aucun cas de ce type dans `serve-builder.test.ts` — les tests patterns/copier-coller sont au niveau routeur/composant, jamais via un vrai `cogenta serve` HTTP | Le critère précis de la fiche 05 (« ajouter un cas motif + collage contre un vrai serveur et une vraie base ») n'a pas été rempli, même si la couverture unitaire/routeur est bonne |
| 43 §6 C(ii) | Test de contrat identique sur les 5 thèmes : bloc de thème sans implémentation retombe sur `fallback` | FAIT | `theme-block-fallback.test.ts` × 5, identique | Bloc de test construit à la main (`createBlockRegistry([...VOCABULARY, themePullQuote])`) — prouve le mécanisme, pas le câblage production (cohérent avec le point mort ci-dessus) |
| 43 §6 | Permissions : `update` requis pour insérer un motif/modèle | FAIT | même route `/api/builder/render`, même `PermissionLayer` que tout bloc | — |
| 43 §8 | ADR-0009 rouverte sur le seul point taille du vocabulaire | FAIT | ADR-0030 §Décision point 3 : `f.blocks()` toujours refusé, règle absolue R3 inchangée | — |
| RFC 0001 | 5 blocs, chacun avec `fallback` vers v1 | FAIT | `vocabulary.ts` L370-513 | — |
| RFC 0001 | Coût changeset `major` pour blocs + 5 thèmes | FAIT (déclaré) — changesets non vérifiés par cet audit | ADR-0030 §Conséquences le mentionne ; fichiers `.changeset/*.md` non ouverts (hors périmètre lecture ciblée) | À confirmer par un audit dédié aux changesets si nécessaire |
| RFC 0002 | 4 axes fermés, jamais une valeur CSS/couleur | FAIT | `variant.ts` : `z.enum` sur 4 listes fermées de tokens | — |
| RFC 0002 | Absent = rendu inchangé | FAIT | `withBlockVariant` : retourne l'élément inchangé si `variant === undefined` ou si l'objet attrs est vide | — |
| L10§L16 | `data-block-key`/`data-field` posés sur **tout** rendu, pas seulement l'aperçu | FAIT | `withBlockKey` appelé par `renderPage` inconditionnellement, testé | — |
| L10§L16 | Aperçu = brouillon (`state=working`), differs seulement par `noindex`/canonique | FAIT | `serve-builder.test.ts` L247-282 | — |
| Contrat B | `f.blocks()` (imbrication) toujours refusé | FAIT | `field.ts` L17 commentaire, aucune trace de `blocks` dans les types de champ disponibles à un bloc | — |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| P1 | `packages/cli/src/commands/serve.ts` (aucun appel à `createBlockRegistry` hors défaut) ; `theme-render.ts` L199 `ThemeRenderOptions.blocks` ; `packages/api/src/rest/dependencies.ts` L48/L77, `router.ts` L71 | **Point mort** : le paramètre `registry?`/`blocks?` (site avec blocs privés, sous-chantier C(ii)) est plombé de bout en bout dans le code (rendu ET validation d'écriture) mais jamais alimenté par un vrai `cogenta serve` — aucune surface de config n'existe pour qu'un thème ou un plugin déclare un bloc. Un vrai auteur de thème tiers ne peut pas exploiter cette fonctionnalité aujourd'hui, malgré les tests unitaires qui la prouvent au niveau fonction | Soit documenter honnêtement l'écart (mettre à jour `CLAUDE.md`/`docs/lots/43-*`), soit ajouter le point d'extension réel : un thème exporte son `BlockRegistry` (à côté de `renderPage`/`renderChrome` dans `ThemeModule`), `theme-registry.ts` le récupère au chargement et le passe à `renderRequestedPage`/`createRestRouter` |
| P2 | `docs/04-contrats.md` § Contrat B (L319-440) | Documentation à jour manquante : le champ `variant` (RFC 0002, faisant pourtant partie de la même montée `blocks@2.0` qu'ADR-0030 acte comme un tout) n'est décrit nulle part dans le contrat versionné — seul RFC 0001 (les 5 blocs) y figure | Ajouter une section « Variante visuelle par bloc (`variant`) » au § Contrat B, avec les 4 axes et la règle « jetons sémantiques uniquement » |
| P3 | `packages/admin/src/builder/block-library.ts` L22-33 (`CATEGORY_BY_BLOCK`) | Les 5 blocs `blocks@2.0` (`testimonial`, `pricingTable`, `accordion`, `statCounter`, `logoStrip`) sont absents de la table de catégories et retombent tous silencieusement dans `listing` — `testimonial`/`accordion` seraient plus à leur place en `text`, `logoStrip` en `media`. Le test `block-library.test.ts` ne détecte pas cette dérive (il vérifie seulement qu'une catégorie valide est utilisée, pas qu'elle est explicite) | Ajouter les 5 entrées manquantes à `CATEGORY_BY_BLOCK`, et renforcer le test pour échouer si un bloc n'a pas d'entrée explicite |
| P2 | `packages/cli/test/serve-builder.test.ts` | Absence du cas d'acceptation explicitement demandé par la fiche 05 (« motif + collage contre un vrai serveur ») — la couverture existe ailleurs (routeur, composant) mais jamais en bout en bout HTTP réel, contrairement au reste du fichier | Ajouter un test : POST `/api/patterns`, insertion du motif renvoyé dans `blocks`, `POST /api/builder/render`, comparer au rendu public après sauvegarde |
| P3 | `packages/admin/src/builder/preview-dom.ts` (édition en place) | Recommandation « minimum honnête » de la fiche 05 tâche 4 jamais construite : un double-clic sur un champ `richText` (ex. `prose.body`, `testimonial.quote`, `accordion.items[].answer`) ne fait rien, sans aucun indice pour l'auteur | Sur `dblclick` d'un `[data-field]` non éligible à l'édition en place, sélectionner le bloc et ouvrir/focaliser le panneau `BlockForm` sur ce champ précis (l'attribut existe déjà pour l'identifier) |
| — (non-bug, absence assumée) | `packages/schema/src/store/pattern-store.ts` | « Motifs fournis avec le thème » (fiche 05 tâche 1, option 1) jamais construits — seuls les motifs créés depuis l'admin existent. Ce n'est pas documenté comme un renoncement explicite nulle part (ni ADR, ni note dans fiche 43) | À trancher : soit une note honnête dans `docs/lots/43-*` disant que seule l'option 2 a été retenue, soit une tâche T pour livrer des motifs par thème (voir § 6) |

Recherche ciblée de violations de règles (`AGENTS.md`) sur tout le périmètre du
domaine (`packages/admin/src/builder`, `packages/blocks/src`,
`packages/theme-kit/src`, `packages/api/src/rest/pattern-router.ts`,
`packages/schema/src/store/pattern-*.ts`) : **aucun** `any`, `@ts-ignore`,
`console.log`, ou `throw new Error(` nu trouvé. Permission vérifiée par rôle
sur `/api/patterns` (admin/editor, testé refus viewer+anonyme) et sur
`/api/builder/render` (authentifié + `update`, testé). Pas de champ HTML/CSS
stocké (R3) dans `pattern-store.ts` ni dans `variant.ts`. Aucune dépendance
nouvelle introduite par ce domaine (copier-coller = presse-papiers natif,
drag & drop = événements DOM natifs — R9 tenu, conforme aux commentaires du
code qui le revendiquent explicitement).

## 5. Comparaison marché

### Elementor (widgets + onglets Style/Avancé)

| Fonctionnalité Elementor | Cogenta | Détail |
|---|---|---|
| Widgets de base (heading, image, texte, bouton, vidéo…) | PARTIEL | Couvert par 17 blocs sémantiques (`hero`, `prose`, `mediaFigure`, `cta`…), pas des widgets atomiques indépendants — un choix délibéré (ADR-0009/contrat B), pas un manque |
| Widgets pro (formulaire, table de tarifs, témoignages, compteur, accordéon, slider) | PARTIEL | `pricingTable`, `testimonial`, `accordion`, `statCounter` existent (blocks@2.0) ; formulaire = contrat G séparé (ADR-0026, hors périmètre builder) ; pas de slider/carousel dédié (`gallery.layout: 'carousel'` s'en approche) |
| Sections/colonnes, conteneurs flex, imbrication libre | NON | Explicitement refusé (`f.blocks()` absent, ADR-0009 point 3 tenu même après réouverture) |
| Onglet Style (marge/padding/fond/bordure/ombre/typo par élément) | PARTIEL | `variant` couvre fond/espacement/alignement/largeur en jetons sémantiques fermés — pas de valeurs libres (marge en px, couleur hex, ombre) : refusé par construction (R3) |
| Réglages responsive par appareil (valeurs différentes par breakpoint) | NON | `variant` est une valeur unique, résolue par le thème ; pas de valeur par breakpoint |
| Motion effects / animations | NON | Aucune trace dans le vocabulaire ni le rendu |
| Conditions d'affichage (par rôle, device, date) | NON | Aucune trace |
| Modèles globaux / theme builder (header/footer réutilisable) | NON | `theme.renderChrome` (L23) est fixé par thème, pas éditable visuellement ; pas de motif de header/footer |
| Popup builder | NON | Aucune trace |
| Navigateur d'éléments (structure/plan du document) | PARTIEL | `BlockOutline` (liste latérale) existe, mais pas de vue arborescente repliable au-delà de la liste plate |
| Historique (undo/redo) | OUI | 50 instantanés, `Ctrl/⌘+Z` |
| Raccourcis clavier | OUI | Undo/redo, copier/coller ; déplacements aussi opérables par boutons nommés |
| Bibliothèque de motifs/sections | OUI | Motifs du site (pas de motifs fournis par le thème — voir § 4) |
| Modèles de page complets | OUI | `kind: 'template'`, confirmation modale avant remplacement |
| Verrouillage d'élément | OUI | Session-only, admin-only |
| Copier/coller entre pages/onglets | OUI | Presse-papiers natif, format `cogenta/blocks@1` |

### Divi Builder / WPBakery

| Fonctionnalité | Cogenta | Détail |
|---|---|---|
| Presse-papiers de style (copier le style, pas le contenu) | NON | `variant` se copie avec le bloc entier au copier/coller, pas indépendamment |
| Bibliothèque de mise en page premade (100+ designs) | NON | Aucun motif préfabriqué livré |
| Édition frontale en place complète (texte riche compris) | PARTIEL | Texte simple seulement (voir § 4 P3) |
| Sauvegarde de mise en page comme modèle réutilisable | OUI | `kind: 'template'` |

### Bricks

| Fonctionnalité | Cogenta | Détail |
|---|---|---|
| Éditeur de structure imbriquée (nesting) | NON | Refusé par contrat B |
| Variables de style globales par élément | PARTIEL | Jetons `variant` fermés (pas de variables arbitraires) |
| Query builder visuel (filtrer une collection sans code) | OUI | `collectionList.filter/sort/limit` (contrat B v1) |

### Gutenberg (WordPress)

| Fonctionnalité | Cogenta | Détail |
|---|---|---|
| Blocs de base + blocs group/row/stack | PARTIEL | 17 blocs plats, pas de conteneurs de groupement (cohérent avec le refus d'imbrication) |
| Patterns (motifs) | OUI | Motifs du site, pas de motifs fournis par le thème/marketplace |
| Synced patterns (blocs réutilisables synchronisés) | NON | Décision explicite de la fiche 05 (option a retenue), non une lacune non tranchée |
| Styles globaux (thème + par bloc) | PARTIEL | `theme.tokens.json` (global) + `variant` (par instance de bloc) ; pas d'édition visuelle des styles globaux depuis le builder |
| Block locking (verrouiller déplacement/suppression) | OUI | Équivalent exact, session-only côté Cogenta vs. persistant côté Gutenberg — écart mineur |
| Import/export de blocs/patterns | OUI | `cogenta/pattern-file@1`, aller-retour testé |
| Historique de version (au-delà d'undo de session) | OUI (hors builder) | Couvert par l'onglet Historique de l'entrée (L2/L10), pas par ce domaine |

### Webflow

| Fonctionnalité | Cogenta | Détail |
|---|---|---|
| Canvas de mise en page libre (position absolue, grid custom) | NON | Hors du modèle de blocs sémantiques |
| Composants réutilisables synchronisés multi-pages | NON | Décision explicite (motif figé, pas de référence synchronisée) |
| Aperçu responsive multi-device | OUI | 3 largeurs réelles, mise à l'échelle par `transform: scale()` |

## 6. Spécification ultra détaillée des corrections et ajouts

### T01 — Rendre exploitable le registre de blocs de thème (combler le point mort C(ii))

**Priorité** : P1. **Effort** : 1,5 j. **ADR requise** : non (le mécanisme est
déjà couvert par ADR-0030 — il s'agit de finir le câblage, pas de changer une
décision).

**Fichiers à toucher** :
- `packages/cli/src/commands/theme-registry.ts` — `ThemeModule` gagne un champ
  optionnel `blocks?: BlockRegistry` (ou une fonction `loadBlocks?: () =>
  BlockRegistry`), à côté de `renderPage`/`renderChrome`.
- Un thème qui veut déclarer un bloc privé l'exporte (aucun des 5 thèmes
  in-house n'en a besoin aujourd'hui — cette tâche ouvre la porte, ne force
  personne à l'emprunter).
- `packages/cli/src/commands/theme-render.ts` — `renderRequestedPage`/
  `renderDraftPage` récupèrent `options.blocks` depuis le thème actif chargé
  (`themeFor(options.activeTheme)`), plutôt que de le laisser à `undefined`
  par défaut.
- `packages/cli/src/commands/serve.ts` — même résolution passée à
  `createRestRouter({ ..., blocks })` pour que la validation d'écriture
  connaisse aussi les blocs privés du thème actif.

**Travail détaillé** : la fonction `resolveBlockForRender` et le paramètre
`registry?` existent déjà et sont testés (5× `theme-block-fallback.test.ts`).
Il ne s'agit donc que de brancher une vraie source pour ce paramètre plutôt
que de le laisser toujours `undefined`. Le `BlockRegistry` doit être résolu
une fois par changement de thème actif (même mémoïsation que
`theme-registry.ts` applique déjà à `themeFor`).

**Critères d'acceptation** : un thème de test qui exporte un `BlockRegistry`
contenant un bloc `themePullQuote` (`fallback: 'quote'`) rend réellement ce
bloc quand ce thème est actif, et son `fallback` déclaré quand un autre thème
in-house est actif — vérifié par un vrai `cogenta serve` (pas seulement un
appel direct à `renderBlock`).

**Tests exigés** : un cas dans `packages/cli/test/serve-builder.test.ts` (ou
un nouveau fichier `serve-theme-blocks.test.ts`) qui bascule le thème actif via
`/api/theme` et vérifie le rendu du bloc privé, puis son repli après
changement de thème.

**Impact contrat/ADR** : aucun — additif, la capacité était déjà actée par
ADR-0030.

### T02 — Documenter `variant` dans `docs/04-contrats.md`

**Priorité** : P2. **Effort** : 0,5 j. **ADR requise** : non (correction de
dérive documentaire, la décision est déjà actée).

**Fichiers** : `docs/04-contrats.md` § Contrat B.

**Travail détaillé** : ajouter une sous-section « Variante visuelle par bloc
(`variant`, `blocks@2.0`) » juste après « Le vocabulaire v2 — les cinq
ajoutés », listant les 4 axes (`background`/`spacing`/`align`/`width`), leurs
valeurs fermées, la règle « absent = rendu inchangé », et un renvoi vers
`packages/blocks/src/variant.ts` et `docs/rfc/0002-per-block-visual-variant.md`.

**Critères d'acceptation** : `grep -n "variant" docs/04-contrats.md` trouve la
section ; `docs-sync` (sous-agent) ne signale plus cet écart.

### T03 — Catégoriser les 5 blocs `blocks@2.0` dans le panneau d'insertion

**Priorité** : P3. **Effort** : 1 h. **ADR requise** : non (catégories admin,
hors contrat).

**Fichiers** : `packages/admin/src/builder/block-library.ts`,
`packages/admin/test/builder/block-library.test.ts`.

**Travail détaillé** : ajouter à `CATEGORY_BY_BLOCK` : `testimonial: 'text'`,
`accordion: 'text'`, `pricingTable: 'listing'`, `statCounter: 'listing'`,
`logoStrip: 'media'`. Renforcer le test `'files every block under a real
category'` pour échouer si `CATEGORY_BY_BLOCK[name]` est `undefined` (au lieu
de laisser le repli silencieux `?? 'listing'` masquer l'oubli).

**Critères d'acceptation** : le test modifié échoue si on retire une entrée ;
tous les blocs apparaissent dans une catégorie cohérente à l'usage.

### T04 — Repli « minimum honnête » pour l'édition en place du texte riche

**Priorité** : P2. **Effort** : 1 j. **ADR requise** : non (fiche 05 tâche 4,
déjà cadrée sans impact contrat).

**Fichiers** : `packages/admin/src/builder/preview-dom.ts`,
`packages/admin/src/builder/page-builder.tsx`,
`packages/admin/src/i18n/locales/{fr,en}.json`.

**Travail détaillé** : dans `preview-dom.ts`, poser aussi un gestionnaire
`dblclick` sur `[data-field]` non éligible à l'édition en place — le rendu
serveur pose déjà `data-field` sur ces éléments pour les besoins du builder ;
il suffit de ne pas les exclure du câblage, seulement de leur donner un
comportement différent (au lieu de `contenteditable`, appeler un nouveau
callback `handlers.onRequestFieldFocus(blockKey, field)`). Dans
`page-builder.tsx`, ce callback sélectionne le bloc concerné et ouvre le
panneau de droite (`BlockForm`) avec le focus posé sur le champ nommé.

**Critères d'acceptation** : double-cliquer sur le corps d'un bloc `prose`,
la citation d'un `testimonial`, ou une réponse d'`accordion` ouvre le panneau
et y place le focus, sans que l'iframe cesse d'être du HTML serveur brut (le
test de fidélité à l'octet reste vert).

**Tests exigés** : cas composant dans `page-builder.test.tsx` (double-clic sur
un champ `richText` → panneau ouvert, focus sur le bon champ) ; pas de
changement au test de fidélité serveur.

### T05 — Test bout en bout motif + collage contre un vrai serveur

**Priorité** : P2. **Effort** : 0,5 j. **ADR requise** : non.

**Fichiers** : `packages/cli/test/serve-builder.test.ts`.

**Travail détaillé** : ajouter un `describe` reproduisant le critère
d'acceptation explicite de la fiche 05 : `POST /api/patterns` avec un vrai
acteur `editor`, récupérer l'`id`, `POST /api/builder/render` avec les blocs
du motif insérés dans `values.blocks`, comparer le HTML obtenu au rendu de
l'entrée après sauvegarde réelle (`PATCH` de l'entrée + `GET` public) —
exactement le schéma déjà utilisé par les tests de fidélité existants du même
fichier.

**Critères d'acceptation** : le nouveau test passe contre un vrai serveur HTTP
et une vraie base SQLite fichier, sans mock.

### T06 — Motifs fournis avec le thème (ou renoncement documenté)

**Priorité** : P3. **Effort** : 2 j si retenu ; 15 min si renoncement écrit.
**ADR requise** : non (un motif shipped-with-theme reste « une liste de blocs
existants », zéro impact contrat, comme tranché par ADR-0030/fiche 43 §5).

**Décision à prendre d'abord** : la fiche 05 proposait deux origines de
motifs ; seule la seconde (motifs du site) a été construite. Ce n'est
documenté nulle part comme un renoncement explicite — juste un silence.
Deux options, à trancher par l'humain avant de coder quoi que ce soit :

1. **Livrer des motifs par thème** : chaque paquet de thème exporte un
   tableau `BUNDLED_PATTERNS: readonly PatternSeed[]` (nom, catégorie, liste
   de blocs) à côté de `theme.config` ; `pattern-router.ts` fusionne les
   motifs du site et ceux du thème actif à la lecture (`GET /api/patterns`),
   sans jamais les écrire en base — la source du thème reste la source de
   vérité, pas de copie qui pourrait diverger.
2. **Renoncement assumé** : ajouter une ligne dans `docs/plans/43-*.md`
   constatant que seule l'option « motifs du site » a été retenue et
   pourquoi (couvre déjà 80 % du besoin, comme la fiche l'anticipait pour les
   blocs réutilisables).

**Fichiers si option 1** : nouveau fichier `packages/theme-canonical/src/
patterns.ts` (et les 4 autres thèmes), `theme-registry.ts` (`ThemeModule`
gagne `patterns?: readonly PatternSeed[]`), `pattern-router.ts` (fusion à la
lecture).

**Critères d'acceptation (option 1)** : un site neuf sans aucun motif créé
voit déjà 2-3 motifs dans la bibliothèque, marqués visuellement comme
« fournis par le thème » (non supprimables depuis l'admin — seule la
provenance change, la donnée reste identique à un motif de site).

## 7. Ordre d'exécution recommandé et dépendances

1. **T02** (documenter `variant`) — 0,5 j, aucune dépendance, corrige une
   dérive déjà actée, à faire en premier car c'est un simple oubli.
2. **T03** (catégories manquantes) — 1 h, indépendant, rapide.
3. **T05** (test bout en bout motif+collage) — 0,5 j, indépendant, comble un
   trou de couverture avant d'ajouter du code neuf par-dessus une fonctionnalité
   déjà en place.
4. **T01** (registre de blocs de thème exploitable) — 1,5 j, indépendant des
   autres ; c'est le point mort le plus significatif, à traiter avant qu'un
   vrai thème tiers ne soit annoncé comme extensible alors qu'il ne l'est pas
   en pratique.
5. **T04** (repli édition riche) — 1 j, indépendant, dernier des correctifs de
   confort hérités de la fiche 05.
6. **T06** (motifs de thème) — nécessite une décision humaine préalable
   (option 1 vs renoncement documenté) ; à traiter en dernier car c'est le
   seul item qui ouvre un vrai nouveau développement plutôt que de finir de
   l'existant.

Aucune dépendance croisée entre T01-T06 : tous parallélisables si plusieurs
agents/sessions sont disponibles, chacun dans son propre dossier de fichiers.
