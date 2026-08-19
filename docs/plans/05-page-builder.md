# 05 — Page builder visuel

> **État** : bon — le mieux fini de l'admin. Ce qui manque est de la finition.
> **Écrans** : `packages/admin/src/builder/` (8 fichiers, ~1 000 lignes)
> **API existante** : `POST /api/builder/render` (`packages/cli/src/commands/serve.ts`)
> **Effort** : 4–5 jours
> **ADR requise** : non — mais **RFC contrat B** pour tout nouveau bloc

---

## 1. Ce qui existe réellement

L16 a livré un builder honnête, et sa décision fondatrice est bonne : **l'aperçu est
un iframe sur le vrai rendu serveur**, jamais une réimplémentation React des blocs.
Il n'existe donc aucune copie des douze blocs dans l'admin, et rien à faire diverger.

Réellement en place :

- `POST /api/builder/render` : lit l'entrée par le même `ContentGateway` à permissions
  vérifiées, superpose la liste de blocs non enregistrée, appelle **la même fonction
  de rendu** que la page publiée. Trois portes : acteur authentifié, `update` sur la
  collection, puis lecture par le gateway.
- Glisser-déposer dans la page et dans la liste latérale, en événements natifs, sans
  aucune dépendance nouvelle (R9), et **toujours doublé de boutons nommés** — ce qui
  est la raison pour laquelle le glisser-déposer a eu le droit de remplacer les
  boutons monter/descendre.
- Édition en place au double-clic sur les champs texte simples, en lisant
  `textContent` et jamais `innerHTML` (R3).
- Panneau d'insertion avec recherche par libellé humain **et** par nom de type contrat
  B, insensible à la casse et aux accents, en quatre catégories qui appartiennent à
  l'admin et non au contrat figé.
- Annuler / rétablir (50 instantanés, `Ctrl/⌘+Z`).
- Trois largeurs d'aperçu réelles : l'iframe est redimensionné en pixels CSS, donc les
  media queries du thème se résolvent vraiment.
- Un test de fidélité qui affirme que le `<body>` de l'aperçu est identique **octet
  pour octet** à celui de l'URL publique, et que le `<head>` ne diffère que par
  `noindex` et l'absence de canonique.

## 2. Ce que font les CMS de référence

| Fonction | WordPress (Gutenberg) | Webflow / Elementor | Cogenta |
|---|---|---|---|
| Aperçu fidèle au rendu réel | partiel (rendu React parallèle) | ✅ | ✅ **mieux** |
| Glisser-déposer + clavier | ✅ | partiel | ✅ |
| Annuler / rétablir | ✅ | ✅ | ✅ |
| Largeurs d'aperçu | ✅ | ✅ | ✅ |
| Bibliothèque de motifs / sections préfaites | ✅ | ✅ | ❌ |
| Blocs réutilisables (synchronisés entre pages) | ✅ | ✅ | ❌ |
| Copier / coller un bloc entre pages | ✅ | ✅ | ❌ |
| Verrouiller un bloc | ✅ | ✅ | ❌ |
| Édition en place sur du texte riche | ✅ | ✅ | ❌ (texte simple) |
| Mise à jour de l'aperçu en direct | ✅ | ✅ | ❌ (aller-retour 300 ms) |
| Réglages de bloc (marge, fond, largeur) | ✅ | ✅ | selon le bloc |

## 3. Écarts, classés

### Importants

1. **Pas de motifs (patterns).** Un utilisateur qui part d'une page blanche doit
   assembler dix blocs à la main à chaque fois. C'est l'écart le plus visible pour
   quelqu'un qui vient de WordPress.
2. **Pas de copier-coller de bloc entre pages.** Refaire un bandeau identique sur cinq
   pages, c'est cinq saisies.
3. **Pas de blocs réutilisables synchronisés.** Changer un encart d'appel présent sur
   vingt pages demande vingt modifications.
4. **L'édition en place ne couvre que le texte simple.** C'est documenté et assumé,
   mais un double-clic sur un paragraphe de texte riche ne fait rien, sans que rien ne
   l'explique à cet endroit précis.

### Confort

5. Aperçu après aller-retour serveur débattu de 300 ms — compromis assumé et
   justifié ; à ne remettre en cause que si l'usage réel le demande.
6. Pas de verrouillage de bloc (empêcher un contributeur de casser un en-tête).
7. Pas de sélection multiple de blocs.
8. Pas de vue « plan du document » repliable au-delà de la liste latérale actuelle.

## 4. Plan de développement

### Tâche 1 — Motifs (patterns)

**Fichiers** : nouveau `packages/admin/src/builder/patterns.ts`,
`builder/block-picker.tsx`, et un lieu de stockage.

Un motif est **une liste de blocs contrat B**, rien de plus — donc aucun contrat ne
bouge, et un motif inséré est immédiatement indistinguable de blocs posés à la main.

Deux origines, dans cet ordre :

1. **Motifs fournis** : livrés avec le thème, déclarés dans le contrat D ou à côté de
   `theme.tokens.json`. Vérifier ce que le contrat D permet avant d'inventer un
   fichier. Chacun avec un nom, une catégorie et une vignette (une capture du rendu
   réel, produite par `POST /api/builder/render`, pas un dessin).
2. **Motifs du site** : « enregistrer la sélection comme motif », stocké en base par
   une petite table (`pattern`), route `/api/patterns`, permission `admin`/`editor`.

**Critère** : insérer un motif « héros + trois arguments + appel à l'action » en un
clic, et pouvoir ensuite modifier chaque bloc indépendamment.

