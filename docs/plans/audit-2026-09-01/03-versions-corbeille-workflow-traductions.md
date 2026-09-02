# Audit domaine 03 — Versions et historique, corbeille, workflow éditorial, traductions — 2026-09-01

## 1. Résumé exécutif

**Constat central : les quatre fiches sources (`06`, `07`, `37`, `10`) sont
significativement périmées.** Elles décrivaient un état antérieur à un lot non
documenté dans `CLAUDE.md` (dont le tableau d'état s'arrête à L24) qui a implémenté
l'essentiel de leurs recommandations : ADR-0027 (workflow éditorial, `schema@2.1`,
« Acté » et **réellement insérée** dans `docs/03-decisions.md`), la quasi-totalité de
la corbeille (fiche 07, 5/5 tâches), la comparaison de versions arbitraire et le diff
mot-à-mot (fiche 06), et un vrai tableau de bord de traduction avec obsolescence
(fiche 10). Le fichier `docs/lots/L20-audit-admin-complet.md` — postérieur aux
quatre fiches — le confirme déjà en passant (« workflow éditorial natif »,
« vraie avance sur Strapi »), mais les fiches elles-mêmes n'ont jamais été mises à
jour. **Ne jamais se fier au « État » en tête d'une fiche : vérifié à la lettre,
code en main.**

Décompte des critères vérifiés (tâches + critères d'acceptation des 4 fiches,
détail en §3) : **26 FAIT, 8 PARTIEL, 6 ABSENT, 2 POINT MORT**, sur 42 items notés.

Le socle serveur (`packages/schema`, `packages/api`) est quasiment complet et bien
testé (migration `schema@2.1` avec test de compatibilité explicite, table de
transitions fermée, permission `own`, contract-guardian-friendly). Les manques réels
sont concentrés côté admin : pas d'UI pour assigner un relecteur (fonction cliente
exportée, jamais appelée — **point mort**), badge « à relire » qui ne se rafraîchit
pas après une action dans `review.tsx`/`entry-edit.tsx` (même bug que L20 §1.15,
corrigé pour la corbeille/commentaires/formulaires mais pas pour le workflow), pas de
commentaires de relecture internes, pas de notifications de transition, pas de vue
côte-à-côte de traduction, pas de texte alternatif de média par locale, pas de note
de révision, pas de calendrier éditorial.

Aucun bug de règle (R1-R10) trouvé dans le code propre à ce domaine : pas de `any`,
pas de `console.log`, pas de `throw new Error` nu, permissions vérifiées côté
serveur uniquement (R4), aucune dépendance nouvelle (diff mot-à-mot en LCS maison,
R9).

## 2. Ce qui existe réellement

### Versions et historique
- `packages/schema/src/store/diff.ts` — diff structurel + `enrichWordDiffs` (LCS
  mot-à-mot, zéro dépendance).
- `packages/admin/src/versions/version-history.tsx` (369 lignes, contre 230 à la
  date de la fiche) + `diff-view.tsx`.
- API : `GET .../history`, `GET .../diff?from=&to=`, `POST .../restore` (inchangées
  en forme).

### Corbeille
- `packages/schema/src/store/store.ts` (`delete`/`untrash`/`purge`/`purgeExpired`,
  ADR-0022).
- `packages/admin/src/routes/trash.tsx` (**744 lignes**, contre 217 à la date de la
  fiche — quasi réécrit).
- `packages/admin/src/trash/purge-confirm-modal.tsx`,
  `packages/admin/src/trash/date-format.tsx`.
- `packages/api/src/rest/shell-status-router.ts` (`GET /api/trash-status` — dernier
  balayage), `packages/api/src/content/*` (colonnes `deletedAt`, filtrage par
  défaut).

### Workflow éditorial
- ADR-0027, `docs/03-decisions.md:1165` — **actée et insérée**, contrairement à la
  plupart des autres ADR de ce dépôt qui restent « rédigées, non insérées » faute
  d'accès en écriture.
- `packages/schema/src/store/review-transitions.ts` — table de transitions fermée
  (`submit`/`approve`/`requestChanges`).
- `packages/schema/src/store/schema-2-1-migration.ts` — colonnes `review_state`
  (`not null default 'none'`) et `assigned_reviewer`, migration non destructive,
  testée SQLite (`packages/schema/test/store/schema-2-1-migration.contract.ts`,
  6 tests dont un test de compatibilité explicite).
- `packages/api/src/rest/review-router.ts` — `GET /api/review?scope=` (file
  agrégée, 3 scopes).
- `packages/api/src/rest/router.ts:465-497` — routes `submit`/`approve`/
  `request-changes`/`assign-reviewer`, chacune son propre `POST`.
- `packages/api/src/rest/content-service.ts:371-390,736-767` — `assertOwnAware`
  (permission `own: true`) et les quatre méthodes de service.
- `packages/admin/src/routes/review.tsx` (223 lignes) — file à 3 onglets.
- `packages/admin/src/routes/entry-edit.tsx:276-282,789-841,1259-1391` — sidebar
  workflow, bouton contextuel Soumettre/Approuver/Demander des modifications.
- `packages/admin/src/shell/nav-items.ts:108-118` — item de nav `/review`, visible
  seulement si `workflowPresent`, badge `reviewPending`.
- Tests : `packages/api/test/rest/workflow-router.test.ts` (15 tests, dont
  permissions par rôle, `own`, compatibilité, refus si workflow désactivé),
  `packages/api/test/rest/review-router.test.ts`,
  `packages/api/test/rest/own-permission-override.test.ts`,
  `packages/admin/test/review.test.tsx` (5 tests).

### Traductions
- ADR-0014 (modèle, inchangé), `docs/04-contrats.md` §schema@2.1 pour `reviewState`
  (sans rapport direct avec les traductions mais dans le même contrat).
- `packages/admin/src/collections/translation-switcher.tsx` (95 lignes, inchangé en
  taille).
