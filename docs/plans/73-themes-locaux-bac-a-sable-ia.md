# 73 — Thèmes en dossier local, bac à sable isolé, génération par IA

> **État** : conception validée en direct avec l'utilisateur (2026-09-07), après un
> aller-retour de clarification en plusieurs tours — rien ci-dessous n'est une
> proposition ouverte, c'est ce qui a été tranché. Prêt à découper en tâches.
> **Origine** : un bug remonté en session (une image de référence n'influençait pas
> le thème généré) a mené à corriger deux défauts réels côté génération (voir
> l'historique git de cette session), mais a aussi fait resurgir une demande produit
> plus ancienne, jamais honorée : « je veux qu'on puisse générer des thèmes avec
> l'IA », qui se heurte de plein fouet au fait que `cogenta serve` ne connaît que les
> thèmes empaquetés dans `@cogenta/cli` lui-même. Cette fiche corrige ce verrou.
> **Fichiers principaux** : `packages/cli/src/commands/theme-registry.ts`,
> `packages/render/src/theme/{load-theme,verify/*}.ts`, `packages/plugins/src/host/worker-runner.ts`,
> `packages/agents-builtin/src/theme-creator/*`, nouveau `packages/cli/src/commands/theme-sandbox.ts`
> **ADR/RFC requise** : **oui, une ADR** (pas une RFC de contrat — aucun contrat A/B/C/D
> ne change de forme, seulement *où* un thème est cherché et *comment* son code est
> exécuté avant d'être fiable). Texte à rédiger, remis à l'humain pour insertion
> (`docs/03-decisions.md` protégé en écriture).

---

## 1. Ce qui existe réellement

Vérifié dans le code, pas supposé :

- **`packages/cli/src/commands/theme-registry.ts`** (`BUILTIN_THEMES`) — la liste des
  thèmes qu'un `cogenta serve` peut activer est **figée aux dépendances npm de
  `@cogenta/cli` lui-même**, avec un commentaire explicite : « jamais un scan du
  système de fichiers ». C'est le verrou réel.
- **`packages/render/src/theme/load-theme.ts`** (`loadTheme`) — un chargeur
  **générique existe déjà**, et cherche justement dans `['node_modules', 'themes',
  'packages', '.']` — **`themes/` est déjà dans son chemin de résolution**. Ce
  chargeur n'est simplement jamais appelé par `cogenta serve` en production ; il sert
  aujourd'hui à `cogenta theme install`/la validation, pas au serveur HTTP réel.
- **`packages/render/src/theme/verify/verify-theme.ts`** (`verifyTheme`/`inspectTheme`) —
  un **vrai scan statique** existe déjà : imports interdits (`node:fs`, base de
  données, `require` CommonJS, `import()` dynamique illisible statiquement), et une
  vérification des alias de `package.json` (`imports`/`dependencies`) qui
  renommeraient un module interdit pour passer sous le radar. Refuse un thème qui ne
  déclare pas les douze blocs du vocabulaire (`implements`). C'est déjà, concrètement,
  le « scanne » que l'utilisateur demandait — pas à construire, à **réutiliser**.
- **`packages/blocks/src/registry.ts`** (`BlockRegistry.resolveRenderable`) — un bloc
  propre à un thème, avec repli, est déjà résolu **côté rendu** (fiche 43,
  sous-chantier C(ii), terminé) — non directement utile ici, mais confirme que le
  mécanisme d'extension de vocabulaire par thème est déjà réel.
- **`packages/agents-builtin/src/developer/patch-tool.ts`** (`code.propose_patch`) —
  un agent sait déjà écrire du contenu de fichier complet et le proposer via une vraie
  pull request, jamais un commit direct, révocable (`revert` ferme la PR). Le
  mécanisme d'écriture supervisée existe ; il visait jusqu'ici seulement ce monorepo
  (un `PrClient` pointé sur un dépôt GitHub précis) — inutilisable tel quel pour un
  site client qui n'a pas de dépôt Cogenta.
- **`packages/plugins/src/host/worker-runner.ts`** (`runIsolated`/`runPlugin`) —
  l'isolation `worker_threads` + `vm` pour du code tiers non audité existe déjà, avec
  un SDK à capacités accordées une par une. Construite pour de la **logique**
  (`content.read`, `http.fetch`, `storage.*`), jamais pour produire un arbre de rendu
  HTML — c'est la seule vraie inconnue technique de cette fiche (§ 6, piège n°1).
- **`packages/plugins/src/registries/themes.ts`** — un registre de **soumission** de
  thèmes tiers (signature Ed25519 + `verifyTheme`) existe pour une place de marché,
  mais n'est branché nulle part sur la résolution de thème que `cogenta serve` utilise
  réellement — encore un mécanisme à moitié câblé, comme `BlockRegistry` l'était avant
  la fiche 43.
- **`packages/cli/src/commands/serve.ts`** (`loadSchemaModule`) — le précédent qui
  prouve que le principe « le projet du site porte son propre code, chargé
  dynamiquement au démarrage » existe déjà et fonctionne : `cogenta.schema.ts` est un
  `await import()` sur un fichier du projet, pas une dépendance npm.

**Conclusion honnête** : il ne s'agit pas de construire ce mécanisme depuis zéro. Il
s'agit de **brancher** trois pièces déjà écrites (`loadTheme`, `verifyTheme`,
`runIsolated`) sur le chemin que `cogenta serve` utilise réellement, et d'ajouter ce
qui manque authentiquement : un bac à sable de développement/aperçu, un pipeline de
déploiement avec versions, et un agent qui écrit dans ce bac à sable plutôt que dans
ce dépôt-ci.

## 2. Ce que font WordPress et les autres, et ce qu'on en garde

**WordPress** : un dossier = un thème, activé sans aucune vérification de contenu —
c'est ce qui en a fait la cible n°1 de compromissions du web via des thèmes/plugins
tiers pendant deux décennies. On **copie le geste** (dossier scanné, structure simple,
copier-coller possible) et on **refuse d'en copier l'absence de contrôle**.

**Strapi** : ne rend rien lui-même — le frontend est un projet séparé qui consomme
l'API. Aucune notion de « thème exécuté par le CMS », donc aucune leçon de sécurité
directement transposable ici (le problème ne se pose pas chez eux).

**Conclusion** : le geste WordPress (dossier, structure simple, copier-coller) plus la
discipline déjà actée ailleurs dans Cogenta pour le code non audité (scan statique +
isolation d'exécution + geste humain explicite avant tout effet visible).

## 3. Design validé

### 3.1 Structure d'un thème (indépendante de l'IA)

Un thème est un dossier contenant :
- `theme.config.{js,mjs,ts}` — le manifeste (`ThemeManifest`, déjà défini,
  `packages/render/src/theme/manifest.ts`), inchangé.
- Un module exportant `renderPage`/`renderChrome` (et optionnellement
  `renderTermArchive`) au sens de `ThemeModule` (déjà défini,
  `packages/cli/src/commands/theme-registry.ts`), inchangé.

**Aucune nouvelle forme à inventer.** Le travail de cette section est de
**documenter** cette structure dans un guide autonome (`docs/guide-theme.md`, sur le
modèle de `docs/guide-plugin.md` déjà existant pour les extensions) : un développeur
qui n'utilise jamais l'IA doit pouvoir écrire un thème rien qu'en lisant ce guide, et
le copier-coller dans `themes/`.

### 3.2 Dossier `themes/` scanné, à la racine du projet du site

- `cogenta serve` cherche un thème d'abord dans `BUILTIN_THEMES` (inchangé,
  rétrocompatible à l'octet — rien ne casse pour un site existant), puis dans
  `<projectRoot>/themes/<nom>` via `loadTheme` (déjà écrit, § 1).
- Un dossier dont la structure ne respecte pas le contrat (manifeste absent, exports
  manquants) produit une **erreur affichée**, jamais un thème silencieusement ignoré
  ou un serveur qui refuse de démarrer pour un thème que personne n'a demandé
  d'activer — seul le thème réellement sélectionné doit bloquer au démarrage/à
  l'activation.

### 3.3 Bac à sable — jamais `themes/` directement

- **Nouveau thème** : dossier de travail vide, par exemple
  `<projectRoot>/.cogenta/theme-sandbox/<id>/`.
- **Personnaliser un thème existant** : ce même genre de dossier, mais **cloné**
  depuis `themes/<nom>/` — la version installée n'est jamais touchée pendant le
  travail.
- **Édition** : externe (IDE du développeur, ou l'agent qui écrit des fichiers via un
  nouvel outil contrat C) — **pas d'éditeur de fichiers dans l'admin pour cette
  fiche**, tranché explicitement par l'utilisateur.
- **Aperçu en direct** : une route admin (`GET /admin/theme-sandbox/<id>`, backée par
  une nouvelle route API) déclenche un rendu **à travers le code du bac à sable**,
  exécuté dans un worker isolé (`runIsolated`, adapté — § 6, piège n°1), jamais dans
  le processus `cogenta serve` principal. Chaque appel relit le dossier tel qu'il est
  au moment de l'appel — pas de démon de rechargement à construire, la simplicité
  vient du fait qu'un aperçu est une action explicite (clic), pas un flux continu.

### 3.4 Déployer

Un bouton explicite, jamais automatique, qui exécute dans l'ordre :

1. **Scan de structure** — le manifeste et les exports requis sont bien là
   (réutilise `verifyTheme`/`inspectTheme`, § 1 — déjà écrit).
2. **Scan de sécurité** — imports interdits, alias de `package.json` (même fonction,
   même appel).
3. **Avertissements affichés** — jamais avalés silencieusement, jamais un blocage dur
   si ce ne sont que des avertissements (à distinguer des vrais refus — voir la
   distinction déjà actée dans `verifyTheme` entre `THEME_IMPORT_FORBIDDEN`, un
   refus, et un avertissement).
4. **Confirmation humaine explicite.**
5. **Copie** du bac à sable vers `themes/<nom>/` — l'ancienne version, si elle
   existait, est gardée à côté, horodatée (§ 3.5).
6. Le thème est maintenant **installé et activable** — l'activation reste un geste
   séparé, exactement comme aujourd'hui pour un candidat de skin généré (R6 : l'agent
   — ou le bac à sable — propose, l'humain applique).

### 3.5 Versions

Une copie horodatée du dossier précédent à chaque déploiement (pas de base de
données nécessaire pour le contenu du thème lui-même — un thème est du texte de
code, un système de fichiers suffit) :
`themes/.versions/<nom>/<horodatage>/`. Un écran liste les versions passées d'un
thème avec un bouton « restaurer » qui recopie une ancienne version par-dessus
`themes/<nom>/` — même geste conceptuel que le retour arrière déjà existant pour les
mises à jour de flotte (`@cogenta/fleet`, L8), pas un nouveau concept à inventer.

### 3.6 Génération par IA

- Le system prompt de l'agent « Cogenta Theme Creator » reste **visible et
  personnalisable par l'utilisateur** (déjà le cas pour tout agent — Prompt
  Settings, fiche 45) — tranché explicitement : l'utilisateur veut pouvoir
  l'ajuster s'il le souhaite.
- Quand une génération de thème démarre, le prompt **assemblé pour cet appel précis**
  reçoit en plus, de façon invisible pour l'utilisateur : la structure de thème
  complète (§ 3.1), les blocs du vocabulaire à implémenter, les règles R3/R5 (pas de
  HTML/CSS stocké dans le contenu — un thème, lui, EST du code, la limite ne porte
  que sur le contrat A/B ; pas d'accès filesystem/base de données), et le chemin
  exact du bac à sable où écrire.
- Nouvel outil contrat C, `theme.write_sandbox_file` (nom provisoire) — même forme
  que `code.propose_patch` mais écrit dans le dossier du bac à sable **du site**,
  jamais une PR sur ce monorepo. `sideEffects: true`, `reversible: true` (supprimer
  le fichier), jamais `theme.propose_theme`'s `sideEffects: false` — écrire un
  fichier est un vrai effet, contrairement à proposer des jetons.

### 3.7 Export / import

- **Export** : zip du dossier d'un thème (`themes/<nom>/`), téléchargé depuis
  l'admin.
- **Import** : zip déposé depuis l'admin, décompressé dans `themes/<nom>/` **après**
  le même pipeline de scan que le déploiement (§ 3.4) — un import n'est jamais un
  raccourci qui contourne la vérification.

## 4. Découpage en tâches (ordonné, chaque tâche livrable seule)

| # | Tâche | Dépend de | Fichiers principaux |
|---|---|---|---|
| 1 | Brancher `loadTheme`/`verifyTheme` sur `theme-registry.ts` — un thème dans `themes/` devient activable, structure invalide = erreur affichée | — | `theme-registry.ts`, `theme-render.ts` |
| 2 | Guide `docs/guide-theme.md` — structure documentée, indépendante de l'IA | 1 (pour être vérifiable en le suivant) | `docs/guide-theme.md` |
| 3 | Adapter `runIsolated` pour produire un arbre de rendu sérialisable à travers la frontière du worker | — (parallélisable avec 1-2) | `packages/plugins/src/host/worker-runner.ts` |
| 4 | Bac à sable : clonage, route d'aperçu isolée | 1, 3 | nouveau `theme-sandbox.ts`, route API |
| 5 | Pipeline de déploiement : scan + avertissements + confirmation + copie | 1, 4 | `theme-sandbox.ts` |
| 6 | Versions : copie horodatée + écran de restauration | 5 | `theme-sandbox.ts`, écran admin |
| 7 | Outil agent `theme.write_sandbox_file` + prompt assemblé (structure injectée) | 4 | `packages/agents-builtin/src/theme-creator/*` |
| 8 | Export / import zip | 1 (5 pour que l'import passe par le même scan) | route API, écran admin |

Les tâches 1-3 sont la fondation et peuvent démarrer en parallèle (aucun fichier
partagé). Rien avant la tâche 7 ne dépend de l'agent IA — un développeur peut
utiliser tout le mécanisme (dossier, bac à sable, déploiement, versions,
export/import) sans jamais invoquer l'IA, exactement la garantie demandée.

## 5. Critères d'acceptation

- Un thème valide copié-collé dans `themes/mon-theme/` est activable depuis l'admin,
  sans avoir jamais invoqué l'IA.
- Un thème dont la structure est invalide (manifeste absent, export manquant)
  affiche une erreur nommée, jamais un plantage silencieux ni un serveur qui refuse
  de démarrer pour un thème que personne n'a activé.
- Un aperçu de bac à sable s'exécute dans un processus isolé, jamais dans
  `cogenta serve` lui-même — prouvé par un test qui fait planter/boucler le code du
  bac à sable et vérifie que le serveur principal continue de répondre.
- Le pipeline de déploiement refuse un thème qui importe `node:fs` ou une base de
  données, avec le message exact que `verifyTheme` produit déjà.
- Une version précédente se restaure et redonne, à l'octet, le comportement de rendu
  d'avant le dernier déploiement.
- L'agent Theme Creator, en génération, écrit uniquement dans le bac à sable — jamais
  directement dans `themes/`, prouvé par un test qui vérifie qu'aucune écriture ne
  touche ce dossier avant un déploiement explicite.
- Export puis import du même thème produit un dossier identique, testé aller-retour.

## 6. Pièges connus

1. **Le SDK de `runIsolated` n'a jamais eu à faire traverser un arbre `HtmlElement`
   la frontière du worker.** C'est la seule vraie inconnue technique de cette fiche —
   tout le reste est du branchage de code existant. À chiffrer en premier (tâche 3)
   avant d'estimer le reste.
2. **Windows et les liens symboliques/jonctions** — le clonage du bac à sable doit
   copier réellement les fichiers, jamais un lien, pour rester cohérent entre
   plateformes (cette session tourne sur Windows — vérifié pertinent, pas théorique).
3. **Zip-slip à l'import** — un chemin dans l'archive du type `../../themes/autre/`
   doit être refusé explicitement, pas seulement filtré par accident.
4. **Collision de nom avec `BUILTIN_THEMES`** — un dossier `themes/theme-canonical/`
   ne doit jamais prendre le pas silencieusement sur le paquet npm du même nom ; à
   trancher explicitement (priorité, ou refus avec message).
5. **Un site dont `activeTheme` nomme un thème de `themes/` qui a disparu** doit se
   comporter comme le fait déjà un thème npm manquant aujourd'hui (repli sur
   `theme-canonical`, jamais un crash) — même logique, pas une nouvelle branche à
   inventer.
6. **`verifyTheme` accepte déjà des avertissements vs des refus** — bien garder cette
   distinction dans l'affichage du pipeline de déploiement plutôt que de tout
   remonter comme bloquant.

## 7. Tests exigés

- Suite de contrat identique aux trois dialectes **si** les métadonnées de version
  (qui a déployé, quand) finissent en base plutôt qu'en simple horodatage de nom de
  dossier — à trancher pendant la tâche 6 ; sinon, aucune donnée relationnelle
  nouvelle, pas de test multi-base requis.
- Test réel d'isolation (tâche 3/4) : le bac à sable ne doit avoir ni accès
  filesystem hors de son propre dossier, ni accès réseau, ni accès aux variables
  d'environnement du process hôte — même suite adversariale que celle déjà écrite
  pour les plugins (`@cogenta/plugins`), rejouée contre le rendu de thème.
- Test de fidélité : un thème déployé depuis le bac à sable rend une page identique,
  à l'octet, à ce que son aperçu montrait juste avant le déploiement.

## 8. Décisions actées (2026-09-07, en direct avec l'utilisateur)

- Bac à sable appliqué **uniformément** à tout thème, qu'il soit écrit par l'IA ou
  copié-collé par un développeur — pas de distinction thème « de confiance » / « pas
  de confiance », impossible à faire respecter en pratique.
- Génération par IA : écrit dans le bac à sable, jamais directement dans `themes/`.
- Personnaliser un thème existant : on **clone** ce thème dans le bac à sable, jamais
  d'édition en place du thème actif.
- Pas d'éditeur de fichiers dans l'admin pour cette fiche — l'édition se fait hors de
  Cogenta (IDE, ou l'agent). Réévaluable plus tard, pas fermé définitivement.
- Versions : copie horodatée, restauration en un geste — pas de mécanisme plus
  élaboré (diff, branches) demandé.
- Export/import : zip via l'admin, confirmé.
- Le system prompt de génération reste visible et personnalisable par l'utilisateur.

## 9. Ce que cette fiche ne couvre pas

- **Un éditeur de fichiers dans l'admin** — explicitement écarté pour l'instant
  (§ 8).
- **Un vrai marketplace de thèmes tiers** — `packages/plugins/src/registries/themes.ts`
  existe déjà pour ça (soumission signée) mais son branchage sur la résolution réelle
  de `cogenta serve` est un sujet séparé, non traité ici.
- **L'imbrication de blocs / un constructeur de mise en page en colonnes libres** —
  toujours hors contrat B (fiche 43), cette fiche ne le rouvre pas : elle résout le
  problème par un autre axe (le thème entier est du code, pas par un vocabulaire de
  blocs plus riche).
