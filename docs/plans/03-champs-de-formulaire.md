# 03 — Champs de formulaire

> **État** : incomplet — **la fiche la plus bloquante de tout l'ensemble**.
> **Écrans** : `packages/admin/src/fields/` (16 fichiers)
> **API existante** : tout ; c'est un manque d'interface, pas de serveur.
> **Effort** : 8–10 jours
> **ADR requise** : non (aucun contrat ne bouge)
> **Débloque** : les fiches [02](02-editeur-d-entree.md), [05](05-page-builder.md),
> [08](08-taxonomies.md), [31](31-commerce-catalogue.md)

---

## 1. Ce qui existe réellement

Le contrat A déclare **quinze** types de champ (`packages/schema/src/types.ts`) :
`text`, `richText`, `slug`, `number`, `boolean`, `date`, `datetime`, `media`,
`relation`, `select`, `json`, `geo`, `color`, `blocks`, `taxonomy`.

État de leur éditeur, ligne par ligne, vérifié :

| Champ | Fichier | Lignes | État réel |
|---|---|---|---|
| `text` | `text-field.tsx` | 44 | OK (input / textarea selon `multiline`) |
| `richText` | `rich-text-field.tsx` | 21 | Délègue à Slate — voir fiche [04](04-editeur-texte-riche.md) |
| `slug` | `slug-field.tsx` | 33 | OK |
| `number` | `number-field.tsx` | 35 | OK |
| `boolean` | `boolean-field.tsx` | 35 | OK |
| `date` | `date-field.tsx` | 25 | OK |
| `datetime` | `datetime-field.tsx` | 44 | OK |
| `media` | `media-field.tsx` | 128 | **Mono-valeur uniquement**, et le sélecteur ne liste que `kind: 'image'` |
| `relation` | `relation-field.tsx` | **22** | **Placeholder. Affiche une phrase. Rien d'éditable.** |
| `select` | `select-field.tsx` | 55 | À vérifier pour `many` |
| `json` | `json-field.tsx` | 50 | Textarea JSON brut |
| `geo` | `geo-field.tsx` | 56 | Deux nombres, pas de carte |
| `color` | `color-field.tsx` | 38 | OK |
| `blocks` | `blocks-field.tsx` | 130 | OK (et le builder par-dessus) |
| `taxonomy` | `taxonomy-field.tsx` | 96 | OK |

Deux constats qui expliquent la moitié des plaintes de l'utilisateur :

- **Le champ `relation` n'existe pas dans l'interface.** Son propre commentaire dit
  « Placeholder — un vrai sélecteur doit interroger les entrées de la collection
  cible ». Toute collection qui déclare une relation a un champ mort dans son
  formulaire. La clé étrangère, la validation, `onDelete: 'restrict'` : tout est là
  côté serveur.
- **Toute liste répétée est un textarea JSON.** Le commentaire de
  `blocks/vocabulary.ts` le dit sans détour : `f.list(...)` compile en champ `json`
  « plutôt que d'inventer un répéteur dans cette passe ». C'est ce qui fait qu'ajouter
  trois éléments à un bloc `features` demande d'écrire du JSON à la main.

## 2. Ce que font les CMS de référence

