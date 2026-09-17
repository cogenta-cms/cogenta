# L40 — Trier et filtrer par la date propre à une collection

> Quatrième point de la série engagée le 2026-09-17. **Reporté par l'utilisateur le 2026-09-17**
> (« option C ») : la conception et l'ADR restent prêtes pour le jour où on le reprend.
> **Conçu, pas codé** : il touche le
> contrat A (le tri du magasin) et l'interprétation du filtre d'un bloc du contrat B, donc
> l'ADR ci-dessous doit être validée et insérée d'abord (`docs/03-decisions.md` est protégé).

## Le problème

Une liste de contenus (bloc, widget, API) ne trie que par `id`, `createdAt` ou `updatedAt`
(`SortField`). Une association ne peut donc pas afficher **ses prochains événements** : il
faudrait trier par la date *de l'événement* — un champ `datetime` déclaré — et ne garder que
ceux qui ne sont pas passés. Aujourd'hui l'événement le plus lointain arrive en premier, daté
de sa création. L'agent du thème Association avait renoncé au widget pour cette raison (L30).

## Deux obstacles, et pourquoi ils demandent une décision

1. **Le curseur suppose un ordre total.** La pagination est par curseur (jamais par offset,
   L1), et `SortField` exclut délibérément tout champ pouvant être vide : un brouillon
   incomplet n'a pas de date d'événement. Or les trois moteurs ne rangent pas les valeurs
   vides au même endroit (Postgres les met en dernier en ordre croissant, MySQL et SQLite en
   premier).
2. **« À partir de maintenant » n'est pas une valeur figée.** Le filtre d'un bloc
   `collectionList` est une donnée enregistrée (contrat B) ; « date ≥ aujourd'hui » exige une
   valeur relative, évaluée à chaque rendu.

## Conception proposée

- **Tri** : `SortOrder.field` accepte en plus le nom d'un champ déclaré de type `date` ou
  `datetime` ayant une colonne. Ordre écrit explicitement, identique sur les trois moteurs :
  `case when col is null then 1 else 0 end, col <sens>, id <sens>` — **les valeurs vides
  toujours en dernier**, quel que soit le sens. Le curseur porte `value: string | null` : sur
  une valeur, « strictement après, ou vide » ; dans la queue des vides, « vide et id après ».
- **Filtre relatif** : dans le filtre d'une liste, la chaîne `"$now"` (et `"$today"` pour un
  champ `date`) est remplacée par l'instant du rendu, **par la couche API**, jamais stockée
  résolue. Une valeur qui n'est pas exactement ce jeton reste une valeur littérale.
- **Rendu** : une page contenant un tel filtre ne peut pas être mise en cache indéfiniment ;
  sa durée de cache publique est plafonnée (par exemple une heure).
- **Admin** : le champ « Trier par » d'une liste propose les dates déclarées de la collection
  choisie ; un réglage « Seulement à venir » écrit le filtre relatif.
- **Démos** : la page Agenda de l'association liste les événements à venir.

## ADR à insérer (texte proposé)

```
## ADR-0038 — Trier par une date déclarée, filtrer relativement à maintenant

Statut : proposée, 2026-09-17.

Contexte. Le magasin de contenu ne trie que par id, createdAt et updatedAt, parce que
la pagination par curseur exige un ordre total et qu'un champ déclaré peut être vide.
Une liste « prochains événements » est impossible. Le filtre d'un bloc collectionList
est une donnée figée : il ne sait pas dire « à partir de maintenant ».

Décision.
1. SortOrder.field accepte un champ déclaré date ou datetime avec colonne. Les valeurs
   vides sont toujours classées en dernier, par un ordre écrit explicitement (case when
   … is null), identique sur Postgres, MySQL/MariaDB et SQLite ; le curseur porte une
   valeur nullable. Contrat A monté en schema@2.4, mineure et additive.
2. Dans le filtre d'une liste, les jetons exacts "$now" et "$today" sont résolus par la
   couche API à chaque requête. Le contrat B ne change pas de forme : le filtre reste un
   objet opaque ; seule son interprétation gagne deux jetons. Une page qui en dépend a une
   durée de cache publique plafonnée.

Conséquences. Les tests de pagination par date vide doivent tourner sur les trois bases
avant la publication (Docker requis). Les autres jetons relatifs (« dans 7 jours ») sont
écartés tant qu'aucun besoin réel ne les demande.
```

## Ce qui manque pour le faire correctement

Les tests d'intégration **Postgres, MySQL et MariaDB** : le rangement des valeurs vides est
précisément ce qui diffère entre moteurs, et Docker ne répond pas sur cette machine. Coder
sans les exécuter serait livrer la partie la plus fragile sans preuve.
