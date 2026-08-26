# 40 — Diagnostics et messages d'erreur de configuration

> **État** : le message cité par l'utilisateur porte déjà un `hint` correct côté
> serveur — l'écran qui l'affiche le jette. Symptôme d'un anti-motif répété **178
> fois dans 51 fichiers** de l'admin.
> **Fichiers** : `packages/api/src/access/preview-token.ts`,
> `packages/admin/src/routes/entry-edit.tsx`, `packages/create-cogenta/src/scaffold.ts`,
> `packages/cli/src/commands/doctor.ts`
> **Effort** : 1–2 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

L'erreur exacte citée par l'utilisateur vient de
`packages/api/src/access/preview-token.ts:87-93` :

```
CogentaError({
  code: 'CONFIG_INVALID',
  message: 'Preview tokens need COGENTA_PREVIEW_SIGNING_KEY to hold at least 32 characters.',
  hint: 'Set COGENTA_PREVIEW_SIGNING_KEY in the environment — for example `openssl rand -hex 32`. Never put it in a configuration file.'
})
```

Le `hint` **existe déjà** et répond exactement à la confusion signalée (quoi faire,
où le mettre) — conforme à AGENTS.md (« Une erreur destinée à l'utilisateur final
dit ce qui a échoué, pourquoi, et quoi faire »). Le bug réel est dans l'affichage
admin : `packages/admin/src/routes/entry-edit.tsx:703` —
`setPreviewError(caught instanceof ApiError ? caught.message : t('entryEdit.previewError'))`
— lit **seulement** `caught.message`, jamais `caught.hint`. L'utilisateur ne voit
donc jamais la phrase qui lui dirait quoi faire.

Contre-exemple correct déjà présent : `packages/admin/src/routes/import.tsx:198-202`
(`describeError`) construit `{ message, hint }` et affiche les deux.

**Ce n'est pas un cas isolé** : le motif fautif (`caught instanceof ApiError ?
caught.message : t(...)`, qui jette le `hint`) apparaît **178 fois dans 51
fichiers** de `packages/admin/src/routes`. C'est un anti-motif systémique.

Aggravant : `packages/create-cogenta/src/scaffold.ts:259` génère
`COGENTA_AUTH_SIGNING_KEY` automatiquement à l'installation mais **jamais**
`COGENTA_PREVIEW_SIGNING_KEY` — tout site fraîchement créé déclenche donc cette
erreur au premier clic sur « Aperçu » d'un brouillon.

`cogenta doctor` (`packages/cli/src/commands/doctor.ts`) vérifie base/cache/
stockage/débit — jamais la clé de prévisualisation. `packages/api/src/rest/router.ts`
(`withPreview`) confirme que la clé n'est requise que si `?preview=` est réellement
utilisé — donc `doctor` doit la signaler en avertissement, pas en échec bloquant.

## 2. Diagnostic

Le message n'est pas « pas clair » en soi — il ne s'affiche simplement jamais en
entier. Corriger l'affichage résout le symptôme signalé ; corriger la génération de
la clé à l'installation empêche qu'il se reproduise sur tout nouveau site.

## 3. Plan de développement

### Tâche 1 — Afficher le hint sur l'aperçu

**Fichiers** : `entry-edit.tsx:703`.

Réutiliser le motif `describeError` d'`import.tsx` pour `previewError` : afficher
`message` et `hint` tous deux.

**Critère** : cliquer « Aperçu » sans clé configurée affiche la phrase
`openssl rand -hex 32`.

### Tâche 2 — Aide partagée `describeApiError`

**Fichiers** : nouveau `packages/admin/src/api/describe-error.ts`.

`describeApiError(caught, fallbackKey): { message: string; hint?: string }`,
utilisable partout où `ApiError` est capturée. Migrer au moins les écrans à fort
trafic (édition d'entrée, médiathèque, utilisateurs, listes de collection) ; les
51 fichiers touchés restent une dette documentée, à résorber progressivement plutôt
que traitée en un seul geste risqué.

**Critère** : les écrans migrés affichent systématiquement `hint` quand il existe.

### Tâche 3 — Générer la clé de prévisualisation à l'installation

**Fichiers** : `packages/create-cogenta/src/scaffold.ts` (ligne ~259).

Générer `COGENTA_PREVIEW_SIGNING_KEY` avec `randomBytes(32)`, au même endroit que
`COGENTA_AUTH_SIGNING_KEY`.

**Critère** : un site créé par `npm create cogenta` n'a jamais cette erreur au
premier aperçu.

### Tâche 4 — Vérification proactive dans `cogenta doctor`

**Fichiers** : `packages/cli/src/commands/doctor.ts`.

Nouveau check `previewSigningKey` : absent ou < 32 caractères ⇒ avertissement non
bloquant (la clé n'est requise que si l'aperçu est utilisé), avec le même hint.

## 4. Critères d'acceptation

- Toute erreur de configuration affichée à l'écran montre son `hint` s'il existe.
- Un site neuf n'a jamais l'erreur `COGENTA_PREVIEW_SIGNING_KEY` au premier aperçu.
- `cogenta doctor` signale une clé de prévisualisation absente ou trop courte.

## 5. Tests exigés

- Unitaire : `describeApiError` restitue `message` et `hint` pour une `ApiError`
  qui en porte un, et un repli propre sinon.
- Bout en bout : aperçu sans clé configurée affiche le hint complet à l'écran.
- Unitaire : `scaffold.ts` écrit une clé de 32+ caractères pour
  `COGENTA_PREVIEW_SIGNING_KEY` sur un site neuf.
- Unitaire : `doctor` avertit (sans échouer) sur une clé absente/courte.

## 6. Pièges connus

- Ne pas migrer les 51 fichiers en un seul commit — risque de régression diffus sur
  un motif répété, à traiter par lots avec vérification à chaque fusion.
- Le check `doctor` doit rester un avertissement, jamais un échec — la clé n'est
  nécessaire que si l'aperçu est utilisé (`withPreview`).

## 7. Décisions à prendre

Portée de la migration du helper `describeApiError` au-delà des écrans à fort
trafic — à documenter comme dette plutôt qu'à trancher en bloc.
