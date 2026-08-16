# Guide de l'éditeur

Ce guide s'adresse à la personne qui rédige, publie et gère le contenu d'un site
Cogenta au quotidien — pas à qui l'a installé ou développé. Aucune connaissance
technique n'est nécessaire : tout se passe dans l'interface d'administration, dans
un navigateur.

Pour l'installation et la configuration technique du site, voir
[`getting-started.md`](getting-started.md) (documentation développeur).

## Premiers pas

### Se connecter

L'écran de connexion propose deux méthodes :

- **Une clé d'accès (passkey)** — la méthode recommandée. Un bouton « Se connecter
  avec une clé d'accès » déclenche la vérification proposée par l'appareil (empreinte,
  visage, code de l'appareil). Aucun mot de passe à retenir.
- **E-mail et mot de passe**, en secours. Si un code de vérification à usage unique
  (TOTP) a été activé sur le compte, il est demandé après le mot de passe. S'il n'a
  jamais été configuré, l'écran propose de le mettre en place à cet instant, avec une
  clé à enregistrer dans une application d'authentification.

### Le tableau de bord

Première page après connexion. Elle montre, pour qui a le rôle administrateur :

- **L'état du site** — base de données et stockage des fichiers, avec leur statut.
- **L'activité récente** — les dernières actions enregistrées (qui a fait quoi,
  quand), un aperçu de l'écran Historique décrit plus bas.
- **Le contenu programmé** — les entrées dont la publication est prévue à une date
  future, visible par tout le monde, pas seulement les administrateurs.

Trois autres encarts (vulnérabilités connues, performance du site, sauvegardes)
existent dans l'interface mais n'affichent encore aucune donnée : aucun mécanisme ne
les alimente pour l'instant. Ce n'est pas un bug — l'interface ne invente pas de
chiffres qu'elle ne peut pas garantir.

## Gérer le contenu

### Qu'est-ce qu'une collection ?

Une **collection** est un type de contenu : « Articles », « Pages », « Catégories »...
Chaque site est configuré avec ses propres collections selon ses besoins — un blog a
des articles et des catégories, un site vitrine a des services et des témoignages.
L'écran « Collections » (menu principal) liste celles que le compte connecté a le
droit de consulter, et ouvre sur la liste des entrées de la collection choisie.

### Consulter et filtrer une liste

Chaque collection affiche ses entrées dans un tableau : titre, identifiant, statut,
date de dernière modification. Il est possible de :

- **Filtrer par statut** (brouillon, programmé, publié, archivé).
- **Trier** en cliquant sur les colonnes « Identifiant » ou « Dernière modification ».
- **Sélectionner plusieurs entrées et les supprimer en une fois**, si le rôle du
  compte le permet.
- **Naviguer page par page** avec les boutons « Précédent »/« Suivant ».

### Créer et modifier une entrée

Le bouton « Nouveau » (visible seulement si le compte a le droit de créer dans cette
collection) ouvre un formulaire vide ; cliquer sur une ligne du tableau ouvre l'entrée
correspondante. Le formulaire ne contient que les champs réellement déclarés pour
cette collection — un titre, un extrait, une image, du texte, selon le type de
contenu. Le bouton « Enregistrer » (ou « Créer ») sauvegarde les modifications.

Le statut d'une entrée (brouillon, programmé, publié, archivé) apparaît dans la liste
et est piloté par le contenu lui-même et sa configuration — il n'existe pas
aujourd'hui de bouton « Publier » séparé dans l'écran d'édition. Si votre équipe a
besoin d'un contrôle de publication plus visible, c'est un point à faire remonter :
ce guide décrit ce qui existe réellement, pas ce qui est prévu.

### Aperçu

Sur une entrée déjà enregistrée, le bouton « Aperçu » ouvre un nouvel onglet vers le
site réel, à l'adresse exacte où ce contenu apparaîtra — pas une simulation dans
l'administration.

### Historique des versions et traductions

En bas de l'écran d'édition, deux outils complémentaires :

- **L'historique des versions** liste les enregistrements précédents de cette entrée
  et permet de revenir à une version antérieure.
