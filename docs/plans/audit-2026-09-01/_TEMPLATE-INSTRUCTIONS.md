# Instructions communes aux audits du 2026-09-01

Tu es un auditeur senior CMS. Ton périmètre est UN domaine fonctionnel de Cogenta
(donné dans ta mission). Tu produis UN document Markdown en français dans
`docs/plans/audit-2026-09-01/<NN>-<domaine>.md`. Tu ne modifies AUCUN fichier de code.

## Méthode obligatoire, dans cet ordre

1. **Lire les specs** : les fiches `docs/plans/NN-*.md` listées, les sections de
   `docs/lots/*.md` pertinentes, `docs/lots/L20-audit-admin-complet.md` (section de
   ton domaine), `docs/lots/L21-corrections-et-fonctionnalites-admin.md` (tâches de
   ton domaine), `docs/04-contrats.md` (contrat consommé), et `docs/03-decisions.md`
   (ADR qui contraignent ton domaine). Lis aussi `AGENTS.md` (règles R1-R10).
2. **Lire le code réel** : écrans `packages/admin/src/routes/*`, composants, clients
   API (`packages/admin/src/api/*`), routeurs `packages/api/src/*`, paquets métier,
   câblage dans `packages/cli/src/commands/serve.ts` et voisins, i18n
   (`packages/admin/src/i18n/locales/fr.json`/`en.json`), tests. Utilise grep/find/cat.
   Ne te fie JAMAIS à un document de lot qui dit « fait » : vérifie dans le code.
3. **Vérification à la lettre** : pour CHAQUE tâche et CHAQUE critère d'acceptation de
   chaque fiche, un verdict : `FAIT` (avec chemin de fichier prouvant), `PARTIEL`
   (ce qui manque précisément), `ABSENT`, ou `POINT MORT` (écrit mais jamais câblé :
   route serveur sans écran, écran sans route, fonction exportée jamais appelée,
   clé i18n manquante donc texte brut, réglage stocké jamais lu par le rendu, test qui
   ne teste pas le comportement promis, bouton qui ne fait rien, etc.).
   Cherche activement les points morts : `grep` le nom de l'export dans tout le repo.
4. **Comparaison marché, sous-fonctionnalité par sous-fonctionnalité** : pour les
   produits de référence nommés dans ta mission, énumère leur arborescence réelle
   (menus, sous-menus, onglets, options, actions de masse, raccourcis, réglages) et
   marque pour chacune : Cogenta `OUI` / `PARTIEL` / `NON`. Sois exhaustif et concret
   (nomme l'onglet, le champ, l'option), pas générique.
5. **Bugs / non-respect des règles** : `any`, `@ts-ignore`, `console.log`, `throw new
   Error` nu dans une lib, contrôle de permission dans un outil (R4), HTML stocké dans
   un bloc (R3), dépendance nouvelle non justifiée (R9), fonctionnalité qui exige une
   clé IA (R2), écran non traduit, accessibilité (labels), pagination absente sur une
   liste non bornée, erreur serveur avalée, etc. Vérifie par grep, cite ligne et fichier.

## Format du document produit

```
# Audit <domaine> — 2026-09-01

## 1. Résumé exécutif (10 lignes max, chiffres : critères FAIT/PARTIEL/ABSENT/POINT MORT)
## 2. Ce qui existe réellement (chemins de fichiers, par écran/onglet)
## 3. Vérification des fiches, critère par critère (tableau : fiche, tâche/critère, verdict, preuve, écart)
## 4. Points morts et bugs trouvés (tableau : gravité, fichier:ligne, description, correction)
## 5. Comparaison marché (par produit de référence : tableau fonctionnalité → Cogenta OUI/PARTIEL/NON)
## 6. Spécification ultra détaillée des corrections et ajouts
   Pour chaque item : `## T<NN> — <titre>` avec Priorité (P0 bug/spec non respectée,
   P1 parité bloquante, P2 important, P3 confort), Effort (h ou j), Fichiers à
   toucher, Travail détaillé (composants, routes, tables, i18n FR+EN, permissions par
   rôle), Critères d'acceptation vérifiables, Tests exigés, Impact contrat/ADR
   (ADR requise : oui/non — si oui, ne rien coder, texte d'ADR proposé).
## 7. Ordre d'exécution recommandé et dépendances
```

## Contraintes à respecter dans tes propositions
- Contrats A/B/C/D figés : un nouveau champ/bloc/statut = ADR requise, signalée.
- ADR-0010 : pas d'éditeur de schéma en production. ADR-0022 : corbeille orthogonale au statut.
- R2 : rien d'obligatoire ne dépend d'une clé IA. R9 : zéro dépendance nouvelle sans justification.
- Ne propose pas d'abstraction hypothétique. Chaque tâche cite les fichiers réels.

## Ce que tu renvoies en fin de mission (dans ta réponse, pas dans le fichier)
Un résumé de 400 mots max : chemin du document, décomptes (FAIT/PARTIEL/ABSENT/POINT
MORT, bugs P0), et la liste des 10 items P0/P1 les plus importants avec une ligne
chacun (titre, effort, ADR requise oui/non).

## Économie de budget (obligatoire)
- Le budget de tokens est limité. Lis de façon ciblée : `grep -n` pour localiser, puis
  `sed -n 'a,bp'` sur les plages utiles. Ne lis pas des fichiers entiers de plus de
  400 lignes sans nécessité, ne lis pas les tests en entier (grep les noms de `it(`).
- Ne relis jamais deux fois le même fichier. Pas de lecture « pour voir ».
- **Écris ton fichier de sortie tôt et par étapes** : crée-le dès la fin de l'étape 1
  avec le squelette et remplis chaque section dès qu'elle est prête (utilise `cat >>`
  ou des éditions ciblées). Si tu es interrompu, le travail déjà écrit ne doit pas
  être perdu.
- Vise un document de 400 à 900 lignes, dense et concret, pas plus.
