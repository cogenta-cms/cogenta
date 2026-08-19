# 08 — Taxonomies

> **État** : minimal — **on ne peut pas modifier un terme**. Créer et supprimer, rien
> d'autre.
> **Écran** : `packages/admin/src/routes/taxonomies.tsx` (269 lignes)
> **Champ** : `packages/admin/src/fields/taxonomy-field.tsx` (96 lignes)
> **API existante** : `/api/taxonomies` (routeur séparé de `/api/content`)
> **Effort** : 4–5 jours
> **ADR requise** : non — ADR-0022 a défini le modèle

---

## 1. Ce qui existe réellement

Le modèle serveur (ADR-0022) est là et il est bien fait :

- `defineTaxonomy()` est un objet déclarable de premier niveau ; `f.taxonomy({ of,
  many })` est un type de champ (`many: true` par défaut, contrairement à `relation`).
- Un terme porte `id`, `parent`, `slug`, `position`, `labels` **indexés par locale**,
  et **ni `status`, ni `version`, ni `translationOf`**.
- L'arborescence est un **chemin matérialisé d'ids** maintenu à l'écriture : un
  sous-arbre est un `like` unique, renommer un terme ne réécrit rien, seul un
  déplacement paie. Profondeur bornée à 12.
- Une table de termes **par taxonomie**, pour que la clé étrangère d'un champ signifie
  « une catégorie » et pas « n'importe quel terme, promis on filtre ».
- `/api/taxonomies` est un routeur à part, parce qu'un site peut avoir une collection
  `category` et une taxonomie `category`.

L'écran, lui, admet lui-même être une esquisse (« Plain on purpose — L11 owns how the
admin looks ») :

- un `<select>` de taxonomie ;
- une table plate indentée par `depth` ;
- un formulaire de création : libellé, slug, parent ;
- un bouton supprimer par ligne.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Cogenta |
|---|---|---|---|
| Créer un terme | ✅ | ✅ | ✅ |
| **Modifier un terme** (libellé, slug, parent) | ✅ | ✅ | ❌ |
| Description du terme | ✅ | ✅ | ❌ (pas au contrat) |
| Réordonner (glisser-déposer dans l'arbre) | partiel | ✅ | ❌ |
| Déplacer un terme sous un autre parent | ✅ | ✅ | ❌ |
| Libellés multilingues | plugin | ✅ | modèle ✅, écran ❌ |
| Nombre d'entrées par terme | ✅ | ✅ | ❌ |
| Fusionner deux termes | plugin | ✅ | ❌ |
| Recherche / filtrage dans les termes | ✅ | ✅ | ❌ |
| Suppression avec réaffectation des enfants | ✅ | ✅ | refus serveur |
| Vue arborescente repliable | ❌ (plat) | ✅ | ❌ (indentation seule) |

## 3. Écarts, classés

### Bloquants

1. **Aucune modification.** Une faute de frappe dans un libellé de catégorie oblige à
   supprimer et recréer — ce qui, sur un terme déjà utilisé, casse toutes les
   classifications qui pointent dessus. C'est le plus gros trou de cette fiche.
2. **Aucun déplacement.** Le modèle serveur gère explicitement le déplacement (« seul
   un déplacement paie ») ; l'écran ne l'expose pas.
3. **Les libellés multilingues sont amputés à l'écriture.** Le code le dit :
   `labels: { [i18n.language]: label }` — un seul libellé, dans la langue de
   l'interface. Un site bilingue ne peut donc pas nommer ses catégories dans les deux
   langues depuis l'admin, alors que le modèle le prévoit.

### Importants

4. Pas de compteur d'usage : impossible de savoir si un terme est utilisé avant de le
   supprimer.
5. Pas de recherche : une taxonomie à trois cents termes est illisible.
6. Le `<select>` de parent liste les slugs bruts, pas l'arbre : choisir le bon parent
   dans une hiérarchie profonde relève de la devinette.
7. Suppression sans confirmation, et sans dire si le terme est utilisé.
8. Pas de pagination.

### Confort

9. Pas de fusion de termes.
10. Pas de repli / dépli de branches.
11. Pas d'import en masse (coller une liste).

## 4. Plan de développement

### Tâche 1 — Modifier un terme (priorité)

**Fichiers** : `routes/taxonomies.tsx`, `packages/admin/src/api/taxonomy-client.ts`,
`packages/api/src/rest/taxonomy-router.ts` (vérifier que `PATCH` existe).

Un formulaire d'édition en modale : libellé **par locale du site** (un champ par
locale, pas un seul), slug, parent. Gardé par `canPerformOnTerms('update', …)` —
vérifier que cette action existe dans `canTerm`/`assertTerm` d'ADR-0022 ; le
vocabulaire des cinq actions est figé, donc `update` doit déjà y être.

Le changement de parent est un **déplacement** : le serveur réécrit le chemin
matérialisé du sous-arbre. L'écran doit prévenir quand le sous-arbre est gros et
refuser proprement le cas « déplacer un terme sous son propre descendant » (le serveur
le refuse ; afficher son message).

**Critère** : renommer une catégorie utilisée par quarante articles, et retrouver les
quarante articles toujours classés.

### Tâche 2 — Vrai arbre

