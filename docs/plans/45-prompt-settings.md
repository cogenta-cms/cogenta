# 45 — Prompt Settings (bibliothèque de prompts utilitaires)

> **État** : absent — chaque prompt utilitaire est une chaîne littérale codée en
> dur, dispersée dans le code. Fondation partagée par les fiches 43 (bouton IA sur
> bloc), 44 (extrait) et 55 (génération du prompt système d'un agent).
> **Fichiers** : nouveau `packages/agents/src/prompts/`, nouveau
> `packages/api/src/rest/prompt-templates-router.ts`, nouveau
> `packages/admin/src/routes/prompt-settings.tsx`
> **Effort** : 2–3 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Aucun système n'existe. Chaque prompt utilitaire est une chaîne littérale codée en
dur : `packages/agents/src/assist/writing.ts` (rewrite, proofread, summarise,
alt_text, faq_draft, schema_org_draft — 8 blocs `instruction: [...]`),
`packages/agents/src/assist/classify.ts`, `faq.ts`, `chat.ts` (système RAG). Aucun
de ces textes n'est éditable ni consultable depuis l'admin ; les modifier exige un
déploiement de code. `packages/agents/src/eval/compare-prompt-versions.ts` sert
l'évaluation A/B d'un prompt donné, pas une bibliothèque de templates.

## 2. Diagnostic

Fondation manquante, pas un simple écran. Trois besoins convergent dessus : bouton
« Générer » sur un bloc texte du page builder (fiche 43), bouton d'extrait (fiche
44, déjà réalisable sans cette fondation via `assist.summarise` direct — à migrer
ensuite), génération du prompt système d'un agent (fiche 55, façon « skill
creator »).

## 3. Plan de développement

### Tâche 1 — Store de templates

**Fichiers** : nouveau `packages/agents/src/prompts/store.ts`.

`PromptTemplateStore` (interface) + `createFilePromptTemplateStore` (un fichier par
template — même tier « réel mais local » que `agents/store.ts`/`skills/library.ts`,
R1). Champs : `id`, `name`, `description`, `category` (texte/traduction/agent/
image/…), `template` (texte avec placeholders `{{champ}}`), `builtin`, `createdAt`/
`updatedAt`.

**Critère** : suite de contrat identique à celle de `AgentSkillStore` (create/read/
update/remove/list), zéro dépendance nouvelle.

### Tâche 2 — Seeds « ultra pro »

Au minimum `generate_text_block` (bouton bloc texte, fiche 43), et
`generate_agent_system_prompt` (fiche 55). Migrer les prompts déjà en dur de
`writing.ts`/`classify.ts`/`faq.ts` vers ce store **comme builtins**, pour ne pas
dupliquer une source de vérité — sinon éditer « rewrite » depuis l'admin n'aurait
aucun effet réel (piège déjà évité pour les skills en L24).

Chaque template seedé doit être rédigé avec le même soin qu'un `identity.md`
d'agent intégré : rôle explicite, contraintes, format de sortie attendu, exemples
courts si utile — jamais une phrase vague de deux lignes.

**Critère** : chaque outil `assist.*` existant lit désormais son texte depuis le
store, avec repli sur la constante d'origine si le store est vide (site jamais
migré) — sans changer la signature contrat C de l'outil (le prompt reste un détail
d'implémentation interne).

### Tâche 3 — Route API

**Fichiers** : `packages/api/src/rest/prompt-templates-router.ts`.

`GET`/`POST`/`PUT`/`DELETE`, écriture réservée à `admin`, lecture ouverte à tout
acteur signé ayant accès à l'assistant.

### Tâche 4 — Écran admin

**Fichiers** : nouveau `packages/admin/src/routes/prompt-settings.tsx`.

Sous-item du groupe nav `ai` existant (déjà `/agents`, `/providers`,
`/agent-skills`, `/mcp`, `/channels`, `/create-site`) — `/prompt-settings` s'ajoute
au même groupe, réservé `admin`.

## 4. Critères d'acceptation

- Chaque prompt utilitaire est visible, éditable et versionné dans cet écran.
- Modifier un template appliqué par un outil `assist.*` change réellement son
  comportement, sans déploiement.
- Un site jamais migré continue de fonctionner avec les constantes d'origine.

## 5. Tests exigés

- Contrat : suite de store identique à celle de `AgentSkillStore`.
- Permissions : écriture réservée `admin`, testée par rôle.
- Non-régression : chaque outil `assist.*` migré produit un résultat identique
  avant/après migration (le seed reproduit le texte d'origine mot pour mot).

## 6. Pièges connus

- Ne jamais dupliquer un prompt entre le code et le store sans repli explicite —
  c'est exactement le piège que la migration des skills en L24 a évité.
- Un placeholder `{{champ}}` non résolu doit échouer explicitement, jamais être
  envoyé tel quel au modèle.

## 7. Décisions à prendre

Aucune bloquante — fondation additive, sans impact sur un contrat figé.
