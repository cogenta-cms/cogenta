# 11 — Médiathèque

> **État** : minimal — téléverser un fichier à la fois, dans une grille sans
> recherche, sans filtre et sans pagination.
> **Écrans** : `packages/admin/src/routes/media.tsx` (122 lignes),
> `media/upload-form.tsx` (131), `media/media-detail.tsx` (130),
> `media/focal-point-editor.tsx` (92), `media/media-thumbnail.tsx` (55)
> **API existante** : `packages/api/src/rest/media-router.ts`, `/_image?id=&w=`
> **Effort** : 6–8 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Le pipeline serveur est meilleur que l'écran ne le laisse croire (L10 tâche 5) :

- variantes redimensionnées et WebP **produites à l'upload**, dimensions intrinsèques
  enregistrées ;
- endpoint **public** `/_image?id=&w=` restreint à `kind === 'image'`, `srcset` réel
  dans les pages et `og:image` dérivé du même asset ;
- le type MIME stocké est celui que les **octets** méritent, pas celui que le
  téléverseur déclare (constat de sécurité élevé corrigé en L10) ;
- `GET /api/media` et `GET /api/media/{id}` exigent une session (constat critique
  corrigé en L10 — changement cassant assumé) ;
- alternative textuelle **obligatoire** sauf image marquée décorative, et une
  décorative exige une justification lisible. La règle est appliquée par le serveur,
  pas seulement par le formulaire.
- point focal éditable.

L'écran, lui : un formulaire d'upload à un fichier, encodé en base64 ; une grille de
vignettes ; une modale de détail avec alt, décorative, point focal, supprimer.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Téléversement multiple / glisser-déposer | ✅ | ✅ | ✅ | ❌ (un, par champ fichier) |
| Barre de progression | ✅ | ✅ | ✅ | ❌ |
| Recherche par nom | ✅ | ✅ | ✅ | ❌ |
| Filtre par type, date, taille | ✅ | ✅ | ✅ | ❌ |
| Dossiers / collections de médias | plugin | ✅ | ✅ | ❌ |
| Pagination / défilement infini | ✅ | ✅ | ✅ | ❌ |
| Sélection multiple + suppression groupée | ✅ | ✅ | ✅ | ❌ |
| Recadrage / rotation | ✅ | ✅ | ✅ | ❌ (point focal seulement) |
| Remplacer un fichier en conservant l'id | plugin | ✅ | ✅ | ❌ |
| « Où ce média est-il utilisé ? » | plugin | ❌ | ✅ | ❌ |
| Copier l'URL publique | ✅ | ✅ | ✅ | ❌ |
| Alt obligatoire | ❌ | ❌ | ✅ | ✅ **mieux** |
| Point focal | plugin | ✅ | ✅ | ✅ |
| Métadonnées EXIF | ✅ | ❌ | ✅ | ❌ |

## 3. Écarts, classés

### Bloquants

1. **Un fichier à la fois.** Charger trente photos d'un reportage, c'est trente
   passages dans le formulaire.
2. **Base64.** `fileToBase64` gonfle la charge utile d'un tiers et charge tout le
   fichier en mémoire, côté navigateur **et** côté serveur. Sur une vidéo de 200 Mo,
   c'est un échec, et probablement un dépassement de limite de corps de requête.
   C'est le vrai plafond technique de cet écran.
3. **Aucune recherche, aucun filtre, aucune pagination.** Au-delà de quelques dizaines
   d'assets, la médiathèque devient inutilisable — et le sélecteur de média des
   formulaires hérite exactement du même défaut.
4. **Pas de suppression groupée**, et aucun avertissement « ce média est utilisé par
   quatre entrées » avant suppression.

### Importants

5. Pas de barre de progression : sur un gros fichier, l'écran semble figé.
6. Pas de remplacement de fichier : corriger une image publiée oblige à en créer une
   nouvelle et à repasser dans chaque entrée.
7. Pas d'URL copiable.
8. Pas de dossiers ni d'étiquettes.
9. Pas de recadrage. Le point focal couvre une partie du besoin, pas tout (une
   bannière carrée coupée dans une photo panoramique).
