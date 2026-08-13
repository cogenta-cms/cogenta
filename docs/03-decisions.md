# 03 — Décisions d'architecture

> Format ADR. Une décision tranchée ne se rediscute pas en cours de développement.
> Pour changer, écrire une nouvelle décision et marquer l'ancienne `Remplacée par`.

---

## ADR-0001 — Cible : développeurs et agences

**Statut** : Acté

**Contexte** — Un CMS ne peut pas servir également le blogueur solo, l'agence et la
grande entreprise. Chaque compromis pour l'un dégrade l'expérience de l'autre.

**Décision** — Le public primaire est le développeur d'agence. Le client éditeur est
un public secondaire, servi *à travers* ce que l'agence lui livre.

**Conséquences** — Thèmes code-first versionnés en git. CLI et API de premier ordre.
Multi-site natif. Environnements dev/staging/prod avec migration de contenu. La qualité
de l'architecture devient le principal argument marketing, car ce public lit le code
avant d'adopter.

---

## ADR-0002 — Wedge : opérations autonomes

**Statut** : Acté

**Contexte** — « Tous les bons côtés de tous les CMS » n'est pas une stratégie. Il faut
une raison unique et économiquement mesurable de migrer.

**Décision** — Le wedge est l'exploitation autonome : sécurité, maintenance et
optimisation continues assurées par des agents.

**Justification** — Le contrat de maintenance est le centre de coût qui absorbe la
marge des agences. C'est aussi le seul wedge qui *nécessite* réellement des agents ;
les alternatives (DX, performance) sont réalisables sans IA et ne différencient pas.

**Conséquences** — Le runtime d'agents est une infrastructure de noyau. Livraison en
mode *propose-and-approve* d'abord : « je patche vos sites tout seul » exige une
confiance qu'un projet inconnu n'a pas encore.

---

## ADR-0003 — Multi-site par flotte, pas par mutualisation

**Statut** : Acté

**Décision** — Chaque site a sa propre install et sa propre base. Un plan de contrôle
central les supervise. Pas de multi-tenant à base partagée.

**Justification** — L'isolation entre clients est non négociable en agence : un site
compromis ne doit pas toucher les autres, et un client qui part doit pouvoir emporter
son install. Le mutualisé transforme chaque faille en incident généralisé — le modèle
WordPress Multisite l'a démontré.

**Le multi-domaine dans un site** (une base de contenu, plusieurs domaines, langues ou
marques) reste une fonctionnalité interne, distincte du multi-site.

---

## ADR-0004 — Séparation plan de contrôle / plan de diffusion

**Statut** : Acté

**Décision** — Le plan de contrôle (admin, API, base, agents) et le plan de diffusion
(ce que voit le visiteur) sont séparés. Trois cibles de diffusion : statique, Node SSR,
edge.

**Conséquences** — Isolation des thèmes obtenue gratuitement. Déploiement sans serveur
possible. Chaque bloc, thème et plugin **déclare ses besoins runtime** dans son
manifeste ; le build statique refuse ou dégrade explicitement, jamais par surprise.

---

## ADR-0005 — Aucune dépendance dure à une infrastructure

**Statut** : Acté

**Décision** — Redis, Docker, S3 et le worker persistant sont optionnels. Chaque besoin
d'infrastructure expose une interface avec au moins un driver dégradé.

**Justification** — WordPress gagne parce qu'il tourne sur un hébergement à 4 €/mois.
« Prenez un VPS » est la réponse des projets Node qui n'ont jamais percé hors de leur
bulle. Bénéfice au-delà du mutualisé : l'installation par défaut n'a aucune dépendance
externe.

**Limite assumée** — Sur mutualisé, les agents tournent par à-coups d'une minute avec
timeout serré. Les agents Sécurité et SEO fonctionnent bien ; un agent qui rédige un
article long échoue. L'interface doit le dire, pas le laisser découvrir.

---

## ADR-0006 — Postgres, MySQL/MariaDB, SQLite. Pas de NoSQL

**Statut** : Acté

**Décision** — Postgres est le défaut recommandé, MySQL/MariaDB est supporté, SQLite
sert le profil Solo. MongoDB et les bases documentaires sont hors périmètre.

**Justification** — Une abstraction couvrant Postgres *et* MongoDB impose le plus petit
dénominateur commun : perte des transactions sérialisables, de l'indexation JSONB, de
l'intégrité référentielle, du full-text natif et des jointures latérales, sur chaque
requête du projet. `pgvector` permet en outre de loger mémoire d'agents, recherche
sémantique et RAG dans la même base, sans service supplémentaire.

