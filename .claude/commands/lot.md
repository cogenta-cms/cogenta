---
description: Charge le contexte complet d'un lot (spec, contrats consommés, décisions, état) avant de coder
argument-hint: L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9
---

Prépare une session de développement sur le lot **$1**.

Fais exactement ceci, dans l'ordre, avant toute autre chose :

1. Lis `docs/lots/` pour trouver le fichier du lot $1, puis lis-le **en entier** :
   périmètre, dépendances, interfaces à produire, tâches dans l'ordre, critères
   d'acceptation, tests exigés, pièges connus, hors périmètre.
2. Lis `docs/03-decisions.md` en entier. Ces décisions ne se rediscutent pas.
3. Lis dans `docs/04-contrats.md` **uniquement** les contrats que ce lot consomme
   (A et B pour L1, D pour L3, C pour L4 ; L0 n'en consomme aucun).
4. Lis `docs/05-securite.md` si le lot touche à l'auth, aux plugins, aux agents ou à
   l'exécution de code tiers.
5. Vérifie l'état réel du dépôt : `git status`, `git log --oneline -10`, et l'existence
   des paquets attendus par la spec.

Puis rends-moi, sans commencer à coder :

- **Où on en est** — ce qui existe déjà de ce lot, ce qui manque.
- **Les prérequis** — les lots dont celui-ci dépend sont-ils réellement terminés ?
  Les contrats qu'il consomme sont-ils figés ?
- **Le plan** — les tâches de la spec, dans l'ordre, découpées en unités livrables et
  testables. Une unité = un commit, une session courte.
- **Les décisions qui me reviennent** — tout ce que la spec ne tranche pas et qui
  changerait le travail selon la réponse.
- **Les pièges de ce lot** — repris de la spec, plus ce que tu vois d'autre.

Attends mon accord avant d'écrire la moindre ligne de code.
