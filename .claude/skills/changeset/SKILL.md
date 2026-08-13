---
name: changeset
description: Use when a published @cogenta/* package changed and a changeset must be written — covers when one is required, how to pick the semver bump against the four versioned contracts, and how to write a release note a consumer can act on.
---

# Écrire un changeset

Un changeset est **exigé par la Définition de terminé** dès qu'un paquet publié est
touché. Sans lui, le changement part en production sans note de version.

```bash
pnpm changeset
```

Ou, à la main, un fichier `.changeset/<nom-parlant>.md` :

```markdown
---
'@cogenta/core': minor
'@cogenta/cli': patch
---

Add tag-based invalidation to every cache driver, including `file` and `memory`.
```

## Quand il n'en faut pas

Doc seule, tests seuls, CI, config du dépôt, refactor strictement interne sans effet
observable. En cas de doute : écris-le. Un changeset de trop coûte une ligne dans un
changelog ; un changeset manquant casse la confiance d'un consommateur.

## Choisir le bump

`0.x` — le projet est en pre-alpha, mais les habitudes prises maintenant se garderont.

| Bump | Cas |
|---|---|
| `patch` | correction sans changement de surface publique |
| `minor` | ajout rétrocompatible : nouveau champ, nouvel export, nouveau driver, nouveau bloc |
| `major` | toute rupture de surface publique |

### Contre les quatre contrats (docs/04-contrats.md)

| Contrat | Mineur | **Majeur** |
|---|---|---|
| **A** schéma | ajouter un type de champ | modifier la signature d'un champ existant |
| **B** blocs | ajouter un bloc | modifier le schéma d'un bloc existant (+ migration auto du contenu) |
| **C** outils | ajouter un outil | modifier la signature d'un outil existant |
| **D** thème | ajouter une entrée à `ctx` | en modifier une |

Un `major` sur un contrat **impose une note de migration**, pas seulement un numéro.

## Écrire la note

En **anglais**, à l'impératif, du point de vue du consommateur.

- Bien : *« Cache drivers now expose `invalidateTags`. Custom drivers must implement it. »*
- Mal : *« refactor cache »*

Pour une rupture, dis toujours : ce qui casse, comment migrer, et pourquoi le changement
valait la rupture.
