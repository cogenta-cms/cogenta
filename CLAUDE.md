# CLAUDE.md

Ce fichier est le point d'entrée de toute session de développement assistée sur Cogenta.

## Règles de développement

@AGENTS.md

## Avant d'écrire du code

Dans cet ordre, sans sauter d'étape :

1. `docs/00-vision.md` — si jamais lu.
2. `docs/03-decisions.md` — **une décision actée ne se rediscute pas.** Si elle semble
   mauvaise, le dire et attendre. Ne pas contourner.
3. `docs/lots/<lot en cours>.md` — périmètre, interfaces à produire, critères
   d'acceptation, pièges connus.
4. `docs/04-contrats.md` — uniquement les contrats que le lot consomme.

La commande `/lot <L0..L9>` fait ce chargement pour toi.

## État courant

| Élément | Valeur |
|---|---|
| Lot en cours | **L9 — Écosystème** (`docs/lots/L9-ecosysteme.md`) — installeur, skin IA, blueprints, imports, CLI, hébergement mutualisé, documentation, gouvernance. **Tâche 8 terminée (lot B sur deux)** : les quatre derniers blueprints — les huit blueprints nommés par le lot sont maintenant tous réels, `resolveBlueprint` ne retombe sur `blank` que pour un id réellement inconnu. `magazine` — `article` (titre/extrait/section/corps, routé `/articles/:slug`), groupé par le champ `section` plutôt qu'une seconde collection de catégorie (même restriction que `blog`'s `category` réelle vs. un simple champ, choisie ici car un magazine n'a pas besoin d'une taxonomie éditable séparément) ; `home` (hero + liste en direct des derniers articles) et `about` (prose). `association` (association loi 1901 / nonprofit) — `event` (titre/date/lieu/description, routé `/events/:slug`) ; `home` (hero + prose de mission + liste en direct des événements à venir + cta don) et `mission` (prose + bloc `stats` statique d'impact). `restaurant` — `menu_item` (nom/description/prix/catégorie, routé `/menu/:slug` pour qu'un `collectionList` puisse construire un lien, même si rien ne cible une entrée individuellement pour l'instant) ; `home` (hero + liste en direct des plats phares) et `contact` (prose avec horaires/adresse en texte brut — contrat A n'a pas de type « horaires » dédié et n'en justifie pas un pour deux lignes). `saas` — `feature` (nom/description, routé `/features/:slug`) ; `home` (hero + grille de fonctionnalités en direct + cta inscription) et `pricing` (prose + bloc `stats` statique) ; délibérément aucune collection `pricingPlan` — des tarifs page-authored sans cycle de vie propre ne justifient pas une seconde collection. Les quatre réutilisent `BlueprintContentPack`/`definePageCollection` exactement comme le lot A. Le test de repli inconnu de `wizard.test.ts` (qui utilisait `magazine` comme exemple de blueprint « pas encore construit ») est corrigé pour utiliser un id réellement inconnu, maintenant que les neuf entrées de `BLUEPRINTS` sont toutes `available: true` sauf aucune (`blank` compris). Prochaine tâche : 9 — CLI complet. **Tâche 8 (lot A sur deux) faite** : trois blueprints supplémentaires. `vitrine` (site vitrine une page) — `service` (routé `/services/:slug`, pour qu'un bloc `collectionList` puisse construire un lien vers chaque entrée) et `testimonial` ; `home` (hero + grille de services en direct + cta) et `about` (prose + deux blocs `quote` reflétant les témoignages semés — un témoignage n'a pas de page propre à cibler, donc pas interrogé en direct comme `service`). `portfolio` — `project` routé `/work/:slug` ; `home` (hero + grille de projets en direct) et `about` (prose + bloc `stats` statique). `documentation` — `doc_page` (titre/section/ordre/corps, routé `/docs/:slug`) *est* les « pages types » de ce blueprint, plus une entrée `page` (`home`) reliant vers la liste en direct des pages de doc ; le plus éloigné des trois en esprit (référence, pas marketing). Les trois réutilisent l'extension `BlueprintContentPack` (voir ci-dessous) et un nouvel helper partagé `definePageCollection` (`content-pack.ts`) pour la forme `title`/`slug`/`blocks` que `blog.ts` avait déjà — troisième usage réel et au-delà, selon la règle AGENTS.md « pas avant trois usages réels » ; `blog.ts` lui-même n'est pas touché. `resolveBlueprint` résout maintenant `vitrine`/`portfolio`/`documentation` comme disponibles ; quatre blueprints restent pour un second lot (magazine, association, restaurant, SaaS). Refactor préalable (commit séparé) : le branchement `blueprint.id === 'blog'` codé en dur dans `scaffold.ts` est généralisé en un lookup générique `BLUEPRINT_CONTENT_PACKS[blueprint.id]` — même généralisation appliquée aux deux vérifications équivalentes dans `recap.ts`/`wizard.ts` qui limitaient à tort la génération de skin IA au seul blueprint `blog`. **Tâche 7 faite** : génération de skin par IA avec validation en refus dur (`packages/create-cogenta/src/skin-generation.ts`, `skin-preview.ts`, `skin-flow.ts`). Rien réinventé côté validation ou rendu : `validateSkin`/`renderSkinCss` (`@cogenta/render`, déjà construits et conformes au contrat D figé) sont réutilisés tels quels — le module de génération ne fait que décrire le schéma des tokens à partir de `TOKEN_SPECS`/`CONTRAST_PAIRS` (une seule source de vérité, aucune duplication à la main qui pourrait diverger) et transformer chaque `CogentaError` rejetée (`message`/`hint`, écrits explicitement pour qu'« un modèle puisse corriger ce que le message mesure réellement ») en consigne de correction pour la tentative suivante, trois tentatives au total. Un essai réussi est rendu sur trois pages types réelles (`hero`+`prose`, `prose`+`quote`, `collectionList`+`prose` — trois compositions fixes, pas un système générique de « N pages »), à travers le même pipeline générique `renderPage`/`renderBlock` qu'un site en production, écrit dans `.cogenta/skin-preview/`. L'installeur propose alors accepter / régénérer / garder le défaut (`Prompter.choice`, bornée à trois tours pour ne jamais boucler en mode `--yes`/`--config`, où le choix par défaut — accepter — répond seul). Portée volontairement limitée au blueprint `blog` (seul blueprint qui écrit un `theme.tokens.json` aujourd'hui) ; la régénération après installation (`cogenta skin generate`) est un sous-commande CLI listée par le lot sous la tâche 9, pas construite ici. Chaque issue — généré et accepté, régénéré, retombé sur le défaut après échec de validation, ou jamais proposé (pas de fournisseur / pas de description) — est nommée dans le récapitulatif d'installation, jamais silencieuse. Un nouveau code d'erreur `@cogenta/core` : `SKIN_GENERATION_RESPONSE_NOT_JSON`. Corpus de 14 tokens JSON (3 valides, 11 invalides couvrant chacune des six catégories de refus de `validateSkin`) prouve le pouvoir de discrimination du validateur — c'est la propriété critique de ce lot, pas la qualité d'une sortie de modèle donnée. Correction au passage : l'export public ambigu `ContentBlock` de `@cogenta/schema` (signalé sans être corrigé par la tâche 6) est maintenant réglé — le type de validation d'entrée (`validation.ts`) est renommé `RawBlockInput`, `ContentBlock` désigne sans ambiguïté la forme du store ; vérifié par `contract-guardian` (aucune forme de contrat A/B n'a bougé, seul un alias TypeScript a changé de nom, aucun consommateur du dépôt n'importait le nom masqué), changeset patch écrit. **Tâche 6 faite** : import WordPress WXR avec rapport de conversion, nouveau paquet `@cogenta/import` (`packages/import/`), commande `cogenta import wordpress <fichier.xml>`. Parseur XML fait maison, zéro dépendance : `deps-auditor` a refusé `fast-xml-parser` (éclaté en sept paquets publiés le même jour sous un seul mainteneur, ~1,28 Mo, aucune provenance signée — et un parseur XML général expose une surface XXE/expansion d'entités qu'un fichier d'import de provenance quelconque (R8) n'a aucune raison de porter) ; le tokenizer (`src/wordpress/xml.ts`) est borné à ce que WXR utilise réellement (RSS2 + `wp:*`, CDATA, cinq entités standard, `<!DOCTYPE … ENTITY>` rejeté explicitement avec `IMPORT_WXR_UNSAFE_DOCUMENT`). Contenu importé : articles/pages, catégories/étiquettes, médias (téléchargés puis stockés via `MediaStore`/`StorageDriver` réels, alt synthétisé et signalé), auteurs (utilisateurs réels sans identifiant, e-mail manquant → adresse `@imported.invalid` signalée), commentaires approuvés seulement (nouvelle collection minimale `comment`, décision délibérée plutôt que de les déclarer hors périmètre — le lot les cite au même titre que le reste), postmeta porté tel quel en `customFields: f.json()` (contrat A n'a pas de type « champ libre »), blocs Gutenberg convertis vers le vocabulaire (`prose`/`mediaFigure`/`quote`/`gallery`/`embed`) quand une correspondance existe, sinon signalés — jamais recasés en HTML brut dans un bloc (R3). Redirections préservées via `createRedirectStore` (`@cogenta/schema`, déjà prévu pour l'import : `REDIRECT_REASONS` contient `'import'`) de l'ancien permalien vers la route générée par `buildPath`. `ConversionReport` (`imported`/`skipped`/`unconvertedBlocks`/`warnings`) est la sortie de premier ordre, imprimée par la commande CLI, qui sort `0` même avec des éléments non convertis (un import partiel signalé est le résultat attendu, pas un échec) et seulement `1` sur un fichier illisible. Testé contre deux exports WXR réalistes écrits à la main (`packages/import/test/fixtures/`, format WXR 1.2 réel, pas des fixtures minimalistes) via une vraie base SQLite, sans mock de la base ni du stockage — seule la frontière `fetch` du téléchargement média est simulée (avec une URL volontairement morte pour exercer la dégradation propre). Nouveau scope de commit `import` ajouté à `commitlint.config.js`. Anomalie découverte et contournée sans y toucher : `@cogenta/schema`'s export public `ContentBlock` est ambigu entre deux fichiers (`validation.ts` et `store/types.ts`) — celui de `validation.ts` gagne silencieusement via `export *`, jamais corrigé ici (hors périmètre, risque sur un export public partagé), contourné par un type structurel local (`StoredBlock`) plutôt que d'importer le nom ambigu. **Tâche 5 faite** : documentation technique de démarrage (`docs/getting-started.md`), exemples de code testés en CI via `examples/getting-started/` (nouveau paquet privé) et `scripts/check-docs-examples.mjs`. **Tâches 1, 3, 4 faites** : installeur `create-cogenta` (`npm create cogenta`), blueprint « blog » (`post`/`category`/`tag`/`page`, contenu de démo réel, skin appliqué, agents recommandés nommés sans être activés), pages types du blueprint. Détail complet dans l'historique git (commits `d321a40`..`1430cdd`). **Tâche 2 vérifiée déjà faite** : `cogenta doctor` (héritée de L0) satisfaisait déjà le critère d'acceptation. L5 précédent : 9/10 tâches faites, **tâche 10 (agents de priorité 2-3) délibérément non entamée** — aucune spécification dans le lot pour ces sept agents, contrairement aux quatre de priorité 1 ; reprendre quand une spec équivalente existe. Résumé L5 1-9 dans l'historique git (commits `ea82de1`..`bcf646e`). |
| Lots terminés | L0 (socle), L1 (contenu), L3 (rendu), L2 (admin, 16/16 tâches), L4 (runtime agentique, 21/21 tâches), **L5 (agents, 9/10 tâches — tâche 10 différée, voir Lot en cours)**. 2478 tests unitaires, tous verts (recompté directement paquet par paquet cette session, en sommant chaque `vitest run` isolé — 2459 avant la tâche 8 lot B, +19 pour `create-cogenta` : quatre blueprints, régressions registry/wizard/blueprints). `@cogenta/seo`'s `test/sitemap.test.ts` « holds every file under both protocol limits by default » a de nouveau flaké lors d'un `pnpm test` complet cette session (timeout Vitest sous contention CPU) — reconfirmé non reproductible en isolation (`pnpm -F @cogenta/seo test`, 130/130 verts), même flaky d'environnement connu, paquet non modifié. Intégration Postgres/MySQL/MariaDB du `MediaStore` écrite mais non exécutée cette session (Docker Desktop indisponible) ; adaptateurs de fournisseurs LLM sans test d'intégration exécuté (nécessite une clé API réelle, `vitest.integration.config.ts` prêt, skip loud si absente). |
| Paquets publiés | `@cogenta/core`, `@cogenta/schema`, `@cogenta/blocks`, `@cogenta/api`, `@cogenta/render`, `@cogenta/seo`, `@cogenta/theme-canonical`, `@cogenta/auth`, `@cogenta/cli` (`doctor`, `migrate`, `users create`, `serve`, `import wordpress`), `@cogenta/mcp` (serveur MCP, tâche 17), `@cogenta/agents-builtin` (agents intégrés, L5), `@cogenta/import` (import WordPress WXR, L9 tâche 6), `create-cogenta` (installeur `npm create cogenta`, L9 tâche 1, nom non préfixé par convention npm), `@cogenta/admin` (coquille, non publié) |
| Ordre des lots | `L0 → L1 → L3 → L2 → L4 → L5 → L9(installeur) → L6 → L7 → L8` |
| Contrats figés | **A, B, C et D figés** — C (`tools@1.0`) figé le 2026-08-14 (ADR-0020), tel qu'esquissé, sans modification |
| Statut public | pre-alpha |

Tenir ce tableau à jour à chaque changement de lot.

## Mode de travail : autonomie

Décider, coder, livrer, puis rendre compte. Ne pas demander la permission pour une
décision de conception : la prendre, la tracer, et la signaler dans le rapport.

**S'arrêter pour demander uniquement dans trois cas :**

1. Une action **irréversible vers l'extérieur** — publier sur npm, supprimer des
   données, déployer en production.
2. Un **secret ou un accès** que seul l'humain détient.
3. Un choix qui **contredirait une décision déjà actée** dans `docs/03-decisions.md`.

Tout le reste s'avance. Une décision discutable signalée dans un rapport coûte une
correction ; une question posée coûte une journée d'attente.

## Gouvernance documentaire

`docs/03-decisions.md` est **append-only** : une décision actée ne se modifie pas. Pour
changer d'avis, écrire une **nouvelle** ADR et marquer l'ancienne
`Remplacée par ADR-XXXX`, sans supprimer son texte.

`docs/04-contrats.md` est versionné en semver. **A (`schema@1.0`) et B (`blocks@1.0`)
sont figés** depuis le 2026-08-13 : les modifier impose une montée de version majeure et
une note de migration du contenu déjà saisi. C et D ne sont pas encore figés.

Ces règles s'appliquent par discipline, plus par un hook.

## Sous-agents disponibles

| Agent | Quand l'appeler |
|---|---|
| `contract-guardian` | Avant de commiter du code qui touche un contrat A/B/C/D ou une ADR |
| `dod-verifier` | Avant tout commit ou PR — joue la « Définition de terminé » |
| `db-dialect-specialist` | Dès qu'un SQL, une migration ou un type de colonne est en jeu |
| `driver-parity-tester` | À chaque nouvelle interface de driver ou nouvelle implémentation |
| `deps-auditor` | Avant d'ajouter une dépendance directe (R9, R10) |
| `security-reviewer` | Auth, plugins tiers, agents, secrets, exécution de code tiers |
| `docs-sync` | Après un changement d'interface publique |

## Skills projet

`new-package` · `new-driver` · `write-migration` · `integration-tests` · `write-adr` ·
`changeset`

## Commandes

`/lot` · `/dod` · `/adr` · `/contract`

## Commandes shell utiles

```bash
pnpm install                  # installe le workspace
pnpm lint                     # Biome (lint + format)
pnpm typecheck                # tsc --noEmit sur tous les paquets
pnpm test                     # tests unitaires (Vitest)
pnpm services:up              # Postgres + MySQL + Redis + MinIO éphémères
pnpm test:integration         # tests d'intégration (exige services:up)
pnpm services:down
pnpm changeset                # décrit un changement publiable
```

## Rappels qui coûtent cher quand on les oublie

- **Pas de `any`, pas de `@ts-ignore`, pas de CommonJS.** ESM uniquement.
- **Jamais `throw new Error("…")` nu** dans du code de bibliothèque : `CogentaError`
  avec `code` stable et `hint`.
- **Jamais `console.log`** : logger structuré.
- **Pas de mock de la base.** Base réelle éphémère.
- **Le driver dégradé est testé**, pas seulement l'optimal.
- **Un `TODO` sans issue GitHub associée est interdit.**
- Commits en Conventional Commits, avec `Signed-off-by`. Code, commentaires, commits
  et issues **en anglais** ; les documents de conception sont en français.
