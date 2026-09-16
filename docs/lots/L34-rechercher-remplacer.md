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
| 1 | Le moteur : une fonction pure qui, pour une entrée, dit où se trouvent les occurrences et ce que deviendrait le texte — champs simples, texte riche, blocs | à faire |
| 2 | L'aperçu et l'application : route admin, permissions par collection, écriture par le magasin (versions, index, événements), journal d'audit | à faire |
| 3 | L'écran : chercher, remplacer, portée, aperçu entrée par entrée, application confirmée | à faire |
| 4 | Documentation et clôture | à faire |

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
