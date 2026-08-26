# 44 — Éditeur d'entrée : extrait et génération IA

> **État** : `excerpt` est un champ texte ordinaire par blueprint (pas contrat A),
> déjà affiché **avant** le corps du texte. L'outil IA nécessaire existe déjà
> (`assist.summarise`), et le motif « générer un champ depuis le texte de l'entrée »
> est déjà écrit une fois (panneau SEO) — à répliquer, pas à réinventer.
> **Fichiers** : `packages/admin/src/collections/entry-form.tsx`,
> `packages/create-cogenta/src/blueprints/blog.ts`, `packages/admin/src/seo/seo-panel.tsx`,
> `packages/admin/src/rich-text/word-count.ts`
> **Effort** : 1–1,5 jour
> **ADR requise** : non

---

## 1. Ce qui existe réellement

`excerpt` n'est **pas** un champ standard du contrat A — champ ad hoc déclaré par
blueprint (`blueprints/blog.ts` ligne 68 : `excerpt: f.text({ max: 300, multiline:
true })`), comme n'importe quel autre champ texte. `entry-form.tsx` fait
`collection.fields.map()` sans placement spécial : dans `blog.ts`, l'ordre déclaré
est `title → slug → excerpt → body` — **l'extrait s'affiche donc avant le corps**,
confirmant la demande utilisateur.

Aucun défaut auto-rempli n'existe : le champ part vide.

Outil IA réutilisable, contrat C figé, aucun nouveau tool nécessaire :
`assist.summarise` (`packages/agents/src/assist/toolset.ts` lignes 178-216),
`sideEffects: false`, entrée `{ text, maxWords?, locale? }`, sortie `Suggestion`.

**Précédent directement réutilisable** : `packages/admin/src/seo/seo-panel.tsx`
(~lignes 182-199) fait déjà exactement ce motif avec `assist.meta_description` :
bouton → `runAssistTool(token, 'assist.meta_description', { text: entryText, title })`
→ suggestion appliquée au champ.

`entryText` (texte agrégé des champs `kind === 'text'`, calculé dans
`entry-edit.tsx` ~ligne 1045) **exclut les champs `richText`** — `body` (un
`f.richText`) n'y entre donc pas aujourd'hui. Un extracteur de texte brut
portable-text existe déjà mais n'est pas exporté :
`packages/admin/src/rich-text/word-count.ts`, fonction interne `textOf(document)`
(lignes 16-25).

## 2. Plan de développement

### Tâche 1 — Déplacer l'extrait après le corps

**Fichiers** : `entry-form.tsx` (ou l'ordre déclaré par blueprint, à trancher en
codant — ne pas toucher le contrat A dans les deux cas).

**Critère** : dans le formulaire d'édition d'un article, le champ extrait s'affiche
après le champ corps de texte.

### Tâche 2 — Défaut auto-rempli

**Fichiers** : `word-count.ts` (exporter `textOf`/équivalent), `entry-form.tsx`.

Au premier rendu, si `excerpt` est vide, le préremplir avec le début du texte de
`body` (tronqué à la limite du champ, coupé sur un mot).

**Critère** : un article dont l'extrait n'a jamais été modifié affiche le début de
son texte comme extrait, sans action de l'auteur.

### Tâche 3 — Bouton « Générer l'extrait avec l'IA »

**Fichiers** : nouveau composant à côté du champ `excerpt`, calquant `seo-panel.tsx`.

Appelle `runAssistTool(token, 'assist.summarise', { text: <texte brut de body>,
maxWords: ~50 })`, affiche la suggestion, applique au clic. Absent sans fournisseur
IA (R2, déjà garanti par `createAssistToolset`).

**Critère** : le bouton propose un résumé fidèle du corps du texte, jamais appliqué
sans clic explicite.

## 3. Critères d'acceptation

- L'extrait s'affiche après le corps dans le formulaire.
- Un article sans extrait saisi en propose un dérivé du début du texte.
- Le bouton IA génère une suggestion à partir du texte réel de l'entrée, jamais
  appliquée automatiquement.
- Sans fournisseur IA configuré, le bouton disparaît, rien d'autre ne change.

## 4. Tests exigés

- Composant : ordre de rendu des champs `excerpt`/`body`.
- Unitaire : défaut auto-rempli tronqué proprement sur un mot.
- Bout en bout : bouton IA avec un faux fournisseur, suggestion affichée puis
  appliquée sur clic.
- R2 : le formulaire reste identique sans fournisseur configuré.

## 5. Pièges connus

- Ne pas dupliquer la logique de résumé déjà écrite dans `seo-panel.tsx` — factoriser
  si un troisième usage apparaît (règle AGENTS.md : pas d'abstraction avant trois
  usages réels), sinon dupliquer sobrement une seconde fois reste acceptable.
- `entryText` exclut aujourd'hui les champs `richText` — la tâche 2/3 doit lire le
  texte de `body` par son propre chemin, pas supposer qu'il est déjà dans
  `entryText`.

## 6. Décisions à prendre

Le bouton vit-il dans l'`AssistantPanel` générique (étendre son périmètre aux
champs `text` avec une source croisée) ou en composant dédié à côté du champ
extrait (plus proche du motif SEO, moins de nouvelle abstraction) — recommandation :
composant dédié, cohérent avec AGENTS.md.
