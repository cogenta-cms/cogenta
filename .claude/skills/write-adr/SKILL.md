---
name: write-adr
description: Use when a design decision needs to be recorded or superseded in docs/03-decisions.md — enforces the ADR format, the append-only rule, and the fact that the file is write-protected so the text must be handed to a human.
---

# Écrire une ADR

## La règle de gouvernance, d'abord

`docs/03-decisions.md` est **append-only**. Une décision actée **ne se modifie jamais**.
Pour changer d'avis : on écrit une **nouvelle** ADR, et on marque l'ancienne
`Remplacée par ADR-XXXX` — sans supprimer son texte.

Le fichier est **protégé en écriture par un hook**. Tu ne l'édites pas toi-même : tu
produis le texte exact et tu le remets à l'humain pour insertion.

## Quand une ADR est nécessaire

- Un choix structurant qu'on regretterait de devoir redécouvrir dans six mois.
- Un choix qu'on sera tenté de rediscuter (c'est exactement le rôle du document).
- Un renoncement assumé : ce qu'on perd compte autant que ce qu'on gagne.
- Un choix d'outillage qui contraint tout le monde (base, licence, langage, framework).

Une ADR n'est **pas** nécessaire pour un détail d'implémentation réversible en une heure.

## Le format, tel qu'il est utilisé dans le projet

```markdown
## ADR-00XX — <titre au présent, la décision elle-même>

**Statut** : Acté | Proposé | Remplacée par ADR-00YY

**Contexte** — <la tension réelle, pas l'évidence. Pourquoi ce choix est difficile.>

**Décision** — <ce qu'on fait, en une ou deux phrases affirmatives.>

**Justification** — <le raisonnement, avec les faits vérifiables. Cite les précédents.>

**Conséquences** — <ce que ça impose au reste du projet.>

**Renoncement assumé** — <ce qu'on perd, nommé sans euphémisme.>

**Écarté** — <les alternatives sérieuses, et pourquoi elles perdent.>
```

Les sections `Renoncement assumé` et `Écarté` sont facultatives mais ce sont elles qui
donnent sa valeur au document : une ADR qui ne dit que du bien de sa décision ne servira
à personne dans un an.

## Style

Le ton du fichier existant : affirmatif, concret, sans jargon de management, avec des
faits vérifiables (« 90 % des compromissions WordPress passent par un plugin »,
« MariaDB ≥ 11.8 possède un type VECTOR natif »). Les documents de conception sont en
**français**. Numérotation continue, jamais réutilisée.

## Après

Si l'ADR change une contrainte de développement, `AGENTS.md` et `CLAUDE.md` doivent
suivre. Signale-le en même temps que le texte de l'ADR.
