# L22 — Le CMS agentique, pris au sérieux

> **Contexte.** Après avoir testé L21 en direct, l'utilisateur a envoyé un
> retour massif : des bugs concrets (déjà corrigés séparément, voir
> l'historique git — modale vide à la fermeture, page ne remonte pas en
> haut à la navigation, logo décalé dans la barre du haut, clé API affichée
> en clair à l'installation), et une refonte de fond sur ce qui fait de
> Cogenta un **CMS agentique** et non un CMS avec de l'IA en option. Ce lot
> couvre le reste : le système multi-agents pris au sérieux, la
> documentation refondue, l'observabilité, et une série de finitions
> d'admin. C'est le plus gros lot du projet depuis L10 — dix tâches,
> pensées pour tourner en parallèle sauf dépendance explicite.

## Principe transversal : R2 reste non négociable

Tout ce lot ajoute des capacités **autour** de l'IA. Rien ici ne doit rendre
une fonctionnalité de contenu, d'admin ou de rendu dépendante d'une clé API
configurée. Un agent désactivé, ou un site sans fournisseur LLM, doit
laisser le CMS entièrement fonctionnel — c'est déjà vérifié pour L18/L19,
et cette exigence s'étend à tout ce que ce lot ajoute.

## Décision de conception actée avant de coder : pas de LangGraph

L'utilisateur suggère LangGraph comme moteur d'orchestration. **Décision :
ne pas l'adopter.** LangGraph (et sa version JS, `@langchain/langgraph`)
est un framework lourd, avec son propre graphe d'exécution et sa propre
notion d'état — l'adopter contredirait R9 (« préférer zéro dépendance à une
petite dépendance ») et R1 pour un projet qui a déjà construit, dans
`@cogenta/agents`, une bonne partie des primitives qu'il faudrait (registre
d'outils typé, contrat de permissions C, budget/autonomie, mémoire). Ce que
`@cogenta/agents` **n'a jamais eu**, documenté honnêtement dans ce dépôt
depuis L5, c'est un `AgentRegistry` qui **fait réellement tourner** un
agent — activer un agent aujourd'hui n'exécute rien. La Tâche 1 comble ce
vrai manque avec une boucle d'orchestration légère, faite maison, qui
réutilise l'existant plutôt que d'importer un moteur de graphe entier. Si
un besoin réel de graphe complexe (branches conditionnelles, retries
structurés) apparaît plus tard, ce sera une ADR à part, pas une décision
prise en douce dans ce lot.

---

## Tâche 1 — Le runtime d'agents, enfin vivant (fondation, prioritaire)

**Ce qui existe déjà** (vérifié en L21 tâche 4) : `packages/agents/src`
modélise déjà `AgentDeclaration` en détail — permissions/outils, autonomie
(défaut + surcharges par outil), budget (jetons/jour, €/mois, appels/heure),
mémoire, déclencheurs (`triggers`, événement ou cron). `AgentRegistry`
(`packages/agents/src/agents/registry.ts`) ne fait que `enable`/`disable`.
**Aucune boucle d'exécution n'existe.**

**À construire** :
1. Une boucle d'agent réelle : reçoit une instruction ou un déclencheur,
   appelle le LLM configuré avec le registre d'outils du contrat C
   (`buildManifest`/`createToolRegistry`, déjà utilisés par `cogenta mcp`
   — réutiliser tel quel, ne pas dupliquer), exécute les appels d'outils
   retenus, boucle jusqu'à une réponse finale ou une limite de tours. Une
   fonction, pas un framework — le contrat C fournit déjà la liste fermée
   d'outils et leurs permissions (R4 : le runtime vérifie, l'outil ne
   décide jamais lui-même).
2. **Un agent par défaut, le superagent**, nommé « Cogenta Agent » dans le
   code et la doc, créé à l'installation (`create-cogenta`) avec accès à
   l'ensemble des outils du contrat C que le rôle `admin` autorise.
   **Actif par défaut** (contrairement à ce que L21 tâche 4 décrivait comme
   une simple case à cocher désactivée) — c'est la demande explicite de
   l'utilisateur : un CMS agentique a un agent qui tourne dès l'installation,
   pas un gadget qu'on découvre. R2 reste respecté : sans fournisseur LLM
   configuré, le superagent existe en configuration mais ne s'exécute
   jamais (aucun appel réseau tenté), exactement comme le reste de la pile
   IA.
