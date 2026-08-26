# 48 — Apparence (thème du site) : bouton Personnaliser et métadonnées de thème

> **État** : un seul écran continu mélange galerie et personnalisation. `version`
> existe déjà dans `ThemeManifest` mais n'est ni lue ni affichée ; `description` et
> `author` n'existent nulle part dans le contrat, dupliqués à la main ailleurs.
> **Fichiers** : `packages/admin/src/routes/appearance.tsx`,
> `packages/render/src/theme/manifest.ts`, `packages/cli/src/commands/theme-registry.ts`,
> `packages/api/src/rest/theme-router.ts`, `theme.config.ts` des 5 thèmes
> **Effort** : 3–4 jours
> **ADR requise** : non — montée additive du contrat D (`theme@1.2`), même
> précédent que `theme@1.1`

---

## 1. Ce qui existe réellement

`appearance.tsx` (809 lignes) est **un seul écran** qui mélange, dans l'ordre :
notice de provenance → carte « thème actif » (galerie des 5 thèmes avec
`ThemeGalleryPreview` en iframe à l'échelle réelle par carte, bouton « Activer ») →
grille deux colonnes : colonne gauche = éditeur de jetons contrat D, avertissements
de contraste AA, CSS additionnel, identité (logo/favicon via `MediaPicker`), galerie
de skins, génération IA ; colonne droite = un seul iframe de prévisualisation live
(debounce 300 ms) partagé entre sélection de thème et édition de jetons. **Aucun
bouton « Personnaliser »**, aucune séparation d'écran.

Métadonnées affichées par carte : `label`/`description`, codées en dur, un par
thème, dans `theme-registry.ts` (`BUILTIN_THEMES`) — **ni l'un ni l'autre ne vient
du `ThemeManifest`**. Aucune version, aucun auteur nulle part dans la chaîne
API→admin.

`ThemeManifest` réel (`packages/render/src/theme/manifest.ts`) :
```ts
interface ThemeManifest {
  name: string; version: string; engine: string; blocks: string;
  implements: readonly string[]; collections: readonly string[] | '*';
  runtime: ThemeRuntime; tokens: string; a11y?: { verified: string };
}
```
`version` **existe déjà** (chaque `theme.config.ts` le déclare, ex. `theme-portfolio`:
`'1.0.0'`, distinct du `version` npm de `package.json` — deux numéros différents
aujourd'hui, à clarifier lequel s'affiche). `description`/`author` **n'existent
pas** dans le manifeste ; `package.json` porte déjà une `description` quasi
identique au texte codé en dur (duplication manuelle jamais lue
programmatiquement) ; aucun `author` nulle part.

## 2. Plan de développement

**Tâche 1** — `manifest.ts` : ajouter `description: string` et `author?: string`
optionnels à `manifestSchema`/`ThemeManifest`. **Critère** : un thème existant sans
ces champs continue de valider.

**Tâche 2** — Les 5 `theme.config.ts` : déclarer `description`/`author` réels
(reprendre le texte déjà dupliqué dans `theme-registry.ts`/`package.json`).

**Tâche 3** — `theme-registry.ts` : `availableThemes()` lit `label` (gardé, absent
du manifeste), `description`, `version`, `author` **depuis le manifeste chargé**,
supprime la duplication manuelle. **Critère** : modifier `theme.config.ts` change
ce que l'API renvoie, sans toucher `theme-registry.ts`.

**Tâche 4** — `theme-router.ts` : `GET /api/theme` gagne `version`/`author`/
`description`.

**Tâche 5** — `appearance.tsx` : scinder en deux vues —
- **Galerie** : cartes enrichies (aperçu iframe existant, nom, description,
  **version, auteur**), bouton **« Personnaliser »** par thème actif.
- **Personnalisation** : tout ce qui est aujourd'hui la colonne gauche + le grand
  iframe (jetons, contraste, CSS additionnel, identité, galerie de skins,
  génération IA) — inchangé fonctionnellement, déplacé derrière le bouton.

**Critère** : la galerie ne montre plus les contrôles de personnalisation ; un clic
sur « Personnaliser » y mène ; version et auteur visibles sur chaque carte.

**Tâche 6** — Mettre à jour `docs/04-contrats.md` (§ Contrat D) et
`docs/plans/14-apparence-et-theme.md` avec les nouveaux champs et le montage de
version.

## 3. Critères d'acceptation

- La galerie affiche version, auteur et description pour chaque thème.
- Un bouton « Personnaliser » sépare clairement la sélection de la personnalisation.
- Un thème tiers sans `description`/`author` déclarés continue de s'afficher
  proprement (repli sur `label` seul).

## 4. Tests exigés

- Contrat : validation d'un manifeste avec et sans les nouveaux champs optionnels.
- Composant : navigation galerie → personnalisation et retour, état préservé.
- Non-régression : aperçu iframe de la galerie inchangé.

## 5. Pièges connus

- Deux numéros de version coexistent (`theme.config.ts` vs `package.json`) —
  clarifier explicitement lequel s'affiche avant de coder, pour ne pas en afficher
  un incohérent avec l'autre.
- Ne pas casser un thème tiers déjà installé sans ces champs — optionnels partout.

## 6. Décisions à prendre

Aucune ADR — montée `theme@1.2`, additive, changeset suffisant (précédent
`theme@1.1`, ajout de `ImageSource.kind`/`poster`, qualifié de mineur par le
contrat lui-même).
