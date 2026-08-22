# L24 — LangGraph, agents avancés, skills portables, aperçus de thème

Demandé en direct par l'utilisateur le 2026-08-22, en mode autonomie complète
(« continue, je vais sortir »). Cinq chantiers largement indépendants,
chacun développé dans son propre worktree, vérifié isolément avant fusion —
même discipline que L22/L23.

## Contexte de la décision

L22 (tâche 1) avait refusé LangGraph comme moteur d'orchestration d'agents,
au nom de R9 (`@cogenta/agents` avait déjà l'essentiel, une boucle interne
de moins de 300 lignes suffisait). L'utilisateur redemande explicitement
LangGraph pour la maturité et la stabilité à long terme — voir **ADR-0029**
(texte prêt, remis à l'humain pour insertion dans `docs/03-decisions.md`,
fichier protégé en écriture). Recherche factuelle menée avant d'acter :
aucun blocage technique dur (ESM, pas de dépendance native, version 1.x
stable, activement maintenu), coût réel = ~15 paquets transitifs dont
`langsmith` (SDK propriétaire LangChain, jamais utilisé) et une vraie
ré-architecture pour que `withAutonomy` (R4, seule porte de permission)
s'intègre au modèle de graphe plutôt qu'au décorateur actuel.

## Tâche 1 — Migration du runtime d'agents vers LangGraph.js

**Périmètre** : remplacer `createAgentRunner`
(`packages/agents/src/agents/orchestrator.ts`) par une orchestration
LangGraph (`@langchain/langgraph`), sans rien perdre des garanties
actuelles.

**Non négociable** : `withAutonomy` reste l'unique point de décision de
permission — jamais un contrôle à l'intérieur d'un nœud du graphe (R4). Le
contrat C (`buildManifest`/`createToolRegistry`) ne change pas de forme
publique. Les trois niveaux d'autonomie (`report-only`/`co-pilot`/`autopilot`)
et le superagent « Cogenta Agent » actif par défaut continuent de fonctionner
identiquement du point de vue de l'admin.

**Critères d'acceptation** :
- Tous les tests existants de `packages/agents/test/agents/orchestrator.test.ts`
  passent après migration (rejoués tels quels, pas réécrits pour contourner
  un comportement qui a changé).
- Nouveau test explicite : une tentative d'appel d'outil qui contourne
  `withAutonomy` depuis l'intérieur d'un nœud du graphe est refusée — la
  garantie R4 doit être *prouvée* dans la nouvelle architecture, pas
  supposée héritée.
- `pnpm -F @cogenta/agents typecheck` et la suite complète du paquet, verts.
- Changeset décrivant la nouvelle dépendance directe (R9 : justification,
  poids, arbre transitif — déjà documentés dans ADR-0029).
- `deps-auditor` invoqué avant de committer l'ajout de dépendance.

**Piège connu** : `langsmith` est tiré en dépendance transitive
obligatoire sans qu'aucune fonctionnalité de Cogenta ne l'appelle — le
documenter clairement (commentaire dans `package.json` ou le changeset)
pour qu'un futur audit de dépendances ne le prenne pas pour un usage actif
oublié.

## Tâche 2 — Agent « Cogenta Developer »

**Périmètre** : nouvel agent intégré (troisième, aux côtés du superagent
« Cogenta Agent » et des deux agents désactivés par défaut de L22), dédié à
l'extension du CMS lui-même — ajouter des fonctionnalités, modifier le
comportement existant, à la demande de l'utilisateur final du site.

**Ce qu'« ultra détaillé » veut dire ici** : le system prompt doit
connaître, par cœur, l'architecture réelle du projet — pas une description
générique d'un agent codeur. Au minimum :
- Les cinq contrats figés (A schéma, B blocs, C outils, D thème, E
  commerce) et ce que chacun interdit de faire sans RFC/ADR.
- Les 10 règles non négociables (R1-R10) d'`AGENTS.md`, avec des exemples
  concrets de ce qui les viole dans CE code (pas des généralités).
- La structure réelle des paquets (`packages/*`), quel paquet possède quoi,
  et les paquets déjà publiés vs internes.
- La discipline de test du projet (driver dégradé toujours testé, trois
  dialectes SQL, jamais de mock de base de données).
- Le format de commit et la gouvernance documentaire (`docs/03-decisions.md`
  append-only, protégé en écriture).

**Portée d'action** : contrat C (outils), jamais un accès direct à la base
hors du `ContentGateway`/store existants, jamais de contournement de
`withAutonomy`. Doit pouvoir proposer une modification de code réelle
(diff), jamais l'appliquer sans validation humaine explicite au niveau
`autopilot` le plus élevé accordé par l'admin — même politique que les
autres agents intégrés.

**Livrable** : le system prompt lui-même (fichier texte long, dans
`packages/agents/src/agents/builtin/` ou équivalent existant), câblé comme
agent intégré désactivé par défaut (comme les deux de L22), un test qui
vérifie qu'il refuse une action hors de son périmètre déclaré.

## Tâche 3 — Agent « Cogenta Designer »

