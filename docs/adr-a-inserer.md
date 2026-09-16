
---

## ADR-0029 — Le runtime d'agents s'exécute sur LangGraph.js ; le refus de L22 est levé

**Date** : 2026-08-22
**Statut** : acceptée — texte reconstitué le 2026-09-16 d'après `docs/lots/L24-langgraph-agents-avances.md` et le code livré, l'original remis en conversation n'ayant jamais été versionné

### Contexte

L22 (tâche 1) avait refusé LangGraph comme moteur d'orchestration au nom de R9 :
`@cogenta/agents` avait déjà l'essentiel, et une boucle interne de moins de 300 lignes
suffisait. Après un essai de L23, l'utilisateur a redemandé explicitement LangGraph
« pour plus de stabilité, plus de maturité » à long terme. C'est une décision produit,
qui prime sur le choix technique précédent — à condition de la tracer ici plutôt que de
laisser le code contredire silencieusement L22.

Recherche factuelle menée avant d'acter : aucun blocage technique dur (ESM, aucune
dépendance native, version 1.x stable et activement maintenue). Coût réel : une
quinzaine de paquets transitifs, dont `langsmith` (SDK propriétaire de LangChain, tiré
obligatoirement, jamais appelé par Cogenta), et une ré-architecture pour que
`withAutonomy` s'intègre au modèle de graphe plutôt qu'au décorateur existant.

### Décision

`runAgentLoop` (`packages/agents/src/runtime/loop.ts`) est réécrit sur
`@langchain/langgraph` (`StateGraph` à deux nœuds `agent` et `tools`,
`Annotation.Root`), nouvelle dépendance directe de `@cogenta/agents`. Ce qui ne change
pas, et qui est la condition de cette décision :

- la **signature publique** de `runAgentLoop` et de `createAgentRunner` ;
- **l'ordre exact des gardes** à chaque itération : confidentialité, signal
  d'annulation, coupe-circuit, durée, budget, puis seulement l'appel au modèle ;
- **R4** : `withAutonomy` reste l'unique point de décision de permission. Le nœud
  `tools` ne reçoit jamais un outil brut, seulement ce que `withAutonomyForManifest` a
  déjà enveloppé en amont ; il n'a donc et ne peut avoir aucune branche de permission ;
- le contrat C (`buildManifest`/`createToolRegistry`) garde sa forme publique, et les
  trois niveaux d'autonomie se comportent identiquement vus de l'admin.

### Conséquences