**Note** — MariaDB ≥ 11.8 possède un type `VECTOR` natif avec index HNSW dans l'édition
Community. MySQL 9 Community n'offre que le stockage. Repli en cosinus exact, viable
jusqu'à ~100 000 chunks — un site éditorial n'y arrive jamais.

---

## ADR-0007 — Front intégré opinionated, API headless ouverte

**Statut** : Acté

**Décision** — Le projet possède son moteur de rendu et son contrat de thème. L'API
headless reste ouverte pour ceux qui veulent leur propre frontend.

**Justification** — L'exigence « changer de thème et le contenu s'adapte » n'est
réalisable que si le projet possède le contrat de rendu. En headless pur ce contrat
n'existe pas — c'est pourquoi Strapi et Directus n'ont pas d'écosystème de thèmes et ne
peuvent pas en avoir. C'est aussi la condition pour que la génération de thème par IA
fonctionne : l'IA a besoin d'une cible stricte.

---

## ADR-0008 — Astro comme moteur de thèmes

**Statut** : Acté

**Décision** — Les thèmes sont des projets Astro respectant le contrat de thème.
L'admin reste une SPA React séparée.

**Justification** — Zéro JS par défaut, donc de bons Core Web Vitals sans effort. Les
îlots permettent React, Vue ou Svelte dans le même thème, sans imposer un framework à
l'écosystème. Les adaptateurs Astro couvrent nativement les trois profils de diffusion.

**Risque assumé** — Dépendance à un projet tiers qui dicte une partie de la roadmap.

---

## ADR-0009 — Contenu hybride : champs typés + blocs sémantiques

**Statut** : Acté

**Décision** — Un type de contenu possède des champs typés, plus une zone de blocs
optionnelle. Le noyau définit un **vocabulaire fermé de blocs sémantiques** que tout
thème doit implémenter.

**Règle absolue** — Un bloc stocke de la donnée sémantique, **jamais du HTML ni des
classes CSS**. Un thème peut ajouter ses blocs propres, mais doit déclarer un bloc de
repli du vocabulaire standard.

**Conséquences** — Le vocabulaire devient une API publique versionnée. Il doit rester
petit : une dizaine de blocs, pas cinquante. Chaque bloc ajouté est une dette imposée à
chaque auteur de thème. L'admin est généré depuis le schéma.

---

## ADR-0010 — Schéma de contenu en code, versionné

**Statut** : Acté

**Décision** — Les types de contenu sont des fichiers TypeScript dans git, avec
migrations versionnées. L'éditeur visuel de schéma écrit ces fichiers, mais **uniquement
en mode développement**. En production le schéma est en lecture seule.

**Justification** — La dérive de configuration entre staging et production est la
première douleur quotidienne des agences (le problème ACF sur WordPress). Le schéma
génère aussi les types TypeScript consommés par l'API, l'admin et les thèmes : un thème
référençant un champ supprimé **échoue au build, pas en production**.

**Renoncement assumé** — Le client final ne peut pas ajouter un champ seul sur son site
en ligne. Pour une agence c'est une garantie ; pour un blogueur solo sans développeur,
c'est une porte fermée. Cohérent avec ADR-0001.

**Conséquence** — Même en mode hébergé, un pipeline de déploiement est nécessaire.

---

## ADR-0011 — Agents déclaratifs, outils à permissions, plugins tiers isolés

**Statut** : Acté

**Décision** — Un agent est une **politique** (outils autorisés, modèle, déclencheur,
autonomie, budget, mémoire), pas du code. Le code arbitraire vit dans les **outils**,
qui déclarent leurs permissions. Noyau et plugins officiels s'exécutent en processus ;
**les plugins tiers s'exécutent isolés**, sans accès à `fs`, `net`, `process` ni aux
secrets, via un client RPC limité aux capacités approuvées.

**Justification** — 90 % des compromissions WordPress passent par un plugin. Un projet
qui vend la sécurité ne peut pas offrir à chaque plugin tiers un accès arbitraire à la
base et aux clés API. La surface d'attaque devient auditable : on révise une liste de
permissions, pas le comportement d'un modèle.

**Bénéfices** — Un utilisateur crée son propre agent depuis l'admin sans écrire de code.
Le registre d'outils est simultanément un serveur MCP.

**Coût assumé** — Quelques millisecondes de latence par appel isolé, et une API de
plugin plus contrainte à concevoir. Pour les flux à conditions et boucles imbriquées,
un plugin enregistre un outil « workflow » qui repasse par le contrôle de permissions.

---

## ADR-0012 — Licence MPL 2.0, contributions sous CLA

**Statut** : Acté (à reconfirmer avant la première publication)

