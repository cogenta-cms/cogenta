# L40 — Trier et filtrer par la date propre à une collection

> Quatrième point de la série engagée le 2026-09-17. Reporté le matin (« option C »),
> **repris et implémenté le même jour** à la demande de l'utilisateur.
> **ADR-0038 reste à insérer à la main** (`docs/03-decisions.md` est protégé en écriture) :
> le texte ci-dessous est celui que le code implémente, mot pour mot.

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


## Ce qui a été livré (2026-09-17)

- **`@cogenta/schema`** : `SortOrder.field` accepte le nom d'un champ `date`/`datetime`
  déclaré ; ordre écrit explicitement (`case when … is null then 1 else 0 end`) donc les
  entrées sans date sont **dernières dans les deux sens**, sur les trois moteurs ; curseur
  `value: string | null`, la queue des vides se pagine comme le reste ; tout autre champ est
  refusé (`CONTENT_INVALID`, message nommant la collection). Trois cas ajoutés à la suite de
  contrat unique — donc rejoués tels quels contre Postgres, MySQL et MariaDB dès que Docker
  répond.
- **`@cogenta/api`** : REST et GraphQL acceptent le nouveau tri (GraphQL vérifie le champ
  contre la définition, REST laisse le magasin refuser en nommant la collection) ; le curseur
  minté par la couche API lit la même valeur que le magasin ; `$now`/`$today` sont résolus
  **une seule fois par requête**, dans `resolveRelativeFilter`, partagé par les deux
  transports — un parcours qui s'étale sur plusieurs pages ne compare donc pas ses premières
  lignes à un instant et ses dernières à un autre.
- **`@cogenta/cli`** : le filtre d'un bloc `collectionList` accepte `{ champ: { gte: … } }`
  en plus d'une valeur nue (contrat B inchangé, son filtre a toujours été un objet opaque) ;
  une page dont un bloc dépend de l'heure voit son `cache-control` public plafonné à une
  heure (`clockDependentCacheControl`), jamais élargi, et une requête portant des
  identifiants reste `private, no-store`.
- **`@cogenta/admin`** : « Trier par » propose les dates déclarées de la collection listée ;
  une case « Seulement à venir » apparaît quand la liste est triée sur l'une d'elles et écrit
  `{ <date>: { gte: '$now' } }` — la décocher ne retire que cette condition, jamais un filtre
  écrit à la main à côté.
- **`@cogenta/starters`** : les listes d'événements de l'association sont triées par la date
  de l'événement et coupées à « maintenant » — une soirée passée quitte la page toute seule.
- **Vérifié** : suite de contrat du magasin (SQLite), quatre tests de bout en bout sur un vrai
  serveur (`packages/cli/test/serve-collection-date.test.ts` : ordre réel, passé exclu, sans
  date exclu, plafond de cache appliqué et *non* appliqué ailleurs, refus d'un tri sur un
  texte), tests purs du commutateur admin.

**Reste vrai** : le rangement des valeurs vides est précisément ce qui diffère entre moteurs,
et Postgres/MySQL/MariaDB n'ont pas pu être exécutés ici (Docker répond 500 sur cette
machine). Les cas sont écrits dans la suite de contrat partagée, donc rien n'est à écrire
pour les jouer là-bas.

## Revue dialectes (`db-dialect-specialist`) — deux défauts réels, corrigés

Le SQL émis est identique sur les quatre dialectes (seules la citation d'identifiant et
la forme des paramètres changent), et le prédicat de curseur couvre exactement l'ordre
décrit, dans les deux sens. Trois choses en sont sorties :

1. **Défaut bloquant, corrigé** : le curseur lisait `entry.values`, alors que
   `order by` porte sur la colonne. En `state: 'working'`, les valeurs d'une entrée
   viennent de l'instantané de la dernière version — un brouillon en attente qui déplace
   une date faisait donc demander à la page suivante une position que l'ordre n'avait
   jamais eue, et **toutes les lignes suivantes disparaissaient en silence**. Reproduit
   sur une vraie base SQLite fichier (4 entrées, 2 perdues). Le curseur est désormais
   minté depuis **la ligne triée** ; un cas de la suite de contrat rejoue exactement ce
   scénario. Côté `@cogenta/api`, qui n'a que l'entrée, le tri par date déclarée est
   **refusé sur les entrées non publiées** avec un message qui dit pourquoi, plutôt que
   de reproduire le même piège à un deuxième endroit.
2. **Incohérence latente, corrigée** : `''` était traité comme « pas de valeur » par le
   curseur alors qu'il aurait été stocké comme une valeur — et aurait trié **en
   premier**. Il n'était pas atteignable par l'API (`new Date('')` échouait en 422), ce
   qui était par ailleurs un vrai défaut de l'admin : vider un champ date envoie `''` et
   se faisait refuser. Une date vidée vaut désormais `null`, avant le contrôle
   d'obligation, donc une date requise vidée est toujours refusée comme manquante.
3. **Limite assumée, écrite plutôt que découverte** : l'expression
   `case when … is null` rend ce tri **non indexable** sur les quatre moteurs (Postgres
   ne matche pas de pathkey, MySQL/MariaDB font un filesort, SQLite construit un B-tree
   temporaire). Avec `limit`, le tri reste borné en mémoire, mais toutes les lignes du
   `where` sont lues : sur une collection de plusieurs milliers d'entrées, une
   pagination profonde par date coûte cher. La sortie propre, si cela devient un sujet,
   est une marche en deux temps (d'abord `col is not null`, indexable ; puis la queue
   des vides par identifiant) — une réécriture, pas un correctif, donc tracée ici.

Deux autres constats de la revue, tenus pour des limites et non des défauts :

- **GraphQL ne propose pas ce tri** : son enum `EntrySortField` est fermé aux trois
  colonnes système, et l'ouvrir demanderait un enum construit par collection (les dates
  de `event` ne sont pas celles de `article`). REST le fait, et valide le champ contre
  la collection réellement listée. Le commentaire devenu faux dans `scalars.ts` a été
  corrigé.
- **Un filtre « à venir » sur une collection à très gros passé** est appliqué au-dessus
  du magasin, donc un parcours ascendant peut dépenser son budget de balayage sur des
  entrées passées avant d'atteindre les prochaines. Sur les volumes que ce lot sert
  (l'agenda d'une association, quelques centaines d'entrées) c'est sans effet ; au-delà,
  la bonne réponse est de pousser la borne dans le curseur de départ plutôt que
  d'élargir le budget.
