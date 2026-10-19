# Corrections et recette de Cogenta

Branche : `fix/production-readiness-audit-2026-10-03`. Référence initiale : `d28eda09a37be677e429c097da72d257530f4e93`.

Le [rapport HTML d’affichage et de recette](rapport-affichage-et-recette.html) contient les captures avant/après intégrées, les mesures, les résultats fonctionnels, les permissions, les anomalies restantes et la comparaison documentaire avec WordPress, Drupal, Strapi et Directus. Le [rapport d’étape](rapport-etape.html) est historique ; ses limites ne décrivent pas toutes les validations supplémentaires.

La campagne officielle a terminé avec 120 scénarios réussis sur 122. Les deux échecs de création avec deux champs de texte riche cherchaient « Enregistrer » au lieu de « Créer » ; les deux parcours corrigés réussissent, avec rechargement et persistance des textes. Le bilan consolidé est 122 scénarios validés, sans prétendre à une exécution unique entièrement verte. Les deux rapports JSON sont conservés.

Les contrôles supplémentaires incluent 39 cas de listes, trois scénarios de soumissions/commentaires, 121 commandes et 121 clients parcourus en sept pages, des sessions et menus imbriqués, les parcours IA réels et les recontrôles de rôles. Les listes restent consultables sur plusieurs pages ; les mutations des recettes supplémentaires sont isolées sur le clone en port 4280. Le site utilisateur reste disponible sur 4250.

Les preuves source incluent 74 tâches de typecheck global réussies, 34 builds de production, les tests ciblés et les contrats SQL sur SQLite/PostgreSQL/MySQL/MariaDB. Les résultats Lighthouse et les anomalies des captures sont détaillés dans le rapport ; ces contrôles ciblés ne certifient pas la charge de production.

Le [suivi](tracking.json) conserve les 43 constats initiaux. Les captures, preuves et logs historiques ne sont pas réécrits pour effacer les échecs. Certaines erreurs de script (sélecteurs, attente de remplacement de page, statut DELETE204) sont distinguées des défauts du produit.

Le dernier contrôle Lighthouse relève un score formulaires 79→77 et une hausse du CLS sur les deux pages. Le critère de non-régression du rendu reste ouvert avant production.

Restent notamment les paiements externes sans clés de bac à sable, le transport SMTP externe, les services Redis/S3 absents, le plafond de 500 commandes de la fiche/export client et la densité encore élevée des widgets sur mobile. L’avis de dépendance haut résiduel est détaillé dans [http-cache-semantics.md](http-cache-semantics.md). La suite unitaire globale antérieure n’a pas été entièrement réexécutée ; les recontrôles ciblés ne remplacent pas ce contrôle global.

Aucun merge sur `main`. Le CMS n’est pas déclaré parfait ni prêt pour la production. Les artefacts volumineux de QA restent disponibles dans ce dossier local.