10. Pas de tri (date, nom, taille).

### Confort

11. EXIF, dimensions et poids non affichés.
12. Pas de prévisualisation pour les PDF et les vidéos.

## 4. Plan de développement

### Tâche 1 — Téléversement multiple, en flux, avec progression

**Fichiers** : `media/upload-form.tsx` (réécriture),
`packages/admin/src/api/media-client.ts`,
`packages/api/src/rest/media-router.ts`.

C'est la tâche fondatrice, et elle touche le serveur.

- Passer de JSON+base64 à `multipart/form-data`, ou à un `PUT` de corps binaire avec
  les métadonnées en en-têtes. Les deux évitent l'expansion base64 et permettent le
  flux.
- `XMLHttpRequest` (ou `fetch` avec un `ReadableStream`) pour obtenir la progression
  réelle — `fetch` seul ne donne pas de progression d'upload.
- File d'attente : plusieurs fichiers, deux ou trois en parallèle, chacun avec son
  état (en attente / en cours / terminé / échoué) et un bouton « réessayer » par
  ligne.
- Zone de dépôt sur toute la page média.
- **La règle du texte alternatif ne bouge pas** : après le téléversement, chaque
  fichier sans `alt` apparaît dans une liste « à compléter », et la règle serveur
  reste ce qui l'impose. Ne pas la contourner sous prétexte d'ergonomie de masse ;
  au contraire, la rendre visible en masse.
- Limites de taille et de type lues depuis la configuration et affichées **avant** le
  téléversement, pas après l'échec.

**Critère** : déposer trente photos d'un coup, voir trente barres de progression,
compléter les alternatives textuelles depuis une seule liste.

### Tâche 2 — Recherche, filtres, pagination

**Fichiers** : `media-router.ts`, `routes/media.tsx`, `media-client.ts`.

- `GET /api/media?q=&kind=&from=&to=&sort=&after=` : recherche sur le nom de fichier
  et l'alternative textuelle, filtre par type et par plage de dates, tri, pagination
  par curseur cohérente avec le reste de l'API.
- Côté écran : barre de recherche, filtres, défilement paginé, compteur total.
- **Le sélecteur de média des formulaires consomme la même route** (fiche
  [03](03-champs-de-formulaire.md) tâche 3) — un seul travail, deux écrans servis.

**Critère** : retrouver une image parmi deux mille, par un mot de son nom.

### Tâche 3 — Sélection multiple et suppression informée

**Fichiers** : `routes/media.tsx`, `media-router.ts`.

- Cases à cocher, sélection par `Shift`, actions groupées : supprimer, étiqueter,
  télécharger.
- **Avant suppression, dire où le média est utilisé.** Cela demande une route
  d'usage : chercher l'id dans les valeurs de champs `media` et dans les blocs. Coûteux
  en SQL générique ; deux options — un index d'usage maintenu à l'écriture (propre,
  plus de travail), ou un balayage à la demande borné et honnête sur son coût
  (« recherche dans 1 240 entrées… »). Commencer par le balayage à la demande.
- Suppression groupée avec modale nommant le nombre et les usages détectés.

**Critère** : supprimer une image utilisée par trois pages provoque un avertissement
qui nomme les trois pages.

### Tâche 4 — Remplacer, recadrer, copier l'URL

**Fichiers** : `media/media-detail.tsx`, `media-router.ts`.

- **Remplacer le fichier** en conservant l'id : toutes les entrées qui le référencent
  sont mises à jour d'un coup. Les variantes sont régénérées, et le cache doit être
  cassé — l'URL `/_image?id=&w=` étant stable, ajouter un paramètre de version
  (`&v=`) dérivé du hash du fichier, sinon un an de cache public sert l'ancienne
  image (rappel : L10 met un cache long sur ces réponses).
- **Recadrage** : produire une variante recadrée. R10 s'applique — pas de `sharp`.
  Le pipeline actuel produit déjà des variantes sans code natif ; le recadrage doit
  passer par le même chemin. Alternative moins coûteuse et souvent suffisante :
  laisser le recadrage au rendu (ratio + point focal, déjà en place) et n'offrir que
  la rotation.
