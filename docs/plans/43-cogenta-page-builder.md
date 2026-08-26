# 43 — Cogenta Page Builder (CPB)

> **État** : le socle (L16) est solide — glisser-déposer, édition en place, panneau
> d'insertion, undo/redo, trois largeurs d'aperçu, fidélité à l'octet avec la page
> publiée. L'ambition « niveau Elementor/Divi/WPBakery » se heurte frontalement à
> **ADR-0009**, actée : « le vocabulaire doit rester petit, une dizaine de blocs,
> pas cinquante ». Cette fiche découpe le travail en sous-chantiers dont la plupart
> n'ont aucun impact contrat, et isole ceux qui en ont un derrière une décision
> explicite à prendre avant de coder.
> **Fichiers** : `packages/admin/src/builder/*`, `packages/cli/src/commands/theme-render.ts`,
> `packages/blocks/src/{vocabulary,registry,errors}.ts`, `packages/theme-kit/src/page.ts`
> **Effort** : 4–5 jours (sous-chantiers A/B/E, repris de la fiche 05) + 3–5 jours (D) +
> 2–3 jours (F) + inconnue tant que la décision du sous-chantier C n'est pas prise
> **ADR/RFC requise** : **oui**, pour le sous-chantier C — pas pour les autres

---

## 1. Ce qui existe réellement

`packages/admin/src/builder/` (8 fichiers) : `page-builder.tsx` (orchestrateur),
`block-moves.ts` (insert/move/remove/setInlineText/updateBlockData, pures),
`block-outline.tsx` (liste latérale + boutons nommés), `block-picker.tsx` (panneau
d'insertion), `block-library.ts` (catégorisation admin-only des 12 blocs, recherche
par libellé et par nom de type, insensible aux accents), `preview-dom.ts` (câblage
DOM de l'iframe : drag natif, édition en place, zéro dépendance), `preview-frame.tsx`,
`history.ts` (undo/redo, 50 instantanés), `viewports.ts` (3 largeurs).

`packages/cli/src/commands/theme-render.ts` : `renderDraftPage` superpose un
`DraftPage` non enregistré sur l'entrée stockée lue via le gateway à permissions
vérifiées, puis délègue à `renderEntryPage` — **la même et unique fonction** que la
page publiée. Route `POST /api/builder/render`, trois portes dans l'ordre (acteur
authentifié, `update` via `PermissionLayer`, lecture du gateway).

`preview-dom.ts` : édition en place uniquement sur `[data-field]` (texte simple,
`contenteditable="plaintext-only"`, lecture `textContent` jamais `innerHTML` — R3
tenu), glisser-déposer natif sur `[data-block-key]`, sélection au clic, formulaires
et liens neutralisés dans l'iframe. `docs/04-contrats.md` (contrat D) documente ces
deux attributs comme posés à **tout** rendu, pas seulement en aperçu — un test de
fidélité prouve que le `<body>` de l'aperçu est identique octet pour octet à l'URL
publique.

**Rien de plus n'existe** : pas de bibliothèque de motifs, pas de copier-coller, pas
de blocs réutilisables/synchronisés, pas d'édition en place sur texte riche, pas de
verrouillage, pas de sélection multiple.

**Mécanique de blocs** (contrat B, `packages/blocks/src/vocabulary.ts`) : 12 types.
`render-block.ts` (identique dans les 5 thèmes) est un `switch` **exhaustif** sur
`VocabularyBlock`, vérifié `never` — le rendu refuse de compiler si un 13ᵉ type
apparaît. `PageContent.blocks` est typé `readonly VocabularyBlock[]`, fermé.

**Découverte non triviale** : `packages/blocks/src/registry.ts` a un vrai
`BlockRegistry` (`register()`, `resolveRenderable()` qui suit la chaîne `fallback`
jusqu'à un bloc que le thème implémente réellement — « l'anti-verrouillage du
contrat B rendu concret », commentaire du fichier). Mais ce registre n'est consommé
que côté **écriture/validation** (`packages/api/src/rest/dependencies.ts`,
`router.ts`) — **jamais côté rendu**. Le mécanisme « bloc de thème avec repli » est
donc câblé à moitié.

