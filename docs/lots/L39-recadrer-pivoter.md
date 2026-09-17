# L39 — Recadrer et pivoter une image dans la médiathèque

> Troisième manque de la série engagée le 2026-09-17 (après L37 et L38).

## Le problème

La médiathèque ne sait que poser un **point focal** : un cadrage au rendu, pas une vraie
retouche. WordPress permet de recadrer et de pivoter une image téléversée ; ici, une photo
prise de travers ou un portrait trop large oblige à retoucher le fichier ailleurs, puis à le
remplacer.

## Décisions

1. **Non destructif.** Avant la première retouche, l'original est copié à part (dans le même
   stockage, clé `media-originals/{id}/…`). Chaque retouche **repart de cet original** — jamais
   de la version déjà retouchée, donc aucune perte de qualité cumulée — et « Rétablir
   l'original » le remet en place. Aucune colonne ajoutée : une image est retouchée quand sa
   copie d'origine existe.
2. **Le même chemin que « Remplacer le fichier »** : nouvelle clé de stockage, empreinte de
   contenu changée (les caches du navigateur et des proxys sont invalidés), variantes
   régénérées, anciennes supprimées. Toutes les pages qui utilisent l'image la montrent
   retouchée, sans rien republier.
3. **Rotation par quarts de tour et recadrage** (rectangle en fractions de l'image pivotée). Le
   format d'origine est gardé (JPEG, PNG, WebP) ; un autre format est converti en WebP.
4. **La rotation est ajoutée aux deux pilotes d'images** — natif (`sharp`) et WebAssembly
   (`wasm-vips`, le repli des hébergements mutualisés, R10) — et vérifiée par leur suite de
   contrat commune.
5. **Le point focal suit la retouche** : pivoté avec l'image, ramené dans le cadre ; s'il tombe
   hors du recadrage, il est effacé plutôt que placé au hasard.
6. **Remplacer le fichier** abandonne la copie d'origine (le nouveau fichier *est* l'original),
   et **supprimer le média** la supprime aussi.
7. Mêmes droits que « Remplacer le fichier ».

## Étapes

1. La rotation dans `@cogenta/render` (deux pilotes, suite de contrat).
2. `POST /api/media/{id}/edit` et `POST /api/media/{id}/restore` (`@cogenta/api`), point focal.
3. L'hôte (`@cogenta/cli`) : le processeur d'images sait retoucher.
4. L'éditeur dans l'écran du média (admin) : pivoter, cadres prédéfinis, rectangle déplaçable
   et redimensionnable à la souris comme au clavier, aperçu, rétablir.
5. Vérification dans un navigateur, documentation.

## Deux défauts préexistants trouvés en construisant le lot

Le recadrage passe par le même chemin que « Remplacer le fichier » ; en le factorisant :

1. **Remplacer deux fois une image par le même fichier la perdait.** Le premier remplacement
   range le fichier sous une clé tirée de son empreinte ; le second écrit à la même clé, puis
   supprime « l'ancienne »… qui est la même. Prouvé par un test contre le code d'avant
   (`ENOENT` à la lecture), corrigé.
2. **Les variantes d'une image de même taille étaient supprimées juste après leur écriture**
   (mêmes noms). Corrigé dans le même chemin.

Et en écrivant l'éditeur : les libellés des proportions (`1:1`, `4:3`…) ne s'affichaient pas,
i18next lisant `:` comme un séparateur ; et l'aperçu du fichier dans l'admin est gardé une heure
en cache par le navigateur, si bien qu'une image retouchée ou remplacée restait affichée comme
avant — les vignettes, le point focal et l'éditeur demandent désormais le fichier avec son
empreinte.

## Vérifié

- `@cogenta/render` : rotation dans la suite de contrat commune, **exécutée sur les deux
  pilotes** (natif et WebAssembly) — sens des quarts de tour, recadrage dans l'image pivotée,
  côtés échangés.
- `@cogenta/api` : chaque retouche repart de l'original, restauration à l'octet près, même
  retouche appliquée deux fois sans perte, point focal à travers des retouches successives et
  retour, copie d'origine abandonnée au remplacement, 401 et 501.
- `@cogenta/cli`, sur un vrai serveur avec le vrai pilote d'images : dimensions réelles du
  fichier servi après rotation et recadrage, variantes servies, original rétabli à l'octet près.
- `@cogenta/admin` : géométrie du cadre (bords, proportions en pixels, coin opposé tenu),
  éditeur (original chargé, rotation et cadre envoyés, clavier seul, rétablir proposé seulement
  pour une image retouchée).

- Dans un navigateur, sur une photo de la vitrine (1600 × 1073) : pivotée, cadrée en carré et
  déplacée à la souris, appliquée — 1073 × 1073, exactement ce que l'éditeur annonçait, image
  rafraîchie aussitôt, mention « Image retouchée » ; rétablie en 1600 × 1073. L'essai a aussi
  montré que l'assombrissement hors cadre débordait sur les boutons : il est désormais
  contenu dans l'image.

## Reste ouvert

- Rotation par quarts de tour seulement (pas d'angle libre ni de miroir).
- Le point focal d'une image retouchée est gardé dans les coordonnées de l'image retouchée ;
  les paramètres de la dernière retouche (à côté de l'original) permettent de le ramener.


## Limite levée le 2026-09-17 — le miroir

Un quart de tour et un miroir couvrent ensemble les **huit** orientations qu'une image peut
prendre sans qu'un seul pixel soit rééchantillonné. Le miroir (gauche-droite, haut-bas)
s'applique après la rotation et avant le recadrage, sur les deux niveaux de driver, et le
point focal est transporté à travers lui comme il l'était à travers la rotation.

**Un vrai piège trouvé en le faisant** : `sharp` n'honore pas l'ordre des appels — son
pipeline applique le miroir *avant* la rotation quoi qu'on lui demande. Le test de contrat
l'a montré (« yellow » là où « red » était attendu). L'axe est donc inversé pour 90° et 270°
côté natif, ce qui fait produire aux deux niveaux exactement les mêmes pixels.

**L'angle libre reste écarté, avec sa raison** : une rotation arbitraire interpole, exige une
couleur de fond derrière les coins qu'elle découvre, et devrait rendre les *mêmes* pixels sur
les deux niveaux pour que la suite de contrat reste honnête. C'est un lot, pas une option.
