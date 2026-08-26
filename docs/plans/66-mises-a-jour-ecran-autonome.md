# 66 — Mises à jour : écran autonome

> **État** : la fonctionnalité (L22 tâche 9) vit entièrement dans
> `ops-settings.tsx`, dont le titre est « Sécurité & webhooks ». Déjà séparée côté
> API (`updates-client.ts`) — seulement mélangée côté écran/nav. Extraction
> mécanique, aucune nouvelle logique.
> **Fichiers** : `packages/admin/src/routes/ops-settings.tsx`,
> `packages/admin/src/api/updates-client.ts`, `packages/admin/src/shell/nav-items.ts`
> **Effort** : 0,5–1 jour
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Le module update est autonome côté API : `updates-client.ts`
(`applyUpdateNow`, `readUpdateHistory`, `readUpdateStatus`, types
`UpdateApplyResult`/`UpdateCheckReport`/`UpdateHistory`/`UpdatePackageStatus`).
Fonctions déjà livrées dans `ops-settings.tsx` (~lignes 54-260) : vérification des
paquets, application avec confirmation de rupture, historique, politique
auto-update (réglage site standard).

## 2. Plan de développement

**Tâche 1** — Extraire le bloc « Mises à jour » de `ops-settings.tsx` vers un
nouveau `packages/admin/src/routes/updates.tsx`, réutilisant tel quel
`updates-client.ts` (aucun changement d'API).

**Tâche 2** — Nouvelle entrée nav dédiée `/updates` (`nav-items.ts`, group `ops`,
`role: admin`), badge possible sur `updateAvailable` (même schéma que
`marketplaceUpdates`).

**Tâche 3** — Retirer le bloc de `ops-settings.tsx`, qui garde son périmètre réel
(CORS/CSP/HSTS, config webhooks sortants).

**Tâche 4** — Traductions : nouvelle clé `nav.updates`, renommer `opsSettings.
updates*` en `updates.*` par cohérence (pur renommage).

## 3. Critères d'acceptation

- « Mises à jour » est un écran autonome, accessible depuis sa propre entrée de
  navigation.
- « Sécurité & webhooks » ne contient plus que la sécurité et les webhooks.

## 4. Tests exigés

- Non-régression : toutes les fonctions de mise à jour (vérification, application,
  historique) fonctionnent identiquement après l'extraction.

## 5. Pièges connus

- Extraction pure — ne rien changer au comportement pendant le déplacement, pour
  isoler tout risque de régression du renommage lui-même.

## 6. Décisions à prendre

Aucune.