- **Le sélecteur de traduction** (si le site gère plusieurs langues) montre les
  traductions existantes de l'entrée et permet d'en créer une nouvelle, pré-remplie à
  partir de la version d'origine.

### Les blocs de contenu

Certains champs (souvent nommés « Contenu » ou « Corps ») se composent de **blocs** :
des éléments visuels que l'on ajoute et réordonne librement plutôt qu'un unique champ
de texte. Le vocabulaire est le même sur tout le CMS, quel que soit le site :

| Bloc | À quoi il sert |
|---|---|
| **Texte (prose)** | Un paragraphe de texte mis en forme — le bloc le plus courant. |
| **Héros (hero)** | Le grand bandeau d'accueil en haut d'une page : titre, texte court, bouton. |
| **Image mise en avant** | Une image accompagnée d'une légende et d'un crédit. |
| **Grille de mises en avant** | Plusieurs éléments courts présentés côte à côte (services, atouts...). |
| **Appel à l'action (cta)** | Un bloc qui pousse vers une action : « Nous contacter », « S'inscrire ». |
| **Galerie** | Plusieurs images présentées ensemble (grille, carrousel...). |
| **Citation** | Un texte mis en avant, avec un auteur optionnel — un témoignage, une phrase clé. |
| **Questions fréquentes (faq)** | Une liste de questions/réponses dépliables. |
| **Chiffres clés (stats)** | Quelques nombres mis en valeur (« 500 clients », « 10 ans d'existence »). |
| **Logos** | Une rangée de logos (partenaires, clients, presse). |
| **Liste de contenus (collectionList)** | Les entrées les plus récentes d'une collection, affichées automatiquement — les derniers articles, par exemple. |
| **Contenu externe (embed)** | Une vidéo ou un contenu d'une autre plateforme (YouTube, Vimeo, Spotify...). |

Chaque bloc ne contient que des informations structurées — jamais de code ni de mise
en forme libre. C'est ce qui permet à un même bloc de s'afficher correctement quel que
soit l'habillage visuel du site.

### Deux façons de composer une page

Au-dessus du formulaire, un sélecteur propose **Formulaire** ou **Composition
visuelle**. Le choix est mémorisé par navigateur ; les deux modifient exactement le
même contenu et le même bouton « Enregistrer ».

- **Formulaire** — chaque bloc est une carte avec ses champs. C'est le seul mode qui
  donne accès à tout : une image à choisir dans la médiathèque, une liste d'éléments,
  un texte riche.
- **Composition visuelle** — la page telle qu'elle sera réellement publiée, dans un
  cadre au milieu de l'écran. Ce n'est pas une imitation : c'est le site lui-même qui
  la fabrique, avec le même moteur et le même habillage que pour un visiteur. Ce que
  vous voyez est ce qui sera publié.

Dans la composition visuelle :

- **Déplacer un bloc** : le faire glisser dans la page, ou utiliser les flèches ↑ ↓ de
  la liste « Blocs de la page » à gauche. Les flèches font exactement la même chose
  que le glisser-déposer — rien dans cet écran ne s'obtient uniquement à la souris.
- **Ajouter un bloc** : le faire glisser depuis « Ajouter un bloc » à l'endroit voulu,
  ou cliquer dessus pour l'ajouter à la fin. Le panneau se filtre par recherche et par
  catégorie.
- **Corriger un texte** : double-cliquer dessus directement dans la page, taper, puis
  cliquer ailleurs (ou appuyer sur Entrée). `Échap` abandonne la correction. Seuls les
  textes simples se modifient ainsi ; un texte riche ou une liste se modifient dans le
  panneau de droite, qui affiche les champs du bloc sélectionné.
- **Annuler / Rétablir** : les boutons de la barre, ou `Ctrl+Z` et `Ctrl+Maj+Z`
  (`⌘` sur Mac).
- **Vérifier l'affichage sur mobile** : les boutons Ordinateur / Tablette / Mobile
  changent réellement la largeur de la page, ils ne la réduisent pas en image.
- **Masquer les repères** enlève les encadrés d'édition, pour voir la page exactement
  comme un visiteur la verra.

La composition visuelle n'est proposée qu'une fois l'entrée enregistrée au moins une
fois : tant qu'elle n'existe pas, il n'y a pas de page réelle à afficher, et l'écran le
dit plutôt que d'inventer un aperçu.

## Médias

L'écran « Médias » centralise les images et fichiers du site.

- **Ajouter un fichier** via le formulaire d'envoi en haut de l'écran.
- **Cliquer sur une vignette** pour voir le détail : renommer, définir le **point
  focal** (la partie de l'image à garder visible quel que soit le recadrage
  automatique), et renseigner le **texte alternatif**.
- Le texte alternatif décrit l'image pour les personnes qui ne peuvent pas la voir
  (lecteurs d'écran) et pour les moteurs de recherche — il est demandé pour chaque
  image, sauf si elle est marquée comme purement décorative.
- **Supprimer** un fichier depuis son détail.

Aucun recadrage manuel ni choix de format n'est proposé : le site produit
automatiquement les variantes nécessaires (tailles, formats) à partir du fichier
d'origine et du point focal choisi.

## Historique et traçabilité

L'écran « Historique » (réservé au rôle administrateur) liste chaque action
enregistrée sur le site : qui (compte et rôle), quoi (action), sur quelle collection
et quelle entrée, à quelle date. Il se filtre par personne, par type d'action et par
collection.

Le bouton « Vérifier » contrôle que cet historique n'a pas été altéré : chaque entrée
est liée mathématiquement à la précédente, donc toute modification a posteriori serait
détectable. C'est la garantie qu'un historique consulté ici reflète bien ce qui s'est
réellement passé.

## Agents

Un **agent** est un assistant automatisé — un programme qui peut surveiller ou
améliorer certains aspects du site (par exemple relire le référencement d'un article,
ou surveiller des failles de sécurité connues) une fois configuré avec un accès à un
fournisseur d'intelligence artificielle.

L'écran « Agents » (réservé au rôle administrateur) liste les agents disponibles sur
le site, leur état (activé/désactivé), leur niveau d'autonomie et leur budget
d'utilisation. Cliquer sur le nom d'un agent affiche son historique d'actions et ses
traces d'exécution récentes.

**À noter honnêtement** : un blueprint (le modèle de départ choisi à l'installation
du site) peut *recommander* des agents adaptés à ce type de site, sans qu'aucun ne
soit réellement programmé pour s'exécuter automatiquement — activer un agent ici ne
suffit pas à lui seul à le faire tourner en continu si rien d'autre sur le site n'est
configuré pour le déclencher. Si cet écran affiche « aucun agent », c'est qu'aucun
n'a encore été mis en place sur ce site, pas un défaut de l'interface.

## Réglages

L'écran « Réglages » (accessible à tout compte connecté, sur son propre profil)
permet :

- de **changer la langue de l'interface d'administration** (français ou anglais —
  une préférence personnelle, sans effet sur le contenu du site) ;
- d'**ajouter une clé d'accès (passkey)** supplémentaire au compte, avec un nom pour
  la reconnaître (« Ordinateur du bureau », « Téléphone »...).

Aucun autre réglage de site (nom, langue par défaut, apparence...) n'est modifiable
depuis cet écran aujourd'hui — ces paramètres se configurent à l'installation ou par
un développeur, pas depuis l'interface d'administration.

## Apparence du site

L'apparence visuelle (couleurs, typographies, espacements — ce que Cogenta appelle un
« skin ») se décide à l'installation du site : soit en gardant l'habillage par défaut,
soit en le décrivant en langage naturel (secteur d'activité, ambiance recherchée,
couleurs de marque) pour qu'une IA propose un jeu de couleurs et de polices assorti,
automatiquement vérifié pour rester lisible (contrastes suffisants, tailles de texte
cohérentes) avant d'être appliqué.

L'interface d'administration ne propose aujourd'hui aucun écran pour changer cette
apparence après coup — une nouvelle apparence se génère ou s'applique via la personne
qui a installé ou qui maintient techniquement le site.
