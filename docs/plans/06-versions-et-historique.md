# 06 — Versions et historique

> **État** : partiel — le diff existe et il est bon, la navigation est pauvre.
> **Écran** : `packages/admin/src/versions/version-history.tsx` (230 lignes)
> **API existante** : `GET .../history`, `GET .../diff?from=&to=`, `POST .../restore`
> **Effort** : 3–4 jours
> **ADR requise** : non, sauf pour l'étiquetage des versions (tâche 4)

---

## 1. Ce qui existe réellement

- `GET .../history` liste les versions (`version`, `status`, `createdAt`, `live`).
- `GET .../diff?from=&to=` renvoie un diff **structurel** — champ par champ et bloc
  par bloc, avec `added`/`removed`/`changed`/`moved` et, pour les blocs déplacés, les
  positions de départ et d'arrivée. C'est un vrai diff métier, pas une comparaison de
  JSON sérialisé, et c'est la meilleure partie de cette fonctionnalité.
- `POST .../restore` restaure une version, et l'écran remonte l'entrée restaurée à
  l'éditeur parent.
- L'écran liste, compare **contre la version en ligne uniquement**, et restaure.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Liste des révisions | ✅ | ✅ (Enterprise) | ✅ | ✅ |
| Diff structurel (pas du JSON) | partiel (texte) | ✅ | ✅ | ✅ **mieux** |
| Comparer **deux versions quelconques** | ✅ (double curseur) | ✅ | ✅ | ❌ (contre la live seulement) |
| Auteur de la version | ✅ | ✅ | ✅ | ❌ (non affiché) |
| Message / note de révision | ❌ | ❌ | ✅ | ❌ |
| Restaurer | ✅ | ✅ | ✅ | ✅ |
| Purge / rétention des révisions | ✅ (constante) | ✅ | ✅ | ? |
| Vue côte à côte | ✅ | ✅ | ✅ | ❌ (liste de changements) |
| Diff du texte riche mot à mot | ✅ | partiel | ✅ | ❌ (« changé ») |

## 3. Écarts, classés

### Importants

1. **On ne peut comparer qu'à la version en ligne.** Comparer v3 à v4 est impossible ;
   pourtant `GET .../diff?from=&to=` accepte déjà deux versions arbitraires. C'est
   purement un manque d'interface, pas de serveur.
2. **L'auteur n'est pas affiché.** « v7 — published — 2026-08-14T09:12:33Z » ne dit
   pas qui a fait quoi. Vérifier si `VersionSummary` porte déjà un `createdBy` ;
   sinon, l'ajouter à la sérialisation (ajout par le bas, mineur).
3. **Un champ de texte riche modifié affiche « changé »**, sans plus. C'est le cas le
   plus fréquent et le moins informatif.
4. **Les dates sont brutes** (ISO). Illisibles dans une liste de vingt versions.

### Confort

5. Pas de vue côte à côte.
6. Pas de note de révision (« corrigé les tarifs »).
7. Pas de pagination : une entrée à deux cents versions rend l'écran inutilisable.
8. La restauration n'a pas de confirmation, alors qu'elle écrase le travail courant.

## 4. Plan de développement

### Tâche 1 — Comparer deux versions quelconques

**Fichiers** : `versions/version-history.tsx`.