3. **Sous-agents nommés, créés par l'utilisateur**, chacun avec son propre
   sous-ensemble de permissions/outils, son propre budget, son propre
   niveau d'autonomie. Le superagent peut **appeler** un sous-agent (« lance
   l'agent d'analyse de sécurité ») — implémenté comme un outil de plus
   dans le registre du superagent, portant la permission d'invoquer tel
   sous-agent nommé, jamais un accès générique à « tous les agents ».
4. **Niveaux d'autonomie**, un champ déjà modélisé (`autonomy`) mais jamais
   vraiment exploité : fixer trois valeurs fermées —
   `report-only` (l'agent ne fait que remonter de l'information, aucune
   écriture), `co-pilot` (l'agent propose, une action humaine confirme —
   réutilise le mécanisme de suggestion déjà utilisé par `assist.classify`/
   `find_duplicates` en L18, jamais une application automatique), `autopilot`
   (l'agent applique lui-même les actions dont ses outils ont la
   permission — jamais au-delà de ce que le contrat C et le rôle de
   l'acteur autorisent, R4 reste la seule porte réelle). Ce champ existe
   déjà dans `AgentDeclaration` — le brancher pour de vrai est le travail.
5. **Deux agents intégrés supplémentaires, désactivés par défaut**,
   proposés à l'activation depuis l'écran Agents :
   - **Agent de sécurité** : scanne périodiquement (déclencheur cron) les
     dépendances (réutilise `deps-auditor`/les vérifications déjà
     documentées dans AGENTS.md) et les journaux d'audit pour des motifs
     suspects, rapporte — ne corrige jamais seul (autonomie `report-only`
     par défaut, modifiable).
   - **Agent générique** (« veille de contenu » servant d'exemple par
     défaut modifiable) : illustre le cas d'usage donné par l'utilisateur
     (réveil périodique, recherche, proposition de titres d'articles à
     valider) — livré comme modèle éditable, pas une fonctionnalité figée.
6. **Historique** : chaque exécution d'agent (superagent ou sous-agent)
   journalisée — quel agent, quel déclencheur, quels outils appelés, quel
   résultat, décision d'autonomie appliquée. Réutiliser le journal d'audit
   existant (`@cogenta/core`'s audit log, déjà utilisé partout ailleurs)
   plutôt qu'un second système de journalisation.
7. **Écran Agents refait** : liste des agents (superagent en premier,
   toujours visible), création de sous-agent, édition des permissions/
   outils/budget/autonomie (réutilise le panneau détaillé déjà construit en
   L21 tâche 4, le rend éditable), historique d'exécution par agent.

**Portée volontairement exclue de cette tâche** (couverte par les tâches
suivantes) : les canaux externes, le widget de discussion admin, l'API de
discussion, la configuration des fournisseurs LLM (déjà un écran séparé,
tâche 1bis ci-dessous), les skills.

---

## Tâche 1bis — Fournisseurs LLM, skills par défaut

**Fournisseurs** (nouveau sous-menu « Providers » dans la section IA) :
liste des fournisseurs supportés (déjà modélisés ailleurs dans le code —
vérifier `packages/agents/src/providers` avant d'écrire), activation par
fournisseur avec clé API (**jamais affichée en clair une fois enregistrée**
— même discipline que la Tâche de correction de `create-cogenta`, montrer
un masque une fois la clé sauvegardée), modèle par défaut choisi par
fournisseur. Chaque agent choisit son fournisseur ; « modèle par défaut du
fournisseur » reste l'option par défaut d'un agent, un agent peut le
surcharger.

**Skills** (nouveau sous-menu « Skills ») : un skill est un texte
d'instruction nommé (« comment rédiger un article », « comment faire une
revue de sécurité ») qu'un agent charge dans son contexte. Un jeu de
skills par défaut est semé à l'installation (rédaction de contenu, revue
de sécurité de base, gestion des menus/structure du site — au minimum ces
trois, plus si le temps le permet). **Par défaut, un nouvel agent hérite
de tous les skills du site** ; l'utilisateur peut en exclure par agent (le
cas donné : un agent de génération de contenu qui n'a pas besoin du skill
sécurité). Stocké comme un nouveau type de contenu simple (nom, description,
corps texte, `enabledByDefault: boolean`) — pas de nouvelle mécanique de
stockage si un mécanisme déjà générique (le store de contenu, ou le store
de réglages génériques déjà réutilisé plusieurs fois ce lot) peut porter ça
sans forcer un contrat figé.

