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
