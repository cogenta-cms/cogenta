# 22 — Tableau de bord

> **État** : partiel — quatre widgets réels, trois emplacements vides et honnêtes.
> **Écran** : `packages/admin/src/routes/dashboard.tsx` (355 lignes)
> **API existante** : `/api/health`, `/api/audit`, `/api/analytics/summary`,
> `/api/content` (contenu programmé)
> **Effort** : 4–5 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Quatre widgets alimentés par de vraies données :

- **Santé du site** (`/api/health`) — le widget dominant.
- **Activité récente** (`/api/audit`).
- **Analytics** (`/api/analytics/summary`), avec un graphique SVG fait main, sans
  bibliothèque (R9).
- **Contenu programmé** (`listEntries` filtré).

Et une bande de bas de page, en pointillés, pour trois widgets qui **n'ont aucune
source de données dans ce dépôt** : CVE ouvertes, Core Web Vitals, sauvegardes. Ils
sont vides et le disent, plutôt que d'afficher un chiffre inventé. C'est la bonne
décision, et le critère d'acceptation de L11 l'exige explicitement.

Note d'implémentation à connaître avant de toucher au fichier : une réécriture en
composants `Card` a été essayée puis **annulée** — elle rendait
`test/notices/notice-board.test.tsx` reproductiblement instable lorsqu'exécuté dans le
même lot que le test de cette route. La structure `<section>`/`<h2>`/`<ul>` actuelle
n'a pas ce problème. Le commentaire du fichier le dit ; ne pas le redécouvrir.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Widgets réorganisables / masquables | ✅ | ❌ | ✅ | ❌ |
| Résumé du contenu (compte par type) | ✅ | ✅ | ✅ | ❌ |
| Activité récente | ✅ | ✅ | ✅ | ✅ |
| Brouillon rapide | ✅ | ❌ | ❌ | ❌ |
| Santé du site | ✅ | ❌ | ✅ | ✅ |
| Analytics | plugin | ❌ | plugin | ✅ |
| Contenu programmé | plugin | ✅ | ✅ | ✅ |
| File de modération à traiter | ✅ | ❌ | ✅ | sans objet (fiche 15) |
| Mises à jour disponibles | ✅ | ❌ | ✅ | ❌ |
| Personnalisation par utilisateur | ✅ | ❌ | ✅ | ❌ |
| Tâches assignées à moi | plugin | ❌ | ✅ | ❌ |

## 3. Écarts, classés

### Importants

1. **Pas de résumé du contenu.** « 42 articles, 8 pages, 3 brouillons » est le premier
   chiffre attendu sur un tableau de bord de CMS, et il n'y est pas. Il dépend du
   comptage de la fiche [01](01-liste-de-contenu.md) tâche 4 — une seule
   implémentation pour les deux.
2. **Aucune personnalisation.** Un contributeur voit les mêmes widgets qu'un
   administrateur, dont plusieurs qu'il ne peut pas exploiter.
3. **Pas de raccourcis d'action.** Aucun « nouvel article » depuis l'accueil.
4. **Les trois emplacements vides restent vides.** Honnête, mais l'objectif reste de
   les remplir ou de les retirer — c'est un critère d'acceptation de L11.

### Confort

5. Pas de widgets réorganisables.
6. Pas de brouillon rapide.
7. Pas de plage de dates sur le widget analytics.

## 4. Plan de développement

### Tâche 1 — Résumé du contenu

**Fichiers** : `routes/dashboard.tsx`, comptage de la fiche
[01](01-liste-de-contenu.md) tâche 4.

Par collection lisible par l'acteur : total, publiés, brouillons, programmés, en
corbeille. Chaque chiffre est un lien vers la liste filtrée correspondante — un chiffre
sur lequel on ne peut pas cliquer est une décoration.

**Une seule requête** agrégée pour toutes les collections, pas une par collection.

**Critère** : depuis l'accueil, atteindre en un clic les brouillons d'une collection.

### Tâche 2 — Widgets par rôle et raccourcis

**Fichiers** : `routes/dashboard.tsx`.

- Un widget ne s'affiche que si l'acteur peut exploiter sa donnée : santé, analytics
  et audit sont `admin` ; le résumé de contenu suit `canPerform('read')` par
  collection.
- Raccourcis : « nouveau … » pour chaque collection où `canPerform('create')`, plus
  téléverser un média, plus les écrans les plus visités.
