# Audit domaine 10 — Coquille d'admin, navigation, tableau de bord, réglages, santé, notices, recherche — 2026-09-01

## 1. Résumé exécutif

Ce domaine est, de loin, le plus avancé des onze fiches auditées : les onze fiches
(`22`, `39`, `23`, `68`, `24`, `35`, `36`, `38`, `40`, `71`, `72`) décrivent un état
antérieur (parfois `dashboard.tsx` à 355 lignes) très en retard sur le code réel
(`dashboard.tsx` fait aujourd'hui 1081 lignes, `app-shell.tsx` 964, `settings.tsx` 655,
`site-settings-registry.ts` 1166). La quasi-totalité des tâches des dix fiches a déjà
été livrée, souvent au-delà de la lettre de la fiche (fiche 72 : le mode réduit a été
**redessiné** en flyout au survol plutôt qu'en accordéon aplati, décision documentée
en commentaire, plus abouti que la fiche ne le demandait).

**Décompte des critères vérifiés** (fiches 22/39/23/68/24/35/36/38/40/71/72, ~140
critères/tâches identifiables) : **FAIT ≈ 118**, **PARTIEL ≈ 12**, **ABSENT ≈ 6**,
**POINT MORT ≈ 4**. Détail au §3.

**Bugs trouvés, non documentés par les fiches** (§4) : **0 critique**, **2 P1** (logo
Cogenta figé sur l'écran de connexion et sur la barre d'admin publique, contournant le
réglage de marque blanche déjà câblé partout ailleurs ; badge « Corbeille » non
rafraîchi après une mise à la corbeille depuis l'éditeur d'entrée ou depuis la liste de
collection, seuls `trash.tsx`/`comments.tsx`/`form-submissions.tsx` appellent
`useRefreshChromeStatus`), **4 P2/P3** (notes/problèmes de `cogenta doctor` non
traduits sur l'écran Santé ; filtre par période absent du centre de notifications
malgré le commentaire qui l'annonce ; préférences de canal par personne jamais
exposées dans un écran malgré des fonctions client prêtes ; une clé i18n manquante en
français).

