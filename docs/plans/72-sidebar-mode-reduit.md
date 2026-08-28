# 72 — Sidebar : mode réduit réellement utilisable

> **État** : bug réel, capturé par l'utilisateur en écran. **Le jeu d'icônes existe
> déjà** (`packages/admin/src/ui/icons.tsx`, 60+ glyphes, déjà câblés sur chaque lien
> individuel via `iconFor()`) — ce n'est donc pas un travail de conception d'icônes
> à zéro, mais deux bugs concrets plus une décision d'UX pour le mode réduit.
> **Fichiers** : `packages/admin/src/shell/app-shell.tsx`,
> `packages/admin/src/styles/shell.css`
> **Effort** : 1–2 jours
> **ADR requise** : non

---

## 1. Les deux bugs, précisément localisés

**Bug 1 — le texte d'en-tête de groupe ne se masque jamais.** Le CSS masque
visuellement le texte d'un lien en mode réduit via
`.app-shell--sidebar-collapsed .app-shell__sidebar a span { ...clip... }`, et le
JSX enveloppe bien chaque libellé de lien dans un `<span>` (`app-shell.tsx` ligne
435) — ça marche pour les liens. Mais l'en-tête de groupe (`<summary>`) écrit son
texte directement, sans `<span>` : `<summary className="app-shell__nav-group-summary">
{t(group.labelKey)}</summary>` (ligne 418). Le sélecteur CSS
`.app-shell__nav-group-summary span` ne matche donc jamais rien, et le texte
(CONTENU, APPARENCE, BOUTIQUE…) reste visible en toutes lettres — exactement ce que
montre la capture d'écran.

**Bug 2 — le mode réduit cache la seule chose qui devrait rester visible.**
`.app-shell--sidebar-collapsed .app-shell__nav-group > ul { display: none }` masque
la liste entière des liens (et donc leurs icônes, déjà présentes et déjà câblées)
dès que la sidebar est réduite. Résultat : le mode « réduit » n'affiche ni icônes ni
liens cliquables — seulement des en-têtes de groupe en texte plein, strictement
inutilisables pour naviguer.

## 2. Décision de conception pour le mode réduit

Un mode réduit qui garde l'accordéon par groupe n'a pas de sens : une icône seule
ne peut pas porter à la fois « ceci est un groupe » et « ceci est replié ». Les CMS
et outils qui ont un mode icônes-seules (Notion, Linear, l'admin WordPress récent)
aplatissent la liste en mode réduit : plus de groupes, une colonne unique d'icônes,
chacune avec un `title` (info-bulle) donnant le nom complet au survol.

**Retenu** : en mode réduit, chaque groupe garde son `<details>` (accessibilité,
état interne inchangé) mais son contenu (`<ul>`) reste **toujours visible**, jamais
`display: none` — seul le chevron et le texte d'en-tête disparaissent. Une fine
ligne de séparation remplace visuellement la frontière entre groupes (déjà présente
via `border-bottom` sur `.app-shell__nav-group`, juste à garder active en mode
réduit). Chaque lien porte déjà son icône ; lui ajouter un `title={t(item.labelKey)}`
donne l'info-bulle native du navigateur sans code JS supplémentaire.

## 3. Plan de développement

**Tâche 1 — corriger le bug 1** : envelopper le texte du `<summary>` dans un
`<span>`, comme les liens le font déjà. Une ligne.

**Tâche 2 — corriger le bug 2** : retirer la règle
`.app-shell--sidebar-collapsed .app-shell__nav-group > ul { display: none }` ;
garder `.app-shell__nav-group-summary::before { display: none }` (le chevron n'a
plus de sens sans texte à côté). Vérifier que `<details open>` par défaut n'a plus
d'incidence visuelle en mode réduit puisque le contenu est désormais toujours
affiché — l'état ouvert/fermé mémorisé par groupe (`groupOpen`) devient sans effet
visuel en mode réduit, ce qui est le comportement voulu, pas un oubli.

**Tâche 3 — info-bulles** : `title={t(item.labelKey)}` sur chaque `NavLink`
existant — déjà quasiment gratuit, l'essentiel du travail est le texte déjà là via
`t()`.

**Tâche 4 — repositionner le bouton de réduction** : le bouton actuel
(`.app-shell__collapse-toggle`, 1.75rem, aligné en bas à droite de la sidebar) est
difficile à repérer. Le déplacer en bouton flottant à cheval sur la bordure droite
de la sidebar, centré verticalement (`position: absolute`, `right: -0.875rem`,
`top: 50%`), avec la même icône `»`/`«` déjà en place — pattern déjà standard
(VS Code, Notion), aucune nouvelle dépendance.

**Tâche 5 — cohérence avec le tiroir mobile** : `app-shell.tsx` réutilise le même
JSX pour le tiroir mobile (labels toujours visibles, jamais réduit) — vérifier que
les tâches 1-3 ne cassent pas ce second rendu (le composant est partagé, seul l'état
`sidebarCollapsed` change l'apparence).

## 4. Critères d'acceptation

- Sidebar réduite : uniquement des icônes visibles, aucun texte (ni lien, ni en-tête
  de groupe).
- Chaque icône reste cliquable et mène à la bonne page.
- Survoler une icône affiche son nom complet en info-bulle.
- Le bouton de réduction/agrandissement est visible sans avoir à faire défiler la
  sidebar.
- Le tiroir mobile (viewport étroit) n'est pas affecté — labels toujours visibles là.

## 5. Tests exigés

- Test existant `app-shell.test.tsx` étendu : activer le mode réduit, vérifier
  qu'aucun texte de lien ni d'en-tête de groupe n'est visible (`getByText` doit
  échouer), que chaque lien reste présent et cliquable (`getByRole('link')`), et
  que le `title` de chaque lien correspond au libellé attendu.
- Non-régression : le tiroir mobile garde ses labels visibles quel que soit l'état
  `sidebarCollapsed`.

## 6. Pièges connus

- **Ne pas retirer `<details>`** — la structure d'accordéon doit rester pour le mode
  normal (élargi) et pour l'accessibilité ; seul son effet visuel change en mode
  réduit.
- **Le `title` HTML natif n'est pas accessible au clavier/lecteur d'écran de la même
  façon qu'un `aria-label`** — ajouter les deux (`title` pour la souris,
  `aria-label` déjà porté par le texte du `<span>` visuellement cliqué reste dans le
  DOM, donc déjà couvert).
