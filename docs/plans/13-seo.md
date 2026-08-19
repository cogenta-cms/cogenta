# 13 — SEO éditorial

> **État** : **absent côté admin.** Le moteur SEO est complet et branché ; aucun écran
> ne permet à un éditeur d'y toucher.
> **Paquet** : `@cogenta/seo` (130 tests), branché par `cogenta serve` (L10 tâches 1-2)
> **Écran** : aucun
> **Effort** : 5–6 jours
> **ADR requise** : **probablement oui** — les champs SEO n'existent pas au contrat A

---

## 1. Ce qui existe réellement

Beaucoup, côté serveur, et rien côté écran.

`cogenta serve` produit déjà, pour chaque page rendue : titre, meta description,
canonique, `hreflang` de la famille de traduction, Open Graph, Twitter Card, un bloc
JSON-LD. `/robots.txt`, `/sitemap.xml` et ses fragments `/sitemap-N.xml` sont servis
depuis le contenu vivant, toujours lus en `ANONYMOUS`. La table de redirections
s'applique avant le routage.

Deux détails qui comptent :

- `isPublished` de `@cogenta/seo` refusait toute entrée dont `publishedAt` est `null`
  — bug réel trouvé en L10 : chaque page recevait `noindex, nofollow` et le sitemap
  était vide. Corrigé. C'est le genre de régression qu'un écran de diagnostic aurait
  rendue visible en dix secondes.
- Une collection routée fermée au rôle `public` faisait répondre 500 à
  `/sitemap.xml` ; elle est maintenant sautée.

Et deux panneaux d'assistant existent dans l'éditeur : FAQ et Schema.org
(`assist/faq-schema-panel.tsx`) — mais ils écrivent des blocs, ils ne pilotent pas les
métadonnées.

**Ce qui n'existe pas** : aucun moyen, depuis l'admin, de définir un titre SEO
différent du titre de la page, une description, une image de partage, un `noindex`
ponctuel, ou de voir à quoi ressemblera le résultat dans Google.

## 2. Ce que font les CMS de référence

| Fonction | Yoast / Rank Math | Drupal (Metatag) | Strapi | Cogenta |
|---|---|---|---|---|
| Titre SEO distinct du titre de page | ✅ | ✅ | plugin | ❌ |
| Meta description éditable | ✅ | ✅ | plugin | ❌ (générée) |
| Aperçu Google / réseaux sociaux | ✅ | partiel | ❌ | ❌ |
| Image de partage par entrée | ✅ | ✅ | ✅ | ❌ (dérivée) |
| `noindex` / `nofollow` par entrée | ✅ | ✅ | ❌ | ❌ |
| Canonique manuelle | ✅ | ✅ | ❌ | ❌ (auto) |
| Analyse de lisibilité / mot-clé | ✅ | ❌ | ❌ | ❌ |
| Gabarits de titre (`%title% — %site%`) | ✅ | ✅ | ❌ | ? |
| Réglages sitemap (exclure une collection) | ✅ | ✅ | ❌ | ❌ |
| Éditeur de `robots.txt` | ✅ | ✅ | ❌ | ❌ |
| JSON-LD par type de contenu | ✅ | ✅ | ❌ | ✅ (auto) |
| Détection de contenu dupliqué | ✅ | ❌ | ❌ | ✅ (`assist.find_duplicates`) |

## 3. Écarts, classés

### Bloquants

1. **Aucun contrôle éditorial.** Tout est dérivé automatiquement. C'est un bon défaut,
   mais un défaut qu'on ne peut pas outrepasser est une impasse : une page dont le
   titre fait quatre-vingts caractères ne peut pas avoir un titre SEO plus court.
2. **Aucune visibilité.** Personne ne peut vérifier ce que le site expose vraiment
   sans consulter le code source de la page. Le bug `isPublished` de L10 a vécu
   jusqu'à ce que quelqu'un branche le sitemap — un écran l'aurait montré.
