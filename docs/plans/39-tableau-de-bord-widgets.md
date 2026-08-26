# 39 — Tableau de bord : widgets déplaçables et panneau de paramétrage

> **État** : partiel — le glisser-déposer et l'activation/désactivation de widgets
> **existent déjà** (fiche 22), mais dans une forme que l'utilisateur ne retrouve
> pas : repliés dans un `<details>` texte, jamais sur les cartes elles-mêmes.
> **Écrans** : `packages/admin/src/routes/dashboard.tsx` (986 lignes),
> `packages/admin/src/lib/dashboard-prefs.ts`
> **Effort** : 1,5–2 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Le contrôle de personnalisation est un `<details><summary>{t('dashboard.customize')}</summary>`
(ligne 886) — texte seul « Personnaliser ce tableau de bord », replié par défaut,
sans icône. Rien à l'écran ne signale sa présence à quelqu'un qui cherche une icône
dédiée.

La grille réelle des widgets (lignes 977-983, `visibleWidgetIds.map(...)`) **n'a
aucun gestionnaire de glisser-déposer**. Le drag-and-drop réel (`draggable`,
`onDragStart`/`onDragOver`/`onDrop`, lignes 893-933) n'existe que sur une **liste
proxy** à l'intérieur du panneau replié — une ligne de texte par widget, jamais un
aperçu de la carte réelle — accompagnée de boutons « monter »/« descendre »/« retirer »
(redondance volontaire, même règle que le page builder en L16 : rien ne s'obtient
uniquement en glissant).

Activer/désactiver un widget se fait dans ce même panneau replié (liste « widgets
disponibles » + bouton « ajouter »), jamais sur un écran séparé.

Persistance : `localStorage` (`cogenta.dashboard.widgets.v1`), par personne/
navigateur, avec repli propre si le stockage est refusé.

Huit widgets connus : `summary`, `health`, `activity`, `analytics`, `scheduled`,
`todo`, `shortcuts`, `backups`.

**Diagnostic** : ce n'est pas une fonctionnalité absente mais mal exposée. Le retour
utilisateur (« cliquer et déplacer les widgets », « une icône qui affiche une page
pour paramétrer, activer, désactiver ») décrit exactement l'écart entre ce qui existe
(glisser une ligne de texte dans un menu replié) et ce qui est attendu (glisser la
carte elle-même ; une icône visible ouvrant un vrai espace de configuration).

## 2. Ce que font les CMS de référence

WordPress : widgets du tableau de bord déplaçables directement par leur en-tête
(poignée = tout le titre de la boîte), un menu « Options de l'écran » en haut à
droite pour cocher/décocher ce qui s'affiche — pas d'écran séparé, un panneau
déroulant en place.

## 3. Écarts, classés

**Important** :
1. Pas de glisser-déposer sur la carte elle-même — seulement dans le panneau replié.
2. Pas d'icône visible ouvrant la configuration — un `<details>` texte, découvert par
   hasard.

**Confort** :
3. La liste de personnalisation n'affiche que le nom du widget, pas un aperçu (mini-
   icône déjà utilisée par la carte).

## 4. Plan de développement

### Tâche 1 — Widget déplaçable directement dans la grille

**Fichiers** : `dashboard.tsx` (lignes 977-983).

Ajouter `draggable`/`onDragStart`/`onDragOver`/`onDrop` sur les conteneurs de
`visibleWidgetIds.map(...)`, en réutilisant `reorderWidget`/`saveDashboardPrefs`
déjà écrits pour le panneau replié. Poignée visuelle (icône « grip ») dans l'en-tête
de chaque carte.

**Critère** : glisser une carte du tableau de bord la déplace, sans passer par le
panneau replié.

### Tâche 2 — Icône de configuration dédiée

**Fichiers** : `dashboard.tsx` (en-tête, près de `dashboard-heading`).

Une icône visible (roue crantée), toujours affichée, ouvrant soit une modale soit une
route `/dashboard/settings` — remplace ou complète le `<details>` actuel. Garder les
boutons nommés monter/descendre/retirer (règle L16 : le glisser-déposer ne remplace
jamais un contrôle clavier).

**Critère** : une icône visible et cliquable, sans repli à découvrir, ouvre l'espace
où activer/désactiver/réordonner chaque widget.

### Tâche 3 — Aperçu réel dans la liste de personnalisation

**Fichiers** : `dashboard.tsx`.

Remplacer la ligne de texte nue par le nom + la mini-icône déjà utilisée par la carte
correspondante.

## 5. Critères d'acceptation

- Une carte du tableau de bord se déplace en la saisissant directement.
- Une icône visible, toujours présente, ouvre le paramétrage des widgets.
- Activer/désactiver un widget reste possible sans quitter cet espace.
- Les boutons monter/descendre/retirer restent opérables au clavier.

## 6. Tests exigés

- Composant : glisser-déposer sur la grille réelle produit le même ordre persisté
  que le panneau existant.
- Composant : l'icône de configuration ouvre l'espace attendu, testé au clavier
  (`Tab`/`Entrée`) et à la souris.
- Non-régression : les tests existants du panneau replié restent verts (le
  mécanisme sous-jacent ne change pas, seule sa surface change).

## 7. Pièges connus

- Ne pas retirer les boutons nommés au profit du seul glisser-déposer — un widget
  doit rester réordonnable au clavier.
- La persistance reste `localStorage` (par personne/navigateur) : ne pas la migrer
  en base dans cette fiche, ce n'est pas ce qui est demandé.

## 8. Décisions à prendre

Aucune — travail d'interface pur sur un mécanisme déjà validé.
