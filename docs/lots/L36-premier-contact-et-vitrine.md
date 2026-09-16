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
| 1 | Page 404 de repli et page de démarrage, rendues par le thème ; tests de bout en bout | **fait** |
| 2 | `vitrine` par défaut dans l'installeur (`--yes` et assistant) | **fait** |
| 3 | Vitrine de référence : état des lieux sur captures réelles, références du meilleur niveau, plan de refonte | **fait** |
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

## Étape 3 — État des lieux et direction (2026-09-16)

**Ce qu'est la vitrine aujourd'hui** (captures réelles d'un site installé, images
chargées) : un cabinet de conseil fictif, en anglais seulement, sur
`@cogenta/theme-entreprise` — éditorial, sobre, typographie serif soignée. Propre,
pas au niveau demandé :

- photos **générées par IA** (L25, Replicate) : personnages de banque d'images,
  fronton « CITY HALL » artificiel — c'est ce qui trahit le plus la démonstration ;
- contenu **en anglais** même quand le site est installé en français ;
- accueil sans impact (grand vide à droite du titre), légende d'exhibit en double.

**Références regardées dans un vrai navigateur** : Linear, Vercel, Framer, Anduril,
Stripe. Ce qui fait leur niveau, *hors dégradés* (règle D5) : photographie plein
cadre et cinématographique, grotesque serrée, étiquettes en chasse fixe
(« FIG 0.1 »), grilles « bento » légendées, filets fins, contraste noir/blanc assumé,
vraies captures de produit.

**Décisions de l'utilisateur** (questions posées, 2026-09-16) :

| Question | Réponse |
|---|---|
| Entreprise fictive | **Entreprise tech** |
| Langue du contenu de démonstration | **Selon la langue du site** : contenu complet en français et en anglais |
| Images | **Vraies photos libres**, embarquées, provenance vérifiée |

**Concept retenu** : une entreprise d'ingénierie qui conçoit capteurs, logiciel et
services pour les infrastructures critiques (énergie, eau, ferroviaire, industrie).
Choisi parce que la photographie réelle y est forte et abondante (postes
électriques, éoliennes, salles de contrôle, laboratoires, ingénieurs sur le
terrain), et pour ne pas doublonner le modèle `saas` (logiciel de gestion).

**Recoupement assumé avec `saas`** : les deux sont « tech », mais `saas` vend un
logiciel en abonnement (tarifs, fonctionnalités, intégrations) ; la vitrine présente
une entreprise, ses solutions, ses références, ses équipes et ses offres d'emploi.

## Phases des étapes 4 et 5

| Phase | Contenu |
|---|---|
| A | Photos : sélection sur Pexels (licence Pexels : usage et modification libres, commerciaux compris), recadrage et optimisation, **fichier de crédits** par photo (photographe, lien source, licence). Les images générées de la vitrine sont retirées. |
| B | Modèle de contenu et contenu de démonstration **bilingue** : solutions, secteurs, références, témoignages, équipe, offres d'emploi, actualités, pages (accueil, entreprise, carrières, contact, mentions légales, confidentialité), menus, réglages, widgets. |
| C | Refonte de `@cogenta/theme-entreprise` vers ce registre : grotesque, étiquettes en chasse fixe, photographie plein cadre, sections sombres, grilles de solutions illustrées, mode sombre conçu, mobile. Garde zéro dégradé et zéro couleur littérale conservée. |
| D | Vérification sur un site réellement installé en français et en anglais, toutes les pages, bureau/mobile/sombre, itérations sur captures ; tests ; documentation ; publication. |

**Point de vigilance, écrit avant de coder** : `@cogenta/theme-entreprise` est publié.
Un site existant qui l'utilise changera d'apparence à la mise à jour — pas de
rupture de contrat (D reste `theme@1.7`), mais une rupture visuelle, à annoncer
dans le changeset.
