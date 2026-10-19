# Comparaison des interfaces de gestion

Sources officielles consultées le 4 octobre 2026. Cette comparaison est documentaire : WordPress, Drupal, Strapi et Directus n’ont pas été installés ni soumis à la recette de Cogenta.

| CMS | Pratique documentée | Critère appliqué à Cogenta |
| --- | --- | --- |
| WordPress | Les options d’écran permettent de masquer des modules ; des panneaux d’édition peuvent être repliés. | L’information secondaire ne doit pas repousser les actions principales de plusieurs écrans. Les avertissements critiques restent visibles. |
| Drupal | Views fournit des pagers avec un nombre d’éléments par page configurable. | Une liste doit offrir une navigation bornée, conserver le filtre et rendre tous les résultats accessibles. |
| Strapi 5 | La vue de liste configure les champs visibles, la recherche, les filtres, les actions groupées et le nombre d’entrées par page. | Recherche et pagination doivent rester utilisables ensemble ; les commandes d’une ligne doivent agir sur cette ligne, y compris après changement de page. |
| Directus | Les collections proposent des layouts configurables avec recherche, filtres et commandes de gestion dans l’en-tête. | Les opérations fréquentes doivent être faciles à trouver, avec des intitulés clairs et des listes lisibles. |

La pagination, les sections repliables et la hiérarchie des textes corrigent des défauts mesurés dans Cogenta. Ils ne démontrent pas une équivalence complète avec ces CMS. Les préférences de colonnes persistantes par utilisateur et les layouts multiples demanderaient un travail de produit distinct ; ils ne sont pas ajoutés implicitement à cette passe.

Références : [écrans WordPress](https://wordpress.org/documentation/article/administration-screens/), [panneaux repliables WordPress](https://wordpress.org/documentation/article/pages-add-new-screen/), [pager Views de Drupal 11](https://api.drupal.org/api/drupal/core%21modules%21views%21src%21Plugin%21views%21pager%21PagerPluginBase.php/class/PagerPluginBase/11.x), [Content Manager Strapi](https://docs.strapi.io/cms/features/content-manager), [module Content Directus](https://docs.directus.io/user-guide/content-module/content).
