# 57 — Compétences : dossiers de référence standard

> **État** : le fondement disque est déjà bon depuis L24 — un dossier par
> compétence (`<dir>/<id>/SKILL.md` + `.meta.json`). Ce qui manque est
> entièrement côté API + admin : aucun sous-dossier standard, aucune route pour
> uploader des fichiers de référence.
> **Fichiers** : `packages/agents/src/skills/library.ts`,
> `packages/api/src/rest/agent-skills-router.ts`,
> `packages/admin/src/routes/agent-skills.tsx`
> **Effort** : 2 jours (+ effort séparé si `skill.read_resource` est demandé)
> **ADR requise** : non, sauf si un outil `skill.read_resource` est ajouté
> (extension mineure du contrat C)

---

## 1. Ce qui existe réellement

Deux systèmes de « skill » coexistent : `AgentSkill`/`AgentSkillStore` (L22/L24, le
concept concerné ici) et `Skill`/`SkillStore` (L7, marketplace de plugins signés —
concept différent, hors périmètre).

`AgentSkillStore` (`library.ts`) stocke déjà `<dir>/<id>/SKILL.md` +
`<dir>/<id>/.meta.json` — **c'est déjà un dossier par compétence**. Ce qui manque :
aucun sous-dossier standard n'est créé, aucune API/UI pour uploader des fichiers de
référence, `AgentSkill` n'expose aucune liste de ressources.

Le concept `SkillStore` (L7) prouve déjà que le code sait lire un dossier à
ressources arbitraires : `createFileSkillStore` fait un `readdir(recursive: true)`
et expose `resources: string[]` — pattern directement réutilisable.

**Format réel Claude Code/Anthropic** (convention publiée) : sous-dossiers typés,
tous optionnels, `SKILL.md` seul obligatoire à la racine — typiquement
`references/` (documents consultés à la demande), `scripts/` (utilitaires
exécutables), `assets/` (gabarits, images, fichiers utilisés tels quels).

## 2. Plan de développement

**Tâche 1** — `AgentSkillStore` (`library.ts`) : à la création (`create()`), créer
aussi les sous-dossiers standards vides — `references/`, `scripts/`, `assets/`.

**Tâche 2** — Étendre l'interface avec `listResources(id)` (réutilisant le motif
`readdir(recursive: true)` de `file-store.ts`, excluant `SKILL.md`/`.meta.json`),
`addResource(id, relativePath, content)`, `removeResource(id, relativePath)` —
bornées aux trois sous-dossiers standard (refuser d'écrire hors de ce périmètre).

**Tâche 3** — Route API `agent-skills-router.ts` : `GET/POST /api/agent-skills/:id/
resources`, `DELETE .../resources/:path`, `admin` uniquement.

**Tâche 4** — Écran `agent-skills.tsx` : section « Fichiers de référence » avec
trois zones (Références, Scripts, Assets), liste + upload + suppression.

**Tâche 5** — `agent-skills-client.ts` : `listSkillResources`/
`uploadSkillResource`/`removeSkillResource`.

**Tâche 6** — Le contexte d'agent (assemblage du prompt) **reste inchangé** dans
son mécanisme de charge : les fichiers de `references/`/`assets/` ne sont **pas**
automatiquement injectés dans le contexte — limite assumée à documenter, sauf si un
outil `skill.read_resource` est explicitement demandé pour qu'un agent les
consulte à l'exécution.

## 3. Critères d'acceptation

- Chaque compétence a ses trois sous-dossiers standards, créés automatiquement.
- Un fichier de référence uploadé est visible et supprimable depuis l'écran.
- Le chargement du prompt d'un agent n'est jamais gonflé par ces fichiers.

## 4. Tests exigés

- Unitaire : `addResource`/`removeResource` refusent une écriture hors des trois
  sous-dossiers standard.
- Contrat : `listResources` sur une compétence créée avant cette fiche (sans
  sous-dossiers) retourne une liste vide, sans erreur.
- Permissions : upload/suppression réservés `admin`.

## 5. Pièges connus

- Ne pas injecter automatiquement le contenu des fichiers de référence dans le
  contexte d'un agent — gonflement incontrôlé, contraire à R7/à la discipline de
  contexte déjà en place.

## 6. Décisions à trancher

Ajouter ou non un outil `skill.read_resource` pour qu'un agent lise ses propres
fichiers de référence à l'exécution — impact contrat C direct si retenu (extension
mineure de permission), à trancher séparément de cette fiche.
