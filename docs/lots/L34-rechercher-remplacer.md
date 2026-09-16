# L34 — Rechercher et remplacer dans tout le contenu

> Deuxième manque de l'inventaire WordPress. Ce n'est pas dans le cœur de
> WordPress ; c'est le premier greffon qu'installe quiconque a déjà changé de
> nom de marque, de domaine ou de dénomination légale.

## Le problème

Une marque change de nom, un domaine bouge, une formule juridique est corrigée :
il faut alors ouvrir cent entrées et les modifier une par une, ou bien écrire du
SQL à la main sur une base de production. Les deux sont mauvais — le second
contourne la validation, les versions, l'index de recherche et le journal.

## La décision qui tient tout : on montre avant d'écrire

**Un remplacement est toujours en deux temps** : un aperçu qui dit exactement
quelles entrées changeraient et comment, puis une application explicite de ce
qui vient d'être montré. Jamais un bouton qui écrit directement, jamais un
« ça a marché » sans que personne ait vu quoi.

Corollaire : l'application passe par les **mêmes écritures que l'éditeur** —
`update` sur le magasin, donc validation du contrat A, nouvelle version dans
l'historique, réindexation, événements de contenu. Un remplacement se défait
donc entrée par entrée depuis l'onglet Historique, comme n'importe quelle
modification. Rien de tout cela n'est vrai d'un `UPDATE ... SET` en base, et
c'est précisément pourquoi l'outil existe.

## Ce que l'outil touche, et ce qu'il ne touche pas

| | Touché | Pourquoi |
|---|---|---|
| Champs texte simples | oui | c'est le cas courant |
| Texte riche (portable text) | oui, dans les `span` | le contenu y vit ; les marques et les liens restent intacts |
| Texte dans les blocs | oui | dans ce CMS, la page *est* une liste de blocs |
| Slugs | **non** | changer un slug casse silencieusement toutes les URL ; ça se fait à l'unité, avec une redirection |
| Champs système, identifiants, relations | **non** | ce ne sont pas du texte, ce sont des liens |
| Média, nombres, booléens | **non** | rien à remplacer |

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 1 | Le moteur : une fonction pure qui, pour une entrée, dit où se trouvent les occurrences et ce que deviendrait le texte — champs simples, texte riche, blocs | **fait** |
| 2 | L'aperçu et l'application : route admin, permissions par collection, écriture par le magasin (versions, index, événements), journal d'audit | **fait** |
| 3 | L'écran : chercher, remplacer, portée, aperçu entrée par entrée, application confirmée | **fait** |
| 4 | Documentation et clôture | **fait** |

## Pièges connus, écrits avant de coder

1. **Un aperçu périmé.** Entre l'aperçu et l'application, quelqu'un peut avoir
   modifié une entrée. L'application doit donc porter sur ce qu'elle relit au
   moment d'écrire, et signaler ce qui a bougé plutôt que d'écraser.
2. **Le texte riche n'est pas une chaîne.** Remplacer dans du portable text se
   fait `span` par `span` : concaténer les spans pour faire un `replace` global
   perdrait les marques, les liens et les clés.
3. **Une occurrence à cheval sur deux spans** (« Cogen|ta » coupé par un
   *strong*) ne sera pas trouvée. C'est une limite assumée : recoller les spans
   pour la trouver, c'est réécrire la mise en forme de la phrase.
4. **La casse et les accents.** Le défaut est sensible à la casse, parce qu'un
   remplacement de marque l'est presque toujours ; l'insensibilité est une
   option, jamais le défaut silencieux.
5. **Le volume.** Un remplacement sur dix mille entrées ne doit ni tenir en
   mémoire ni bloquer le serveur : l'aperçu est borné et paginé, et il dit
   combien d'entrées il n'a pas regardées.

## Rapport de clôture (2026-09-16)

