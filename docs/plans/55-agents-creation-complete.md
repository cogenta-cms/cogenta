# 55 — Agents IA : création complète

> **État** : modifier/supprimer/afficher un agent fonctionne déjà bien. La
> **création** ne demande qu'un nom — tout le reste (provider codé en dur à 3
> options, aucun choix de modèle, aucun prompt système explicite) doit être
> complété après coup en repassant par « Éditer ».
> **Fichiers** : `packages/admin/src/routes/agents.tsx`,
> `packages/agents/src/agents/{store,types}.ts`,
> `packages/agents/src/identity/markdown.ts`
> **Effort** : 2 jours (hors fiches 45/56, en réutilisant leurs briques)
> **ADR requise** : non — ajout additif au contrat C (`tools@1.x`), `contract-guardian`
> à consulter avant fusion

---

## 1. Ce qui existe réellement

**Création** (`submitCreate`, ligne 221) : un seul champ, le nom. Le reste est posé
à des valeurs par défaut fixes : `identity: { role: ..., objectives: [] }`,
`model: { preferred: 'anthropic' }`, `tools: []`, `autonomy: { default: 'propose' }`.

**Édition** permet `role`/`objectives`/`style` (texte libre) — mais **pas de
« prompt système »** au sens LLM ; format plus pauvre que les `identity.md`
volumineux des agents intégrés.

`model.preferred` est un `<Select>` **codé en dur avec 3 options** (`anthropic`/
`openai`/`google`) — ne lit jamais les fournisseurs réellement configurés, et ne
permet aucun choix de **modèle** (stocké par fournisseur, pas par agent).

`tools`, `skills`, `subagents`, `autonomy`, `budget` sont déjà correctement
éditables. Affichage/suppression déjà présents, y compris le refus
`AGENT_BUILTIN_UNDELETABLE` pour les agents intégrés.

## 2. Plan de développement

**Tâche 1** — `AgentDeclarationInput`/`StoredAgentIdentity` (`agents/store.ts`,
`types.ts`) : ajouter `systemPrompt?: string` explicite, distinct de `role`/
`objectives`/`style` — quatrième section `## System prompt` dans
`renderIdentityMarkdown`/`parseIdentityMarkdown`, repli sur le format actuel si
absent (compat ascendante).

**Tâche 2** — `AgentModelPreference` (`agents/types.ts`) : ajouter `readonly
model?: string` (nom de modèle explicite), champ optionnel additif.

**Tâche 3** — Formulaire de création étendu (`submitCreate`) : nom, provider (lu
dynamiquement depuis `GET /api/providers`, plus d'`<option>` en dur), modèle, et un
choix « écrire le prompt système » vs « le générer » (bouton appelant le template
`generate_agent_system_prompt` de la fiche 45 — l'utilisateur répond à quelques
questions ou colle une description, le modèle produit un `role`/`objectives`/
`systemPrompt` structuré, l'humain relit et valide avant enregistrement, jamais
d'application automatique — R6).

**Tâche 4** — `<Select>` de provider dans le formulaire d'édition : remplacer les 3
options codées en dur par une lecture de `listProviders(token)` filtrée sur
`enabled: true`.

**Tâche 5** — Fiche d'agent enrichie : afficher le prompt système (tâche 1) et le
modèle précis (tâche 2) dans la vue lecture seule déjà complète par ailleurs.

## 3. Critères d'acceptation

- Créer un agent permet de choisir nom, fournisseur, modèle et prompt système
  (écrit ou généré) en une seule fois.
- Un fournisseur non configuré n'apparaît jamais comme choix possible.
- Le prompt système généré n'est jamais appliqué sans relecture explicite.

## 4. Tests exigés

- Contrat : `AgentDeclaration` avec et sans `model`/`systemPrompt` valide toujours,
  compat ascendante prouvée sur un agent créé avant cette fiche.
- Bout en bout : création complète, vérification que le prompt système apparaît
  ensuite dans la fiche d'agent.
- R6 : la génération de prompt système ne modifie jamais l'agent sans confirmation
  explicite.

## 5. Pièges connus

- Ne pas changer la signature d'un outil contrat C existant — les ajouts sont
  strictement additifs.
- Le format `identity.md` doit rester lisible par un agent créé avant cette fiche
  (pas de section `## System prompt`) — repli, jamais d'erreur de lecture.

## 6. Décisions à trancher

Aucune — dépend des fiches 45 (Prompt Settings) et 56 (catalogue de fournisseurs),
sans quoi le `<Select>` de provider reste dynamisé sur les 3 fournisseurs actuels
seulement (dégradé acceptable en attendant).
