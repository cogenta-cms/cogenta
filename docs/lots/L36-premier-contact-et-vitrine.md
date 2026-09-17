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
| 4 | Refonte du thème de la vitrine et de son contenu de démonstration | **fait** |
| 5 | Vérification sur un site réellement installé, documentation, publication | **fait** (publication en attente de confirmation) |

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

## Rapport de clôture (2026-09-17)

**Premier contact.** Un lien mort n'affiche plus le JSON de l'API mais une page
« introuvable » dans l'habillage du thème actif (404, `no-store`, `noindex`), et `/`
sans page d'accueil affiche une page de démarrage. `npm create cogenta --yes`
installe la vitrine ; `blank` est en dernier, pour les développeurs.

**La vitrine** est une entreprise d'ingénierie fictive (« Norvane », remplacée par le
nom du site dès qu'il est connu) : capteurs, plateforme de supervision « Vigie »,
maintenance prédictive, ingénierie, interventions terrain, cybersécurité industrielle ;
quatre références chiffrées, trois témoignages sans portrait, quatre offres d'emploi,
quatre articles programmables, dix pages. **Rédigée en français et en anglais**, pas
traduite au rendu : `contentPackFor(id, locale)` choisit le contenu, les adresses et les
libellés d'administration selon la langue principale du site.

**Images.** Vingt-deux vraies photographies de Wikimedia Commons (CC0, domaine public,
CC BY — jamais SA ni NC), choisies à l'œil sur des planches contact de près de
900 candidates, recadrées, sans métadonnées, chacune créditée (auteur, licence, source)
sur une page « Crédits photos » générée depuis `vitrine-credits.ts`. Logos clients et
captures de la plateforme dessinés en HTML/CSS et rendus dans un navigateur, sources
conservées dans `packages/starters/scripts/vitrine-assets/`. Les images générées par IA
de l'ancienne vitrine sont supprimées.

**Thème.** `@cogenta/theme-entreprise` passe au registre d'une entreprise d'ingénierie :
Geist et Geist Mono, papier gris, encre bleu-noir, vert signal (contraste AA vérifié
sur toutes les surfaces) ; hero photographique plein cadre sous un voile d'encre uniforme
(aucun dégradé) ; chiffres en bande d'encre ; figures larges sur toute la grille ; chiffre
clé d'une référence sous son résumé. Aucun contrat touché.

### Trouvé en vérifiant sur de vrais sites installés

1. Des formulaires de commentaires en bas des pages Solution, **en anglais sur le site
   français** : un pack peut désormais fermer les commentaires par collection
   (`commentsDisabledOn`), la vitrine les ferme partout.
2. La grille de six solutions tombait en deux colonnes : le nombre d'entrées était
   plafonné à 4 dans l'attribut qui choisit la grille.
3. Le logo « maréa » ressemblait trop à une marque automobile connue : redessiné.
4. Unités collées aux chiffres (« 14months ») et légende d'une figure isolée à droite.

### Vérifié

`@cogenta/starters` 378 tests, `create-cogenta` (dont un site installé en français de
bout en bout), `@cogenta/theme-entreprise` 305, `@cogenta/cli` (pages de repli). Sites
réellement installés en français et en anglais, capturés en bureau, mobile et sombre.

### Reste ouvert

- **Le formulaire de commentaires de `theme-kit` est en anglais en dur**, sur tous les
  sites francophones qui l'affichent (articles de blog par exemple) : défaut préexistant,
  hors de ce lot, à corriger ensuite.
- Les pages de repli (404, démarrage) n'existent qu'en français et en anglais.
- Un site existant sur `theme-entreprise` change d'apparence à la mise à jour
  (annoncé dans le changeset).

## Audit du page builder sur la vitrine installée (2026-09-17)

Demandé après la clôture : « vérifie qu'on peut vraiment tout modifier via le page
builder — image, texte, blocs — et que c'est cohérent, pas de loupé ». Fait sur un vrai
site vitrine installé en français, dans un vrai navigateur : les dix-sept blocs posés sur
une page vide, puis chaque sorte de champ modifiée sur l'accueil (texte, image changée
depuis la médiathèque, liste d'éléments ajoutée/retirée/déplacée/dupliquée, listes de
choix, lien vers une URL et vers une entrée, objet imbriqué, texte riche, apparence),
blocs déplacés, annuler/rétablir, enregistrement, relecture des données stockées et de
la page publique.

