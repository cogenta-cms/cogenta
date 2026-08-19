# 27 — Analytics

> **État** : minimal — un chiffre, un graphique, aucune exploration.
> **Écran** : `packages/admin/src/routes/analytics.tsx` (225 lignes)
> **Paquet** : `@cogenta/analytics`
> **API existante** : `GET /api/analytics/summary` (`admin` seulement),
> balise de mesure posée par `theme-render.ts`
> **Effort** : 4–5 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- `@cogenta/analytics` : mesure d'audience **auto-hébergée et sans cookie**, avec un
  sel (`ANALYTICS_SALT_UNAVAILABLE` existe comme code d'erreur, ce qui indique un
  hachage salé des visiteurs plutôt qu'un identifiant persistant).
- Une balise posée par le rendu (`analyticsBeacon` dans `theme-render.ts`).
- `GET /api/analytics/summary`, réservé à `admin` — vérifié en test réel : un appel non
  authentifié reçoit un `403 FORBIDDEN` propre.
- L'écran : total de vues et un graphique SVG à barres fait main, sans bibliothèque de
  graphiques (R9), avec un commentaire qui explique pourquoi des barres plutôt qu'une
  courbe.
- Un widget de résumé sur le tableau de bord.

C'est une base saine — et c'est un vrai argument produit : la plupart des CMS
renvoient vers Google Analytics, avec ce que cela implique de cookies, de bandeau de
consentement et de transfert de données.

## 2. Ce que font les CMS de référence

| Fonction | Jetpack Stats | Plausible / Matomo | Cogenta |
|---|---|---|---|
| Vues par jour | ✅ | ✅ | ✅ |
| **Pages les plus vues** | ✅ | ✅ | ❌ |
| Sources de trafic / référents | ✅ | ✅ | ❌ |
| Visiteurs uniques vs vues | ✅ | ✅ | ? |
| Plage de dates au choix | ✅ | ✅ | ❌ |
| Comparaison de périodes | ✅ | ✅ | ❌ |
| Appareils, navigateurs | ✅ | ✅ | ❌ |
| Pays | ✅ | ✅ | ❌ |
| Objectifs / conversions | ❌ | ✅ | ❌ |
| Export CSV | ✅ | ✅ | ❌ |
| Statistiques par entrée, dans l'éditeur | ✅ | ❌ | ❌ |
| Sans cookie ni consentement | ❌ | ✅ | ✅ **mieux** |
| Rétention configurable | ❌ | ✅ | ? |

## 3. Écarts, classés

### Importants

1. **Pas de pages les plus vues.** C'est la première question qu'on pose à un outil de
   mesure, et la seule qui change réellement ce qu'un éditeur écrit ensuite.
2. **Pas de plage de dates.** La période est figée.
3. **Pas de référents.** « D'où viennent les gens » est la deuxième question.
4. **Pas de statistiques dans l'éditeur.** Voir les vues d'un article pendant qu'on le
   modifie est le lien le plus direct entre mesure et travail éditorial.

### Confort

5. Pas d'export.
6. Pas de comparaison de périodes.
7. Pas de segmentation par appareil ou par pays — à peser avec la vie privée (voir
   pièges).
8. Rétention non affichée.

## 4. Plan de développement

### Tâche 0 — Vérifier ce que la collecte enregistre réellement

**Avant tout écran.** Lire `@cogenta/analytics` et établir : quels champs sont
collectés, comment le visiteur est haché, quelle est la rétention, ce qui est agrégé
et ce qui est conservé ligne à ligne.

Cette vérification détermine tout le reste : on ne peut pas afficher les référents
s'ils ne sont pas collectés, et **il ne faut pas se mettre à collecter davantage
simplement pour remplir un écran**. Le caractère sans cookie et sans consentement est
la valeur de ce paquet ; chaque champ ajouté doit passer ce test : est-il encore vrai
que ce site n'a pas besoin de bandeau de consentement ?

**Livrable** : un tableau de ce qui est collecté aujourd'hui, et de ce qu'il faudrait
collecter en plus pour chaque écran voulu, avec l'incidence vie privée de chacun.

### Tâche 1 — Pages, référents, plage de dates

**Fichiers** : `packages/analytics/src/`, `packages/api/src/rest/analytics-router.ts`,
`routes/analytics.tsx`.

- Sélecteur de période (7 / 30 / 90 jours, personnalisé) avec comparaison à la période
  précédente et variation en pourcentage.
- Tableau des pages les plus vues, avec titre et lien vers l'entrée.
- Tableau des référents, regroupés par domaine, avec une catégorie « accès direct ».
  **Les référents doivent être normalisés** (garder le domaine, jeter le chemin et les
  paramètres) : un chemin de référent peut contenir des données personnelles.
- Réutiliser le graphique SVG existant plutôt qu'introduire une bibliothèque (R9).

### Tâche 2 — Statistiques dans l'éditeur

**Fichiers** : `routes/entry-edit.tsx`, `analytics-router.ts`.

Un petit encart dans la barre latérale (fiche [02](02-editeur-d-entree.md)) : vues sur
30 jours, tendance, position dans le classement du site. Uniquement pour un acteur qui
peut voir les statistiques.

**Critère** : voir l'audience d'un article pendant qu'on le met à jour.

### Tâche 3 — Export et rétention

**Fichiers** : `routes/analytics.tsx`, configuration.

Export CSV de la vue courante (réutiliser `lib/csv.ts`). Rétention affichée et
configurable, avec purge automatique — une table de mesure croît indéfiniment sinon,
et c'est un problème réel sur un hébergement mutualisé.

### Tâche 4 — Segmentation, avec prudence

**Fichiers** : `packages/analytics/src/`.

Appareil et navigateur peuvent se déduire du `user-agent` **sans le stocker**, en
n'en gardant qu'une catégorie grossière. Le pays demande une base de géolocalisation
d'IP : dépendance externe (R1) **et** traitement d'une donnée personnelle. À écarter
par défaut ; si c'est vraiment demandé, ce doit être un module optionnel, désactivé,
qui rend explicite le changement de nature de la collecte.

### Tâche 5 — Ne pas dépasser la ligne

**Fichiers** : documentation, écran.

Écrire, sur l'écran lui-même, ce que ce système **ne fait pas** : pas de suivi
inter-sites, pas d'identifiant persistant, pas de profil individuel, pas de partage
avec un tiers. C'est une garantie produit, et elle vaut d'être visible plutôt que
seulement vraie.

## 5. Critères d'acceptation

- On sait quelles pages sont les plus lues, et d'où viennent les visiteurs.
- Aucun champ nouveau n'est collecté sans que son incidence sur la vie privée ait été
  écrite.
- Le site reste utilisable sans bandeau de consentement.
- Aucun chemin de référent complet n'est stocké.
- La table de mesure ne croît pas indéfiniment.
- L'écran dit ce que le système ne fait pas.

## 6. Tests exigés

- Bout en bout : produire des vues réelles contre un vrai serveur, vérifier les
  agrégats.
- Sécurité : `/api/analytics/summary` refuse toujours un non-`admin` (test de
  non-régression — la vérification a déjà été faite en conditions réelles).
- Unitaires : normalisation des référents (le chemin est jeté).
- Unitaires : purge de rétention.
- Unitaires : le hachage du visiteur n'est pas réversible et change de sel selon la
  période, si c'est le modèle retenu.

## 7. Pièges connus

- **Chaque champ ajouté rapproche du bandeau de consentement.** C'est la ligne à ne
  pas franchir : la valeur de ce paquet est précisément de ne pas en avoir besoin.
- **Un chemin de référent peut contenir des données personnelles** (jetons, adresses
  e-mail dans une URL de webmail). Domaine seulement.
- **La géolocalisation d'IP** est une dépendance externe et un traitement de donnée
  personnelle. Deux raisons de dire non par défaut.
- **La table de mesure est la plus grosse table d'un site à trafic.** Agrégation à
  l'écriture, index sur la date, purge.
- **R9** : pas de bibliothèque de graphiques. Le SVG fait main existe et marche.
- **Un compteur de vues visible publiquement** révèle l'audience du site : le garder
  réservé à `admin`, comme aujourd'hui.

## 8. Décisions à prendre

- **Tâche 0** d'abord : ce qui est collecté aujourd'hui, ce qui manque, ce que coûte
  chaque ajout.
- Segmentation appareil/navigateur : catégorie grossière (acceptable) ou rien.
- Pays : non par défaut (recommandé).
