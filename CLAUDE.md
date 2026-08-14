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
| Lot en cours | **L5 — Agents** (`docs/lots/L5-agents.md`) — 10 tâches. **Tâches 1-5 faites.** 1 `src/agents/` dans `@cogenta/agents` — `defineAgent` (Contrat C, gèle la déclaration, exige nom + document d'identité non vides), `createAgentRegistry` : charge un ensemble fixe d'`AgentDeclaration`, valide une fois à la construction `subagent.tools ⊆ parent.tools` sur tout l'ensemble (réutilise `validateSubagentTools`, tâche 11 de L4 — une `AgentDeclaration` satisfait déjà structurellement `AgentToolsDeclaration`), donne à chaque agent un `KillSwitch` (tâche 8) dédié et partagé pour son cycle activation/désactivation — `disable()` bascule ce switch, donc « arrête immédiatement, y compris un run en cours » vient gratuitement de tout appel `runAgentLoop` construit avec `registry.killSwitchFor(name)`. Chaque agent démarre activé. L'admin (React) qui pilotera ce registre reste hors de portée de cette tâche — c'est une couche runtime, pas une interface. Deux codes d'erreur `AGENT_DEFINITION_INVALID`/`AGENT_UNKNOWN`. 2 `assertEvalThreshold` (`src/eval/assert-threshold.ts`) : aucune nouvelle infrastructure CI — un throw dans un `it()` fait déjà échouer `pnpm test`, déjà joué par le job `unit` à chaque push/PR. Le jeu d'évaluation d'un agent devient un fichier de test normal (`*.eval.test.ts`) qui appelle cette fonction une fois ; « une régression au-delà d'un seuil échoue la CI » est alors simplement ce qu'un test qui échoue fait déjà. 3 **nouveau paquet `@cogenta/agents-builtin`** — `deps.scan` (`src/security/`) : SBOM (versions résolues, pas les plages de `package.json` — l'appelant résout depuis le lockfile) → `queryOsv` corrèle via `/v1/query` d'OSV.dev, qui fait déjà le filtrage « version installée affectée » lui-même (aucun matching de plage semver réimplémenté ici) → `queryEpss` (FIRST.org) → `assessExploitability` croise CVSS et EPSS (« une CVE 9.8 jamais exploitée est moins urgente qu'une 6.5 activement utilisée » — EPSS élevé prime sur un CVSS élevé mais dormant) → `buildSecurityReport` au format imposé, cinq sections fixes (ce qui est touché / ce qu'un attaquant pourrait faire / si le site est exposé / ce qui est proposé / ce qui se passe si on ne fait rien), texte déterministe par gabarit (la mise en forme narrative finale reste le rôle de l'agent, pas de ce module). Le CVSS est extrait soit d'un score numérique dans `severity[]`, soit d'une bande qualitative (`database_specific.severity`) en repli — aucun parseur de vecteur CVSS complet (hors périmètre, complexité disproportionnée). Outil `deps.scan` lecture seule (`sideEffects:false`) ; `deps.patch` reste à construire (tâche 4). Deux codes d'erreur `SECURITY_OSV_QUERY_FAILED`/`SECURITY_EPSS_QUERY_FAILED`. 4 `deps.patch` : `PrClient` (structurel, comme `ContentServiceLike`/`EmbeddingProvider` — ce module ignore la forme de l'API GitHub, une seule capacité `open`/`close`) ; `bumpDependencyVersion` remplace en place la version dans le fichier de dépendances par une substitution ciblée (pas un aller-retour `JSON.parse`/`stringify` qui écraserait le formatage et rendrait le diff illisible) ; `sideEffects:true, reversible:true`, `revert` ferme la PR sans fusionner — c'est le seul « annuler » sûr d'avoir proposé un changement. « Le correctif est une PR, jamais une modification directe » : `execute` ne touche jamais de branche, il calcule le nouveau contenu et le passe à `PrClient.open`. `securityAgent` (`defineAgent`, tâche 1 de L5) réunit `deps.scan`/`deps.patch` avec l'autonomie par défaut du lot (`deps.scan` autonome, `deps.patch` reste à `propose` en n'apparaissant jamais dans les surcharges). Un code d'erreur `SECURITY_DEPENDENCY_NOT_FOUND`. 5 `src/seo/` — `auditSeoPage` : huit contrôles déterministes (titre, méta description, structure de titres H1-H6 sans saut de niveau, texte alternatif — une image `decorative:true` n'est jamais signalée —, maillage interne, URL canonique, longueur du corps, lisibilité via un score de Flesch calculé sans dépendance — comptage de syllabes heuristique par groupes de voyelles, pas un dictionnaire). Délibérément **pas** exposé comme outil appelable par le modèle : la liste d'outils de l'agent SEO du lot (`content.read`/`content.write_draft`/`http.fetch`/`channel.send`) n'en contient pas — l'audit tourne en pré-traitement déterministe qui alimente le contexte de l'agent, jugement de contrôle qualité fait par du code, pas par un prompt (le critère d'acceptation « pas plus de N faux positifs » l'exige). `seoAgent` (`defineAgent`) ne déclare jamais `content.publish` — structurellement, pas par convention, le runtime ne peut pas accorder ce qui n'a jamais été listé (tâche 4 de L4). JSON-LD, maillage proposé, cannibalisation et AEO/GEO restent à construire (tâche 6). Reste : tâches 6-10 (JSON-LD/AEO-GEO, agents Performance/Contenu, interface d'administration, priorités 2-3) — noter que les critères d'acceptation du lot (site de production un mois sans incident, etc.) dépassent ce qu'une session peut valider seule. |
| Lots terminés | L0 (socle), L1 (contenu), L3 (rendu), L2 (admin, 16/16 tâches), **L4 (runtime agentique, 21/21 tâches)**. 2311 tests unitaires, tous verts (intégration Postgres/MySQL/MariaDB du `MediaStore` écrite mais non exécutée cette session — Docker Desktop indisponible dans l'environnement ; les adaptateurs de fournisseurs LLM n'ont pas non plus de test d'intégration exécuté — nécessite une clé API réelle, `vitest.integration.config.ts` prêt, skip loud si absente). |
| Paquets publiés | `@cogenta/core`, `@cogenta/schema`, `@cogenta/blocks`, `@cogenta/api`, `@cogenta/render`, `@cogenta/seo`, `@cogenta/theme-canonical`, `@cogenta/auth`, `@cogenta/cli` (`doctor`, `migrate`, `users create`, `serve`), `@cogenta/mcp` (serveur MCP, tâche 17), `@cogenta/agents-builtin` (agents intégrés, L5), `@cogenta/admin` (coquille, non publié) |
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