- Bouton « copier l'URL publique », en rappelant que l'URL publique n'existe que pour
  les images (`/_image` filtre par type — les autres restent authentifiés).

**Critère** : remplacer un logo met à jour toutes les pages qui l'affichent, sans
qu'aucune ne serve l'ancienne image depuis un cache.

### Tâche 5 — Organisation

**Fichiers** : `media-router.ts` (table d'étiquettes), `routes/media.tsx`.

Étiquettes plutôt que dossiers : un asset peut appartenir à plusieurs sujets, une
arborescence oblige à choisir. Filtrage par étiquette, étiquetage groupé.

Si des dossiers sont réellement voulus, la taxonomie hiérarchique d'ADR-0022 fournit
déjà tout le modèle (chemin matérialisé, profondeur bornée) — la réutiliser plutôt
que d'en écrire un second.

### Tâche 6 — Détail complet

**Fichiers** : `media/media-detail.tsx`.

Dimensions, poids, type MIME réel, date, téléverseur, liste des variantes générées,
usages. Prévisualisation des PDF (première page) et des vidéos (balise `<video>`).
EXIF si disponible — en signalant que la géolocalisation EXIF est une donnée
personnelle et en proposant de la retirer au téléversement.

## 5. Critères d'acceptation

- Trente fichiers se téléversent en une opération, avec progression.
- Aucun fichier n'est transporté en base64.
- Une médiathèque de deux mille assets reste utilisable.
- Aucune suppression sans savoir où le média est utilisé.
- La règle d'alternative textuelle obligatoire n'est ni contournée ni affaiblie.
- Remplacer un fichier ne laisse aucun cache servir l'ancien.

## 6. Tests exigés

- Bout en bout : téléversement multipart d'un fichier de plusieurs Mo contre un vrai
  serveur, en vérifiant que le type stocké est celui des octets (règle de sécurité
  L10, à ne pas régresser).
- Bout en bout : `/_image` refuse toujours un non-image, et `/api/media` exige
  toujours une session.
- Unitaires : la file d'attente d'upload (échec d'un fichier n'annule pas les autres).
- Composant : recherche et filtres.
- Intégration `MediaStore` sur les trois bases — écrite mais **jamais exécutée**
  (Docker indisponible) ; à faire tourner à cette occasion.
- Accessibilité : la zone de dépôt a une alternative au clavier (bouton de sélection
  de fichiers), obligatoire.

## 7. Pièges connus

- **Le cache d'un an sur `/_image`.** Sans paramètre de version, remplacer un fichier
  ne change rien pour les visiteurs pendant douze mois. C'est le piège le plus
  coûteux de cette fiche.
- **`/_image` est public par nécessité** et restreint à `kind === 'image'` (décision
  L10). Toute nouvelle route de média doit décider explicitement de son côté de cette
  frontière — c'est ici qu'une fuite de médiathèque a déjà eu lieu une fois.
- **R10** : pas de `sharp`, pas de binaire natif. Le pipeline actuel s'en passe déjà.
- **Le téléversement multiple multiplie les défauts d'accessibilité** : trente images
  sans alternative textuelle en un clic est un régression d'accessibilité si l'écran
  ne force pas le rattrapage. D'où la liste « à compléter » de la tâche 1.
- **EXIF contient des coordonnées GPS.** Les afficher est une fuite de vie privée si
  l'image est publique ; proposer le retrait au téléversement.
- **Le balayage d'usage est un scan complet.** Le borner et dire son coût, jamais le
  lancer silencieusement sur cent mille entrées.

## 8. Décisions à prendre

- Transport de téléversement : `multipart/form-data` (standard, bien outillé) ou corps
  binaire + en-têtes (plus simple à parser). Trancher avant la tâche 1 — tout le reste
  en dépend.
- Recadrage : vraie variante recadrée, ou rotation seule + point focal (recommandé,
  moins de code et pas de risque R10).
- Organisation : étiquettes (recommandé) ou réutilisation de la taxonomie
  hiérarchique.
