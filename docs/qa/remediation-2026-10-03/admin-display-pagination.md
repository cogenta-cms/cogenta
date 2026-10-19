# Affichage admin, sessions, menus et outils IA — 4 octobre 2026

Cette passe conserve la branche d’audit et ses preuves historiques. Elle borne les
listes affichées sans ajouter d’offset à une API ni modifier le contrat A.

## Comportement corrigé

- Profil et consultation des sessions d’un compte : dix lignes par page, une seule
  carte dans le profil. La page reste sélectionnée après révocation et rechargement
  des données ; une dernière page devenue vide revient à la page précédente.
  Un rechargement complet du navigateur commence à la première page.
- Les actions de session affichent « Révoquer ». Leur nom accessible indique
  l’appareil, la date et le numéro de session dans la liste, y compris lorsque
  plusieurs appareils sont sans nom et partagent la même date.
- Menus : panneaux de création, emplacement/langues, arbre et ajout d’élément.
  Les actions restent visibles sur plusieurs lignes en petit écran. Les listes
  imbriquées conservent leur sémantique ; bordures et padding ne s’accumulent plus
  autour de tous les descendants. La profondeur maximale existante reste inchangée.
- Assistant : les seize outils intégrés ont des noms et descriptions FR/EN.
  Le serveur reste la source de la liste disponible ; les textes des outils tiers
  restent ceux de leurs auteurs. Les boutons et infobulles du panneau IA de
  l’éditeur utilisent également ces traductions intégrées. Les descriptions sont dans des volets natifs
  dépliables au clavier, en une ou deux colonnes selon la largeur.
- Tâches planifiées : vingt tâches et vingt éléments de file par page, navigation
  nommée et page conservée après action. La file reste un instantané serveur de
  500 éléments maximum, signalé si cette limite est atteinte. Les intitulés de ligne
  sont en casse normale ; quatre noms audit/commerce manquants sont traduits.
- Le langage du document HTML suit la langue réellement résolue par i18next,
  dès l’initialisation et après modification de la préférence FR/EN.
- Santé, Outils et Tâches planifiées : un accès direct par viewer/editor affiche
  un titre et un refus explicite traduit, sans charger les données administrateur.

La pagination des sessions vise notamment les comptes ayant des dizaines ou centaines
de connexions : le nombre de lignes et la hauteur de leur carte ne doivent plus croître
avec chaque nouvelle connexion, ni produire une page de plusieurs dizaines de milliers
de pixels. Cette limite de présentation ne supprime et ne masque définitivement aucune
session : chaque page reste accessible et chaque révocation cible son identifiant réel.

## Validation source

Les tests HTTP simulés de l’admin portent sur l’interface ; les contrôles de permissions
du serveur restent couverts par les tests API et la matrice de rôles réelle du coordinateur.
Les cas ajoutés utilisent notamment 53 sessions, 53 tâches, trente éléments de file,
la révocation en page deux, la réduction de la dernière page et des appareils sans nom.
Un contrôle CSS unitaire n’est pas présenté comme une preuve de disposition navigateur.

- Suite profil/utilisateurs/sessions/menus/assistant : 64 cas lors du premier passage ;
  l’unique échec était une query texte ambiguë entre l’onglet et le volet « Interroger
  le site ». Recontrôle assistant/arbre : 8/8. Après ajout du cas appareils sans nom,
  sessions : 5/5.
- Refus viewer/editor + santé/tâches : 16/16 avant le complément de pagination.
- Complément tâches/file + refus + assistant : 20/21 ; l’ancien selector exact
  « Relancer » ne correspondait plus au nom contextualisé. Après adaptation,
  suite complète Tâches planifiées : 9/9.
- Panneau IA de l’éditeur : 13/13, dont les seize noms et infobulles FR/EN et le
  maintien des métadonnées d’un outil tiers.
- Complément bouton d’index, langue du document et préférence du compte : 25/25
  sur quatre fichiers. Le contraste lui-même est recontrôlé dans Chrome avec Axe,
  pas déduit du test unitaire.
- Dernier typecheck strict admin : réussi. Catalogues FR/EN : mêmes clés récursives.

Les logs détaillés restent ignorés sous `.cogenta/remediation-2026-10-03/` :
`admin-new-lists-tests.log`, `admin-tools-recheck.log`, `admin-sessions-recheck.log`,
`admin-refusals-tests.log`, `admin-scheduled-pages-final.log`,
`admin-scheduled-pages-recheck.log`, `admin-new-lists-typecheck-final.log`,
`admin-assistant-panel-translation.log`, `admin-assistant-panel-typecheck.log`,
`admin-assistant-contrast-language-tests-recheck.log`,
`admin-assistant-contrast-language-typecheck.log`.

Pour réexécuter les cas ciblés :

```sh
corepack pnpm --filter @cogenta/admin test test/users/session-list.test.tsx test/menus/menu-tree.test.tsx test/menus.test.tsx test/assist/assistant-route.test.tsx test/assist/assistant-panel.test.tsx test/users/profile.test.tsx test/users/users.test.tsx test/admin-route-refusals.test.tsx test/health.test.tsx test/scheduled.test.tsx --maxWorkers=1
corepack pnpm --filter @cogenta/admin typecheck
```

