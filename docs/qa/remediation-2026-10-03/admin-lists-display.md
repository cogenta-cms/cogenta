# Affichage des listes de l’admin — passe du 4 octobre 2026

L’inventaire initial du clone 4250 contient 44 mesures : 22 routes à 1440 et
390 pixels, avec captures, lignes, contrôles et pagination. La recette après
correction couvre huit routes à 320, 390, 768 et 1440 pixels, soit 32 mesures,
et sept parcours de navigation. Les 39 contrôles passent sur le bundle
`index-BLHwIBdQ.js`, sans erreur navigateur ou HTTP ni violation axe.

Les mesures décrivent les fixtures de recette, pas une limite de capacité du
produit. Elles portent sur la hauteur de l’élément `main`.

| Route | Avant 1440 px | Après 1440 px | Avant 390 px | Après 390 px | Fenêtre visible |
|---|---:|---:|---:|---:|---|
| Widgets | 15 705 | 5 345 | 14 036 | 5 746 | Dix par zone ; 13 visibles dans les trois zones de la fixture |
| Formulaires | 1 619 | 1 251 | 4 199 | 1 791 | Dix lignes |
| Coupons | 1 229 | 1 269 | 1 785 | 1 609 | Dix lignes |
| Audit | 3 864 | 2 158 | 6 862 | 2 756 | Vingt événements |
| Observabilité | 3 472 | 2 159 | 5 430 | 3 257 | Vingt traces et vingt journaux au maximum |
| Médias | 2 455 | 2 277 | 5 175 | 4 380 | Vingt médias |
| Soumissions | 1 545 | 1 497 | 3 307 | 2 379 | Vingt réponses au maximum |
| Commentaires | 1 314 | 928 | 1 814 | 965 | Vingt commentaires au maximum |

La petite fixture de douze coupons gagne quarante pixels sur ordinateur avec
l’ajout de la recherche et des commandes aux deux extrémités ; la croissance du
DOM reste désormais bornée à dix lignes. Les snapshots d’observabilité et la
file de modération ont changé entre les redémarrages : leurs hauteurs ne
comparent donc pas des volumes identiques. Les fixtures de plus d’une page de
commentaires et soumissions sont vérifiées séparément sur 4280.

À 320 pixels, Widgets reste haut (7 247 pixels), malgré la pagination et les
panneaux de catalogue. À 390 pixels, la hauteur passe de 14 036 à 5 746 pixels.
Toutes les zones, leurs actions et l’ordre global restent accessibles ; cette
passe ne prétend pas faire tenir treize widgets dans une seule hauteur d’écran.

Les formulaires et coupons paginent la liste déjà chargée et recherchent sur
l’ensemble de celle-ci. Chaque zone de widgets a sa propre pagination ; les
déplacements gardent l’index dans la zone complète. Le catalogue regroupe les
types dans des panneaux repliables ouverts par la recherche. Les tests navigateur
ont retrouvé les 19 formulaires, 12 coupons et 50 widgets de la barre latérale
dans l’ordre de l’API, sans perte entre les pages.

Audit, médias et soumissions utilisent les curseurs existants et remplacent la
fenêtre affichée. Les commentaires utilisent le `limit`/`offset` du contrat F.
Les filtres reviennent à la première page ; une réponse tardive ne remplace pas
le filtre courant. Si une action finit après un changement de filtre, son
rafraîchissement cible la vue courante. Une action qui vide la dernière page
ramène à la précédente. L’export CSV des soumissions reste exécuté côté serveur
sur tous les filtres. La recherche RGPD pagine ses résultats sans réduire la
portée de l’effacement par adresse. Les tables larges défilent dans leur région
focusable sur mobile, avec commandes de pagination aux deux extrémités.

