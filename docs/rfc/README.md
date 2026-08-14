# Processus de RFC

> Une RFC est exigée pour toute modification des quatre contrats de `04-contrats.md` :
> ajouter un bloc au vocabulaire, un type de champ, une permission, une entrée au
> `RenderContext`, ou modifier une signature existante.

## Pourquoi ce frein est volontaire

Les quatre contrats sont des **API publiques versionnées en semver**. Le vocabulaire de
blocs, en particulier, doit rester petit — une dizaine, pas cinquante. Chaque bloc ajouté
est une dette imposée à **chaque auteur de thème, pour toujours** : il devra
l'implémenter, ou son thème sera refusé à l'installation (ADR-0009).

Ce n'est pas de la bureaucratie. C'est ce qui permet de promettre « change de thème,
le contenu s'adapte » et de tenir la promesse.

## Ce qui n'exige pas de RFC

Une implémentation interne, une correction, un driver supplémentaire derrière une
interface existante, une optimisation, un test, de la documentation. Si aucun consommateur
externe ne voit la différence, ce n'est pas une RFC.

## Le processus

1. **Ouvrir une issue** avec le gabarit `RFC — change to a contract or the block
   vocabulary`. Il force les trois questions qui comptent : le cas d'usage réel, ce qui
   est déjà possible sans le changement, et le coût imposé à l'écosystème.
2. **Discussion publique**, au minimum **sept jours**. Une RFC sur un contrat déjà figé
   consommé par du code en production reste ouverte plus longtemps.
3. **Décision** — acceptée, refusée, ou reportée, avec la raison écrite dans l'issue.
   Une RFC refusée n'est pas un échec : le refus documenté évite de rouvrir le sujet
   tous les six mois.
4. **Si le changement est structurant**, il devient une ADR dans `03-decisions.md`
   (skill `write-adr`).
5. **Implémentation** — avec la montée de version semver correspondante et, pour une
   rupture, une note de migration. Le contenu déjà saisi doit avoir un chemin de
   migration automatique.

## La question à laquelle il faut répondre en premier

> Peut-on obtenir ce résultat en composant ce qui existe déjà ?

Un `featureGrid` fait souvent le travail d'un bloc « services ». Un `collectionList`
fait souvent le travail d'un bloc « derniers articles ». Un thème peut définir un bloc
qui lui est propre **à condition de déclarer un bloc de repli du vocabulaire standard** —
c'est justement le mécanisme prévu pour ne pas avoir à élargir le vocabulaire commun.

Si la réponse est « oui, mais ce serait moins pratique », la RFC est refusée.

## État des contrats

| Contrat | Figé | Version |
|---|---|---|
| A — schéma de contenu | **oui**, depuis le 2026-08-13 | `schema@1.0` |
| B — vocabulaire de blocs | **oui**, depuis le 2026-08-13 | `blocks@1.0` |
| C — outil agentique | **oui**, depuis le 2026-08-14 (ADR-0020) | `tools@1.0` |
| D — thème | **oui**, depuis le 2026-08-13 | `theme@1.1` |

**Les quatre contrats sont figés.** Toute modification de leur forme passe désormais par
le processus ci-dessus, sans exception — voir `04-contrats.md` pour le détail par
contrat de ce qui est majeur (rupture, migration exigée) contre mineur (ajout
compatible, ex. une entrée à `ctx` pour le contrat D).