- `packages/admin/src/routes/translations.tsx` (204 lignes) — **nouveau**, tableau
  de bord matriciel.
- `GET /{collection}/-/translation-matrix` — `packages/api/src/rest/router.ts:53,
  322-335` (route), `packages/api/src/rest/content-service.ts:291,828`
  (`translationMatrix`), une jointure serveur, pas de fichier `translation*`
  dédié.
- `packages/admin/src/taxonomies/term-form-modal.tsx` — libellé de terme **par
  locale du site**, déjà éditable.
- `packages/admin/src/routes/collection-list.tsx:98-104,231,459-477,694-699,
  954-995` — colonne et filtre de langue.
- Tests : `packages/api/test/rest/translation-matrix.test.ts` (4 tests, dont
  l'obsolescence et le refus public), `packages/admin/test/routes/translations.test.tsx`.

## 3. Vérification des fiches, critère par critère

### Fiche 06 — Versions et historique

| # | Tâche/critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| T1 | Comparer deux versions quelconques | **FAIT** | `version-history.tsx:200-242` (deux `<select>` from/to + bouton comparer, appelle `getDiff` avec les deux versions) | — |
| T2 | Auteur affiché | **FAIT** | `version-history.tsx:57,92-103,296` (`listUsers` → email, repli sur id brut si 403) | — |
| T2 | Date lisible (`Intl.DateTimeFormat`) + statut visuel | **FAIT** | `version-history.tsx:115-122,286-291` | — |
| T2 | Pagination au-delà de 20 versions | **FAIT** | `version-history.tsx:31,170-171,312-319` (« show more » par lots de `PAGE_SIZE=20`) | La liste complète est récupérée en un seul `GET .../history` non paginé côté serveur ; le repli est purement client. Fonctionnellement conforme au critère (« ne fait pas 50 requêtes de diff »), mais un historique très long paie toujours un payload initial complet. |
| T2 | Résumé d'une ligne par version (« 3 champs, 1 bloc modifiés ») | **ABSENT** | Aucune trace dans `version-history.tsx` | Non livré. Le critère « pas de N+1 » est respecté (parce que rien n'est calculé), pas le confort. |
| T3 | Diff mot à mot texte riche, zéro dépendance | **FAIT** | `packages/schema/src/store/diff.ts:240-345` (`enrichWordDiffs`, LCS maison), câblé dans `diff-view.tsx` | Décidé côté serveur, conforme à la recommandation R6 de la fiche. |
| T4 | Note de révision | **ABSENT** | Aucun champ, aucune route, aucune trace dans `content-service.ts`/`review-router.ts`/journal d'audit | Décision de la fiche (« journal d'audit sans contrat, à privilégier ») jamais tranchée ni codée. |
| T4 | Rétention des versions | **FAIT (pré-existant, différent du plan)** | `packages/schema/src/store/store.ts:212,255` (`DEFAULT_KEEP = 20`, `versioning.keep`) | La fiche demandait de vérifier l'existence d'une purge et proposait un mécanisme par jours façon `purgeExpired()`. Le mécanisme réel est **par nombre de versions gardées**, pas par jours — antérieur à cette fiche, jamais documenté comme réponse à son inquiétude. Fonctionnellement, il empêche l'accumulation à 700 versions que la fiche redoutait. Aucune ADR n'a formalisé ce choix comme réponse à la tâche 4. |
| T5 | Confirmation de restauration | **FAIT** | `version-history.tsx:324-357` (`Modal`, nomme version/date/auteur) | — |
| T5 | Annulation en un clic après restauration | **FAIT** | `version-history.tsx:65-68,138-168,181-198` (`undoTarget`, notice avec bouton « annuler ») | — |
| CA | Permissions : rôle sans `update` voit l'historique, pas restaurer | **FAIT** (supposé, `canRestore` prop réutilisée) | `version-history.tsx:37,299` (`canRestore` passé par le parent, inchangé) | Non revérifié par un nouveau test dans cette fiche — c'est le comportement préexistant, non régressé. |

**Verdict fiche 06** : 7 FAIT, 1 PARTIEL (pagination sans vraie pagination serveur),
2 ABSENT (résumé par version, note de révision).

### Fiche 07 — Corbeille

