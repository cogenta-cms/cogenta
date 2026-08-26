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

**Statut** : Acté. **Élargie par ADR-0030** (2026-08-26) sur le seul point « le
vocabulaire doit rester petit, une dizaine de blocs, pas cinquante » — la règle absolue
(donnée sémantique uniquement, jamais de HTML/CSS) et le mécanisme de repli restent
inchangés et non rediscutés. Voir ADR-0030 pour le texte complet du renoncement.

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

---

## ADR-0016 — Un thème lit le contenu par HTTP, avec un jeton restreint

**Statut** : Acté

**Contexte** — Le contrat D disait que le `RenderContext` n'expose ni la base, ni les
secrets, ni `fs`, sans dire comment un thème obtient du contenu. Or le bloc
`collectionList` du contrat B est une liste dynamique : il lui faut une requête. Sans
réponse, chaque auteur de thème en aurait inventé une, et la première aurait été un
import direct de la couche de données.

**Décision** — Le `RenderContext` expose un `content`, **client HTTP vers l'API de
contenu, porteur d'un jeton restreint en lecture**. C'est la seule porte d'accès aux
données qu'un thème possède.

Le jeton porte les droits du rôle `public`. En prévisualisation, il porte un
`PreviewGrant` limité à une entrée. Un thème ne peut donc pas atteindre un brouillon,
même en le demandant.

L'isolation est **vérifiée à l'installation**, pas seulement documentée : une analyse
statique des sources refuse un thème qui importe `node:fs`, `node:child_process`,
`node:net`, `node:vm`, un paquet du noyau ou un driver de base. Refusé, pas averti.

**Justification** — Cela découle d'ADR-0004 plutôt que de s'y ajouter : les deux plans
étant séparés, le processus de rendu ne possède déjà ni secrets ni connexion. Passer par
HTTP ne fait qu'énoncer ce qui est déjà vrai, et le rend vérifiable.

Le bénéfice est qu'un thème tiers devient sûr par construction. Le projet vend la
sécurité comme propriété de l'architecture : un thème doit être *incapable* de lire la
base, pas simplement prié de ne pas le faire — la même exigence qu'ADR-0011 pose aux
plugins.

**Conséquences** — Le rendu paie un aller-retour HTTP là où un accès direct aurait lu en
mémoire. C'est ce que le cache de rendu par tags compense, et c'est pourquoi il est dans
L3 et non plus tard. En statique, ces requêtes ont lieu au build et disparaissent
entièrement de la production.

**Renoncement assumé** — Un thème ne peut pas faire de jointure arbitraire ni de requête
optimisée à la main. Le vocabulaire de filtres du contrat de l'API est ce qu'il a. Un
thème qui a besoin de plus a besoin d'un plugin, ce qui est exactement la frontière
qu'on veut.

**Écarté** — Un accès direct à la couche de données, même en lecture seule : il rend
l'isolation déclarative, donc fausse dès le premier thème tiers. Une API de données
injectée en mémoire : plus rapide, mais elle place le thème dans le même processus que
les secrets et supprime la sandbox obtenue gratuitement par ADR-0004.

---

## ADR-0017 — Un SVG téléversé est refusé par défaut, jamais servi brut

**Statut** : Acté

**Contexte** — `docs/lots/L2-admin.md` (tâche 11, médiathèque) exige : « SVG : assainis
ou refusés selon la configuration, jamais servis bruts par défaut. » Un SVG est du XML,
et peut porter `<script>`, des gestionnaires d'événements (`onload`, `onclick`) et des
références externes (`<image href="...">`, `@import` CSS) — c'est du contenu exécutable
déguisé en image, exactement le risque qu'un pipeline d'assainissement doit retirer avant
de le laisser sortir. Aucun assainisseur de SVG n'existe dans le projet aujourd'hui, et en
écrire un correct (résister aux vecteurs d'échappement connus, pas seulement à la liste
la plus évidente) est un travail à part entière — le pipeline d'images existant
(`packages/render/src/images/`) traite déjà explicitement le SVG comme hors de son champ
(« Animated GIFs and SVGs are served untouched instead of being resized »).

**Décision** — La médiathèque **refuse tout téléversement de SVG par défaut**. Le champ
`decorative`/`alt` et le point focal ne changent rien à ce refus ; c'est un rejet au
niveau du type de fichier, avant toute autre validation. Un futur mode « assaini »
restera possible (option de configuration explicite), mais seulement une fois qu'un
assainisseur réel existe et a été revu par `security-reviewer` — jusque-là, activer un
mode qui n'existe pas doit échouer au démarrage plutôt que de servir un SVG non assaini
en silence.

Le refus s'appuie sur le même principe que le reste du pipeline : le type réel est lu
dans les octets (`packages/core/src/media/format-sniff.ts`, `describeContainer`), jamais
dans l'extension du fichier ni le `Content-Type` déclaré par le client — les deux sont
falsifiables, et « téléverser un fichier déguisé » est un test de sécurité nommément
exigé par le lot.

**Justification** — « Refusé par défaut » satisfait littéralement l'exigence du lot
(« jamais servis bruts par défaut ») sans construire un assainisseur dont une faille de
contournement serait, par construction, une vulnérabilité XSS stockée dans la
médiathèque — un risque disproportionné par rapport à la fréquence réelle du besoin
« logo SVG dans le contenu ». Refuser maintenant et assainir plus tard est réversible ;
assainir maintenant avec un assainisseur non revu ne l'est pas au sens où la faille aurait
déjà pu être exploitée.

**Conséquences** — Un site qui a réellement besoin de logos SVG doit les livrer par le
thème (fichiers statiques, contrôlés par le développeur du thème, jamais par un
formulaire d'upload d'éditeur) tant que le mode assaini n'existe pas. Le message de refus
nomme le format détecté, pas une erreur générique, pour que l'éditeur comprenne
immédiatement pourquoi son fichier a été rejeté.

**Renoncement assumé** — Certains éditeurs voudront téléverser un logo vectoriel et ne
pourront pas, temporairement. C'est le compromis assumé plutôt qu'un assainisseur écrit
en urgence et non revu.

**Écarté** — Assainir par une liste noire de balises/attributs dangereux, écrite pour
cette tâche : les listes noires de XSS SVG sont connues pour être incomplètes (imbrication
d'espaces de noms, entités, `foreignObject`) ; ce n'est pas un travail à faire en passant
dans une tâche d'admin. Convertir tout SVG en PNG à l'upload : perd la vectorialité,
qui est la seule raison de téléverser un SVG plutôt qu'un PNG/WebP.

---

## ADR-0018 — Le journal d'audit se lit, mais seulement par `admin`

**Statut** : Acté

**Contexte** — `packages/auth` porte depuis L2 un journal d'audit à chaînage de hash
(`createAuditLog`, `docs/02-architecture.md` § 4.7), généreux exprès pour que L4 n'ait
qu'à devenir un second rédacteur. Personne n'y écrivait encore et rien ne l'exposait :
la tâche 14 de L2 (« Journal d'audit consultable et filtrable ») en fait le premier
rédacteur réel (connexions, écritures de contenu, médias) et lui donne une route REST.
Aucune décision n'existait sur qui a le droit de le lire — le journal nomme, par
construction, l'identité et l'activité de tous les comptes, ce qui en fait une surface
différente d'une simple liste de contenu.

**Décision** — `GET /api/audit` (liste, filtrable par acteur/action/collection/date) et
`GET /api/audit/verify` (intégrité de la chaîne) sont réservés au rôle `admin`. Aucun
autre rôle, même `editor` capable de publier, n'y a accès — la lecture de l'audit n'est
pas un privilège qu'on étend à qui peut déjà beaucoup, c'est une capacité à part.

L'écriture, elle, est automatique et non désactivable : chaque connexion, création,
mise à jour, suppression, publication, restauration et opération média réussie produit
une entrée, enregistrée à la couche transport (`cogenta serve`) plutôt que dans chaque
service, pour qu'aucun nouveau point d'écriture n'ait à s'en souvenir séparément.

**Justification** — Le rôle `admin` est déjà, dans ce lot, celui où la MFA est
obligatoire sans exception (`packages/auth/src/mfa.ts`, `ALWAYS_SENSITIVE_ROLES`) et
celui « où le pouvoir se concentre tant qu'un modèle dédié n'existe pas » selon son
propre commentaire — le journal d'audit est exactement le genre de pouvoir qui doit
rester concentré là plutôt que de fuir vers un rôle créé pour un besoin de contenu.
Un enregistrement qui échoue ne doit jamais faire échouer l'action qu'il journalise :
une écriture de contenu réussie doit atteindre l'appelant que la ligne d'audit ait pu
être ajoutée ou non — c'est `verify()` qui révèle une chaîne cassée, pas une requête
utilisateur bloquée en attendant.

**Conséquences** — Un site à un seul rôle `admin` (le cas le plus commun au démarrage)
peut déjà consulter son propre journal sans configuration supplémentaire. Un rôle
personnalisé qui aurait besoin d'un accès de lecture partiel (par exemple, un rôle
« conformité » qui ne publie rien) n'existe pas encore ; ce sera une extension du modèle
de permissions, pas un contournement de cette règle.

**Renoncement assumé** — Pas de granularité par collection ni par type d'action pour la
lecture : `admin` voit tout ou rien. Un site qui voudrait déléguer la lecture du journal
sans déléguer le rôle `admin` complet doit attendre ce modèle plus fin.

**Écarté** — Réutiliser les permissions par collection (`read`/`create`/…) pour
l'audit : le journal traverse toutes les collections et les connexions, il n'appartient
à aucune d'elles — le forcer dans ce modèle aurait fait mentir un rôle qui ne lit qu'une
collection en lui laissant croire qu'il ne voit que « son » activité.

---

## ADR-0019 — L'interface admin se traduit avec `react-i18next`, français et anglais au lancement

**Statut** : Acté

**Contexte** — La tâche 13 de L2 (« i18n de l'interface et édition multilingue du
contenu ») a livré sa seconde moitié seule : ADR-0014 couvre la langue du *contenu*
(`locale`/`translationOf`, par entrée), mais rien ne tranchait la langue de l'*interface*
elle-même — les quelque 21 fichiers `.tsx` de `packages/admin/src` portent leurs libellés
en français, en dur, sans mécanisme d'extraction. Les deux langues sont des axes
indépendants : la langue de l'interface est une préférence de la personne qui
administre le site, pas une propriété du contenu qu'elle édite — un éditeur anglophone
doit pouvoir gérer un site en français, et réciproquement.

**Décision** — `react-i18next` (+ `i18next`) porte la traduction de l'interface admin.
Catalogues `fr.json`/`en.json` sous `packages/admin/src/i18n/locales/`, un par langue,
clé plate par chaîne (`login.heading`, `dashboard.health.title`…). Langue par défaut
détectée depuis `navigator.language` quand elle correspond à `fr` ou `en` ; sinon, et
tant qu'aucune préférence n'est enregistrée, **le français** — c'est la seule langue que
l'interface ait jamais parlée jusqu'ici, et un site déjà déployé ne doit pas en changer
sous les pieds de qui l'administre au premier lancement de cette version. Un sélecteur
dans `/settings` permet de fixer la langue explicitement, persistée dans `localStorage`
sous une clé dédiée (jamais mêlée à `cogenta.session.token`). Le français reste la
langue source du code (texte existant déplacé tel quel dans `fr.json`), l'anglais est la
traduction de lancement — Cogenta est un projet open source et `AGENTS.md` fixe déjà
l'anglais comme langue du code, des commentaires et des issues, donc de tout
contributeur non francophone potentiel.

**Justification** — `react-i18next` est la bibliothèque React la plus mûre pour ce
problème exact (interpolation, pluriels ICU si besoin plus tard, chargement paresseux
par langue), déjà dans l'écosystème que ce projet utilise ailleurs (React 19, pas de
framework meta au-dessus). Une solution maison referait, moins bien, ce qu'elle fait
déjà : c'est le cas où R9 (« préférer zéro dépendance ») cède devant un besoin réel et
récurrent plutôt qu'un besoin ponctuel. `navigator.language` en détection par défaut
évite de forcer un choix au premier lancement ; la persistance explicite en confirme un
qui divergerait (ex. : navigateur en anglais, préférence assumée pour le français).

