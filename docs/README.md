# Cogenta — Dossier de spécifications

> CMS agentique, Node.js, open source.
> Nom de travail : **Cogenta**. Licence : **MPL 2.0**.

## Comment lire ce dossier

Ce dossier n'est pas un PRD monolithique. C'est un ensemble de documents autonomes,
pensés pour être lus **un par un** par un développeur ou par une IA de développement,
sans avoir besoin du reste en contexte.

| Fichier | À lire quand |
|---|---|
| `00-vision.md` | Avant tout. Le pourquoi, le positionnement, les non-objectifs. |
| `01-prd.md` | Pour comprendre pour qui on construit et ce qui entre dans la v1. |
| `02-architecture.md` | Avant d'écrire la moindre ligne de code. |
| `03-decisions.md` | Quand on est tenté de revenir sur un choix déjà tranché. |
| `04-contrats.md` | Avant de coder tout ce qui touche au contenu, aux thèmes ou aux agents. |
| `05-securite.md` | Avant de coder l'auth, les plugins, les agents ou l'exécution de code tiers. |
| `06-lots.md` | Pour savoir quoi construire, dans quel ordre. |
| `AGENTS.md` | À la racine du dépôt. Lu à chaque session de développement assistée. |

## Règle de gouvernance documentaire

Une décision tranchée dans `03-decisions.md` **ne se rediscute pas** en cours de
développement. Si elle doit changer, on écrit une nouvelle décision qui remplace
l'ancienne, avec sa date et sa justification. On ne modifie jamais une décision
passée en place : on la marque `Remplacée par ADR-XXXX`.

Les quatre contrats de `04-contrats.md` sont **versionnés en semver**. Toute
modification incompatible impose une montée de version majeure et une note de
migration.

## État

| Document | État |
|---|---|
| Vision | Validé |
| PRD | Validé |
| Architecture | Validé |
| Décisions | 12 décisions actées |
| Contrats | Première rédaction, à figer avant L1 |
| Sécurité | Première rédaction |
| Lots | Découpage validé, specs détaillées à écrire lot par lot |

## Prochaine étape

Rédiger les dix specs de lot détaillées (`lots/L0.md` à `lots/L9.md`), chacune avec
périmètre, dépendances, interfaces produites, critères d'acceptation et tests.
À faire juste avant d'attaquer chaque lot, pas tous d'avance.
