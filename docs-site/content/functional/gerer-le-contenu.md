---
title: Gérer le contenu
order: 2
---

# Gérer le contenu

Le cœur de Cogenta. Tout contenu — un article, une page, une fiche produit —
existe comme une **entrée** d'une **collection** (`/collections`), un type
défini une fois pour toutes dans le schéma du site (`defineCollection()`,
contrat A). Cette page couvre le cycle de vie complet d'une entrée : créer,
classer, traduire, faire relire, publier, corriger, mettre à la corbeille.

## Créer et modifier une entrée

Chaque collection a son propre formulaire, généré depuis son schéma — un
champ texte, une image, une relation vers une autre collection, une zone de
blocs, se comportent différemment mais vivent dans le même écran. Une
sauvegarde automatique protège une saisie longue sans intervention (le
brouillon en cours n'est jamais confondu avec la dernière version publiée).

**L'onglet Historique** d'une entrée liste chaque version enregistrée, avec
un diff mot à mot entre deux versions et une restauration en un clic — la
restauration crée une nouvelle version, elle ne réécrit jamais silencieusement
l'historique.

## Blocs de page

Une entrée qui a une zone de blocs (`f.blocks()`) peut être composée
visuellement : voir [Personnaliser l'apparence](personnaliser-lapparence.html)
pour le constructeur de page. Un bloc ne stocke jamais de HTML ni de style —
seulement de la donnée sémantique (contrat B) — ce qui est ce qui permet à un
changement de thème de ne jamais perdre de contenu.

## Classer avec les taxonomies

`/taxonomies` gère les taxonomies natives du site (catégories, tags — ou
n'importe quel classement propre à votre contenu). Une taxonomie est un
arbre de termes, indépendant du contenu qu'elle classe : renommer un terme ne
touche aucune entrée, et un même terme peut classer des entrées de
collections différentes. Un terme n'est **pas** un contenu publiable — pas de
brouillon, pas de traduction séparée par langue, juste un libellé par langue
sur le même terme (« Cuisine » et « Cooking » sont un seul concept, pas deux
entrées liées).

## Le workflow de relecture

Optionnel, activé par collection. Quand il l'est, une entrée passe par
`/review` avant publication : soumettre pour relecture, approuver, ou
demander des modifications — trois transitions, jamais un raccourci qui saute
l'étape. **Approuver n'est pas publier** : approuver autorise, un rôle
distinct (`publish`) décide encore du moment. Une collection sans workflow
activé se comporte exactement comme avant — rien n'y répond différemment.

## La corbeille

`/trash` — mettre une entrée à la corbeille n'efface plus rien : ses
versions, ses blocs, ses relations restent en place, ce qui est ce qui rend
`untrash()` capable de rendre l'entrée exactement telle qu'elle était. Une
entrée publiée mise à la corbeille reste `published` en mémoire — la corbeille
et le statut de publication sont deux informations indépendantes. Une entrée
oubliée en corbeille est purgée définitivement après un délai configurable
(30 jours par défaut) ; la purger à la main avant ce délai est la seule
action réellement irréversible de cet écran, et l'admin le dit avant de
confirmer.

Une entrée encore référencée par une relation (« restrict », le défaut) ne
peut pas être mise à la corbeille tant que la référence existe — l'erreur
nomme ce qui bloque plutôt que d'échouer silencieusement.

## Traduire

`/translations` — chaque langue d'un même contenu est **sa propre entrée**,
liée aux autres par une famille de traduction commune. Une langue peut être
publiée pendant qu'une autre reste en brouillon ; un champ non traduit est
recopié depuis la source, et l'admin signale visuellement ce qui a divergé
depuis la dernière synchronisation.

## Médias

`/media` — la médiathèque. Une image téléversée produit automatiquement ses
variantes redimensionnées et une version WebP ; les dimensions réelles sont
enregistrées pour éviter tout décalage de mise en page au chargement. Elle
exige une session authentifiée : ce n'est pas un dossier public, même si les
images qu'elle sert à une page publiée le sont via une URL dédiée.

## Menus, commentaires, formulaires

`/menus` construit la navigation du site à partir d'entrées réelles (un lien
mort à la suppression d'une page devient détectable, jamais une URL en dur
qui pourrit silencieusement). `/comments` modère les commentaires publics
laissés sur le contenu ; `/forms` et `/form-submissions` gèrent les
formulaires publiés sur le site et leurs réponses reçues — deux des rares
routes de ce CMS qui acceptent une écriture anonyme, protégées dès la
première version par une limitation de débit et des heuristiques anti-spam.

## Import

`/import` importe un contenu WordPress (export WXR) ou un export Cogenta
précédent (`export@1.0`, un format NDJSON versionné et documenté — voir la
documentation technique). Un import respecte les mêmes permissions que
n'importe quelle lecture ou écriture : il ne peut pas créer plus que ce que
le compte qui l'exécute a le droit de créer.
