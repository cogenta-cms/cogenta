# L38 — L'aperçu des liens intégrés (oEmbed)

> Deuxième manque de la série engagée le 2026-09-17 (après L37, les pages d'auteur).

## Le problème

Le bloc « Contenu externe » (`embed`, contrat B) prend un service et une adresse, et les
thèmes en tirent un lecteur intégré ou une carte de consentement. Mais rien ne **résout**
le lien : coller une vidéo YouTube ne rapatrie ni son titre, ni sa miniature, ni ses
proportions. Le rédacteur choisit le service à la main dans une liste, devine le format, et
le visiteur voit une carte « Ce contenu YouTube est chargé depuis un service tiers » sans
savoir de quelle vidéo il s'agit. C'est ce qui rend l'intégration agréable dans WordPress.

## La contrainte qui décide de tout : rien vers un tiers avant le consentement

Les thèmes s'interdisent déjà de charger quoi que ce soit du service — pas même une
miniature — tant que le visiteur n'a pas consenti : afficher l'image d'un fournisseur, c'est
lui transmettre l'adresse IP du visiteur. Toute la conception en découle.

## Décisions

1. **Le contrat B ne bouge pas.** Titre, auteur, miniature et dimensions ne sont pas des
   données du bloc : ce sont les métadonnées dérivées d'une adresse, recalculables, au même
   titre que les variantes d'une image. Elles vivent dans un **cache** (une table fixe,
   `cogenta_embed_previews`, SQLite/Postgres/MySQL), pas dans le contenu.
2. **La résolution est faite par le serveur, sur une liste fermée** : YouTube, Vimeo,
   Dailymotion, Spotify, SoundCloud, Bluesky, à leurs adresses oEmbed publiques fixes. Le
   serveur n'appelle **jamais une adresse fournie par l'utilisateur** : l'adresse collée
   n'est qu'un paramètre de ces adresses fixes. Mastodon est exclu (une instance par
   domaine, donc une adresse arbitraire à appeler), comme « autre ».
3. **La miniature est téléchargée une fois et servie par le site** (`/_cogenta/embeds/{empreinte}`),
   jamais par le service : le visiteur ne contacte pas le tiers en la voyant. Elle n'est
   acceptée que depuis les domaines d'images connus de ces services, en image, sous 2 Mo.
4. **Le rendu public ne fait jamais d'appel réseau.** L'hôte pré-charge l'aperçu des blocs
   de la page depuis le cache, comme il pré-charge les médias. Sans aperçu en cache, le bloc
   s'affiche exactement comme avant ; une résolution est alors lancée en arrière-plan, bornée,
   pour la visite suivante.
5. **Contrat D `theme@1.9`, additif** : `RenderContext.embedPreview?(url)` rend un aperçu
   (titre, auteur, miniature déjà résolue en `ImageSource`) ou rien. Les dix thèmes s'en
   servent pour le titre accessible du lecteur et pour la carte de consentement.
6. **Dans l'admin**, coller une adresse dans le bloc reconnaît le service, règle les
   proportions si elles ne sont pas choisies, et montre l'aperçu. Un échec de résolution
   n'empêche rien : on garde la saisie manuelle.
7. **Aucune dépendance nouvelle** (R9) : `fetch` natif, délai de 5 s, corps borné.

## Étapes

1. Le cache (`@cogenta/schema`) : table, magasin, suite de contrat SQLite + trois bases.
2. La résolution (`@cogenta/api`) : détection du service, appels oEmbed fermés, miniature,
   route `POST /api/embeds/resolve`, tests sans réseau (`fetch` injecté).
3. L'hôte (`@cogenta/cli`) : montage, miniature servie, pré-chargement au rendu, résolution
   en arrière-plan.
4. Contrat D `theme@1.9` et les dix thèmes.
5. L'admin : reconnaissance, proportions, aperçu.
6. Vérification dans un navigateur, documentation.

## Vérifié

- `@cogenta/schema` : suite de contrat du cache (SQLite exécutée ; Postgres, MySQL et MariaDB
  écrites, non exécutées ici — Docker indisponible sur cette machine).
- `@cogenta/api` : résolution avec un `fetch` enregistreur, sans réseau — seules les adresses
  fixes sont appelées, redirections refusées (y compris vers `127.0.0.1`), miniature refusée
  hors des domaines du service (y compris `169.254.169.254`), hors type image ou au-delà de la
  taille maximale ; cache, échec mémorisé un jour, route réservée aux comptes connectés.