**Aucun concept de « modèle de page »** n'existe (recherché dans `docs/`,
`packages/`, aucune trace) — `create-cogenta`/blueprints scaffoldent un site entier
(collections + démo), jamais une mise en page réutilisable insérable dans une page
existante.

**Personnalisation visuelle par bloc** : le contrat B est explicite — « un bloc
stocke de la donnée sémantique, jamais du HTML, jamais de CSS ». Seul levier
existant : `Action.emphasis?: 'primary' | 'secondary'` (intention sémantique, pas
une classe). Le skin (`theme.tokens.json`, contrat D) reste global au site.

**Contrainte structurelle** : ADR-0009, actée — « chaque bloc ajouté est une dette
imposée à chaque auteur de thème » — directement en tension avec « ultra complet,
absolument tout ».

## 2. Ce que font Elementor/Divi/WPBakery

Dizaines de modules (colonnes, onglets, accordéons, compteurs, témoignages,
formulaires intégrés, galeries avancées, timers, tableaux de prix…), imbrication
libre en lignes/colonnes avec styles CSS arbitraires par élément, bibliothèque de
modèles complets et de sections préfaites, blocs globaux synchronisés multi-pages,
presse-papiers de style, historique visuel, breakpoints personnalisés. Leur socle
technique est justement ce que Cogenta a délibérément refusé (ADR-0009, R3) :
CSS/HTML arbitraire stocké par élément et imbrication libre.

## 3. Écarts, classés

**Bloquants** (impossibles sans revisiter une décision actée) :
1. Vocabulaire fermé à 12 types contre « des dizaines de composants ».
2. Personnalisation de style libre par bloc, interdite par R3/contrat B tel quel.
3. Imbrication en colonnes/sections, explicitement hors v1 du contrat B.

**Importants** (déjà connus depuis la fiche 05, non résolus) :
4. Pas de bibliothèque de motifs ni de modèles de page complets.
5. Pas de copier-coller entre pages, pas de blocs réutilisables synchronisés.
6. Édition en place limitée au texte simple.
7. Le registre de blocs de thème existe côté validation, pas côté rendu.

**Confort** : verrouillage de bloc, sélection multiple, vue plan de document.

## 4. Sous-chantiers (parallélisables, un dossier isolé chacun)

### A — Bibliothèque de motifs et modèles de page

Reprend et étend la fiche 05 tâche 1 : table `pattern`, route `/api/patterns`,
insertion dans le panneau existant. Second niveau nouveau : « modèle de page
complet » (remplace toute la zone de blocs). Zéro impact contrat — un motif/modèle
est une liste de blocs existants et de valeurs de champs.

### B — Copier/coller et blocs réutilisables (motif figé)

Reprend fiche 05 tâches 2-3(a) telles quelles. Zéro impact contrat.

### C — Extension des composants *(décision requise avant de coder)*

Deux options, à trancher par l'humain :
- **(i)** RFC contrat B pour élargir le plafond ADR-0009 — cérémonie complète, pas
  de code avant.
- **(ii)** Achever le registre de blocs de thème côté rendu (les 5 thèmes +
  `theme-kit`) pour permettre des composants **propres à un thème**, sans toucher
  au contrat. Sortir `PageContent.blocks`/`renderBlock` du `switch` exhaustif fermé.

Recommandation : (ii) d'abord — répond à une bonne partie du besoin (« plus de
composants ») sans rouvrir une décision actée, et le registre existe déjà à moitié.

### D — Personnalisation visuelle par bloc