**Décision** — Le noyau, le thème canonique et le SDK sont sous **MPL 2.0**. Les
contributions passent par un CLA léger.

**Justification** — La MPL applique un copyleft **fichier par fichier** : quiconque
modifie un fichier du noyau doit le publier, mais un thème, un plugin ou un agent écrit
dans ses propres fichiers reste libre d'être commercial. C'est exactement l'équilibre
recherché : un noyau commun qui s'enrichit, un écosystème libre de se monétiser. Elle
inclut une concession de brevets. Elle est approuvée OSI, donc sans le nuage de
suspicion entourant la BSL.

**Précédent** — Quand Terraform est passé en BSL, la communauté a pu forker en OpenTofu
*parce que le code était encore sous MPL*. La licence a fait son travail.

**Écarté** — L'AGPL se déclenche sur l'usage réseau : une agence hébergeant 20 sites
clients se demanderait si elle doit fournir les sources aux visiteurs. Toxique pour le
public visé. Apache 2.0 n'impose aucun retour, ce qui ne correspond pas à l'intention.

**Le CLA plutôt que le DCO** — Changer de licence plus tard exige l'accord de tous les
contributeurs. Le CLA préserve cette option ; le DCO la ferme définitivement.

**Protection réelle** — Elle passe par la **marque**, pas par la licence. Le nom et le
logo sont déposés et non licenciés avec le code : n'importe qui peut forker, personne ne
peut usurper le nom. C'est le dispositif de Linux, Rust et WordPress. À déposer **avant**
l'annonce publique.

---

## ADR-0013 — Le texte riche est du JSON structuré, jamais du HTML

**Statut** : Acté

**Contexte** — Le contrat A liste `richText` parmi les types de champ sans dire ce qu'il
stocke. C'est le champ le plus utilisé d'un CMS : le corps de chaque article y passe.
Son format décide de l'éditeur, du moteur de rendu, de la surface de sécurité et de ce
qu'une IA a le droit de produire.

**Décision** — `richText` stocke un **document JSON structuré**, conforme au modèle
Portable Text restreint au vocabulaire que Cogenta déclare. Jamais de HTML, jamais de
Markdown, jamais le format interne d'un éditeur.

Un document est une liste de blocs typés portant du texte, des marques sémantiques
(`strong`, `em`, `code`, `link`) et des annotations référençant des entités du site
(lien interne, média, note). Le thème traduit ce modèle en HTML ; le stockage ne
contient aucune balise.

**Justification** — La promesse produit est « changer de thème et le contenu s'adapte »
(ADR-0007). Elle n'est tenable que si le contenu ne porte aucune décision de rendu. Du
HTML stocké la brade en silence : le premier `<div class="…">` collé par un éditeur lie
définitivement l'article à un thème.

Deuxième raison, de sécurité : du HTML stocké impose une sanitisation permanente, à
chaque écriture et à chaque lecture, sur du contenu qui vient d'utilisateurs, d'imports
WordPress et d'agents. Un modèle fermé n'a rien à sanitiser — ce qui n'est pas dans le
vocabulaire n'existe pas.

Troisième raison, celle qui décide vraiment : la génération par IA. Le même raisonnement
que pour les skins (`02-architecture.md` § 6) s'applique au texte. Une IA qui **remplit
un schéma sous contraintes vérifiables** est sûre par construction ; une IA qui produit
du markup libre ne l'est jamais.

**Conséquences** — Il faut écrire un rendu par cible de diffusion, et un sérialiseur
HTML pour l'API et les flux. L'import WordPress devient une conversion HTML → modèle,
avec une politique explicite pour ce qui n'a pas d'équivalent, plutôt qu'un copier-coller.
La recherche full-text indexe le texte extrait du document, pas le JSON brut.

**Renoncement assumé** — Un éditeur ne peut pas coller du HTML arbitraire et le voir
rendu tel quel. C'est voulu, et ce sera parfois vécu comme une régression face à
WordPress. Le bloc `embed` couvre le cas légitime du contenu externe ; le reste est une
demande de rendu déguisée, qui appartient au thème.

**Écarté** — Le HTML, pour les trois raisons ci-dessus. Le JSON ProseMirror ou TipTap :
il marie le contenu à un éditeur, et en changer plus tard imposerait de migrer tout le
contenu existant — le contenu doit survivre à l'outil qui l'a saisi. Le Markdown : il n'a
pas d'annotations structurées, donc pas de lien interne vers une entité, pas de média
avec point focal et texte alternatif, pas de référence — tout ce qui distingue un CMS
d'un dossier de fichiers.

---

## ADR-0014 — Une entrée par langue, liées par `translationOf`

