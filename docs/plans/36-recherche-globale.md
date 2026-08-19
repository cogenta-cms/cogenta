# 36 — Recherche globale

> **État** : partiel — trois sources réelles, aucune profondeur.
> **Écran** : `packages/admin/src/shell/global-search.tsx` (255 lignes)
> **API existante** : `GET /api/search` (`createSearchRouter`, L10 tâche 3),
> `GET /api/media?q=`, `GET /api/users?q=`
> **Effort** : 3–4 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- Trois points d'accès interrogés **en parallèle depuis le navigateur**, plutôt qu'une
  route agrégée côté serveur. Le raisonnement est écrit dans le fichier et il est
  bon : une route agrégée ferait les trois mêmes appels en interne et ajouterait une
  quatrième surface de permission pour rien.
- Les permissions sont respectées **par construction** : `/api/search` filtre selon ce
  que l'acteur peut lire, `/api/media` exige une session, et `/api/users` n'est appelé
  que si l'acteur a le rôle `admin`. Rien n'élargit ce que ces routes autorisent déjà
  (R4).
- Popover de résultats groupés par source.
- Côté serveur, `withSearchIndexing` décore le `ContentStore` — un seul enveloppement
  couvre REST et GraphQL, puisque `serve.ts` leur donne les mêmes instances.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Contentful | Cogenta |
|---|---|---|---|---|
| Recherche de contenu | ✅ | ✅ | ✅ | ✅ |
| Médias, comptes | partiel | ✅ | ✅ | ✅ |
| **Actions et navigation** (`⌘K`) | ❌ | ❌ | ✅ | ❌ |
| Raccourci clavier | ❌ | ✅ | ✅ | ❌ |
| Extraits avec le terme surligné | ✅ | ❌ | ✅ | ❌ |
| Recherches récentes | ❌ | ❌ | ✅ | ❌ |
| Filtres dans la recherche (`status:draft`) | ❌ | ❌ | ✅ | ❌ |
| Page de résultats complète | ✅ | ✅ | ✅ | ❌ (popover seul) |
| Recherche sémantique | ❌ | ❌ | ❌ | outil ✅, non branché |
| Tolérance aux fautes de frappe | ❌ | ❌ | ✅ | ❌ |

## 3. Écarts, classés

### Importants

1. **Pas de raccourci clavier.** Une recherche globale qu'on doit atteindre à la souris
   n'est utilisée que par ceux qui la remarquent.
2. **Pas de page de résultats.** Le popover coupe la liste ; il n'y a pas de « voir
   tous les résultats ».
3. **Pas d'extrait ni de surlignage.** Un titre seul ne dit pas pourquoi le résultat
   correspond.
4. **Ne couvre ni les taxonomies, ni les menus, ni les commandes, ni les extensions**
   — au fur et à mesure que l'admin grandit, l'écart grandit avec.

### Confort

