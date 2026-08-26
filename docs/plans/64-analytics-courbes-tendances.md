# 64 — Analytics : courbes et tendances

> **État** : écran déjà riche (comparaison de période, export CSV, top pages/
> référents, répartition par appareil) — le seul vrai écart est un choix R9
> explicite et commenté : « bars rather than a line ». L'utilisateur demande
> précisément l'inverse.
> **Fichiers** : `packages/admin/src/routes/analytics.tsx`,
> `packages/analytics/src/store.ts`
> **Effort** : 2–3 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Sélecteur 7/30/90j + plage personnalisée, comparaison à la période précédente avec
badge `+x %`, export CSV, tableau des pages les plus vues (lien d'édition), tableau
des référents normalisés par domaine, répartition par appareil, note de rétention,
encart « ce que ce système ne fait pas ». Encart de stats dans l'éditeur d'entrée
(vues 30j, tendance, rang) déjà livré.

Le seul graphique est un **histogramme en barres SVG fait main**
(`DailyViewsChart`, R9 assumé et commenté), avec dégradé et grille en pointillés —
pas de courbe, pas de moyenne mobile, pas de superposition visuelle des deux
périodes comparées (seul le badge % existe). `topPages`/`topReferrers` plafonnés à
10 lignes (`DEFAULT_SUMMARY_LIMIT`), sans pagination.

## 2. Plan de développement

**Tâche 1 — Courbe de tendance** : remplacer ou compléter `DailyViewsChart` par un
tracé en ligne (`<polyline>`/`<path>` SVG, toujours R9 zéro dépendance) avec point
de données et zone sous la courbe en dégradé, réutilisant `fillDailyViews`.

**Tâche 2 — Superposition de la période précédente** : deuxième ligne en pointillé
sur le même graphique, en plus du badge `%` déjà existant.

**Tâche 3 — Pagination pages/référents** : au-delà du top 10
(`DEFAULT_SUMMARY_LIMIT`), en réutilisant le composant de pagination de la fiche 67
(motif déjà utilisé dans 5 écrans admin : `collection-list`, `trash`, `users`,
`search`, `translations`).

**Tâche 4 — Style** : légendes d'axe, tooltips au survol (déjà partiellement
présents via `<title>` SVG), cohérence avec `Card`/`Button` du reste de l'écran.

## 3. Critères d'acceptation

- La période affiche une ligne de tendance, pas seulement des barres.
- La période précédente est visible superposée, pas seulement en badge.
- Les pages/référents au-delà du top 10 sont accessibles par pagination.

## 4. Tests exigés

- Composant : rendu du tracé en ligne sur un jeu de données réel.
- Non-régression : export CSV et comparaison de période inchangés.
- Composant : pagination des tableaux top pages/référents.

## 5. Pièges connus

- Rester zéro dépendance (R9) — SVG fait main, pas de librairie de graphiques.

## 6. Décisions à prendre

Aucune.