### Tâche 2 — Copier / coller de bloc

**Fichiers** : `builder/page-builder.tsx`, `builder/block-moves.ts`.

`Ctrl/⌘+C` / `Ctrl/⌘+V` sur le bloc sélectionné, via le presse-papiers du navigateur
au format `application/json` avec un préfixe de reconnaissance
(`cogenta/blocks@1`). Cela permet le collage **entre onglets et entre pages**, ce que
ne permettrait pas un état local.

Validation stricte au collage : tout bloc dont le `type` n'est pas dans le vocabulaire
du site est refusé avec un message nommant le type — jamais inséré « au cas où ».

**Critère** : copier un bandeau sur la page A, le coller sur la page B dans un autre
onglet, enregistrer, et retrouver le même rendu.

### Tâche 3 — Blocs réutilisables

**ADR probable.** Un bloc réutilisable est une **référence**, pas une copie : la page
stocke un pointeur, le rendu résout. Cela touche le contrat B (un bloc dont le contenu
n'est pas dans la page) et le rendu (une résolution supplémentaire, avec son cas
d'échec quand la cible est supprimée).

Deux options :

- **(a) Motif figé uniquement** (tâche 1) : insertion = copie, pas de synchronisation.
  Zéro impact contrat. Couvre 80 % du besoin réel.
- **(b) Vraie synchronisation** : un type de bloc `reference` dans le contrat B →
  **RFC obligatoire**, plus la résolution côté renderer, plus la question « que se
  passe-t-il quand la cible est mise à la corbeille ? ».

Recommandation : livrer **(a)**, et n'ouvrir **(b)** que si l'usage réel le réclame.
Une RFC sur un contrat figé pour une fonctionnalité non demandée serait exactement ce
qu'`AGENTS.md` interdit.

### Tâche 4 — Édition en place sur le texte riche, ou message honnête

**Fichiers** : `builder/preview-dom.ts`, `builder/page-builder.tsx`.

`isInlineEditable` refuse déjà tout champ qui n'est pas un texte simple déclaré par ce
type de bloc — garde-fou correct, à conserver. Deux façons de combler l'écart :

- **Minimum honnête** : au double-clic sur un champ non éditable en place, ouvrir le
  panneau de droite sur ce champ précis, avec le focus dedans. Coût faible, gain réel.
- **Complet** : monter l'éditeur Slate dans l'aperçu. Coûteux, et fragile — l'iframe
  est du HTML serveur, y injecter React réintroduit exactement la divergence que L16 a
  évitée.

Recommandation : **le minimum honnête**. Il respecte la décision fondatrice du lot.

**Critère** : double-cliquer sur un paragraphe riche ouvre son éditeur, focus dedans,
sans que l'aperçu cesse d'être du HTML serveur.

### Tâche 5 — Verrouillage et sélection multiple

**Fichiers** : `builder/page-builder.tsx`, `builder/block-outline.tsx`.

- Verrouillage : un drapeau côté admin (pas côté contrat B) empêchant déplacement et
  suppression, avec la clé `data-block-key` déjà posée par le rendu. Sert surtout aux
  en-têtes et pieds de page composés.
- Sélection multiple : `Shift`+clic dans la liste latérale, pour déplacer ou
  supprimer un groupe. **Toujours doublé de boutons nommés** (règle L16).

## 5. Critères d'acceptation

- L'aperçu reste identique octet pour octet au rendu public — le test de fidélité de
  L16 ne doit pas régresser, y compris après l'insertion d'un motif.
- Aucun bloc du contrat B n'est ajouté sans RFC.
- Tout ce qui s'obtient en glissant s'obtient aussi par un bouton nommé, opérable au
  clavier.
- Coller un bloc d'un type inconnu est refusé avec un message qui nomme le type.
- Aucune copie React des blocs n'apparaît dans `packages/admin`.

## 6. Tests exigés

- Le test de fidélité existant, rejoué après une session incluant l'insertion d'un
  motif et un collage.
- Unitaires : refus de collage d'un type hors vocabulaire.
- Composant : chaque déplacement possible au clavier seul.
- Bout en bout (`packages/cli/test/serve-builder.test.ts`, déjà 10 tests) : ajouter
  un cas motif + collage contre un vrai serveur et une vraie base.
- Contrat B vérifié des deux côtés après une session complète, comme L16 le fait déjà.

## 7. Pièges connus

- **Le motif ne doit jamais devenir un treizième type de bloc.** C'est une liste de
  blocs existants, produite à l'insertion et oubliée ensuite.
- **La vignette d'un motif doit venir du rendu réel**, sinon elle ment dès que le
  thème change — et c'est précisément le mensonge que L16 s'est interdit.
- **Le presse-papiers est un canal externe** : ce qui en sort est de la donnée, pas
  une instruction (R8). Valider strictement, jamais faire confiance à la forme.
- **La sélection multiple casse facilement l'annulation** : chaque opération groupée
  doit produire **un seul** instantané d'historique, pas un par bloc.
- Le builder n'est proposé que sur une entrée déjà enregistrée, et c'est correct : ne
  pas « corriger » cela en inventant un aperçu pour une page qui n'existe pas.

## 8. Décisions à prendre

- Blocs réutilisables : (a) motif figé — recommandé — ou (b) référence synchronisée
  avec RFC contrat B.
- Où vivent les motifs fournis : contrat D (thème) ou fichier à part. Vérifier le
  contrat D avant de trancher.
