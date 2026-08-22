# Plan de correction — session QA du 2026-08-22

Compagnon du [plan de test](plan-test-fonctionnel-2026-08-22.md) et du
[rapport d'exécution](rapport-test-2026-08-22.html). Un constat par ligne :
racine identifiée, correction appliquée ou non, et pourquoi.

## Corrigés cette session

### 1. Aucune génération automatique du slug depuis le titre (majeur)

**Constat** (lot A) : créer un article, taper un titre, le champ `slug` reste
vide — contrairement à WordPress/Drupal/Strapi. C'est ce qui a produit
l'article de production sans URL qui faisait planter la page d'accueil
(session précédente).

**Racine** : `deriveSlug()` (`packages/schema/src/routing/slug.ts`) existe et
est testée, mais n'est appelée par aucun chemin d'écriture. Côté admin,
`fields/slug-field.tsx` documentait lui-même l'absence : « la dérivation est
une responsabilité du formulaire » — un formulaire qui ne l'implémentait pas.

**Correction** : `packages/admin/src/routes/entry-edit.tsx` — `setFieldValue`
dérive maintenant tout champ `slug` dont `options.from` pointe vers le champ
en cours d'édition, tant que le champ reste égal à la dernière valeur que
*nous* avons proposée (jamais un slug déjà présent au chargement — un article
existant garde son URL). Vérifié en direct dans le navigateur et par les 21
tests de `entry-edit.test.tsx`.

**Non fait, à savoir** : le serveur (`store.ts`) n'appelle toujours pas
`deriveSlug()` — un appel API direct (hors admin) peut encore créer un
article sans slug. `docs/qa/memory` du système en garde la trace pour une
prochaine session.

### 2. Une boîte de dialogue de création ne se ferme jamais après succès (majeur, transversal)

**Constat** (lot B) : sur Utilisateurs et Clés API, après une création
réussie, ✕/Annuler/Échap ne ferment plus la modale. Reproduit en isolation,
hors de tout doute lié à l'environnement de test partagé.

**Racine** : `packages/admin/src/ui/modal.tsx` nomme quatre animations CSS
sur les attributs `data-state` de Radix (`cg-admin-modal-in/out`,
`cg-admin-overlay-in/out`) pour que `Dialog.Content` ne se démonte qu'une
fois l'animation de sortie *réellement* terminée (Radix attend un vrai
`animationend`). **Aucune de ces quatre `@keyframes` n'était définie nulle
part dans le code.** Un `animation-name` qui ne correspond à aucune
`@keyframes` ne déclenche jamais `animationend` — Radix attendait donc
indéfiniment, `data-state` passait bien à `closed`, mais le nœud DOM restait
affiché et interactif pour toujours.

**Correction** : les quatre `@keyframes` ajoutées dans
`packages/admin/src/styles/base.css` (fondu simple, en opacité). Un seul
composant partagé, donc un seul correctif qui couvre toutes les modales de
l'admin (menus, taxonomies, corbeille compris). Vérifié en direct
(reproduction du bug puis re-test après correction) et par les suites
`users.test.tsx`/`api-keys.test.tsx` (34 tests, aucune régression).

### 3. Une route admin inconnue affiche une page totalement blanche (majeur)

**Constat** (lot B) : `/admin/updates`, `/admin/export`, ou toute URL
inventée sous `/admin/*` rendent une page vide — sans menu, sans en-tête,
sans message, sans erreur console. `react-router` ne rend rien du tout
quand aucune route ne correspond, y compris le layout parent.

**Correction** : `<Route path="*" element={<NotFoundRoute />} />` ajoutée en
dernier enfant du groupe authentifié (`app.tsx`), nouveau composant
`routes/not-found.tsx`. Le menu et l'en-tête restent visibles, un message
explique la situation, un bouton ramène au tableau de bord. Clés `notFound.*`
ajoutées en français et en anglais. Vérifié en direct.

### 4. Message d'erreur de connexion non traduit (mineur)

**Constat** (lot B) : mauvais mot de passe → « Incorrect email or password. »
en anglais, au milieu d'un écran entièrement français.

**Racine** : `login.tsx` affichait `caught.message` (le message brut du
serveur, jamais localisé — un contrat d'API stable, pas un texte d'UI) pour
toute `ApiError`, sans jamais passer par `t(...)`.

