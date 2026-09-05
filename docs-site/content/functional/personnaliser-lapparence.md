---
title: Personnaliser l'apparence
order: 3
---

# Personnaliser l'apparence

## Le thème : la mise en page du site public

En haut de `/appearance`, **Thème du site** choisit le paquet qui dessine la mise en
page publique — en-tête, pied de page, et l'aspect de chacun des dix-sept blocs. Le
changement prend effet à la page suivante, sans redémarrage. Dix thèmes sont fournis,
un par type de site, chacun avec sa propre identité (jamais un recolorage d'un autre) :

| Thème | Pour | Signature |
|---|---|---|
| Canonical | tout site, le neutre de référence | sobre, accessible, sert de base à un thème personnalisé |
| Blog | un blog personnel ou professionnel | article vedette plein cadre, grille de couvertures, colonne de lecture serif |
| Magazine | un titre de presse en ligne | manchette, une « une » et une grille de secondaires, rubriques |
| Portfolio | un créatif, une agence | grille de projets plein cadre, titrage display |
| Entreprise | une vitrine d'entreprise, du B2B | hero texte/visuel, logos de confiance, chiffres clés, témoignages |
| Storefront | une boutique | grille produits avec image et prix, tuiles de catégories, bande promo |
| SaaS | un produit logiciel | hero à dégradé, grille de fonctionnalités, tableau de prix, FAQ |
| Documentation | une documentation technique | barre latérale de navigation, blocs de code, fil d'Ariane |
| Restaurant | un restaurant, un café | hero sombre, carte avec prix alignés, horaires, réservation |
| Association | une association, une ONG | chiffres d'impact, événements datés, appel au don |

`npm create cogenta` active d'office le thème du type de site choisi et sème une page
d'accueil complète (huit à douze sections avec visuels), les menus, l'accroche et les
liens sociaux — un site neuf ressemble à un site fini, pas à une page blanche.

Trois réglages du site nourrissent directement l'en-tête et le pied de page de tous les
thèmes : **Accroche**, **Liens sociaux** (une ligne `Libellé | https://…` par réseau, icône
choisie automatiquement) et **Note de pied de page** (`/settings`, section Général). Un menu
assigné à l'emplacement `header-action` devient le bouton d'appel à l'action de l'en-tête.

Les visuels de démonstration semés à l'installation sont générés par Cogenta lui-même
(compositions abstraites, en PNG), jamais des photos tierces : ils se remplacent en un
clic depuis la médiathèque.

## Le skin : couleurs, typographie, densité, sans reconstruction

`/appearance` change l'apparence visuelle du site en éditant un **skin** —
un jeu complet et fermé de jetons (couleurs, polices, espacement, rayons,
mouvement, ombres). Changer de skin réécrit un seul fichier CSS, sans
reconstruction : c'est instantané. Un skin qui échouerait le contraste
minimum (AA — 4.5:1 texte normal, 3:1 grand texte) ou omettrait un jeton est
**refusé à l'enregistrement**, pas seulement signalé — ce qui rend
l'apparence générée par un agent sûre par construction, jamais un pari sur le
goût du modèle.

`/admin-appearance` fait la même chose pour l'**admin lui-même**, séparément
du site public : les deux ne partagent pas de skin, un changement de l'un
n'affecte jamais l'autre.

## Le constructeur de page

Depuis l'onglet d'édition d'une entrée qui a une zone de blocs, un
constructeur visuel montre un **aperçu réel** de la page — pas une
reconstruction React qui pourrait diverger du rendu final, littéralement la
même page que verrait un visiteur, dans une iframe. Glisser-déposer pour
réordonner ou insérer un bloc, double-cliquer un texte simple pour l'éditer
en place ; chaque déplacement possible par glisser existe aussi comme un
bouton nommé (monter/descendre), pour que rien ne s'obtienne uniquement à la
souris. Un média, une liste d'éléments structurée ou un texte riche restent
édités dans le formulaire classique, pas dans l'aperçu — ce que l'écran dit
explicitement plutôt que de le laisser deviner.

L'aperçu affiche toujours le contenu **non publié** en cours d'édition, donc
il porte discrètement `noindex, nofollow` — un visiteur ou un moteur de
recherche ne peut jamais l'atteindre par erreur.

## Installer un thème ou un plugin

`/marketplace` liste les thèmes, plugins, skills et skins disponibles,
installés ou non. Un plugin tiers ne tourne jamais avec les mêmes droits que
le site : à l'installation, un écran en langage clair — jamais un identifiant
technique brut — énumère exactement ce qu'il pourra faire (« lire le
contenu », « publier sans validation humaine », …), et vous approuvez
capacité par capacité. Un plugin qui dépasse son temps ou sa mémoire alloués
est automatiquement désactivé, avec une alerte, jusqu'à réactivation
explicite. Voir [Creating a theme](../technical/creating-a-theme.html) et
[Creating a plugin](../technical/creating-a-plugin.html) dans la documentation
technique (en anglais, comme le reste de cette arborescence) pour le
construire vous-même plutôt que d'en installer un.

## SEO

`/seo` couvre le titre, la description, le canonique, les données
structurées et les réglages d'indexation par page ou par collection —
générés automatiquement pour chaque page publiée (titre, meta description,
Open Graph, Twitter Card, `hreflang` de la famille de traduction, JSON-LD),
ajustables sans toucher au code. `/robots.txt` et `/sitemap.xml` sont générés
depuis le contenu réellement publié, jamais depuis une liste maintenue à la
main.