Deux colonnes de boutons radio, « depuis » et « jusqu'à », comme WordPress. Par défaut
: la version sélectionnée contre la live (le comportement actuel, donc aucune
régression d'usage). Le bouton « comparer » appelle `getDiff(token, c, id, from, to)`
— la fonction cliente existe déjà et prend déjà deux versions.

**Critère** : comparer v3 à v5 sur une entrée qui en a douze, sans passer par la live.

### Tâche 2 — Rendre la liste lisible

**Fichiers** : `versions/version-history.tsx`,
`packages/api/src/content/serialise.ts` si l'auteur manque.

- Auteur (e-mail résolu via `/api/users`, ou le libellé que le journal d'audit
  utilise déjà).
- Date en `Intl.DateTimeFormat`, avec l'ISO en `title`.
- Étiquette visuelle du statut (brouillon / publiée / archivée).
- Pagination ou repli au-delà de vingt versions.
- Un résumé d'une ligne par version : « 3 champs, 1 bloc modifiés » — un `GET .../diff`
  paresseux au survol, ou calculé à l'ouverture pour la page visible seulement.

**Critère** : sur une entrée à cinquante versions, l'écran reste lisible et ne fait
pas cinquante requêtes de diff.

### Tâche 3 — Diff lisible du texte riche

**Fichiers** : `versions/version-history.tsx`, éventuellement
`packages/schema/src/store/diff.ts`.

Un diff mot à mot sur les champs `text` et `richText`, rendu avec des marques
ajouté/supprimé. **R9** : pas de bibliothèque de diff. L'algorithme de plus longue
sous-séquence commune sur des mots tient en une soixantaine de lignes et est
parfaitement testable.

Question à trancher : côté serveur (dans `diff.ts`, donc disponible pour l'API et les
agents) ou côté admin (donc pas de charge serveur) ? Recommandation : **côté serveur**,
parce que le diff est déjà une notion du domaine et qu'un agent qui rend compte d'une
modification aura le même besoin (R6 : « toute action d'agent est diffée »).

**Critère** : corriger un mot dans un paragraphe de trois cents mots montre ce mot,
pas « changé ».

### Tâche 4 — Notes de révision et rétention

**Fichiers** : contrat A → **ADR si un champ nouveau est nécessaire**.

- **Note de révision** : un message facultatif à l'enregistrement. Si le contrat A n'a
  pas où le mettre, ne pas l'inventer : le reporter, ou le porter dans le journal
  d'audit (qui enregistre déjà l'action et pourrait porter un commentaire) — solution
  sans contrat touché, à privilégier.
- **Rétention** : vérifier si `packages/schema` purge les vieilles versions. Sinon,
  une entrée éditée quotidiennement pendant deux ans accumule sept cents versions.
  Une politique configurable (garder N versions, ou N jours) avec un balayage du même
  genre que `purgeExpired()` de la corbeille — dont le mécanisme existe déjà et peut
  servir de modèle exact.

### Tâche 5 — Confirmer la restauration

**Fichiers** : `versions/version-history.tsx`.

Une modale nommant la version, sa date, son auteur, et ce que la restauration va
écraser. Après restauration : un message avec un lien « annuler » qui restaure la
version précédemment live (elle est toujours dans l'historique — la restauration ne
détruit rien).

**Critère** : restaurer par erreur se répare en un clic.

## 5. Critères d'acceptation

- On compare deux versions quelconques.
- Chaque version dit qui, quand, quoi.
- Un mot corrigé apparaît comme un mot corrigé.
- La restauration est confirmée et réversible.
- Une entrée à cinquante versions ne provoque pas cinquante requêtes.

## 6. Tests exigés

- Unitaires sur le diff mot à mot (insertion, suppression, déplacement, accents,
  caractères hors BMP).
- Composant : sélection de deux versions et appel de `getDiff` avec les bons
  arguments.
- Bout en bout : restaurer une version puis l'annuler, en vérifiant en base que le
  contenu est bien celui d'avant.
- Permissions : un rôle sans `update` voit l'historique mais pas le bouton restaurer
  (`canRestore` existe déjà — ne pas régresser).

## 7. Pièges connus

- **Le diff de texte riche n'est pas un diff de chaînes.** Le portable-text est un
  arbre ; comparer `JSON.stringify` produit du bruit. Il faut extraire le texte des
  nœuds, differ, puis reporter.
- **La restauration crée une version.** C'est ce qui rend l'annulation possible ; ne
  pas « optimiser » en écrasant.
- **Une purge de rétention est destructive.** Si elle est implémentée : confirmation
  explicite, et jamais activée par défaut sur un site existant.
- **Ne pas charger tous les diffs d'un coup** pour afficher les résumés de la
  tâche 2 — c'est un `N+1` sur des données qui peuvent être volumineuses.

## 8. Décisions à prendre

- Diff mot à mot : serveur (recommandé) ou admin.
- Notes de révision : journal d'audit (sans contrat) ou champ nouveau (ADR).
- Rétention des versions : politique par défaut, et si elle s'applique
  rétroactivement.