**Périmètre** : même nature que la tâche 2, mais pour le design — créer et
modifier des thèmes/templates, respecter le contrat D (`RenderContext`,
`SkinTokens`, `ThemeManifest`), les douze blocs du contrat B, zéro
JavaScript client, zéro couleur littérale.

**Ce qu'« ultra détaillé » veut dire ici** : connaître par cœur le contrat D
et le contrat B — quels champs chaque bloc accepte, comment un thème
implémente `renderChrome`, la technique `light-dark()`/`oklch(from…)` déjà
utilisée par les cinq thèmes existants pour un mode sombre « conçu, pas
inversé », et à quoi ressemble un thème déjà livré (`theme-canonical`,
`theme-portfolio`, `theme-magazine`, `theme-ecommerce`, `theme-entreprise`)
comme référence de qualité.

**Livrable** : même structure que la tâche 2 (system prompt + câblage +
test de refus hors périmètre).

## Tâche 4 — Skills portables au format Claude/Codex

**Constat déjà établi** : `packages/agents/src/skills/file-store.ts`
(`SkillStore`, registre marketplace L7) est **déjà** au bon format —
`<dir>/<nom>/SKILL.md` avec frontmatter + corps Markdown, exactement le
format Claude Code/Anthropic. `packages/agents/src/skills/library.ts`
(`AgentSkillStore`, l'écran admin « Compétences » de L22) est en revanche
stocké en JSON pur (`<id>.json`) — c'est ce système-là, le seul exposé à
l'admin au quotidien, qui doit migrer.

**Périmètre** :
1. `frontmatter.ts` : rendre le champ `version` optionnel (un skill
   Claude Code/Codex authentique n'a que `name`+`description` — l'exiger
   casse le copier-coller que l'utilisateur demande explicitement).
2. `library.ts` : remplacer le stockage `<id>.json` par
   `<dir>/<id>/SKILL.md` (réutilisant `parseSkillFile`/`file-store.ts`),
   en conservant `enabledByDefault`/`builtin`/`createdAt`/`updatedAt` soit
   en frontmatter étendu, soit en méta-fichier séparé à côté du
   `SKILL.md` — à trancher en développant, documenter le choix.
3. Mettre à jour les 11 points d'appel identifiés
   (`packages/cli/src/commands/agent-runtime.ts`,
   `packages/api/src/rest/agent-skills-router.ts`,
   `packages/admin/src/routes/agent-skills.tsx`,
   `packages/admin/src/api/agent-skills-client.ts`,
   `packages/create-cogenta/src/scaffold.ts`, les tests associés).
4. Écran admin « Compétences » (`agent-skills.tsx`) : remplacer le
   formulaire structuré par un éditeur de texte brut sur le contenu MD
   complet (le SKILL.md, frontmatter compris) — décision déjà prise par
   l'utilisateur (« c'est mieux directement de taper sur le MD ») — plus un
   bouton d'import de fichier `.md`.

**Critères d'acceptation** : un fichier `SKILL.md` copié tel quel depuis
`.claude/skills/` de ce dépôt (ou tout autre agent standard) s'importe sans
erreur dans l'écran Compétences. Tous les tests existants de
`library.test.ts`/`orchestrator.test.ts` (skills) rejoués et verts.

## Tâche 5 — Aperçu visuel des thèmes (façon WordPress)

**Périmètre** : l'écran Apparence (sélecteur de thème, L23) affiche
aujourd'hui cinq cartes textuelles sans image. Ajouter une vraie capture
d'écran par thème.

**Approche à trancher en développant** (deux options connues, décider et
documenter) :
1. Captures statiques pré-générées (un script qui rend une page de
   démonstration avec chaque thème, capture avec un navigateur headless,
   stocke le PNG résultant) — simple, mais fige un instant, se périme si le
   thème change.
2. Rendu live dans une iframe miniature (réutilise `renderDraftPage`/le
   builder visuel de L16, déjà un iframe sur le vrai rendu serveur) — plus
   fidèle, plus coûteux par affichage.

Le principe déjà acté du projet (« l'aperçu est un iframe sur le vrai rendu
serveur, jamais une réimplémentation ») penche pour l'option 2, mais une
capture statique est nettement plus simple pour cinq thèmes qui changent
rarement — trancher avec un argument, pas par défaut.

**Critère d'acceptation** : l'écran Apparence montre un visuel réel (pas un
placeholder) pour chacun des cinq thèmes installés, mis à jour si le thème
change de version.

## Discipline de fusion

Comme L22/L23 : chaque tâche dans son propre worktree, vérification
indépendante (typecheck + tests réels, jamais en cache) avant et après
fusion dans `main`, jamais une fusion en aveugle. Le disque de la machine
partagée est fragile (voir `BLOCKERS.md` — crise à 0 octet libre résolue en
partie le 2026-08-22, ~4 Go récupérés sur des caches et anciens
verrouillages de vérification de session, le reste hors de portée sans
droits administrateur) : vérifier l'espace disque avant chaque nouveau
worktree, ne pas lancer les cinq tâches en parallèle sans marge.