**Correction** : `loginErrorMessage()` dans `login.tsx` traduit les codes
d'erreur qu'un essai de connexion produit réellement
(`AUTH_INVALID_CREDENTIALS`, `AUTH_USER_NOT_FOUND`,
`AUTH_RECOVERY_CODE_INVALID`, `AUTH_WEBAUTHN_FAILED`) vers la bonne clé
`login.*` **du contexte appelant** (mot de passe, code TOTP ou code de
récupération n'ont pas le même sens pour un même code d'erreur réutilisé) ;
tout code non prévu retombe sur le message brut, comme avant. Nouvelle clé
`login.incorrectPassword`. Les 3 tests qui vérifiaient encore le texte
anglais ont été mis à jour pour vérifier le texte français désormais affiché
— 14/14 tests verts.

### 5. Le widget « État des sauvegardes » contredit le dernier commit (majeur → reclassé)

**Constat** (lot B) : le texte promettait la fonctionnalité « dès que la
fiche 26 sera livrée » — or le dernier commit du dépôt annonce précisément
la fusion de cette fiche.

**Racine réelle** : ce n'est pas un défaut de câblage. Le message du commit
de fusion est explicite : *« restore is deliberately CLI-only, never exposed
by the admin API »*. La fiche 26 est livrée, mais volontairement sans écran
admin — le texte du widget, lui, n'a pas été mis à jour après la fusion et
promettait un écran qui n'a jamais été prévu.

**Correction** : texte du widget corrigé (fr/en) pour refléter l'état réel —
sauvegarde/restauration existent en ligne de commande
(`cogenta backup`/`cogenta restore`), ce widget restera vide tant qu'aucune
API admin ne les expose.

### 11. Message « Statut changé en Publié » resté affiché à tort après duplication (mineur)

**Constat** (lot A) : dupliquer un article publié, la nouvelle copie (en
réalité `Brouillon`) affiche quand même « Statut changé en Publié. ».

**Racine** : `duplicate()` (`entry-edit.tsx`) navigue vers l'URL de la copie
en changeant seulement le paramètre `:id` — react-router **réutilise** la
même instance du composant plutôt que de la remonter, donc `statusMessage`
(posé par l'action de publication de l'article *original*, juste avant) ne
se réinitialise jamais tout seul.

**Correction** : `setStatusMessage(null)` explicite avant la navigation dans
`duplicate()`.

### 13. Libellé technique « degraded » cru sur le tableau de bord (mineur)

**Constat** (lot A) : le badge de santé affiche `sqlite (degraded)` sans
explication — déroutant pour un admin non technique, alors que c'est l'état
normal d'une installation locale sans service externe.

**Correction** : le statut se traduit désormais (`dashboard.healthStatus.*`)
et une phrase d'explication apparaît sous le badge dès que le statut n'est
pas `ok` (`dashboard.healthDegradedHint`) — même message que l'écran Santé
donne déjà, juste rendu visible ici aussi.

### 14. UUID d'acteur bruts dans le flux d'activité du tableau de bord (mineur)

**Constat** (lot A) : le tableau de bord affiche l'UUID brut de l'acteur au
lieu d'un e-mail lisible — l'écran Journal d'audit complet, lui, le résout
déjà.

**Correction** : `dashboard.tsx` reprend exactement le même mécanisme que
`audit.tsx` — une table `id → e-mail` construite une fois via `listUsers()`,
avec repli sur l'UUID si l'utilisateur n'existe plus.

### 15. Les tentatives de connexion échouées ne sont pas journalisées (mineur)

**Constat** (lot B) : seules les connexions réussies apparaissent dans le
journal d'audit — un point faible pour la détection d'intrusion (WordPress
et ses extensions de sécurité journalisent aussi les échecs).

**Correction** : `recordAuthAudit()` (`packages/cli/src/commands/serve.ts`)
journalise désormais un `auth.login_failed` (acteur `null`, e-mail tenté en
`diff`) pour toute réponse non-2xx de `POST /api/auth/login` — uniquement
cette première étape : TOTP, code de récupération et passkey réutilisent les
mêmes codes d'erreur pour un sens différent à chaque fois, les y journaliser
sous un même intitulé générique aurait mal nommé ce qui a réellement échoué.
Nouveau test de bout en bout dans `serve-auth.test.ts` (mauvais mot de passe
→ entrée `auth.login_failed` retrouvée via `GET /api/audit?action=…`).

### 16. Aucun retour visuel de sauvegarde sur Réglages du site (mineur)

**Constat** (lot B) : l'enregistrement automatique au blur fonctionne
réellement, mais rien à l'écran ne le confirme visiblement.