- R4 est **prouvé** dans la nouvelle architecture, pas supposé hérité : un test appelle
  `runTool` nu (l'outil s'exécuterait sans garde) puis le même appel enveloppé par
  `withAutonomy` (il ne s'exécute pas).
- `langsmith` est présent dans l'arbre sans usage : c'est documenté dans le changeset
  de la dépendance, pour qu'un audit ultérieur ne le prenne pas pour un usage actif
  oublié.
- Les suites existantes de l'orchestrateur ont été rejouées telles quelles après la
  migration, sans réécriture pour contourner un comportement changé.

### Écarté

- **Garder la boucle maison** (décision de L22) : techniquement suffisante, mais
  contraire à la demande explicite de l'utilisateur sur la maturité à long terme.
- **Mettre le contrôle de permission dans un nœud du graphe** : cela aurait fait de
  LangGraph une seconde porte d'autorisation, exactement ce que R4 interdit.

---

## ADR-0032 — Un connecteur Google Search Console optionnel, désactivé par défaut, est accepté (renonce partiellement à la posture « pas d'OAuth » de la fiche 50)

**Statut** : Acté

**Contexte** — La fiche 50 (SEO éditoriale avancée) avait explicitement écarté tout appel
OAuth vers Google/Bing : *« Ne pas ajouter d'appel OAuth Google/Bing — R1/R7 : rester sur
la vérification par balise meta, sans nouveau secret tiers »*. La fiche 70 (SEO niveau
plateforme complète), écrite après une recherche réelle sur AIOSEO/The SEO
Framework/MonsterInsights/Site Kit demandée directement par l'utilisateur, a identifié que
le vrai différenciateur de ces quatre outils face à Cogenta n'est pas la production de
métadonnées (déjà bonne) mais la donnée de performance réelle — clics, impressions,
position moyenne — que seule une connexion Search Console peut fournir. Tranché en direct
avec l'utilisateur le 2026-08-28 : accepter le connecteur, à la condition explicite que la
fonctionnalité SEO reste excellente même sans jamais l'activer.

**Décision** — Un connecteur Search Console optionnel, **désactivé par défaut**, s'ajoute
à `@cogenta/seo`/`@cogenta/api`/`@cogenta/admin` :

1. **Aucune fonctionnalité de la fiche 70 n'en dépend.** Score de contenu, assistant de
   maillage interne, grille de fonctionnalités activables : les trois tâches qui font le
   corps de la fiche fonctionnent intégralement sans ce connecteur (R2). Le connecteur
   n'ajoute qu'une **quatrième source de données** à un écran déjà complet, jamais une
   fonctionnalité dont dépendent les autres.
2. **Le jeton OAuth est un secret par site, jamais vu par un modèle** (R7) — injecté par
   le runtime dans un client pré-configuré, jamais transmis en clair à l'admin après
   l'échange initial, sur le modèle déjà établi pour les fournisseurs LLM chiffrés au repos
   (AES-256-GCM, clé dérivée de `COGENTA_AUTH_SIGNING_KEY`, L22 tâche 1).
3. **Repli complet si non configuré** (R1) : l'écran SEO fonctionne identiquement, la
   section « Performance réelle » est simplement absente plutôt que vide ou en erreur — le
   même contrat que `GET /api/assistant` répondant `{available:false}` sans fournisseur
   (L18).
4. **Portée strictement lecture seule** — le connecteur ne fait jamais d'appel en écriture
   vers l'API Google (jamais de soumission de sitemap via l'API, IndexNow reste le canal
   pour ça), pour limiter la surface de ce que le jeton autorise.

**Renoncement assumé** — R1 (« aucune dépendance dure à une infrastructure ») visait à
l'origine toute dépendance à un service externe pour une fonctionnalité *cœur*. Cette ADR
ne le renverse pas : elle ouvre une exception nommée et bornée (lecture seule, désactivée
par défaut, un connecteur parmi plusieurs, jamais un chemin obligatoire) plutôt que de
réinterpréter R1 lui-même. Le prix payé est réel : c'est la première fois que ce projet
accepte un flux OAuth vers un tiers, et donc la première fois qu'un jeton long-vivant par
site existe dans ce système — géré avec la même discipline que les clés de fournisseur LLM
existantes, pas une nouvelle catégorie de risque non gouvernée.

**Écarté** — Bing Webmaster Tools et les autres moteurs n'ont pas d'API comparable
largement adoptée ; ce connecteur reste spécifique à Google Search Console. Une intégration
Google Analytics complète (au-delà de Search Console) n'est pas actée ici — seulement
envisageable dans une ADR ultérieure si le besoin est prouvé, `@cogenta/analytics` (fiche
64) restant la source de vérité pour les données de trafic auto-hébergées.

---

## ADR-0033 — Les langues de contenu deviennent un réglage éditorial ; retirer une langue est refusé tant qu'elle porte du contenu

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

---

## ADR-0034 — Un thème peut venir d'un dossier local au projet, pas seulement d'un paquet npm de `@cogenta/cli`

