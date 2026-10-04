# SEO-01, SEO-02 et titres du blog public

Les nouveaux packs Blog et Vitrine fournissent une `seoDescription` explicite
pour l'accueil, dans les champs SEO ordinaires déjà prévus par la fiche 13.
Vitrine possède une rédaction française et anglaise dédiée ; Blog reprend les
sujets de sa publication. La description inclut le nom saisi pour le site et
respecte la limite de 160 caractères du champ. Elle reste éditable, avec la
priorité existante sur l'extrait et le défaut SEO du site. Aucun texte marketing
n'est généré à la lecture. Le diagnostic SEO existant signale les descriptions
absentes ; son test reste la référence pour cette visibilité.

Les trois sections « Notes » de démonstration sont maintenant des h2, au même
niveau que les autres sections des essais. Le thème continue de respecter les
niveaux inscrits dans le texte riche d'un auteur. Aucun contenu existant n'est
réécrit : un ancien pack déjà importé conserve ses titres et peut être corrigé
éditorialement. L'import des nouveaux exemples reste soumis aux choix de
conservation/réinitialisation du lot L28.

Une installation sans favicon déclare et sert `/favicon.ico`, un petit document
neutre, sans marque Cogenta. Le favicon choisi dans Apparence reste prioritaire,
puis le logo de remplacement du site. La route de repli relit l'identité et la
bibliothèque de médias à chaque demande : un média vivant donne une redirection
vers son image, un média absent retombe sur l'icône neutre. GET et HEAD sont
publics ; les autres méthodes répondent 405. Le cache impose la revalidation,
pour qu'un changement d'identité soit visible sans redémarrage.

Validation ciblée : packs et structure des titres, semis réels SQLite,
PostgreSQL, MySQL et MariaDB, préservation d'un h4 d'auteur, vrai HTTP du favicon
et des métadonnées après édition. Les contrôles Lighthouse et axe de livraison
restent consignés par la recette globale sur des sites fraîchement semés.
