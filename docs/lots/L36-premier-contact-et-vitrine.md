# L36 — Le premier contact, et une vitrine de référence

> Demandé en direct le 2026-09-16, juste après la publication :
> « ok vitrine par défaut, corrige les deux, et après on doit mettre à jour le
> theme et sample datas de vitrine, ça doit être le plus complet, le plus
> parfait, ultra moderne, bref le meilleur au monde ».

## Ce qui a déclenché le lot

Vérifié sur les paquets publiés, installés depuis npm dans un dossier vide :

1. `npm create cogenta --yes` choisissait **Blank** (schéma vide) : `/` répondait
   `404` avec le corps JSON `{"error":{"code":"CONTENT_NOT_FOUND",…}}`. Le
   premier écran d'un nouvel utilisateur était une erreur d'API.
2. Ce n'est pas propre au site vide : **tout lien mort** d'un site complet
   (le playground) renvoie ce même JSON, y compris avec les en-têtes d'un
   navigateur. La page d'erreur du site est une entrée à `site.notFoundPath`
   (L14) ; sans cette entrée, aucun repli n'existait.

## Décisions

- **Défaut de l'installeur : `vitrine`** (choix de l'utilisateur). `blank` reste
  proposé, et reste le repli honnête quand un modèle demandé n'existe pas.
- **Une page 404 de repli rendue avec l'habillage du thème actif**, par le même
  `renderPageChrome` que la recherche : en-tête, pied, styles, un message, un
  retour à l'accueil et un champ de recherche. Une entrée à `notFoundPath`
  garde la priorité. Le JSON reste la réponse de `/api/*` et des méthodes autres
  que `GET`.
- **Une page d'accueil de démarrage** quand `/` ne résout rien : le site
  fonctionne, voici où aller (l'admin), `noindex`. Réponse `200`, comme la page
  d'accueil par défaut de tout CMS ; elle disparaît dès qu'une page d'accueil
  existe.
- Textes en français ou en anglais selon la langue par défaut du site.

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 1 | Page 404 de repli et page de démarrage, rendues par le thème ; tests de bout en bout | à faire |
| 2 | `vitrine` par défaut dans l'installeur (`--yes` et assistant) | à faire |
| 3 | Vitrine de référence : état des lieux sur captures réelles, références du meilleur niveau, plan de refonte | à faire |
| 4 | Refonte du thème de la vitrine et de son contenu de démonstration | à faire |
| 5 | Vérification sur un site réellement installé, documentation, publication | à faire |

## Pièges connus

1. **Ne pas masquer une vraie route** : les replis ne s'appliquent qu'après
   l'échec de toutes les routes (collections, archives de termes, page 404 du
   site), jamais avant.
2. **Le journal des 404** doit continuer d'enregistrer ces requêtes.
3. **Pas de cache partagé** d'une page d'erreur : `no-store`.
4. **La barre de design** (règle D5 et retour utilisateur L25) : zéro dégradé,
   rien qui « fasse IA », jugé sur de vraies captures, pas sur le code.