**Statut** : Acté (en direct avec l'utilisateur, 2026-09-07)

**Contexte** — Depuis L23, `cogenta serve` ne peut activer qu'un thème présent dans
`BUILTIN_THEMES` : une liste figée, une par une, aux dépendances npm de `@cogenta/cli`
lui-même. Le commentaire du fichier était explicite : « jamais un scan du système de
fichiers ». Cette limite entrait frontalement en collision avec une demande produit déjà
formulée par l'utilisateur — générer des thèmes par IA — puisqu'un thème généré,
aussi bon soit-il, n'avait littéralement nulle part où être posé pour un site réel : il
aurait fallu le publier sur npm et l'ajouter à cette liste, un geste qui n'appartient
qu'à l'équipe Cogenta, jamais à l'opérateur d'un site.

**Décision** — `cogenta serve` cherche un thème d'abord dans `BUILTIN_THEMES`
(inchangé, à l'octet), puis dans `<projectRoot>/themes/<nom>/` — un dossier que le
projet du site possède lui-même, chargé dynamiquement au démarrage. Même principe que
`cogenta.schema.ts`, déjà chargé ainsi depuis L2. Un thème local suit exactement la
même forme qu'un thème npm (`theme.config.*` pour le manifeste, contrat D inchangé) et
gagne un second fichier requis, `theme.render.*`, exportant `renderPage`/`renderChrome`.

**Justification** — Le vocabulaire de blocs (contrat B) n'était pas le vrai verrou : un
bloc propre à un thème, avec repli, est déjà résolu côté rendu depuis la fiche 43. Le
verrou réel était l'emplacement où un thème peut vivre. `loadTheme`
(`@cogenta/render`) cherchait déjà dans `themes/` sans que rien ne l'appelle en
production — la moitié du travail était déjà écrite, simplement jamais branchée.

**Conséquences** — Un développeur peut écrire un thème à la main et le déposer dans
`themes/`, sans jamais invoquer l'IA ni ce dépôt. C'est la fondation de la fiche 73
(`docs/plans/73-themes-locaux-bac-a-sable-ia.md`) : bac à sable isolé, pipeline de
déploiement avec scan de sécurité, génération par IA, export/import — chacune une
tâche séparée, ordonnée, construite sur cette fondation.

**Le point de vigilance que cette ADR pose, sans le résoudre entièrement** — un thème
est du code exécuté dans le process de `cogenta serve`. `verifyTheme` (scan statique
d'imports interdits — `node:fs`, une connexion base, un paquet de driver) s'exécute
avant tout chargement d'un thème local, refusant plutôt qu'avertissant un thème qui
échoue ce contrôle — corrigé pendant la revue de cette tâche même (`contract-guardian`
avait d'abord trouvé le chemin de chargement local sans ce scan). C'est une protection
réelle contre la classe d'attaque la plus évidente (un thème qui lit `process.env` ou
une base directement), mais **ce n'est pas une isolation d'exécution** — un thème qui
passe le scan statique tourne toujours dans le même process, sans limite de temps ni de
mémoire. La fiche 73 prévoit l'isolation complète par `worker_threads`/`vm`
(réutilisant `@cogenta/plugins`) pour le bac à sable de développement/aperçu — cette
ADR ne couvre que la fondation (le chemin de résolution + le scan statique), pas encore
l'isolation d'exécution complète, qui reste un chantier ouvert et explicitement nommé
comme le principal inconnu technique de la fiche.

**Renoncement assumé** — Un thème local n'a, pour l'instant, aucune garantie
d'isolation d'exécution au-delà du scan statique. Un opérateur qui dépose un thème
malveillant suffisamment habile pour passer ce scan (par exemple un import
dynamiquement construit que le scan ne peut pas lire statiquement — déjà détecté et
refusé, en fait, par `verifyTheme`) reste, en théorie, un risque tant que la tâche
d'isolation par worker n'est pas livrée. Ce renoncement est documenté, pas caché : la
fiche 73 le nomme explicitement comme son inconnu technique principal, à chiffrer avant
toute génération de thème par IA en production.

**Écarté** — Copier le mécanisme WordPress tel quel (un dossier déposé est exécuté
sans aucun contrôle) a été explicitement écarté : c'est le mécanisme précis qui a fait
de WordPress la cible la plus compromise du web via ses thèmes et extensions tierces.

---

## ADR-0035 — Les visuels de démonstration sont générés procéduralement, en PNG, sans dépendance

**Statut** : Proposé (rédigée par L25, à insérer par l'humain)

**Contexte** — Un template de site n'est crédible qu'avec des visuels, et les blueprints
n'en semaient aucun. Trois voies ont été testées et écartées : le SVG semé comme média est
refusé par l'API (ADR-0017), la rastérisation SVG par `wasm-vips` n'existe pas dans le build
embarqué (`svgload` absent, vérifié), et `sharp` — qui saurait le faire — est un pair
optionnel dont R10 interdit de faire le chemin principal. Des photos tierces poseraient un
problème de licence invérifiable et de poids de paquet.

**Décision** — `create-cogenta` génère ses visuels de démonstration lui-même : un encodeur
PNG minimal sur `node:zlib` et un rendu procédural (dégradés, halos, formes anticrénelées,
grain) décrit par des compositions par blueprint, ingéré ensuite par le pipeline média
ordinaire. Zéro dépendance, zéro asset binaire dans le paquet.

**Justification** — Le registre visuel abstrait est celui des templates SaaS, agence et
portfolio modernes ; il vieillit bien, se remplace en un clic, et ne peut violer aucune
licence. Le rendu tient en quelques secondes au scaffold, une fois pour toutes.

**Conséquences** — Les blueprints décrivent des compositions, pas des fichiers. Le pipeline
média reçoit du PNG et produit les variantes comme pour un téléversement humain.

**Renoncement assumé** — Aucune photo réaliste : un restaurant de démo n'a pas de photo de
plat. C'est le prix de « zéro dépendance et zéro licence », payé en connaissance de cause.

**Écarté** — SVG (ADR-0017) ; `sharp` en chemin principal (R10) ; photos embarquées
(licence, poids) ; images générées par IA au scaffold (R2 : le CMS marche sans clé).

---

## ADR-0036 — Un plugin étend le vocabulaire sans y entrer

**Date** : 2026-09-16
**Statut** : acceptée

### Contexte

Les contrats B (blocs) et le vocabulaire de widgets sont fermés et figés. Un
utilisateur demande ce que tout CMS permet : qu'une extension ajoute un composant
à une page. Trois voies existaient :

1. ouvrir le contrat B par RFC à chaque besoin — un vocabulaire figé qui grossit
   n'est plus figé, et chaque ajout est une migration pour tous les thèmes ;
2. laisser un plugin rendre du HTML libre — ce que fait WordPress, et ce que R3
   interdit explicitement (« un bloc ne stocke jamais de HTML ni de CSS ») ;
3. enregistrer les blocs d'un plugin **à côté** du vocabulaire, avec un repli
   déclaré vers un bloc du vocabulaire.

`BlockRegistry` prévoyait la troisième depuis L3 (« les blocs du vocabulaire, plus
ce qu'un thème ou un plugin ajoute ») et `resolveRenderable` en implémentait déjà
la chaîne de repli, sans que rien ne l'utilise.

### Décision

Un bloc ou un widget fourni par un plugin **n'entre jamais dans le vocabulaire**.
Il est enregistré à côté, pour ce site-là, et :

- un **bloc** déclare un `fallback` (obligatoire) et un `fallbackFrom` qui dit
  d'où les champs du repli tirent leurs valeurs ; sans cette carte, « se replier
  sur `prose` » signifierait « disparaître », les données d'un bloc arbitraire ne
  satisfaisant pas le schéma d'un bloc du vocabulaire ;
- un **widget** ne déclare pas de repli : c'est de l'habillage, et un widget
  absent n'est pas dessiné ;
- le schéma des champs est déclaré **en données** dans `plugin.manifest.json`,
  jamais en code (ADR de L31 : le manifeste est lu, jamais exécuté), et il est
  compilé par les constructeurs `f.*` du vocabulaire lui-même, donc un bloc de
  plugin a le même validateur et la même enveloppe qu'un autre ;
- le rendu renvoie **un arbre** (`@cogenta/theme-kit`), jamais une chaîne, et
  l'hôte le revalide contre une liste blanche de balises, d'attributs et d'URLs
  avant sérialisation ; un arbre refusé fait tomber le bloc sur son repli, il
  n'est jamais « nettoyé » en autre chose ;
- le rendu s'exécute dans le processus enfant restreint de L31, avec les seules
  capacités accordées, et son résultat est mis en cache sur l'empreinte des
  entrées.

Contrat D monté en `theme@1.7`, additif : `RenderContext.blockNodes` porte le
markup déjà produit par l'hôte, et `ResolvedWidget` gagne un membre du même
genre. Un thème qui ignore l'un ou l'autre rend le repli déclaré — la dégradation
promise depuis L3, pas un accident.

### Conséquences

- Le contrat B reste figé et son compte de blocs ne bouge pas ; aucune RFC n'est
  requise pour qu'un site gagne un composant.
- Désinstaller un plugin dégrade les pages qui utilisaient ses blocs au lieu de
  les vider, et laisse leurs données intactes pour une réinstallation.
- Un bloc de plugin coûte une exécution de plugin au premier rendu de chaque
  combinaison (plugin, version, valeurs, locale) ; le cache est en mémoire, donc
  ce coût revient après un redémarrage.
- Un plugin ne peut pas livrer de CSS : il émet des classes, le thème les style.
  C'est une limite volontaire de cette ADR, à rouvrir séparément si besoin.

---

## ADR-0037 — La visibilité d'une entrée est orthogonale à son statut

**Date** : 2026-09-16
**Statut** : acceptée

### Contexte

Une entrée est `draft`, `scheduled`, `published` ou `archived`. Rien ne permet
d'exprimer « publiée, mais réservée » — ni la note interne visible des seuls
rédacteurs, ni le dossier de presse derrière un mot de passe. Les deux existent
dans le cœur de WordPress, et leur absence pousse les gens à dépublier, ce qui
casse les liens.

Trois voies étaient possibles :

1. ajouter `private` et `password` à `ContentStatus` — mais le statut deviendrait
   deux informations dans un champ (une page privée serait-elle encore publiée ?),
   tous les `switch` exhaustifs du dépôt changeraient, et « planifiée et privée »
   resterait inexprimable ;
2. un réglage hors contenu (une table de permissions par entrée) — un second
   système d'autorisation à côté de celui qui existe ;
3. un champ **orthogonal**, comme `deletedAt` (ADR-0022) et `reviewState`
   (ADR-0027) l'ont déjà été.

### Décision

`visibility` (`'public' | 'private' | 'password'`) est un champ système
orthogonal à `status`, en `schema@2.3`, additif et réversible. Avec lui :

- **privée** : visible des seuls acteurs à qui la couche de permissions
  accorderait `update` sur la collection. Pour les autres, **404 et non 403** —
  pour une note interne, l'existence est déjà l'information — et absence de
  toute liste, de la recherche, du sitemap et des relations ;
- **protégée** : listée, liable, mais son contenu et son résumé demandent un mot
  de passe, dont seule l'empreinte est stockée et qui n'est jamais relisible ;
- **changer la visibilité exige `publish`**, emprunté comme la corbeille
  emprunte `delete` : le vocabulaire des cinq actions reste figé, et qui peut
  lire une page est ce que publier décide.

La preuve de déverrouillage est un jeton signé (jamais chiffré) dans un cookie
par entrée, calqué sur les jetons de prévisualisation, d'une durée bornée.

### Conséquences

- Le contrat A monte en `schema@2.3` sans qu'un client existant change une ligne.
- Le filtre vit dans la couche partagée par REST et GraphQL : une page privée ne
  peut pas fuir par un transport qui aurait oublié la règle.
- Une page protégée n'est ni indexée ni décrite : son résumé est du contenu.
- Ce qui n'est **pas** décidé ici : la limitation de débit des tentatives de mot
  de passe, et le partage d'un déverrouillage entre appareils.
