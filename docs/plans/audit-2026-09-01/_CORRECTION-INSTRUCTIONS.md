# Consignes communes aux agents de correction (2026-09-02)

Tu travailles dans un **worktree git isolé** sur ta propre branche. Règles :

1. Lis `AGENTS.md` (règles R1-R10, définition de terminé) et la section 6 de ton
   document d'audit (`docs/plans/audit-2026-09-01/<NN>-*.md`) : chaque tâche y a ses
   fichiers, son travail et ses critères d'acceptation. Applique-les à la lettre.
2. **Jamais `git stash`** (refs partagés entre worktrees). Jamais de `--no-verify`.
   Commits en Conventional Commits, en anglais, `git commit -s`. Un commit par tâche.
3. Code : TypeScript strict, ESM, pas de `any`/`@ts-ignore`/`console.log`/`throw new
   Error` nu dans une lib (utiliser `CogentaError` avec `code` + `hint`). i18n FR **et**
   EN pour toute chaîne visible. Permission vérifiée côté serveur (R4). Zéro dépendance
   nouvelle (R9). Contrats A/B/C/D figés : si une tâche exige une ADR, ne la code pas,
   rédige le texte d'ADR dans `docs/adr-00XX-draft.md` et signale-le.
4. Tests : tests réels sur base SQLite éphémère (jamais de mock de base), test par rôle
   pour toute route, test admin (Testing Library) pour tout écran. Lance
   `pnpm -F <paquet> typecheck` et `pnpm -F <paquet> test -- <fichiers touchés>` avant
   chaque commit ; lance `pnpm exec biome check --write <fichiers>`.
5. **Changeset obligatoire** pour tout paquet publié touché (`.changeset/<slug>.md`,
   `patch` pour un bug, `minor` pour une fonctionnalité) — `@cogenta/admin` est privé
   (pas de changeset).
6. Écris ton rapport **au fur et à mesure** dans
   `docs/plans/audit-2026-09-01/corrections/<ID>-<domaine>.md` : une section par tâche
   (fait / preuve : commandes exécutées et leur sortie résumée / ce qui reste). Crée ce
   fichier dès le début et complète-le après chaque tâche.
7. Budget limité : lis par `grep -n` + plages `sed -n`, jamais des fichiers entiers de
   plus de 400 lignes sans nécessité. Ne relis pas ce que tu as déjà lu.
8. Ne touche pas aux fichiers hors de ton périmètre listé dans ta mission (d'autres
   agents travaillent en parallèle sur d'autres domaines) ; si un fichier partagé
   (`packages/cli/src/commands/serve.ts`, `fr.json`/`en.json`) doit être modifié, fais
   des modifications **minimales et localisées** (ajout de lignes, jamais de
   réorganisation) pour limiter les conflits de fusion.
9. Fin de mission : réponse de 300 mots max — branche, liste des commits, tâches faites
   / non faites et pourquoi, commandes de vérification exécutées avec leur résultat.
