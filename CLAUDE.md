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
| Lot en cours | **L8 — Flotte** (`docs/lots/L8-flotte.md`). Objectif : plan de contrôle multi-sites — une agence supervise 20 à 100 sites clients depuis une interface unique (versions, CVE ouvertes, performances, sauvegardes, mises à jour groupées, rapports par client). Principe fondateur (ADR-0003) : chaque site reste une installation autonome avec sa propre base ; le plan de contrôle est un observateur et un déclencheur, jamais un propriétaire — un site compromis ne peut pas atteindre les autres, un client qui part emporte son installation entière, le plan de contrôle indisponible n'empêche aucun site de fonctionner, aucune donnée de contenu ne remonte, seulement des métadonnées d'exploitation. Nouveau paquet `@cogenta/fleet` (`packages/fleet/`). Dépend de L5 (les agents produisent les données de supervision, déjà fait) et L6 (les rapports partent sur les canaux, déjà fait). **Tâche 1 faite** : protocole d'appairage, clés, révocation (`packages/fleet/src/enrollment/`) — `createEnrollmentStore` : `issuePairingToken(siteName, ttlMs?)` génère un jeton réel à usage unique et durée de vie limitée (32 octets aléatoires, base64url, stocké haché SHA-256 — même forme que les jetons de session de `@cogenta/auth`, pas les codes courts à taper à la main de `@cogenta/channels`, puisqu'un jeton d'appairage se copie-colle dans la configuration d'un site, ne se tape jamais caractère par caractère). `consumePairingToken(token, sitePublicKey)` enregistre le site avec sa vraie clé publique Ed25519 soumise à la consommation — c'est le seul moment où l'identité d'un site s'établit, toute communication ultérieure s'authentifie contre cet enregistrement. Résultat discriminé (`{ok:false, reason:'invalid'|'expired'|'already_used'}`) plutôt qu'une exception brute — le rejeu d'un jeton déjà consommé échoue explicitement, exactement le test de sécurité exigé par le lot. Révocation réelle et immédiatement vérifiable (`revokeSite`/`isRevoked`). Réutilise telle quelle la primitive Ed25519 déjà réelle et testée de `@cogenta/plugins` (`generateSigningKeyPair`/`signContent`/`verifyContentSignature`, tâches 9/12 du L7) comme nouvelle dépendance de workspace plutôt qu'une seconde implémentation de signature — un test réel prouve qu'une signature faite avec la clé privée d'un site vérifie exactement contre la clé publique enregistrée à l'appairage, et échoue contre une autre clé ou un contenu modifié. Volontairement pas construit cette tâche : la boucle de contact périodique côté site, l'émission de télémétrie, la récupération de commandes — les tâches suivantes du lot, qui s'appuieront sur cette couche de données. Scope `fleet` ajouté à `commitlint.config.js`. Reste à faire, dans l'ordre du lot : tâches 2-11 (télémétrie, ingestion, inventaire, tableau de bord, commandes signées, mises à jour par vagues, retour arrière, rapports client, alertes de flotte, tests d'isolation inter-sites). |
| Lots terminés | L0 (socle), L1 (contenu), L3 (rendu), L2 (admin, 16/16 tâches), L4 (runtime agentique, 21/21 tâches), **L5 (agents, 9/10 tâches — tâche 10 délibérément non entamée : aucune spécification dans le lot pour les sept agents de priorité 2-3, contrairement aux quatre de priorité 1 ; reprendre quand une spec équivalente existe. Résumé L5 1-9 dans l'historique git, commits `ea82de1`..`bcf646e`)**, **L9 — Écosystème (`docs/lots/L9-ecosysteme.md`, installeur/skin IA/blueprints/import/CLI/hébergement mutualisé/documentation/gouvernance, les 14 tâches faites sauf une case explicitement laissée à l'humain — voir ci-dessous). Résumé complet dans l'historique git (commits `d321a40`..`6a44558`)**. Points de L9 qui ne sont PAS dans le code et qu'il faut garder en tête pour la suite : (1) `cogenta build`/`backup`/`upgrade`/`deploy`/`theme`/`agent` sont des commandes CLI honnêtement différées, sans stub, faute de capacité réelle sous-jacente (tâche 9) ; (2) la case « testé sur un vrai hébergement cPanel » (tâche 13, `docs/hebergement-mutualise.md`) reste à cocher par l'humain — ce n'est pas du travail en attente, c'est un accès que je n'ai pas ; (3) aucun `AgentRegistry` vivant n'existe nulle part dans ce dépôt (R2-honnête) — activer un agent dans l'admin ne le fait pas tourner. **L6 — Canaux (`docs/lots/L6-canaux.md`, nouveau paquet `@cogenta/channels`, les 11 tâches faites en intégralité — interface `ChannelAdapter`/registre/format de message abstrait, liaison d'identité par code à usage unique, routage entrant avec la règle de sécurité centrale du lot (« une commande entrante s'exécute avec les permissions de l'humain identifié, jamais avec celles de l'agent ») réellement appliquée et prouvée par test contre l'escalade de permission et l'usurpation d'identité, quatre adaptateurs de canal réellement vivants — Telegram (long-polling), Slack (Socket Mode), Discord (Gateway avec heartbeat), et un webhook générique sortant signé (HMAC-SHA256, fenêtre de fraîcheur, protection contre le rejeu) — file d'approbation actionnable avec jetons à usage unique, formats de message alerte/rapport/notification avec budget-écran imposé, préférences de notification et regroupement (quinze constats → un seul message). Un cinquième canal, l'email, est outbound-only par cadrage explicite du lot. Décision constante sur les quatre canaux temps réel : jamais de webhook entrant public (aucun plan de ce projet n'est déployé publiquement) — long-polling/Socket Mode/Gateway servent tous les trois depuis un process sans point HTTPS public, chacun câblé à la même porte d'autorisation unique, jamais de voie parallèle. Résumé complet dans l'historique git (commits `6f0b7bd`..`f52f97f`).** **L7 — Extensibilité (`docs/lots/L7-extensibilite.md`, nouveau paquet `@cogenta/plugins`, les 14 tâches faites en intégralité — schéma de manifeste et validation, résolution/chargement, worker isolé à deux couches (worker_threads + vm) prouvé contre les quatre vecteurs d'évasion exigés, SDK côté plugin construit dynamiquement selon les capacités accordées avec la propriété « absente, pas refusée », traduction capacités→SDK avec garantie de non-auto-octroi sur mise à jour, limites de temps/mémoire avec désactivation et alerte, écran de permissions en langage clair sans identifiant technique brut, révision et révocation post-installation, signature Ed25519 réelle sans échappatoire, les quatre registres du tableau du lot (skins/skills/thèmes/plugins) chacun avec sa porte propre (automatique / pré-contrôle+revue / signature+contrat / signature+manifeste+revue), documentation d'auteur de plugin (`docs/guide-plugin.md`) et modèle de démarrage réel et testé (`examples/plugin-starter/`). Résumé complet dans l'historique git (commits `835fe81`..`dc6b599`).** 2875 tests unitaires, tous verts (2866 après L7, +9 pour la tâche 1 du L8) (recompté directement paquet par paquet cette session, en sommant chaque `vitest run` isolé — 2503 avant L6 tâche 1, 2513/2529/2545/2564/2587/2609/2628/2640/2663/2685 après les tâches 1 à 10, 2709 après la tâche 11 qui clôt le lot, 2725 après la tâche 1 du L7, 2732 après la tâche 2, 2763 après la tâche 3, 2769 après la tâche 4, 2779 après la tâche 5, 2791 après la tâche 6, 2803 après la tâche 7, 2815 après la tâche 8, 2834 après la tâche 9, 2837 après la tâche 10 — ce recomptage a aussi révélé que `@cogenta/import` avait été omis d'un comptage précédent, corrigé ici — 2845 après la tâche 11). `pnpm test` complet a montré un OOM réel de plusieurs workers Vitest sous parallélisme par défaut (`@cogenta/schema`/`@cogenta/api`/`@cogenta/project-site`, sans rapport avec la nouvelle fixture d'épuisement mémoire de la tâche 6, qui tourne isolée dans `@cogenta/plugins`) — résolu avec `turbo run test --concurrency=4` (29/29 tâches vertes), pas une régression du code. Un timeout du test de compilation TS `@cogenta/schema`'s `test/generated-types-compile.test.ts` (60s dépassées sous contention CPU d'un `pnpm test` complet) a été observé quatre fois cette session, la quatrième pendant L7 tâche 3 (probablement aggravée par les tests utilisant de vrais `worker_threads`, plus lourds en CPU) — reconfirmé non reproductible en isolation à chaque fois (`pnpm -F @cogenta/schema test`, 359/359 verts), même famille de flaky d'environnement déjà documentée pour `@cogenta/seo`. Pendant L6 tâche 7, la même famille de flaky s'est manifestée sous une forme différente — des erreurs de résolution de module (`@vitest/snapshot`, `drizzle-orm/table.js` introuvables) dans `@cogenta/example-getting-started` et `@cogenta/render` sous `pnpm test` complet, toutes deux reconfirmées non reproductibles en isolation (2/2 et 286/286 verts) — vraisemblablement des collisions du store pnpm sous forte parallélisation, pas une vraie régression. Intégration Postgres/MySQL/MariaDB du `MediaStore` écrite mais non exécutée cette session (Docker Desktop indisponible) ; adaptateurs de fournisseurs LLM sans test d'intégration exécuté (nécessite une clé API réelle, `vitest.integration.config.ts` prêt, skip loud si absente). |
| Paquets publiés | `@cogenta/core` (gagne `CHANNEL_UNKNOWN`/`CHANNEL_DUPLICATE`/`CHANNEL_LINK_CODE_INVALID`/`CHANNEL_COMMAND_DUPLICATE`/`CHANNEL_TELEGRAM_API_ERROR`/`CHANNEL_MESSAGE_INVALID`/`CHANNEL_PREFERENCES_INVALID`/`CHANNEL_EMAIL_TRANSPORT_ERROR`/`CHANNEL_EMAIL_INBOUND_UNSUPPORTED`/`CHANNEL_SLACK_API_ERROR`/`CHANNEL_DISCORD_API_ERROR`/`CHANNEL_WEBHOOK_SIGNATURE_INVALID`/`CHANNEL_WEBHOOK_EXPIRED`/`CHANNEL_WEBHOOK_REPLAY_DETECTED`/`CHANNEL_WEBHOOK_DELIVERY_FAILED`/`CHANNEL_WEBHOOK_INBOUND_UNSUPPORTED`/`PLUGIN_MANIFEST_INVALID`/`PLUGIN_SOURCE_NOT_FOUND`/`PLUGIN_MANIFEST_FILE_NOT_FOUND`/`PLUGIN_MANIFEST_LOAD_FAILED`/`PLUGIN_MANIFEST_EXPORT_INVALID`/`PLUGIN_WORKER_TIMEOUT`/`PLUGIN_WORKER_CRASHED`/`PLUGIN_WORKER_RUNTIME_ERROR`/`PLUGIN_CAPABILITY_REFUSED`/`PLUGIN_DISABLED`/`PLUGIN_SIGNATURE_MISSING`/`PLUGIN_SIGNATURE_INVALID`, L6 tâches 1-11 lot complet + L7 tâches 1-9), `@cogenta/plugins` (nouveau paquet, `definePlugin` — schéma de manifeste et validation (tâche 1), `loadPlugin` — résolution et chargement (tâche 2), `runIsolated`/`runIsolatedOrThrow` — worker isolé et protocole de messages (tâche 3), le SDK capacité-par-capacité (`content.read`/`http.fetch`/`storage.read`/`storage.write`) — tâche 4, `PluginGrantStore`/`resolveGrantedCapabilities`/`runPlugin` — traduction capacités → SDK (tâche 5), `PluginDisableStore` — limites de ressources et désactivation (tâche 6), signature Ed25519 réelle via `node:crypto` et vérification obligatoire des plugins de registre (tâche 9), galerie de skins réutilisant `validateSkin` de `@cogenta/render` (tâche 10, nouvelle dépendance réelle vers `@cogenta/render`)), `@cogenta/channels` (interface `ChannelAdapter` + registre + liaison d'identité + routage entrant + adaptateurs Telegram/Slack/Discord/webhook + adaptateur email + file d'approbation + formats de message + préférences/regroupement, L6 tâches 1-11, lot complet), `@cogenta/schema` (gagne `withReadOnlyStore`, L9 tâche 12), `@cogenta/blocks`, `@cogenta/api`, `@cogenta/render`, `@cogenta/seo`, `@cogenta/theme-canonical`, `@cogenta/auth`, `@cogenta/cli` (`doctor`, `migrate`, `users create`, `serve`/`dev` avec option `readOnly`, `import wordpress`, `generate types`, `skin list/validate/apply/generate`), `@cogenta/mcp` (serveur MCP, tâche 17), `@cogenta/agents-builtin` (agents intégrés, L5), `@cogenta/agents` (gagne `generateSkin`, L9 tâche 9, et une dépendance vers `@cogenta/render`), `@cogenta/import` (import WordPress WXR, L9 tâche 6), `create-cogenta` (installeur `npm create cogenta`, L9 tâche 1 ; gagne `resetPlaygroundData` et l'export public de `BLUEPRINT_CONTENT_PACKS`, tâche 12 ; nom non préfixé par convention npm), `@cogenta/fleet` (nouveau paquet, `createEnrollmentStore` — protocole d'appairage, clés, révocation, L8 tâche 1, dépendance réelle vers `@cogenta/plugins`), `@cogenta/admin` (coquille, non publié) |
| Paquets internes non publiés | `@cogenta/project-site` (site du projet, L9 tâche 12, `private: true`, jamais déployé par ce dépôt) |
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
