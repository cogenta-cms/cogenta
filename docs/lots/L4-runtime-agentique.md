# L4 — Runtime agentique

## Objectif

Le sous-système multi-agents, dans le noyau. Identité hiérarchique, outils à
permissions, sous-agents, skills, mémoire, budgets, autonomie, audit, traces, RAG, MCP.

C'est le wedge du produit. C'est aussi le lot le plus dense.

## Dépendances

L1. **Contrat C (outil agentique) figé avant de commencer.**

## Périmètre

- Boucle d'exécution : appel de modèle, tool-calling, reprises, timeouts, streaming
- Hiérarchie d'identité à quatre niveaux
- Registre d'outils et vérification de permissions
- Sous-agents avec sous-ensemble strict d'outils
- Skills chargés à la demande
- Les quatre mémoires
- Budgets, quotas, kill switch
- Niveaux d'autonomie par agent et par outil
- File d'approbation humaine
- Journal d'audit à chaînage de hash
- Traces rejouables
- Abstraction fournisseurs LLM et embeddings locaux
- RAG hybride avec filtrage de permissions
- Serveur MCP et client MCP
- Bac à sable

## Arborescence

```
packages/
├── agents/
│   ├── src/
│   │   ├── runtime/       # boucle, tool-calling, reprises
│   │   ├── identity/      # constitution, contexte site, identité, tâche
│   │   ├── tools/         # registre, permissions, outils du noyau
│   │   ├── skills/
│   │   ├── memory/
│   │   ├── budget/
│   │   ├── autonomy/      # niveaux, file d'approbation
│   │   ├── audit/
│   │   ├── trace/
│   │   ├── providers/     # anthropic, openai, google, ollama, compatibles
│   │   ├── rag/           # découpage, embeddings, hybride, filtrage
│   │   └── sandbox/
└── mcp/                   # serveur et client MCP
```

## Points de conception

### Hiérarchie d'autorité

Le contexte envoyé au modèle est assemblé dans cet ordre, avec balisage explicite :

```
[CONSTITUTION]      immuable, jamais surchargeable
[SITE]              marque, ton, langues, contraintes
[AGENT]             rôle, objectifs, style
[TASK]              instruction éphémère
[DATA]              contenu externe — toujours balisé comme donnée
```

**Un niveau inférieur ne peut jamais élargir les permissions d'un niveau supérieur.**
Cette règle n'est pas appliquée par le prompt : elle est appliquée par le registre
d'outils, qui ignore ce que le modèle demande s'il n'a pas la permission.

Tout contenu externe — commentaire, import, page web récupérée — entre dans `[DATA]`,
jamais ailleurs. C'est vérifié par test avec un jeu de charges d'injection.

### Outils et permissions

Le runtime vérifie les permissions **avant** l'appel, à partir du manifeste. L'outil
lui-même n'a aucun contrôle d'accès. Un outil ne reçoit jamais de secret : les
identifiants sont injectés dans des clients pré-configurés.

Tout appel produit une entrée d'audit : acteur, agent, outil, entrée, sortie, diff,
coût, durée.

### Sous-agents

`subagent.tools ⊆ parent.tools`, vérifié **au démarrage** du runtime, pas à
l'exécution. Une déclaration invalide empêche l'agent de se charger. Le sous-agent a son
propre contexte et son propre budget ; son échec ne pollue pas le parent.

### Skills

Un skill est un dossier : un fichier d'instructions plus des ressources. Il est chargé
**à la demande**, sur décision du runtime selon la tâche, pas concaténé en permanence.
Versionné, installable, listable.

### Mémoire

Quatre types (voir `02-architecture.md` §4.6). Deux règles dures :

- **Jamais de mémoire partagée entre deux sites.** Vérifié par test.
- **Politique d'oubli obligatoire.** Consolidation périodique, purge configurable. Une
  mémoire qui ne fait que croître devient du bruit coûteux.

Le signal d'apprentissage vient de l'humain : chaque proposition acceptée, modifiée ou
rejetée est stockée et réinjectée.

### Autonomie et approbation

Quatre niveaux, réglables par agent **et** par outil : `observe`, `propose`,
`execute_with_approval`, `autonomous`.

Un outil `sideEffects: true` sans `revert` **force** l'approbation humaine, quel que
soit le niveau configuré. `autonomous` sur un outil destructif exige une confirmation
explicite à l'activation, avec avertissement.

La file d'approbation est consultable dans l'admin et actionnable depuis un canal (L6).

### Budgets

Tokens par jour, euros par mois, appels par heure, durée maximale par run. Dépassement =
**arrêt propre et alerte**, jamais dégradation silencieuse. Le coût réel est mesuré par
appel et agrégé.

