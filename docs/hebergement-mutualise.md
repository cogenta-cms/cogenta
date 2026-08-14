# Déployer Cogenta sur un hébergement mutualisé (profil « Shared »)

> **Statut : documenté, pas encore testé sur un vrai hébergement.** Ce guide décrit un
> déploiement réel basé sur les mécanismes effectivement construits dans ce dépôt
> (drivers dégradés, entrée CLI, dialectes supportés). Il n'a **pas** été vérifié contre
> un compte cPanel réel — la personne responsable du projet a été consultée directement
> et a choisi de documenter maintenant et de tester plus tard elle-même, plutôt que de
> laisser supposer une vérification qui n'a pas eu lieu. Le lot L9 est explicite sur ce
> point : « testé sur un vrai hébergement cPanel, pas supposé. » Tant que la checklist en
> bas de ce document n'est pas cochée sur un hébergement réel, ce profil n'est **pas**
> considéré comme validé.

## Le profil « Shared »

`docs/02-architecture.md` (§ « Profils de déploiement ») nomme ce profil : plan de
contrôle et diffusion tous deux portés par **Node via Passenger (cPanel)**, en SSR
dégradé, pour de petits sites en mutualisé. Un seul processus Node fait tout — il n'y a
pas de VPS dédié, pas de conteneur, pas de worker séparé.

## Ce que la règle des drivers dégradés (R1) apporte ici

Un hébergement mutualisé cPanel n'a typiquement ni Redis, ni Docker, ni compilation
native, et impose des limites mémoire avec recyclage périodique des processus. C'est
exactement le terrain que R1 est censé couvrir — vérifié ici contre le code réel, pas
supposé :

- **File de jobs** — sans Redis, `createDatabaseQueue` (`packages/core/src/queue/database.ts`)
  est le driver dégradé réel : une table SQL (`cogenta_jobs`) que n'importe quel appel
  périodique peut drainer. **Lacune réelle constatée en écrivant ce guide** : aucune
  commande CLI n'existe aujourd'hui pour déclencher ce drainage depuis une entrée cron
  (`grep` sur `packages/cli/src` et `packages/create-cogenta/src` ne trouve aucun usage
  de `createDatabaseQueue`). Tant que cette commande n'existe pas, la file de jobs
  dégradée n'est pas complètement utilisable en pilotage cron sans écrire soi-même un
  petit script d'appel — à construire dans une tâche ultérieure.
- **Planification** — dégrade vers « cron système, granularité 1 minute » (R1). C'est
  cohérent avec ce que cPanel expose nativement (cron à la minute près), pas un
  compromis supplémentaire propre à ce profil.
- **Stockage média** — sans S3/R2/MinIO, `packages/core/src/storage/local.ts` est le
  driver de repli réel : système de fichiers local. Sur un hébergement mutualisé, cela
  veut dire écrire dans un répertoire du compte cPanel — à sauvegarder comme le reste du
  site, puisqu'aucun stockage objet externe n'est en jeu par défaut.
- **Traitement d'image** — R1 prévoit un repli WASM (`jsquash`) ou un pré-calcul au
  build plutôt que `sharp` (natif). Aucun module de traitement d'image dédié n'a été
  trouvé dans `packages/core/src` au moment de la rédaction — ce repli reste, comme la
  file de jobs, un point à construire plutôt qu'à supposer déjà câblé.
- **Base de données SQLite** — le driver SQLite du projet (`packages/core/src/db/sqlite.ts`)
  utilise **`node:sqlite`**, le module intégré à Node depuis la version qui l'expose,
  explicitement **pas** `better-sqlite3` : le commentaire du fichier le dit noir sur
  blanc — « `node:sqlite` ships with Node, so the default install compiles nothing and
  depends on nothing. `better-sqlite3` is deliberately not used: it is native. » Aucune
  compilation native n'est donc requise pour ce driver, ce qui correspond exactement à
  R10 et à une contrainte réelle de la plupart des hébergements mutualisés.

## MySQL

Le profil Shared vise typiquement une base MySQL fournie par cPanel plutôt que SQLite
(SQLite reste le choix par défaut du profil Solo). MySQL/MariaDB est un dialecte
supporté de première classe (`docs/02-architecture.md` § 5, « Données »). Pour
pointer un site scaffoldé vers une base MySQL cPanel, `cogenta.config`'s bloc
`database` doit porter `driver: 'mysql'` et une `url` de connexion vers la base fournie
par l'hébergeur (utilisateur, mot de passe et nom de base préfixés par le compte cPanel,
comme c'est l'usage sur ce type d'hébergement).

