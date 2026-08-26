# 42 — Éditeur de texte riche : zone visible et enrichissement

> **État** : bon (Slate, barre d'outils riche depuis fiche 04) — un bug CSS précis
> produit le symptôme signalé, plus deux marques manquantes.
> **Fichiers** : `packages/admin/src/rich-text/rich-text-editor.tsx`,
> `packages/admin/src/styles/rich-text.css`, `toolbar.tsx`, `commands.ts`,
> `portable-text.ts`, `slate-types.ts`
> **Effort** : quelques heures (bug) + 1–2 jours (enrichissement)
> **ADR requise** : non pour les marques ; oui pour un futur bloc tableau

---

## 1. Ce qui existe réellement

Après la fiche 04, l'éditeur est déjà riche : gras/italique/code, titres h2-h4,
citation/listes/bloc de code, lien externe et interne, image inline (glisser-déposer
+ modale), undo/redo visibles, vue source Markdown/HTML, plein écran, compteur de
mots, menu slash (`/`).

**Diagnostic exact du bug « une ligne qui s'agrandit »** :
`packages/admin/src/styles/rich-text.css` ne définit **aucun `min-height`** pour
`.rich-text-editor__surface` en mode normal — la règle `min-height: calc(100vh -
8rem)` (lignes 17-19) ne s'applique qu'en combinaison avec
`.rich-text-editor--fullscreen`. Le `<fieldset className="rich-text-editor__surface …">`
(`rich-text-editor.tsx` ~ligne 314) n'a que du padding Tailwind, et `<Editable>`
lui-même (ligne 336) ne porte aucune classe de hauteur. Résultat : hors plein
écran, la zone d'édition mesure exactement une ligne et grandit uniquement avec le
contenu — confirme exactement le symptôme rapporté.

Manquant vs. barre d'outils actuelle (`toolbar.tsx`, `MARK_BUTTONS`/
`BLOCK_BUTTONS`) : pas de barré, pas de surlignage, pas de tableau, pas de trait
horizontal (confirmé absent de `slate-types.ts`/`portable-text.ts`/`commands.ts`).

## 2. Plan de développement

### Tâche 1 — Corriger la hauteur par défaut

**Fichiers** : `rich-text.css`.

Ajouter un `min-height` par défaut à `.rich-text-editor__surface` hors mode plein
écran (ex. `16rem`, cohérent avec `.rich-text-editor__source-view` qui a déjà
`min-height: 12rem`).

**Critère** : ouvrir un nouvel article, la zone de texte est visible et dimensionnée
avant toute frappe.

### Tâche 2 — Barré et trait horizontal

**Fichiers** : `commands.ts`, `toolbar.tsx`, `portable-text.ts`, `slate-types.ts`,
renderer (`@cogenta/render`/chaque thème).

Ajouter les marques/blocs les plus demandés (barré en marque, trait horizontal en
bloc). Même règle que fiche 04 tâche 1 : **jamais l'éditeur sans le renderer dans
le même commit** — snapshots des thèmes mis à jour.

**Critère** : le texte barré/le trait horizontal saisis dans l'admin apparaissent
identiques sur la page publiée.

### Tâche 3 — Surlignage et tableau (optionnel)

À ne traiter que si explicitement redemandé après la tâche 2 — un tableau reste un
vrai bloc contrat B (RFC nécessaire), déjà signalé comme piège de périmètre par la
fiche 04.

## 3. Critères d'acceptation

- La zone d'édition est visible et dimensionnée dès l'ouverture, sans plein écran.
- Barré et trait horizontal disponibles dans la barre d'outils, rendus à l'identique
  côté public.

## 4. Tests exigés

- Visuel/composant : hauteur de `.rich-text-editor__surface` non nulle sur un
  document vide.
- Snapshot : rendu des thèmes mis à jour pour les nouvelles marques/blocs.
- Bout en bout : texte barré saisi, publié, retrouvé barré sur la page.

## 5. Pièges connus

- Un tableau est un bloc contrat B, pas une marque portable-text — RFC obligatoire,
  hors périmètre de cette fiche tant que non redemandé.

## 6. Décisions à prendre

Aucune pour les tâches 1-2. Tâche 3 (tableau) : ouvrir une RFC contrat B si
confirmée nécessaire.
