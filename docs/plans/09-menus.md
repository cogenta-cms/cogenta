# 09 — Menus de navigation

> **État** : partiel — création et suppression, pas d'édition ni de réordonnancement.
> **Écran** : `packages/admin/src/routes/menus.tsx` (397 lignes)
> **API existante** : `packages/api/src/rest/menu-router.ts`
> **Rendu** : `packages/cli/src/commands/theme-render.ts` (`menuRouter`, `footerNav`)
> **Effort** : 3–4 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- Un menu est un arbre nommé de liens, **édité entièrement à l'exécution** : il n'est
  pas déclaré dans le schéma, contrairement à une collection ou une taxonomie. Bonne
  décision, à conserver.
- Un menu porte un `name`, une `locale` et un `label`.
- Un élément de menu est de deux sortes : `url` (lien libre) ou `entry` (référence
  vers une entrée de collection, avec un sélecteur qui charge les 100 premières
  entrées de la collection choisie).
- Un élément peut avoir un parent.
- Le rendu est réellement branché : `theme-render.ts` produit une navigation de pied
  de page à partir des menus.
- Écriture réservée à `admin` et `editor`.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Joomla 5 | Cogenta |
|---|---|---|---|---|
| Créer un menu | ✅ | ✅ | ✅ | ✅ |
| Lien vers une entrée | ✅ | ✅ | ✅ | ✅ |
| Lien libre | ✅ | ✅ | ✅ | ✅ |
| **Réordonner par glisser-déposer** | ✅ | ✅ | ✅ | ❌ |
| **Modifier un élément** | ✅ | ✅ | ✅ | ❌ |
| Emplacements de menu déclarés par le thème | ✅ | ✅ | ✅ | ❌ |
| Lien vers une taxonomie | ✅ | ✅ | ✅ | ❌ |
| Titre / attribut `title`, `target`, classe CSS | ✅ | ✅ | ✅ | ❌ |
| Élément visible par rôle | plugin | ✅ | ✅ | ❌ |
| Signalement d'un lien mort | ❌ | ✅ | ❌ | ❌ |
| Menu par langue | plugin | ✅ | ✅ | ✅ |

## 3. Écarts, classés

### Bloquants

1. **On ne peut pas modifier un élément.** Corriger un libellé impose de supprimer et
   recréer, ce qui perd la position et les enfants.
2. **On ne peut pas réordonner.** L'ordre est celui de la création. Un menu est
   pourtant, par définition, une liste ordonnée : c'est la fonction la plus attendue.

### Importants

3. **Pas d'emplacements de menu.** Le thème rend une navigation de pied de page, mais
   rien ne dit « ce menu est le menu principal, celui-là le pied de page ». Sur
   WordPress c'est la notion de *menu location* et c'est ce qui rend les menus
   utilisables sans toucher au thème.
4. Le sélecteur d'entrée charge `limit: 100` sans recherche : au-delà, une page
   n'est simplement pas atteignable.
5. Pas de lien vers un terme de taxonomie (« toutes les actualités locales »).
6. Pas de `target`, pas d'attribut `title`, pas de classe — donc pas de lien externe
   ouvert dans un nouvel onglet.
7. Rien ne signale qu'un élément `entry` pointe vers une entrée mise à la corbeille ou
   dépubliée. Le menu affiche alors un lien mort en production.

### Confort

