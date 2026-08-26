# 65 — Import : déplacement vers Contenu et plateformes supplémentaires

> **État** : `docs/plans/25-import.md` est obsolète (décrit « WordPress seulement,
> sans prévisualisation ») — `@cogenta/import` a déjà CSV, JSON, RSS/Atom,
> correspondance de champs, reprise et annulation. Le déplacement de menu est
> trivial ; Ghost et Medium restent absents.
> **Fichiers** : `packages/admin/src/shell/nav-items.ts`,
> `packages/import/src/*`, `packages/admin/src/routes/import.tsx`
> **Effort** : 3–5 jours (déplacement = quelques minutes)
> **ADR requise** : non

---

## 1. Ce qui existe réellement

`/import` est sous `group: 'ops'` (« Exploitation ») dans `nav-items.ts:358-363` —
confirmé, doit passer sous Contenu. `@cogenta/import` contient déjà
`csv-import.ts`, `csv.ts`, `feed.ts` (RSS/Atom), `generic-import.ts`,
`json-import.ts`, `mapping.ts`, `ssrf.ts`, `tracking.ts` (reprise), `undo.ts`
(annulation via corbeille) en plus de `wordpress/`. `import.tsx` a déjà un flux
analyser→appliquer→annuler complet pour `wordpress`/`csv`/`json`/`rss`, avec
reprise et annulation.

Manquant : Ghost, Medium, Drupal, Shopify — aucune trace dans `packages/import/
src`. Pas d'écran de correspondance de champs visible dans l'admin (`mapping.ts`
existe côté paquet, pas câblé côté écran).

## 2. Plan de développement

**Tâche 1** — Déplacer `/import` de `group: 'ops'` vers `group: 'content'`
(`nav-items.ts:358-363`). **Critère** : Import apparaît sous « Contenu ».

**Tâche 2** — Mettre à jour `docs/plans/25-import.md` — état obsolète, pour éviter
qu'un futur lot ne re-planifie du travail déjà fait.

**Tâche 3** — Adaptateur Ghost (export JSON natif, format stable), sur le schéma
de `wordpress/` (analyze → convert → import), réutilisant `tracking.ts`/`undo.ts`.

**Tâche 4** — Adaptateur Medium (export ZIP de fichiers HTML), via
`generic-import.ts` si le format s'y prête, sinon module dédié.

**Tâche 5** — Exposer l'écran de correspondance de champs (`mapping.ts` déjà
écrit) dans `import.tsx`.

## 3. Critères d'acceptation

- Import est accessible sous le groupe Contenu.
- Ghost et Medium sont importables avec le même flux analyser→appliquer→annuler
  que WordPress.
- La correspondance de champs est éditable depuis l'écran, pas seulement en API.

## 4. Tests exigés

- Bout en bout : import Ghost/Medium avec un fichier réel, reprise après
  interruption, annulation via corbeille.
- SSRF : `ssrf.ts` couvre les nouvelles sources exactement comme les existantes.

## 5. Pièges connus

- Réutiliser `tracking.ts`/`undo.ts` pour tout nouvel adaptateur — ne pas
  réimplémenter la reprise/annulation par plateforme.

## 6. Décisions à prendre

Drupal/Shopify : hors périmètre de cette fiche, à cadrer séparément si demandés.