Sur le clone isolé 4280, les trois parcours supplémentaires passent : recherche
RGPD à vingt-et-un résultats, soumissions à vingt-et-un identifiants, commentaires
à vingt-et-un identifiants. Ils vérifient page suivante, retour, filtre, action,
conservation des identifiants sans doublons et retour après dernière page vidée.
Les cinq formulaires, vingt-et-une soumissions et vingt-et-un commentaires créés
ont été nettoyés par 28 requêtes réussies (200/204). Le commentaire parent
préexistant a été conservé. Aucune mutation de contenu n’a été faite sur 4250.

Validation source : 102 tests ciblés, typecheck strict et Biome sans erreur.
Les API, permissions et schémas de stockage restent inchangés par cette passe.
Les tests couvrent plusieurs pages, filtre, suppression, retour par curseur,
réponse réseau retardée et déplacement interpage.

La campagne Lighthouse contrôlée comprend trois passages avant et après par
route. Widgets conserve 100 en accessibilité et passe de 74 à 75 en performance
médiane lors de la première série ; les résultats finaux, plus bas, sont indiqués ci-dessous. Formulaires avait alors conservé 100 et était passé de 79 à 82. La première mesure après
pagination avait révélé Widgets à 97 : huit boutons ne reprenaient pas toute
leur description visible dans leur nom accessible, et le summary « Contenu »
mesurait seize pixels. Les descriptions sont maintenant séparées du libellé et
reliées par `aria-describedby` ; les commandes du catalogue mesurent quarante-
quatre pixels. Le diagnostic ciblé et axe complet sur 4280 retournent zéro
violation après correction. Le bouton global de repli de navigation a également
été corrigé par son propriétaire.

La première exécution de la navigation Audit lisait les lignes trop tôt après
le clic. Le diagnostic API/DOM a confirmé des identifiants disjoints et une page
2 correcte. L’attente du script a été renforcée ; les 39 contrôles relancés
passent. Les preuves initiales sont conservées, sans modification du produit
pour cet échec de recette.

Les preuves sont enregistrées dans `regression/evidence/` :

- [Inventaire initial](regression/evidence/admin-lists-display-inventory.json) et [comparaison des 32 mesures](regression/evidence/admin-lists-display-comparison.json).
- [Résumé des 39 contrôles](regression/evidence/admin-bounded-lists-campaign.json), avec suites `admin-bounded-lists-320.json`, `-390.json`, `-768.json` et `-1440.json`.
- [Trois parcours de mutation](regression/evidence/comments-submissions-pagination.json) et [identifiants et nettoyage](regression/evidence/comments-submissions-pagination-fixtures.json).
- [Diagnostic Audit](regression/evidence/audit-cursor-diagnostic.json), première suite `admin-bounded-lists-1440-initial.json` et résumé `admin-bounded-lists-campaign-initial.json`.
- [Diagnostic Widgets initial](regression/evidence/widgets-accessibility-diagnostic.json) et [contrôle après correction](regression/evidence/widgets-accessibility-diagnostic-after.json).
- [Lighthouse contrôlé avant](regression/evidence/lighthouse-display-before.json) et [après](regression/evidence/lighthouse-display-after.json).

Chaque preuve d’affichage référence sa capture dans `regression/screenshots/`.
Les scripts copiés sont `admin-bounded-lists.mjs`,
`comments-submissions-pagination.mjs`, `audit-cursor-diagnostic.mjs` et
`widgets-accessibility-diagnostic.mjs`, dans
`.cogenta/remediation-2026-10-03/regression/`.

### Dernière mesure sur le bundle livré

Les mesures antérieures 74→75 et 79→82 sont historiques. Le dernier passage de trois essais par page donne widgets 74→74 et formulaires 79→77 ; accessibilité 100→100 dans les deux cas. Le CLS médian passe de 0,54→0,74 (widgets) et de 0,49→0,69 (formulaires), malgré des LCP plus courts. Cette instabilité au chargement reste un défaut et empêche de conclure à une non-régression complète du rendu. Ne pas effacer ces mesures en relançant jusqu’à obtenir un score favorable.