8. Pas d'aperçu du menu tel qu'il sera rendu.
9. Pas de duplication de menu (utile pour créer la version d'une autre langue).

## 4. Plan de développement

### Tâche 1 — Modifier un élément

**Fichiers** : `routes/menus.tsx`, `packages/admin/src/api/menu-client.ts`,
`packages/api/src/rest/menu-router.ts` (vérifier `PATCH`).

Modale d'édition : libellé, type (`url`/`entry`), cible, parent. Le changement de
type est autorisé et remet la cible à zéro plutôt que de garder une valeur qui n'a
plus de sens.

**Critère** : corriger un libellé sans perdre la position ni les enfants.

### Tâche 2 — Réordonner

**Fichiers** : `routes/menus.tsx`, nouveau `packages/admin/src/menus/menu-tree.tsx`,
`menu-router.ts`.

Arbre `<ul>` imbriqués, glisser-déposer natif (aucune dépendance, R9), **doublé de
boutons nommés** monter / descendre / indenter / désindenter — le glisser-déposer ne
peut remplacer les boutons que s'ils existent (règle L16).

Côté serveur, une route de réordonnancement en lot est préférable à N appels : `PATCH
/api/menus/{id}/items` avec la liste `{ id, parent, position }`. Un seul appel, une
seule transaction, pas d'état intermédiaire incohérent si le réseau tombe au milieu.

**Critère** : déplacer un élément et ses trois enfants d'un niveau, à la souris et au
clavier ; recharger, l'ordre tient.

### Tâche 3 — Emplacements de menu

**Fichiers** : contrat D (thème) — **vérifier avant de coder ce qu'il déclare déjà**,
`menu-router.ts`, `theme-render.ts`, `routes/menus.tsx`.

Le thème déclare ses emplacements (`primary`, `footer`, …) ; l'admin affecte un menu
à un emplacement ; le rendu demande « le menu de l'emplacement `primary` » plutôt que
« le menu nommé `main` ».

Si le contrat D ne prévoit rien, deux issues : l'ajouter (**RFC contrat D**, figé), ou
faire porter l'emplacement par le menu lui-même côté serveur (`location: 'primary'`),
ce qui ne touche aucun contrat figé et suffit. **Recommandation : la seconde.**

**Critère** : changer le menu principal du site depuis l'admin, sans redéployer.

### Tâche 4 — Cibles enrichies et liens sains

**Fichiers** : `menu-router.ts`, `routes/menus.tsx`, `theme-render.ts`.

- Ajouter le type `taxonomy` (lien vers un terme) et le type `home`.
- `target="_blank"` (avec `rel="noopener"` posé par le rendu, jamais stocké) et
  attribut `title`.
- Sélecteur d'entrée avec recherche, réutilisant `EntryPicker` de la fiche
  [03](03-champs-de-formulaire.md) — pas un deuxième sélecteur.
- **Contrôle de santé** : pour chaque élément `entry`, indiquer si la cible est
  publiée, en brouillon, programmée ou à la corbeille. Une pastille dans la liste, et
  un compteur en tête de menu. Le rendu, lui, doit décider quoi faire d'un lien mort
  — recommandation : le masquer, jamais servir un 404 depuis le menu principal.

**Critère** : dépublier une page fait apparaître un avertissement sur le menu qui y
pointe, avant qu'un visiteur ne trouve le lien mort.

### Tâche 5 — Aperçu et duplication

**Fichiers** : `routes/menus.tsx`.

- Aperçu du menu tel que rendu (réutiliser `POST /api/builder/render` si un bloc de
  navigation existe, sinon un rendu simple de la liste — ne pas réimplémenter le
  thème).
- « Dupliquer ce menu vers la langue X », qui crée un menu jumeau et laisse les
  libellés à traduire.

## 5. Critères d'acceptation

- Un menu se réordonne à la souris et au clavier.
- Un élément se modifie sans être recréé.
- Le menu principal du site se change depuis l'admin.
- Un lien vers une page dépubliée est signalé dans l'admin.
- Un réordonnancement est une seule transaction : une coupure réseau ne laisse jamais
  un arbre à moitié réécrit.

## 6. Tests exigés

- Bout en bout : réordonner, recharger, vérifier l'ordre en base.
- Bout en bout : dépublier une entrée liée et vérifier que l'admin le signale et que
  le rendu ne sert pas de lien mort.
- Unitaires : refus de mettre un élément sous son propre descendant.
- Composant : réordonnancement complet au clavier seul.
- Permissions par rôle : un `author` ne peut pas écrire de menu (règle actuelle
  `admin`/`editor`).

## 7. Pièges connus

- **Un menu n'est pas du contenu.** Il n'a ni version, ni corbeille, ni traduction au
  sens du contrat A — il a une `locale` et c'est tout. Ne pas lui greffer le modèle
  du contenu par symétrie.
- **N appels de réordonnancement, c'est N états intermédiaires visibles en
  production.** Le lot, ou rien.
- **`rel="noopener"` est une décision de rendu, pas une donnée à stocker** (R3).
- **Le contrôle de santé des liens peut fuiter** : dire à un rôle « cette cible est un
  brouillon » lui révèle l'existence du brouillon. Passer par la même couche de
  permission que la lecture.
- **Le sélecteur limité à 100 entrées** ment silencieusement aujourd'hui. Le
  remplacer, pas augmenter la limite.

## 8. Décisions à prendre

- Emplacements de menu : porté par le menu côté serveur (recommandé, sans contrat) ou
  déclaré par le thème (RFC contrat D).
- Comportement du rendu face à un lien mort : masquer (recommandé) ou rendre inerte.
