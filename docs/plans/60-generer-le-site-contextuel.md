# 60 — Générer le site : conscience contextuelle du site existant

> **État** : la génération de plan de site (L19) part **toujours d'une page
> blanche**, même en admin post-installation sur un site déjà vivant — le seul
> contact avec l'état réel est un contrôle défensif tardif (conflit de nom de
> collection au moment d'appliquer), jamais une entrée du raisonnement de l'agent.
> **Fichiers** : `packages/agents/src/site-plan/*`,
> `packages/api/src/rest/site-plan-router.ts`, `packages/cli/src/commands/site-plan.ts`,
> `packages/admin/src/routes/site-plan.tsx`
> **Effort** : proche d'une seule tâche substantielle d'un lot déjà terminé (ex.
> L19 tâche 4)
> **ADR requise** : non — cohérent avec ADR-0023, aucune n'est requise pour la
> lecture de contexte elle-même

---

## 1. Ce qui existe réellement

`analyseBrief()`, `proposeContentModel()`, `proposeDemoContent()`,
`generateSkinCandidates()` (`packages/agents/src/site-plan/`) : chacune ne prend en
entrée que le document téléversé (+ un `siteName` optionnel) — **aucune lecture des
collections, du contenu ou du thème existants**. `proposeSitePlan()` orchestre les
quatre sans jamais recevoir l'état du site.

`ProposeSitePlanOptions` = `{ client, model, documents, siteName?, skinCount?,
blueprintLabel?, now?, idFactory? }` — aucun champ ne porte l'état du site.

Les collections réelles existent bien dans `site-plan.ts` (`SitePlanApplierOptions.
collections`) mais servent **uniquement** à l'`applier`, en aval, pour **refuser**
une collection proposée qui porterait un nom déjà pris — jamais pour informer la
proposition en amont.

Libellés « Créer un site » à trois emplacements : `nav.createSite`,
`sitePlan.heading`, `documentation.*.step4` (fr/en).

## 2. Diagnostic

Un plan proposé sur un site avec 200 articles et une boutique active ressemble,
aujourd'hui, trait pour trait à un plan proposé sur une base vide. C'est exactement
le cas d'usage nommé par le retour utilisateur.

## 3. Ce que fait Wix ADI

Scanne activement ce qui existe déjà (contenu importé, présence numérique réelle)
pour proposer une structure cohérente, jamais un questionnaire seul ; sur un site
déjà en ligne, détecte les sections manquantes et propose de les combler sans
toucher à ce qui fonctionne.

## 4. Plan de développement

**Tâche 1 — Renommage UI** : `fr.json`/`en.json` (`nav.createSite`,
`sitePlan.heading`, `documentation.*.step4`) — « Créer un site » → « Générer le
site ». `nav-items.ts` ne change pas de code, seul le texte traduit change.
**Critère** : aucun texte orphelin « Créer un site » restant dans `packages/admin`.

**Tâche 2 — Instantané du site existant** : nouveau
`packages/agents/src/site-plan/site-context.ts`, `describeExistingSite()` —
collections déclarées (nom, champs, nombre d'entrées), thème actif, pages publiées
par collection routée, taxonomies, intégrations actives (détectées par simple
présence de config, jamais devinées). **Critère** : testé sur un site vide (résumé
vide honnête) et un site peuplé.

**Tâche 3 — Injection en donnée, pas en instruction** : `analyseBrief`/
`proposeContentModel`/`generateSkinCandidates` gagnent un paramètre optionnel
`existingSite`, transmis par le canal `data` d'`assembleContext` (même discipline
R8 que le document). **Critère** : test d'injection existant étendu, prouvant
qu'un contenu existant malveillant (titre d'article contenant une fausse
instruction) reste inerte.

**Tâche 4 — Mode « écart » vs « premier jet »** : quand `existingSite` n'est pas
vide, le prompt de `proposeContentModel` change de consigne — proposer des
ajouts/complétions plutôt que redéfinir depuis zéro ; les collections déjà
nommées ne sont plus proposées à l'identique. **Critère** : sur un site avec une
collection `article` déjà déclarée, le plan ne propose plus de second `article`,
mais peut proposer un champ ou une collection complémentaire justifiée par le
brief.

**Tâche 5 — Détection de trous structurels** : nouvelle passe comparant le plan
proposé + l'état existant contre une liste de pages usuelles (contact, mentions
légales, politique de confidentialité — jamais générées automatiquement), signalées
comme suggestions distinctes, jamais appliquées d'office (R6 intact). **Critère** :
un site sans page « contact » reçoit une suggestion nommée comme telle, refusable
comme tout le reste.

**Tâche 6 — Câblage CLI/API** : `site-plan.ts` (`createPlanner`) et
`site-plan-router.ts` (`SitePlannerLike.propose`) passent l'instantané construit à
la tâche 2. Le point d'entrée **installeur** reste inchangé (sur un site neuf,
`existingSite` est vide par construction).

## 5. Critères d'acceptation

- Une génération post-installation sur un site peuplé propose des compléments,
  jamais des doublons des collections déjà nommées.
- Aucun contenu existant, même hostile, n'influence le comportement de l'agent
  autrement que comme donnée balisée.
- L'installeur (site neuf) se comporte exactement comme avant cette fiche.

## 6. Tests exigés

- Injection : contenu existant malveillant, testé inerte (tâche 3).
- Bout en bout : site peuplé → plan proposé ne redéfinit pas les collections
  existantes.
- Non-régression : installeur sur site vide, comportement identique.

## 7. Pièges connus

- Respecter strictement ADR-0010/ADR-0023 : cette fiche ne touche que la
  *proposition*, jamais l'écriture — le garde-fou `CONTENT_READ_ONLY` reste
  identique.
- Ne jamais lire le contenu existant comme une instruction — canal `data`
  uniquement, comme le document déjà.

## 8. Décisions à prendre

Aucune ADR requise — lecture seule, déjà couverte par `PermissionLayer` (R2/R4).