**Conséquences** — Toute nouvelle chaîne d'interface passe par `useTranslation()` et une
clé dans les deux catalogues, jamais par du texte en dur — un futur `contract-guardian`
ou une revue peut grep `>[A-ZÀ-Ÿ][a-zà-ÿ]` dans `src/routes` et `src/**/*.tsx` (hors
`i18n/locales`) pour repérer une régression. Les 21 fichiers déjà écrits migrent
progressivement, un lot de vues à la fois, chacun avec ses tests de rendu inchangés
(seul le texte affiché change de source, pas le comportement) — pas de migration
« big bang » exigée par cette ADR, seulement la direction.

---

## ADR-0020 — Contrat C (`tools@1.0`) figé tel qu'esquissé, sans modification

**Statut** : Acté

**Contexte** — L2 (Admin) est terminé, ses 16 tâches traitées. L'ordre des lots
(`L0 → L1 → L3 → L2 → L4 → L5 → L9 → L6 → L7 → L8`) place L4 (runtime agentique)
ensuite, et `docs/lots/L4-runtime-agentique.md` (dépendances, l.10-12) l'exige
explicitement : *« Contrat C (outil agentique) figé avant de commencer. »* Le même
principe que pour A, B et D (`docs/04-contrats.md`, en-tête) : une interface consommée
par un lot entier ne peut pas rester mouvante pendant qu'on l'implémente.

Le Contrat C (`docs/04-contrats.md`, section « Contrat C — Outil agentique ») était déjà
entièrement rédigé — `defineTool`, `defineAgent`, la taxonomie des permissions, les
quatre règles (permissions vérifiées par le runtime, `sideEffects: true` exige `revert`
ou validation humaine forcée, audit systématique, jamais de secret) — mais sans bannière
« Figé » ni date, contrairement à A/B/D. Rien dans ce brouillon ne contredit R4/R6/R7/R8
(`AGENTS.md`) ni les points de conception déjà écrits dans `L4-runtime-agentique.md`
(hiérarchie d'autorité, sous-agents en sous-ensemble strict de `tools`, budgets, RAG
filtré par permissions) : le contrat et le lot qui le consomme ont été conçus ensemble,
avant ce jour, par la même main.

**Décision** — Le Contrat C est figé **tel qu'il est déjà écrit**, en `tools@1.0`, à la
date de cette ADR. Aucune réécriture n'accompagne ce figeage : la forme de `defineTool`
(`name`, `version`, `description`, `input`/`output` Zod, `permissions`, `sideEffects`,
`reversible`, `cost`, `rateLimit`, `execute`, `revert`), celle de `defineAgent`
(`identity`, `model`, `tools`, `skills`, `subagents`, `autonomy`, `budget`, `memory`,
`triggers`), et la taxonomie de permissions listée dans le contrat sont désormais la
même règle qu'A/B/D : modifier une signature d'outil existante est une montée de version
majeure avec note de migration ; ajouter un outil est mineur.

**Justification** — Rediscuter la forme du contrat maintenant reviendrait à rouvrir une
décision de conception déjà actée par construction (le brouillon existe, cohérent, depuis
avant ce lot) sans fait nouveau pour la justifier — exactement ce qu'AGENTS.md interdit
(« Ne jamais rediscuter une décision actée »). Le geste utile ici n'est pas de changer le
contrat, c'est de le déclarer stable pour que L4 puisse s'appuyer dessus sans craindre un
changement de signature à mi-parcours.