**Le moteur** (`@cogenta/schema`, `planEntryReplacement`) est une fonction
pure : elle lit une entrée et rend un *plan* — où sont les occurrences, ce que
deviendrait chaque texte, et les valeurs à écrire — sans jamais écrire. L'aperçu
et l'application appellent **la même fonction**, ce qui est la seule façon
honnête de promettre qu'on applique ce qui a été montré. Elle parcourt les
champs `text` et `richText` déclarés et le texte des blocs ; elle saute par
construction les clés d'identité (`_key`, `_type`, `id`, `href`, `collection`,
`media`, `marks`…), donc ni un lien, ni une référence de média, ni la mise en
forme d'un span ne peuvent être réécrits. Un slug n'est jamais touché. Le plan
nomme l'entrée par son titre, dérivé avec la même priorité que l'index de
recherche.

**La route** (`POST /api/content/-/replace`, `@cogenta/api`) est un aperçu
sauf si `apply: true` est envoyé. Elle ne parcourt que les collections où
l'acteur a `update` — pas `read` : un aperçu montre le texte autour de chaque
occurrence, et un outil d'édition ne doit pas devenir un moyen de lire en masse.
L'aperçu est borné (50 par défaut, 500 au plus) et dit quand il s'est arrêté.
L'application **relit et replanifie chaque entrée au moment d'écrire** — une
entrée modifiée entre-temps n'est pas écrasée, elle est comptée à part — et
écrit par `store.update` : validation du contrat A, nouvelle version, index de
recherche, événements de contenu. `cogenta serve` inscrit au journal d'audit
chaque entrée écrite (`content.replace`, avec l'expression et son remplacement).

**L'écran** (Contenu → Rechercher et remplacer) ne montre le bouton qui écrit
qu'une fois un aperçu affiché, demande une confirmation, et jette l'aperçu dès
que l'expression, le remplacement ou une option change.

Aucun contrat n'a bougé : une fonction et une route ajoutées, pas d'ADR.

### Ce que seul un essai réel a trouvé

1. **L'audit ignorait tout ce lot, et L33 avec.** Le journal d'audit de
   `cogenta serve` sautait l'espace de noms `-` (celui de la route) et ne
   connaissait pas l'action `visibility` : un changement de visibilité, depuis
   `schema@2.2`, n'était inscrit nulle part. Les deux le sont.
2. **L'aperçu était illisible sur du vrai contenu.** Sur le playground, la
   première capture montrait « page · 01a0a6a4 » à la place du titre, des
   chemins `blocks.blocks[2].data.heading` qui chevauchaient le texte, et
   « 2 occurrence(s) ». Le plan porte désormais le titre, le chemin se lit
   « Bloc 3 · heading », et les pluriels sont de vrais pluriels.
3. **Un remplacement qui contient l'expression se réapplique.** « Cogenta » →
   « Cogenta SA » : relancer la recherche — exactement ce que l'écran conseille
   quand l'aperçu est tronqué — retrouve les mêmes entrées, et un second passage
   écrirait « Cogenta SA SA ». L'écran le dit avant la première application.

### Vérifié

`@cogenta/schema` (moteur, 9 tests), `@cogenta/api` (route : aperçu sans
écriture, application, permissions par collection, entrée modifiée entre les
deux, troncature, expression vide refusée — 6 tests), `@cogenta/cli` (audit sur
un vrai serveur), `@cogenta/admin` (écran, 5 tests, parité des locales). Parcours
complet dans un navigateur sur `examples/local-playground` : aperçu sur la page
*About*, confirmation, application, nouvelle recherche vide, puis remplacement
inverse rendant le contenu d'origine.

### Reste ouvert, assumé

- **Une occurrence coupée par une mise en forme** (« Cogen**ta** ») n'est pas
  trouvée : la recoller réécrirait la mise en forme de la phrase.
- **Pas d'annulation groupée** : un remplacement se défait entrée par entrée
  depuis l'historique. Une annulation en un clic demanderait de mémoriser un
  lot de versions ; rien ne l'exige tant que l'aperçu précède l'écriture.
- **Pas d'expressions régulières.** Volontaire : un remplacement en masse sur
  un site vivant par une expression que peu de rédacteurs savent relire est
  exactement ce que l'aperçu cherche à éviter.
- **Pas de portée par collection dans l'écran** : la route accepte
  `collections`, l'écran cherche partout où l'on peut modifier.