- `@cogenta/cli`, sur un vrai serveur : résolution, miniature servie par le site, titre et
  miniature sur la carte de consentement après une première visite, **aucune adresse du service
  dans la page**, titre accessible du lecteur. Les serveurs de test sont hors ligne par défaut.
- `@cogenta/admin` : service et proportions remplis, proportions choisies jamais écrasées,
  aucun appel pour un texte qui n'est pas une adresse.

## Revue de sécurité

Faite par le sous-agent `security-reviewer` avant le commit. **Aucun SSRF, aucun XSS, aucun
fichier servi sous un faux type** — vérifiés concrètement, y compris `https://i.ytimg.com@evil.com`,
`evilytimg.com`, les redirections et les adresses IP déguisées. Deux défauts réels, corrigés et
couverts par un test chacun :

1. **Élevé — remplir le disque avec un compte faible.** Être connecté suffisait : un compte
   lecteur ou une clé API publique pouvait faire résoudre des variantes d'une même adresse en
   boucle, chacune écrivant sa miniature. Désormais : réservé aux comptes qui peuvent modifier
   une collection (`canResolve`), limité à 30 résolutions par minute par compte
   (`EMBED_RATE_LIMITED`), paramètres de suivi retirés de l'adresse, et miniature nommée
   d'après ses octets — plusieurs adresses d'une même vidéo partagent un seul fichier.
2. **Moyen — un échec qui n'était pas mémorisé.** Une lecture interrompue par le délai levait
   une exception au lieu d'un échec, et une adresse sous 2 048 caractères pouvait les dépasser
   une fois normalisée (la colonne la refusait) : dans les deux cas, chaque visite relançait les
   appels. Tout échec est désormais attrapé et mémorisé, et la longueur est contrôlée après
   normalisation.

Et une robustesse : l'envoi d'une miniature coupe la réponse proprement si le stockage échoue.

**Essai réel** : les six services résolus avec de vraies adresses (titre, auteur, proportions,
miniature), Vimeo compris.

## Vérifié dans un navigateur, avec le vrai réseau

Sur la vitrine en français : un bloc « Contenu externe » ajouté dans le page builder, une vraie
adresse YouTube collée (avec un paramètre `utm_source`) — service et proportions remplis, aperçu
affiché, enregistrement accepté ; la page publique montre la miniature et le titre sur la carte
de consentement, et **le navigateur ne contacte aucun domaine tiers**.

**Un défaut trouvé seulement là** : le cache range l'adresse normalisée (sans paramètres de
suivi) mais le rendu la cherchait telle que le bloc la garde, donc la page publique ne trouvait
pas l'aperçu. La lecture du cache normalise désormais aussi ; un test couvre le cas.

## Reste ouvert

- La résolution en arrière-plan est par processus (au plus quatre adresses à la fois) :
  plusieurs répliques peuvent résoudre la même adresse une fois chacune.
- Un aperçu est gardé trente jours ; un titre changé chez le service met jusque-là à apparaître.
- Les miniatures remplacées ne sont pas supprimées du stockage (une par adresse, écrasée au
  même nom quand l'extension ne change pas).


## Limite levée le 2026-09-17 — actualiser un aperçu sans attendre trente jours

Un aperçu reste valable trente jours, ce qui est le bon défaut pour un visiteur et le mauvais
pour un rédacteur dont le titre vient de changer chez le service. Le bloc porte maintenant
« Actualiser l'aperçu » : `POST /api/embeds/resolve` accepte `refresh: true`, qui redemande au
service quoi qu'en dise le cache. Ce n'est pas une fenêtre de fraîcheur plus courte — un
visiteur lit toujours le cache — mais une seconde porte, réservée aux comptes qui peuvent
modifier du contenu et décomptée du même quota de trente résolutions par minute.

**Mastodon reste exclu, et c'est une limite de sécurité, pas un oubli** : une instance par
domaine veut dire une adresse arbitraire à appeler côté serveur, c'est-à-dire exactement le
SSRF que la liste fermée d'adresses oEmbed existe pour empêcher. L'ouvrir demanderait un
registre d'instances validé par un humain, pas un assouplissement du résolveur.