**Racine, nuance** : un retour existe déjà — `FieldStatus`
(`site-settings-field.tsx`) affiche « Enregistré. » sous le champ — mais en
texte gris discret, de la même taille que le reste, facile à manquer (l'agent
de test ne l'a pas vu).

**Correction** : ajout d'un bandeau de confirmation (`Notice tone="success"`)
en haut de l'écran, visible ~2,5 s après tout enregistrement réussi — en plus
du texte discret existant, pas à sa place (clé distincte `settings.savedNotice`
pour ne pas entrer en collision avec `settings.saved` du champ lui-même).

## Non corrigés — reclassés « pas un défaut » après vérification

### 6. « Écran de mise à jour introuvable » (lot B avait noté majeur)

Vérifié dans le code : l'écran existe bel et bien, à `/admin/ops-settings`
(`packages/admin/src/routes/ops-settings.tsx` importe et affiche
`updates-client.ts`, chargé automatiquement à l'ouverture de l'écran — pas un
onglet caché). Le nav le liste sous le libellé **« Sécurité & webhooks »**,
qui ne laisse pas deviner qu'il contient aussi la gestion des mises à jour —
c'est ce qui a fait manquer l'écran à l'agent de test, qui cherchait un lien
nommé « Mises à jour » avant d'essayer des URL au hasard.
**Suggestion, non appliquée** : renommer le libellé de navigation, ou
scinder l'écran. Coût faible, laissé pour une prochaine session par prudence
sur l'impact visuel d'un renommage de navigation non demandé par l'utilisateur.

### 7. « Export/Sauvegarde/RGPD introuvable » (lot B avait noté majeur)

Confirmé par le commit de la fiche 26 lui-même : ces fonctions sont
**délibérément CLI-only** (`cogenta export`/`import`/`backup`/`restore`),
jamais exposées par l'API admin — pas un oubli de câblage. Rien à corriger
ici ; seul le texte du widget (constat 5) avait besoin d'être mis à jour.

### 12. « Écran Taxonomies absent de la navigation » (lot A/B avait noté mineur)

Vérifié dans le code : le lien existe (`shell/nav-items.ts`,
`visibleWhen: { kind: 'taxonomiesPresent' }`) — il ne s'affiche que si le
site a réellement déclaré au moins une taxonomie, ce qui n'est pas le cas de
`local-playground`. C'est le comportement voulu (pas de lien mort vers un
écran qui n'aurait rien à montrer), pas un oubli de navigation.

## Non corrigés — hors périmètre de cette session (budget), documentés pour la suite

| # | Constat | Lot | Gravité | Piste |
|---|---|---|---|---|
| 8 | Lien mort (`href="#"`) sur l'article listé sans slug | C | Majeur (déjà dégradé proprement, pas un plantage) | Résidu de l'article de production sans slug déjà présent en base ; se résorbe en éditant cet article (le correctif 1 l'empêche pour tout nouveau contenu). |
| 9 | Page d'accueil sans meta description / `og:description`/`og:image` | C | Mineur | Contenu manquant sur l'entrée `home`, pas un bug de code — à renseigner via l'écran SEO. |
| 10 | `Error: Minified React error #185` (« Maximum update depth exceeded ») pendant l'édition du corps / publication / duplication d'un post | A | Mineur, à surveiller | Aucun plantage observé, mais une vraie boucle de re-render existe quelque part dans l'éditeur de texte enrichi ou le panneau de statut — mérite une session de profilage React dédiée. |
| 17 | Sélection de bloc par clic direct dans l'aperçu du builder, non concluante à petite largeur de fenêtre | A | Non confirmé | À revérifier dans une fenêtre de taille réelle avant de conclure à un défaut. |
| 18 | Comparaison/restauration de version non vérifiée (une seule version disponible sur les entrées testées) | A | Non testable en l'état | Nécessite une entrée avec un vrai historique multi-versions. |
| 19 | `test/notices/notice-board.test.tsx` — le test « offers a way to act on it » échoue **avant même les changements de cette session** (vérifié par `git stash` contre le code non modifié) | — | Pré-existant, sans rapport avec cette session | Signalé ici pour ne pas se perdre ; à investiguer séparément — le lien « Configurer maintenant » de la notice MFA ne semble pas atteignable par `findByRole('link', …)` dans ce test. |

## Vérification de non-régression

`pnpm -F @cogenta/admin typecheck` et `pnpm -F @cogenta/cli typecheck` :
propres. Suites ciblées rejouées après la seconde vague de corrections —
`dashboard.test.tsx`, `entry-edit.test.tsx`, `settings.test.tsx` (52/52),
`serve-audit.test.ts`/`serve-auth.test.ts` (14/14, dont le nouveau test de
l'audit des connexions échouées) — toutes vertes. Suite complète admin
(113 fichiers, avant la seconde vague) : **1073/1076** ; les 3 écarts déjà
identifiés comme un flake confirmé et le défaut pré-existant #19, aucun lié
aux corrections de cette session.
