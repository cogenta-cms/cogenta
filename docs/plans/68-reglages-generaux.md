# 68 — Réglages généraux : fuseau, format de date, langues, marque

> **État** : fuseau horaire et format de date **existent déjà côté schéma**
> (`general.timeZone`, `general.dateStyle`, `general.timeStyle`) mais le fuseau se
> rend en champ texte libre (aucune liste, aucun exemple) et les formats n'ont
> aucun exemple live. Les langues de contenu ne sont modifiables qu'en fichier.
> « Marque » a un déplacement pur vers Apparence, sans migration de données.
> **Fichiers** : `packages/admin/src/routes/settings.tsx`,
> `packages/admin/src/settings/site-settings-field.tsx`,
> `packages/schema/src/store/site-settings-registry.ts`,
> `packages/admin/src/lib/format.ts`
> **Effort** : 2–3 jours (+1–2 jours si les langues sont incluses)
> **ADR requise** : non pour fuseau/format/marque ; courte ADR recommandée pour la
> gestion des langues (sort du contenu déjà traduit dans une langue retirée)

---

## 1. Ce qui existe réellement

`GeneralTab` (`settings.tsx`) rend déjà les réglages `scope: 'site'` du groupe
`general`. Le registre (`site-settings-registry.ts`) contient déjà `general.title`,
`general.tagline`, `general.adminEmail`, **`general.timeZone`**
(`uiType: 'timeZone'`), **`general.dateStyle`**, **`general.timeStyle`** (défauts
`'medium'`/`'short'`).

`site-settings-field.tsx` : `dateStyle`/`timeStyle` sont des `<Select>` mais
n'affichent que le libellé abstrait (`full`/`long`/`medium`/`short`), **jamais un
exemple formaté**. `timeZone` tombe dans la branche générique = **simple
`<Input type="text">`** : l'utilisateur doit taper un nom IANA à l'aveugle, sans
liste, sans aperçu de l'heure locale — exactement le symptôme signalé.

`packages/admin/src/lib/format.ts` (`formatDateTime`/`formatDate`/
`formatTimeOnly`, déjà livré fiche 23) sait déjà prendre `timeZone`/`dateStyle`/
`timeStyle` — réutilisable telle quelle pour produire l'exemple live.

**Langues de contenu** : `site.locales`/`site.defaultLocale`
(`packages/core/src/config/schema.ts`, défaut déjà `'en'`) — **aucune UI
d'admin** ne les modifie, uniquement lisibles pour peupler le sélecteur de tagline.
Ajouter/retirer une langue = éditer `cogenta.config.mjs` à la main + redémarrer.
(Les fichiers `i18n/locales/{fr,en}.json` sont la langue de **l'interface admin**,
ADR-0019, mécanisme distinct.)

**Marque** : groupe `branding` du registre (`showCogentaBranding`,
`customLogoMediaId`), rendu par `BrandingTab` — même registre, même route API,
même table que le reste des réglages éditoriaux. `appearance.tsx` n'a pas
d'onglets, une seule page de cartes empilées.

## 2. Plan de développement

**Tâche 1 — Fuseau horaire en select natif + heure live** :
`site-settings-field.tsx`, nouvelle branche pour `uiType: 'timeZone'`, peuplée via
`Intl.supportedValuesOf('timeZone')` (natif, zéro dépendance — R9/R10). **Critère** :
impossible de saisir un nom invalide ; l'heure actuelle du fuseau choisi est
visible avant sauvegarde.

**Tâche 2 — Exemple live pour dateStyle/timeStyle** : réutilise
`packages/admin/src/lib/format.ts`. **Critère** : chaque option de format affiche
et actualise un exemple réel (« aujourd'hui : 23/08/2026 14:32 »).

**Tâche 3 — ADR courte : langues de contenu, où et comment** : décision entre
migrer `site.locales` vers le registre éditorial (contredit la fiche 23 §8,
« aucun réglage existant ne migre ») ou exposer un flux « proposer/appliquer en
développement » façon L19 (ADR-0010) — et sort du contenu déjà traduit dans une
langue retirée (ADR-0014, `translation_of`) : ce n'est pas un simple bascule, il
faut décider explicitement.

**Tâche 4** *(conditionnée par la tâche 3)* — UI d'ajout/suppression de langue et
de changement de langue par défaut.

**Tâche 5 — Déplacement de « Marque »** : nouvelle carte dans `appearance.tsx`
(fetch via `listSettings`/`writeSetting`, réutilise `MediaPicker` comme
`MediaSettingField` le fait déjà), retirer `'branding'` de `TAB_ORDER`/`groupOf` et
`BrandingTab` de `settings.tsx`, déplacer les clés i18n vers un espace de noms
`appearance.*`. Aucune migration de données — même registre, même table.

## 3. Critères d'acceptation

- Le fuseau horaire se choisit dans une liste valide, avec l'heure actuelle
  affichée.
- Chaque format de date/heure affiche un exemple réel avant sauvegarde.
- « Marque » est un onglet/section d'Apparence, plus de Réglages du site.

## 4. Tests exigés

- Composant : select de fuseau ne propose que des noms IANA valides.
- Composant : exemple live se met à jour au changement de sélection, avant
  enregistrement.
- Non-régression : `formatDateTime` utilisé identiquement partout après la
  migration de « Marque ».
- Si tâche 4 : test du sort du contenu d'une langue retirée, conforme à la
  décision de la tâche 3.

## 5. Pièges connus

- Le fuseau qui fait foi pour une programmation de publication doit être affiché
  à côté du champ de programmation — un décalage silencieux publie au mauvais
  moment (piège déjà documenté par la fiche 23).
- Retirer une langue de contenu sans décider du sort des entrées déjà traduites
  dans cette langue est le vrai risque de la tâche 3/4 — ne pas la traiter comme un
  simple toggle.

## 6. Décisions à prendre

Tâche 3 : migration du registre des langues vs. flux « proposer/appliquer » façon
L19, et sort du contenu déjà traduit — préalable aux tâches 3-4.