---

## Tâche 2 — Canaux et discussion avec les agents (dépend de la Tâche 1)

**Ce qui existe déjà** : `@cogenta/channels` (L6, complet) — adaptateurs
Telegram/Slack/Discord/webhook, registre, routage entrant avec la règle
« une commande entrante s'exécute avec les permissions de l'humain
identifié, jamais celles de l'agent », déjà prouvée par test. **Rien de
tout ça n'est branché dans `cogenta serve`** (confirmé par la recherche
préalable à ce lot) — seul l'envoi de notifications sortantes l'est.

**À construire** :
1. **Brancher l'entrant** pour de vrai dans `cogenta serve`, sous la
   section IA de l'admin : un écran « Canaux » pour lier Telegram/Slack/
   Discord (réutilise le protocole de liaison d'identité par code à usage
   unique déjà construit et testé en L6), avec le message entrant routé
   vers le superagent (ou un sous-agent nommé explicitement dans le
   message) — jamais un accès qui dépasse les permissions du compte lié.
2. **Contrainte de déploiement à documenter, pas à contourner** : Telegram
   peut tourner en long-polling par réplique sans risque de duplication
   réelle uniquement si un seul processus dédié tourne (ou en passant en
   mode webhook, qui peut lui être distribué). Slack (Socket Mode) et
   Discord (Gateway) sont des connexions persistantes uniques par nature —
   **ne pas les démarrer depuis chaque réplique du serveur web**. Construire
   ceci comme un **process séparé optionnel** (`cogenta channels` ou
   équivalent, à trancher par l'agent), pas à l'intérieur de `cogenta
   serve` lui-même, pour que la question ne se pose même pas en déploiement
   à plusieurs répliques.
3. **Widget de discussion flottant dans l'admin** : un bouton flottant
   (bas-droite, ouvre une fenêtre de chat façon messagerie moderne),
   discute avec le superagent (ou un agent choisi dans un sélecteur),
   réutilise le flux déjà construit pour `assist.chat` (L18) plutôt qu'un
   second protocole de streaming. Exemple d'usage à couvrir par un test
   réel : demander de créer un menu avec des caractéristiques données, et
   vérifier que l'agent utilise le bon outil du contrat C pour le faire
   (jamais une action inventée hors du registre d'outils).
4. **API de discussion** : un nouvel écran (ou une section de l'écran MCP
   déjà construit en L21 tâche 6 — décider en fonction de ce qui reste le
   plus clair) pour activer un point d'entrée HTTP de discussion avec un
   agent donné, générer une URL et une clé, documenter le format de
   requête/réponse exact (JSON, un tour de conversation par appel, ou
   streaming — trancher selon ce qui reste simple à intégrer ailleurs).
   Cette API respecte les mêmes permissions que le canal qui l'appelle —
   pas un accès plus large que MCP ou les canaux.

---

## Tâche 3 — L'agent qui surveille le site (dépend de la Tâche 1)

Le besoin donné : le superagent avec accès aux journaux (jamais au code
source), qui détecte une anomalie (erreurs 4xx en série sur une page
supprimée, indisponibilité, erreurs serveur), résume et remonte
l'information (tableau de bord + option d'e-mail — réutilise
`@cogenta/channels`'s formats de message déjà construits), et — selon le
niveau d'autonomie configuré — propose ou applique une mesure corrective
bornée. **Un seul cas concret à livrer en premier**, testé de bout en
bout : une page 404 dont les journaux montrent des visites répétées reçoit
une suggestion de redirection vers une page choisie par l'agent, appliquée
seulement en autonomie `autopilot`, sinon proposée à l'admin pour
confirmation (réutilise l'écran Redirections déjà construit). D'autres cas
(erreurs serveur, indisponibilité) restent des idées documentées pour un
lot suivant plutôt que promis ici sans base réelle — rester honnête sur ce
qui est livré contre ce qui est esquissé.

---

## Tâche 4 — Assistant / RAG, rendu compréhensible

**Ce qui existe** (L18) : un vrai pipeline RAG (`createMemoryRagIndex`,
recherche hybride, citations qui viennent de la récupération jamais du
modèle) — mais l'écran `/assistant` actuel n'explique rien à l'utilisateur
qui le découvre (constat direct du retour utilisateur).

**À construire** : un écran refondu qui dit clairement, en langage humain :
ce que l'index vectoriel contient (quelles collections, activable/
désactivable par collection — la demande explicite : pouvoir exclure les
articles publiés de l'index), un flux d'upload de documents additionnels
(le pipeline extraction → découpage → vectorisation existe déjà via
`document.extract_text`, L19 — le brancher ici plutôt que d'en écrire un
second), et un état clair de ce qui est indexé/en cours/en erreur. Le
même index sert à la fois l'assistant admin et, si activé, un assistant
public sur le site (déjà esquissé en L10 — vérifier ce qui existe avant
d'ajouter).

---

## Tâche 5 — Observabilité : traces, logs, OpenTelemetry

Demande explicite de l'utilisateur, reçue en cours de lot : instrumenter
avec OpenTelemetry (traces de requêtes), niveau de log configurable, page
admin pour consulter les journaux quand c'est activé, export vers un
backend d'observabilité externe. **Activable/désactivable**, actif par
défaut pour la collecte et l'affichage local (R1 : ceci ne doit dépendre
d'aucun service externe pour fonctionner a minima).

**À construire** :
1. Instrumentation OpenTelemetry côté serveur (`@opentelemetry/api` +
   SDK Node — c'est une vraie nouvelle dépendance, à signaler explicitement
   dans le rapport de tâche avec sa taille et son état de maintenance, R9 ;
   c'est le standard du secteur pour ceci, écrire l'équivalent maison serait
   le genre d'abstraction que AGENTS.md décourage). Un exportateur console/
   fichier local par défaut (aucun service externe requis), un exportateur
   OTLP configurable pour envoyer vers un backend externe (Grafana, Datadog,
   etc. — n'importe lequel qui parle OTLP, jamais un fournisseur unique
   codé en dur).
2. Niveau de journalisation configurable dans les réglages (réutilise le
   store de réglages générique déjà utilisé partout ce lot) — `error` /
   `warn` / `info` / `debug`.
3. Page admin (section Exploitation) affichant les traces/logs récents
   quand la collecte est active — honnête sur ce qu'elle montre (pas un
   remplacement d'un vrai APM, une vue locale de secours).
4. **Attention à la donnée personnelle** : jamais de corps de requête brut
   ni de jeton dans une trace exportée — même discipline que le journal
   d'audit existant.

---

## Tâche 6 — Correctif d'intégrité : verrouillage du planificateur de tâches

**Bug réel confirmé pendant ce lot, pas une supposition** : `tick()`
(`packages/schema/src/scheduling/registry.ts`) lit la dernière exécution
puis décide si une tâche est due, sans verrou ni écriture atomique entre
les deux — avec plusieurs répliques du serveur, deux instances peuvent
toutes deux lire « pas encore due » puis exécuter la même tâche en même
temps. Une des sept tâches enregistrées est le balayage destructif de la
corbeille (`purgeExpired`).

**À corriger** : une prise de verrou par comparaison-et-échange (« je
réclame cette exécution si `last_run` vaut toujours X ») avant d'exécuter,
avec un test de concurrence réel (fichier SQLite, pas `:memory:` — même
discipline que le test de stock du L15) prouvant qu'avec deux connexions
simultanées, une seule exécute réellement la tâche. **Sur les trois
dialectes** (SQLite/Postgres/MySQL) — le mécanisme de verrou diffère par
dialecte, à vérifier avec l'agent `db-dialect-specialist` avant de commiter.

---

## Tâche 7 — Documentation refondue : fonctionnelle, technique, versionnée, déployée

Le retour le plus insistant du lot. Périmètre bien plus large que la
section Documentation de L21 (qui reste utile comme point de départ, à
absorber ici, pas à jeter).

**Structure à construire** :
1. **Un dossier `docs-site/` à la racine du dépôt** (nom à trancher par
   l'agent — l'important est qu'il soit versionné avec le code, commité,
   et **déployé avec le CMS** — jamais un wiki externe déconnecté du code
   qui l'accompagne), séparé en deux arborescences :
   - **Documentation fonctionnelle** — pour qui administre un site :
     chaque section de l'admin expliquée (ce que fait Contenu, Apparence,
     Boutique, IA, Comptes, Réglages — reprend et étend L21 tâche 7),
     inspirée de la structure des docs WordPress/Drupal/Strapi (pas leur
     texte — leur façon d'organiser l'information par tâche que
     l'utilisateur veut accomplir plutôt que par écran).
   - **Documentation technique** — pour qui développe : architecture
     (paquets, drivers, contrats A/B/C/D/E), comment créer un thème/
     template (avec au moins un modèle de départ téléchargeable — inspiré
     du système de thèmes WordPress : structure de fichiers imposée,
     points d'extension nommés), comment créer un plugin (le guide existe
     déjà, `docs/guide-plugin.md` — le déplacer/lier ici plutôt que le
     dupliquer), référence API REST/GraphQL/MCP, référence des contrats.
2. **Servie à deux endroits depuis la même source** : un site statique
   généré (consultable sans admin, publié avec le dépôt — GitHub Pages ou
   équivalent, à trancher) et **une vue depuis l'admin lui-même**
   (`/admin/documentation`, ce que L21 a commencé) qui sert exactement le
   même contenu — jamais deux copies qui divergent. Techniquement : un
   générateur simple (Markdown → HTML, zéro nouvelle dépendance lourde si
   évitable — vérifier ce qui existe déjà dans le monorepo, `@cogenta/seo`
   ou `@cogenta/render` ont peut-être déjà un bout de pipeline Markdown)
   dont la sortie est servie par la route `/admin/documentation` en
   développement/self-hosted **et** publiée en statique pour la doc
   publique du projet.
3. **Portée sur le numéro de version** : chaque page de doc doit pouvoir
   dire pour quelle version de Cogenta elle est correcte (lire la version
   depuis le `package.json` de `@cogenta/core`, déjà la source de vérité).
   Un site sur l'ancienne version voit la doc de l'ancienne version depuis
   son propre admin (elle est déployée AVEC le code, donc elle est
   automatiquement à la bonne version — c'est tout l'intérêt du dossier
   versionné plutôt qu'un site web séparé) ; le site public de doc du
   projet affiche la dernière version par défaut avec un sélecteur de
   version si le temps le permet.
4. **Icônes documentées** : une fois la Tâche 8 (icônes du menu) faite,
   ajouter une page qui liste chaque icône de sous-menu et ce qu'elle
   représente — pour qu'un contributeur sache quelle icône correspond à
   quel sens plutôt que de deviner.
5. **Modèles téléchargeables** : au moins un modèle de thème minimal et un
   modèle de plugin minimal (le second existe déjà, `examples/
   plugin-starter/` — le lier depuis la doc plutôt que le dupliquer), tous
   deux téléchargeables directement depuis la page technique correspondante.

**Honnêteté de portée** : ne pas prétendre à une couverture exhaustive de
chaque champ de chaque écran dans cette seule tâche — poser la structure,
le mécanisme de déploiement versionné, et couvrir les sections les plus
importantes en profondeur (Contenu, IA/Agents vu leur nouveauté dans ce
lot, création de thème, création de plugin) ; le reste peut rester à
compléter au fil de l'eau, en le disant clairement dans le rapport.

---

## Tâche 8 — Finitions d'admin : stats, dashboard, navigation, footer

Regroupe plusieurs demandes plus petites, cohérentes entre elles (toutes
sur l'ergonomie générale de l'admin) :

1. **Page Statistiques (Analytics) redessinée** : le graphique actuel est
   un SVG fait main minimal (`packages/admin/src/routes/analytics.tsx`),
   sans investissement visuel. Redessiner avec le vocabulaire visuel déjà
   posé par le thème Nightops/Atelier (L21) — cartes, hiérarchie claire,
   comparaison période sur période déjà calculée côté serveur mais mal mise
   en valeur visuellement. Rester sans nouvelle dépendance de graphique
   (R9) : un SVG fait main peut être beau, la barre actuelle ne l'est pas
   par manque de style, pas par limite technique.
2. **Widgets de dashboard : ajout/suppression, pas seulement montrer/
   cacher.** Vérifier d'abord ce que `dashboard-prefs.ts` permet déjà
   (masquer/réordonner a été mentionné dans l'historique) avant de
   construire — la demande précise est de pouvoir retirer un widget
   entièrement (pas juste le cacher) et en rajouter un plus tard depuis une
   liste, pas seulement réordonner ceux déjà affichés.
3. **Réorganisation du menu admin** : un écran (section Réglages) pour
   réordonner les sections/entrées du menu latéral et masquer celles non
   pertinentes pour un site donné (l'exemple donné : masquer Boutique sur
   un site portfolio). Persisté par site, pas par navigateur (contrairement
   au `sidebarCollapsed`/`groupOpen` actuels qui sont volontairement par
   appareil) — un nouveau réglage dans le store générique déjà réutilisé.
4. **Pied de page et barre du haut professionnels** : le pied de page
   actuel (`app-shell__footer`) est un simple texte centré. Redessiner
   avec le nom, le numéro de version (lu depuis `@cogenta/core`'s
   `package.json`), le logo — cohérent avec le travail de marque de L21
   tâche 8. Le numéro de version doit aussi apparaître côté site public
   (footer) si l'utilisateur a laissé la marque Cogenta active.
5. **Lien rapide vers le site public** : un bouton « Voir le site » dans
   la barre du haut ou le pied de page de l'admin, ouvrant la racine du
   site dans un nouvel onglet.
6. **Icônes du menu latéral** : audit de chaque icône de sous-menu contre
   son libellé réel — remplacer celles qui ne représentent pas clairement
   leur contenu (constat direct de l'utilisateur). Documenté par la Tâche 7
   une fois fait.

---

## Tâche 9 — Système de mise à jour

**À construire** (nouvelle commande CLI + écran admin, section
Exploitation) :
1. Vérification de version disponible (compare la version installée à la
   dernière publiée sur npm — `@cogenta/core` et `@cogenta/cli` sont déjà
   la source de vérité de version).
2. Mise à jour en un clic depuis l'admin (ou `cogenta update` en CLI) —
   **avec un point de restauration obligatoire avant toute mise à jour**
   (réutilise `backup create`/`restore apply`, déjà réels depuis L9 fiche
   26), jamais une mise à jour sans filet.
3. Réglage : mise à jour automatique activable, avec un choix fermé
   (patch seul / patch+mineure / tout y compris majeure) — respecte le
   versionnage sémantique déjà en usage dans ce monorepo.
4. Avant d'appliquer : notifier le risque si la mise à jour touche un
   contrat A/B/C/D/E (changement cassant déclaré dans le changeset du
   paquet concerné — l'information existe déjà dans les changesets publiés,
   la lire plutôt que la deviner) ; proposer d'annuler.
5. Historique des mises à jour et des points de restauration, consultable
   depuis le même écran.

**Portée honnête** : `cogenta build`/`deploy` restent hors de portée de ce
lot (toujours honnêtement différés depuis L9) — cette tâche couvre la mise
à jour des paquets npm d'un site déjà installé, pas un pipeline de
déploiement complet.

---

## Tâche 10 — Modèles de site à l'installation, complète l'onboarding

Complète ce que `create-cogenta` fait déjà (blueprints existants : blank,
blog, etc.) avec de vrais préréglages par **type de site** plutôt que par
seul blueprint de contenu : portfolio, magazine, boutique en ligne —
chacun avec un jeu de collections de départ réaliste (pas juste un
blueprint de contenu vide), un skin de départ cohérent avec le type de
site, et les réglages de sécurité/cache déjà différenciés par type depuis
L19 tâche 8 étendus si besoin. À l'installation, le choix du fournisseur
LLM/modèle par défaut (déjà proposé, L9 tâche 9) reste à sa place ; vérifier
qu'il pointe maintenant vers l'écran Providers de la Tâche 1bis plutôt que
vers un mécanisme séparé.

---

## Notes transverses pour les agents

- **Contrats A/B/C/D/E figés** — si une tâche découvre qu'elle en a
  réellement besoin (p. ex. un skill ou un widget de dashboard comme
  nouveau type de contenu), vérifier d'abord si un mécanisme générique déjà
  existant (store de réglages, contrat C) peut porter le besoin avant de
  proposer une extension de contrat. S'arrêter et signaler plutôt que de
  contourner.
- **R6** : aucune action d'agent sans être journalisée, diffée quand
  pertinent, réversible ou explicitement marquée non réversible avec
  validation humaine (l'autonomie `report-only`/`co-pilot`/`autopilot` de
  la Tâche 1 est le mécanisme qui porte cette règle, pas une couche à
  part).
- **R9/R10** : toute dépendance nouvelle (OpenTelemetry SDK, un
  éventuel `@langchain/langgraph` refusé plus haut, une bibliothèque de
  chat) signalée dans le rapport de fin de tâche avec sa raison, sa taille,
  son état de maintenance.
- Tester dans le navigateur contre `examples/local-playground` avant de
  rendre compte, comme pour L21.
- Changeset écrit pour tout paquet publié touché.