**Statut** : Acté

**Contexte** — Le contrat A décrivait deux modèles d'internationalisation incompatibles
en même temps : `localized: true` par champ, qui suppose les traductions dans une même
ligne, et des champs système `locale` et `translationOf`, qui supposent une ligne par
langue. Il fallait trancher avant d'écrire la moindre migration.

**Décision** — **Une entrée de contenu par langue.** Chaque entrée porte son `locale` et,
si ce n'est pas la langue source, un `translationOf` qui pointe l'entrée d'origine.

`localized` cesse d'être une directive de stockage. Il devient une **métadonnée
d'interface** : « ce champ se traduit », ce qui autorise l'admin à proposer la recopie
depuis la source. Il ne change plus la forme de la colonne.

**Justification** — Publier une langue avant l'autre est un besoin éditorial ordinaire :
on traduit après, on publie après. Le modèle à une seule ligne le rend structurellement
impossible, puisque `status`, `publishedAt` et la version sont des attributs de la ligne.

Deuxième raison : ADR-0006 a acheté le full-text natif des trois bases. Des traductions
en JSON dans une colonne y renoncent sur MySQL et SQLite, où l'indexation JSON est
faible. Le découpage RAG (`02-architecture.md` § 5) devient également propre : un chunk
appartient à une langue, sans démêlage.

**Conséquences** — Les champs non traduits sont dupliqués entre les entrées d'une même
famille de traduction. C'est un coût de stockage marginal et une source de dérive réelle :
l'admin doit rendre visible ce qui diverge de la source. Les permissions, les versions et
la programmation de publication s'appliquent par langue, ce qui est le comportement
attendu. Une redirection 301 et un `hreflang` se déduisent de la famille.

**Renoncement assumé** — Modifier un champ partagé sur toutes les langues demande
d'écrire sur plusieurs entrées, donc une opération explicite plutôt qu'une simple mise à
jour. On préfère cette franchise à un modèle où publier en français publierait aussi une
traduction anglaise que personne n'a relue.

**Écarté** — Une ligne unique avec un JSON par langue : perte du full-text natif, perte
de la publication indépendante, indexation faible sur deux des trois bases. Un modèle
hybride, où seuls certains champs seraient traduits en place : il cumule la complexité
des deux et déplace le problème dans chaque requête.

---

## ADR-0015 — Identifiants UUIDv7 générés par l'application

**Statut** : Acté

**Contexte** — Le type de la clé primaire n'était pas spécifié. Il détermine chaque clé
étrangère, chaque URL d'API et chaque index du produit, et il ne se change pas une fois
qu'il existe du contenu en production.

**Décision** — Tout contenu est identifié par un **UUIDv7 généré par l'application**,
jamais par la base. Stocké en `uuid` natif sur Postgres, `char(36)` sur MySQL, `text` sur
SQLite — encapsulé dans la couche de dialecte, invisible pour l'appelant.

**Justification** — ADR-0010 fait de la migration de contenu entre dev, staging et
production une exigence de premier plan, et ADR-0001 vise des agences qui exploitent
plusieurs environnements par site. Des entiers auto-incrémentés y garantissent des
collisions : deux environnements attribuent le même `42` à deux articles différents, et
la fusion devient une réécriture de toutes les clés étrangères.

Deuxième raison, tirée du code déjà écrit : `QueryResult` a dû gagner un champ `insertId`
uniquement parce que MySQL n'a pas `RETURNING` et ne sait rendre une clé auto-incrémentée
que par ce biais. Générer la clé côté application supprime cette divergence de dialecte
au lieu de l'encapsuler.

**UUIDv7 et non v4** : la v7 est ordonnée dans le temps. La v4 est aléatoire et fragmente
les index B-tree à l'insertion, ce qui dégrade les écritures à mesure que la table grossit
— le défaut classique des schémas à UUID, et il est évitable.

**Conséquences** — Une clé occupe 36 caractères plutôt que 8 octets. Les URL publiques
n'exposent pas le volume de contenu, ce qui est un bénéfice de sécurité annexe. Une entrée
peut être créée hors ligne, ou par un agent, et référencée avant d'être écrite.

**Renoncement assumé** — Les index sont plus gros et les jointures marginalement plus
lentes qu'avec des entiers. À l'échelle d'un site éditorial, la différence n'est pas
mesurable ; à l'échelle d'une flotte, la migration de contenu l'est tous les jours.

**Écarté** — L'entier auto-incrémenté, pour les collisions entre environnements et la
divergence de dialecte. L'UUIDv4, pour la fragmentation d'index. ULID, équivalent
techniquement à la v7 mais moins standard, donc moins bien outillé.
