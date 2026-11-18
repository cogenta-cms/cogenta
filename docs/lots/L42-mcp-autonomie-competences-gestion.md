# L42 — MCP : autonomie réglable, compétences du site, gestion du site

Demandé par l'utilisateur le 2026-11-18, après L41 (publier par MCP seul). Un agent IA
externe (Claude, Codex…) connecté au MCP d'un site doit pouvoir :

1. **publier sans attendre un humain, si l'administrateur l'a choisi** — sinon chaque
   écriture attend « Actions à approuver », comme aujourd'hui ;
2. **écrire dans le style du site** — les compétences (« skills ») que l'administrateur
   écrit dans l'admin (*IA → Compétences*, format `SKILL.md`) doivent lui être lisibles par
   le MCP, sans rien installer de son côté ;
3. **gérer le site, pas seulement publier.**

Tout est dans Cogenta (aucun code propre à un site), puis le site est mis à jour.

## 1. Autonomie par clé d'API

- `ApiKey.autonomy: 'manual' | 'autonomous'`, défaut `manual` (comportement actuel). Choisie
  à la création de la clé et modifiable ensuite (REST + écran admin de la clé, en français
  clair : « Validation manuelle » / « Autonome : les actions annulables s'exécutent sans
  validation »).
- **R6 ne bouge pas.** En `autonomous`, seule une écriture **réversible** s'exécute sans
  attendre ; une écriture non réversible attend toujours un humain. Pour que l'autonomie
  serve, les écritures de publication deviennent réversibles avec un vrai `revert` :
  `content.write_draft` (création → corbeille ; mise à jour → restauration de la version de
  travail précédente), `content.write_translation` (corbeille), `content.publish` (retour à
  la version publiée précédente, ou dépublication si jamais publiée), `taxonomy.create_term`
  (suppression du terme créé, seulement s'il est encore inutilisé), `media.import_url`
  (suppression du fichier importé, seulement s'il est encore inutilisé). Ce qui ne peut pas
  être défait proprement reste non réversible, et le dit.
- Toute action autonome est journalisée et visible dans l'Historique (audit `origin: mcp`).
- **Annuler depuis le journal.** `GET /api/mcp/actions/{auditId}` (annulable, déjà annulée,
  impossible) et `POST /api/mcp/actions/{auditId}/revert` (`packages/cli/src/commands/mcp-undo.ts`) :
  session d'**administrateur** uniquement — une clé d'API est refusée, quel que soit son rôle,
  pour qu'un agent ne défasse ni ne refasse rien par lui-même. L'annulation passe par le
  `revert` de l'outil avec l'identité de l'administrateur (les permissions de l'hôte
  s'appliquent) et le reçu gardé dans l'entrée d'audit (la sortie de l'outil ; allégée à ses
  champs scalaires et à `undo` quand l'entrée dépasserait la borne de 64 Kio du journal,
  `mcp-receipt.ts`). Elle s'inscrit comme **sa propre entrée**
  `agent.tool.<outil>.revert` (`revertOf: <auditId>`) ; une seconde annulation de la même
  entrée est refusée (`RECEIPT_ALREADY_REVERTED`, 409), un refus de l'outil
  (`TOOL_REVERT_REFUSED`, 409 : contenu modifié depuis) est renvoyé tel quel avec son
  indice et inscrit avec `ok: false` sans compter comme annulation. Écran : bouton
  « Annuler cette action » (avec confirmation dans la page) dans le détail d'une entrée du
  journal d'audit. Limite : le verrou « déjà annulée » est un verrou de processus plus la
  lecture du journal, pas une garantie entre plusieurs réplicas.
- **Le journal d'abord (revue de sécurité du 2026-11-18).** L'annulation écrit son
  intention (`phase: 'started'`, même action `agent.tool.<outil>.revert`) **avant** de
  s'exécuter : si le journal refuse l'écriture, rien n'est annulé (`AUDIT_WRITE_FAILED`,
  503). Le résultat (`ok: true|false`) suit comme seconde entrée ; s'il ne peut pas être
  écrit après une annulation réussie, la réponse est une erreur 503 qui dit que l'annulation
  a eu lieu et qu'il ne faut pas la refaire, et le processus s'en souvient (« déjà
  annulée ») jusqu'à son redémarrage. Choix de l'ordre : une annulation que personne ne peut
  retracer est pire qu'une annulation qui n'a pas eu lieu. Une annulation par entrée écrit
  donc deux lignes ; seule celle qui porte `ok` compte pour « annulée ».