## Recette navigateur réelle

Les scripts copiés `admin-sessions-display.mjs`, `admin-menus-display.mjs` et
`admin-assistant-display.mjs` sont réservés au clone éphémère en port 4280 et refusent
de muter le site utilisateur en 4250. Ils créent leurs propres comptes/menus fictifs,
révoquent uniquement leurs sessions et désactivent leurs comptes à la fin. Aucun appel
payant à un modèle n’est nécessaire. Le helper masque e-mail, mot de passe et jetons
dans les preuves et les captures.

Recette exécutée le 4 octobre sur le bundle `index-BLHwIBdQ.js` :

- Sessions : 7/7 après adaptation d’un sélecteur de recette (`searchbox` et non
  `textbox`). 52 connexions HTTP réelles sur un compte éphémère ; dix lignes visibles
  aux trois largeurs. Hauteurs de carte : 1458 px à 320, 1218 px à 390 et 658 px à
  1440. Aucun débordement horizontal ni violation Axe sérieuse/critique sur ces
  vues. Révocation au clavier en page deux, absence vérifiée côté serveur et après
  rechargement ; suppression de la dernière ligne en page six ramenant à la page cinq.
  Dialogue administrateur paginé vérifié. Compte désactivé à la fin et zéro session
  restante vérifié par HTTP. La consolidation de l’état après suppression en dernière
  page signale cependant un contraste Axe sérieux de 4,06 au survol du bouton commun
  de révocation ; ce constat n’était pas une assertion de ce cas fonctionnel et a été
  transmis au coordinateur. Les trois vues initiales et l’état page deux sont sans
  violation Axe. Un 403 attendu sur `/api/assistant` est enregistré après le
  rechargement du profil viewer ; aucune erreur JavaScript n’est enregistrée.
- Menus et tâches : 6/6. Arbre réel de huit niveaux et neuf éléments, nom de menu long,
  54 actions distinctement nommées restant dans les viewports 320, 390 et 1440.
  Déplacement et édition du huitième niveau au clavier conservés après rechargement.
  Le menu fictif a été supprimé (204). Les tâches réelles ont des intitulés en casse
  normale et au plus vingt lignes affichées ; une population supérieure à vingt
  reste couverte par les tests source, pas créée dans cette recette.
- Assistant : les seize libellés/descriptions FR/EN, les volets au clavier et la
  préférence EN persistée ont été vérifiés sans POST au modèle. Les trois contrôles
  de disposition sont sans débordement, mais leurs assertions Axe ont détecté un
  contraste de 4,44 au lieu de 4,5 sur le bouton d’accès à l’index. Le langage du
  document restait `fr` après passage en EN. Ces deux défauts ont été corrigés puis
  recontrôlés sur le bundle `index-DxpIPUGo.js` : 5/5 scénarios réussis, zéro violation
  Axe, langage du document `fr` puis `en`, zéro appel au modèle. Hauteurs du panneau
  des seize outils repliés : 1086 px à 320, 1038 px à 390 et 548 px à 1440. Le compte
  éditeur éphémère a été désactivé à la fin. Les captures sessions/menus n’ont pas été
  refaites sur ce dernier build : leurs composants n’ont pas changé entre les deux.

Les preuves sont sous `regression/evidence/` :
`admin-sessions-display-admin.json`, `admin-sessions-display-profile.json`,
`admin-menus-display.json`,
`admin-assistant-display.json`. Les passages initiaux sont conservés dans les fichiers
`*-before-selector-adjustment.json` et `admin-assistant-display-before-contrast-language-fix.json`.
Les captures associées sont sous `regression/screenshots/` ; les identifiants privés
restent masqués. Ces recettes n’attestent ni un état corrigé des autres écrans ni une
absence de régression Lighthouse globale, mesurée séparément par le coordinateur.

Pour réexécuter une recette sur le clone prévu (exemple assistant) :

```sh
COGENTA_QA_BASE=http://127.0.0.1:4280 COGENTA_QA_RUNTIME="$PWD/.cogenta/remediation-2026-10-03/regression-site" node .cogenta/remediation-2026-10-03/regression/admin-assistant-display.mjs
```

## Compléments de la validation finale

Le bouton commun conserve son fond opaque au survol, en variante primaire comme destructive : la transparence de 90 % créait un contraste insuffisant dans plusieurs dialogues. Les badges SEO rouge et orange ont des textes contrastés. L’import de document de référence respecte la largeur du petit écran ; les régions de tableaux de l’index ont des noms distincts des cartes. Les titres des journaux d’agent et des ressources de compétence ne sautent plus de niveau. Les recontrôles ciblés sont conservés dans `regression/evidence/display-last-regressions-1440.json` et `display-last-regressions-390.json`.

Les pages de documentation et Santé sont également exercées à 320/390 pixels : 34 cas de largeur et régions scrollables, et les boutons destructifs en thèmes clair/sombre. Les résultats ne prouvent pas un usage complet avec lecteur d’écran ni tous les thèmes personnalisés possibles.