**Fichiers** : `routes/taxonomies.tsx`, nouveau
`packages/admin/src/taxonomies/term-tree.tsx`.

- Rendu en `<ul>` imbriqués (l'API renvoie déjà l'ordre de l'arbre et une `depth`),
  avec repli / dépli mémorisé.
- Glisser-déposer pour déplacer et réordonner — **et systématiquement doublé de
  boutons nommés** (monter, descendre, indenter, désindenter), règle que le builder
  de L16 s'est déjà imposée.
- Le sélecteur de parent devient l'arbre lui-même, pas un `<select>` de slugs.
- Indicateur de profondeur, et blocage à 12 avec le message qui dit pourquoi (limite
  de clé d'index InnoDB en utf8mb4 — une vraie raison, pas un caprice).

**Critère** : réorganiser une hiérarchie de trois niveaux à la souris **et** au
clavier seul.

### Tâche 3 — Compteurs et recherche

**Fichiers** : `packages/api/src/rest/taxonomy-router.ts`,
`routes/taxonomies.tsx`.

- `GET /api/taxonomies/{name}/terms?counts=1` renvoyant, par terme, le nombre
  d'entrées classées — un `GROUP BY` sur la table de jointure. Deux chiffres à
  distinguer : ce terme seul, et ce terme avec ses descendants (le `like` sur le
  chemin matérialisé donne le second gratuitement).
- Recherche par libellé et slug, insensible à la casse et aux accents.
- Filtre « termes non utilisés », qui est la question qu'on se pose avant un ménage.

**Critère** : trouver les termes à zéro entrée d'une taxonomie de trois cents termes.

### Tâche 4 — Suppression informée

**Fichiers** : `routes/taxonomies.tsx`.

Modale du design system (plus de `confirm()`), disant : le nombre d'entrées classées
qui perdront ce terme, le nombre d'enfants, et ce que le serveur fera. Le serveur
refuse déjà un terme qui a des enfants sans `cascade` — proposer explicitement les
deux issues (« supprimer aussi les N sous-catégories » / « annuler ») plutôt que
d'afficher un refus après coup.

### Tâche 5 — Le champ taxonomie côté entrée

**Fichiers** : `packages/admin/src/fields/taxonomy-field.tsx`.

Il fonctionne, mais à revoir en même temps : recherche dans les termes, affichage
hiérarchique (un terme enfant doit montrer son parent), création rapide d'un terme
depuis le champ pour un rôle qui en a le droit (c'est ce que fait WordPress et c'est
ce qui rend une taxonomie vivante), et respect de `many: false` quand il est déclaré.

**Critère** : classer un article dans « Actualités › Local » sans quitter l'éditeur.

## 5. Critères d'acceptation

- Un terme se renomme sans casser une seule classification existante.
- Les libellés se saisissent dans **toutes** les langues du site.
- Un déplacement de sous-arbre marche, à la souris et au clavier.
- Aucune suppression sans savoir combien d'entrées et d'enfants elle affecte.
- Un rôle sans permission ne voit ni le formulaire ni les boutons (comportement
  actuel, à conserver).

## 6. Tests exigés

- Bout en bout : renommer un terme, vérifier que les entrées classées le sont
  toujours et que le chemin matérialisé n'a pas été réécrit inutilement.
- Bout en bout : déplacer un sous-arbre de trois niveaux, vérifier les chemins de
  tous les descendants.
- Unitaires : refus du déplacement d'un terme sous son propre descendant.
- Unitaires : refus au-delà de la profondeur 12, avec le bon message.
- Intégration sur les trois bases : le `like` sur le chemin matérialisé — c'est l'un
  des deux points que `BLOCKERS.md` signale comme à revérifier, et Postgres/MySQL
  n'ont jamais été exécutés.
- Permissions par rôle sur chaque route de terme.

## 7. Pièges connus

- **Le `like` sur le chemin matérialisé n'a jamais été exécuté sur Postgres, MySQL ni
  MariaDB** (`BLOCKERS.md`, section « Corbeille et taxonomies »). C'est le premier
  point à vérifier avant de construire un écran d'arbre qui en dépend entièrement.
- **Le DDL implicitement committé de MySQL** est l'autre point signalé au même
  endroit — pertinent si cette fiche ajoute une table ou un index.
- **Un terme n'a ni statut ni version** — volontairement. Ne pas ajouter de brouillon
  de terme ; ce serait une modification du modèle d'ADR-0022.
- **Renommer ne doit rien réécrire.** C'est la propriété que le chemin matérialisé
  d'ids achète. Si une implémentation d'écran finit par réécrire des chemins à chaque
  renommage, elle a annulé la décision.
- **Le compteur peut fuiter** : compter les entrées classées inclut-il les brouillons
  ? Pour un rôle qui ne les lit pas, non. Passer par la même couche de permission.

## 8. Décisions à prendre

- **Description de terme** : WordPress et Drupal en ont une, le modèle d'ADR-0022 n'en
  a pas. L'ajouter serait une montée du contrat A (ADR). Alternative sans contrat :
  s'en passer, ou la porter dans `labels` — mauvaise idée, `labels` est indexé par
  locale pour l'affichage. Recommandation : s'en passer tant que personne ne la
  demande.
- Fusion de termes : hors périmètre de la première version, à rouvrir si le besoin
  arrive.
