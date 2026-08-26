# 67 — Observabilité : détails de requêtes, pagination transverse, rétention

> **État** : rétention actuelle = un ring buffer **en mémoire process** (500
> traces/500 logs), jamais persisté, remis à zéro à chaque redémarrage — pas une
> politique en jours. Aucun composant de pagination réutilisable n'existe nulle
> part dans l'admin ; deux motifs ad hoc coexistent. Cette fiche construit la
> fondation pagination consommée par 46, 47, 61, 62.
> **Fichiers** : `packages/observability/src/{request-tracing,recent-store}.ts`,
> `packages/admin/src/routes/observability.tsx`, nouveau
> `packages/admin/src/ui/pagination.tsx`
> **Effort** : composant + migration users/media 1–2 j ; pagination submissions/
> api-keys 1 j ; persistance + rétention + purge 2–3 j ; détail enrichi 0,5–1 j
> (total 5–7 j)
> **ADR requise** : non — nouvelle table de persistance, migration réversible
> standard

---

## 1. Ce qui existe réellement

`/observability` sous `group: 'ops'`. **Aucun composant `Pagination` n'existe**
(`packages/admin/src/ui/*.tsx` — zéro résultat). Deux motifs ad hoc coexistent :
`users.tsx` (bouton « charger plus », curseur `nextCursor`/`hasMore`) et
`media-client.ts` (même curseur, exposé mais pas forcément consommé). `form-
submissions.tsx` et `api-keys.tsx` n'ont **aucun** paramètre `limit`/`offset` — ils
chargent tout.

`request-tracing.ts` capture seulement `method`, `path` (sans query), `statusCode`,
`durationMs` — **délibérément** (commentaire R7 : aucun chemin ne doit mettre un
secret dans une trace). `recent-store.ts` : ring buffer en mémoire, capacité fixe
(`DEFAULT_TRACE_CAPACITY = 500`, `DEFAULT_LOG_CAPACITY = 500`), **pas de
persistance base de données**. `observability.tsx` affiche `TracesTable`/
`LogsTable` sans aucune pagination — tout est rendu d'un coup.

## 2. Plan de développement

### Fondation transverse

**Tâche 1 — Composant `pagination.tsx`** (`packages/admin/src/ui/`, exporté
depuis `ui/index.ts`) : variante curseur (motif déjà validé par `users.tsx`),
interface `{ hasMore, loading, onLoadMore, loadMoreLabel }`. Prévoir une seconde
variante à pages numérotées (`{ page, pageCount, onPageChange, loading }`) pour
l'observabilité, qui connaît un total.

**Tâche 2** — Migrer `users.tsx` vers le composant (preuve que la fondation
tient), puis `media.tsx`.

**Tâche 3** — Ajouter `limit`/`after` à `form-submissions-client.ts` et
`api-keys-client.ts` (actuellement absents), brancher le composant.

### Observabilité elle-même

**Tâche 4** — `observability.tsx` : paginer `TracesTable`/`LogsTable` avec le
composant.

**Tâche 5 — Rétention réelle** : nouveau champ config `observability.
retentionDays` (défaut 30), persister traces/logs dans une vraie table (driver
optimal SQLite/Postgres/MySQL ; le ring buffer en mémoire reste le repli dégradé
sans base dédiée — R1). Purge planifiée quotidienne, même mécanisme que
`purgeExpired()` de la corbeille (ADR-0022) à titre de précédent.

**Tâche 6** — Écran réglages : champ modifiable pour `retentionDays`, avec
avertissement (non bloquant) si la valeur est poussée haut (ex. > 90 jours) sur le
risque de saturation.

**Tâche 7 — Détail de requête enrichi** : attributs de span supplémentaires (ex.
taille de réponse, id de collection si pertinent) **sans** toucher au corps/
en-têtes — respecter strictement la discipline R7 déjà en place.

## 3. Critères d'acceptation

- Un composant de pagination unique est réutilisé par au moins 5 écrans.
- Les traces/logs sont conservés selon une politique en jours configurable,
  survivant à un redémarrage.
- Une rétention élevée déclenche un avertissement visible, jamais un blocage.
- Aucune donnée sensible (corps, en-tête, secret) n'apparaît dans une trace.

## 4. Tests exigés

- Composant : `pagination.tsx` couvre les deux variantes (curseur, pages).
- Migration : up/down/up sur les trois dialectes pour la nouvelle table.
- R1 : `@cogenta/observability` reste utilisable sans base dédiée (repli mémoire).
- R7 : aucun test ne trouve de secret dans une trace enrichie.
- Purge : `purgeExpired`-équivalent testé comme la corbeille.

## 5. Pièges connus

- Ne pas migrer les 5 écrans consommateurs en un seul commit — un par un, avec
  vérification à chaque fusion.
- Le driver dégradé (mémoire) doit rester testé, pas seulement l'optimal (règle
  AGENTS.md).

## 6. Décisions à prendre

Aucune bloquante — le seuil d'avertissement de rétention (tâche 6) est un choix
produit mineur, ajustable après coup.