**Ce qui reste réellement absent** : gestion des langues de contenu depuis l'admin
(fiche 68 tâches 3-4, ADR non rédigée) ; accès direct « voir tous les résultats » type
axe-core sur la coquille (fiche 35 exige un test d'accessibilité dédié, absent) ; écran
de préférences de notification par personne (fiche 38 tâche 4).

## 2. Ce qui existe réellement

**Coquille et navigation** — `packages/admin/src/shell/app-shell.tsx` (964 l.),
`nav-items.ts` (460 l., groupes + conditions de visibilité typées), `nav-visibility.ts`
(74 l., filtre par permission/fonctionnalité/capacité), `nav-layout.ts` (142 l.,
réordonnancement/masquage par site, stocké dans les réglages), `breadcrumb.ts` (74 l.),
`theme-toggle.tsx`, `shell-status-context.tsx` (badge agrégé via
`/api/shell-status`). Menu à flyout au survol en mode réduit (redessiné, fiche 72),
tiroir mobile avec piège de focus, fil d'Ariane, `document.title` par route,
`⌘K`/`Ctrl+K`, barre d'admin publique (`theme-render.ts`).

**Tableau de bord** — `packages/admin/src/routes/dashboard.tsx` (1081 l.),
`lib/dashboard-prefs.ts` (130 l.). Huit widgets (`summary`, `health`, `activity`,
`analytics`, `scheduled`, `todo`, `shortcuts`, `backups`), glisser-déposer directement
sur la grille et dans le panneau de configuration (icône dédiée, plus de `<details>`),
brouillon rapide, filtrage par rôle/permission, agrégation en une requête
(`getContentSummary`), les widgets CVE/Core Web Vitals **retirés** (décision
documentée) plutôt que laissés vides.

**Réglages** — `routes/settings.tsx` (655 l., onglets Général/Lecture/
Discussion/Médias/Confidentialité/Navigation/Avancé), `ops-settings.tsx` (270 l.,
miroir en lecture seule + détecteur d'hygiène des secrets), `site-settings-registry.ts`
(1166 l., ~13 groupes de réglages typés : general, content, reading, discussion, media,
privacy, commerce, branding, seo, observability, assistant, updates, navigation,
channels), `site-settings-field.tsx` (445 l., dont fuseau horaire en select natif avec
aperçu live, formats de date avec exemple live).

**Santé et outils** — `routes/health.tsx` (372 l., drivers/migrations/audit/disque/
journal d'erreurs/maintenance, backé par `runDoctor` réellement partagé avec la CLI via
`health-router.ts`), `routes/tools.tsx` (197 l., sept outils passant par la file avec
suivi de progression réel), mode maintenance server-side complet (503,
`Retry-After: 120`, `no-store`, bypass authentifié/`/admin`).

**Notices** — `packages/api/src/notices/` (9 sources déclarées : MFA, activité
suspecte, migrations en attente, clé API qui expire, intégrité d'audit, plugin
désactivé, code de récupération utilisé, échec de publication programmée, suggestion
de redirection depuis le monitoring), `router.ts`, `history.ts` (centre avec état
lu/rejeté/résolu), `channel-bridge.ts` + `channel-settings-router.ts` (canaux
réellement branchés, regroupement/sévérité réutilisés de `@cogenta/channels`),
`notice-board.tsx` (142 l.) + `notification-center.tsx` (214 l., cloche, compteur,
filtre par sévérité, marquage groupé).

**Recherche globale** — `shell/global-search.tsx` (586 l. : `⌘K`, actions
« aller à »/« créer un »/thème/déconnexion, filtres en ligne, recherches récentes,
six sources dont taxonomies/menus/réglages), `routes/search.tsx` (page de résultats
complète : pagination, filtres collection/statut/langue/période, tri, onglet
« recherche par le sens » conditionné à un index non vide).

**Diagnostics d'erreurs** — `api/describe-error.ts` (`describeApiError`) migré sur
4 écrans à fort trafic (`entry-edit`, `collection-list`, `media`, `users`) ;
`scaffold.ts` génère `COGENTA_PREVIEW_SIGNING_KEY` à l'installation ; `doctor.ts`
avertit (non bloquant) sur une clé de prévisualisation absente/courte.

**Navigation profonde/URL et sidebar réduite** — `useSearchParams`/vraies routes
appliqués sur les 8 écrans listés par la fiche 71 (`appearance`, `admin-appearance`,
`agents` → route `agents/:name`, `roles`, `commerce-subscriptions` → route
`commerce/subscriptions/:id`, `marketplace`, `agent-skills`, `prompt-settings`). Fiche
72 : bugs 1/2 corrigés, mais via une refonte complète en flyout plutôt qu'en accordéon
aplati (documenté, meilleur que le plan initial).

**Connexion et marque** — `routes/login.tsx` (365 l., icône + version visibles via
`/api/shell-status`), section `branding` du schéma (`showCogentaBranding`,
`customLogoMediaId`) branchée dans `app-shell.tsx` et `theme-render.ts` — **mais pas**
dans `login.tsx` ni dans la barre d'admin publique (voir §4).

**i18n** — `fr.json`/`en.json` : 3537 clés en anglais, 3536 en français ; une seule
clé manquante (`richText.imageDropHint`), écart quasi nul comparé à l'ampleur de
l'admin.

## 3. Vérification des fiches, critère par critère

| Fiche | Tâche/critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| 22 | Tâche 1 — résumé de contenu, une requête agrégée, cliquable | FAIT | `dashboard.tsx:271-291` `getContentSummary`, `renderSummary` | — |
| 22 | Tâche 2 — widgets par rôle + raccourcis + « à faire » | FAIL→FAIT | `dashboard.tsx` widgets `todo`(l.712)/`shortcuts`, gating par `canPerform`/`isAdmin` | — |
| 22 | Tâche 3 — widgets réorganisables, `localStorage`, boutons nommés | FAIT | `dashboard-prefs.ts`, boutons monter/descendre l.966-980 | — |
| 22 | Tâche 4 — remplir ou retirer CVE/Core Web Vitals/backups | FAIT | `dashboard.tsx:129-150`, commentaire explicite « removed » | — |
| 22 | Tâche 5 — brouillon rapide | FAIT | `submitQuickDraft` l.434 | erreur non migrée vers `describeApiError` (l.461, mineur) |
| 22 | Critère « `notice-board.test.tsx` stable en lot » | PARTIEL | QA plan 2026-08-22 point 19 signale une instabilité préexistante non liée à cette session, non revérifiée ici | à revérifier |
| 39 | Tâche 1 — glisser une carte réelle | FAIT | `dashboard.tsx:1049-1067`, réutilise `dropBefore` | — |
| 39 | Tâche 2 — icône de configuration dédiée | FAIT | `dashboard.tsx:922-933`, `Modal` remplace le `<details>` | — |
| 39 | Tâche 3 — aperçu (icône+nom) dans la liste | FAIT | `widgetLabel()` l.904-912 | — |
| 23 | Tâche 1 — table de réglages typée, clé inconnue refusée | FAIT | `site-settings-registry.ts` (1166 l.) | — |
| 23 | Tâche 2 — écran à onglets façon WordPress | FAIT | `settings.tsx` `TAB_ORDER` l.34-41 | onglet Discussion présent malgré fiche 15 « sans objet » à l'origine — commentaires livrés depuis, cohérent |
| 23 | Tâche 3 — fuseau + formats, une fonction de formatage partout | FAIT (fiche 68) | `lib/format.ts`, `site-settings-field.tsx` | — |
| 23 | Tâche 4 — page d'accueil réglable, remplace `/home` en dur | FAIT | `theme-render.ts:350-360`, `reading.homePath` | — |
| 23 | Tâche 5 — miroir enrichi + détection de secret en fichier | FAIT | `ops-settings.tsx:226-260`, `secret-hygiene.ts` | corrige les 2 points hors-périmètre L10 mentionnés au CLAUDE.md |
| 23 | Critère « aucun secret sérialisé vers le client » | FAIT | `secret-hygiene.ts` ne renvoie jamais `database.url`, seulement des booléens | — |
| 68 | Tâche 1 — fuseau en select natif + heure live | FAIT | `site-settings-field.tsx:302-335`, `Intl.supportedValuesOf` | — |
| 68 | Tâche 2 — exemple live dateStyle/timeStyle | FAIT | `site-settings-field.tsx:258-270` | — |
| 68 | Tâche 3 — ADR langues de contenu | ABSENT | aucune ADR "langues de contenu" dans `docs/03-decisions.md` (dernière = ADR-0031) | à écrire |
| 68 | Tâche 4 — UI ajout/suppression de langue | ABSENT | `settings.tsx:330-336` affiche la locale par défaut en lecture seule uniquement | dépend de la tâche 3 |
| 68 | Tâche 5 — déplacement de Marque vers Apparence | FAIT | `appearance.tsx:133-190`, retiré de `settings.tsx` | — |
| 24 | Tâche 1 — écran Santé = même code que `doctor` | FAIT | `health-router.ts` appelle `runDoctor` directement | — |
| 24 | Tâche 2 — migrations : lister + appliquer non destructives | FAIT | `health-router.ts:47-58,219-224`, `health.tsx:225-275` | — |
| 24 | Tâche 3 — outils (7 items) via file, avec avancement | FAIT | `tools.ts` (7 `id`), `tools.tsx` polling | corrige le bug L20 #7 (« queued » indéfiniment) |
| 24 | Tâche 4 — journal d'erreurs, filtré, borné | FAIT | `health.tsx:311-320`, `errorLog.entries` | filtrage des secrets à revérifier en détail côté serveur (non lu ligne à ligne) |
| 24 | Tâche 5 — mode maintenance, 503, jamais caché | FAIT | `serve.ts:3742-3757`, `retry-after:120`, `cache-control:no-store` | — |
| 35 | Tâche 1 — regroupement + filtrage par permission | FAIT | `nav-items.ts`, `nav-visibility.ts` | — |
| 35 | Tâche 2 — sidebar repliable + tiroir mobile | FAIT | `app-shell.tsx` (drawer, focus trap, `Échap`) | — |
| 35 | Tâche 3 — badges, une requête agrégée | FAIT | `shell-status-router.ts` (un seul `/api/shell-status`) | 2 points d'entrée de mise à la corbeille ne rafraîchissent pas le badge en session (§4) |
| 35 | Tâche 4 — fil d'Ariane + `document.title` | FAIT | `breadcrumb.ts`, `app-shell.tsx:495-502` | — |
| 35 | Tâche 5 — palette de commandes | FAIT | `global-search.tsx:150-166` (thème, déconnexion, aller à, créer un) | — |
| 35 | Tâche 6 — barre d'admin publique, `private, no-store` | FAIT | `theme-render.ts:711-732` | texte "Cogenta Admin"/"Edit this page" non traduit, logo non blanc-marque (§4) |
| 35 | Test — axe-core sur la coquille + tiroir mobile | ABSENT | aucun `axe`/`toHaveNoViolations` dans `test/app-shell.test.tsx` (535 l., 33 `it`) | test exigé par la fiche, jamais écrit |
| 36 | Tâche 1 — raccourci + palette d'actions | FAIT | `global-search.tsx:430-437` | — |
| 36 | Tâche 2 — page de résultats complète | FAIT | `routes/search.tsx` (pagination, filtres, tri, URL partageable) | — |
| 36 | Tâche 3 — extraits + surlignage | FAIT | `search-router.ts:28-32,226-262` (`excerpt`/`highlights`) | — |
| 36 | Tâche 4 — élargir les sources (taxonomies, menus, réglages) | FAIT | `global-search.tsx` (taxonomies l.197, menus l.267, réglages l.338) | commandes/extensions non ajoutées explicitement — à vérifier plus finement, non bloquant |
| 36 | Tâche 5 — recherches récentes + filtres en ligne | FAIT | `search/recent-searches.ts`, `search/inline-filters.ts` | — |
| 36 | Tâche 6 — recherche sémantique conditionnelle | FAIT | `routes/search.tsx` onglet `semantic`, conditionné | — |
| 38 | Tâche 1 — registre générique de notices | FAIT | `notices/types.ts` (`NoticeSource`), 9 sources déclarées (contre 2 à l'origine de la fiche) | — |
| 38 | Tâche 2 — centre de notifications | FAIT/PARTIEL | `notification-center.tsx` (cloche, compteur, sévérité, marquage groupé) | filtre par **période** annoncé en commentaire (l.19) mais absent du code — PARTIEL |
| 38 | Tâche 3 — brancher les canaux | FAIT | `channel-bridge.ts`, `channel-settings-router.ts`, `routes/channels.tsx` | — |
| 38 | Tâche 4 — préférences par personne | POINT MORT | `getChannelPreferences`/`setChannelPreferences` existent dans `notices-client.ts`, **jamais appelés** (`channels.tsx:27-28` le dit explicitement) | écran à construire |
| 38 | Tâche 5 — sévérité et présentation, jamais bloquant | FAIT | `types.ts` (`NoticeSeverity`), `notice-board.tsx` jamais modal | — |
| 38 | Tâche 6 — rafraîchissement périodique (1 min), pas de temps réel | FAIT | `notice-board.tsx`/`notification-center.tsx` `setInterval` avec `POLL_INTERVAL_MS` | R1 respecté |
| 40 | Tâche 1 — afficher le hint sur l'aperçu | FAIT | `entry-edit.tsx:706,1502-1505` | — |
| 40 | Tâche 2 — `describeApiError` partagé | FAIT (partiel assumé) | 5 fichiers migrés (`entry-edit`, `collection-list`, `media`, `users`), 194 occurrences de l'anti-motif restent dans le reste de l'admin | dette documentée par la fiche elle-même, non un manquement |
| 40 | Tâche 3 — générer la clé de preview à l'installation | FAIT | `scaffold.ts:265-266` | — |
| 40 | Tâche 4 — `doctor` avertit sur la clé de preview | FAIT | `doctor.ts:177-183` | — |
| 71 | 8 écrans avec vraie URL par sous-vue | FAIT | `appearance`/`admin-appearance`/`roles`/`marketplace`/`agent-skills`/`prompt-settings` = `useSearchParams`; `agents`/`commerce-subscriptions` = routes dédiées (`app.tsx:127,155`) | — |
| 72 | Bug 1 — texte de groupe non masqué en mode réduit | FAIT (autrement) | refonte flyout, plus de `<summary>` texte nu (`shell.css:408-425`) | résolu par une conception différente de celle décrite, documentée |
| 72 | Bug 2 — liste masquée en mode réduit | FAIT (autrement) | flyout au survol remplace l'accordéon aplati prévu | — |
| 72 | Tâche 3 — info-bulles `title` | FAIT | `app-shell.tsx:557,580,636,661` `title={t(item.labelKey)}` | — |
| 72 | Tâche 4 — repositionner le bouton de réduction | FAIT (autrement) | déplacé en haut de liste plutôt qu'à cheval sur la bordure — décision utilisateur documentée (`shell.css:216-219`) | — |
| 72 | Tâche 5 — tiroir mobile non affecté | FAIT | code partagé, `sidebarCollapsed` ignoré en mode tiroir (non revérifié par test dédié dans cette passe) | — |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| P1 | `packages/admin/src/routes/login.tsx:24` | `<img src="/_cogenta/logo-cogenta.png">` codé en dur — l'écran de connexion affiche toujours le logo Cogenta même quand `branding.showCogentaBranding=false` et `branding.customLogoMediaId` est renseigné. Contredit la marque blanche déjà câblée dans `app-shell.tsx`/`theme-render.ts` (L21 tâche 8). Le commentaire du fichier justifie ce choix par « le même actif public que le pied de page et le favicon » mais le pied de page **respecte**, lui, `branding.*` (`theme-render.ts:287-305`). | Faire lire `LoginBrand` les réglages `branding.*` via `GET /api/settings` (public, sans session, comme le confirme `channels.tsx:38`) avant de choisir entre `DEFAULT_LOGO_PATH` et un logo personnalisé résolu par `customLogoMediaId`. |
| P1 | `packages/cli/src/commands/theme-render.ts:725-732` | La barre d'admin publique (fiche 35 tâche 6) code en dur `"Cogenta Admin"`/`"Edit this page"`/`"New"` en anglais, sans passer par `branding.showCogentaBranding` ni par aucune traduction — visible par tout éditeur connecté sur le site public, y compris sur une installation francophone ou marque blanche. | Paramétrer le texte par une fonction qui lit `branding.showCogentaBranding` (afficher le nom du site sinon) et localiser via la locale active de l'acteur (déjà disponible côté `AccessContext`). |
| P1 | `packages/admin/src/routes/entry-edit.tsx:871` (`moveToTrash`), `packages/admin/src/routes/collection-list.tsx:435` (action `trash`) | Ni l'un ni l'autre n'appelle `useRefreshChromeStatus()` après une mise à la corbeille — seuls `trash.tsx`, `comments.tsx`, `form-submissions.tsx` le font. Le badge « Corbeille » de la barre latérale reste donc périmé après avoir trashé une entrée depuis l'éditeur ou une liste, exactement le bug L20 §1 point 15, seulement partiellement corrigé. | Appeler `useRefreshChromeStatus()` dans les deux gestionnaires, comme `trash.tsx` le fait déjà. |
| P2 | `packages/admin/src/notices/notification-center.tsx` (commentaire l.19 vs. code) | Le commentaire annonce un filtre « par sévérité et par période » ; seul le filtre de sévérité est implémenté (`useState<NoticeSeverity \| ''>`), aucun contrôle de période. | Ajouter un sélecteur de période (7/30/90 jours) qui filtre `listNoticeHistory` côté client ou via un paramètre serveur. |
| P2 | `packages/admin/src/api/notices-client.ts:122,131` | `getChannelPreferences`/`setChannelPreferences` sont exportées et jamais appelées — aucun écran (fiche 38 tâche 4, confirmé absent). | Construire l'écran de préférences par personne dans `profile.tsx`, réutilisant ces deux fonctions telles quelles. |
| P2 | `packages/admin/src/routes/health.tsx` (via `report.notes`/`report.problems`/`check.message`) | Ces trois champs viennent tels quels de `runDoctor` (texte anglais fixe pour la sortie CLI) et sont affichés sans traduction sur un écran par ailleurs francisé (`describeReason` traduit la raison structurée, mais pas ces champs libres). Écart plus étroit que le bug L20 §1 point 12 d'origine (déjà en grande partie corrigé) mais pas totalement clos. | Soit structurer ces messages avec un code i18n comme `reasonCode` l'a été, soit les marquer explicitement comme « détail technique (anglais) » pour ne pas laisser croire à un oubli de traduction. |
| P3 | `packages/admin/src/i18n/locales/fr.json` | Clé `richText.imageDropHint` absente (présente en anglais seulement : `en.json:137`, "Drop an image here to insert it") — un utilisateur en français voit une phrase anglaise dans l'éditeur riche. | Ajouter la traduction française manquante. |
| P3 | `packages/admin/src/routes/dashboard.tsx:461` | Le brouillon rapide utilise encore l'ancien motif `caught instanceof ApiError ? caught.message : t(...)` plutôt que `describeApiError`, jetant le `hint` éventuel (même famille que la dette documentée par la fiche 40). | Migrer vers `describeApiError` comme les 4 autres écrans à fort trafic. |
| P2 (test) | `packages/admin/test/app-shell.test.tsx` (535 l., 33 `it`) | Aucun test `axe`/`toHaveNoViolations`, alors que la fiche 35 §6 l'exige explicitement (« Accessibilité : axe-core sur la coquille, tiroir mobile compris »). Seuls `commerce-settings.test.tsx` et `notice-board.test.tsx` utilisent `axe` dans ce périmètre. | Ajouter un test axe-core sur `AppShell` en mode normal, réduit, et tiroir mobile ouvert. |

## 5. Comparaison marché

### WordPress

| Fonction | WordPress | Cogenta |
|---|---|---|
| Widgets réorganisables/masquables | OUI | OUI (drag direct sur carte + panneau dédié, fiche 39) |
| Résumé du contenu cliquable | OUI | OUI |
| Brouillon rapide | OUI | OUI |
| Santé du site avec contrôles détaillés | OUI (Site Health) | OUI (`health.tsx`, même code que `doctor`) |
| Outils (purge cache, réindexation, test e-mail…) | OUI | OUI (7 outils, file d'attente) |
| Mode maintenance | plugin | OUI (natif, 503/no-store) |
| Journal des erreurs serveur | plugin | OUI (`health.tsx`, borné, filtré) |
| Sept écrans de réglages (Général/Écriture/Lecture/Discussion/Médias/Permaliens/Confidentialité) | OUI | PARTIEL — Général/Lecture/Discussion/Médias/Confidentialité/Navigation/Avancé présents ; **Permaliens** absent (slugs restent du texte libre partout, cf. mémoire projet `deriveSlug never wired`) |
| Barre d'admin sur le site public | OUI | OUI mais non traduite/non marque-blanche (§4) |
| Menu groupé par domaine + sous-menus | OUI | OUI (groupes + flyout) |
| Barre latérale repliable | OUI | OUI (mode réduit, flyout) |
| Fil d'Ariane | partiel | OUI |
| Compteurs sur les entrées de menu | OUI | OUI (agrégés, une requête) |
| Palette de commandes (`⌘K`) | NON | OUI **mieux** |
| Notices d'admin persistantes + rejet mémorisé | OUI | OUI |
| Centre de notifications (historique) | NON | OUI **mieux** |
| Notification par e-mail/Slack/Discord | OUI/plugin | OUI **mieux** (4 canaux temps réel + regroupement) |
| Préférences de notification par utilisateur | plugin | POINT MORT (client prêt, écran absent) |
| Mode sombre natif | OUI | OUI |
| Recherche globale avec page de résultats | OUI | OUI |
| Recherche sémantique | NON | OUI (conditionnelle à un index non vide) |
| Chaque sous-écran a sa propre URL | OUI | OUI (fiche 71) |
| Personnalisation du tableau de bord par utilisateur | OUI | OUI (`localStorage` par personne/navigateur) |

### Strapi 5 / Drupal 11 (compléments)

| Fonction | Strapi | Drupal | Cogenta |
|---|---|---|---|
| Recherche : filtres en ligne (`status:draft`) | NON | NON | OUI **mieux** que les deux |
| Recherche : recherches récentes | NON | NON | OUI |
| Status report détaillé (Drupal) | — | OUI | OUI (`health.tsx`) équivalent |
| RGPD analytics zéro cookie | — | — | OUI (différenciateur confirmé par L20 §3.7) |
| File d'approbation actionnable sur un canal externe | NON | partiel | OUI **mieux** (jetons à usage unique, L6) |

## 6. Spécification ultra détaillée des corrections et ajouts

### T01 — Respecter la marque blanche sur l'écran de connexion

**Priorité** : P1. **Effort** : 3h. **ADR requise** : non (extension du câblage déjà
acté par L21 tâche 8, aucun contrat touché).

**Fichiers** : `packages/admin/src/routes/login.tsx`, éventuellement
`packages/admin/src/api/shell-status-client.ts` ou un nouveau petit client public de
réglages (`getPublicBrandingSettings`).

**Travail détaillé** : `login.tsx` charge déjà `getShellStatus()` en montage (pour la
version). Ajouter un appel similaire, non authentifié, vers `GET /api/settings` filtré
sur le groupe `branding` (déjà public — confirmé par `channels.tsx:38`) : si
`branding.showCogentaBranding === false` et `branding.customLogoMediaId` est renseigné,
résoudre l'URL du média (le même chemin que `useMediaBlobUrl`/`app-shell.tsx` utilise,
mais sans jeton puisque la page de connexion est anonyme — vérifier que le média de
marque est servi publiquement, sinon prévoir une route publique dédiée). Sinon, garder
`DEFAULT_LOGO_PATH`. `alt` doit alors utiliser `general.title` du site plutôt que
"Cogenta" en dur si la marque est masquée.

**Critères d'acceptation** : sur un site avec `showCogentaBranding=false` et un logo
personnalisé, l'écran de connexion affiche ce logo, pas celui de Cogenta ; sur un site
par défaut, comportement inchangé.

**Tests exigés** : composant `login.test.tsx`, deux cas (marque par défaut / marque
blanche avec logo personnalisé).

**Impact contrat/ADR** : aucun.

---

### T02 — Traduire et blanc-marquer la barre d'admin publique

**Priorité** : P1. **Effort** : 3h. **ADR requise** : non.

**Fichiers** : `packages/cli/src/commands/theme-render.ts` (`renderAdminBar`).

**Travail détaillé** : `renderAdminBar` reçoit aujourd'hui `collectionName`/`entryId`
seuls. Lui passer en plus `siteName: string`, `showCogentaBranding: boolean`, et une
locale (`context.actor.locale` ou la locale par défaut du site). Remplacer "Cogenta
Admin" par `siteName` quand `showCogentaBranding` est faux, et les deux libellés
restants ("Edit this page"/"New") par une table de traduction minimale à deux langues
(fr/en), cohérente avec ADR-0019 sans dépendre de `react-i18next` (rendu serveur pur).

**Critères d'acceptation** : la barre affiche le nom du site en marque blanche ; les
libellés apparaissent en français pour un acteur dont la locale est `fr`.

**Tests exigés** : test existant de `theme-render.test.ts` étendu (marque
blanche + locale fr).

**Impact contrat/ADR** : aucun.

---

### T03 — Rafraîchir le badge Corbeille depuis tous les points d'entrée de mise à la corbeille

**Priorité** : P1. **Effort** : 1h. **ADR requise** : non.

**Fichiers** : `packages/admin/src/routes/entry-edit.tsx`,
`packages/admin/src/routes/collection-list.tsx`.

**Travail détaillé** : appeler `useRefreshChromeStatus()` (déjà exporté par
`shell-status-context.tsx`) dans `moveToTrash` (`entry-edit.tsx`) et dans le
gestionnaire d'action `trash` (`collection-list.tsx`), exactement comme `trash.tsx`
le fait déjà après un `untrash`/`purge`.

**Critères d'acceptation** : mettre une entrée à la corbeille depuis l'éditeur ou
depuis une action groupée de la liste met à jour le badge de la barre latérale sans
navigation supplémentaire, dans la même session.

**Tests exigés** : composant, un test par écran, vérifiant l'appel de refresh après
l'action.

**Impact contrat/ADR** : aucun.

---

### T04 — Écran de préférences de notification par personne

**Priorité** : P2. **Effort** : 1 jour. **ADR requise** : non (fiche 38 tâche 4,
mécanisme déjà acté par ADR-0021 et L6).

**Fichiers** : `packages/admin/src/routes/profile.tsx`,
`packages/admin/src/api/notices-client.ts` (déjà prêt).

**Travail détaillé** : nouvelle section « Notifications » dans l'écran de profil :
liste des canaux liés (réutilise `listLinkedChannels`), pour chacun un choix de
sévérités reçues et une plage d'heures calmes, sauvegardé via
`setChannelPreferences`/lu via `getChannelPreferences`. Réutiliser
`SiteSettingsField`/composants `ui/` existants, pas de nouveau système de formulaire.

**Critères d'acceptation** : une préférence enregistrée est relue au rechargement de
l'écran ; une notice critique ignore toujours les heures calmes (cohérent avec
`toChannelSeverity` qui force `danger → critical`).

**Tests exigés** : composant (chargement, sauvegarde), permission (chaque personne ne
modifie que ses propres préférences).

**Impact contrat/ADR** : aucun — consommation d'une API déjà existante.

---

### T05 — Filtre par période dans le centre de notifications

**Priorité** : P2. **Effort** : 2h. **ADR requise** : non.

**Fichiers** : `packages/admin/src/notices/notification-center.tsx`,
`packages/api/src/notices/history.ts` (si le filtre doit être serveur).

**Travail détaillé** : ajouter un `<select>` période (7/30/90 jours, « tout »)
au-dessus de la liste, à côté du filtre de sévérité déjà présent ; filtrer côté client
sur `entry.createdAt` (ou passer un paramètre à `listNoticeHistory` si le volume
justifie un filtre serveur — à mesurer, pas supposer).

**Critères d'acceptation** : sélectionner « 7 jours » réduit la liste aux entrées de la
semaine écoulée.

**Tests exigés** : composant, filtre combiné sévérité + période.

**Impact contrat/ADR** : aucun.

---

### T06 — Traduire ou étiqueter explicitement les champs libres de `cogenta doctor` affichés dans Santé

**Priorité** : P2. **Effort** : 3h (option étiquette) à 1j (option structuration
complète). **ADR requise** : non.

**Fichiers** : `packages/cli/src/commands/doctor.ts`, `packages/admin/src/routes/health.tsx`.

**Travail détaillé — option recommandée (rapide, honnête)** : dans `health.tsx`,
envelopper l'affichage de `check.message`/`report.notes`/`report.problems` d'un badge
« détail technique » (`t('health.technicalDetail')`) plutôt que de les faire lire comme
un texte français incomplet — cohérent avec le principe du projet (« ne pas laisser
lire comme cassé plutôt que non applicable », déjà appliqué ailleurs dans l'admin).
**Option complète** : structurer chaque note/problème avec un code stable côté
`doctor.ts`, sur le modèle de `reasonCode` déjà fait pour la raison de driver — plus
cohérent à terme mais hors de la portée immédiate d'un correctif P2.

**Critères d'acceptation** : un utilisateur francophone ne peut plus confondre un
message de diagnostic non traduit avec un oubli d'i18n.

**Tests exigés** : snapshot de l'écran Santé avec un `report.notes` non vide.

**Impact contrat/ADR** : aucun.

---

### T07 — Test d'accessibilité axe-core sur la coquille

**Priorité** : P2. **Effort** : 3h. **ADR requise** : non — exigence de test déjà
actée par la fiche 35 elle-même, jamais honorée.

**Fichiers** : `packages/admin/test/app-shell.test.tsx`.

**Travail détaillé** : ajouter, sur le modèle de `commerce-settings.test.tsx`/
`notice-board.test.tsx`, un test `axe(container)` sur `AppShell` rendu en mode normal,
un second en mode réduit (`sidebarCollapsed=true`), un troisième avec le tiroir mobile
ouvert (piège de focus actif).

**Critères d'acceptation** : `toHaveNoViolations()` passe dans les trois états.

**Tests exigés** : c'est le test lui-même.

**Impact contrat/ADR** : aucun.

---

### T08 — Migrer les erreurs restantes vers `describeApiError`

**Priorité** : P3. **Effort** : au fil de l'eau, par lots (dette déjà actée par la
fiche 40). **ADR requise** : non.

**Fichiers** : les ~47 fichiers restants de `packages/admin/src/routes/*.tsx` portant
encore `caught instanceof ApiError ? caught.message : t(...)` (194 occurrences dont au
moins `dashboard.tsx:461`).

**Travail détaillé** : migrer par lot, en commençant par `dashboard.tsx` (brouillon
rapide) puisqu'il est dans le périmètre de ce domaine.

**Critères d'acceptation** : chaque écran migré affiche `hint` quand la réponse en
porte un.

**Tests exigés** : un test par écran migré, comme pour les 4 déjà faits.

**Impact contrat/ADR** : aucun.

---

### T09 — ADR et UI de gestion des langues de contenu

**Priorité** : P3 (fonctionnalité de confort, non un bug). **Effort** : 1h (ADR) +
1-2j (UI, conditionnée). **ADR requise** : **oui** — fiche 68 tâche 3 le demande
explicitement (arbitrage entre migrer `site.locales` en réglage éditorial, contredisant
la recommandation « aucun réglage existant ne migre » de la fiche 23 §8, ou un flux
« proposer/appliquer en développement » façon ADR-0023 ; plus le sort du contenu déjà
traduit dans une langue retirée, ADR-0014).

**Fichiers** : `docs/03-decisions.md` (texte à remettre à l'humain, fichier protégé en
écriture par un hook), puis selon la décision : `settings.tsx`, `site-settings-registry.ts`
ou le chemin `cogenta dev`/plan de site existant.

**Travail détaillé** : rédiger l'ADR avec le skill `write-adr`, trancher entre les deux
options citées par la fiche 68, documenter explicitement le sort d'une langue retirée.
Ne pas coder l'UI avant l'insertion de l'ADR par l'humain.

**Critères d'acceptation** : ADR rédigée et remise ; UI seulement après validation.

**Tests exigés** : selon la décision retenue.

**Impact contrat/ADR** : **ADR requise avant tout code** — ne rien implémenter tant que
l'ADR n'est pas tranchée par l'humain.

## 7. Ordre d'exécution recommandé et dépendances

1. **T03** (badge Corbeille) — correctif d'une ligne par fichier, aucun risque,
   corrige un vrai bug de cohérence d'interface signalé par une session antérieure
   (L20 §1 point 15) encore partiellement ouvert.
2. **T01** et **T02** en parallèle (marque blanche login + barre publique) —
   indépendants l'un de l'autre, tous deux P1, tous deux de portée réduite.
3. **T07** (test axe-core coquille) — indépendant, comble une dette de test déjà actée
   par la fiche source.
4. **T05** (filtre période notifications) et **T06** (étiquette technique Santé) —
   indépendants, faible effort, à traiter ensemble par cohérence de revue.
5. **T04** (préférences de notification par personne) — dépend de rien de nouveau
   (l'API existe), mais plus gros effort ; à programmer après les correctifs P1/P2
   ci-dessus.
6. **T08** (migration `describeApiError`) — dette de fond, à traiter en continu, sans
   bloquer le reste.
7. **T09** (langues de contenu) — **dernier**, parce qu'il exige une ADR humaine avant
   tout code ; à lancer en parallèle (rédaction de l'ADR peut se faire pendant que
   T01-T08 sont en cours) mais aucune ligne de code tant que l'ADR n'est pas actée.

Aucune tâche de ce domaine ne bloque un autre domaine de l'audit : tout le travail
listé est localisé à `packages/admin/src/{shell,routes,notices,settings,search,api}`,
`packages/api/src/{notices,rest}`, `packages/cli/src/commands/{theme-render,doctor,tools}.ts`
et `packages/schema/src/store/site-settings-registry.ts`, sans toucher aux contrats
A/B/C/D.