| Fonction | WordPress (ACF) | Strapi 5 | Sanity | Cogenta |
|---|---|---|---|---|
| Sélecteur de relation avec recherche | ✅ | ✅ | ✅ | ❌ |
| Relation multiple, réordonnable | ✅ | ✅ | ✅ | ❌ |
| Création de l'entrée liée sans quitter le formulaire | ✅ | ✅ | ✅ | ❌ |
| Média multiple + glisser-déposer + réordonnancement | ✅ | ✅ | ✅ | ❌ |
| Téléversement direct depuis le champ | ✅ | ✅ | ✅ | ❌ |
| Répéteur (liste d'objets typés) | ✅ | ✅ (components) | ✅ (arrays) | ❌ (JSON brut) |
| Sélection multiple ergonomique (jetons) | ✅ | ✅ | ✅ | ? |
| Carte pour un champ géo | ✅ | ✅ | ✅ | ❌ (2 nombres) |
| Aide contextuelle / description de champ | ✅ | ✅ | ✅ | partiel |
| Compteur de caractères sur champ limité | ✅ | ✅ | ✅ | ❌ |

## 3. Écarts, classés

### Bloquants

1. **`relation` non éditable.** Un schéma qui utilise une relation n'est pas
   exploitable depuis l'admin, point.
2. **`media` non multiple.** Une galerie, un carrousel, une fiche produit à trois
   photos : impossible sans écrire du JSON.
3. **Les listes en JSON brut.** Un éditeur non technique ne peut pas remplir un bloc
   `features` ou `faq`. C'est l'écart qui rend le page builder à moitié utile.
4. **Le sélecteur de média filtre sur `kind: 'image'`** en dur (`listMedia(token,
   { kind: 'image' })`). Un champ `media` destiné à un PDF ou une vidéo ne montre
   aucun choix.

### Importants

5. Pas de téléversement depuis le champ : il faut aller dans la médiathèque, revenir,
   chercher.
6. Pas de recherche dans le sélecteur de média (il liste une page et s'arrête).
7. `geo` sans carte : saisir des coordonnées à la main est une source d'erreur
   silencieuse.
8. Pas de compteur de caractères là où le schéma déclare un `maxLength`.
9. Pas de valeur par défaut visible ni de bouton « rétablir la valeur par défaut ».

### Confort

10. Pas d'aperçu de la couleur sélectionnée à côté du champ.
11. Pas de glisser-déposer de fichier sur le champ média.
12. Pas de `richText` en plein écran.

## 4. Plan de développement

### Tâche 1 — Le sélecteur de relation (la priorité absolue)

**Fichiers** : `packages/admin/src/fields/relation-field.tsx` (réécriture complète),
nouveau `packages/admin/src/fields/entry-picker.tsx`,
`packages/admin/src/api/content-client.ts` (déjà pourvu : `listEntries`,
`searchContent`).

Un composant `EntryPicker` réutilisable :

- charge les entrées de `options.to` par `listEntries`, page par page ;
- champ de recherche câblé sur `GET /api/search` scopé à cette collection ;
- affiche le **titre** résolu par la logique unique de la fiche
  [01](01-liste-de-contenu.md) tâche 1, jamais un UUID ;
- montre le statut (un brouillon lié doit être signalé — lier vers du non publié est
  une cause classique de lien mort en production) ;
- respecte `canPerform('read', collectionCible)` : une relation vers une collection
  que l'acteur ne lit pas affiche « accès refusé », pas une liste vide qui laisse
  croire qu'il n'y a rien ;
- gère `options.many` : liste de jetons, réordonnable (mêmes événements natifs de
  glisser-déposer que le builder de L16, **aucune dépendance nouvelle**, R9), avec
  des boutons monter/descendre nommés pour le clavier ;
- gère `options.required` et affiche l'entrée liée même si elle a été mise à la
  corbeille depuis (auquel cas : signalée comme telle, pas silencieusement absente).

**Critère** : sur une collection `article` qui déclare `author: f.relation({ to:
'person' })`, choisir un auteur, enregistrer, recharger — la relation tient, et la
liste des articles peut afficher le nom de l'auteur.

### Tâche 2 — Le répéteur

**Fichiers** : nouveau `packages/admin/src/fields/repeater-field.tsx`,
`packages/admin/src/fields/field-input.tsx`,
`packages/admin/src/blocks/vocabulary.ts`.

Le contrat A n'a pas de type `array`, et **on ne le lui ajoute pas** (figé). Mais
`vocabulary.ts` sait déjà, bloc par bloc, quels champs sont des `f.list(...)` — il les
compile aujourd'hui en `json`. Il faut donc :

1. Enrichir `BLOCK_VOCABULARY` : au lieu de dégrader un `f.list` en `json`, décrire la
   **forme de son élément** (un tableau de `SchemaField`).
2. Écrire `RepeaterField` : liste d'éléments, chacun rendu par `FieldInput` récursif,
   avec ajouter / supprimer / réordonner / dupliquer un élément, et un titre d'élément
   dérivé du premier champ texte.
3. La valeur écrite reste **exactement** le même tableau JSON qu'aujourd'hui — c'est
   un changement d'éditeur, pas de format. Le contrat B ne bouge pas d'un octet.

**Critère** : ajouter trois fonctionnalités à un bloc `features` sans jamais voir une
accolade, et vérifier par un test que la valeur enregistrée est identique, octet pour
octet, à celle que produisait la saisie JSON équivalente.

### Tâche 3 — Média multiple, tous types, téléversement sur place

**Fichiers** : `media-field.tsx`, nouveau `packages/admin/src/media/media-picker.tsx`,
`packages/admin/src/media/upload-form.tsx` (réutilisation).

- `options.many` → liste réordonnable de vignettes.
- Le filtre `kind` vient de `options.accept` du champ, pas d'une constante ;
  sans contrainte déclarée, on liste tout.
- Recherche et pagination dans le sélecteur (dépend de la fiche
  [11](11-mediatheque.md) tâche 2, qui ajoute la recherche côté API).
- Bouton « téléverser » dans le sélecteur, réutilisant `UploadForm` tel quel — donc
  la règle du texte alternatif obligatoire s'applique au même endroit, sans être
  réimplémentée.
- Zone de dépôt : glisser un fichier sur le champ le téléverse.

**Critère** : sur un champ `gallery: f.media({ many: true })`, déposer quatre images
d'un coup, les réordonner, enregistrer, recharger — même ordre.

### Tâche 4 — Champs restants

**Fichiers** : `select-field.tsx`, `geo-field.tsx`, `color-field.tsx`,
`field-wrapper.tsx`, `json-field.tsx`.

- `select` avec `many` : jetons, recherche au-delà de dix options, `aria-multiselectable`.
- `geo` : garder les deux nombres comme source de vérité, **ajouter** une carte
  facultative. R9 et R10 s'appliquent : pas de bibliothèque de cartographie ni de
  tuiles distantes obligatoires. Une carte statique via une URL de tuiles
  **configurable et vide par défaut** — sans configuration, on garde les deux champs
  et on ne fait aucune requête sortante. Un site R2/hors-ligne doit rester intact.
- `color` : pastille d'aperçu + `<input type="color">` en plus du texte.
- `field-wrapper` : compteur de caractères quand `options.maxLength` existe,
  description de champ, marqueur « requis » accessible, bouton « valeur par défaut ».
- `json` : garder le textarea (c'est le bon éditeur pour un vrai champ `json`), mais
  ajouter le formatage automatique et une indication de la ligne d'erreur.

**Critère** : aucun champ du contrat A ne reste sans éditeur adapté à son type.

### Tâche 5 — Cohérence et tests de contrat

**Fichiers** : `packages/admin/test/fields/`.

Une suite unique jouée sur **les quinze** types : monter le champ, saisir une valeur,
vérifier que `onChange` reçoit exactement la forme que le serveur attend, et que
`disabled` désactive tout. C'est la même idée que la suite de contrat des drivers :
une seule suite, toutes les implémentations.

**Critère** : ajouter un seizième type de champ au contrat A ferait échouer cette
suite tant qu'il n'a pas d'éditeur — l'oubli devient impossible.

## 5. Critères d'acceptation

- Les quinze types de champ du contrat A sont éditables sans écrire de JSON.
- Une relation se choisit par son titre, avec recherche, et jamais par un UUID.
- Une galerie se remplit par glisser-déposer et se réordonne.
- Un bloc à liste (`features`, `faq`, `items`) se remplit champ par champ.
- Rien n'a changé dans le format stocké : les valeurs produites sont identiques à
  celles que produisait l'ancienne saisie JSON.
- Sans configuration de tuiles, le champ géo ne fait aucune requête sortante (R1/R2).

## 6. Tests exigés

- Suite de contrat sur les quinze types (tâche 5).
- Unitaires : `RepeaterField` produit exactement le même tableau que la saisie JSON
  équivalente, pour chaque bloc du contrat B qui a une liste.
- Composant : `EntryPicker` sur une collection non lisible → message d'accès, pas de
  liste vide.
- Composant : `EntryPicker` avec une entrée liée mise à la corbeille → signalée.
- Bout en bout : créer une entrée avec une relation et une galerie de trois images
  contre un vrai serveur, relire, comparer.
- Accessibilité : axe-core sur chaque nouveau champ ; réordonnancement opérable au
  clavier seul (la règle que L16 s'est imposée pour le builder).

## 7. Pièges connus

- **Le sélecteur de relation peut charger toute la base.** Pagination obligatoire dès
  la première version, pas « quand ce sera lent ».
- **Une relation vers une entrée à la corbeille ne doit pas disparaître de l'écran.**
  ADR-0022 : la ligne de jointure survit à la mise à la corbeille, exprès. L'admin
  doit le refléter, sinon l'éditeur croit avoir perdu la relation et la ressaisit.
- **Le répéteur ne doit pas devenir un deuxième vocabulaire.** Il rend ce que
  `BLOCK_VOCABULARY` décrit ; il n'invente aucun type. Toute tentation d'ajouter un
  champ « pratique » ici est une modification du contrat B déguisée.
- **`vocabulary.ts` est une copie manuelle** de `packages/blocks/src/vocabulary.ts`.
  Son propre commentaire le dit. Enrichir la copie sans enrichir l'original les fait
  diverger : ajouter un test qui compare les deux, ou servir le vocabulaire par
  `/api/schema`.
- **Le glisser-déposer ne doit jamais être le seul chemin.** Boutons nommés en
  doublure, systématiquement (règle déjà tenue par L16).
- **R10** : pas de traitement d'image côté client qui dépendrait d'un binaire natif.

## 8. Décisions à prendre

- **Vocabulaire de blocs** : enrichir la copie admin, ou le servir depuis `/api/schema`
  pour supprimer la copie. La seconde option est plus propre et devrait être tranchée
  avant la tâche 2, parce qu'elle change où le travail se fait.
- **Carte du champ géo** : quelle source de tuiles, et confirmer qu'elle reste
  facultative et vide par défaut.