Concevoir un vocabulaire de **variantes sémantiques** (à la manière d'`emphasis`)
plutôt qu'un style libre. Ajouter un champ à un bloc existant est une modification
majeure du contrat B (RFC) si le champ est nouveau ; rester limité à des tokens de
skin déjà existants, appliqués différemment selon la variante choisie, reste
hors-contrat.

### E — UX (verrouillage, sélection multiple, texte riche en place)

Reprend fiche 05 tâches 4-5 telles quelles. Zéro impact contrat.

### F — Import/export de motifs et modèles

Nouveau, à cadrer (format JSON, `provenance: 'human' | 'generated'` cohérent avec
le contrat A si un motif est généré par IA).

## 5. Critères d'acceptation (sous-chantiers A/B/E/F)

- Un motif inséré depuis la bibliothèque produit exactement les blocs qu'il décrit,
  jamais de HTML/CSS caché.
- Un modèle de page complet remplace la zone de blocs après confirmation explicite,
  jamais silencieusement.
- Copier une sélection de blocs et la coller dans une autre page produit un résultat
  identique, blocs par blocs.
- L'export d'un motif/modèle est un JSON relisible par l'import, testé aller-retour.

## 6. Tests exigés

- Fidélité à l'octet maintenue (le test existant de L16 doit rester vert après
  chaque sous-chantier).
- Sous-chantier C(ii) : test de contrat identique sur les 5 thèmes prouvant qu'un
  bloc de thème sans implémentation retombe sur son `fallback`, jamais une page
  blanche.
- Permissions : `update` sur la collection requis pour insérer un motif/modèle,
  comme pour tout autre bloc.

## 7. Pièges connus

- Ne jamais laisser un motif/modèle stocker du HTML ou du CSS — R3 s'applique à un
  motif exactement comme à un bloc unitaire.
- Le sous-chantier C(ii) touche les 5 thèmes en parallèle du contrat B/D — vérifier
  chaque thème individuellement avant fusion, jamais une fusion en aveugle (règle
  déjà appliquée à L23).

## 8. Décisions à prendre

- **Sous-chantier C** : RFC contrat B (élargir ADR-0009) vs. achever le registre de
  blocs de thème — préalable à tout chiffrage de ce sous-chantier précis.
- Ampleur du sous-chantier D (personnalisation visuelle) : rester dans les tokens de
  skin existants, ou ouvrir une RFC pour un nouveau champ de variante par bloc.

**Tranchées le 2026-08-26, en direct avec l'utilisateur : « page builder ultra
complet », comme WordPress/Elementor — pas seulement des blocs propres à un
thème.**

- **Sous-chantier C : les deux en parallèle.** (ii) achever le registre de blocs
  de thème côté rendu démarre immédiatement (zéro impact contrat, résultats
  visibles pendant que (i) s'instruit). (i) RFC contrat B pour élargir
  significativement le vocabulaire (au-delà des 12 actuels) **rédigée** :
  `docs/rfc/0001-widen-block-vocabulary.md`, prête à déposer comme issue GitHub
  (gabarit `.github/ISSUE_TEMPLATE/rfc.yml`) — discussion publique de sept jours
  minimum avant toute décision (`docs/rfc/README.md`), rouvre explicitement
  ADR-0009 (renoncement assumé, même schéma que le renversement L22→L24 sur
  LangGraph).
- **Sous-chantier D : élargi au-delà des tokens de skin existants.** RFC **rédigée** :
  `docs/rfc/0002-per-block-visual-variant.md` — nouveau champ partagé `variant`
  (fond/espacement/alignement/largeur) sur la forme de base de tout bloc, jetons
  sémantiques uniquement (R3 tenu), additif et rétrocompatible.
- **Tranché le 2026-08-26** : pas d'issue GitHub — projet encore en mode
  développement, le délai de discussion publique de sept jours n'a pas de sens
  sans tiers externes à consulter. `docs/rfc/0001-*.md` et `0002-*.md` valent
  justification écrite et suffisent à débloquer le code ; à déposer comme
  vraies issues GitHub plus tard, si/quand le projet s'ouvre à des contributeurs
  externes.
- Sous-chantier A (modèles de page complets) reste indépendant de cette décision
  et peut démarrer dès maintenant.
