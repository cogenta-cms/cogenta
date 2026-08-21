---
title: Travailler avec l'IA et les agents
order: 5
---

# Travailler avec l'IA et les agents

Cogenta est un **CMS agentique** : le runtime multi-agents fait partie du
noyau, pas d'un plugin ajouté après coup. Cette page couvre ce qui existe
réellement aujourd'hui dans cette version, et distingue clairement ce qui est
prévu mais pas encore livré — la promesse la plus importante de tout ce
document est de ne jamais faire croire qu'un écran fait plus que ce qu'il
fait.

**Règle qui traverse toute cette section (R2) : rien ici n'est obligatoire.**
Sans fournisseur IA configuré, le CMS entier fonctionne — contenu, admin,
rendu public — à l'identique. Seuls les écrans de cette page perdent leur
utilité (ils le disent, jamais une erreur qui donne l'impression d'une panne).

## L'assistant (`/assistant`)

Un panneau de recherche et de génération assistée, construit sur un vrai
pipeline RAG (recherche hybride, citations qui viennent toujours de ce qui a
été réellement récupéré — jamais inventées par le modèle, même si on
essaie de le pousser à le faire). Ce que l'assistant peut faire :

- **Discuter** avec vos propres contenus comme source, citations à l'appui.
- **Générer, réécrire, traduire** un brouillon — jamais publié
  automatiquement : chaque suggestion attend une confirmation humaine
  explicite avant d'être appliquée.
- **Classer, détecter des doublons, modérer, rédiger une FAQ ou des données
  structurées** — chaque outil dit honnêtement, dans sa sortie, qu'il n'a
  rien modifié par lui-même (`applied: false`, toujours).

Aujourd'hui, l'index qui alimente ce panneau se construit **automatiquement**
depuis le contenu publié du site — rien à indexer à la main, et rien de
brouillon n'y entre jamais. Ce qui manque encore, et que ce même écran est
censé apporter : un état visible de ce qui est indexé, la possibilité
d'exclure une collection précise (l'exemple donné : garder les articles
publiés hors de l'index si vous préférez que l'assistant s'appuie sur autre
chose), et un flux pour téléverser des documents additionnels (PDF, DOCX,
texte) — le tout écrit ailleurs et pas encore branché sur cet écran.

## Fournisseur IA

Aujourd'hui, le fournisseur IA et sa clé API se configurent **à
l'installation** (`npm create cogenta`), une seule fois — la clé n'est
ensuite jamais réaffichée en clair. Un écran dédié dans l'admin pour
activer plusieurs fournisseurs après coup, en choisir le modèle par défaut,
et laisser chaque agent le surcharger individuellement, est prévu (voir
« Ce qui change » ci-dessous) mais pas encore livré dans cette version —
sans lui, changer de fournisseur passe encore par la configuration du
serveur, pas par l'admin.

## Agents (`/agents`)

L'écran actuel liste les agents déclarés, permet de les activer/désactiver,
et affiche pour chacun l'historique de ses exécutions passées et le détail
de ses permissions — la même taxonomie fermée que les outils du contrat C
(« lire le contenu », « publier », « modifier les réglages », …), jamais un
accès générique.

### Ce qui change avec le lot en cours (à vérifier contre la version que vous utilisez)

Au moment où cette page est écrite, un chantier en cours (« le runtime
d'agents, enfin vivant ») ajoute une vraie **boucle d'exécution** — jusqu'ici,
activer un agent déclarait son intention sans le faire réellement tourner.
Ce que ce chantier prévoit d'apporter à cet écran, une fois livré :

- Un agent par défaut, le **superagent** (« Cogenta Agent »), actif dès
  l'installation avec accès à l'ensemble des outils que le rôle `admin`
  autorise — sans fournisseur IA configuré, il existe en configuration mais
  ne tente jamais le moindre appel réseau (R2, encore).
- Des **sous-agents nommés**, créés par vous, chacun avec son propre
  sous-ensemble d'outils, son propre budget et son propre niveau
  d'autonomie ; le superagent peut en appeler un explicitement nommé, jamais
  « tous les agents ».
- Trois **niveaux d'autonomie**, appliqués pour de vrai : `report-only`
  (l'agent remonte de l'information, n'écrit jamais rien), `co-pilot`
  (l'agent propose, une confirmation humaine applique), `autopilot` (l'agent
  applique lui-même, mais jamais au-delà de ce que le contrat d'outils et le
  rôle de l'acteur autorisent déjà).
- Deux agents intégrés supplémentaires, désactivés par défaut : un agent de
  sécurité (scan de dépendances et de journaux, ne corrige jamais seul) et
  un agent générique de veille de contenu, livré comme modèle éditable.
- Un sous-écran **Skills** : un skill est un texte d'instruction nommé
  (« comment rédiger un article », « revue de sécurité », …) qu'un agent
  charge dans son contexte ; un nouvel agent hérite par défaut de tous les
  skills du site, avec possibilité d'en exclure certains.
- Un sous-écran **Fournisseurs** : activation de plusieurs fournisseurs IA
  après l'installation, avec une clé API qui n'est **plus jamais réaffichée
  en clair** une fois enregistrée (un masque, comme un mot de passe), et un
  modèle par défaut par fournisseur — que chaque agent peut surcharger
  individuellement.

Si vous ne voyez pas encore ces éléments dans votre admin, c'est que votre
installation tourne sur une version antérieure à ce chantier — cette page
sera mise à jour et republiée avec le code une fois qu'il sera livré,
exactement comme le reste de cette documentation.

## Canaux et discussion (à venir avec le même chantier)

Une discussion en temps réel avec un agent, depuis un widget flottant dans
l'admin, ou depuis Telegram/Slack/Discord une fois un compte lié — toujours
avec la règle centrale : **une commande reçue par un canal s'exécute avec les
permissions de l'humain identifié, jamais celles de l'agent lui-même.** Une
API de discussion, avec sa propre clé, permet d'intégrer un agent ailleurs
sans jamais lui accorder plus de droits que le canal qui l'appelle.

## L'agent qui surveille le site (à venir)

Un agent avec accès aux journaux du site — jamais au code source — qui
détecte une anomalie (des 404 répétées sur une page qu'un lien externe cible
encore, par exemple), résume et remonte l'information, puis, selon le niveau
d'autonomie configuré, propose ou applique une mesure corrective bornée
(une redirection, jamais un changement de code).