3. **Pas d'`noindex` par entrée.** Une page de remerciement, une page de test, une
   page légale dupliquée : impossible de les sortir de l'index.

### Importants

4. Pas de réglages sitemap (fréquence, priorité, exclusion d'une collection).
5. Pas d'éditeur de `robots.txt` (aujourd'hui entièrement dérivé).
6. Pas d'image de partage choisie : `og:image` est dérivé du premier asset trouvé.
7. Pas de gabarits de titre configurables.

### Confort

8. Aperçu Google et carte sociale.
9. Analyse de lisibilité — sujet à débat, souvent du folklore ; à ne faire que si
   c'est demandé.

## 4. Plan de développement

### Tâche 0 — Où vivent les métadonnées SEO ? (décision préalable)

Le contrat A est figé et ne déclare aucun champ SEO. Trois options :

- **(a) Champs déclarés par le site.** Le blueprint ajoute `seoTitle`,
  `seoDescription`, `seoImage`, `seoNoindex` comme des champs ordinaires ; `@cogenta/seo`
  les lit s'ils existent. **Zéro contrat touché.** Contrepartie : chaque site doit les
  déclarer, et un site existant ne les a pas.
- **(b) Une table SEO à part**, indexée par (collection, entryId, locale), avec sa
  route `/api/seo`. Zéro contrat A touché, s'applique à tout site immédiatement, mais
  crée un second endroit où vit une donnée d'entrée — avec ses questions propres :
  suit-elle la corbeille ? la duplication ? la traduction ? les versions ?
- **(c) Étendre le contrat A** avec un bloc `seo` système. **ADR + `schema@2.1`.**
  Le plus propre conceptuellement, le plus coûteux.

**Recommandation : (a) d'abord, avec un repli.** Les blueprints de `create-cogenta`
déclarent les quatre champs ; `@cogenta/seo` les consomme quand ils existent et garde
la dérivation automatique sinon. Un site existant ajoute quatre lignes à son schéma.
C'est la seule option qui ne crée ni contrat nouveau, ni second lieu de vérité.

**Livrable** : une note de décision courte, et le champ retenu documenté dans
`docs/04-contrats.md` s'il devient une convention.

### Tâche 1 — Panneau SEO dans l'éditeur

**Fichiers** : nouveau `packages/admin/src/seo/seo-panel.tsx`,
`routes/entry-edit.tsx`.

Un accordéon dans la barre latérale (fiche [02](02-editeur-d-entree.md)) :

- Titre SEO, avec compteur et **aperçu de la troncature** à ~60 caractères, valeur
  dérivée affichée en gris quand le champ est vide.
- Meta description, même traitement, ~155 caractères.
- Image de partage (sélecteur média).
- Interrupteur `noindex`, avec un avertissement explicite quand il est actif sur une
  page publiée.
- Canonique manuelle (champ avancé, replié).
- **Aperçu** : rendu du résultat Google et de la carte Open Graph, construits à
  partir des **mêmes fonctions** que `@cogenta/seo` — jamais une deuxième
  implémentation côté admin, sinon l'aperçu ment. Le plus sûr est une route
  `GET /api/seo/preview?collection=&id=` qui renvoie les métadonnées réellement
  calculées.

**Critère** : modifier le titre SEO, voir l'aperçu changer, publier, et retrouver
exactement ce titre dans le `<title>` de la page servie.

### Tâche 2 — Écran SEO du site

**Fichiers** : nouvelle route `packages/admin/src/routes/seo.tsx`,
`packages/api/src/rest/` (nouvelle route de diagnostic).

Trois sections :

1. **Diagnostic** — état du sitemap (nombre d'URL, dernière génération, collections
   incluses/exclues et pourquoi), état de `robots.txt`, nombre de pages en `noindex`,
   pages sans description, pages avec un titre trop long, doublons de titre. Chaque
   ligne cliquable vers l'entrée concernée. **C'est cette section qui aurait attrapé
   le bug `isPublished`**, et c'est elle qu'il faut livrer en premier.
