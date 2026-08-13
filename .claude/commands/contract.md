---
description: Vérifie un changement contre un contrat d'interface versionné
argument-hint: A (schéma) | B (blocs) | C (outils) | D (thème) | all
---

Lance le sous-agent `contract-guardian` sur le contrat **$1** et le diff en cours.

Rappel des contrats (`docs/04-contrats.md`) :

- **A** — schéma de contenu : `defineCollection`, types de champ, champs système,
  `provenance`, migrations. Doit être figé avant L1.
- **B** — vocabulaire de blocs : les douze blocs, `defineBlock`, `runtime`, `fallback`.
  Un bloc ne stocke jamais de HTML ni de CSS. Doit être figé avant L1.
- **C** — outil agentique : `defineTool`, `defineAgent`, taxonomie des permissions,
  `revert`, audit. Doit être figé avant L4.
- **D** — thème : `defineTheme`, `RenderContext`, tokens de skin. Doit être figé avant L3.

Si `$1` vaut `all`, passe les quatre en revue.

Rends le verdict tel quel. Ne corrige rien sans mon accord : une correction de contrat
peut valoir montée de version majeure et note de migration.