5. Pas de recherches récentes.
6. Pas de filtres en ligne (`status:draft`, `collection:article`).
7. Pas de tolérance aux fautes de frappe.
8. La recherche sémantique existe (`assist.chat`, l'index vectoriel de L18) mais n'est
   pas offerte ici.

## 4. Plan de développement

### Tâche 1 — Raccourci et palette

**Fichiers** : `shell/global-search.tsx`, `shell/app-shell.tsx`.

`⌘K` / `Ctrl+K` ouvre la recherche depuis n'importe quel écran, sauf quand le focus
est dans un champ de saisie. Navigation aux flèches, `Entrée` ouvre, `Échap` ferme,
piège de focus correct.

Au-dessus des résultats, des **actions** : « aller à … » pour chaque section visible,
« créer un … » pour chaque collection où `canPerform('create')`, plus quelques
commandes (basculer le thème, se déconnecter). C'est la moitié la plus utilisée d'une
palette de commandes, et elle ne coûte aucune requête.

**Critère** : créer un article en trois touches depuis n'importe quel écran.

### Tâche 2 — Page de résultats

**Fichiers** : nouvelle route `packages/admin/src/routes/search.tsx`.

`Entrée` sur la recherche vide de sélection ouvre une page complète : résultats
paginés, onglets par source avec compteurs, filtres (collection, statut, langue,
période), tri par pertinence ou par date.

L'URL porte la requête (`/search?q=…&type=content`), donc partageable et compatible
avec le bouton retour.

### Tâche 3 — Extraits et surlignage

**Fichiers** : `packages/api/src/rest/search-router.ts`,
`packages/schema/src/` (indexation), écrans.

`SearchHit` est aujourd'hui une forme plus étroite qu'`Entry` (le code de la liste de
contenu le note : pas de `createdAt`/`updatedAt`). L'enrichir d'un extrait avec les
positions des termes trouvés, puis surligner côté écran.

**Ne pas construire l'extrait à partir de HTML** : le contenu est du portable-text, il
faut en extraire le texte. Et l'extrait est de la donnée — échapper au rendu (R8/R3).

### Tâche 4 — Élargir les sources

**Fichiers** : `shell/global-search.tsx`, routes concernées.

Ajouter : taxonomies (termes), menus, commandes (par numéro et e-mail, si l'acteur a
`commerce.read`), extensions, réglages.

Chaque source garde **sa propre porte de permission**, comme aujourd'hui — c'est ce qui
fait que ce composant n'élargit rien. Une source qu'un acteur ne peut pas lire n'est
pas appelée du tout, plutôt qu'appelée et filtrée.

Attention au nombre d'appels parallèles : au-delà de cinq ou six, la décision « pas de
route agrégée » mérite d'être rouverte. C'est le seuil à surveiller, pas une règle
éternelle.

### Tâche 5 — Confort de frappe

**Fichiers** : `shell/global-search.tsx`, `search-router.ts`.

- Recherches récentes en `localStorage` (jamais côté serveur : ce sont des requêtes
  d'une personne).
- Filtres en ligne (`status:draft mot`), analysés côté client et traduits en paramètres
  de requête.
- Tolérance aux fautes : à mesurer avant d'implémenter. Selon le moteur de recherche
  plein texte sous-jacent (les trois bases n'offrent pas la même chose), c'est soit
  gratuit, soit très coûteux. **Ne pas l'implémenter côté client** sur un jeu de
  résultats déjà filtré : cela ne trouve rien de plus.

### Tâche 6 — Recherche sémantique, en option

**Fichiers** : `shell/global-search.tsx`, index vectoriel de L18.

Un onglet « recherche par le sens », alimenté par l'index vectoriel, **présent
uniquement quand l'index existe et contient quelque chose** (R2 : la recherche
lexicale reste la voie principale et fonctionne sans IA).

Rappel de `BLOCKERS.md` §8 : l'indexation est d'un chunk par entrée, sans vrai
découpage, et aucun adaptateur d'embeddings distant n'existe. Les résultats seront donc
grossiers — le dire plutôt que de laisser croire à mieux.

## 5. Critères d'acceptation

- La recherche s'ouvre au clavier depuis n'importe où.
- Un résultat montre pourquoi il correspond.
- Une recherche a une page à elle, partageable par URL.
- Aucune source n'est interrogée pour un acteur qui ne peut pas la lire.
- La recherche lexicale fonctionne sans aucun fournisseur IA (R2).

## 6. Tests exigés

- Composant : `/api/users` n'est **pas** appelé pour un non-`admin` (propriété
  actuelle, test de non-régression).
- Composant : raccourci ignoré quand le focus est dans un champ.
- Unitaires : analyse des filtres en ligne.
- Unitaires : extraction d'extrait depuis du portable-text, avec échappement.
- Bout en bout : recherche d'une entrée créée à l'instant, contre un vrai serveur —
  ce qui vérifie au passage que `withSearchIndexing` indexe bien à l'écriture.
- Accessibilité : `role="combobox"`/`listbox` corrects, annonce du nombre de résultats.

## 7. Pièges connus

- **La décision « pas de route agrégée » est argumentée** dans le fichier. Elle tient
  tant que le nombre de sources reste petit. Le seuil, pas le dogme.
- **Un extrait est du contenu externe au rendu** : échapper (R3/R8).
- **Chercher dans les brouillons d'autrui** est une fuite. `/api/search` filtre déjà ;
  toute source nouvelle doit filtrer aussi.
- **La tolérance aux fautes côté client ne sert à rien** : elle s'applique après le
  filtrage serveur.
- **`withSearchIndexing` indexe à l'écriture.** Le contenu importé ou créé avant son
  activation n'est pas indexé — d'où la réindexation de la fiche
  [24](24-sante-et-outils.md).
- **La recherche par le sens sur un chunk par entrée** donne des résultats grossiers.
  Ne pas la présenter comme meilleure que la recherche lexicale.

## 8. Décisions à prendre

- Route agrégée : à rouvrir si le nombre de sources dépasse cinq ou six.
- Tolérance aux fautes : mesurer ce que chaque moteur offre nativement avant de
  décider.
