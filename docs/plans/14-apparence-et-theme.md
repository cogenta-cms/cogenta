# 14 — Apparence et thème

> **État** : **absent côté admin.** Le moteur de skin existe, la CLI l'expose, l'admin
> non.
> **Paquets** : `@cogenta/render` (`renderSkin`, `validateSkin`),
> `@cogenta/theme-canonical`, `@cogenta/agents` (`generateSkin`),
> `@cogenta/plugins` (galerie de skins, L7 tâche 10)
> **CLI** : `cogenta skin list | validate | apply | generate`
> **Écran** : aucun
> **Effort** : 6–8 jours
> **ADR requise** : non, si l'écriture du thème reste soumise aux règles d'ADR-0010

---

## 1. Ce qui existe réellement

- Le **contrat D** décrit un thème/skin, figé depuis le 2026-08-14.
- `renderSkin` produit le CSS du site à partir de `theme.tokens.json`, testé contre le
  vrai fichier du site.
- `validateSkin` valide un skin ; `@cogenta/plugins` porte une galerie de skins qui
  le réutilise tel quel.
- `generateSkin` (L9 tâche 9) génère un skin par IA ; `generateSkinCandidates` (L19)
  en produit deux à cinq, chacun orienté par une direction de design, chacun passé par
  la boucle de validation du contrat D.
- `cogenta skin list/validate/apply/generate` expose tout cela **en ligne de
  commande**.
- L'installeur `npm create cogenta` propose un choix de design.

**Ce qui n'existe pas** : n'importe quoi dans l'admin. Il n'y a même pas d'entrée
« Apparence » dans `NAV_ITEMS`. Changer la couleur d'un site après l'installation
demande un terminal.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Joomla 5 | Cogenta |
|---|---|---|---|---|
| Liste des thèmes installés + aperçu | ✅ | ✅ | ✅ | CLI seulement |
| Activer un thème | ✅ | ✅ | ✅ | CLI seulement |
| Personnaliser couleurs / typo avec aperçu direct | ✅ (Customizer) | partiel | ✅ | ❌ |
| Logo et favicon | ✅ | ✅ | ✅ | ❌ |
| Éditeur de CSS additionnel | ✅ | ❌ | ✅ | ❌ |
| Installer un thème depuis une galerie | ✅ | ✅ | ✅ | modèle ✅, écran ❌ |
| Widgets / zones latérales | ✅ | ✅ | ✅ | blocs (voir fiche 05) |
| Réglages d'accueil (page statique / liste) | ✅ | ✅ | ✅ | ❌ |
| Générer un thème par IA | ❌ | ❌ | ❌ | ✅ **unique** — mais CLI seulement |

## 3. Écarts, classés

### Bloquants

1. **Aucun écran.** C'est l'un des trois grands trous de l'admin, avec les commentaires
   et les formulaires. Un utilisateur qui installe Cogenta ne peut pas changer une
   couleur sans terminal.
2. **`generateSkin` est la fonctionnalité la plus différenciante du produit et elle
   est invisible.** Elle est exposée par la CLI et par l'installeur, et nulle part
   ensuite. C'est un vrai gâchis de valeur déjà construite.

### Importants

