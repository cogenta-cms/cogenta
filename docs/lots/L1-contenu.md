# L1 — Contenu

## Objectif

Le moteur de contenu : définition de schéma en code, génération de types et de
migrations, versions et brouillons, i18n, blocs sémantiques, API REST et GraphQL,
permissions.

C'est le cœur du produit. Tout ce qui suit le consomme.

## Dépendances

L0. **Contrats A (schéma) et B (blocs) figés avant de commencer.**

## Périmètre

- `defineCollection` et les types de champ
- Génération des types TypeScript et des migrations
- Champs système, dont `provenance`
- Brouillons, versions, historique, diff, restauration
- Publication programmée
- i18n : locales, traductions, fallback
- Taxonomies et relations
- Slugs, routage, redirections 301 automatiques
- Vocabulaire de blocs (les douze du contrat B)
- API REST et GraphQL
- Permissions par collection et par action
- Preview tokens
- Recherche full-text

## Arborescence

```
packages/
├── schema/          # @cogenta/schema — defineCollection, champs, génération
├── blocks/          # @cogenta/blocks — vocabulaire, defineBlock, validation
└── api/             # @cogenta/api — REST, GraphQL, permissions, preview
```

## Points de conception

### Génération

`cogenta generate` lit les fichiers de schéma et produit :

- `.cogenta/types.d.ts` — les types de chaque collection, dérivés des champs
- `.cogenta/schema.json` — la description consommée par l'admin pour bâtir l'interface
- `migrations/NNNN-*.sql` — la migration correspondant au diff avec l'état précédent

**Le schéma est la source unique de vérité.** L'admin, l'API et les thèmes en dérivent.
Rien n'est écrit deux fois.

### Versions et brouillons

Une collection avec `versioning.drafts` possède deux lignes logiques : la version
publiée et la version de travail. Le rendu public lit toujours la publiée ; l'admin et
les preview tokens lisent la version de travail.

L'historique conserve N versions (configurable). Le diff est calculé champ par champ et
bloc par bloc, jamais sur une sérialisation brute — sinon il est illisible.

### i18n

**Une entrée par langue** (ADR-0014). Chaque entrée porte sa `locale` et, si ce n'est
pas la langue source, un `translationOf` qui pointe l'entrée d'origine. `localized: true`
n'est pas une directive de stockage : c'est une métadonnée d'admin qui déclare qu'un
champ se traduit, donc que l'éditeur peut proposer la recopie depuis la source.

Le fallback est configurable par locale.

Le rendu d'une locale manquante suit trois stratégies, au choix du site : afficher
l'original, masquer le contenu, ou renvoyer 404. Le choix est explicite, jamais implicite.

### Slugs et redirections

Changer le slug d'un contenu publié crée **automatiquement** une redirection 301 depuis
l'ancienne URL. Cette table de redirections est consultable, éditable, exportable vers
le format de la plateforme de déploiement.

C'est une plaie quotidienne non résolue par WordPress et Drupal. Ça doit marcher sans
que personne y pense.

### Blocs

Un bloc est validé à l'écriture contre son schéma Zod. Un bloc dont la version de schéma
a évolué déclenche une migration de contenu au chargement, avec écriture de la version
migrée. Le contenu ne reste jamais dans un état ambigu.

### API

REST et GraphQL exposent la même chose et partagent la même couche de permissions et de
sérialisation. Il n'y a pas deux implémentations.

Pagination par curseur, pas par offset — l'offset dérape sur des collections vivantes.

Filtres : égalité, comparaison, `in`, `contains`, `exists`, combinaisons `and`/`or`.
Pas de langage de requête maison exposé publiquement.

### Permissions

Vérifiées dans une couche unique, en amont de REST et de GraphQL. Un test par rôle et
par action pour chaque collection est **exigé**, pas optionnel.

Le rôle `public` n'a jamais accès aux brouillons, quelle que soit la requête.

## Tâches, dans l'ordre

1. Types de champ et `defineCollection`, validation Zod
2. Génération des types TypeScript
3. Diff de schéma et génération de migrations
4. Champs système, dont `provenance`
5. Couche de persistance : CRUD typé sur les trois dialectes
6. Brouillons, versions, historique, diff, restauration
7. Publication programmée (job dans la queue de L0)
8. i18n et fallback
9. Relations et taxonomies
10. Slugs, routage, redirections automatiques
11. `defineBlock`, les douze blocs du vocabulaire, migration de schéma de bloc
12. Couche de permissions
13. API REST
14. API GraphQL sur la même couche
15. Preview tokens
16. Recherche full-text par dialecte

## Critères d'acceptation

- Modifier un schéma génère une migration correcte, jouable et réversible sur les trois bases
- Un thème référençant un champ inexistant échoue à la compilation des types
- Changer le slug d'un contenu publié crée une redirection 301 sans intervention
- Un contenu avec bloc en version ancienne est migré au chargement, sans perte
- Le rôle `public` ne peut atteindre aucun brouillon, sur aucune route, en REST comme en GraphQL
- Un preview token expiré ne donne accès à rien
- Un contenu programmé se publie à l'heure, y compris avec la queue `database`
- La pagination par curseur est stable pendant des insertions concurrentes

## Tests exigés

| Type | Portée |
|---|---|
| Unitaire | Types de champ, validation, diff de schéma, diff de contenu |
| Migration | Aller-retour up/down sur les trois bases, avec données existantes |
| Permissions | Matrice complète rôle × action × collection, REST et GraphQL |
| Intégration | Cycle complet : créer → brouillon → publier → modifier → restaurer |
| i18n | Fallback, traduction manquante, les trois stratégies |
| Régression | Migration de schéma de bloc sur du contenu réel |

## Pièges connus

**Le diff de schéma est plus dur qu'il n'y paraît.** Renommer un champ est
indistinguable d'une suppression suivie d'un ajout. Exiger un marqueur explicite
(`renamedFrom`) plutôt que deviner — deviner détruit des données.

**Le full-text diffère radicalement entre dialectes.** Postgres a `tsvector`, MySQL a
`FULLTEXT`, SQLite a FTS5. Encapsuler derrière une interface commune et accepter des
résultats de qualité inégale plutôt que réimplémenter un moteur.

**Les relations circulaires.** Une requête profonde peut boucler. Imposer une profondeur
maximale configurable, avec valeur par défaut basse.

**GraphQL et N+1.** Prévoir un dataloader dès la première implémentation, pas après le
premier rapport de lenteur.

## Hors périmètre

Interface d'administration, rendu, agents, recherche vectorielle (elle arrive en L4 avec
le RAG).
