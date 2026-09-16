# L31 — Les plugins, pour de vrai (et un atelier IA qui en écrit)

> Demandé en direct le 2026-09-16 : « je veux aussi qu'on ajoute le système de plugin, qui permet
> d'ajouter ou d'améliorer les fonctionnalités. Genre on peut demander à l'IA d'ajouter un plugin
> pour faire x ou y, et l'IA le fait. Mais il faut y aller pas à pas, pour ne pas cramer les tokens
> de session trop vite. » Mode de travail : autonomie, par étapes livrables une à une.

## Le constat, vérifié dans le code (2026-09-16)

`@cogenta/plugins` (L7) est complet **et mort** :

- `runPlugin`, `runIsolated` et les quatre gestionnaires de capacités n'ont **aucun appelant** hors
  tests. `cogenta serve` n'importe que les tables, les magasins de grants/usage/désactivation et le
  catalogue de marketplace. Le fichier le dit lui-même (« Nothing in `cogenta serve` actually calls
  `runPlugin` yet »), et `BLOCKERS.md` §14 aussi.
- Un plugin **n'a nulle part où vivre** : aucun dossier conventionnel dans un site généré, aucun
  champ `plugins` dans `cogenta.config`, aucun balayage au démarrage.
- `loadPlugin` lit le manifeste et **jamais le code** : l'exécution reçoit une chaîne que personne
  ne produit. La signature Ed25519 couvre donc le manifeste, pas le code (`sign.ts` le dit).
- Le protocole hôte↔worker n'a **pas de canal d'arguments** : un plugin ne peut pas être *appelé*.
- `provides.blocks`, `provides.tools`, `eventSubscriptions` sont **déclaratifs** : rien ne les lit.
- 15 des 19 capacités du vocabulaire s'accordent dans l'admin et ne font **rien** (aucun
  gestionnaire) : `content.write_draft`, `media.*`, `schema.read`, `channel.send`…
- Aucune commande `cogenta plugin`, aucun routeur `/api/plugins` (seul `/api/marketplace` existe).

Rien de tout cela n'est une décision actée à contourner : c'est du câblage jamais fait.

## Principe directeur

**R2 d'abord.** Le système de plugins doit être entièrement utilisable sans IA : installer, accorder
des permissions, exécuter, désactiver, supprimer. L'atelier IA est une porte d'entrée supplémentaire
qui produit du code dans un bac à sable — jamais un chemin obligatoire, jamais une écriture directe
dans le site.

**Le précédent à copier, pas à réinventer** : l'atelier de thèmes (fiche 73) a déjà tout le patron —
bac à sable `<projectRoot>/.cogenta/theme-sandbox/<id>/`, outil d'écriture `theme.write_sandbox_file`
(`sideEffects: true`, `reversible: true`, `autonomy: propose`), garde contre l'évasion de chemin, et
un déploiement vers `themes/` confirmé par un humain. Le plugin suit la même forme.

## Étapes (chacune livrable seule)

### Étape 1 — Un plugin qui s'exécute vraiment

- Dossier conventionnel `plugins/<nom>/` dans un site, champ `plugins` dans `cogenta.config`.
- `main` dans le manifeste, lu depuis le disque ; la signature couvre **manifeste + code**.
- Canal d'arguments dans le protocole worker, et une invocation nommée (`invoke(name, input)`).
- `cogenta serve` charge les plugins installés au démarrage, journalise ce qu'il a chargé et ce
  qu'il a refusé, et n'échoue jamais au démarrage à cause d'un plugin (R1/R2).
- Commande `cogenta plugin` : `list`, `check`, `run` — de quoi exercer tout ça à la main.

### Étape 2 — Au moins un vrai point d'extension

Par ordre d'utilité pour « ajouter une fonctionnalité » :
1. **événements de contenu** (`entry.published`, `entry.updated`, …) — un plugin réagit ;
2. **route publique** (`GET /plugins/<nom>/<chemin>`) — un plugin sert quelque chose ;
3. **tâche planifiée** — un plugin s'exécute tous les jours.
Les blocs (contrat B figé) restent hors périmètre sans RFC.

### Étape 3 — Les capacités qui manquent

Gestionnaires réels pour `content.write_draft`, `media.read`, `schema.read`, `channel.send` au
minimum ; une capacité accordée mais sans gestionnaire ne doit plus être proposée à l'écran.

### Étape 4 — L'atelier IA

Bac à sable `<projectRoot>/.cogenta/plugin-sandbox/<id>/`, outils `plugin.write_sandbox_file`,
`plugin.read_sandbox_file`, `plugin.check_sandbox` (permission `plugin.write_sandbox`), agent
« Cogenta Plugin Builder » à identité détaillée, écran admin, et un déploiement vers `plugins/`
confirmé par un humain après revue des permissions demandées.

