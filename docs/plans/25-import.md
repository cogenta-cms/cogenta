# 25 — Import

> **État** : partiel — WordPress seulement, en un coup, sans prévisualisation.
> **Écran** : `packages/admin/src/routes/import.tsx` (160 lignes)
> **Paquet** : `@cogenta/import` (WXR WordPress, L9 tâche 6)
> **CLI** : `cogenta import wordpress`
> **Effort** : 4–5 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- `@cogenta/import` lit un export WordPress (WXR).
- `cogenta import wordpress` en ligne de commande.
- `routes/import.tsx` : téléverse le fichier et affiche **le même rapport** que la
  CLI. L'écran ne duplique pas la logique — bonne décision.
- `admin` seulement.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Strapi 5 | Cogenta |
|---|---|---|---|---|
| Import WordPress | ✅ | ✅ (migrate) | plugin | ✅ |
| Import CSV / JSON | ✅ | ✅ | ✅ | ❌ |
| Import RSS / Atom | ✅ | ✅ | ❌ | ❌ |
| **Correspondance des champs** | ✅ | ✅ | ✅ | ❌ |
| **Prévisualisation avant écriture** | partiel | ✅ | ✅ | ❌ |
| Import des médias distants | ✅ | ✅ | partiel | ? |
| Attribution des auteurs | ✅ | ✅ | ❌ | ? |
| Reprise après interruption | ❌ | ✅ | ❌ | ❌ |
| **Annulation d'un import** | ❌ | partiel | ❌ | ❌ |
| Rapport détaillé | partiel | ✅ | ✅ | ✅ |
| Import incrémental | ❌ | ✅ | ❌ | ❌ |

## 3. Écarts, classés

### Bloquants

1. **Pas de prévisualisation.** On téléverse et on découvre le résultat. Sur un blog de
   dix ans, c'est irréversible et effrayant — et c'est la raison pour laquelle
   beaucoup de gens n'essaient pas.
2. **Pas d'annulation.** Si l'import produit deux mille entrées mal formées, il n'y a
   aucun moyen de revenir en arrière depuis l'admin. La corbeille d'ADR-0022 pourrait
   servir de filet, mais il faudrait pouvoir sélectionner « tout ce qui vient de cet
   import ».
3. **Pas de correspondance des champs.** Le mapping WordPress → collections est figé
   dans le code. Un site dont les collections ne s'appellent pas `post` et `page` ne
   peut rien importer d'utilisable.

### Importants

4. **Aucun autre format.** CSV est le format d'import le plus universel, et il est
   absent — alors qu'un export CSV existe déjà côté listes.
5. **Un seul passage, synchrone.** Un WXR de 200 Mo dépassera la limite de corps de
   requête et le délai de la requête, exactement comme le téléversement de médias
   (fiche [11](11-mediatheque.md)).
6. **Vérifier les commentaires.** Un WXR en contient ; Cogenta n'a pas de
   commentaires (fiche [15](15-commentaires.md)). Le rapport doit dire clairement ce
   qui a été **ignoré** — un import qui perd des données en silence est un piège.

## 4. Plan de développement

### Tâche 1 — Prévisualisation

**Fichiers** : `@cogenta/import`, `packages/api/src/rest/import-router.ts`,
`routes/import.tsx`.

Deux phases : **analyser** puis **appliquer**. L'analyse produit un rapport complet
sans rien écrire : nombre d'éléments par type, correspondances proposées vers les
collections, champs sans destination, médias à télécharger et leur volume, auteurs
rencontrés, conflits de slug, avertissements, et **la liste de ce qui sera ignoré**.

C'est exactement la forme que L19 a retenue pour le plan de site : proposer, montrer
en détail, appliquer seulement ce qui a été accepté. Réutiliser le motif plutôt que
d'en inventer un autre.

**Critère** : voir tout ce qu'un import va faire avant qu'une ligne soit écrite.

### Tâche 2 — Correspondance des champs

**Fichiers** : `routes/import.tsx`, `@cogenta/import`.

Écran de correspondance : pour chaque type source, la collection cible ; pour chaque
champ source, le champ cible ou « ignorer ». Correspondances proposées automatiquement
par nom, modifiables.

Cas des taxonomies : catégories et étiquettes WordPress vers les taxonomies déclarées
(ADR-0022) — c'est ce qui rend l'import réellement utile.

### Tâche 3 — Import en tâche de fond, avec reprise

**Fichiers** : `import-router.ts`, file (`queue`).

- Téléversement en flux (même correctif que la fiche [11](11-mediatheque.md) tâche 1 —
  ne pas faire le travail deux fois).