## Node via Passenger — le point d'entrée réel

Le paquet publié `@cogenta/cli` déclare un binaire `cogenta` pointant vers
`./dist/bin.js` (`packages/cli/package.json`). Une configuration Passenger pour ce
profil doit invoquer cette même entrée — concrètement, l'équivalent de
`node_modules/.bin/cogenta serve` (ou l'alias `dev`, ajouté en L9 tâche 9 — les deux
appellent la même implémentation réelle dans `packages/cli/src/commands/serve.ts`) comme
commande de démarrage du processus Node géré par Passenger.

**Lacune réelle constatée** : le `package.json` qu'un site scaffoldé reçoit
(`packages/create-cogenta/src/scaffold.ts`, fonction `packageJsonContents`) ne déclare
aujourd'hui ni script `start`, ni champ `engines` — seulement `name`/`version`/`private`/
`type`/`dependencies`. Un déploiement Passenger réel devra soit ajouter ce script à la
main pour l'instant, soit attendre qu'une tâche future l'ajoute au scaffolding — à ne pas
présenter comme déjà prêt à l'emploi.

## Séquence de déploiement (telle que les mécanismes réels le permettent aujourd'hui)

1. Provisionner une base MySQL dans cPanel, noter les identifiants.
2. Déposer le site scaffoldé (via `npm create cogenta` en local, puis transfert, ou
   clonage direct si l'hébergement le permet) dans le répertoire de l'application cPanel.
3. `cogenta.config` : renseigner `database.driver: 'mysql'` et l'URL de connexion
   réelle fournie par cPanel ; `storage.path` vers un répertoire du compte (driver de
   repli local, voir plus haut).
4. Installer les dépendances (`npm install` ou équivalent, selon ce que l'interface
   Node de cPanel propose).
5. Exécuter les migrations réelles (`cogenta migrate up`, commande existante et testée
   — `packages/cli/src/commands/migrate.ts`) avant le premier démarrage.
6. Configurer l'application Node de cPanel (Passenger) pour démarrer via l'entrée
   `cogenta serve`/`dev` décrite ci-dessus.
7. Ajouter l'entrée cron pour tout ce qui a besoin d'exécution périodique — aujourd'hui
   limité par la lacune notée plus haut (pas de commande de drainage de file de jobs
   encore exposée).
8. Pointer le domaine vers l'application Passenger configurée.

## Limites mémoire et recyclage des processus

Un hébergement mutualisé impose typiquement un plafond mémoire par processus et recycle
les processus inactifs. Rien dans la conception de Cogenta ne suppose un cache mémoire
longue durée qui survivrait à un recyclage : les drivers dégradés (file de jobs en
table SQL, cache sur disque puis mémoire selon R1) sont, par construction, rejouables
depuis un état persistant plutôt que dépendants d'un processus qui ne s'arrête jamais.
Le coût réel d'un recyclage est donc un coût de démarrage à froid (ouverture de la
base SQLite/MySQL, relecture de la config), pas une perte de données — mais ce
raisonnement n'a, comme le reste de ce document, pas été mesuré sur un hébergement réel.

## Checklist de vérification (à faire sur un hébergement réel)

Aucune de ces cases n'est cochée. Chacune correspond à un point explicitement exigé par
le lot L9 (« ce qui doit être vérifié »). Cocher une case ici sans l'avoir vérifiée sur
un vrai compte cPanel irait à l'encontre du principe même de cette page.

- [ ] Le processus Node démarre réellement sous Passenger via l'entrée `cogenta serve`/`dev`
- [ ] La connexion à une base MySQL réelle fournie par cPanel fonctionne (migrations, lecture, écriture)
- [ ] Une entrée cron à la granularité minute déclenche réellement le traitement périodique attendu
- [ ] Aucune dépendance à Redis n'est nécessaire au fonctionnement du site
- [ ] Aucune dépendance à Docker n'est nécessaire au fonctionnement du site
- [ ] Aucune compilation native n'est requise à l'installation (`npm install` sans étape de build natif)
- [ ] Le site continue de fonctionner correctement sous la limite mémoire réelle de l'offre testée
- [ ] Le site redémarre proprement après un recyclage de processus (pas de perte de données, coût de démarrage à froid acceptable)
