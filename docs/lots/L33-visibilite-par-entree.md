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

Contrat A monté en **`schema@2.3`** : additif, une migration réversible, sur le
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
| 1 | Contrat A `schema@2.3` : `visibility` + le hash, migration réversible, magasin (poser/retirer un mot de passe sans jamais le relire) | **fait** |
| 2 | Lecture filtrée : la porte par entrée apprend la visibilité, REST et GraphQL la traversent, sitemap et recherche excluent | **fait** |
| 3 | La page protégée : formulaire, vérification, cookie signé, et le rendu réel derrière | **fait** |
| 4 | L'admin : le contrôle « Visibilité » de l'éditeur d'entrée, façon WordPress | **fait** |
| 5 | ADR-0037, documentation, tests de bout en bout | **fait** |

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


## Rapport de clôture (2026-09-16)

**Le champ.** `visibility` est le troisième champ **orthogonal au statut**,
après `deletedAt` (ADR-0022) et `reviewState` (ADR-0027) : une page privée est
`published` *et* privée. Aucun `switch` exhaustif sur `ContentStatus` n'a bougé,
et un client écrit avant ce lot lit exactement les statuts qu'il a toujours lus.
Le mot de passe n'existe jamais en clair : le magasin garde une empreinte
calculée par l'appelant, n'offre **aucun moyen de la relire**, et vérifie en
recevant la comparaison — donc aucune réponse ne peut la sérialiser par
accident. Rouvrir une page efface l'empreinte : un ancien déverrouillage ne peut
pas la rouvrir plus tard.

**La lecture.** La porte qui filtrait déjà les brouillons filtre les entrées
restreintes, écrite une fois dans la couche que les deux transports partagent :
par identifiant, en liste, à travers une relation chargée par le dataloader, en
GraphQL. Une page protégée n'est **pas** filtrée — elle existe et on peut lui
faire un lien — mais les deux sortent du sitemap et de l'index de recherche, où
un extrait *est* le contenu.

**La page verrouillée** est la page elle-même : l'en-tête du thème, le titre de
l'entrée, son pied de page, et un formulaire là où le contenu serait. Zéro
JavaScript. La preuve de déverrouillage reprend la forme des jetons de
prévisualisation (signée, jamais chiffrée, HMAC-SHA256, comparaison à temps
constant, version dans la charge utile), accorde **une** entrée, expire, et
voyage dans un cookie `HttpOnly; SameSite=Lax` nommé d'après une empreinte de
l'identifiant plutôt que d'après l'identifiant.

**La permission empruntée.** Changer la visibilité exige `publish`, pas
`update` — comme la corbeille emprunte `delete` : les cinq actions du contrat A
sont figées, et qui peut lire une page est ce que « publier » décide.

### Trois choses que seul un essai réel a trouvées

1. **Changer la visibilité ne réindexait pas** : une note passée en privé
   gardait son extrait dans la recherche du site. Le décorateur d'indexation
   ignorait la nouvelle écriture.
2. **Un site créé avant ce lot ne gagnait jamais les colonnes** — `create table
   if not exists` ne touche pas une table existante, donc *toute* écriture
   échouait après une mise à jour. `createSchemaTables` réconcilie désormais les
   colonnes **système du magasin**, et seulement elles : un champ déclaré par un
   développeur reste une vraie migration.
3. **Une page verrouillée se décrivait aux robots** : son résumé partait dans la
   `meta description` et le JSON-LD. Elle est maintenant rendue sans extrait et
   décrite par son seul titre, en `noindex`.

### Vérifié

`@cogenta/schema` 716, `@cogenta/api` 1 294, suites de rendu et SEO de la CLI
157, écran d'édition de l'admin 45 — verts. Trois tests de bout en bout sur un
vrai serveur (404 pour un visiteur / page pour un éditeur ; formulaire, mauvais
mot de passe sans cookie, bon mot de passe avec `no-store` ; redirection ouverte
refusée et sitemap propre) et le parcours complet dans un navigateur sur
`examples/local-playground`.

### Reste ouvert

- ~~Pas de limitation de débit sur `/_cogenta/unlock`~~ — **fait juste après la
  clôture** : dix essais par adresse **et par entrée**, sur dix minutes, par le
  pilote `rateLimit` déjà présent (Redis quand il est configuré, compteur en
  mémoire sinon). Compté **avant** la vérification et quelle que soit
  l'existence de l'entrée — une réponse plus rapide pour un identifiant inconnu
  dirait lesquels sont réels. Par adresse *et* par entrée, pour qu'un attaquant
  n'épuise que son propre budget sur la page qu'il attaque au lieu de verrouiller
  tous les lecteurs de toutes les pages protégées ; une bonne réponse remet le
  compteur à zéro, pour que deux fautes de frappe suivies d'un succès ne suivent
  pas le lecteur à sa prochaine visite. Le formulaire distingue « mot de passe
  faux » de « trop d'essais », et la réponse porte un `Retry-After`.
- **Pas de partage de déverrouillage entre appareils** : le cookie est celui de
  ce navigateur, ce qui est le comportement de WordPress et le seul honnête sans
  compte.
- **Le contrôle n'apparaît pas à la création** d'une entrée, seulement après le
  premier enregistrement — il faut une entrée pour lui donner une visibilité.

## ADR-0037

Insérée le 2026-09-16 dans `docs/03-decisions.md`, qui fait foi.
