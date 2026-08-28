## ADR-0032 — Les langues de contenu deviennent un réglage éditorial ; retirer une langue est refusé tant qu'elle porte du contenu

**Statut** : Acté

**Contexte** — La fiche 68 (« Réglages généraux ») documente que `site.locales` et
`site.defaultLocale` (`packages/core/src/config/schema.ts`, ADR-0025 les classe
« infrastructure ») ne se changent aujourd'hui qu'en éditant `cogenta.config.mjs` à la
main puis en redémarrant — aucune UI d'admin ne les touche. C'est le seul réglage que la
fiche 23 avait explicitement laissé au fichier (« aucun réglage existant ne migre »), et
la fiche 68 elle-même recommande une ADR avant d'y toucher plutôt que de traiter ça comme
un simple bascule : **retirer une langue de `site.locales` ne supprime aucune entrée**
(ADR-0014 : une entrée de contenu par langue, liée par `translationOf`), mais une entrée
dont le `locale` n'est plus dans la liste active devient injoignable par le sélecteur de
langue de l'admin, absente du `hreflang` de sa famille, et invisible à toute nouvelle
saisie — du contenu déjà traduit et déjà publié se retrouve orphelin sans qu'aucune
suppression n'ait eu lieu, un symptôme silencieux et donc pire qu'une erreur bloquante.

Deux tensions à trancher ensemble :
1. **Où vit la valeur ?** La rendre éditable depuis l'admin, en direct, contredit la règle
   posée fiche 23 §8 pour tout le reste (« rien de ce qui est déjà en fichier ne migre
   vers le registre ») — règle qui protège justement contre la dérive de configuration
   qu'ADR-0010 nomme pour le schéma de contenu. Une langue de contenu n'est cependant pas
   de la même nature qu'une chaîne de connexion ou un secret : c'est une décision
   éditoriale ordinaire (« ce site publie aussi en espagnol »), de la même famille que
   `general.title`, pas de la famille `security.*`.
2. **Que devient le contenu déjà traduit ?** Retirer une langue doit avoir un sort
   explicite pour ses entrées, pas un silence.

**Décision** — Les langues de contenu deviennent un réglage **éditorial**, au même titre
que le reste du registre (`SITE_SETTINGS_REGISTRY`) : `general.locales` (tableau de codes
de langue) et `general.defaultLocale` (un code parmi `general.locales`), tous deux
`scope: 'site'`, `writeRoles: admin`. `cogenta.config.mjs` reste la source au premier
démarrage (`site.locales`/`site.defaultLocale` deviennent la **valeur de départ** que la
première lecture du registre écrit une fois dans la base, jamais relue ensuite) — un site
existant garde exactement son comportement actuel tant que personne ne touche l'écran, et
n'a besoin d'aucune migration de contenu pour continuer à fonctionner.

Ajouter une langue est une opération purement additive, sans garde. **Retirer une langue
est refusé tant qu'au moins une entrée, dans n'importe quelle collection routée, porte ce
`locale`** — un contrôle applicatif, sur le même modèle qu'ADR-0022 pour `restrict`
(mettre à la corbeille ne suffit pas à débloquer le retrait : une entrée dans la
corbeille reste une entrée avec ce `locale`, exactement le raisonnement qui fait qu'
ADR-0022 fait aussi refuser `purge()` par le même contrôle). Le message d'erreur nomme le
nombre d'entrées concernées et la marche à suivre (les retraduire dans une langue
restante, ou les purger explicitement) — jamais une suppression en cascade automatique.
Changer la langue par défaut n'a pas ce garde-fou (aucune entrée n'est perdue ou rendue
injoignable par ce changement), mais l'écran avertit si la nouvelle langue par défaut n'a
elle-même aucune entrée publiée.

**Justification** — Le principe qui range une valeur dans « infrastructure » plutôt
qu'« éditorial » (ADR-0025) n'est pas « ça vivait dans un fichier avant », c'est « qui
doit pouvoir la changer, et à quelle fréquence » — un secret de base de données n'a pas sa
place dans un registre qu'un rédacteur peut écrire, une liste de langues publiées si.
Fiche 23 §8 protégeait contre une migration *sans réflexion* de tout le fichier vers la
base ; ceci est l'inverse, une migration décidée au cas par cas pour la seule valeur dont
la nature éditoriale est sans ambiguïté. Le garde-fou de retrait suit exactement le
précédent qu'ADR-0022 a déjà posé pour les taxonomies et les collections liées par
`restrict` : nommer ce qui bloque plutôt que le deviner, refuser plutôt que perdre.

**Conséquences** — Un nouvel outil de comptage cross-collection (« combien d'entrées, dans
n'importe quelle collection routée, portent ce `locale` ») doit exister côté
`@cogenta/schema` ou `@cogenta/api` avant que le retrait puisse s'implémenter — rien
d'équivalent n'existe aujourd'hui (le compteur `restrict` d'ADR-0022 est borné à la
collection sœur d'une relation, jamais à « toutes les collections du site »). Tout
consommateur qui lit `site.locales`/`defaultLocale` directement depuis
`SchemaDocument`/`config` (le sélecteur de tagline, la génération de `hreflang`, le
sélecteur de langue à la création d'une entrée, `@cogenta/seo`) doit être audité et
basculé vers une lecture du registre, avec repli sur le fichier tant que la base n'a
jamais été écrite — le même repli « valeur de départ, jamais relue » que ce document pose
plus haut.

**Renoncement assumé** — Un site qui gère ses langues uniquement par fichier (déploiement
versionné, revue de code sur chaque changement de langue) perd cette discipline si un
compte `admin` change la liste depuis l'écran — exactement le compromis qu'ADR-0025 a déjà
accepté pour `general.title` ou `discussion.enabled`, étendu ici à un réglage qui, pour la
première fois, peut rendre du contenu existant injoignable s'il est mal utilisé. Le
garde-fou de retrait limite le risque sans l'annuler : rien n'empêche un admin de purger
puis retirer, en deux gestes délibérés.

**Écarté** — Un flux « proposer/appliquer en développement seulement », sur le modèle
d'ADR-0023 (L19) : écarté parce qu'ADR-0023 répond à une contrainte précise, la dérive de
`cogenta.schema.*` entre environnements quand un thème ou l'API générerait des types
obsolètes — une langue de contenu ne génère aucun type, ne casse aucun build, et un
rédacteur qui doit attendre un cycle `cogenta dev` → commit → déploiement pour publier un
site en une langue de plus est un coût sans bénéfice correspondant. Une simple case à
cocher sans aucun contrôle de contenu existant : écartée, c'est exactement le
« bascule silencieuse » que la fiche 68 met en garde contre.
