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
| Lot en cours | **L9 — Écosystème** (`docs/lots/L9-ecosysteme.md`) — installeur, skin IA, blueprints, imports, CLI, hébergement mutualisé, documentation, gouvernance. **Tâches 1-8 faites** (installeur, doctor, blueprint blog + démo + pages types, documentation de démarrage, import WordPress WXR, skin IA, les huit blueprints nommés par le lot). Détail complet dans l'historique git (commits `d321a40`..`9463f49`). **Tâche 9 faite** : CLI complet, scopé honnêtement — pour chaque sous-commande du lot, construite seulement si une capacité réelle existait à envelopper, sinon différée avec raison documentée (même discipline que la tâche 10 du L5). Construit : `cogenta dev` (alias réel de `serve`, `serve` reste documenté et fonctionnel) ; `cogenta generate types` (enveloppe mince de `renderTypeDeclarations`, `@cogenta/schema`, écrit `.cogenta/types/schema.d.ts` par défaut — `generate schema`/`generate migrations` n'existent pas, aucun diff-schéma-vers-migration nulle part) ; `cogenta skin list/validate/apply` (enveloppes minces de `validateSkin`/contrat D, `@cogenta/render` — `apply` ne retombe jamais une invalidation, un skin invalide n'est jamais écrit) ; `cogenta skin generate` (bout-en-bout réel, même boucle de correction à trois tentatives que la tâche 7). La logique de `generateSkin` (créée pour l'installeur, tâche 7) est **relogée de `create-cogenta` vers `@cogenta/agents`** — elle ne dépendait que de `@cogenta/core`/`@cogenta/render`/`@cogenta/agents`, rien de spécifique à l'installeur — pour que l'installeur et le CLI l'appellent tous deux sans que l'un dépende de l'autre ; `@cogenta/agents` gagne une dépendance vers `@cogenta/render` (le schéma qu'il valide), pas l'inverse. `create-cogenta`'s `skin-flow.ts` importe maintenant `generateSkin` depuis `@cogenta/agents`, comportement inchangé. Différé, sans stub, raison documentée pour chacun : `build` (aucun câblage Astro réel nulle part — `astro.config.mjs` absent, les fichiers `.astro` du thème canonique sont orphelins du renderer TS que `serve`/`renderPage` utilisent réellement, un `cogenta build` n'aurait rien de réel à appeler) ; `backup` (seule trace de « backup » dans `@cogenta/core` : un booléen de confirmation dans le moteur de migration, pas un mécanisme de sauvegarde/restauration) ; `upgrade` (aucun mécanisme de vérification de version nulle part) ; `deploy` (aucun concept de « cible de déploiement » dans la config, et le profil mutualisé — tâche 13 — dont ça dépendrait n'est pas construit) ; `theme` (un seul thème existe, rien à lister/activer) ; `agent` (aucun site ne construit de `AgentRegistry` vivant nulle part dans le dépôt — même lacune R2-honnête déjà documentée pour le routeur HTTP `@cogenta/api`'s `agents-router.ts`, tâche L5.9). `cogenta <commande non construite>` retombe sur le message d'usage existant plutôt qu'un stub silencieux. **Tâche 10 faite** : documentation fonctionnelle (`docs/guide-editeur.md`), en français, sans jargon, pour l'éditeur/propriétaire de site — distincte de la doc technique (tâche 5). Chaque section est ancrée dans un écran réel de `@cogenta/admin` lu directement (`packages/admin/src/routes/*.tsx`) : connexion (passkey en méthode principale, e-mail/mot de passe + TOTP en secours), tableau de bord (trois encarts réels — santé, activité, contenu programmé — et trois encarts honnêtement vides faute de source de données), collections (liste/filtre/tri/pagination/suppression groupée), édition d'entrée (aperçu réel, historique de versions, traductions), les douze blocs du vocabulaire en langage clair, médias (point focal, texte alternatif, pas de recadrage manuel), historique/audit (vérification d'intégrité de la chaîne), agents (honnête sur l'absence de tout `AgentRegistry` vivant dans ce dépôt — activer un agent ici ne le fait pas tourner tout seul), réglages (langue de l'interface + ajout de passkey, rien d'autre), apparence (aucun écran de modification après coup dans l'admin). Trouvaille vérifiée en lisant le code plutôt que supposée : aucun bouton « Publier » séparé n'existe dans l'écran d'édition — documenté tel quel, pas une fonctionnalité inventée. Pas de changeset (aucun paquet publié touché). **Tâche 11 faite** : quatre schémas d'architecture SVG faits main, zéro dépendance (`docs/architecture/{two-planes,content-lifecycle,agent-loop,build-pipeline}.svg`), chacun ancré dans le code réel plutôt que dans une intention : les deux plans (l'ASCII de `docs/02-architecture.md` § 1 rendu en SVG, sans réorganisation) ; le cycle de vie d'un contenu (états `ContentStatus`/`EntryState` et verbes `create/update/publish/unpublish/history/restore` lus directement dans `packages/schema/src/store/store.ts`, dont son commentaire-clé « une ligne des versions, pas une mutation de la ligne live » cité tel quel) ; le cycle d'exécution d'un agent (ordre exact des cinq garde-fous et les huit `RunStopReason` lus dans `packages/agents/src/runtime/loop.ts`/`types.ts`) ; le pipeline de rendu conçu (Astro, trois niveaux de thème, § 6). Deux sont animés (SMIL `animateMotion`, la mécanique explicitement demandée par le lot) : le cycle de contenu (un jeton trace modifier→nouvelle version→publier, rendant visible que la ligne live n'est jamais touchée avant `publish()`) et la boucle d'agent (un jeton trace une itération complète). Le schéma de build porte une annotation visible, pas seulement en prose : « conception documentée — `cogenta build` non câblé (tâche 9) » — jamais un schéma qui laisse croire à une capacité absente. Intégrés par `<figure>`/`<img>` dans `docs/02-architecture.md` aux sections concernées (§ 1, § 4, § 5 nouvelle sous-section « Cycle de vie d'un contenu », § 6), l'ASCII existant conservé en repli texte. Pas de changeset (aucun paquet publié touché). Prochaine tâche : 12 — site du projet et playground. **Tâche 2 vérifiée déjà faite** : `cogenta doctor` (héritée de L0) satisfaisait déjà le critère d'acceptation. L5 précédent : 9/10 tâches faites, **tâche 10 (agents de priorité 2-3) délibérément non entamée** — aucune spécification dans le lot pour ces sept agents, contrairement aux quatre de priorité 1 ; reprendre quand une spec équivalente existe. Résumé L5 1-9 dans l'historique git (commits `ea82de1`..`bcf646e`). |
| Lots terminés | L0 (socle), L1 (contenu), L3 (rendu), L2 (admin, 16/16 tâches), L4 (runtime agentique, 21/21 tâches), **L5 (agents, 9/10 tâches — tâche 10 différée, voir Lot en cours)**. 2493 tests unitaires, tous verts (recompté directement paquet par paquet cette session, en sommant chaque `vitest run` isolé — 2478 avant la tâche 9 ; principaux mouvements : +6 `@cogenta/agents` pour `generateSkin` relogé et son propre test, +18 `@cogenta/cli` pour `generate`/`skin`, -6 `create-cogenta` pour le test `skin-generation.test.ts` relogé avec le code). `@cogenta/seo`'s `test/sitemap.test.ts` « holds every file under both protocol limits by default » a de nouveau flaké lors d'un `pnpm test` complet cette session (timeout Vitest sous contention CPU) — reconfirmé non reproductible en isolation (`pnpm -F @cogenta/seo test`, 130/130 verts), même flaky d'environnement connu, paquet non modifié. Un crash du compilateur `tsc` (build Go, `@cogenta/cli:build`) sous la même contention a aussi été observé une fois cette session — reconfirmé non reproductible en isolation, même famille de flaky. Intégration Postgres/MySQL/MariaDB du `MediaStore` écrite mais non exécutée cette session (Docker Desktop indisponible) ; adaptateurs de fournisseurs LLM sans test d'intégration exécuté (nécessite une clé API réelle, `vitest.integration.config.ts` prêt, skip loud si absente). |
| Paquets publiés | `@cogenta/core`, `@cogenta/schema`, `@cogenta/blocks`, `@cogenta/api`, `@cogenta/render`, `@cogenta/seo`, `@cogenta/theme-canonical`, `@cogenta/auth`, `@cogenta/cli` (`doctor`, `migrate`, `users create`, `serve`/`dev`, `import wordpress`, `generate types`, `skin list/validate/apply/generate`), `@cogenta/mcp` (serveur MCP, tâche 17), `@cogenta/agents-builtin` (agents intégrés, L5), `@cogenta/agents` (gagne `generateSkin`, L9 tâche 9, et une dépendance vers `@cogenta/render`), `@cogenta/import` (import WordPress WXR, L9 tâche 6), `create-cogenta` (installeur `npm create cogenta`, L9 tâche 1, nom non préfixé par convention npm), `@cogenta/admin` (coquille, non publié) |
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
