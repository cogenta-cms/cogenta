# 30 — Agents et assistant IA

> **État** : partiel — et un constat gênant qu'il faut poser d'emblée.
> **Écrans** : `routes/agents.tsx` (209), `routes/assistant-chat.tsx` (176),
> `routes/duplicates.tsx` (205), `routes/site-plan.tsx` (425),
> `assist/` (4 panneaux dans l'éditeur)
> **Paquets** : `@cogenta/agents`, `@cogenta/agents-builtin`, `@cogenta/mcp`,
> `@cogenta/channels`
> **Effort** : 5–6 jours (sans le point 1 ci-dessous, qui est un autre projet)
> **ADR requise** : non pour les écrans

---

## 1. Le constat à poser d'abord

**Aucun `AgentRegistry` vivant n'existe nulle part dans ce dépôt.** Le même constat est
répété honnêtement dans les résumés de L5, L7, L8 et L9 : *activer un agent dans
l'admin ne le fait pas tourner*.

Donc `routes/agents.tsx` — état, autonomie, budget, historique, traces — est un écran
qui pilote quelque chose qui ne s'exécute pas. Ce n'est pas un bug d'écran ; c'est une
capacité manquante du produit, et elle dépasse largement le périmètre d'une fiche
d'admin.

**Cette fiche ne prétend pas la construire.** Elle fait deux choses : (a) rendre
l'écran honnête tant que le runtime n'existe pas, et (b) finir les surfaces
d'assistant qui, elles, fonctionnent réellement.

Ce qui fonctionne réellement, et c'est beaucoup :

- **15 outils du contrat C**, tous `sideEffects: false`, toute sortie portant
  `applied: false` en **littéral** — le type d'un outil d'assistant ne peut donc pas
  affirmer qu'il a modifié quoi que ce soit (R6).
- `assist.chat` avec RAG dont **les citations viennent de la récupération, jamais du
  modèle** : le modèle nomme des indices dans les passages qu'on lui a montrés, le code
  les remappe, un indice inventé ne résout rien.
- `recommendedAction` en union fermée `none`/`review` : aucune réponse, si
  jailbreakée soit-elle, ne peut décrire une suppression.
- `assist.find_duplicates` **ne demande aucun fournisseur IA** (embedder local) — prouvé
  de bout en bout.
- Un **vrai test d'injection de prompt** avec un fournisseur réglé pour obéir
  entièrement, et onze assertions sur ce qui se passe quand même.
- L19 en entier : analyse de cahier des charges, plan de site, validation élément par
  élément, sans jamais de « tout accepter ».
- **R2 tenu partout** : sans fournisseur, `GET /api/assistant` répond
  `200 {available:false}` et les panneaux disparaissent — pas une erreur, pas une
  incitation.

## 2. Ce que font les CMS de référence

| Fonction | WordPress (Jetpack AI) | Strapi | Sanity | Cogenta |
|---|---|---|---|---|
| Génération / réécriture de texte | ✅ | plugin | ✅ | ✅ |
| Traduction | ✅ | plugin | ✅ | ✅ |
| Génération d'images | ✅ | ❌ | ❌ | ✅ |
| Modération | ❌ | ❌ | ❌ | ✅ |
| Recherche sémantique / RAG | ❌ | ❌ | partiel | ✅ |
| Détection de doublons **sans IA** | ❌ | ❌ | ❌ | ✅ **unique** |
| Génération d'un site depuis un document | ❌ | ❌ | ❌ | ✅ **unique** |
| Agents autonomes qui exploitent le site | ❌ | ❌ | ❌ | **promis, pas exécuté** |
| Fonctionne entièrement sans IA | — | — | — | ✅ (R2) |

## 3. Écarts, classés

### Bloquants

1. **L'écran des agents pilote un runtime absent.** Il faut le dire à l'écran. C'est un
   problème d'honnêteté, pas de fonctionnalité — et l'honnêteté est explicitement une
   valeur de ce projet.

### Importants

2. **Les surfaces d'assistant sont dispersées.** Panneau de rédaction, classification,
   modération, FAQ/Schema.org dans l'éditeur ; chat et doublons en écrans séparés ;
   plan de site ailleurs. Aucune vue d'ensemble de ce que l'IA peut faire sur ce site.
3. **Aucun budget ni coût visible.** Le runtime agentique a une notion de budget ;
   l'usage réel des outils d'assistant, lui, n'est chiffré nulle part. Sur un service
   facturé au jeton, c'est une information nécessaire.
4. **Le panneau d'assistant ne couvre que les champs `text`.** Le texte riche est exclu,
   pour une bonne raison documentée (réinsérer une suggestion dans un portable-text
   sans détruire marques et liens est un vrai travail) — mais c'est le champ principal
   d'un article.
5. **Aucune trace consultable** des actions d'assistant. R6 exige que toute action
   d'agent soit journalisée et diffée ; les outils d'assistant ne modifient rien
   d'eux-mêmes, mais l'acceptation d'une suggestion, elle, modifie — et devrait être
   traçable comme telle.

### Confort

6. Pas de sélection du modèle par tâche.
7. Pas d'historique de conversation dans le chat.

## 4. Plan de développement

### Tâche 1 — Rendre l'écran des agents honnête

**Fichiers** : `routes/agents.tsx`.

Un bandeau clair : « Le runtime d'agents n'est pas actif sur cette installation. Cet
écran montre la configuration ; aucun agent ne s'exécute. » Avec un lien vers ce qui
est réellement disponible (les outils d'assistant), et vers la documentation.

Retirer, ou marquer explicitement comme inertes, les contrôles qui n'ont aucun effet.
Un interrupteur qui ne fait rien est pire qu'un interrupteur absent.

**Critère** : personne ne peut croire, en regardant cet écran, qu'un agent tourne.

### Tâche 2 — Écran « Assistant » unifié

**Fichiers** : nouvelle route `packages/admin/src/routes/assistant.tsx`,
`shell/nav-items.ts`.

Une page qui liste **les outils réellement disponibles** sur cette installation, lus
depuis `GET /api/assistant` — jamais une liste codée en dur, qui mentirait selon la
configuration. Pour chacun : ce qu'il fait, où il s'utilise (avec un lien direct), s'il
a besoin d'un fournisseur.

Le chat et les doublons deviennent des onglets de cette page plutôt que des entrées de
navigation séparées.

Et, sans fournisseur : une page qui **explique comment en configurer un**, plutôt que
de disparaître. C'est le seul endroit où l'absence de fournisseur mérite d'être
expliquée — ailleurs, R2 impose la disparition silencieuse.

### Tâche 3 — Coût et usage

**Fichiers** : `packages/agents/src/`, `packages/api/src/rest/assistant-router.ts`,
écran.

Compteur d'appels et de jetons par outil et par période, plafond mensuel configurable
avec un refus propre au dépassement, et un signal à 80 %.

Un plafond qui refuse est indispensable : sans lui, une boucle dans un panneau
d'assistant peut coûter cher en une nuit.

### Tâche 4 — Assistant sur le texte riche

**Fichiers** : `assist/assistant-panel.tsx`, `rich-text/`.

C'est un vrai travail, pas un élargissement de filtre. Approche recommandée : opérer
sur la **sélection courante** dans l'éditeur riche, et remplacer exactement cette
sélection, en conservant les marques adjacentes. Cela évite complètement la question
« où dans le document mettre la suggestion ».

Prévisualisation avant acceptation, et acceptation qui passe par le mécanisme
d'annulation de l'éditeur — pour qu'un `Ctrl+Z` défasse la suggestion.

**Critère** : sélectionner un paragraphe, demander une reformulation, l'accepter, et
l'annuler d'un `Ctrl+Z`, sans perdre un lien.

### Tâche 5 — Traçabilité

**Fichiers** : `assist/`, journal d'audit (fiche [21](21-journal-d-audit.md)).

Chaque acceptation de suggestion produit une entrée d'audit : quel outil, quel modèle,
quel champ, quel acteur. Et le contenu généré doit porter `provenance: 'generated'`
avec son `provenanceDetail` — L19 le fait déjà pour le contenu de démonstration, et la
raison donnée reste valable : c'est le seul champ du contrat A que le cadre européen
sur l'IA rend obligatoire.

**Critère** : le journal d'audit distingue un paragraphe écrit d'un paragraphe accepté
d'une suggestion.

### Tâche 6 — Vecteurs et RAG, visibles

**Fichiers** : fiche [24](24-sante-et-outils.md), écran assistant.

L'index vectoriel (L18) est invisible. Afficher : driver actif (`pgvector` / `file` /
`memory`), nombre d'entrées indexées, dernière indexation, et le bouton de réindexation
de la fiche 24. Un chat RAG qui répond mal parce que l'index est vide doit être
diagnosticable.

Rappel du dossier `BLOCKERS.md` §8 : `pgvector` n'a **jamais été exécuté**, il n'existe
**aucun adaptateur d'embeddings distant**, et l'indexation est d'**un chunk par
entrée** plutôt qu'un vrai découpage. L'écran doit refléter cet état, pas le masquer.

## 5. Critères d'acceptation

- Aucun écran ne laisse croire qu'un agent s'exécute alors qu'aucun runtime n'existe.
- La liste des outils vient du serveur, jamais d'une constante.
- Sans fournisseur, tout le CMS fonctionne (R2) et une seule page explique pourquoi
  l'IA est absente.
- Un plafond de dépense refuse proprement.
- Toute suggestion acceptée est tracée et marquée `generated`.
- Aucun outil ne peut prétendre avoir modifié quelque chose (`applied: false` en
  littéral — propriété à ne pas régresser).

## 6. Tests exigés

- Composant : chaque surface disparaît quand `GET /api/assistant` répond
  `available: false`.
- Bout en bout : `assist.find_duplicates` fonctionne **sans aucun fournisseur** (test
  existant, à ne pas régresser).
- Sécurité : rejouer le test d'injection de prompt après toute modification du
  contexte (`packages/agents/test/assist/chat-injection.test.ts`).
- Unitaires : plafond de dépense atteint → refus propre.
- Bout en bout : suggestion acceptée sur un texte riche, annulée par `Ctrl+Z`, sans
  perte de marque.
- Permissions : les panneaux ne s'affichent que pour un acteur qui peut écrire.

## 7. Pièges connus

- **Un écran qui pilote un runtime absent est un mensonge.** C'est le seul endroit de
  l'admin où cela se produit ; le corriger est prioritaire sur tout ajout.
- **R2 est non négociable.** Aucune fonctionnalité de contenu, d'admin ou de rendu ne
  doit dépendre d'une clé d'API.
- **R8** : le contenu du site passé à un modèle est de la donnée. Le canal `data` et
  l'échappement sont ce qui tient ; toute nouvelle surface doit passer par le même
  `assembleContext`.
- **R6** : `applied: false` est un littéral de type. Toute évolution qui le rendrait
  variable annulerait la garantie.
- **Les citations viennent de la récupération.** Un raccourci qui laisserait le modèle
  fournir une URL casserait la propriété centrale d'`assist.chat`.
- **Le coût est invisible jusqu'à la facture.** Le plafond n'est pas un confort.

## 8. Décisions à prendre

- Runtime d'agents : hors périmètre de cette fiche. À planifier séparément, en
  reconnaissant que c'est la promesse centrale du produit et le plus gros écart entre
  le discours et le code.
- Plafond de dépense par défaut : une valeur non nulle (recommandé) plutôt
  qu'illimité.
