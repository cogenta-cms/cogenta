# L26 — Contenu réaliste, mode sombre manuel, atelier de génération de thèmes IA

> Demandé en direct par l'utilisateur après un test des neuf sites scaffoldés de L25,
> en mode full autonomie (mode de travail par défaut du projet). Quatre griefs distincts
> sur le contenu/design des dix thèmes, plus une fonctionnalité neuve jugée « ultra
> importante » par l'utilisateur.

## Périmètre

1. **Contenu insuffisant** — sur toutes les démos, le texte des pages est trop court et
   ne reflète pas un vrai site. Passe de fond sur les neuf blueprints × leurs pages
   réelles (accueil, listes, détail d'entrée, pages statiques) : texte substantiel et
   réaliste, cohérent avec la fiction de marque de chaque blueprint.
2. **Images manquantes** — certaines pages sont trop nues. Complète la couverture
   d'images là où le design de la page l'appelle (réutilise `photo-assets.ts`/
   `demo-art` existants, n'ajoute aucune dépendance).
3. **Défauts de design graves** — contenu non centré, structure cassée sur certains
   thèmes. Audit visuel réel (Playwright, chaque page, desktop + mobile) et correction.
4. **Aucun mode sombre visible** — le CSS tri-état (`:root`, `prefers-color-scheme`,
   `[data-theme="dark"]`) existe déjà dans les dix thèmes depuis L23-L25, mais rien ne
   pose jamais l'attribut : un visiteur n'a aucun moyen de le déclencher manuellement.
   **Fait dans cette session, avant la dispatche parallèle** (fondation partagée,
   bloquant pour les dix thèmes) : `@cogenta/theme-kit` gagne `renderThemeToggle()` +
   `THEME_TOGGLE_SCRIPT` (script minimal, zéro dépendance, seule exception au « zéro JS
   client » de ces thèmes — une bascule manuelle qui survit à une navigation ne peut
   pas exister en CSS seul sans JS ni cookie), câblés dans `theme-canonical` (thème de
   référence) et dans les trois gabarits de page de `cogenta serve`
   (`packages/cli/src/commands/theme-render.ts`). Les neuf autres thèmes reprennent
   l'intégration mécaniquement (un import + un appel dans leur propre `renderChrome`),
   chacun stylant `.cg-theme-toggle` dans son propre registre visuel.
5. **Atelier de génération de thèmes par IA** — nouvel écran admin accessible depuis
   `/admin/appearance`, alimenté par un nouvel agent intégré **Cogenta Theme Creator** :
   - Décrire un thème en texte libre, joindre des fichiers (captures d'écran, aperçus,
     modèles, documents).
   - Générer un ou plusieurs candidats, les prévisualiser réellement (réutilise
     `ThemeGalleryPreview`/`renderThemeGalleryPreview`), puis activer celui choisi via
     les API existantes (aucune application automatique — R6).
   - Personnaliser un thème existant/actif en décrivant le changement voulu (même
     atelier, avec le skin courant comme point de départ).
   - Message R2 honnête et actionnable si aucun fournisseur LLM n'est configuré.
   - L'agent ne génère jamais de HTML/CSS brut (R3) : il choisit un thème de base parmi
     les dix paquets existants et produit des jetons de style contrat D
     (`generateSkinCandidates`, boucle de correction existante) plus, optionnellement,
     des champs `ChromeInput` (`tagline`/`social`/`footerNote`/`headerAction`).

## Décisions actées dans ce lot

- **`ChatMessage` gagne un contenu multimodal** (`@cogenta/agents`, additif — `content`
  reste `string | undefined` pour tout appelant existant, un second constructeur permet
  des blocs texte+image). Implémenté dans les trois adaptateurs réels (`anthropic.ts`,
  `openai.ts`, `google.ts`). Un fournisseur qui ne supporte pas la vision reste utilisable
  : l'agent Theme Creator dégrade explicitement (avertissement dans sa sortie, jamais une
  hallucination de contenu d'image jamais vu).
- **Nouvelle permission contrat C `theme.customize`** (`tools@1.5`, additive, aucune
  signature existante touchée) portant l'outil `theme.propose_theme`
  (`@cogenta/agents-builtin`), `sideEffects: false` — propose, n'applique jamais.
  L'activation reste l'action humaine existante (`PUT /api/theme`, appliquer un skin).
- **Pas de nouveau générateur de code de thème** : contrat D reste des paquets
  TypeScript typés, jamais du HTML/CSS produit par un modèle.

## Ordre de travail

1. (Fait, moi, fondation bloquante) Mode sombre manuel — `theme-kit` + `theme-canonical`
   + `cogenta serve`.
2. (Parallèle, un agent par thème, worktree isolé) Contenu + images + défauts de design +
   câblage du bascule sombre dans les neuf thèmes restants. En parallèle : un agent pour
   le support multimodal des trois adaptateurs de fournisseur.
3. (Après fusion de l'étape 2) Agent Cogenta Theme Creator + outil + routeur API, et
   écran admin de l'atelier — dispatchés ensemble contre un contrat d'API écrit à
   l'avance, fusionnés dans cet ordre (back-end puis front-end).

## Pièges connus (à transmettre aux agents dispatchés)

- `theme-kit` doit être **reconstruit** (`pnpm -F @cogenta/theme-kit build`) après toute
  modification de son `src/` pour que les paquets qui en dépendent (résolus via
  `workspace:*` vers `dist/`) voient le changement — piège déjà rencontré cette session.
- Le test « rendu identique octet pour octet sans les champs `theme@1.4` » de chaque
  thème doit être mis à jour pour inclure le bascule (désormais inconditionnel), jamais
  supprimé.
- Ne pas dupliquer le script : un thème n'écrit jamais lui-même `<script>` — c'est
  `cogenta serve` qui le fait, dans `<head>`, avant la feuille de style.
