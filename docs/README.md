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
| `lots/L0-socle.md` … `lots/L9-ecosysteme.md` | La spec détaillée du lot qu'on attaque. |
| `rfc/README.md` | Avant de proposer un changement de contrat ou de vocabulaire. |
| `AGENTS.md` | À la racine du dépôt. Les règles de développement, lues à chaque session. |
| `CLAUDE.md` | À la racine du dépôt. Point d'entrée des sessions assistées par IA. |

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
| Contrats | Première rédaction. **Aucun n'est figé** : A et B avant L1, D avant L3, C avant L4 |
| Sécurité | Première rédaction |
| Lots | Découpage validé, les dix specs détaillées sont écrites (`lots/`) |
| Code | Socle du dépôt en place (monorepo, CI, outillage). L0 non commencé. |

## Prochaine étape

**L0 — Socle** (`lots/L0-socle.md`), tâche par tâche. La commande `/lot L0` charge le
contexte complet avant de coder.

Les specs de lot sont écrites d'avance mais restent révisables : celle d'un lot lointain
sera relue et amendée juste avant son démarrage, à la lumière de ce que les lots
précédents auront appris.