- **À faire** : ce qui attend une action de l'acteur — brouillons qu'il a laissés,
  programmations imminentes, éléments en relecture (fiche
  [37](37-workflow-editorial.md)), commentaires en attente (fiche
  [15](15-commentaires.md)). C'est ce qui transforme un tableau de bord en outil de
  travail.

### Tâche 3 — Widgets réorganisables

**Fichiers** : `routes/dashboard.tsx`, nouveau
`packages/admin/src/lib/dashboard-prefs.ts`.

Ordre et visibilité mémorisés en `localStorage`, par personne et par navigateur —
c'est une préférence d'affichage, pas une donnée du site. Réordonnancement par
glisser-déposer natif, **doublé de boutons nommés** (règle L16), et un bouton
« réinitialiser ».

Attention à la contrainte de test rappelée plus haut : ne pas profiter de cette tâche
pour repasser en composants `Card`.

### Tâche 4 — Remplir ou retirer les trois emplacements vides

**Fichiers** : `routes/dashboard.tsx`, et selon le cas les fiches
[24](24-sante-et-outils.md) et [26](26-export-et-sauvegarde.md).

- **Sauvegardes** : dépend de la fiche 26. Tant qu'aucune sauvegarde n'existe, le
  widget doit dire « aucune sauvegarde configurée » avec un lien vers l'écran — pas
  rester muet.
- **CVE ouvertes** : demande une source de données. Deux options — interroger un index
  public d'avis (dépendance réseau, R1 : doit dégrader proprement hors ligne), ou
  s'appuyer sur `npm audit` exécuté au déploiement et publié dans l'état
  d'exploitation. La seconde est plus honnête pour un CMS auto-hébergé.
- **Core Web Vitals** : `@cogenta/analytics` collecte-t-il des métriques de
  performance ? Sinon, deux voies — un balise de mesure côté visiteur (à peser :
  vie privée, poids de la page), ou retirer le widget. **Ne pas laisser un
  emplacement vide indéfiniment** : le retirer est une réponse acceptable.

**Critère** : plus aucun emplacement du tableau de bord n'est vide sans explication.

### Tâche 5 — Brouillon rapide

**Fichiers** : `routes/dashboard.tsx`.

Un titre et un corps, qui créent un brouillon dans la collection choisie et ouvrent
l'éditeur. Utile, et peu coûteux si la fiche [03](03-champs-de-formulaire.md) a déjà
factorisé les champs.

## 5. Critères d'acceptation

- Aucun widget n'affiche une donnée inventée ou reste vide sans explication (critère
  L11).
- Chaque chiffre est cliquable vers l'écran correspondant.
- Un contributeur ne voit que des widgets qu'il peut exploiter.
- Le tableau de bord répond en une poignée de requêtes, pas une par collection.
- `test/notices/notice-board.test.tsx` reste stable en lot (contrainte connue).

## 6. Tests exigés

- Composant : chaque widget masqué pour le rôle qui n'a pas la permission.
- Composant : le résumé n'affiche que les collections lisibles.
- Unitaires : agrégation des comptes.
- Bout en bout : les chiffres du tableau de bord correspondent au contenu réel en
  base.
- Rejouer la suite complète de `packages/admin` **en lot**, pas seulement isolée —
  c'est là que la régression documentée s'était manifestée.

## 7. Pièges connus

- **La réécriture en `Card` a déjà été essayée et annulée.** Cause : instabilité de
  test reproductible en lot. Le commentaire du fichier le documente.
- **Un tableau de bord est un `N+1` naturel.** Un widget par collection, une requête
  par widget : sur vingt collections, l'accueil devient l'écran le plus lent du
  produit. Agréger côté serveur.
- **Les compteurs fuient.** Même mise en garde que la fiche 01 : compter des brouillons
  pour un rôle qui ne les lit pas révèle leur existence.
- **Ne pas remplir un widget avec une approximation.** La règle actuelle (vide et
  explicite plutôt que faux) est meilleure que n'importe quel chiffre inventé.
- **`localStorage` peut être refusé.** Le tableau de bord doit fonctionner sans
  préférences (le code fait déjà ça pour le mode d'éditeur : copier le motif).

## 8. Décisions à prendre

- Core Web Vitals : mesurer côté visiteur (avec l'arbitrage vie privée qui va avec) ou
  retirer le widget.
- CVE : source de données, et comportement hors ligne (R1).