### RAG

Ingestion incrémentale : événement de publication → découpage sémantique par bloc et par
titre → hash par chunk → ré-embedding des seuls chunks modifiés.

Récupération hybride BM25 + vectoriel fusionnés par RRF.

**Filtrage de permissions au moment de la requête** — non négociable. Un test dédié
vérifie qu'aucun brouillon, contenu privé ou contenu d'un autre site ne peut remonter.

Embeddings locaux par défaut (`multilingual-e5-small`, ONNX, CPU). L'index porte
`{provider, model, dimensions}`. Changer de modèle crée un index parallèle, réindexe en
tâche de fond, bascule à la fin, conserve l'ancien pour rollback.

### MCP

Le registre d'outils **est** le serveur MCP : aucun travail supplémentaire, seulement
une exposition. Le client MCP permet aux agents de consommer des serveurs tiers, avec
les mêmes permissions déclarées que les outils internes.

### Bac à sable

Un agent peut être exécuté contre une copie du site, en lecture réelle et écriture
simulée, avec production des diffs qu'il aurait appliqués. C'est le prérequis à toute
activation en autonomie.

## Tâches, dans l'ordre

1. Abstraction fournisseurs LLM et normalisation du tool-calling
2. Boucle d'exécution : appel, outils, reprises, timeouts, annulation
3. Assemblage du contexte et hiérarchie d'identité
4. Registre d'outils, manifeste, vérification de permissions
5. Outils du noyau : `content.*`, `media.*`, `site.config_read`, `http.fetch`
6. Journal d'audit à chaînage de hash
7. Traces : capture, stockage, relecture
8. Budgets, quotas, kill switch
9. Niveaux d'autonomie et file d'approbation
10. Réversibilité : `revert`, reçus, diffs
11. Sous-agents et vérification du sous-ensemble d'outils
12. Skills : format, chargement à la demande, versionnement
13. Mémoire : les quatre types, consolidation, oubli, isolation par site
14. Embeddings locaux ONNX
15. Découpage sémantique et ingestion incrémentale
16. Recherche hybride, RRF, filtrage de permissions
17. Serveur MCP
18. Client MCP
19. Bac à sable
20. Harnais d'évaluation rejouable en CI
21. Redaction des données personnelles avant envoi

## Critères d'acceptation

- **Le CMS fonctionne intégralement sans aucune clé API configurée.** Vérifié par une
  suite entière jouée sans fournisseur.
- Un agent sans la permission d'un outil ne peut pas l'appeler, quel que soit le prompt
- Un jeu de charges d'injection de prompt via commentaires et imports ne provoque aucune
  action non autorisée
- Un sous-agent déclarant un outil absent du parent empêche le chargement de l'agent
- Un dépassement de budget arrête l'agent proprement et alerte
- Toute action à effet de bord est réversible ou exige une approbation
- Le journal d'audit détecte toute suppression d'entrée
- Le RAG ne remonte jamais un brouillon ni un contenu d'un autre site
- Un changement de modèle d'embedding n'interrompt pas la recherche
- Le serveur MCP est utilisable depuis un client MCP tiers

## Tests exigés

| Type | Portée |
|---|---|
| Sécurité | Corpus d'injection de prompt, résultat attendu : aucune action |
| Sécurité | Tentative d'escalade par délégation |
| Sécurité | Fuite RAG : brouillon, contenu privé, autre site |
| Unitaire | Vérification de permissions, assemblage de contexte, budgets |
| Intégration | Cycle complet d'un agent avec fournisseur simulé et réel |
| Audit | Détection de falsification du journal |
| Dégradé | Suite complète sans fournisseur LLM |
| Évaluation | Jeu de cas rejoué, score comparé entre versions de prompt |

## Pièges connus

**Le tool-calling n'est pas normalisé entre fournisseurs.** Formats, noms, gestion des
appels parallèles : tout diffère. L'abstraction doit être conçue avec au moins trois
fournisseurs en tête dès le premier jour.

**Les boucles infinies.** Un agent qui s'appelle indéfiniment. Profondeur maximale,
nombre d'étapes maximal, détection de répétition.

**Le coût explose silencieusement.** Mesurer par appel dès la première ligne, pas après
la première facture.

**ONNX et les modèles locaux.** Le téléchargement du modèle à la première utilisation
doit être explicite, avec barre de progression, et jamais bloquant au démarrage.

**Les traces sont volumineuses.** Rétention et échantillonnage configurables dès le
départ.

## Hors périmètre

Les agents eux-mêmes (L5), les canaux (L6), les plugins tiers (L7).