2. **Réglages sitemap** — collections incluses, fréquence, priorité par collection.
3. **`robots.txt`** — dérivé par défaut, avec la possibilité d'ajouter des règles, et
   un avertissement en rouge sur `Disallow: /`, qui est la façon classique de
   désindexer un site entier par accident.

**Critère** : l'écran dit combien d'URL contient le sitemap, et lister zéro URL sur un
site publié apparaît comme une anomalie signalée, pas comme un chiffre neutre.

### Tâche 3 — Gabarits de titre

**Fichiers** : configuration (`@cogenta/core`), `@cogenta/seo`, écran de la tâche 2.

`%title% — %site%` par défaut, configurable par collection. Vérifier ce que
`@cogenta/seo` fait déjà avant d'ajouter : il compose sans doute déjà quelque chose.

### Tâche 4 — Le lien avec l'IA, sans en faire un passage obligé

**Fichiers** : `packages/admin/src/seo/seo-panel.tsx`.

Boutons « proposer une description », « proposer un titre » branchés sur les outils
d'assistant existants — jamais appliqués sans clic (R6), et **absents** sans
fournisseur (R2). Le panneau SEO doit fonctionner entièrement sans IA ; l'IA n'est
qu'un raccourci.

## 5. Critères d'acceptation

- Un éditeur définit un titre SEO et une description, et les retrouve mot pour mot
  dans le HTML servi.
- Une page peut être mise en `noindex` depuis l'admin.
- L'aperçu affiché est calculé par le même code que le rendu — jamais une
  approximation.
- Le diagnostic signale une anomalie de sitemap avant qu'un client ne la découvre.
- Sans fournisseur IA, tout l'écran fonctionne (R2).
- Aucun contrat figé n'a été modifié sans ADR.

## 6. Tests exigés

- Bout en bout : définir un titre SEO, publier, `curl` la page, comparer le `<title>`.
- Bout en bout : `noindex` sur une entrée publiée → `robots` meta correcte **et**
  absence de l'URL dans `/sitemap.xml`.
- Unitaires : le diagnostic détecte un sitemap vide sur un site pourtant publié
  (rejouer précisément la régression `isPublished` de L10 comme test de
  non-régression).
- Unitaires : `Disallow: /` déclenche l'avertissement.
- Permissions : le panneau SEO suit `update` sur la collection ; l'écran SEO du site
  est `admin`.

## 7. Pièges connus

- **Un aperçu réimplémenté côté admin ment.** C'est le piège central de cette fiche.
  Passer par une route qui renvoie les métadonnées réelles.
- **`noindex` doit sortir l'URL du sitemap**, sinon on demande à Google d'ignorer une
  page qu'on lui indique dans le même souffle.
- **Le sitemap est lu en `ANONYMOUS`** (décision L10). Un champ SEO lisible seulement
  par un rôle authentifié ne doit pas casser sa génération.
- **`Disallow: /`** désindexe un site entier. Confirmation explicite, jamais un simple
  champ de texte libre.
- **Ne pas ajouter de bloc `seo` au contrat B.** La tentation existera ; c'est un
  contrat figé, et le SEO n'est pas un bloc de page.
- **Un champ SEO doit suivre la traduction.** Chaque locale a son titre et sa
  description — ce que l'option (a) donne gratuitement puisque les champs sont
  localisés comme les autres.

## 8. Décisions à prendre

- **Tâche 0** : (a), (b) ou (c). C'est la décision qui conditionne tout le reste, et
  elle doit être prise avant la première ligne de code.
- Si (a) : les quatre champs entrent-ils dans tous les blueprints de
  `create-cogenta` ? (recommandé, sinon un site neuf n'a toujours pas de SEO
  éditorial).