- Traitement par la file, avec avancement.
- Reprise : si l'import s'interrompt, il redémarre là où il s'était arrêté. Un
  identifiant d'import stocké sur chaque entrée créée le permet — et sert aussi à la
  tâche 4.

### Tâche 4 — Annulation

**Fichiers** : `@cogenta/import`, `routes/import.tsx`.

Marquer chaque entrée créée avec l'identifiant de l'import. « Annuler cet import » met
tout à la corbeille (jamais `purge` — ADR-0022 permet de revenir sur l'annulation
elle-même). Un compte rendu dit ce qui n'a pas pu être annulé, typiquement une entrée
modifiée depuis.

Où stocker l'identifiant d'import ? Le contrat A porte `provenance` et
`provenanceDetail` (utilisés par L19 pour marquer le contenu généré). Vérifier s'ils
conviennent — probablement oui, et ce serait alors **zéro contrat touché**, ce qui
est la meilleure des réponses.

**Critère** : annuler un import de deux mille entrées en une opération.

### Tâche 5 — CSV et autres sources

**Fichiers** : `@cogenta/import`.

- **CSV** : la source la plus universelle, et la moins coûteuse à écrire (R9 : un
  parseur CSV correct, avec guillemets et sauts de ligne échappés, fait une centaine
  de lignes — pas de dépendance). Réutilise l'écran de correspondance de la tâche 2.
- **JSON** : import d'un export Cogenta (aller-retour avec la fiche
  [26](26-export-et-sauvegarde.md)).
- **RSS/Atom** : utile pour amorcer un site, faible coût.

### Tâche 6 — Médias et auteurs

**Fichiers** : `@cogenta/import`.

- Télécharger les médias distants référencés, réécrire les références, et **respecter
  la règle d'alternative textuelle** — un import qui crée deux mille images sans `alt`
  produit un site inaccessible. Récupérer l'`alt` du HTML source quand il existe ; le
  reste alimente la liste « à compléter » de la fiche [11](11-mediatheque.md).
- Auteurs : correspondance avec les comptes existants, ou création (avec la question
  d'invitation de la fiche [17](17-utilisateurs.md)), ou attribution à un compte
  unique.
- **R8** : tout ce qui vient d'un import est de la donnée, jamais une instruction.
  Aucun contenu importé ne doit atteindre un prompt système. C'est déjà la règle du
  projet, mais l'import est précisément le vecteur qu'elle vise.

## 5. Critères d'acceptation

- On voit ce qu'un import va faire avant qu'il le fasse.
- On peut l'annuler.
- Le rapport nomme explicitement ce qui a été ignoré.
- Un fichier volumineux n'échoue plus par dépassement de délai.
- Aucune image importée n'échappe à la règle d'alternative textuelle.
- Le contenu importé est traité comme de la donnée (R8).

## 6. Tests exigés

- Bout en bout : analyser puis appliquer un vrai WXR, comparer au rapport annoncé.
- Bout en bout : annuler l'import, vérifier que tout est à la corbeille et
  restaurable.
- Bout en bout : reprise après interruption, sans doublon.
- Unitaires : parseur CSV (guillemets, sauts de ligne dans une cellule, BOM, CRLF).
- Sécurité : contenu importé portant une charge d'injection — vérifier qu'il n'atteint
  aucun prompt système (rejouer le motif du test d'injection de L18).
- Permissions : `admin` seulement.

## 7. Pièges connus

- **Un import silencieusement partiel est pire qu'un échec.** Le rapport doit lister
  ce qui a été ignoré, en particulier les commentaires tant que la fiche 15 n'existe
  pas.
- **Les médias distants sont des requêtes sortantes vers des URL fournies par un
  fichier.** SSRF : refuser les adresses locales et privées, plafonner la taille et le
  nombre, imposer un délai.
- **Deux mille images sans `alt`** est une régression d'accessibilité massive.
- **R8** : l'import est le vecteur d'injection par excellence.
- **L'annulation par corbeille** dépend du fait que `delete()` ne détruit rien
  (ADR-0022). Ne jamais annuler par `purge`.
- **Ne pas dupliquer la logique d'import dans l'écran.** L'écran actuel s'en garde
  bien ; la prévisualisation doit venir du paquet, pas d'une deuxième analyse.

## 8. Décisions à prendre

- Identifiant d'import : réutiliser `provenance`/`provenanceDetail` (recommandé, aucun
  contrat touché) ou un champ dédié.
- Auteurs importés : créer des comptes ou tout attribuer à l'importateur.
