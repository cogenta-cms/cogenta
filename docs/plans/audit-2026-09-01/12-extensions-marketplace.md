# Audit Extensions, plugins, marketplace — 2026-09-01

## 1. Résumé exécutif

Le socle d'isolation (L7) est réel et solide : sandbox `worker_threads`+`vm` prouvée
contre les vecteurs d'évasion attendus, signature Ed25519 sans échappatoire, SDK
« absent, pas refusé », limites de temps/mémoire avec désactivation automatique. La
gestion du parc installé demandée par la fiche 29 (onglet « Installées », mises à jour
groupées avec refus des élargissements silencieux, désinstallation avec choix des
données, compatibilité affichée avant install) a été **construite après la fiche** et
est réellement câblée (`packages/admin/src/routes/marketplace.tsx`, 933 lignes).

Mais le cœur fonctionnel du système de plugins est **du théâtre** : (1) l'installation
d'un plugin depuis le marketplace **n'accorde jamais aucune capacité**
(`PluginGrantStore.grant()` n'est appelé nulle part en dehors des tests — vérifié par
grep exhaustif) — l'écran de revue de permissions coche des cases qui ne produisent
aucun effet ; (2) `runPlugin`, le seul point d'entrée qui exécute réellement du code de
plugin, **n'est appelé par aucun code de production** — `cogenta serve` ne l'invoque
jamais (aucun `AgentRegistry` vivant, gap déjà documenté pour L5/L7/L8/L9 dans
`CLAUDE.md`) ; (3) ce qu'un plugin peut « apporter » selon L7 (outils, blocs, champs,
canaux, drivers, abonnements à événements) n'est que de la donnée de manifeste validée
— **aucun registre runtime ne lit jamais `manifest.provides`** ; (4) trois des quatre
registres de L7 (plugins, thèmes, skills — tâches 11/12/13) sont des exports morts,
jamais importés hors de `dist/` et des tests ; seul le registre de skins est câblé
(dans l'écran Apparence, hors périmètre de ce domaine) ; (5) aucune commande CLI
`cogenta plugin install/remove/list` n'existe ; (6) aucun point d'extension admin
n'existe (un plugin ne peut ajouter ni écran, ni menu) ; (7) le catalogue « Découvrir »
est structurellement fonctionnel mais **vide par construction** — c'est un catalogue
local assemblé par le déployeur (`cogenta.config`), pas un registre distant, et aucun
exemple du dépôt n'en configure un.

**Décompte** (fiches 29 + L7 + L10§L17 combinées, ~35 critères vérifiés) :
**FAIT : 15 · PARTIEL : 6 · ABSENT : 4 · POINT MORT : 10**. Le point mort le plus grave
(grant jamais appelé) transforme la fonctionnalité la plus vantée du projet
(« écran de permissions unique sur le marché ») en une façade sans effet.

## 2. Ce qui existe réellement

**`@cogenta/plugins`** (`packages/plugins/src/`, ~2 943 lignes) :
- `manifest.ts` — `definePlugin`, validation stricte (capacités inconnues refusées,
  `http.fetch` sans domaine refusé, bloc sans `fallback` refusé).
- `loader.ts` — `loadPlugin`/`loadMarketplacePlugin`, résolution + vérification de
  signature obligatoire pour un chemin « registre ».
- `host/worker-runner.ts` — `runIsolated`/`runIsolatedOrThrow`/`runPlugin`, worker
  `worker_threads` + `vm`, mesure réelle de durée.
- `guest/sandbox-entry.mjs` — code exécuté côté worker, sans `fs`/`net`/`process`.
- `permissions/{grants,disabled,resolve,review,usage,describe,tables}.ts` —
  `PluginGrantStore`, `PluginDisableStore`, `PluginUsageStore`,
  `resolveGrantedCapabilities`, `describeCapability`.
- `signing/{keys,sign,verify}.ts` — Ed25519 réel via `node:crypto`.
- `registries/{plugins,themes,skills,skins,marketplace}.ts` — cinq registres distincts
  (voir §4 pour lesquels sont réellement câblés).
- `semver.ts` — comparateur semver réutilisé par `@cogenta/fleet` et
  `contract-risk.ts`/`version-compare.ts` de `@cogenta/cli`.

**`@cogenta/api`** : `rest/marketplace-router.ts` (525 lignes) — `/api/marketplace/*`,
admin uniquement (`requireAdmin`), 11 routes (catalogue, détail, install, update,
uninstall, activate, deactivate, installed, updates, updates/apply). `notices/
plugin-disabled.ts` — notice « extension désactivée automatiquement ».

**`@cogenta/admin`** :
- `routes/marketplace.tsx` (933 lignes) — onglets « Installées »/« Découvrir »,
  détail modal, revue de permissions, mise à jour groupée, désinstallation avec choix
  de conservation des données.
- `plugins/permission-review.tsx` (129 lignes) — écran de permissions en langage
  clair, réutilisé à l'installation et à la mise à jour élargissante.
- `plugins/granted-permissions.tsx` (85 lignes) — composant de révocation par
  capacité, **jamais monté dans aucune route** (confirmé par le propre commentaire
  du code, `routes/documentation-flows.tsx:29`).
- `shell/nav-items.ts:397-401` — entrée de navigation `/marketplace` avec badge
  `marketplaceUpdates`, réellement alimenté par `GET /api/shell-status`
  (`rest/shell-status-router.ts:256`, `pendingMarketplaceUpdates`).
- `api/marketplace-client.ts` — client REST complet côté admin.

**Câblage `cogenta serve`** (`packages/cli/src/commands/serve.ts:1707-1735,
2147-2152`) : monte toujours le routeur marketplace ; catalogue vide par défaut
(`options.marketplace?.catalog ?? []`) ; commentaire explicite : « a local/embedded
catalog, not a distant service — L13's API keys … were never built » et « Nothing in
`cogenta serve` actually calls `runPlugin` yet ».

**CLI** : aucune commande `plugin`. `USAGE` de `packages/cli/src/index.ts` liste
`doctor`/`migrate`/`users`/`import`/`export`/`backup`/`restore`/`generate`/`links`/
`skin`/`roles`/`serve`/`mcp`/`channels`/`update` — pas de `plugin install/remove/list`.

**Documentation et starter** : `docs/guide-plugin.md` (232 lignes, honnête sur le
manque de canal d'arguments et le fait que « no live registry exists »),
`examples/plugin-starter/` (manifeste + code réel, 4 tests, prouve que
`definePlugin`/`runIsolated` marchent réellement).

## 3. Vérification des fiches, critère par critère

### Fiche 29 — Extensions et marketplace

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| T1 Écran « Extensions installées » (nom/version/auteur/état/capacités/maj/actions) | **FAIT** | `marketplace.tsx:486-613`, colonnes nom/version/statut/permissions/usage/actions | Auteur n'est PAS dans le tableau « Installées » (seulement dans la fiche détaillée) |
| — état désactivée auto avec raison | **FAIT** | `marketplace.tsx:47-59` `statusLabel`, clé i18n `marketplace.installed.autoDisabledReason.${reason}` | — |
| — capacités accordées réutilisant `granted-permissions.tsx` | **PARTIEL/POINT MORT** | tableau affiche `grantedCapabilities.length` (`marketplace.tsx:531-537`) mais `granted-permissions.tsx` n'est **jamais monté** ; de toute façon `grantedCapabilities` est **toujours 0** en pratique (voir §4) | Double lacune : composant non monté, et donnée qu'il afficherait est structurellement vide |
| T2 Signal « N mises à jour » dans nav + notice | **PARTIEL** | Nav : FAIT (`nav-items.ts:401`, `shell-status-router.ts:256-268`, badge réel) ; notice board : **ABSENT**, aucun fichier dans `packages/api/src/notices/` ne référence les mises à jour marketplace (16 fichiers listés, aucun) | Manque la notice dédiée |
| — mise à jour groupée sauf élargissantes | **FAIT** | `marketplace-router.ts:398-427` `updates/apply` : `skipped` si `requiresApproval` | — |
| — notes de version avant maj | **FAIT** | `detail.changelog` affiché dans la modale (`marketplace.tsx:764-777`) | — |
| — réutilise le comparateur semver existant | **FAIT** | `semver.ts` (paquet), réutilisé par `@cogenta/fleet` (confirmé dans CLAUDE.md) | — |
| T3 Consommation de ressources par extension | **FAIT** | `marketplace.tsx:538-549` colonne usage (`callCount`, `lastRunAt`) ; `PluginUsageStore` (`permissions/usage.ts`) agrège durée/erreurs/timeouts/crashes | Le détail complet (mémoire max observée, dépassements) n'apparaît que dans `PluginUsageRecord` côté serveur — l'écran n'affiche que compte + dernière exécution, pas la mémoire max ni le compte d'erreurs par type |
| T4 Désinstallation propre (dit ce qui reste, conserver/tout supprimer) | **FAIT** | `marketplace.tsx:877-915` modale avec case à cocher `removeData`, avertissement si coché ; `marketplace.ts:502-512` `uninstall()` révoque grants/désactive/efface usage si `removeData: true` | — |
| T5 Compatibilité (version Cogenta requise) avant install | **FAIT** | `MarketplacePreview.engineCompatible`, refus `MARKETPLACE_ENGINE_INCOMPATIBLE` avant toute persistance (`marketplace.ts:390-392`) | Uniquement actif si l'installeur est construit avec un `engineVersion` réel — **aucun appelant du dépôt (`serve.ts`) ne le configure** (`marketplaceInstaller` créé sans `engineVersion`), donc `engineCompatible` est toujours `null` en pratique → **POINT MORT partiel** |
| — auteur/source/signature/date maj | **FAIT** | `marketplace.tsx:726-743` (auteur, source, compat), signature (`detail.signatureVerified`), changelog avec `releasedAt` | — |
| — lien guide + starter | **FAIT** | `marketplace.tsx:402-418`, liens GitHub en dur vers `docs/guide-plugin.md` et `examples/plugin-starter/` | Liens externes GitHub, pas de route interne `/admin/documentation` bien que celle-ci existe (L9/L22) — incohérent avec le choix ailleurs dans l'admin de préférer la doc intégrée |

### `docs/lots/L7-extensibilite.md` — 14 tâches

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 1. Schéma manifeste + validation | **FAIT** | `manifest.ts`, `test/manifest.test.ts` | — |
| 2. Résolution/chargement | **FAIT** | `loader.ts`, `test/loader.test.ts` | — |
| 3. Worker isolé, protocole messages | **FAIT** | `host/worker-runner.ts`, `host/protocol.ts`, `guest/sandbox-entry.mjs`, 4 vecteurs testés (`test/host/worker-runner.test.ts:31-52`) + env (`:119-140`) | — |
| 4. SDK dynamique selon capacités | **FAIT** | `host/capabilities.ts`, `test/host/sdk.test.ts` | — |
| 5. Traduction capacités→SDK, non-auto-octroi | **FAIT (mécanisme)** / **POINT MORT (chemin marketplace)** | `permissions/resolve.ts` `resolveGrantedCapabilities` correct et testé | Le mécanisme est correct, mais rien dans le chemin marketplace ne l'alimente jamais avec un vrai grant (voir §4) |
| 6. Limites temps/mémoire, désactivation | **FAIT** | `host/worker-runner.ts` timeout réel, `permissions/disabled.ts` `PluginDisableStore`, notice `plugin-disabled.ts` | — |
| 7. Écran de permissions langage clair | **FAIT (composant)** | `plugins/permission-review.tsx`, aucun identifiant technique brut visible, risque élevé avec confirmation supplémentaire (`highRiskConfirmed`) | Le résultat de la revue (quelles capacités précises l'utilisateur a cochées) **n'est jamais transmis** à l'installation réelle — `marketplace.tsx:823` `onApprove={() => void confirmInstall()}` ignore l'argument `capabilities` que le composant produit |
| 8. Révision/révocation post-install | **POINT MORT** | `plugins/granted-permissions.tsx` existe, testé (5 tests), **jamais monté dans une route** — confirmé par le commentaire du code lui-même (`documentation-flows.tsx:26-31`) : « a data model and presentational components … but no wired route yet » | Écran entier à construire |
| 9. Signature et vérification | **FAIT** | `signing/{sign,verify}.ts`, Ed25519 via `node:crypto`, refus dur sans échappatoire (`loader.ts`), testé (`test/signing/`) | — |
| 10. Galerie de skins, validation auto | **FAIT** | `registries/skins.ts` `createSkinGallery`, câblé dans `theme-wiring.ts` (Appearance, hors périmètre de ce domaine) | — |
| 11. Registre de skills | **POINT MORT** | `registries/skills.ts` `createSkillRegistry`, exporté (`index.ts`), **jamais importé** hors `dist/` et `test/registries/skills.test.ts` | Aucun routeur API, aucune commande CLI, aucun écran admin |
| 12. Registre de thèmes | **POINT MORT** | `registries/themes.ts` `createThemeRegistry`, même constat — jamais importé hors `dist/`/tests | idem |
| 13. Registre de plugins | **POINT MORT** | `registries/plugins.ts` `createPluginRegistry` (soumission + revue humaine), jamais importé hors `dist/`/tests — le marketplace utilise un chemin totalement différent (`createMarketplaceCatalog`/`createMarketplaceInstaller`, sans revue humaine, sans `PluginSubmissionEntry`) | Deux systèmes parallèles non réconciliés : le vrai registre à revue humaine que L7 a construit n'est câblé nulle part ; ce qui tourne est un catalogue local sans processus de soumission |
| 14. Documentation auteur + starter | **FAIT** | `docs/guide-plugin.md`, `examples/plugin-starter/` (4 tests réels, `test/manifest.test.ts` + `test/runtime.test.ts`) | Le guide ne dit jamais explicitement « aucun appelant réel n'invoque `runPlugin` en production aujourd'hui » — implicite via « no argument-passing channel yet » mais pas dit frontalement |

**Critères d'acceptation globaux L7** :
- 4 vecteurs d'évasion testés indépendamment : **FAIT** (`fs`, réseau non déclaré,
  `process`, secrets — `test/host/worker-runner.test.ts:31-68`).
- Méthode non accordée absente du SDK (pas refusée) : **FAIT**, `host/capabilities.ts`
  construit dynamiquement l'objet.
- Boucle infinie tuée sans affecter le CMS : **FAIT** (`:70-75`).
- `http.fetch` sans domaine refusé au chargement : **FAIT** (`manifest.ts`).
- Signature invalide bloque l'installation : **FAIT**, mais seulement pour le chemin
  `install()`/`update()` du marketplace — `activate()`/`deactivate()` ne re-vérifient
  jamais rien (acceptable, ce ne sont pas des chemins d'exécution de code).
- Écran de permissions sans identifiant technique : **FAIT**.
- Surcoût de latence isolation mesuré et documenté : **FAIT**,
  `test/host/worker-runner.test.ts:87` « performance: measures isolated-call overhead ».
- Skin validé/refusé auto sans revue humaine : **FAIT**, `registries/skins.ts`.

### `docs/lots/L10-cms-complet.md` § L17 — Marketplace

| Critère | Verdict | Preuve | Écart |
|---|---|---|---|
| Registre consultable (recherche/catégories), lecture seule d'abord | **PARTIEL** | Filtre `kind`+`query` fonctionnel (`marketplace-router.ts:434-448`) | Catalogue vide par défaut ; « catégories » = un champ texte libre sans taxonomie de catégories réelle, aucune facette |
| Installation un clic depuis l'admin | **FAIT (mécanisme)** / **POINT MORT (effet)** | `confirmInstall()` appelle `POST /items/{id}/install` | L'installation réussit et signe, mais n'accorde aucune capacité (voir §4) ; le plugin installé ne s'exécute jamais nulle part |
| Fiche détaillée (capacités langage clair, captures, changelog) | **FAIT** | `marketplace.tsx:722-873` | — |
| Volet commercial optionnel avec paiement | **ABSENT** (assumé, hors périmètre confirmé) | Aucune trace de prix/paiement dans `MarketplaceCatalogEntry`/`InstallRecord` | Décision du lot elle-même : « si ce choix est confirmé » — jamais confirmé, non codé, cohérent |
| Maj groupée avec diff permissions, jamais auto-accordé silencieusement | **FAIT** | `updates/apply` saute les élargissantes (`marketplace-router.ts:410-419`) | — |
| Installer une extension vérifie sa signature avant toute exécution | **FAIT (vérification)** / **N/A (exécution)** | Signature vérifiée à `install()` | Non testable en pratique : rien n'exécute jamais le plugin installé (`runPlugin` jamais appelé) — le critère est vrai par vacuité |
| Maj élargissante s'arrête et demande confirmation explicite | **FAIT** | `MARKETPLACE_UPDATE_REQUIRES_APPROVAL` (409), confirmé par `confirmPendingPermissions: true` | — |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P0** | `packages/plugins/src/registries/marketplace.ts:374-424` (`install`), `:426-490` (`update`) | **`PluginGrantStore.grant()` n'est appelé nulle part en dehors des tests** (`test/registries/marketplace.test.ts:311,496` l'appellent manuellement pour préparer une fixture). L'installation d'un plugin persiste `signature_verified`/`plugin_version` mais **aucune capacité**. La colonne « Permissions » du tableau « Installées » affichera donc toujours 0/« Aucune permission » pour tout plugin installé via le marketplace, quel que soit ce que l'utilisateur a coché dans `PluginPermissionReview`. | Faire appeler `grantStore.grant(pluginName, capability)` pour chaque capacité approuvée à la fin de `install()`, et pour chaque capacité nouvellement approuvée dans `update()` quand `confirmPendingPermissions: true`. Le routeur doit transmettre la liste réellement cochée (voir bug suivant) au lieu de tout approuver. |
| **P0** | `packages/admin/src/routes/marketplace.tsx:819-824` | `PluginPermissionReview`'s `onApprove` reçoit `(capabilities: readonly string[])` mais l'appelant l'ignore : `onApprove={() => void confirmInstall()}`. Le commentaire du code (`:279-286`) documente que c'est voulu (« there is no partial-capability install »), mais combiné au bug précédent cela veut dire que **la revue par case à cocher n'a strictement aucun effet, dans aucun sens** — ni pour restreindre l'installation, ni pour enregistrer ce qui a été accordé. | Une fois `grant()` câblé, transmettre les capacités réellement cochées à `installMarketplaceItem`, et les persister comme grants — pas « tout ou rien ». |
| **P0** | `packages/cli/src/commands/serve.ts:1719-1724` | `runPlugin` (le seul point d'entrée qui exécute réellement du code de plugin, `host/worker-runner.ts:266`) n'est appelé par **aucun code de production** — vérifié par grep exhaustif sur `packages/api/src` et `packages/cli/src`. Un plugin « installé » via le marketplace n'est jamais exécuté : aucun outil, bloc, champ, canal ou abonnement qu'il déclare ne devient réellement disponible. | Documenté honnêtement dans le code (« no live `AgentRegistry` exists »), cohérent avec le R2-honest gap déjà noté dans `CLAUDE.md` pour L5/L7/L8/L9. Reste un vrai manque produit : sans exécution, « installer un plugin » ne fait rien d'observable pour l'utilisateur final. |
| **P1** | `packages/plugins/src/manifest.ts:48-56` | `PluginProvides` (`tools`/`blocks`/`fields`/`channels`/`drivers`/`skills`/`eventSubscriptions`) est validé à la forme (ex. bloc sans `fallback` refusé) mais **jamais lu par aucun registre runtime** — grep confirme zéro usage de `.provides` en dehors de `manifest.ts` lui-même. Le paragraphe central de L7 (« Ce qu'un plugin peut apporter ») est entièrement non réalisé au-delà de la validation déclarative. | Nécessite un vrai point d'intégration par capacité apportée (registre d'outils agent, registre de blocs avec repli, registre de types de champ, registre de canaux) — chacun un chantier séparé, pas une correction ponctuelle. |
| **P1** | `packages/plugins/src/registries/{plugins,themes,skills}.ts` | Trois des quatre registres de L7 (tâches 11, 12, 13) sont des exports morts — jamais importés hors de `dist/*.d.ts` (sortie de compilation) et de leurs propres tests. Seul `createSkinGallery` (tâche 10) est câblé, dans l'écran Apparence (hors périmètre de ce domaine). Le marketplace n'utilise **aucun** des trois : il a son propre catalogue local sans processus de soumission/revue humaine (`createMarketplaceCatalog`/`createMarketplaceInstaller`), ce qui contredit le tableau de L7 (« Plugins : signature, manifeste, **revue** » / « Skills : **revue de contenu** » / « Thèmes : signature, contrat vérifié »). | Soit câbler `createPluginRegistry`/`createSkillRegistry`/`createThemeRegistry` derrière de vraies routes admin, soit documenter formellement (ADR ou note dans le lot) que le marketplace remplace ces trois registres par un modèle plus simple sans revue humaine — actuellement ni fait ni assumé par écrit. |
| **P1** | `packages/admin/src/plugins/granted-permissions.tsx` | Composant testé (5 tests) jamais monté dans une route réelle — L7 tâche 8 (« révisables après installation, et révocables ») n'a donc **aucun levier fin** dans l'admin ; seul un levier grossier (désactiver/désinstaller) existe. Auto-documenté honnêtement dans `documentation-flows.tsx:26-31`. | Monter `PluginGrantedPermissions` dans la modale de détail d'un item installé, brancher `onRevoke` sur un nouvel endpoint `POST /api/marketplace/items/{id}/revoke` (absent aujourd'hui — aucune route ne permet de révoquer une seule capacité). |
| **P1** | CLI | Aucune commande `cogenta plugin install/remove/list` — vérifié sur `packages/cli/src/index.ts` (USAGE complet listé, aucune mention de `plugin`). Incohérent avec un produit qui se positionne CLI-first (`doctor`, `migrate`, `users`, `skin`… existent tous en CLI). | Ajouter `packages/cli/src/commands/plugin.ts` réutilisant `createMarketplaceInstaller`/`createMarketplaceCatalog` directement (pas de HTTP), pour un usage scripté/CI. |
| **P1** | `packages/plugins/src/registries/marketplace.ts:296-335`, `packages/cli/src/commands/serve.ts:1726-1734` | `engineVersion` n'est jamais passé à `createMarketplaceInstaller` par `cogenta serve` → `engineCompatible` est **toujours `null`**, donc le refus « version Cogenta requise » de fiche 29 tâche 5 ne se déclenche jamais dans le produit réel, uniquement dans les tests qui configurent `engineVersion` explicitement. | Passer la vraie version de `@cogenta/cli` (déjà lue par `getCliVersion()`, utilisée ailleurs pour `cogenta update`) à `createMarketplaceInstaller`. |
| **P2** | Notices | Aucune notice « N mises à jour marketplace disponibles » dans `packages/api/src/notices/` (16 fichiers, aucun ne référence marketplace) alors que la fiche 29 tâche 2 le demande explicitement (« dans la navigation **et en notice** »). Le badge de nav est réel et fonctionnel, la notice manque. | Nouveau `notices/marketplace-updates.ts` sur le même modèle que `plugin-disabled.ts`. |
| **P2** | `packages/plugins/src/registries/marketplace.ts:139-144` | `install()`/`update()` ne supportent que `kind: 'plugin'` — thème/skin/skill lèvent `MARKETPLACE_KIND_UNSUPPORTED`. Honnêtement documenté dans le code, mais contredit le tableau de comparaison marché qui présente un marketplace « plugins/thèmes/skins ». | Décision à confirmer par écrit : soit brancher les trois autres registres, soit retirer `theme`/`skin`/`skill` du filtre `kindFilter` de l'écran (`marketplace.tsx:646-647`) tant qu'ils ne sont pas installables — aujourd'hui l'admin peut sélectionner ces filtres pour un résultat qui, une fois trouvé, échouera toujours à l'installation. |
| **P3** | `marketplace.tsx:402-418` | Liens « guide » et « starter » pointent en dur vers `github.com/cogenta-cms/cogenta/...` plutôt que vers la documentation intégrée (`/admin/documentation`, construite en L22). Cassera si l'URL du dépôt change, et sort l'utilisateur de l'admin sans besoin. | Router vers la page de documentation intégrée équivalente si elle existe, sinon garder mais vérifier l'URL réelle du remote. |
| **P3** | `marketplace.tsx:538-549`, `permissions/usage.ts` | Le tableau « Installées » n'affiche que `callCount`/`lastRunAt` ; `PluginUsageRecord` a aussi `totalDurationMs`, `errorCount`, `timeoutCount`, `memoryCount`, `crashCount`, `lastOutcome`, `lastError` — mesurés mais pas montrés (fiche 29 tâche 3 demande explicitement mémoire max et dépassements). | Étendre la cellule usage ou l'exposer dans la fiche détaillée. |

Aucun `any`/`@ts-ignore`/`console.log`/`throw new Error` nu trouvé dans les fichiers
inspectés de ce domaine. Aucun contrôle de permission trouvé *à l'intérieur* d'un
outil de plugin — R4 respecté structurellement (la vérification est côté hôte,
`host/capabilities.ts`). Pas de HTML/CSS stocké dans un bloc de plugin (R3) —
non applicable, aucun bloc de plugin n'atteint jamais le rendu (voir P1 ci-dessus).
i18n : parité complète fr/en sur les 96 clés `marketplace.*` (vérifié
programmatiquement). Pagination : la liste « Découvrir » et « Installées » ne sont pas
paginées — acceptable tant que le catalogue reste petit (assemblé manuellement par le
déployeur), à revoir si un vrai registre distant apparaît un jour.

## 5. Comparaison marché

### WordPress — Extensions installées

| Fonction | Cogenta | Détail |
|---|---|---|
| Liste installées avec état actif/inactif | OUI | `marketplace.tsx` onglet « Installées » |
| Activer/désactiver | OUI | Bouton par ligne, `activate`/`deactivate` |
| Supprimer | OUI | Avec choix conserver/tout supprimer (plus strict que WP) |
| Mises à jour disponibles (liste + compte) | OUI | Badge nav + bandeau + colonne par ligne |
| Mise à jour automatique | NON (délibéré) | Fiche 29 §8 : écarté par choix, cohérent avec exécution de code isolée mais réelle |
| Mise à jour groupée | PARTIEL | Groupée seulement pour les non-élargissantes ; règle plus stricte que WP, volontaire |
| Détails d'une extension (auteur, version, description) | OUI | Modale détail |
| Rollback après mise à jour ratée | NON | Aucun mécanisme de retour à la version précédente pour un plugin (contrairement à `@cogenta/fleet` qui a un rollback de site) |
| Extension réellement active/exécutée après activation | **NON** | `runPlugin` jamais appelé — « actif » ne change rien d'observable |

### WordPress — Ajouter des extensions

| Fonction | Cogenta | Détail |
|---|---|---|
| Recherche dans un répertoire officiel | PARTIEL | Mécanisme réel (`q`/`kind`), mais catalogue local vide par défaut — pas de répertoire distant |
| Téléverser un zip | NON | Aucune UI d'upload ; `reference` n'est configurable que côté déployeur (`cogenta.config`) |
| Captures d'écran | OUI | `detail.screenshots` |
| Notes de version / changelog | OUI | `detail.changelog` avec date |
| Compatibilité annoncée avant install | OUI (mais jamais actif) | `engineCompatible` toujours `null` en pratique (bug P1 ci-dessus) |
| Hooks actions/filtres | NON | Aucun système de hooks — architecture par capacités déclarées, pas d'API d'événements pour tiers |
| Shortcodes | N/A | Cogenta n'a pas de shortcodes (contrat B = blocs structurés) |
| Widgets | N/A | Pas de concept équivalent ; les « blocs apportés par un plugin » existent en théorie (manifeste) mais point mort (jamais rendus) |
| Pages d'admin ajoutées par une extension | NON | Aucun point d'extension admin déclaré ni codé |

### Strapi Marketplace

| Fonction | Cogenta | Détail |
|---|---|---|
| Catalogue plugins + providers | PARTIEL | Un seul « kind » réellement installable (`plugin`) ; providers n'existe pas comme catégorie |
| Configuration par plugin dans l'admin | NON | Aucun écran de config générée pour un plugin installé |
| Injection dans des zones d'admin déclarées | NON | Confirmé — aucune zone d'extension admin dans le code |

### Drupal Project Browser

| Fonction | Cogenta | Détail |
|---|---|---|
| Parcourir/installer sans quitter l'admin | OUI (mécanisme) | Onglet Découvrir intégré |
| Contenu réel à parcourir | NON | Catalogue vide sans configuration manuelle du déployeur |

### Joomla Extensions Manager

| Fonction | Cogenta | Détail |
|---|---|---|
| Installer depuis un zip local | NON | Pas d'upload |
| Installer depuis un dossier/chemin | PARTIEL | Possible uniquement via `cogenta.config`'s `marketplace.catalog`, pas depuis l'admin en direct |
| Installer depuis une URL | NON | `reference` n'accepte pas d'URL distante interprétée en direct par l'admin |
| « Sites de mise à jour » (liste de sources) configurables | NON | Une seule source : le catalogue assemblé au démarrage du process |

### Shopify App Store

| Fonction | Cogenta | Détail |
|---|---|---|
| Écran de permissions avant install, langage clair | OUI, plus strict | Cogenta va plus loin structurellement (isolation réelle) — mais l'approbation n'a aucun effet persistant (bug P0) |
| Facturation/paiement d'une app payante | NON (hors périmètre assumé) | L17 le nomme comme dépendant de L15, jamais construit, cohérent avec l'état du lot |

## 6. Spécification ultra détaillée des corrections et ajouts

## T01 — Faire que l'installation accorde réellement les capacités approuvées

**Priorité** : P0. **Effort** : 0.5 j.
**Fichiers** : `packages/plugins/src/registries/marketplace.ts` (`install`, `update`),
`packages/api/src/rest/marketplace-router.ts` (routes `install`/`update`),
`packages/admin/src/routes/marketplace.tsx` (`confirmInstall`, `confirmWidenedUpdate`).

**Travail détaillé** :
- `MarketplaceInstaller.install(entry, actorId, capabilities?: readonly string[])` —
  paramètre optionnel ; par défaut (absent) accorde tout ce que le manifeste déclare
  (comportement de repli sûr pour un appelant CLI qui ne passe pas par une revue UI),
  mais si fourni, n'accorde que les capacités listées **et refuse** si une capacité
  listée n'est pas dans le manifeste résolu (`CogentaError` `MARKETPLACE_ITEM_NOT_FOUND`
  réutilisé ou nouveau code `MARKETPLACE_CAPABILITY_UNKNOWN`).
- Après l'`insert` réussi, boucler sur les capacités retenues et appeler
  `grantStore.grant(resolved.manifest.name, capability)` pour chacune, dans la même
  section logique (pas besoin de transaction SQL supplémentaire : `PluginGrantStore` a
  déjà sa propre idempotence délete-puis-insert).
- Même traitement dans `update()` pour les capacités de `pendingApproval` une fois
  `confirmPendingPermissions: true`.
- Router : `POST /items/{id}/install` et `.../update` lisent
  `body.capabilities?: string[]` et les transmettent.
- Admin : `confirmInstall`/`confirmWidenedUpdate` passent
  `reviewedCapabilities`/`pending.map(c => c.capability)` reçus par `onApprove`.

**Critères d'acceptation** : installer un plugin avec 3 capacités, en approuver 2 via
la revue → `GET /api/marketplace/installed` montre `grantedCapabilities.length === 2`
et `PluginGrantStore.listGrants` confirme les 2 capacités exactes, pas 3.

**Tests exigés** : unitaire (`registries/marketplace.test.ts`) — install partiel,
update avec approbation partielle ; e2e admin (`marketplace.test.tsx`) — décocher une
capacité dans la revue change ce qui est réellement envoyé au serveur (mock HTTP).

**Impact contrat/ADR** : aucun — additif à une interface interne, pas un contrat A/B/C/D.
ADR requise : non.

## T02 — Monter l'écran de révocation par capacité

**Priorité** : P1. **Effort** : 1 j.
**Fichiers** : `packages/admin/src/routes/marketplace.tsx`,
`packages/admin/src/plugins/granted-permissions.tsx` (déjà prêt),
`packages/api/src/rest/marketplace-router.ts` (nouvelle route),
`packages/plugins/src/registries/marketplace.ts` (nouvelle méthode installer).

**Travail détaillé** :
- Nouvelle route `POST /api/marketplace/items/{id}/revoke` avec corps
  `{ capability: string }`, admin uniquement, appelle
  `grantStore.revoke(pluginName, capability)` (déjà existant côté `PluginGrantStore` —
  vérifier sa présence, sinon l'ajouter symétriquement à `grant`).
- Dans la modale de détail d'un item **installé**, sous les infos déjà affichées,
  monter `PluginGrantedPermissions` avec `items` dérivé de
  `GET /api/marketplace/items/{id}` (déjà exposé, `capabilities` filtré aux seules
  capacités effectivement accordées plutôt que déclarées — nouveau champ
  `grantedCapabilities` à ajouter à la sérialisation, distinct de `capabilities` qui
  reste « tout ce que le manifeste demande »).
- `onRevoke` appelle la nouvelle route puis rafraîchit.

**Critères d'acceptation** : révoquer une capacité depuis l'admin fait disparaître la
méthode SDK correspondante à la prochaine exécution du plugin (vérifiable une fois T04
livré, sinon vérifiable directement sur `PluginGrantStore`).

**Tests exigés** : unitaire routeur (revoke réussi/plugin inconnu), e2e admin
(clic révoquer → disparaît de la liste).

**Impact contrat/ADR** : non.

## T03 — Notice « mises à jour marketplace disponibles »

**Priorité** : P2. **Effort** : 2 h.
**Fichiers** : nouveau `packages/api/src/notices/marketplace-updates.ts` (calqué sur
`plugin-disabled.ts`), `packages/api/src/notices/router.ts` (enregistrement),
câblage dans `serve.ts` là où les autres sources sont assemblées.

**Travail détaillé** : `list({ actor })` retourne un item si `pendingMarketplaceUpdates`
(logique déjà écrite dans `shell-status-router.ts:256-268`, à factoriser en fonction
partagée plutôt que dupliquée) est `> 0` et que l'acteur est `admin`. Dismissible :
oui (une fois vue, elle ne doit pas revenir avant la prochaine mise à jour disponible —
suivre le même `dismissals.ts` que les autres sources).

**Critères d'acceptation** : une mise à jour disponible produit une entrée dans le
centre de notifications, pas seulement le badge de nav.

**Tests exigés** : unitaire (source de notice), e2e (notice visible après qu'une maj
apparaisse).

**Impact contrat/ADR** : non.

## T04 — Configurer une vraie `engineVersion` pour le contrôle de compatibilité

**Priorité** : P1. **Effort** : 1 h.
**Fichiers** : `packages/cli/src/commands/serve.ts` (ligne ~1727,
`createMarketplaceInstaller`).

**Travail détaillé** : passer `engineVersion: getCliVersion()` (déjà utilisé par
`cogenta update`) à `createMarketplaceInstaller`. Vérifier que `getCliVersion()` est
accessible dans le contexte de `serve.ts` (déjà exporté par `@cogenta/cli` — import
direct).

**Critères d'acceptation** : un item de catalogue déclarant `engine: '^99.0.0'` est
refusé à l'installation avec `MARKETPLACE_ENGINE_INCOMPATIBLE`, plutôt que silencieusement
accepté.

**Tests exigés** : test d'intégration `serve.ts` (déjà existe une suite marketplace
probablement — étendre avec un cas d'incompatibilité réelle bout en bout).

**Impact contrat/ADR** : non.

## T05 — CLI `cogenta plugin install/remove/list`

**Priorité** : P1. **Effort** : 1 j.
**Fichiers** : nouveau `packages/cli/src/commands/plugin.ts`, `packages/cli/src/index.ts`
(USAGE + export), `packages/cli/src/bin.ts` (dispatch).

**Travail détaillé** : réutilise directement `createMarketplaceCatalog`/
`createMarketplaceInstaller` sans passer par HTTP (même modèle que `runSkin`/`runUsers`
qui parlent directement à la base). Sous-commandes :
- `plugin list` — liste installés avec statut, formaté comme `doctor`.
- `plugin install <itemId>` — lit le catalogue configuré (via `cogenta.config`'s
  `marketplace.catalog`, chargé comme le reste de la config), affiche les capacités
  demandées avec `describeCapability`, demande confirmation interactive (`--yes` pour
  scripté), accorde ce qui est confirmé (réutilise T01).
- `plugin remove <itemId> [--keep-data]` — désinstalle, `--keep-data` par défaut
  (cohérent avec la recommandation §8 de la fiche 29).
- `plugin update <itemId> [--confirm-permissions]`.

**Critères d'acceptation** : `cogenta plugin list` sur un site frais montre une liste
vide propre (pas une erreur) ; installer puis lister montre le plugin actif.

**Tests exigés** : test CLI bout en bout contre un vrai serveur HTTP temporaire, comme
les autres commandes (`skin`, `roles`).

**Impact contrat/ADR** : non — nouvelle commande CLI, pas un contrat versionné.

## T06 — Décision écrite sur les trois registres morts (plugins/thèmes/skills)

**Priorité** : P1. **Effort** : 0.5 j (décision) + variable selon le choix.
**Fichiers** : `docs/lots/L7-extensibilite.md` (ou une note dans `docs/plans/`),
potentiellement `packages/api/src/rest/` (nouveaux routeurs) si le choix est de câbler.

**Travail détaillé** : ce n'est pas un bug de code, c'est une divergence de conception
jamais tranchée par écrit. Deux options honnêtes :
1. **Câbler les trois registres** derrière de vraies routes admin (soumission,
   liste en attente de revue, approuver/rejeter) — redonne son sens à la colonne
   « Exigences » du tableau de L7 (« revue » pour plugins/skills, « contrat vérifié »
   pour thèmes). Effort estimé : 2-3 j par registre (routeur + écran de revue admin).
2. **Documenter formellement** que le marketplace (catalogue local +
   `createMarketplaceInstaller`) remplace ces trois registres pour la version actuelle
   du produit, et retirer ou marquer expérimental le code mort correspondant (ou le
   garder en `@internal` avec un commentaire pointant vers cette décision).

Ne pas laisser les deux coexister silencieusement — c'est ce qui a produit la
confusion trouvée dans cet audit (le guide-plugin.md documente `createPluginRegistry`
comme LE mécanisme de publication, alors qu'aucun code de production ne l'utilise).

**Critères d'acceptation** : `docs/guide-plugin.md` §« Publishing » reflète ce qui
tourne réellement, pas ce qui a été construit puis abandonné en silence.

**Impact contrat/ADR** : non pour l'option 2 (documentation) ; non plus pour l'option 1
(additif, aucun contrat A/B/C/D touché) — mais effort nettement plus élevé.

## T07 — Étendre l'affichage de consommation de ressources

**Priorité** : P3. **Effort** : 2 h.
**Fichiers** : `packages/admin/src/routes/marketplace.tsx` (cellule usage ou section
détail), i18n fr/en.

**Travail détaillé** : afficher `errorCount`/`timeoutCount`/`memoryCount`/`crashCount`
et `totalDurationMs`/`lastOutcome` — déjà présents dans `MarketplaceInstalledItem.usage`
côté client (à vérifier/étendre dans `marketplace-client.ts` si absent). Un badge
distinct si `crashCount > 0` ou `timeoutCount > 0` récent (signal "celle qui consomme
le plus", demandé par la fiche 29).

**Critères d'acceptation** : un plugin ayant crashé 3 fois montre un badge visible,
pas seulement `callCount`.

**Tests exigés** : e2e admin avec un mock `usage` incluant des erreurs.

**Impact contrat/ADR** : non.

## T08 — Retirer ou honorer les filtres `theme`/`skin`/`skill` du sélecteur « kind »

**Priorité** : P2. **Effort** : 1 h (option retrait) ou dépend de T06 (option câblage).
**Fichiers** : `packages/admin/src/routes/marketplace.tsx:644-647`.

**Travail détaillé** : tant que `install()` refuse tout sauf `kind: 'plugin'`
(`MARKETPLACE_KIND_UNSUPPORTED`), le sélecteur ne devrait pas laisser filtrer/trouver
des items qui échoueront systématiquement à l'installation sans avertissement visible
avant le clic. Solution rapide : garder le filtre mais désactiver visuellement le
bouton d'installation pour un item non-`plugin`, avec message explicite (« Les thèmes/
skins/skills s'installent depuis Apparence / Compétences » plutôt qu'une erreur serveur
brute après coup) — ou masquer les kinds non supportés tant que T06 n'est pas tranché.

**Critères d'acceptation** : un utilisateur ne découvre plus l'échec d'installation
d'un thème qu'après avoir cliqué « installer ».

**Impact contrat/ADR** : non.

## 7. Ordre d'exécution recommandé et dépendances

1. **T01** (grant réel à l'installation) — bloquant conceptuellement pour tout le
   reste ; sans lui, T02 n'a rien de significatif à révoquer.
2. **T04** (engineVersion réelle) — indépendant, rapide, corrige un critère
   d'acceptation de la fiche 29 qui échoue silencieusement aujourd'hui.
3. **T02** (écran de révocation) — dépend de T01 pour avoir des grants réels à
   afficher/révoquer.
4. **T08** (filtre kind honnête) — indépendant, rapide, améliore l'UX immédiatement.
5. **T03** (notice mises à jour) — indépendant.
6. **T07** (détail usage) — indépendant, cosmétique.
7. **T06** (décision registres morts) — à trancher tôt en pratique (c'est une
   discussion, pas du code) mais listée après car elle ne bloque aucune des tâches
   ci-dessus ; son résultat conditionne un effort potentiellement important (option 1).
8. **T05** (CLI plugin) — le plus gros morceau restant, indépendant des autres,
   peut être fait en parallèle par un autre agent dès que T01 est mergé (pour
   réutiliser la bonne signature d'`install`).

Aucune de ces tâches ne nécessite d'ADR : tout est additif à des interfaces internes
(`@cogenta/plugins`, routeur REST, CLI), rien ne touche aux contrats A/B/C/D figés. Le
vrai chantier hors-format-audit qui resterait, non chiffré ici parce qu'il déborde
largement le périmètre « marketplace » de ce document, est de brancher `runPlugin` à un
vrai déclencheur d'exécution (agent runtime, hook de contenu, ou tâche planifiée) —
sans quoi tout ce qui précède reste une gestion d'inventaire pour du code qui ne
tourne jamais.