**Conséquences** — Toute implémentation de `defineTool`/`defineAgent` dans
`packages/agents` doit correspondre exactement aux signatures de `docs/04-contrats.md` ;
un écart est soit un bug d'implémentation, soit un motif pour une ADR de remplacement (`C
v2`), jamais une correction silencieuse du code sans mise à jour du contrat. Les 21 tâches
de L4 peuvent commencer.

**Écarté** — Ouvrir une nouvelle ronde de conception du contrat avant de figer (ex. :
revoir la taxonomie de permissions, changer la forme de `revert`) : rien dans les tâches
de L4 déjà écrites ne signale un manque, et retarder le figeage sans motif concret coûte
un lot entier d'attente pour un bénéfice hypothétique.

**Renoncement assumé** — Pas de détection de langue serveur (`Accept-Language`,
paramètre d'URL) au lancement : l'admin est une SPA authentifiée, la préférence vit dans
le navigateur de la personne, pas dans une session serveur. Un compte multi-appareils
verra sa préférence de langue d'interface non synchronisée entre eux ; ce n'est pas plus
grave que n'importe quelle autre préférence `localStorage` déjà dans ce paquet
(`cogenta.session.token` lui-même ne l'est pas).

**Écarté** — `next-intl`/`formatjs` seuls (sans wrapper React) : plus verbeux pour le
cas d'usage ici (pas de routing par langue, pas de rendu serveur à raccorder) sans
bénéfice supplémentaire. Une solution maison (`Record<string,string>` + contexte React) :
suffisante pour deux langues aujourd'hui, mais réinvente l'interpolation et le pluriel
dès la première chaîne avec une variable, ce qui arrivera vite (« %d éléments », dates
relatives dans le tableau de bord).

---

## ADR-0021 — La MFA admin est recommandée, plus imposée à la première connexion

**Statut** : Acté

**Contexte** — Depuis L2, `packages/auth/src/mfa.ts` impose la MFA sans exception au
rôle `admin` (et à tout rôle pouvant publier), non désactivable, dès la première
connexion — la spec du lot dit explicitement « non contournable par configuration ».
En usage réel, ce blocage immédiat après l'installation, avant même d'avoir vu le
tableau de bord, s'est révélé être une friction d'onboarding lourde, sans qu'aucune
limite de temps ni contexte n'accompagne l'obligation. L'utilisateur a demandé que
l'accès initial ne soit plus bloqué, tout en gardant l'esprit de recommandation forte
— pas une désactivation pure et simple.

**Décision** — La MFA n'est plus un blocage à la connexion. Un compte admin (ou tout
rôle sensible) se connecte avec identifiant et mot de passe seuls et accède
immédiatement au tableau de bord. Un système de notices/recommandations dans l'admin
(nouveau, dans l'esprit de ce que WordPress fait pour ses propres rappels de sécurité
et de mise à jour) affiche de façon visible et persistante — jusqu'à action ou rejet
explicite — la recommandation d'activer la MFA pour tout compte sensible qui ne l'a
pas encore fait. Le système de notices est générique : il sert aussi à d'autres
recommandations futures (mise à jour de plugin, certificat expirant, etc.), pas
seulement la MFA.

**Justification** — Le blocage immédiat protégeait contre un compte admin jamais
sécurisé, mais au prix d'un onboarding qui échoue avant que l'utilisateur ait vu quoi
que ce soit du produit — un coût réel, mesuré directement sur ce projet. Une
recommandation visible et persistante — le patron que la plupart des CMS matures
utilisent, WordPress signale les mises à jour de sécurité de façon proéminente sans
bloquer l'accès — obtient une meilleure part des deux exigences : le compte reste
utilisable immédiatement, et l'absence de MFA reste visible à chaque connexion tant
qu'elle n'est pas résolue, plutôt que configurable une fois puis oubliée.

**Conséquences** — `requiresMfa()` (`packages/auth/src/mfa.ts`) n'est plus consultée
pour bloquer une connexion ; elle reste le calcul de qui est concerné par la
recommandation. Un système de notices générique existe désormais dans l'admin (L11
tâche 2). `ALWAYS_SENSITIVE_ROLES`/`sensitiveRoles()` restent réutilisés tels quels par
le nouveau système plutôt que dupliqués.

**Renoncement assumé** — Un compte admin peut rester durablement sans MFA si son
titulaire ignore la recommandation à chaque connexion — la garantie « aucun compte
sensible sans MFA » que la version précédente offrait disparaît. Choix explicite de
l'utilisateur, pas un oubli.

**Écarté** — Un blocage différé de N jours (délai de grâce puis blocage) : gardait la
garantie forte, mais l'utilisateur a explicitement demandé le patron « recommandation,
jamais bloquant » plutôt qu'un blocage simplement repoussé dans le temps.

Cette ADR ne remplace pas l'ADR-0018 — le journal d'audit reste réservé à `admin` sur
ses propres mérites, la concentration de pouvoir dans ce rôle. Elle nuance seulement sa
justification : la phrase « la MFA est obligatoire sans exception » qu'elle cite décrit
l'état avant cette ADR, pas l'état actuel.

---

## ADR-0022 — Le contrat A monte en `schema@2.0` en une seule fois : taxonomies natives et corbeille

**Statut** : Acté

**Contexte** — Le contrat A est figé en `schema@1.0` depuis le 2026-08-13. Deux des
manques les plus visibles face à WordPress, Strapi et Drupal le touchent tous les
deux, et aucun des deux ne peut être ajouté sans casser une promesse déjà écrite.

La corbeille d'abord. `ContentStore.delete()` est aujourd'hui un vrai
`delete from <entries>` (`packages/schema/src/store/store.ts`), sans filet : les
versions et les blocs partent avec, par `on delete cascade`
(`packages/schema/src/store/tables.ts`), et une traduction dont on supprime la
source voit son `translation_of` passer à `null` par `on delete set null`. Une
suppression est donc irrécupérable **et** silencieusement destructrice d'une famille
de traduction. C'est le comportement qu'un CMS grand public n'a plus depuis quinze
ans.

Les taxonomies ensuite. Contract A ne connaît que des collections. Une catégorie
est donc bricolée par site, soit en `relation` vers une collection maison, soit en
`select` à valeurs figées. Les deux perdent ce qui fait une taxonomie : une
arborescence, et la **réutilisation entre collections** — la même catégorie
« Cuisine » servant à la fois aux articles et aux recettes.

Le projet est en développement, sans site en production ni contenu réel à préserver
— la migration de données que cette montée impose est donc sans coût aujourd'hui.
Elle est écrite et réversible pour rester correcte le jour où un site réel existera,
mais ce n'est pas ce qui a fait hésiter à trancher.

**Décision** — Le contrat A monte en `schema@2.0` **une seule fois**, couvrant en un
lot indivisible les taxonomies hiérarchiques natives et la corbeille/soft-delete,
avec une seule note de migration et une seule migration de données. L'autosave n'y
entre pas : il est réalisable sans toucher au contrat (voir « Conséquences »).

Ce que `schema@2.0` ajoute, précisément :

1. **Un champ système `deletedAt: string | null`** sur tout contenu, à côté de
   `status`. `status` n'est **pas** touché : son union fermée reste
   `draft | scheduled | published | archived`.
2. **`delete()` devient une mise à la corbeille** (écrit `deletedAt`), et
   `purge()` devient le seul `delete` SQL réel. `untrash()` annule la mise à la
   corbeille. Toute lecture (`read`, `list`, `translations`, `resolveLocale`,
   `history`) filtre `deletedAt is null` par défaut ; seul un appelant qui demande
   explicitement la corbeille la voit.
3. **Une fenêtre de purge configurable par collection**, sur le modèle de
   `versioning.keep` déjà présent : `trash: { retainDays: 30 }`, `false` pour
   revenir à une suppression dure immédiate.
4. **Un second objet déclarable de premier niveau, `defineTaxonomy()`**, à côté de
   `defineCollection()`. Un terme porte `id`, `parent`, `slug`, `position` et un
   `labels` **indexé par locale**, et n'est pas un contenu : il n'a ni `status`, ni
   `version`, ni `translationOf`.
5. **Un type de champ `taxonomy`**, `f.taxonomy({ of: 'category', many: true })`,
   qui référence des termes d'une taxonomie déclarée.
6. **Le vocabulaire d'actions de permission reste figé** (`read`, `create`,
   `update`, `delete`, `publish`). Mettre à la corbeille est `delete` ; purger est
   `delete` aussi, jamais une sixième action.

**Justification** —

*Pourquoi une seule montée majeure, et pourquoi ces deux-là ensemble.* Le coût
d'une montée majeure n'est pas dans le numéro : il est dans la migration du contenu
déjà saisi, dans la note de migration à écrire et à faire lire, et dans les lots
L10-L19 qui doivent se recaler dessus. Ce coût est presque entièrement fixe : le
payer deux fois pour deux ajouts connus le même jour serait un choix, pas une
fatalité. Le lot L13 demande d'ailleurs que la tâche 1 soit traitée **en premier**,
« pour que l'ADR de montée de version soit actée tôt, avant que d'autres lots n'aient
à s'y adapter ».

*Pourquoi la corbeille est bien une rupture majeure, et pas un ajout.* Trois faits
vérifiables dans le code, pas trois opinions :

- `onDelete: 'restrict'` est le défaut du contrat A, et il est aujourd'hui appliqué
  par une **vraie clé étrangère** (`onDeleteClause`, `tables.ts`). Une mise à la
  corbeille n'est pas un `DELETE` : la base ne peut plus rien refuser. « 3 articles
  référencent cet auteur », que le contrat A donne aujourd'hui en exemple de bon
  défaut, doit être **réimplémenté en code applicatif** au moment de la mise à la
  corbeille, sinon la corbeille devient un contournement silencieux de `restrict`.
  C'est une modification du sens d'une garantie écrite, donc majeure.
- Symétriquement, la corbeille **répare** un dégât actuel : le
  `on delete set null` sur `translation_of` détruit aujourd'hui la famille de
  traduction quand on supprime la source. Une source seulement mise à la corbeille
  ne déclenche plus rien, et `untrash()` rend la famille intacte.
- Tout appelant existant de `delete()` change de comportement sans changer de
  ligne. Un changement de sémantique à signature constante est exactement ce qu'une
  version majeure doit signaler.

*Pourquoi `deletedAt` plutôt qu'un statut `trashed`.* Le contrat A déclare `status`
comme une union fermée, et l'ajout d'une valeur y est tentant. Deux raisons de ne
pas le faire. D'abord, une entrée à la corbeille **doit se souvenir de ce qu'elle
était** : sans cela, restaurer un article publié le rend brouillon, ce qui est une
perte d'information et un piège à republication accidentelle. Ensuite,
l'exhaustivité : tout `switch` sur `ContentStatus` du dépôt deviendrait
silencieusement incomplet, alors qu'un champ orthogonal force le compilateur à
signaler chaque lecture qui doit apprendre à filtrer. Un axe orthogonal se modélise
par un champ orthogonal.

*Pourquoi une taxonomie n'est pas une collection.* On pourrait déclarer les
catégories comme une collection ordinaire et s'en tenir là — c'est ce que les sites
font aujourd'hui. Trois choses restent impossibles : garantir l'absence de cycle
dans l'arborescence, réutiliser le même terme entre deux collections sans le
dupliquer, et répondre « tout le contenu de ce sous-arbre » en une requête. La
troisième contraint le stockage : une adjacence simple (`parent_id`) exige un CTE
récursif, dont le support diverge entre Postgres, MySQL/MariaDB et SQLite (ADR-0006
impose les trois). Un **chemin matérialisé** maintenu à l'écriture répond à la même
question par un `like` que les trois dialectes traitent identiquement — même
raisonnement que le stockage des timestamps « en texte, qui veut dire la même chose
partout » déjà retenu par le moteur de migrations.

*Pourquoi les libellés d'un terme sont indexés par locale, alors qu'ADR-0014 impose
une entrée par langue.* ADR-0014 gouverne le **contenu** : une page française et sa
traduction anglaise ont chacune leur cycle de publication, leur `status`, leur
version. Un terme de taxonomie n'a rien de tout ça : « Cuisine » et « Cooking » sont
le même concept de classement, pas deux contenus. Leur appliquer ADR-0014 créerait
une famille de traduction par terme, donc un `translationOf` sur un objet qui n'a ni
`status` ni `version` — un rattachement au contrat A pour rien. ADR-0014 n'est **pas
remplacée** : son périmètre est simplement dit explicitement.

**Conséquences** —

- Une migration réelle sur tout contenu déjà saisi : une colonne `deleted_at` par
  table d'entrées, plus les tables de taxonomie et de jointure. Réversible, comme
  toute migration du projet ; le `down` supprime la colonne, donc **il perd la
  corbeille** — la note de migration doit le dire, c'est une perte de données au
  sens de la règle du projet sur les migrations destructives. Sans site en
  production aujourd'hui, cette migration ne déplace aucune donnée réelle — elle
  reste écrite et testée comme si c'était le cas.
- `ContentStore` gagne `purge()` et `untrash()`, et `delete()` change de sens.
  `withReadOnlyStore` doit refuser les trois.
- `restrict` doit être vérifié en code applicatif au moment de la mise à la
  corbeille. Ne pas le faire est un défaut de sécurité de la donnée, pas un détail.
- Le nom `restore` est déjà pris par la restauration de version
  (`ContentStore.restore(id, version)`). La sortie de corbeille s'appelle donc
  `untrash()`, jamais `restore()` : deux opérations différentes ne partagent pas un
  nom.
- Le lot L14 (headless) et le lot L10 (branchement du SEO/recherche) doivent
  apprendre à ne jamais servir une entrée à la corbeille. C'est la raison pour
  laquelle le filtre est **par défaut** et l'inclusion explicite, et non l'inverse.
- **L'autosave n'entre pas dans cette montée**, et c'est un constat de code, pas un
  arbitrage : `history()` ne distingue aujourd'hui *aucune* sauvegarde d'une autre
  (elle rend toutes les lignes de la table des versions, dont chaque `update()`
  crée une), donc un autosave qui passerait par `update()` polluerait l'historique
  et ferait sortir de vraies versions de la fenêtre `keep`. La conclusion n'est pas
  d'ajouter un discriminant au contrat A : c'est que l'autosave ne doit pas écrire
  de version du tout. Un brouillon en cours de frappe vit hors du magasin de
  versions jusqu'à ce qu'un humain enregistre.
- La duplication de contenu n'entre pas non plus : elle ne fait que composer
  `read` + `create`, et la duplication est couverte par l'action `create` déjà figée.

**Renoncement assumé** —

- `delete()` change de sens sans changer de signature. Tout code externe écrit
  contre `schema@1.0` qui comptait sur une suppression dure — un script d'import qui
  nettoie, un test qui remet à zéro — continuera de « marcher » en laissant des
  lignes derrière lui. C'est le pire mode de rupture (silencieux), et il est accepté
  parce que l'inverse — garder `delete()` dur et appeler la corbeille autrement —
  laisserait le défaut par défaut dangereux, ce qui est pire.
- **Les statuts personnalisables du workflow éditorial (L13 tâche 7) ne sont pas
  pré-ouverts.** Si le besoin se confirme, ils imposeront une `schema@3.0` et donc
  une seconde migration du contenu — exactement ce que cette ADR cherche à éviter.
  Le choix est assumé : aucune spécification n'existe aujourd'hui pour ces statuts,
  et figer maintenant une forme devinée coûterait plus cher qu'une migration
  supplémentaire (la règle du projet interdit l'abstraction pour un cas
  hypothétique).
- Un terme de taxonomie n'a pas d'historique de versions. On perd « qui a renommé
  cette catégorie » ; le journal d'audit (`@cogenta/auth`) reste la réponse, et
  suffit.

**Écarté** —

- **Deux montées majeures séparées (`2.0` taxonomies, `3.0` corbeille).** Plus
  propre à lire dans le journal des décisions, deux fois plus cher pour toute
  personne qui exploite un site. Le coût d'une montée est porté par l'utilisateur,
  pas par le fichier d'ADR.
- **Une valeur `trashed` ajoutée à `status`.** Écartée pour deux raisons données
  plus haut : la perte du statut d'origine, et la rupture silencieuse de
  l'exhaustivité de tous les `switch` existants.
- **La corbeille en dehors du contrat A, comme un plugin ou une table annexe.**
  Techniquement possible (une table « corbeille » où l'on déplace la ligne), et
  écartée : la ligne déplacée perdrait ses clés étrangères, donc ses relations et
  ses blocs, donc la restauration ne restaurerait pas. Une corbeille qui ne rend
  pas exactement ce qu'elle a pris ne mérite pas son nom.
- **Les taxonomies comme simple collection avec un champ `parent`.** C'est le
  contournement actuel. Écarté parce qu'il ne donne ni l'absence de cycle, ni la
  réutilisation entre collections, ni la requête de sous-arbre — c'est-à-dire aucune
  des trois raisons d'avoir des taxonomies.
- **Un CTE récursif plutôt qu'un chemin matérialisé.** Écarté sur ADR-0006 : trois
  dialectes obligatoires, trois comportements à tester, pour une requête qu'un
  `like` sur un chemin résout partout de la même façon.

---

## ADR-0023 — Un plan de site validé peut écrire le schéma, en développement seulement

**Statut** : Acté

**Contexte** — L19 (« création de site pilotée par l'IA ») propose un plan de site
à partir d'un document téléversé (modèle de contenu, gabarits de skin, contenu de
démo) et l'applique après relecture humaine section par section. Le périmètre du
lot demandait que ce parcours fonctionne aussi *après coup*, depuis l'admin d'un
site déjà en production — pas seulement à `npm create cogenta`.

**Décision** — Appliquer un plan de site reste soumis à ADR-0010 sans exception :
ce n'est possible que sous `cogenta dev`. Sur `cogenta serve`, un plan peut être
proposé, relu et validé élément par élément, mais jamais appliqué — la route
répond `CONTENT_READ_ONLY` et indique la marche à suivre (développer sur une copie,
appliquer, committer le fichier de schéma).

**Justification** — Appliquer un plan est l'éditeur visuel de schéma d'ADR-0010,
arrivé par une autre porte : mêmes fichiers réécrits (`cogenta.schema.*`), mêmes
tables créées, même dérive de configuration entre environnements à la clé, même
risque qu'un thème référence un champ supprimé. Entre un document de lot et une
décision déjà actée, la décision gagne — se dit et s'écrit, ne se contourne pas.

**Conséquences** — `RunServeOptions` gagne un indicateur `development`, positionné
par `cogenta dev` et par lui seul ; c'est aujourd'hui la seule différence de
comportement entre `cogenta serve` et `cogenta dev` sur ce point. Le volet
post-installation de L19 reste utile mais différé d'une étape : copie de
développement, `cogenta dev`, commit — exactement le pipeline qu'ADR-0010 assume
déjà comme conséquence.

**Renoncement assumé** — Un opérateur ne peut pas appliquer un plan directement
depuis l'admin d'un site en production, alors même que la relecture humaine qui
précède est déjà unskippable. Ce n'est pas un renoncement à la sécurité du geste,
seulement à son confort.

**Écarté** — Autoriser l'écriture en production derrière une confirmation
supplémentaire. Écartée : ADR-0010 ne pose pas une question d'ergonomie mais
d'intégrité entre environnements, et une confirmation ne recrée pas le fichier
manquant dans git.

---

## ADR-0024 — Le commerce vit dans un contrat E séparé, jamais dans le contrat A

**Statut** : Acté

**Contexte** — Le lot L15 ajoute un domaine de données entier : `Product` et ses
variantes, `Cart`, `Order` et ses lignes, `Customer`, `Coupon`, facture, abonnement. La
tentation est forte de le déclarer avec ce qui existe déjà : `defineCollection()` sait
décrire un type, `ContentStore` sait le lire, l'écrire, le versionner, le traduire,
l'exposer en REST et en GraphQL, et l'admin sait déjà en générer les formulaires. Un
`product` déclaré comme une collection ordinaire donnerait, gratuitement, un CRUD
complet et une page publique routée. C'est exactement ce que fait WooCommerce sur
WordPress, où un produit est un `post` d'un type particulier, et c'est ce qui rend cette
décision difficile : le raccourci marche, longtemps, et le prix se paie plus tard.

La tension réelle n'est pas « faut-il réutiliser ». C'est que **deux moitiés d'un
produit obéissent à des lois opposées**. Sa fiche — titre, description, photos, blocs,
SEO, traductions — est du contenu éditorial au sens strict : elle se rédige, se relit,
se publie, se traduit, se programme, et une erreur s'y corrige en éditant. Son prix, son
stock et ses commandes n'ont aucune de ces propriétés : ils ne se relisent pas, ils se
constatent ; ils n'ont pas de brouillon ; et une erreur ne se corrige pas en éditant,
elle se corrige en écrivant une ligne de plus (un avoir, un réapprovisionnement), parce
que la ligne précédente a déjà été opposée à un client.

Trois invariants du commerce n'existent nulle part dans le contrat A, et le contrat A
n'a aucune raison d'apprendre à les porter :

1. **Un stock ne devient jamais négatif sous écriture concurrente.** Aucune opération de
   `ContentStore` n'a besoin de cette garantie : deux éditeurs qui sauvegardent le même
   article en même temps produisent deux versions, et c'est le comportement voulu.
2. **Un total de commande reste cohérent avec ses lignes.** Un contenu n'a pas d'égalité
   arithmétique à maintenir entre deux de ses champs.
3. **Un numéro de facture est séquentiel, sans trou volontaire et non modifiable.**
   C'est une contrainte comptable opposable, pas une préférence : rien dans le modèle de
   contenu, où tout identifiant est un UUIDv7 explicitement « stable et transportable »
   (ADR-0015), ne sait produire une séquence dense.

**Décision** — Le vocabulaire commerce est un **contrat E (`commerce@1.0`)**, distinct
du contrat A, servi par un nouveau paquet `@cogenta/commerce` qui possède ses propres
tables et ses propres magasins. Le contrat A n'est **pas** monté en version pour L15 :
il reste `schema@2.0` (ADR-0022).

Concrètement :

1. **Aucun objet commerce ne passe par `ContentStore`.** Ni `Product`, ni `Order`, ni
   `Cart`, ni `Customer`, ni `Coupon`, ni facture, ni abonnement. Ils ne portent ni
   `status` de contenu, ni `version`, ni `translationOf`, ni `deletedAt`.
2. **Un produit commerce porte un lien optionnel vers une entrée de contenu**,
   `contentRef: { collection, entryId } | null`. C'est ce lien, et lui seul, qui donne à
   un produit sa fiche publique : titre rédigé, photos, blocs, SEO, traductions, route
   — tout cela reste du contrat A, écrit et traduit avec les outils déjà là. Le lien est
   **facultatif** dans les deux sens : un produit sans fiche se vend (un article de
   catalogue B2B, une option d'abonnement), et une page de contenu sans produit s'affiche
   (elle ne montre simplement pas de bouton d'achat).
3. **L'argent est stocké en entier, dans la plus petite unité de sa devise**
   (`amountMinor: number`, `currency: string`), jamais en flottant, jamais en décimal
   dépendant du dialecte. Tout calcul de total est entier de bout en bout ; l'arrondi
   n'a lieu qu'au moment d'une répartition (une remise en pourcentage), une seule fois,
   à un endroit nommé.
4. **Toute écriture qui touche un stock ou un total est une transaction unique**, prise
   en `immediate` (`DatabaseHandle.transaction(run, { immediate: true })`), et la
   décrémentation de stock se fait par un `UPDATE ... WHERE on_hand >= :n` dont on lit
   le `rowsAffected` — jamais par une lecture suivie d'une écriture.
5. **Le paiement est un driver**, interface plus au moins deux implémentations, dont une
   sans aucun service externe (virement/paiement manuel), exactement comme cache, queue
   et storage (R1, ADR-0005). Le transporteur suit la même forme et reste optionnel.
6. **Le vocabulaire de permissions du contrat A n'est pas étendu.** `read`, `create`,
   `update`, `delete`, `publish` restent les cinq actions du contenu. Le contrat E
   déclare les siennes (`commerce.catalog.read`, `commerce.order.refund`…), dans son
   propre espace de noms, parce que « rembourser » n'est ni un `update` ni un `publish`.

**Justification** —

*Pourquoi une commande n'est pas un contenu, en trois faits vérifiables dans ce dépôt.*

- **ADR-0014 impose une entrée par langue.** Appliquée à une commande, elle produirait
  une commande française et une commande anglaise, liées par `translationOf`, chacune
  avec son cycle de publication. C'est absurde, et ce n'est pas un détail qu'on
  contourne en mettant `localized: false` partout : le contrat A fait de la famille de
  traduction une propriété du modèle, pas une option d'un champ.
- **ADR-0022 vient de rendre `delete()` réversible pour tout contenu.** Une commande
  n'est pas réversible : elle s'annule ou se rembourse, et les deux laissent une trace
  qui reste. Un `untrash()` sur une commande n'a aucun sens comptable — pire, il en a un
  informatique, ce qui en fait un piège.
- **`versioning: { drafts: true, history: true }` est le cœur du contrat A.** Une
  commande brouillon n'existe pas ; un panier est un brouillon, mais un brouillon qui ne
  produit jamais d'historique de versions et qui expire tout seul, ce que le magasin de
  versions ne sait pas faire.

*Pourquoi la fiche produit, elle, reste bien du contrat A.* Parce que tout ce qui la
rend bonne existe déjà et a été payé : le texte riche JSON (ADR-0013), les blocs
sémantiques (contrat B), le SEO branché en L10, le routage multilingue, la publication
programmée, l'historique et la corbeille. Réimplémenter cela dans `@cogenta/commerce`
serait la faute exacte que l'ADR-0009 décrit — deux modèles de contenu parallèles dans
le même produit. Le lien `contentRef` coûte une colonne et rend l'intégralité de cette
capacité au catalogue.

*Pourquoi pas « produit dans le contrat A, commande dans le contrat E ».* C'est la
proposition intermédiaire qui semble la plus raisonnable, et c'est celle qui coûte le
plus cher. Un produit vendable porte un prix, une variante et un stock ; ces trois
choses sont précisément celles qui exigent la transaction. Les mettre dans un
`ContentStore` obligerait à ajouter au contrat A une notion de transaction, de garde
conditionnelle et de non-négativité **pour un seul type de collection** — c'est-à-dire à
faire porter au modèle éditorial une contrainte qu'aucun contenu éditorial n'a. La
frontière que cette ADR trace passe au bon endroit : ce qui se rédige d'un côté, ce qui
se compte de l'autre, et un lien nommé entre les deux.

*Pourquoi un contrat séparé plutôt qu'un `schema@3.0`.* Une montée majeure du contrat A
impose une migration à **tout** site, y compris aux neuf blueprints sur dix qui ne
vendent rien. ADR-0022 vient d'expliquer que le coût d'une montée majeure est presque
entièrement fixe et porté par l'utilisateur ; le corollaire est qu'on ne la déclenche
pas pour un domaine que la majorité des sites n'installera jamais. `@cogenta/commerce`
crée ses tables quand il est présent (`ensureCommerceTables`, la forme déjà retenue par
`@cogenta/auth`) et n'existe pas quand il ne l'est pas.

*Pourquoi l'entier en unité mineure.* Les trois dialectes obligatoires (ADR-0006) ne
s'accordent pas sur le décimal : Postgres a `numeric` exact, MySQL a `decimal`, SQLite
n'a que `REAL` — un flottant binaire, où `0,1 + 0,2` ne fait pas `0,3`. Une seule
représentation qui veut dire la même chose partout, c'est le raisonnement déjà appliqué
aux horodatages stockés en texte par le moteur de migrations. Un entier de centimes tient
sans perte jusqu'à 90 000 milliards en `Number.MAX_SAFE_INTEGER` ; aucune boutique
servie par ce CMS n'en approche.

*Pourquoi la numérotation de facture est une table à part, et pas un `count(*)`.* Un
`count(*) + 1` produit un doublon dès que deux factures sont émises dans la même
seconde, et rend un numéro déjà attribué après une suppression. La séquence est donc une
ligne par série (`invoice_sequences`), incrémentée **dans la transaction qui insère la
facture**, par un `UPDATE ... SET next = next + 1 WHERE series = ? AND next = ?` dont le
`rowsAffected` arbitre la course — le même idiome que le `used_at is null` qui rend un
jeton de réinitialisation de mot de passe à usage unique (`packages/auth/src/resets.ts`).
Une commande annulée ne rend jamais son numéro : la séquence est dense en émission, pas
en commandes vivantes, ce qui est précisément ce qu'une administration fiscale exige.

**Conséquences** —

- Un nouveau contrat **E (`commerce@1.0`)** entre dans `docs/04-contrats.md`, versionné
  en semver comme les quatre autres. Il n'est pas figé le jour de son écriture : L15 est
  son premier et seul consommateur, et le figer avant qu'une vraie boutique ait tourné
  reproduirait l'erreur que le projet a évitée pour C et D.
- `@cogenta/commerce` dépend de `@cogenta/core` (base, erreurs, drivers, journal) et de
  `@cogenta/schema` **uniquement pour lire une entrée référencée** par `contentRef`. Il
  n'écrit jamais dans `ContentStore`.
- Le lien `contentRef` n'est **pas** une clé étrangère SQL : la table d'entrées d'une
  collection est créée par le moteur de migrations du contrat A, dont le nom dépend du
  schéma déclaré par le site. Le lien est donc vérifié en code applicatif, et un produit
  dont la fiche a été mise à la corbeille reste vendable en back-office tout en
  disparaissant de la vitrine — c'est le comportement voulu, et il doit être testé.
- L'admin gagne une section « Boutique » qui n'est **pas** générée par le formulaire
  schema-driven du contrat A. C'est un vrai coût : des écrans à écrire à la main là où le
  contenu les obtient gratuitement.
- Le lot L17 (marketplace, volet commercial) réutilise le driver de paiement de ce lot,
  jamais un second système — c'est déjà écrit dans le lot, cette ADR le rend structurel.
- R2 s'applique intégralement : sans clé Stripe, la boutique fonctionne de bout en bout
  avec le driver de paiement manuel. Le driver dégradé n'est pas un bouchon, c'est un
  mode d'exploitation réel — beaucoup de commerces vendent réellement par virement.

**Renoncement assumé** —

- **Le CRUD produit est à écrire à la main.** Un `defineCollection({ name: 'product' })`
  aurait donné formulaires, listes, filtres, REST, GraphQL et permissions sans une ligne
  d'écran. On y renonce sciemment, et cela représente la plus grosse part du coût de
  cette décision.
- **Deux modèles de permissions coexistent** : celui du contenu et celui du commerce. Un
  administrateur devra comprendre pourquoi « peut publier un article » et « peut
  rembourser une commande » ne se règlent pas au même endroit. Le prix de l'alternative
  était pire : cinq actions figées à qui l'on ferait dire ce qu'elles ne disent pas.
- **Un produit vit dans deux endroits.** Sa fiche est une entrée de contenu, ses prix
  sont une ligne commerce, et rien au niveau de la base ne garantit qu'ils existent
  ensemble. Un produit orphelin de fiche, ou une fiche orpheline de produit, sont deux
  états possibles qu'il faut rendre visibles dans l'admin plutôt que d'interdire.
- **`commerce@1.0` n'est pas figé** au moment de sa création. Il bougera, et les sites
  très précoces paieront une migration. C'est le choix inverse de celui fait pour A et
  B, et il est assumé : figer un modèle de commerce jamais confronté à une vraie
  boutique serait figer des devinettes.

**Écarté** —

- **Le commerce comme collections prédéfinies du contrat A (`schema@3.0`).** L'option
  que le lot nommait en premier. Écartée sur trois points non négociables : ADR-0014
  forkerait une commande par langue, ADR-0022 rendrait une commande restaurable, et le
  contrat A devrait apprendre la transaction et la garde conditionnelle pour un seul type
  de collection. À quoi s'ajoute une migration imposée à tous les sites qui ne vendent
  rien.
- **Le commerce comme plugin tiers**, sur le bac à sable de `@cogenta/plugins` (L7).
  Séduisant sur le papier — WooCommerce est une extension. Écarté parce que le SDK de
  plugin est volontairement construit capacité par capacité et n'a **aucune** capacité
  de transaction de base de données ; lui en donner une reviendrait à percer l'isolation
  à deux couches que L7 a prouvée contre quatre vecteurs d'évasion, pour la commodité
  d'un domaine que le projet livre lui-même.
- **Un montant en `decimal` SQL.** Écarté sur ADR-0006 : SQLite n'a pas de décimal exact,
  et un montant qui ne veut pas dire exactement la même chose sur les trois bases
  obligatoires est un bug qui attend son premier centime perdu.
- **Un seul modèle « produit = contenu + champs commerce sur la même table ».** Il
  supprime le problème du produit orphelin, et crée pire : la table d'entrées d'une
  collection est produite par le moteur de migrations à partir du schéma **déclaré par le
  site**, donc les colonnes de stock seraient sous le contrôle du fichier de schéma d'un
  utilisateur, qui peut les renommer ou les retirer. On ne met pas un invariant
  d'argent dans une table dont le site possède la définition.
- **Stripe comme seule passerelle, sans interface de driver.** Écarté par R1, sans
  discussion possible : c'est la règle que ce projet n'a jamais pliée en quinze lots.
## ADR-0025 — Les commentaires vivent dans un contrat F séparé

**Statut** : Acté

**Contexte** — La fiche 15 ouvre un domaine de données entièrement absent : aucun commentaire de visiteur n'existe nulle part dans le code, alors que l'import WordPress (`@cogenta/import`, L9) perd silencieusement ceux d'un WXR importé, et qu'`assist.moderate` (`@cogenta/agents`, L18) existe déjà avec une union fermée `none`/`review` — un modérateur assisté sans rien à modérer. Un commentaire est un contenu textuel écrit par un tiers, exactement le type d'objet que le contrat A sait modéliser : la tentation est de le déclarer comme une collection ordinaire, avec `published`/`draft` détournés en approuvé/en attente.

**Décision** — Le vocabulaire des commentaires est un **contrat F (`comments@1.0`)**, distinct du contrat A, servi par un nouveau paquet `@cogenta/comments`. Le contrat A ne monte pas de version pour cette fiche.

Concrètement : un commentaire porte l'identité de sa cible (`collection`, `entryId`, `locale`), un auteur (compte **ou** nom + e-mail + site pour un visiteur anonyme), un corps en **texte brut uniquement** (jamais de HTML — R3, première défense contre le XSS stocké), un statut de modération propre (`pending`/`approved`/`spam`/`trash`), un `parent` pour le fil, et des métadonnées de modération avec l'adresse IP **hachée** (jamais en clair — RGPD). `POST /api/comments` est une route publique en écriture — la première du CMS — avec limitation de débit obligatoire par IP et par cible dès la première version, champ piège, délai minimal, et statut initial configurable. Vocabulaire de permissions propre au contrat F, distinct des cinq actions du contrat A. Pas de bloc `comments` au contrat B, figé : le fil est rendu par le gabarit de page, comme `/search` en L10.

**Justification** — Trois faits, sur le modèle d'ADR-0024 :

1. **ADR-0014 forkerait un commentaire par langue.** Un commentaire n'a pas de famille de traduction — il est écrit une fois, dans la langue de son auteur, jamais rédigé puis traduit.
2. **`published`/`draft` n'a pas le sens d'« approuvé »/« en attente ».** `published` signifie, dans tout le reste du contrat A, « visible sur sa propre route, indexable, avec SEO » — un commentaire n'a ni route ni existence indépendante de l'entrée qu'il commente. Le détourner ferait mentir le champ pour toute collection qui l'inspecte.
3. **Le volume et le modèle de menace sont d'un autre ordre.** Un blog peut avoir cent fois plus de commentaires que d'articles, et c'est la seule route publique en écriture du CMS — rate limiting, honeypot, anti-spam sont des préoccupations que le contrat A n'a aucune raison de porter pour les 39 autres collections qui n'ont jamais reçu d'écriture anonyme.

**Conséquences** — Nouveau paquet `@cogenta/comments`, migration réversible testée sur les trois bases. Un commentaire ne bénéficie pas gratuitement de l'historique de versions ni du CRUD généré pour les collections du contrat A — tout est réécrit spécifiquement (même redondance assumée par ADR-0024 pour le commerce). Passage obligatoire par `security-reviewer` avant fusion, vu la route publique en écriture.

**Renoncement assumé** — Un commentaire n'a ni brouillon, ni traduction, ni corbeille au sens d'ADR-0022 (une suppression est directe, avec rétention/purge configurable sur son propre modèle, pas la corbeille du contenu).

**Écarté** — (a) Collection ordinaire du contrat A avec `status` détourné : écarté, `published` mentirait sur ce qu'il signifie partout ailleurs, et le contrat A apprendrait un auteur qui n'est pas un compte pour un seul type de collection.

---

## ADR-0026 — Les formulaires vivent dans un contrat G séparé ; route dédiée avant bloc

**Statut** : Acté — renoncement (champ fichier, champs conditionnels) amendé par ADR-0031.

**Contexte** — La fiche 16 constate qu'un site Cogenta publié n'a aujourd'hui aucun moyen d'être contacté. Les briques existent séparément (`@cogenta/channels` sait notifier par e-mail/Slack/Discord/webhook signé ; le contrat A sait modéliser des données structurées) mais rien ne les relie. Trois questions se posent : où vit la définition d'un formulaire, comment il arrive sur une page alors que le contrat B est figé, et si les soumissions sont stockées.

**Décision** — Le vocabulaire des formulaires est un **contrat G (`forms@1.0`)**, distinct du contrat A, servi par un nouveau paquet `@cogenta/forms`. Une définition de formulaire porte un nom, un libellé, une liste de champs typés (texte, texte long, e-mail, téléphone, nombre, date, choix simple/multiple, **consentement** — pas de champ fichier en première version, pour ne pas ouvrir la surface téléversement/antivirus sans besoin prouvé). Une soumission porte les valeurs, un statut (`nouveau`/`lu`/`archivé`/`indésirable`), l'IP **hachée**, le référent, et le texte de consentement **tel qu'il était au moment du recueil**, horodaté — c'est ce texte qui a valeur probante, pas celui d'aujourd'hui. Rétention configurable avec purge automatique, sur le modèle exact `retainDays`/`purgeExpired()` d'ADR-0022, appliqué aux soumissions et non au contenu. `POST /api/forms/{name}/submit` est la deuxième route publique en écriture du CMS, avec les mêmes exigences que le contrat F (limitation de débit, honeypot, validation serveur complète indépendante du client) et doit fonctionner **sans JavaScript** (`POST` HTML classique). Arrivée sur une page : une **route dédiée**, rendue par le gabarit comme `/search` en L10, livrée en premier ; une **RFC contrat B** pour un bloc `form` référençant un formulaire par id est ouverte en parallèle, sans bloquer cette fiche.

**Justification** — Même raisonnement qu'ADR-0024 et ADR-0025 : une soumission est un fait constaté (elle arrive, elle ne se rédige pas), sans traduction ni brouillon ni version, avec un volume et un modèle de menace (route publique en écriture, accusé de réception qui peut devenir un relais de spam) que le contrat A n'a aucune raison de porter.

**Conséquences** — Nouveau paquet `@cogenta/forms`, migration réversible trois bases. Le constructeur de formulaire dans l'admin réutilise le répéteur de champs de la fiche 03 plutôt que d'en écrire un second. Notifications via l'adaptateur e-mail existant de `@cogenta/channels`, jamais un second transport. Le contenu d'une soumission est de la donnée (R8) : balisé comme telle si un canal où un agent lit le reçoit.

**Renoncement assumé** — Tant que la RFC contrat B n'aboutit pas, un formulaire n'est utilisable que sur ses propres routes dédiées, pas embarqué dans une page de contenu arbitraire. Les champs conditionnels et les pièces jointes sont hors périmètre de cette première version.

**Écarté** — (a) Collection du contrat A avec champs en `json` : écarté, cela rejoue exactement le problème que la fiche 03 a déjà résolu — une structure typée dans un champ `json` libre est le mauvais outil.

---

## ADR-0027 — Le workflow éditorial est un `reviewState` orthogonal à `status` ; permission par propriétaire ajoutée au contrat A (`schema@2.1`)

**Statut** : Acté

**Contexte** — Les fiches 37 (workflow éditorial) et 19 tâche 5 (permission « ses propres contenus ») partagent le même besoin non résolu. `ContentStatus` (`draft`/`scheduled`/`published`/`archived`) est une union fermée **figée** du contrat A ; y ajouter `pending` casserait tout `switch` exhaustif chez un client headless écrit avant ce lot. Le contrat A n'exprime par ailleurs aucune permission par propriétaire : ses cinq actions sont par collection, jamais par entrée — un contributeur peut aujourd'hui modifier l'article d'un autre pendant sa relecture.

**Décision** — Le contrat A monte en **`schema@2.1`**, montée mineure et strictement additive (même nature que `tools@1.1` pour `document.extract`) :

1. **`reviewState` orthogonal à `status`**, exactement comme `deletedAt` l'est depuis ADR-0022 : `none`/`pending`/`changes-requested`/`approved`, ignoré par défaut par toute lecture existante, jamais lu ni écrit par un client qui l'ignore. Approuver n'est **pas** publier — `approved` autorise, `publish` reste l'action qui rend visible ; les confondre publierait par surprise.
2. **Table de transitions fermée côté serveur** (`submit`/`approve`/`request-changes`), chacune avec sa permission requise ; l'écran ne la duplique jamais. Nouvelles routes `POST .../submit`, `.../approve`, `.../request-changes` — jamais un second sens sur un verbe existant, la règle qu'ADR-0022 a posée pour `purge`.
3. **Permission par propriétaire** : une clause `own: true` explicite dans le bloc `permissions` d'une action du contrat A (ex. `update: { roles: ['author'], own: true }`), validée par `validateCollectionSet` au même titre que le reste du bloc — plutôt qu'une convention de rôle en chaîne libre (`author:own`), qui reproduirait la classe de bug silencieux qu'a produite le sitemap 500 de L10 : une faute de frappe non détectée.
4. Workflow activable **par collection**, jamais un interrupteur global — cohérent avec les permissions déjà déclarées par collection ; un site d'une seule personne n'en voit rien.

**Justification** — ADR-0022 a déjà prouvé, avec `deletedAt`, qu'un champ orthogonal se glisse dans ce modèle sans casser aucun lecteur existant ; sa règle de filtrage par défaut (ignoré sauf opt-in explicite) est directement transposable à `reviewState`. Un test de compatibilité (« un client qui lit `status` avant ce lot obtient exactement les mêmes valeurs ») est exigé, pas supposé — même standard que la migration up/down/up d'ADR-0022.

**Conséquences** — `packages/schema` gagne la table de transitions et `reviewState` ; migration réversible testée sur les trois bases ; `PermissionLayer` interprète `own` en comparant l'acteur à l'auteur de l'entrée. `contract-guardian` doit relire ce changement, le contrat A étant touché. Note de migration pour tout client headless qui lit le contrat A.

**Renoncement assumé** — `reviewState` reste à quatre valeurs fixes, pas un workflow multi-étapes configurable (option (c) écartée pour cette raison précise) ; la permission par propriétaire couvre « ses propres entrées », pas une délégation hiérarchique (un chef d'équipe voyant les entrées de son équipe) — hors périmètre.

**Écarté** — (a) Ajouter `pending` à `ContentStatus` : casse tout `switch` exhaustif, l'argument même qui a fait pencher pour `deletedAt` orthogonal en ADR-0022. (c) Table de workflow séparée : plus flexible mais l'état devient invisible dans une lecture directe d'entrée. (d) Taxonomie « état éditorial » : zéro contrat touché, mais aucune règle de transition ni permission propre — un contributeur pourrait s'auto-approuver.

---

## ADR-0028 — Les permissions de rôle personnalisé vivent en base, en surcouche du fichier de schéma

**Statut** : Acté

**Contexte** — ADR-0010 réserve l'écriture du schéma de contenu au mode développement :
un fichier versionné en git, jamais modifié en production, pour éviter la dérive de
configuration entre environnements. Le bloc `permissions` de chaque collection/taxonomie
suit aujourd'hui cette même règle — un rôle personnalisé n'a donc, par construction,
aucun pouvoir réel tant qu'un déploiement n'a pas suivi. C'est exactement le problème que
la fiche 63 remonte : un administrateur doit pouvoir accorder ou retirer un droit sans
attendre un cycle de déploiement.

**Décision** — Une nouvelle table site-scopée `role_permissions` porte les permissions
d'un rôle personnalisé, en surcouche du bloc `permissions` déclaré dans le fichier de
schéma. `PermissionLayer` lit la table en priorité ; si aucune entrée n'existe pour un
rôle donné, il retombe sur le fichier — jamais l'inverse, pour qu'une régression de
déploiement ne masque jamais silencieusement un droit retiré en base. Un export vers
fichier permet de figer l'état courant de la table dans le dépôt quand un site veut
revenir à une source entièrement versionnée.

**Justification** — Le fichier reste la référence par défaut et le seul mécanisme pour
tout site qui ne crée aucun rôle personnalisé : rien ne change pour lui. La table n'entre
en jeu que pour les sites qui utilisent réellement cette fonctionnalité, et uniquement
pour les *permissions*, jamais pour la structure des collections elle-même (les champs,
les types, les relations restent sous ADR-0010 sans exception).

**Conséquences** — Nouvelle migration réversible (`role_permissions`, site-scopée). La
création d'un rôle avec permissions passe par la même validation que
`defineCollection`/`validateCollectionSet` (déjà utilisée par le flux L19), pour ne pas
dupliquer une seconde logique de validation. Chaque changement de permission est
confirmé explicitement et journalisé (audit systématique, même porte que L19).
`contract-guardian` doit être consulté avant toute fusion touchant ce chemin : le bloc
`permissions` du contrat A est concerné par construction. `PermissionLayer` gagne
`ruleFor(action, collection)`/`ruleForTerm(action, taxonomy)`, documentés explicitement
comme la règle « table avant fichier » exposée pour tout appelant qui doit raisonner sur
la forme d'une règle avant `can()`/`assert()` — deux appelants (`assertOwnAware` dans
`content-service.ts`, `holdsRole` dans `review-router.ts`) lisaient encore le fichier
directement et ont été corrigés pour interroger cette règle effective.

**Renoncement assumé** — La source de vérité des droits d'un site n'est plus purement
versionnée en git. C'est précisément le risque qu'ADR-0010 nommait pour le schéma de
contenu ; cette ADR l'accepte, explicitement et uniquement, pour les permissions de rôle
— parce qu'un changement de droit (accorder, retirer un accès) est une opération, pas une
décision de structure, et qu'un administrateur légitime doit pouvoir l'appliquer sans
dépendre d'un déploiement.

**Écarté** — Option (b), réutiliser tel quel le flux proposer/appliquer de L19 (fichier
versionné, écriture réservée à `cogenta dev`). Cohérente avec ADR-0010 sans exception,
mais rend tout changement de permission en production dépendant d'un cycle de
déploiement — inacceptable pour le besoin réel de la fiche 63.

---

## ADR-0030 — Le vocabulaire de blocs s'élargit à dix-sept (`blocks@2.0`) ; ADR-0009 rouverte sur ce seul point

**Statut** : Acté

**Contexte** — ADR-0009 fixait le vocabulaire de blocs comme « une dizaine, pas
cinquante » et en a fait une conséquence structurelle : chaque bloc ajouté est une dette
imposée à chaque auteur de thème, pour toujours. Douze blocs ont tenu ce plafond depuis
`blocks@1.0` (2026-08-13). Fiche 43 (Cogenta Page Builder) documente que le socle
d'édition visuelle (L16) est solide mais que le vocabulaire lui-même ne couvre pas les
sections qu'un site marketing/agence réel demande couramment — tableau de tarifs,
témoignages, accordéon, ligne de chiffres clés, bandeau de logos — et que le mécanisme de
repli existant (`BlockRegistry.resolveRenderable`, un thème peut ajouter son propre bloc
s'il déclare un repli) répond seulement au besoin d'un thème isolé, jamais à la demande
d'un vocabulaire partagé et portable entre thèmes.

**Décision** — Rouvrir ADR-0009, **sur ce seul point** : la taille du vocabulaire. Décidé
en conversation directe avec l'utilisateur le 2026-08-26, qui a explicitement demandé un
constructeur de page « ultra complet façon WordPress/Elementor » après un test de L23, et
a validé les deux RFC ci-dessous sans le délai de sept jours habituel (projet en mode
développement, encore sans contributeur externe à consulter — voir la dérogation notée
dans les deux fichiers).

1. **Contrat B monte en `blocks@2.0`** (RFC 0001, `docs/rfc/0001-widen-block-vocabulary.md`) :
   cinq blocs ajoutés au sommet des douze — `testimonial`, `pricingTable`, `accordion`,
   `statCounter`, `logoStrip`. Chacun nomme un `fallback` vers le vocabulaire v1
   (`prose`, `featureGrid`, `mediaFigure`), contrairement aux douze premiers
   (`fallback: null`, ils *sont* le repli) : un thème construit avant `blocks@2.0` les
   rend dégradés, jamais perdus.
2. **Contrat B gagne `variant`** (RFC 0002, `docs/rfc/0002-per-block-visual-variant.md`) :
   un champ optionnel partagé `{ background?, spacing?, align?, width? }` sur l'enveloppe
   de tout bloc — jetons sémantiques fermés, jamais une valeur CSS ou une couleur (la
   règle absolue d'ADR-0009 tient sans changement). Chaque thème résout chaque valeur
   vers son propre jeton ; absent = rendu inchangé.
3. **Ce qu'ADR-0009 continue d'interdire, sans exception** : `f.blocks()` reste refusé
   dans le schéma d'un bloc — l'imbrication est la porte d'entrée d'un constructeur de
   mise en page en colonnes/sections libres, hors périmètre de cette réouverture (fiche
   43, sous-chantiers « Bloquants »). La règle absolue (donnée sémantique uniquement,
   jamais de HTML/CSS/classe) tient elle aussi sans changement — vérifiée par
   `contract-guardian` sur les cinq nouveaux blocs et sur `variant`.

**Pourquoi une montée majeure, pas mineure malgré une addition pure** — `docs/04-contrats.md`
classait initialement « ajouter un bloc » comme mineur. Ce n'est pas praticable ici : le
rendu de chaque thème (`render-block.ts`) est un `switch` exhaustif sur
`VocabularyBlock`, vérifié `never` à la compilation — un bloc ajouté au vocabulaire est
donc une rupture de compilation réelle pour tout thème existant, même si aucun contenu
n'a jamais pu utiliser ces cinq types avant cette version (rien à migrer côté données).
`docs/04-contrats.md` documente cette reclassification comme la règle pour cette
catégorie précise de changement, décidée au cas par cas par RFC plutôt que par défaut.

**Conséquences** — `packages/blocks` (`vocabulary.ts`, `variant.ts`, `define-block.ts`,
`types.ts`), les cinq paquets de thème, `@cogenta/theme-kit` (`resolveBlockForRender`,
`withBlockVariant`), `@cogenta/cli` (passage optionnel d'un `BlockRegistry` de site),
`@cogenta/admin` (panneau d'apparence de bloc, et son miroir local du vocabulaire
`packages/admin/src/blocks/vocabulary.ts`, tenu synchrone par
`vocabulary-sync.test.ts`). `docs/04-contrats.md` mis à jour. Changesets `major` pour
`@cogenta/blocks` et les cinq thèmes, `minor` pour `@cogenta/theme-kit` et `@cogenta/cli`
(wiring additif). `contract-guardian` a revu le changement (verdict : conforme).

**Renoncement assumé** — Le vocabulaire n'est plus « une dizaine » (il en compte
dix-sept), ce qu'ADR-0009 présentait comme la garantie qui rend praticable la promesse
« change de thème, le contenu s'adapte ». Le renoncement est jugé acceptable parce que
le mécanisme même qui rendait cette promesse tenable — le repli déclaré — s'applique
identiquement aux cinq nouveaux blocs, et parce que les cinq in-house themes
(`theme-canonical`, `theme-portfolio`, `theme-magazine`, `theme-ecommerce`,
`theme-entreprise`) les implémentent tous directement avec un rendu distinct par thème,
jamais un recolorage : la dette « un bloc ajouté coûte à chaque auteur de thème » est
payée dans ce lot même, pas différée à un futur auteur de thème tiers. Un vocabulaire à
cinquante resterait refusé — ce lot n'ouvre pas la porte à un ajout non justifié par RFC.

**Écarté** — Attendre le délai de sept jours de discussion publique habituel du
processus de RFC (`docs/rfc/README.md`) : ce délai suppose des contributeurs externes à
consulter, qui n'existent pas encore pour ce projet en pre-alpha ; le texte des deux RFC
reste la justification écrite complète, prêt à être déposé comme vraie issue GitHub si le
projet s'ouvre un jour à des contributions externes.

---

## ADR-0031 — Le renoncement « pas de champ fichier, pas de champs conditionnels » d'ADR-0026 est levé

**Statut** : Acté

**Contexte** — ADR-0026 renonçait explicitement, pour la première version du contrat G, à
deux choses : un champ `file` (« pour ne pas ouvrir la surface téléversement/antivirus
sans besoin prouvé ») et les champs conditionnels (« hors périmètre de cette première
version »). La fiche 47 (parité avec les constructeurs de formulaires premium — Gravity
Forms/WPForms) chiffre les deux comme tâches concrètes, avec un besoin désormais prouvé :
un formulaire de candidature ou de support sans pièce jointe, et un formulaire sans
logique conditionnelle, sont les deux lacunes les plus citées face à ces outils. La
décision de rouvrir ces deux points précis a été tranchée en direct avec l'utilisateur le
2026-08-26, au moment de cadrer la fiche 47 (consignée dans
`docs/plans/47-formulaires-et-soumissions-premium.md` §8) — cette ADR met cette décision
dans le registre append-only plutôt que de la laisser vivre seulement dans un document de
planification, `contract-guardian` ayant à raison signalé qu'un renoncement explicitement
acté ne devrait pas être renversé par une simple note dans `docs/04-contrats.md`.

**Décision** — Le contrat G monte en **`forms@1.1`**, additif :

1. **Champ `file`** — dixième type de champ. La surface antivirus qu'ADR-0026 redoutait
   n'est pas ouverte par une analyse de contenu malveillant (aucune n'existe dans ce lot,
   assumé ci-dessous), mais mitigée par trois garanties structurelles : la catégorie
   réelle est lue sur les octets (jamais un nom de fichier ni un `Content-Type` déclaré —
   même discipline que `verifyRealType` du pipeline média, L10 tâche 5), une taille
   maximale plafonnée matériellement (`FORM_FILE_HARD_MAX_BYTES`, non contournable par la
   configuration d'un formulaire), et le fichier stocké n'est **jamais servi
   publiquement** — contrairement à `/_image` pour la médiathèque, aucune route de
   téléchargement n'existe pour un fichier de formulaire à ce stade (un admin ne peut pas
   non plus le récupérer aujourd'hui — lacune fonctionnelle assumée, pas un risque de
   sécurité en soi).
2. **Champs conditionnels (`showIf`)** — une condition (`field`/`operator`/`value`)
   évaluée côté serveur contre la soumission brute ; un champ masqué n'est ni requis ni
   validé, avec ou sans JavaScript.
3. **Corollaire de sécurité, trouvé et corrigé pendant l'implémentation** — une revue de
   sécurité dédiée a montré qu'un champ `file` porté à travers un formulaire à étapes
   (`_accumulated`, fiche 47 tâche 2, elle aussi nouvelle) ne pouvait pas se contenter
   d'une vérification de forme (`isFormFileValue`) : un client pouvait forger une valeur
   `{filename, mimeType, size, storageKey}` sans jamais envoyer un octet réel. La valeur
   portée d'une étape à l'autre est donc **signée** (HMAC, clé dérivée de
   `COGENTA_AUTH_SIGNING_KEY` — jamais un second secret, même discipline que
   `commentsIpHashSecret`) et **liée à `formId`+`fieldName`** (une correction de suivi a
   fermé le rejeu d'un jeton d'un champ vers un autre) ; seul le routeur qui l'a signée
   peut la faire accepter à l'étape suivante, pour ce champ précis.

**Justification** — Le principe de « ne pas rediscuter une décision actée » protège
contre un contournement silencieux, pas contre un changement d'avis assumé et tracé.
ADR-0026 documentait déjà ce renoncement comme une prudence temporaire liée à l'absence
de besoin prouvé, non comme un refus de principe ; la fiche 47 fournit ce besoin, et
cette ADR trace formellement le changement plutôt que de le laisser implicite dans le
code ou dans un simple commentaire de `docs/04-contrats.md`.

**Conséquences** — `packages/forms` gagne `file-field.ts` (sniffing par octets, plafond
dur, signature/vérification de jeton scopée formulaire+champ) et `conditions.ts`
(`showIf`) ; `FORM_FIELD_KINDS` passe de neuf à dix valeurs, `FormFieldDefinition` gagne
trois propriétés optionnelles. Aucune forme existante n'est changée de sens — un
consommateur `forms@1.0` qui ignore ces champs garde le comportement d'avant.
`docs/04-contrats.md` § Contrat G est mis à jour en conséquence (`forms@1.1`).

**Renoncement assumé** — Aucun scan antiviral/malware réel n'est ajouté par cette
décision : la mitigation reste « type réel vérifié par octets + taille plafonnée +
jamais servi publiquement », pas une analyse de contenu. Un fichier de formulaire accepté
n'est aujourd'hui récupérable par personne, pas même un admin légitime — capacité de
téléchargement authentifié hors périmètre de cette fiche, à ouvrir séparément. Le bloc
`form` du contrat B reste hors périmètre (RFC toujours ouverte, non traitée par cette
ADR).

**Écarté** — Accepter la valeur `file` portée d'une étape à l'autre sur la seule foi de
sa forme (`isFormFileValue`) : c'est précisément la faille que la revue de sécurité a
trouvée et que cette décision ferme par la signature scopée.
