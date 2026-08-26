# 49 — Apparence de l'admin : même traitement

> **État** : système entièrement distinct de la fiche 48 (aucun fichier partagé) —
> CSS-in-page injecté dans `<head>`, deux gabarits codés en dur, aucun aperçu réel
> (contrairement à la fiche 48, qui a au moins un iframe debouncé).
> **Fichiers** : `packages/admin/src/routes/admin-appearance.tsx`,
> `packages/admin/src/shell/admin-theme-context.tsx`,
> `packages/schema/src/store/admin-theme-templates.ts`
> **Effort** : 2–3 jours
> **ADR requise** : non — système interne à `@cogenta/admin`, non publié, hors
> contrat D

---

## 1. Ce qui existe réellement

`admin-appearance.tsx` (386 lignes) : système entièrement distinct de la fiche 48.
`AdminThemeProvider`/`admin-theme-context.tsx` applique le thème en injectant une
balise `<style id="cogenta-admin-theme-overrides">` dans `<head>`, réécrite à
chaque `refresh()` — **aucun iframe, aucun rendu serveur**.
`admin-theme-templates.ts` (335 lignes) : deux gabarits complets codés en dur
(`NIGHTOPS`, `ATELIER` — pas des paquets npm), chacun avec ses jetons pour les deux
modes clair/sombre, plus `AdminThemeOverrides` (couleur primaire/fond/texte, police
parmi 4 polices closes, rayon, logo).

Un seul écran mélange déjà galerie (deux cartes avec **4 pastilles de couleur
statiques**, pas d'aperçu réel) et formulaire de personnalisation — même défaut
structurel que la fiche 48. **Aucun aperçu réel** : les changements ne s'appliquent
qu'après Enregistrer puis `refresh()` — écart plus grand que la fiche 48, qui a au
moins un éditeur de jetons avec aperçu debouncé.

Pas de version/auteur transposable : les gabarits ont déjà `id`/`name`/
`description` en dur, mais ce n'est pas un système de paquets versionnés comme les
thèmes de site.

## 2. Plan de développement

**Tâche 1** — Scinder en vue galerie (cartes enrichies) + vue personnalisation, avec
bouton « Personnaliser » — même geste que la fiche 48 tâche 5.

**Tâche 2** — Remplacer les pastilles statiques par un **aperçu réel** : mini-panneau
autonome dans la carte, stylé par les jetons du gabarit (vrais composants
`Button`/`Card` de l'admin rendus dans un conteneur scoppé aux variables CSS du
gabarit) — pas d'iframe séparé, faute de pipeline de rendu serveur équivalent pour
l'admin lui-même. À trancher en codant si un mini-panneau scoppé suffit ou si un
second pipeline (page de démo admin rendue côté serveur) est justifié.

**Tâche 3** — Dans la vue personnalisation, appliquer les réglages en cours
d'édition **en live** (avant Enregistrer) au panneau d'aperçu, via la même fonction
`buildAdminThemeCss` déjà utilisée par `admin-theme-context.tsx`, appliquée au
conteneur d'aperçu plutôt qu'à `<head>` global — pour ne pas changer le thème réel
de l'écran en cours d'édition avant sauvegarde.

**Tâche 4** *(optionnelle)* — Ajouter un champ `version` de gabarit (numérotation
interne de révision) si jugé utile — décision produit mineure, pas structurante.

## 3. Critères d'acceptation

- La galerie ne montre plus les contrôles de personnalisation.
- Un bouton « Personnaliser » mène à l'édition.
- Les modifications en cours d'édition s'aperçoivent avant l'enregistrement.

## 4. Tests exigés

- Composant : navigation galerie ↔ personnalisation.
- Composant : l'aperçu reflète un changement de couleur/police avant sauvegarde.
- Non-régression : `refresh()` continue d'appliquer le thème réel après
  enregistrement.

## 5. Pièges connus

- Ne pas confondre ce système avec le contrat D (thèmes du site) — aucun changement
  ici ne touche `docs/04-contrats.md`.
- L'aperçu en live ne doit jamais modifier `<head>` global avant l'enregistrement —
  sinon un changement non sauvegardé affecterait tout l'admin en cours d'usage.

## 6. Décisions à prendre

Mini-panneau scoppé vs. second pipeline de rendu serveur pour l'aperçu (tâche 2) —
à trancher en codant, aucune des deux n'a d'impact contrat.