3. Pas de logo ni de favicon réglables (aujourd'hui : des fichiers du thème).
4. Pas de choix de page d'accueil. `theme-render.ts` retente `/home` en dur — ce qui
   est un pansement honnête, mais reste un slug codé en dur.
5. Pas de CSS additionnel : le moindre ajustement demande de modifier le thème.

### Confort

6. Pas d'aperçu avant application.
7. Un seul thème réellement servi par `cogenta serve` — limite documentée, à ne pas
   confondre avec un manque d'écran.

## 4. Plan de développement

### Tâche 0 — Où l'écriture est-elle permise ? (décision préalable)

ADR-0010 : le schéma est en lecture seule en production. L19 a rencontré exactement le
même mur et a tranché ainsi : **proposer et relire partout, appliquer seulement sous
`cogenta dev`**, avec `CONTENT_READ_ONLY` et la marche à suivre en production.

Un skin n'est pas un schéma. Mais `theme.tokens.json` est un fichier du dépôt, versionné
et déployé avec le code. Deux régimes possibles :

- **(a) Même règle que L19** : proposition et aperçu partout, écriture du fichier
  seulement en développement. Cohérent, sans surprise, mais laisse un utilisateur en
  production incapable de changer une couleur — exactement ce que cette fiche veut
  corriger.
- **(b) Les jetons de thème deviennent une donnée de site**, stockée en base comme les
  menus et les redirections, et **surchargeant** le fichier au rendu. Le fichier reste
  le défaut versionné ; la base porte la personnalisation. C'est le modèle du
  Customizer de WordPress, et c'est ce qui rend le sujet réellement utilisable.

**Recommandation : (b)**, avec deux garde-fous : les surcharges sont **exportables**
vers le fichier (pour qu'un déploiement puisse les figer), et l'écran affiche
clairement quelles valeurs viennent du fichier et lesquelles de la base. Cela ne
contredit pas ADR-0010, qui porte sur le **schéma** — mais la distinction mérite d'être
écrite noir sur blanc, donc **une ADR courte est prudente**.

### Tâche 1 — Écran « Apparence »

**Fichiers** : nouvelle route `packages/admin/src/routes/appearance.tsx`,
`shell/nav-items.ts`, nouvelle route API `/api/theme`.

- Thème actif, sa description, ses jetons.
- Liste des skins disponibles (la galerie de `@cogenta/plugins` existe déjà, avec sa
  validation), avec vignette.
- Bouton « appliquer », avec les mêmes portes que la CLI : validation contrat D puis
  écriture.

**Critère** : voir le thème actif et la liste des skins disponibles, sans terminal.

### Tâche 2 — Personnalisation avec aperçu réel

**Fichiers** : `routes/appearance.tsx`, réutilisation de
`POST /api/builder/render`.

Éditeur de jetons : couleurs, typographies, rayons, espacements — **exactement les
jetons du contrat D**, jamais des champs inventés, et générés à partir de la
déclaration du contrat pour qu'un jeton nouveau apparaisse sans changer cet écran.

L'aperçu réutilise la décision fondatrice de L16 : **un iframe sur le vrai rendu
serveur**, jamais une simulation React. Une route de rendu avec des jetons surchargés
non enregistrés est le pendant exact de `POST /api/builder/render` avec des blocs non
enregistrés. Réutiliser le même mécanisme, avec les mêmes portes de permission.

**Critère** : changer la couleur d'accent, voir la vraie page changer, annuler sans
rien avoir écrit.

### Tâche 3 — Génération par IA, dans l'admin

**Fichiers** : `routes/appearance.tsx`, `packages/api/src/rest/` (route),
réutilisation de `generateSkinCandidates`.

Décrire le design voulu en une phrase, obtenir **deux à cinq candidats** — la fonction
existe et refuse déjà de présenter un « choix » d'un seul —, les voir rendus sur une
vraie page, en choisir un, l'appliquer.

Les règles de L19 s'appliquent mot pour mot :

- **R2** : sans fournisseur, la section n'apparaît pas du tout (pas d'erreur, pas
  d'incitation) ;
- **R6** : jamais d'application automatique, un choix explicite ;
- **R8** : le texte de description de l'utilisateur passe par le canal `data`, jamais
  dans un prompt système ;
- validation contrat D avant toute proposition — ce que `generateSkinCandidates` fait
  déjà.

**Critère** : « quelque chose de sobre, chaleureux, plutôt papier » produit trois
propositions visibles sur la vraie page d'accueil, aucune appliquée sans clic.

### Tâche 4 — Identité du site

**Fichiers** : `routes/appearance.tsx`, fiche [23](23-reglages-du-site.md).

Logo, logo sombre, favicon, image de partage par défaut : quatre sélecteurs de média.
Le rendu doit les consommer et retomber sur ceux du thème quand ils sont absents.

Recouvrement assumé avec la fiche 23 (réglages du site) : trancher une fois où vit
l'identité visuelle — recommandation : **ici**, parce que c'est là qu'on la cherche.

### Tâche 5 — Page d'accueil et CSS additionnel

**Fichiers** : `routes/appearance.tsx`, `theme-render.ts`.

- **Page d'accueil** : choisir explicitement l'entrée servie à `/`, au lieu du repli
  en dur sur `/home`. C'est une vraie correction de conception, pas seulement un
  écran.
- **CSS additionnel** : un champ de texte, injecté après le CSS du thème. Point
  d'attention réel — c'est du CSS arbitraire servi sur l'origine du site : réservé à
  `admin`, et il faut décider s'il est couvert par la CSP configurée (L10 tâche 6) ou
  s'il l'oblige à s'assouplir. Si la CSP du site interdit le style en ligne, cette
  fonctionnalité doit produire une feuille servie, pas une balise `<style>`.

## 5. Critères d'acceptation

- On change l'apparence du site sans terminal.
- L'aperçu est le vrai rendu serveur, jamais une simulation.
- Aucun jeton hors contrat D n'est proposé.
- Sans fournisseur IA, l'écran fonctionne entièrement (R2).
- Le CSS additionnel ne force pas à affaiblir la CSP sans que ce soit dit.
- La provenance de chaque valeur (fichier ou base) est visible.

## 6. Tests exigés

- Bout en bout : appliquer un skin, `curl` la page, vérifier le CSS servi.
- Bout en bout : aperçu avec jetons surchargés non enregistrés, puis annulation —
  vérifier que rien n'a été écrit.
- Unitaires : refus d'un skin invalide au contrat D (réutiliser `validateSkin`).
- Composant : la section IA disparaît sans fournisseur.
- Permissions : `admin` seulement sur toute écriture de thème.
- Accessibilité : contraste vérifié sur les jetons choisis, avec un avertissement
  quand une combinaison passe sous AA — un éditeur de couleurs sans contrôle de
  contraste produit des sites illisibles.

## 7. Pièges connus

- **Réimplémenter le rendu dans l'admin.** Le piège que L16 a évité pour les blocs se
  représente ici à l'identique pour le CSS. Iframe, rendu serveur.
- **Deux sources de vérité.** Si les jetons vivent à la fois dans le fichier et en
  base, il faut dire lequel gagne, et le dire à l'écran. C'est exactement l'argument
  qui a rendu `ops-settings.tsx` volontairement en lecture seule — le relire avant de
  décider.
- **La CSP et le CSS additionnel** se contredisent facilement (L10 tâche 6).
- **Un éditeur de couleurs sans contrôle de contraste** est un générateur de sites
  inaccessibles.
- **`generateSkin` coûte des jetons.** Afficher le coût, comme le fait le reste du
  runtime agentique.
- **Un seul thème est réellement servi** par `cogenta serve` — limite honnête et
  documentée. Ne pas construire une liste de thèmes activables qui laisserait croire
  le contraire.

## 8. Décisions à prendre

- **Tâche 0** : (a) fichier seul en développement, ou (b) surcharges en base
  (recommandé). ADR courte conseillée dans les deux cas, pour dire explicitement que
  le thème n'est pas le schéma d'ADR-0010.
- Identité visuelle : ici ou dans les réglages du site (fiche 23). Une seule place.