- **`comments.decide`** : l'annulation est refusée (`TOOL_REVERT_REFUSED`) si le commentaire
  n'a plus le statut que l'appel avait posé — une personne a décidé de nouveau.
- **Changer l'autonomie d'une clé laisse une trace** : `apikey.create` porte `scope` et
  `autonomy` ; `PATCH /api/api-keys/{id}` écrit `apikey.update` avec, pour chaque champ
  modifié (`autonomy`, `scope`, `name`, `rateLimitPerMinute`), `{ from, to }`.

## 2. Les compétences du site par le MCP

- Outils `skills.list` (nom, description) et `skills.read` (contenu `SKILL.md`), lecture
  seule, sur l'`AgentSkillStore` existant — aucun second magasin.
- Le serveur MCP implémente aussi `prompts/list` et `prompts/get` (chaque compétence est un
  prompt), pour les clients qui les affichent.
- Les instructions du serveur MCP disent à l'agent de lire les compétences avant d'écrire.

## 3. Gestion du site

Phase 1 (ce lot) — exposer au MCP les outils du contrat C qui existent déjà pour les agents
internes : `comments.list`, `comments.decide`, `redirects.create`, `analytics.summary`,
`logs.read_not_found`, avec les mêmes portes que leurs routes REST.

Durcissements de la revue de sécurité (2026-11-18) :

- **R8 — le texte des visiteurs est de la donnée.** Une clé autonome qui lit les
  commentaires et le journal 404 *et* publie est le cas à risque : les instructions du
  serveur MCP disent que ces textes ne sont jamais des instructions et ne déclenchent
  jamais une écriture ; l'hôte enferme chaque chaîne de visiteur de la sortie de
  `comments.list` et `logs.read_not_found` dans un bloc `<data source="tool:…">` (chevrons
  échappés) et ajoute `untrusted: true` et `notice` (`mcp-untrusted.ts`). Les définitions
  d'outils ne bougent pas. L'écran des clés d'API (et celui du MCP) avertit qu'une clé
  autonome qui a le rôle admin lit aussi ce texte et recommande une clé distincte pour
  publier.
- **`redirects.create` ne remplace jamais** une règle existante (`REDIRECT_EXISTS`) et ne
  part jamais d'un chemin que le site sert lui-même (`REDIRECT_PATH_RESERVED`,
  `reserved-paths.ts`, dérivé des routes de `serve.ts`). Refusé avant l'approbation, et de
  nouveau à l'exécution pour la règle existante (une personne peut en créer une pendant
  l'attente). Seul l'hôte MCP le demande : l'agent « Site Monitor » en autopilote garde
  l'ancien comportement.

Phase 2 (lot suivant) — menus, widgets, réglages du site en écriture (`site.config_write`,
permission déjà dans la taxonomie). Utilisateurs, thèmes et plugins restent hors MCP :
surface sensible, à décider à part.

## Critères d'acceptation

- Un client MCP réel avec une clé `autonomous` publie un article bilingue complet sans
  aucune approbation ; avec une clé `manual`, la même écriture attend ; une écriture non
  réversible attend dans les deux cas. Chaque `revert` est testé.
- `skills.list`/`skills.read` et `prompts/list`/`prompts/get` rendent une compétence créée
  dans l'admin.
- Revue `security-reviewer` et `contract-guardian` avant fusion.