### Étape 5 — Sécurité et honnêteté

Revue `security-reviewer` sur l'ensemble, test d'évasion du bac à sable, écran de permissions en
langage clair, journal d'audit des installations, et mise à jour de `BLOCKERS.md` §14.

## État d'avancement

| Étape | État | Notes |
|---|---|---|
| Conception | fait | 2026-09-16, sur reconnaissance réelle du code |
| 1. Exécution réelle | fait | `main` dans le manifeste, code lu du disque, signature couvrant le code, canal d'invocation (`invoke`/`input`), `plugins/<nom>/` + `plugins.dir`/`plugins.enabled`, `cogenta plugin list/check/grant/revoke/run`, test de bout en bout sur un vrai site |
| 2. Points d'extension | fait | événements de contenu (`onContentEvent`), route publique sous `/_cogenta/plugins/<nom>` (`onRequest`, sans en-tête choisi par le plugin), tâche planifiée sur le planificateur du site (`onSchedule`) — chacun prouvé sur un vrai serveur |
| 3. Capacités | fait | `schema.read`, `content.write_draft` (jamais publier), `content.publish`, `content.delete` (corbeille, réversible), `media.read` implémentés et câblés dans `cogenta serve` et la CLI ; les capacités de contenu peuvent nommer une collection ; `cogenta plugin grant` refuse une capacité que rien n'implémente |
| 4. Atelier IA | fait | bac à sable `.cogenta/plugin-sandbox/<id>/` avec ses gardes, trois outils (`plugin.write_sandbox_file`/`read_sandbox_file`/`check_sandbox`, permission `plugin.write_sandbox`, contrat C `tools@1.7`), agent « Cogenta Plugin Builder » (`autonomy: propose`, aucun outil d'installation), routes `/api/plugins/*` et écran admin Plugins avec revue des permissions et installation confirmée |
| 5. Sécurité | fait | revue indépendante : verdict initial NON CONFORME, deux failles critiques avec preuves exécutées, les six constats corrigés et couverts par des tests de non-régression |

## Rapport de clôture (2026-09-16)

**La revue de sécurité a rendu NON CONFORME, et elle avait raison.** Deux failles
critiques, chacune reproduite par un PoC exécuté, toutes deux héritées de la conception de
L7 et rendues réellement atteignables par L31 (qui est ce qui a fait charger des plugins
par un vrai site, et écrire du code par une IA) :

1. **Évasion complète du bac à sable.** Le contexte `vm` recevait les objets du worker
   (`console`, `Math`, `JSON`, `Promise`, `setTimeout`) : `setTimeout.constructor` est le
   `Function` du worker, donc `setTimeout.constructor('return process')()` rendait le vrai
   `process` — système de fichiers, `child_process`, le `.env` du site. Aucune capacité
   n'était nécessaire. Vérifié avant correction (`pid` réel obtenu), puis refermé : tout ce
   qu'un plugin peut toucher est désormais **construit à l'intérieur du contexte**, le seul
   pont vers l'hôte a un prototype nul et est supprimé du global après amorçage, et les
   valeurs traversent en JSON. Six chemins d'évasion sont des tests de non-régression.
2. **Le manifeste s'exécutait dans le processus hôte.** `plugin.manifest.mjs` était un
   module `import`é : chaque démarrage exécutait un manifeste par plugin installé, et
   *inspecter* un bac à sable exécutait le code qu'on prétendait relire, avant toute
   vérification. Le manifeste est maintenant **`plugin.manifest.json`, lu et jamais
   exécuté** ; un fichier `.mjs` est refusé par son nom, avec la raison.

Quatre constats de moindre gravité, tous corrigés : SSRF par redirection sur `http.fetch`
(le nom d'hôte est revérifié à **chaque** saut, cinq maximum), XSS possible sur l'origine du
site par une route de plugin (réponses servies sous `Content-Security-Policy: sandbox;
default-src 'none'` et `nosniff`), absence de plafond de workers simultanés (huit, puis 503),
et taille de réponse non bornée (1 Mio).

**Ce qui reste vrai et doit être dit** : un contexte `vm` n'est pas une frontière de
sécurité à lui seul (la documentation de Node le dit, `docs/05-securite.md` aussi). Les
chemins connus sont fermés et testés ; la vraie frontière serait un processus séparé sous
le modèle de permissions de Node. C'est la suite naturelle, notée dans `BLOCKERS.md`.