| # | Tâche/critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| T1 | Vue toutes collections | **FAIT** | `trash.tsx:145-158,274-286` (fusion client, tri par `deletedAt` décroissant) | Décision « fusion client bornée » prise et **assumée honnêtement à l'écran** (`allTabTruncated`, `trash.allTruncated` banner) — exactement la voie « livrable tout de suite » que la fiche autorisait, jamais la route serveur `GET /api/trash` propre. |
| T2 | Cases à cocher, sélection page | **FAIT** | `trash.tsx:297-318,605-611` | — |
| T2 | Restaurer la sélection, rapport nommé | **FAIT** | `trash.tsx:325-352` (`Promise.allSettled`, `ActionReport`) | — |
| T2 | Purger la sélection, modale avec mot de confirmation >10 | **FAIT** | `purge-confirm-modal.tsx:22,44-50` (`TYPED_CONFIRMATION_THRESHOLD = 10`) | — |
| T2 | Vider la corbeille d'une collection | **FAIT** | `trash.tsx:402-435` (`openEmptyCollection`, borné `MAX_EMPTY_FETCH_ITEMS = 2000`) | — |
| T3 | Date relative + ISO en `title` | **FAIT** | `trash.tsx:654-662` | — |
| T3 | Colonne « purge dans N jours » | **FAIT** | `trash.tsx:619,628-633,663-669` (`daysUntilPurge`) | — |
| T3 | Colonne « supprimée par » | **FAIT** | `trash.tsx:208-263,634,670-674` (résolution via journal d'audit `content.delete` + `listUsers`, admin uniquement) | Résout le bug L20 §1.13 (« UUID brut ») — vérifié corrigé. |
| T4 | Pagination (réutilise `collection-list.tsx`) | **FAIT** | `trash.tsx:118-121,706-725` (pile de curseurs) | Seulement pour l'onglet par collection ; l'onglet « Tout » reste plafonné à `ALL_PROBE_LIMIT = 50` par collection sans pagination (assumé et annoncé). |
| T4 | Recherche | **FAIT (client)** | `trash.tsx:288-292,521-532` | Recherche client sur la page courante seulement, honnêtement documentée en commentaire (`withSearchIndexing` n'indexe pas le supprimé). |
| T4 | Tri | **ABSENT** | Aucun contrôle de tri dans `trash.tsx` | Le tri est fixe (implicite par `deletedAt`/`updatedAt`), pas de colonne cliquable ni de sélecteur. Confort, non bloquant. |
| T5 | Bandeau purge automatique | **FAIT** | `trash.tsx:490-507` (`autoPurgeBannerAll`/`autoPurgeBanner`, `trashStatus.lastRunAt`) | Affiche le dernier balayage réel (pas une promesse) — voir §4 pour vérifier que `purgeExpired()` tourne vraiment. |
| CA | Entrée publiée restaurée reste publiée | **FAIT** (comportement serveur ADR-0022, testé) | `packages/schema/test` (contrat ADR-0022, hors périmètre de cette fiche mais revérifié non régressé) | — |
| CA | Restauration bloquée nomme ce qui bloque | **FAIT** | `trash.tsx:341-343` (message `ApiError` du serveur, qui nomme la relation) | — |
| CA | Rôle sans `delete` : aucune de ces collections visible | **FAIT** | `trash.tsx:103-108` (`canPerform('delete', …)`) | — |

**Verdict fiche 07** : 13 FAIT, 1 ABSENT (tri). La fiche la plus complètement
livrée des quatre.

### Fiche 37 — Workflow éditorial

| # | Tâche/critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| T0 | ADR tranchant (a)/(b)/(c)/(d) + permission par propriétaire | **FAIT** | ADR-0027, `docs/03-decisions.md:1165-1188` — option (b) retenue comme recommandé, **actée et insérée** | — |
| T1 | `reviewState` orthogonal, table de transitions fermée, routes dédiées | **FAIT** | `review-transitions.ts`, `router.ts:465-497` | — |
| T1 | `approved` ≠ `published` | **FAIT** | `review-transitions.ts:29-31` (commentaire explicite + `action: 'publish'` sans jamais appeler `store.publish`) | — |
| T2 | Champ « relecteur assigné » | **PARTIEL** | Serveur : `assignedReviewer` (colonne, méthode `assignReviewer`, route `POST .../assign-reviewer`) FAIT. **Admin : aucune UI pour choisir/changer un relecteur.** | **Point mort** — voir §4. `entry-edit.tsx:1354` affiche `assignedReviewer` en lecture seule ; `submitReview()` (`entry-edit.tsx:794-809`) appelle `submitForReview(token, name, id)` sans jamais passer de `reviewerId`. La fonction cliente `assignReviewer` (`content-client.ts:614`) n'est appelée nulle part dans `packages/admin/src`. |
| T2 | Permission « ses propres contenus » (`own: true`) | **FAIT** | ADR-0027 point 3, `content-service.ts:371-390` (`assertOwnAware`), validé par `validateCollectionSet` | Testé y compris pour `/restore`, un angle mort trouvé et corrigé pendant le développement (`workflow-router.test.ts:223`). |
| T3 | File de relecture, 3 onglets | **FAIT** | `review.tsx:41,110-129`, `review-router.ts:41-45` (scopes `assigned`/`pending`/`mine`) | — |
| T3 | Badge de navigation avec le nombre en attente | **PARTIEL** | `nav-items.ts:113-117` (badge `reviewPending`), `shell-status-router.ts:244` (calcul serveur) — badge existe et se calcule correctement au chargement, **mais ne se rafraîchit jamais après une action prise depuis `review.tsx` ou `entry-edit.tsx`** | **Bug**, voir §4 (même famille que L20 §1.15, corrigée pour trash/commentaires/formulaires, pas pour le workflow). |
| T4 | État du workflow, relecteur, bouton contextuel dans la sidebar | **FAIT** | `entry-edit.tsx:1336-1391` (aside, dans le `<aside>` sticky, cohérent avec fiche 02 tâche 1) | — |
| T4 | Bouton Publier remplacé par Soumettre pour qui n'a pas `publish` | **FAIT** | `entry-edit.tsx:911-913,1259-1267` (`canSubmitReview`, `canReview`) | — |
| T5 | Commentaires de relecture internes | **ABSENT** | Aucun fichier `*review-comment*`, aucune table, aucune route | Non livré. Distinct des commentaires publics (ADR-0025) — cette distinction est respectée par construction (rien n'existe des deux côtés qui les confondrait). |
| T6 | Notifications de transition | **ABSENT** | Aucun appel à `@cogenta/channels`/notice depuis `content-service.ts` sur `submit`/`approve`/`requestChanges` | Non livré. Une notification de transition n'existe nulle part — ni e-mail, ni notice admin, ni canal. |
| T7 | Verrouillage pendant relecture | **FAIT (réutilisation)** | `entry-edit.tsx:669` (détection d'écriture concurrente réutilisée, comme recommandé) | Conforme à la recommandation de la fiche : pas de verrou dur, la détection de conflit suffit. |
| T7 | Calendrier éditorial | **ABSENT** | Aucun fichier `*calendar*` dans `packages/admin/src` | Non livré ; la fiche le marquait explicitement « non bloquant, à faire en dernier ». |
| CA | Cycle complet 4 rôles, transitions refusées côté serveur | **FAIT** | `workflow-router.test.ts` (contributor/reviewer/admin testés par rôle, y compris refus) | Trois rôles distincts testés plutôt que quatre nommément, mais chaque permission/transition est bien testée côté serveur. |
| CA | Table de transitions vit sur le serveur, jamais dupliquée à l'écran | **FAIT** | `review.tsx`/`entry-edit.tsx` n'encodent aucune règle : ils affichent des boutons conditionnés par `reviewState`/permissions déjà résolues côté serveur, chaque clic est un appel réseau qui peut être refusé | — |
| CA | Site qui n'active pas le workflow fonctionne comme avant | **FAIT** | `workflow-router.test.ts:244-257,286-299` (`refuses every transition…`, `leaves reviewState at 'none'…`) | — |
| CA | Aucun client headless écrit avant ne casse | **FAIT** | `schema-2-1-migration.contract.ts:157` (test de compatibilité explicite) | — |

**Verdict fiche 37** : 11 FAIT, 2 PARTIEL (assignation UI, badge non rafraîchi),
3 ABSENT (commentaires, notifications, calendrier).

### Fiche 10 — Traductions et multilingue

| # | Tâche/critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| T1 | Tableau de bord matriciel, une requête serveur | **FAIT** | `translations.tsx:1-24,45-63` (route `getTranslationMatrix`, une requête par page, jamais un `getTranslations` par ligne) | — |
| T2 | Obsolescence, définition (a) | **FAIT** | `translation-matrix.test.ts:81` (« marks a translation obsolete once the source changes after it »), affiché honnêtement comme un fait (`translationDashboard.obsolete`) dans `translations.tsx:174` | Conforme à la recommandation « signal, pas verdict ». |
| T3 | Colonne langue + filtre dans les listes de contenu | **FAIT** | `collection-list.tsx:104,231,459-477,694-699,954-995` | — |
| T3 | Sélecteur de traduction remonté en sidebar de l'éditeur | **ABSENT** | `entry-edit.tsx:1721` (le bloc `TranslationSwitcher` est un `<details>` **après** la fermeture de `<aside>` à la ligne 1569, donc toujours en bas de page) | La fiche demandait explicitement de le remonter dans la barre latérale (comme le workflow l'a fait, lignes 1336-1391) ; ce n'est pas fait pour les traductions. |
| T3 | Indiquer clairement quelle entrée est la source | **PARTIEL** | `translation-switcher.tsx:59-65` (le locale courant est mis en gras, les autres sont des liens) | Montre la famille et la position courante, mais aucun libellé explicite « traduction de … » avec lien direct vers la source sur une traduction déjà enregistrée. |
| T4 | Vue côte à côte source/cible | **ABSENT** | Aucun fichier `side-by-side.tsx` dans `packages/admin/src/collections/` | Non livré. |
| T5 | Texte alternatif des médias par locale | **ABSENT** | `packages/core/src/media/types.ts:24` (`alt: string`, une seule valeur) | Le modèle `MediaStore` n'a pas évolué ; c'est toujours une chaîne unique. Écart de parité et d'accessibilité toujours ouvert, exactement comme la fiche le décrivait. |
| T5 | Libellés de termes par locale | **FAIT** | `term-form-modal.tsx:12-13,138-146` (un champ par locale du site) | Cette partie de la tâche 5 (qui recoupe la fiche 08) est livrée. |
| CA | Voir en un écran ce qui reste à traduire | **FAIT** | `translations.tsx` (matrice) | — |
| CA | Traduction dont la source a changé signalée | **FAIT** | cf. T2 | — |
| CA | Chaque liste de contenu montre la langue | **FAIT** | cf. T3 | — |
| CA | Image avec texte alternatif par langue | **ABSENT** | cf. T5 | — |
| CA | `hreflang` toujours correct | **FAIT (non régressé)** | `packages/seo/test/hreflang.test.ts` toujours vert, aucun fichier de rendu touché par cette fiche | — |
| Test | Permission : rôle qui ne lit pas une locale ne la voit pas dans la matrice | **FAIT** | `translation-matrix.test.ts:140-148` (refus acteur public, entrée non publiée exclue par ligne) | — |

**Verdict fiche 10** : 8 FAIT, 2 PARTIEL, 3 ABSENT.

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P1** | `packages/admin/src/api/content-client.ts:614` (`assignReviewer`) | **Point mort.** Fonction cliente exportée, testée nulle part côté admin, **jamais appelée** par aucun écran. Server-side, `assign-reviewer` est une route réelle et testée (`workflow-router.test.ts:259`). Résultat : impossible d'assigner un relecteur à une entrée depuis l'admin ; `entry-edit.tsx:1354` n'affiche que l'état, jamais un moyen de le changer, et `submitReview()` (`entry-edit.tsx:794-809`) ne propose jamais de choisir un relecteur au moment de soumettre. | Ajouter un `<select>` de relecteur (liste des acteurs tenant `publish` sur la collection, via `/api/users` + `PermissionLayer`) dans la sidebar workflow et/ou au moment de `submitForReview`, appelant `assignReviewer`. |
| **P2** | `packages/admin/src/routes/review.tsx:71-96` ; `packages/admin/src/routes/entry-edit.tsx:794-841` | **Bug.** Ni `approve`/`requestChanges` dans `review.tsx`, ni `submitReview`/`approveReviewNow`/`requestChangesNow` dans `entry-edit.tsx` n'appellent `useRefreshChromeStatus()`. Le badge `reviewPending` de la barre latérale (`nav-items.ts:117`) reste donc périmé jusqu'au prochain chargement complet — exactement le bug que L20 §1.15 décrivait et que `trash.tsx:351,392`/`comments.tsx`/`form-submissions.tsx` corrigent déjà (`grep useRefreshChromeStatus` : seuls ces trois fichiers l'appellent). | Importer `useRefreshChromeStatus` dans les deux fichiers et l'invoquer après chaque transition réussie, comme `trash.tsx` le fait. |
| P3 | `docs/plans/06-versions-et-historique.md`, `07-corbeille.md`, `37-workflow-editorial.md`, `10-traductions.md` | **Dérive documentaire.** Les quatre fiches affichent un « État » qui ne correspond plus au code depuis (au minimum) l'insertion d'ADR-0027 le 2026-08-20. Un lecteur qui s'y fie recoderait des fonctionnalités déjà livrées (c'est très exactement ce que l'instruction d'audit demandait de vérifier, et le risque qu'elle anticipait). | `docs-sync` devrait être invoqué sur ces quatre fiches pour mettre à jour leur bandeau d'état une fois les tâches restantes de ce document traitées. |
| P3 | `packages/schema/src/store/store.ts:212` (`DEFAULT_KEEP`) vs fiche 06 tâche 4 | Le mécanisme de rétention réel (`versioning.keep`, borne par **nombre** de versions) répond à l'inquiétude de la fiche (accumulation illimitée) mais par un mécanisme différent de celui suggéré (`retainDays`). Ni la fiche ni aucune ADR ne documente ce choix comme la réponse à la tâche 4 — quelqu'un qui cherche « la politique de rétention des versions » ne la trouve nulle part écrite comme telle. | Documentation seule : une ligne dans la fiche ou dans `docs/04-contrats.md` reliant `versioning.keep` à la préoccupation de rétention. |

Aucun `any`, `@ts-ignore`, `console.log`, `throw new Error` nu, contrôle de
permission côté outil, ni dépendance nouvelle non justifiée trouvés dans les
fichiers de ce domaine (`review.tsx`, `trash.tsx`, `translations.tsx`,
`version-history.tsx`, `review-transitions.ts`, `schema-2-1-migration.ts`,
`review-router.ts`, `content-service.ts`, `router.ts`). Toutes les clés i18n
utilisées par ces écrans sont présentes en `fr.json` et `en.json`.

## 5. Comparaison marché

### Versions et historique — WordPress / Strapi 5 / Drupal 11

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Liste des révisions | ✅ | ✅ (Enterprise) | ✅ | ✅ |
| Diff structurel (pas du JSON) | partiel | ✅ | ✅ | ✅ **mieux** (blocs déplacés détectés) |
| Comparer deux versions quelconques | ✅ | ✅ | ✅ | ✅ |
| Diff mot à mot du texte riche | ✅ | partiel | ✅ | ✅ |
| Auteur de la version | ✅ | ✅ | ✅ | ✅ |
| Message / note de révision | ❌ | ❌ | ✅ | ❌ |
| Restaurer, avec confirmation | ✅ | ✅ | ✅ | ✅ |
| Annuler une restauration en un clic | partiel | ❌ | partiel | ✅ (notice + `undo`) |
| Purge / rétention des révisions | ✅ (constante) | ✅ | ✅ | ✅ (par nombre, `versioning.keep`) |
| Vue côte à côte (double panneau) | ✅ | ✅ | ✅ | ❌ (liste de changements) |
| Résumé « N champs modifiés » sans ouvrir le diff | ❌ | partiel | partiel | ❌ |

### Corbeille — WordPress / Drupal 11

| Fonction | WordPress | Drupal 11 | Cogenta |
|---|---|---|---|
| Corbeille par type de contenu | ✅ | ✅ (module) | ✅ |
| Toutes collections d'un coup | ✅ | ✅ | ✅ |
| Restauration groupée | ✅ | ✅ | ✅ |
| « Vider la corbeille » | ✅ | ✅ | ✅ |
| Date de suppression lisible + délai restant | ✅ | ✅ | ✅ |
| Qui a supprimé | ❌ | ✅ | ✅ |
| Recherche dans la corbeille | ✅ (serveur) | ✅ (serveur) | ✅ (client seulement) |
| Tri | ✅ | ✅ | ❌ |
| Pagination | ✅ | ✅ | ✅ (par collection ; « Tout » plafonné et annoncé) |
| Purge automatique visible / configurable | ✅ (30 j) | ✅ | ✅ (visible ; réglage par fichier de schéma, non par écran — cohérent ADR-0010) |
| Message clair quand la restauration est bloquée | partiel | ✅ | ✅ (nomme la relation) |
| Mot de confirmation pour purge massive | ❌ | ❌ | ✅ **mieux** (>10 éléments) |

### Workflow éditorial — WordPress (+PublishPress) / Drupal 11 Content Moderation / Strapi 5 Review Workflows

| Fonction | WordPress (+PublishPress) | Drupal 11 | Strapi 5 | Cogenta |
|---|---|---|---|---|
| Statut « en attente de relecture » | plugin | ✅ | ✅ (Enterprise) | ✅ |
| File « à relire » (assignée / toutes / mes soumissions) | plugin | ✅ | ✅ | ✅ (3 onglets) |
| Assignation à une personne | plugin | ✅ | ✅ | **partiel** — route serveur seulement, aucune UI (point mort §4) |
| Commentaires de relecture sur une entrée | plugin | ✅ | ✅ | ❌ |
| Notification de changement d'état | plugin | ✅ | ✅ | ❌ |
| Transitions par rôle, définies serveur | plugin | ✅ (Workflows) | ✅ | ✅ (table fermée) |
| Permission « ses propres contenus » | ✅ | ✅ | ✅ | ✅ (`own: true`) |
| Historique du workflow | plugin | ✅ | ✅ | audit seulement (pas de fil dédié) |
| Verrouillage / détection de conflit pendant relecture | ✅ | ✅ | ✅ | ✅ (détection réutilisée, pas de verrou dur) |
| Échéances éditoriales / calendrier | plugin | ✅ | ✅ | ❌ |
| Workflow optionnel, par type de contenu | plugin (site entier) | ✅ | ✅ | ✅ **mieux** (par collection, jamais un interrupteur global) |
| Badge de file en attente dans la nav | plugin | ✅ | ✅ | **partiel** — existe, ne se rafraîchit pas en session (§4) |

### Traductions — WPML/Polylang / Drupal 11 / Strapi 5

| Fonction | WPML/Polylang | Drupal 11 | Strapi 5 | Cogenta |
|---|---|---|---|---|
| Entrée par langue, statut indépendant | ✅ | ✅ | ✅ | ✅ |
| Bascule de langue dans l'éditeur | ✅ | ✅ | ✅ | ✅ (mais toujours en bas de page, pas en sidebar) |
| Tableau de bord de traduction (matrice) | ✅ | ✅ | partiel | ✅ |
| Signal « la source a changé depuis » | ✅ | ✅ | ❌ | ✅ (formulé comme un fait) |
| Vue côte à côte source/cible | ✅ | ✅ | ❌ | ❌ |
| Copie champ-par-champ depuis la source | ✅ | ✅ | ❌ | ❌ |
| Traduction assistée par IA | plugin | plugin | ✅ | partiel (panneau assistant existant, hors périmètre de ce domaine) |
| Traduction des taxonomies (libellés par langue) | ✅ | ✅ | ✅ | ✅ |
| Traduction des menus | ✅ | ✅ | ❌ | ✅ (menu par locale, préexistant) |
| Texte alternatif des médias par locale | ✅ | ✅ | ❌ | ❌ |
| Colonne langue + filtre dans les listes | ✅ | ✅ | ✅ | ✅ |
| URL par langue | ✅ | ✅ | ✅ | ✅ |

## 6. Spécification ultra détaillée des corrections et ajouts

### T01 — Assigner un relecteur depuis l'admin (combler le point mort)

**Priorité** : P1 (fonctionnalité serveur existante, totalement inaccessible).
**Effort** : 0,5 j.
**Fichiers** : `packages/admin/src/routes/entry-edit.tsx`,
`packages/admin/src/i18n/locales/fr.json`/`en.json`.

**Travail détaillé** — Ajouter, dans le bloc workflow de la sidebar
(`entry-edit.tsx:1340-1391`, à côté de `assignedReviewer`), un `<select>` listant
les acteurs qui tiennent `publish` sur la collection (réutiliser `listUsers` déjà
importé pour résoudre les noms, filtré côté client par rôle — pas de nouvelle
route). Visible pour qui tient `update`/`own` (peut proposer un relecteur à la
soumission) et pour qui tient `publish` (peut réassigner). Au changement,
appeler `assignReviewer(token, name, id, reviewerId)` (déjà exporté,
`content-client.ts:614`) et mettre à jour `assignedReviewer` local. Ajouter
également un `reviewerId` optionnel au formulaire de soumission
(`submitForReview` accepte déjà cet argument côté client, cf. commentaire
`content-client.ts:573`).

Clés i18n à ajouter (FR+EN) : `entryEdit.workflow.reviewerSelectLabel`,
`entryEdit.workflow.reviewerSelectPlaceholder`, `entryEdit.workflow.reviewerAssignError`.

**Critères d'acceptation** : un rôle tenant `publish` peut assigner un relecteur à
une entrée `pending` sans passer par l'API directement ; le relecteur assigné
apparaît dans `review.tsx` onglet « à relire » pour ce seul relecteur.

**Tests exigés** : composant (`entry-edit.tsx`), sélection d'un relecteur puis
vérification de l'appel `assignReviewer` avec les bons arguments ; permissions
(le sélecteur n'apparaît pas pour un rôle sans `update`/`publish`).

**Impact contrat/ADR** : aucun — route et champ existent déjà (`schema@2.1`).
ADR requise : **non**.

### T02 — Rafraîchir le badge « à relire » après une action

**Priorité** : P2 (bug, même famille que L20 §1.15 déjà corrigée ailleurs).
**Effort** : 0,25 j.
**Fichiers** : `packages/admin/src/routes/review.tsx`,
`packages/admin/src/routes/entry-edit.tsx`.

**Travail détaillé** — Importer `useRefreshChromeStatus` (déjà utilisé par
`trash.tsx`/`comments.tsx`/`form-submissions.tsx`) dans les deux fichiers et
appeler `refreshChromeStatus()` après un `approve`/`requestChanges` réussi dans
`review.tsx` (lignes 71-96) et après un `submitReview`/`approveReviewNow`/
`requestChangesNow` réussi dans `entry-edit.tsx` (lignes 794-841) — même motif
exact que `trash.tsx:351,392`.

**Critères d'acceptation** : approuver une entrée depuis `review.tsx` fait
décrémenter immédiatement le badge `reviewPending` de la barre latérale, sans
recharger la page.

**Tests exigés** : composant, vérifier que `refresh()` du contexte est appelé
après chaque transition réussie (mock du contexte comme le fait déjà
`trash.test.tsx`).

**Impact contrat/ADR** : aucun. ADR requise : **non**.

### T03 — Note de révision (trancher la décision ouverte de la fiche 06 tâche 4)

**Priorité** : P2.
**Effort** : 1 j.
**Fichiers** : `packages/api/src/audit/*` (si option « journal d'audit » retenue),
`packages/admin/src/versions/version-history.tsx`,
`packages/admin/src/routes/entry-edit.tsx` (bouton Enregistrer).

**Travail détaillé** — Retenir l'option **sans contrat touché** que la fiche
recommandait : un commentaire optionnel porté par l'événement d'audit
`content.publish`/le futur snapshot de version, plutôt qu'un nouveau champ du
contrat A. Ajouter un champ de texte facultatif au moment de publier/enregistrer
une version significative ; l'afficher dans `version-history.tsx` à côté de
l'auteur (`version-history.tsx:295-297`) si présent, sinon rien (pas de « — »
qui laisserait croire à un champ obligatoire manquant).

**Critères d'acceptation** : un message saisi à l'enregistrement apparaît dans
l'historique de cette version précisément, jamais sur une autre.

**Tests exigés** : unitaire (le message est associé à la bonne version), composant
(affichage conditionnel), permission (qui peut écrire un message = qui peut
`update`).

**Impact contrat/ADR** : aucun si porté par le journal d'audit (chemin
recommandé). ADR requise : **non** dans ce cas ; **oui** si un nouveau champ du
contrat A est choisi à la place.

### T04 — Commentaires de relecture internes (fiche 37 tâche 5)

**Priorité** : P2 (parité workflow, absente).
**Effort** : 3-4 j.
**Fichiers** : nouveau `packages/schema/src/store/review-comments.ts` (ou table
dédiée hors contrat A, sur le modèle de `cogenta_patterns`/`menu-tables.ts` — une
table fixe, non déclarée par le schéma), nouvelle route
`packages/api/src/rest/review-comments-router.ts`, nouvel écran/panneau dans
`entry-edit.tsx` (à côté du bloc workflow de la sidebar).

**Travail détaillé** — Fil de discussion **interne** par entrée : auteur, texte,
horodatage, résolu/non résolu. **Ne pas** réutiliser ADR-0025 (contrat F,
commentaires publics) — deux domaines distincts, la fiche est explicite. Minimum
viable : un fil au niveau de l'entrée, pas d'ancrage sur un champ/bloc précis
(la fiche le reporte explicitement à un second temps). Permission : lecture/
écriture réservée à qui tient `read`+`update` (auteur, relecteurs) sur la
collection — jamais public.

**Critères d'acceptation** : un relecteur laisse un commentaire au moment de
« Demander des modifications » ; l'auteur le voit dans sa file « mes
soumissions » ; un commentaire résolu ne réapparaît pas dans un badge de
non-lus.

**Tests exigés** : contrat de store (SQLite + Postgres + MySQL, table hors
contrat A comme `pattern-store.ts`), permissions par rôle, composant.

**Impact contrat/ADR** : table nouvelle mais **hors contrat A** (comme
`cogenta_patterns`/menus) — pas de montée de version du contrat A. ADR requise :
**non**, sur le modèle déjà établi par la fiche 43 (motifs) et les menus.

### T05 — Notifications de transition (fiche 37 tâche 6)

**Priorité** : P2.
**Effort** : 1-2 j (réutilisation).
**Fichiers** : `packages/api/src/rest/content-service.ts` (points d'appel
`submit`/`approve`/`requestChanges`), réutilisation de `@cogenta/channels`
(déjà dépendance réelle ailleurs dans le projet, ex. `renewal-notifier.ts` de
`@cogenta/commerce`).

**Travail détaillé** — À chaque transition réussie, émettre une notification via
les primitives déjà existantes de `@cogenta/channels` (`buildNotification`, la
même famille que `createEmailRenewalNotifier`) : au relecteur assigné (ou à tous
ceux qui tiennent `publish` si personne n'est assigné) sur `submit`, à l'auteur
sur `approve`/`requestChanges`. Réutiliser le regroupement déjà présent dans
`@cogenta/channels` pour éviter une notification par entrée si plusieurs
transitions arrivent en rafale. R2 : sans canal configuré, no-op silencieux (même
motif que `sendRenewalNotices()`), jamais une fonctionnalité bloquante.

**Critères d'acceptation** : soumettre une entrée à un relecteur assigné envoie
une notification (e-mail au minimum, testable via un transport de test) ; sans
canal configuré, `submit` réussit exactement comme avant (R2).

**Tests exigés** : unitaire (contenu de la notification), intégration avec un
transport de test factice, vérification R2 explicite (aucun provider → aucune
erreur, aucun appel réseau).

**Impact contrat/ADR** : aucun changement de contrat — réutilisation pure.
ADR requise : **non**.

### T06 — Vue côte à côte de traduction (fiche 10 tâche 4)

**Priorité** : P3 (confort net, non bloquant).
**Effort** : 2-3 j.
**Fichiers** : `packages/admin/src/routes/entry-edit.tsx`, nouveau
`packages/admin/src/collections/side-by-side.tsx`.

**Travail détaillé** — Mode d'édition optionnel affichant, à gauche, la source en
lecture seule et, à droite, les champs de la traduction, uniquement pour `text`/
`richText`. Bouton « copier depuis la source » par champ. Basculer entre le mode
formulaire normal et cette vue via un contrôle dans la section traduction (à
déplacer en sidebar par la même occasion, cf. T07).

**Critères d'acceptation** : ouvrir une traduction en mode côte à côte affiche la
valeur source à gauche, éditable seulement à droite ; copier un champ le
remplace exactement, sans toucher aux autres champs.

**Tests exigés** : composant (rendu des deux colonnes, bouton copier), pas de
test serveur nouveau (aucune route nouvelle si la lecture réutilise `GET
.../translations` déjà existant).

**Impact contrat/ADR** : aucun. ADR requise : **non**.

### T07 — Remonter le sélecteur de traduction en sidebar (fiche 10 tâche 3, partie restante)

**Priorité** : P3.
**Effort** : 0,5 j.
**Fichiers** : `packages/admin/src/routes/entry-edit.tsx`.

**Travail détaillé** — Déplacer le bloc `<details>` contenant `TranslationSwitcher`
(actuellement lignes 1721-1740, après la fermeture de `<aside>` à la ligne 1569)
à l'intérieur du même `<aside>` que le bloc workflow, en s'inspirant exactement
du motif déjà utilisé pour le workflow (lignes 1336-1391). Ajouter, à côté du
locale courant, un libellé explicite « Traduction de : {titre de la source} »
avec lien, quand `translationOf !== null`.

**Critères d'acceptation** : le sélecteur de langue est visible sans défiler sur
un écran standard, à côté de l'état du workflow.

**Tests exigés** : composant (position dans le DOM par rapport à `<aside>`,
présence du libellé source sur une traduction existante).

**Impact contrat/ADR** : aucun. ADR requise : **non**.

### T08 — Texte alternatif des médias par locale (fiche 10 tâche 5)

**Priorité** : P2 (accessibilité, changement cassant assumé par la fiche
elle-même).
**Effort** : 2 j.
**Fichiers** : `packages/core/src/media/types.ts`, `packages/core/src/media/store.ts`,
`packages/api/src/rest/media-router.ts`, `packages/admin/src/media/media-detail.tsx`,
`packages/render/src/*` (choix de l'`alt` à la locale de rendu, repli sur la
locale par défaut).

**Travail détaillé** — `alt: string` devient `alt: Record<string, string>` (ou
`alt: string` conservé comme repli + `altByLocale?: Record<string, string>` pour
limiter la casse — à trancher : la fiche recommande le changement direct et
assumé, cassant pour un client headless qui lit `alt` comme chaîne). Le rendu
public (`cogenta serve`, thèmes) choisit l'`alt` de la locale de la page
courante, repli sur la locale par défaut du site, jamais une chaîne vide si une
traduction manque.

**Critères d'acceptation** : une image a un texte alternatif différent en
français et en anglais sur un site bilingue ; une locale sans `alt` propre
retombe sur la locale par défaut, jamais sur une image sans alternative.

**Tests exigés** : contrat de store (SQLite + Postgres + MySQL), rendu (le bon
`alt` apparaît dans le HTML servi selon la locale de la page), migration
réversible testée up/down/up (ADR-0022 en gabarit), test de compatibilité pour
un client headless qui lit encore `alt` comme chaîne unique si le repli est
retenu.

**Impact contrat/ADR** : **changement d'interface publique** (`MediaAsset`).
ADR requise : **oui** — montée mineure ou majeure selon que le repli
rétrocompatible est retenu ; changeset et note de migration obligatoires dans
tous les cas (la fiche le dit déjà explicitement).

### T09 — Calendrier éditorial (fiche 37 tâche 7, seconde moitié)

**Priorité** : P3 (la fiche elle-même le marque non bloquant, à faire en
dernier).
**Effort** : 2 j.
**Fichiers** : nouveau `packages/admin/src/routes/editorial-calendar.tsx`,
réutilisation de `GET /api/review` et d'une requête de contenu filtrée par
`status: 'scheduled'`.

**Travail détaillé** — Vue mensuelle simple : entrées avec une date de
publication programmée (`publishedAt` futur), et entrées `pending` avec leur
âge. Aucune nouvelle donnée serveur : agrégation pure de ce que `/api/content`
et `/api/review` renvoient déjà.

**Critères d'acceptation** : un mois affiche les publications programmées et les
échéances de relecture en attente, sans requête par jour.

**Tests exigés** : composant (regroupement par date).

**Impact contrat/ADR** : aucun. ADR requise : **non**.

### T10 — Résumé d'une ligne par version, sans N+1 (fiche 06 tâche 2, reste)

**Priorité** : P3.
**Effort** : 1 j.
**Fichiers** : `packages/admin/src/versions/version-history.tsx`, éventuellement
`packages/api/src/rest/content-service.ts` (si un résumé pré-calculé par le
serveur est retenu plutôt qu'un calcul paresseux au survol côté client).

**Travail détaillé** — Calculer, pour les seules versions **visibles à l'écran**
(les 20 de la page courante, jamais l'historique entier), un résumé « N champs,
M blocs modifiés » via un `GET .../diff` contre la version précédente,
uniquement au survol ou à l'expansion — jamais au chargement initial de la
liste (piège explicitement nommé par la fiche).

**Critères d'acceptation** : ouvrir une entrée à 50 versions ne déclenche aucune
requête de diff avant une interaction explicite sur une ligne.

**Tests exigés** : composant (aucun appel réseau au montage, un appel exactement
au survol/à l'expansion d'une ligne).

**Impact contrat/ADR** : aucun. ADR requise : **non**.

### T11 — Tri dans la corbeille (fiche 07 tâche 4, reste)

**Priorité** : P3.
**Effort** : 0,5 j.
**Fichiers** : `packages/admin/src/routes/trash.tsx`.

**Travail détaillé** — En-têtes de colonnes cliquables (date de suppression,
titre) pour inverser l'ordre côté client, sur les données déjà chargées — pas
de nouvelle route.

**Critères d'acceptation** : cliquer sur l'en-tête « Supprimée le » inverse
l'ordre des lignes visibles.

**Tests exigés** : composant.

**Impact contrat/ADR** : aucun. ADR requise : **non**.

## 7. Ordre d'exécution recommandé et dépendances

1. **T02** (badge non rafraîchi) — trivial, corrige un bug visible immédiatement,
   aucune dépendance.
2. **T01** (assigner un relecteur) — le point mort le plus visible, aucune
   dépendance serveur à créer (tout existe déjà côté API).
3. **T11** (tri corbeille) — trivial, indépendant.
4. **T07** (sidebar traduction) — indépendant, prépare le terrain visuel pour T06.
5. **T10** (résumé de version) — indépendant.
6. **T03** (note de révision) — à trancher (option journal d'audit recommandée)
   avant codage ; indépendant des autres.
7. **T05** (notifications de transition) — dépend de rien de nouveau
   (`@cogenta/channels` existe déjà), mais gagne à suivre T01 (savoir à qui
   notifier suppose qu'on puisse assigner un relecteur).
8. **T04** (commentaires de relecture) — le plus gros morceau restant de la
   fiche 37 ; peut suivre T01/T05 pour cohérence d'ensemble du panneau workflow,
   mais n'en dépend pas techniquement.
9. **T06** (vue côte à côte) — bénéficie de T07 (sélecteur déjà en sidebar) sans
   en dépendre strictement.
10. **T08** (alt média par locale) — le plus lourd et le seul avec **ADR
    requise** ; à traiter après validation humaine de l'ADR, indépendamment du
    reste.
11. **T09** (calendrier éditorial) — dernier, comme la fiche source le
    recommande déjà, bénéficie de T01/T05 pour avoir des données d'échéance
    plus riches mais fonctionne sans.

Aucun de ces dix items ne bloque les autres domaines de l'audit du 2026-09-01 :
tous restent internes à `packages/admin`, `packages/api` et, pour T04/T08, une
table ou un champ additif hors contrat A ou avec ADR déjà cadrée.
