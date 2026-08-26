# 62 — Clés API : cycle de vie complet

> **État** : les 5 tâches de la fiche 20 sont déjà livrées (expiration, rotation
> avec fenêtre de sursis, quota, usage agrégé, portées lisibles). Réactivation et
> suppression absentes des deux côtés (écran et modèle). Trou le plus important :
> **aucune entrée d'audit** n'est écrite à la création, révocation ou rotation —
> déjà signalé par la fiche 20 elle-même comme le correctif le plus important, et
> resté non fait.
> **Fichiers** : `packages/admin/src/routes/api-keys.tsx`,
> `packages/api/src/rest/api-keys-router.ts`, `packages/auth/src/api-keys.ts`
> **Effort** : 0,5 j (audit) + 1 j (purge) + 0,5–1 j (réactivation, selon décision)
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Expiration au choix (30j/90j/1an/jamais, défaut 90j), rotation avec fenêtre de
sursis (`graceHours`, bornée à 7 jours), quota par clé (`rateLimitPerMinute`,
défaut 600/min — **le champ existe et est stocké, mais rien dans ce routeur ne
renvoie 429/`Retry-After` : à vérifier dans la couche d'accès de `@cogenta/api`,
hors fichiers lus ici**), usage agrégé 7/30j, signal « jamais utilisée »/
« inutilisée depuis 90j », portées lisibles avec avertissement si accès en
écriture. Modale de révocation déjà sur le design system.

Révoquer ✅ (`DELETE /api/api-keys/{id}` → `revoked_at`, soft, définitif). Réactiver
❌ — **absent aussi côté modèle** : `revoke()` pose `revoked_at` une seule fois,
rien ne le remet à `null`, `statusOf()` le traite comme terminal. Supprimer ❌ —
absent des deux côtés : `list()` ne filtre rien, une clé révoquée/expirée/remplacée
reste **indéfiniment** dans la liste.

## 2. Plan de développement

**Tâche 1 — Audit (priorité)** : aucun appel `audit.record` dans
`api-keys-router.ts` à la création, révocation ou rotation. Ajouter systématiquement.
**Critère** : chaque mutation de clé produit une entrée d'audit.

**Tâche 2 — Purge** : `DELETE /api/api-keys/{id}/purge` (ou filtre `archived`) —
purge uniquement les clés déjà révoquées depuis N jours, jamais une clé active.

**Tâche 3 — Réactivation** *(décision préalable)* : une clé révoquée l'est
généralement pour une raison de sécurité — réactiver silencieusement une clé
compromise est un risque réel. Deux options : (a) route de réactivation stricte,
admin uniquement, refusée si la clé est par ailleurs expirée, audit obligatoire ;
(b) compromis plus sûr — autoriser la **rotation** (pas la réactivation) d'une clé
révoquée par erreur dans une fenêtre courte (ex. 24h), sans jamais lever le statut
`revoked`. **Recommandation : (b)**.

**Tâche 4** — Vérifier et, si besoin, brancher réellement la limitation de débit
(429 + `Retry-After`) dans la couche middleware de `@cogenta/api`.

## 3. Critères d'acceptation

- Chaque mutation de clé API (création, révocation, rotation) apparaît dans le
  journal d'audit.
- Une clé révoquée depuis longtemps peut être purgée, jamais une clé active.
- Une clé révoquée par erreur récente reste récupérable (option (b)), sans jamais
  effacer silencieusement le fait qu'elle a été révoquée.

## 4. Tests exigés

- Bout en bout : création/révocation/rotation produisent chacune une entrée
  d'audit vérifiable.
- Sécurité : la clé brute n'apparaît jamais deux fois (propriété déjà documentée,
  test de non-régression explicite après les nouvelles routes).
- Rate limit : si branché (tâche 4), test qu'un dépassement de quota renvoie 429
  avec `Retry-After`.

## 5. Pièges connus

- Ne jamais réactiver une clé sans confirmation explicite ni sans en garder trace
  dans l'audit.
- La purge ne doit jamais toucher une clé encore active, même expirée
  techniquement mais non révoquée — vérifier `revoked_at !== null` avant toute
  suppression.

## 6. Décisions à prendre

Tâche 3 : réactivation stricte (a) vs. rotation en fenêtre courte (b, recommandé).