**Défauts trouvés et corrigés :**

1. **Une page enregistrée avec un champ vidé cassait la page publique** (erreur 500) :
   les données de bloc n'étaient jamais vérifiées à l'écriture. Vide = absent
   (`pruneEmptyBlockData`), et l'API refuse un bloc invalide (`BLOCK_INVALID`).
2. **L'aperçu tombait en erreur** dès qu'on posait une liste de contenus (400) ou un
   contenu externe (500), encore incomplets : il montre désormais le reste de la page.
3. **Un refus d'enregistrement était invisible et illisible** — écrit sous le builder, en
   anglais, dans les termes du contrat (`actions.0.target: Invalid input … R3`). L'admin
   vérifie les blocs avant d'envoyer, dit « Bloc 12 « Appel à action » — Boutons ›
   élément 1 › Destination : indiquez une adresse ou choisissez une entrée », sélectionne
   le bloc, et affiche le message dans la barre d'enregistrement. Un test croise cette
   vérification avec le validateur du contrat B : elle ne refuse jamais ce que le
   serveur accepterait.
4. **Le formulaire de bloc parlait le langage du contrat** : `eyebrow`, `emphasis`,
   `primary`, `16:9`, noms des blocs en français même dans un admin anglais. Libellés,
   choix, aides et noms de bloc sont traduits (français et anglais, test de couverture).
5. **Les listes d'éléments n'avaient pas de titre** (« Boutons », « Questions ») ;
   un objet (l'auteur d'un témoignage, le tri d'une liste) et une liste de textes (les
   avantages d'une offre) s'éditaient en JSON brut ; l'icône et la collection d'une liste
   se tapaient à la main. Champs dédiés, listes de choix, et un lien « Modifier les
   Références » depuis une liste de contenus (ses éléments sont des entrées, pas des
   blocs).
6. **Un bloc posé laissait ses choix obligatoires vides** (disposition, service) : il
   reçoit le premier choix.
7. Un choix optionnel ne pouvait plus être désélectionné ; le fond « Image » de
   l'apparence ne permet de choisir aucune image et chaque thème le rend comme
   « Atténué » (retiré du choix, gardé s'il est déjà posé) ; cinq blocs rangés par
   défaut dans « Listes » ; la ligne du bloc sélectionné écrasait son nom mot par mot ;
   « ~1 min de lecture » sous un texte vide ; le champ image s'annonçait « Déposer un
   fichier ici » aux lecteurs d'écran.
8. **Les formulaires de contenu affichaient « Title », « Slug », « Cover Image »** sur un
   site français : les noms de champs courants sont traduits pour tous les modèles de
   site. L'icône d'une solution devient une liste de choix.
9. Hors builder, trouvé en chemin : **une page créée depuis l'admin ouvert directement
   sur « Nouveau » était enregistrée en anglais** sur un site français (le formulaire
   gardait `en` en attendant le schéma), et **une entrée créée par l'API sans langue
   aussi** (agents, MCP, clients headless).
10. **Un slug déjà pris répondait 500** (`DB_UNREACHABLE`, le refus brut de l'index) sans
    nommer de champ : 409 `CONTENT_SLUG_TAKEN` sur le champ, message en français sous
    l'adresse.
11. **Une page neuve ne pouvait plus être créée sans remplir son bloc de départ** (un
    « Texte » vide, refusé depuis le contrôle des blocs) : un bloc de départ resté intact
    n'est pas enregistré à la création.

**Limites qui restent, assumées :** l'édition directe dans l'aperçu ne couvre que les
textes simples d'un bloc (pas un texte riche, un élément de liste ni l'auteur d'un
témoignage — ils s'éditent dans le panneau) ; les libellés écrits par l'auteur d'un
modèle de site (« Starts », « Street address » dans l'association) restent dans sa langue ; une liste de contenus montre des
entrées, qui se modifient dans leur collection.
