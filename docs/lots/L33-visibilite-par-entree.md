# L33 — La visibilité d'une entrée : privée, protégée par mot de passe

> Demandé après un inventaire de ce que WordPress a et que Cogenta n'a pas.
> C'est le premier manque de la liste, et le seul qui soit du WordPress *cœur*.

## Le problème

Une entrée est aujourd'hui `draft`, `scheduled`, `published` ou `archived`, et
c'est tout. Il n'existe aucune façon de dire :

- « cette page n'est visible que par les gens qui peuvent l'éditer » (WordPress :
  *Privé*) — la note interne, la page d'équipe, l'article en cours de validation
  qu'on veut montrer en vrai sans le publier ;
- « cette page est publiée, mais il faut un mot de passe pour la lire »
  (WordPress : *Protégé par un mot de passe*) — le dossier de presse, la page
  d'un client, le contenu réservé.

Publier ou ne pas publier est un choix binaire, et les gens contournent le
manque en dépubliant, ce qui casse les liens.

## La décision qui tient tout : la visibilité est orthogonale au statut

Exactement comme `deletedAt` (ADR-0022) et `reviewState` (ADR-0027) :
**`visibility` n'est pas une valeur de `ContentStatus`**. Une page privée est
`published` *et* privée ; la rendre publique ne la republie pas, cela lève une
restriction. Conséquences directes :

- chaque `switch` sur `ContentStatus` du dépôt reste exhaustif, sans une ligne
  à changer ;
- un client écrit avant ce lot lit exactement les statuts qu'il a toujours lus ;
- « privé » et « planifié » se combinent sans se contredire.

Contrat A monté en **`schema@2.2`** : additif, une migration réversible, sur le
modèle exact de `schema21Migration`.

## Les règles de lecture, énoncées avant de coder

| | Listée ? | Page | Sitemap / recherche / flux |
|---|---|---|---|
| `public` | oui | rendue | oui |
| `private` | **non**, pour qui ne peut pas l'éditer | **404**, jamais 403 | non |
| `password` | oui (le titre existe) | formulaire, puis contenu | **non** |

Trois choix à défendre :

1. **404 et non 403 pour une entrée privée.** Un 403 dirait « il y a quelque
   chose ici » — pour une note interne, l'existence est déjà l'information.
   WordPress fait le même choix.
2. **Qui voit une entrée privée** : un acteur à qui la couche de permissions
   accorde `update` sur la collection — c'est-à-dire quelqu'un qui pourrait
   l'éditer. Pas « l'auteur », parce que le contrat A n'a pas de notion d'auteur
   propriétaire et l'inventer ici serait un second système de permissions.
3. **Une page protégée reste hors du sitemap et de la recherche.** Elle est
   listée là où un humain navigue (elle existe, on peut la demander), mais
   indexer une page que personne ne peut lire est du bruit pour un moteur.

## Le mot de passe

Jamais en clair : hash par la primitive de `@cogenta/auth`, jamais renvoyé par
une lecture, jamais présent dans une réponse d'API. Le déverrouillage est un
POST qui, en cas de succès, pose un **cookie signé, limité à cette entrée**, de
durée courte — le même mécanisme que les jetons de prévisualisation existants,
pas un second.

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 1 | Contrat A `schema@2.2` : `visibility` + le hash, migration réversible, magasin (poser/retirer un mot de passe sans jamais le relire) | à faire |
| 2 | Lecture filtrée : la porte par entrée de `draft-access.ts` apprend la visibilité, REST et GraphQL la traversent, sitemap/recherche/flux excluent | à faire |
| 3 | La page protégée : formulaire, vérification, cookie signé, et le rendu réel derrière | à faire |
| 4 | L'admin : le contrôle « Visibilité » de l'éditeur d'entrée, façon WordPress | à faire |
| 5 | ADR-0034, documentation, tests de bout en bout | à faire |

## Pièges connus, écrits avant de coder

1. **La fuite par la liste.** Filtrer la page rendue ne suffit pas : une entrée
   privée ne doit apparaître ni dans `/api/content/...`, ni dans GraphQL, ni
   dans la recherche, ni dans un bloc `collectionList`, ni dans un widget
   « articles récents ». Le filtre doit vivre là où les deux transports passent
   déjà, pas à quatre endroits.
2. **La fuite par la traduction.** Une page privée traduite doit rester privée
   dans chaque langue : la visibilité appartient à l'entrée, pas à la famille.
3. **Le mot de passe dans un journal.** Le POST de déverrouillage ne doit jamais
   voir son corps journalisé, et le mot de passe ne doit pas passer en query
   string.
4. **Le cache.** Une page protégée déverrouillée est `private, no-store` — la
   règle existe déjà pour les requêtes portant des identifiants (L10), il faut
   qu'elle s'applique ici aussi.
