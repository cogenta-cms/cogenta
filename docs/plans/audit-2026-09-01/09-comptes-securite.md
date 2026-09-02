# Audit domaine 09 — Utilisateurs, profil/authentification, rôles/permissions, clés d'API, journal d'audit — 2026-09-01

Périmètre : `packages/auth/src/**`, `packages/admin/src/routes/{users,profile,login,forgot-password,reset-password,roles,api-keys,audit}.tsx`,
`packages/api/src/rest/{users,auth,role-permissions,api-keys,audit}-router.ts`, `packages/api/src/access/permissions.ts`,
`packages/schema/src/store/role-permission-*.ts`, câblage `packages/cli/src/commands/serve.ts`.
Fiches vérifiées : 17, 18, 19, 20, 21, 61, 62, 63. ADR vérifiées : ADR-0018, ADR-0021, ADR-0022, ADR-0027, ADR-0028.

## 1. Résumé exécutif

**Constat central, à ne pas manquer** : les fiches 17-21 décrivent un état du dépôt largement dépassé. Les fiches
« cycle de vie » (61, 62, 63), plus récentes, annoncent encore des trous (audit non journalisé, quota non branché,
purge/réactivation absentes, écran de rôles en lecture seule) qui se sont révélés **déjà comblés dans le code réel**
au moment de cet audit — vraisemblablement par du travail postérieur à la rédaction de ces fiches et non répercuté
dans `CLAUDE.md`, qui présente encore ADR-0028 comme « rédigée, non insérée » alors qu'elle est **actée et intégralement
implémentée** dans `docs/03-decisions.md` et dans le code (`cogenta_role_permissions`, `PermissionLayer.ruleFor`/
`ruleForTerm`, écran d'édition avec diff et confirmation).

Sur l'ensemble des critères tirés des huit fiches (46 items comptés individuellement, tâches + critères d'acceptation) :
**41 FAIT, 3 PARTIEL, 0 ABSENT (hors fonctionnalités explicitement hors périmètre comme la réattribution optionnelle
de la fiche 61), 2 POINT MORT**. Aucun bug de sévérité critique trouvé (pas de fuite de secret, pas de contrôle
d'accès manquant, pas de clé API brute réexposée). Le principal vrai manque, absent des huit fiches elles-mêmes, est
un **export RGPD des données personnelles** (droit d'accès/portabilité) : seule l'anonymisation (droit à l'effacement)
existe.

**Points morts confirmés** (fonction écrite et testée, jamais câblée à un déclencheur réel) :
1. `AuditLog.prune()` (`packages/auth/src/audit.ts`) — retention purge chain-safe, jamais appelée par `cogenta serve`,
   aucune configuration, aucune route, aucune tâche planifiée.
2. Portées d'une clé API affichées en langue naturelle : le détail complet n'existe qu'au survol (`title=`), jamais
   visible sans interaction — point d'accessibilité, pas un point mort au sens strict mais listé ici pour mémoire.

**Trois PARTIEL** : (a) `AUTH_RATE_LIMITED` (backoff de connexion) ne porte pas d'en-tête `Retry-After` exploitable côté
client, contrairement à `API_KEY_RATE_LIMITED` qui en a un ; (b) portées de clé API affichées comme liste brute de
rôles, le rendu « langue naturelle » n'existe qu'en tooltip ; (c) journalisation de la création de compte / changement
de mot de passe / révocation de session par sniffing du chemin HTTP à la couche transport (`recordUserAudit`,
`recordApiKeyAudit`, `recordRolePermissionAudit` dans `serve.ts`) plutôt que dans le routeur lui-même — fonctionne,
mais fragile à toute évolution de forme d'URL (c'est exactement ce bug-là, découvert et corrigé pour les mutations de
rôle par la fiche 61, qui n'est pas structurellement empêché de se reproduire pour ces trois routes-là).

## 2. Ce qui existe réellement

### 2.1 Utilisateurs — `packages/admin/src/routes/users.tsx` (1122 lignes), `packages/api/src/rest/users-router.ts`, `packages/auth/src/users.ts`

- Liste avec recherche (`q` sur email/nom affiché), tri (`createdAt`/dernière connexion), pagination par curseur
  (`encodeUsersCursor`/`decodeUsersCursor`), filtrable par rôle.
- Création avec invitation par e-mail (statut `invited`, jeton réutilisant `auth.resets.issue`) **et repli R1**
  (mot de passe généré affiché une fois quand aucun transport e-mail n'est configuré, comportement historique
  préservé à l'octet).
- Renvoi/annulation d'invitation (`inviteRoute`, `POST`/`DELETE /api/users/{id}/invite`).
- Modification des rôles et du statut (`applyUserChange`, point de mutation unique partagé par la route `PATCH`
  et la route `bulk`), actions groupées avec `Promise.allSettled` et rapport `succeeded`/`failed`.
- Profil de compte (nom affiché, avatar, bio, langue), `PATCH /api/users/me/profile`, self-only.
- Colonnes dernière connexion, badge « dormant » (90 jours), badge MFA recommandée réutilisant `sensitiveRoles()`/
  `requiresMfa()` de `packages/auth/src/mfa.ts` (ADR-0021, jamais un blocage).
- Boîte de dialogue de changement de rôle : liste réelle de ce que chaque rôle coché accorde (`grantsForRole`,
  calculée depuis le schéma servi, jamais une description figée), et avertissement sur un rôle inconnu du schéma
  (`users.unknownRoleWarning`).
- Suppression = anonymisation (`POST /api/users/{id}/anonymize`), confirmation par saisie exacte de l'e-mail,
  état terminal `anonymized`, e-mail remplacé par un jeton non réversible sur domaine `.invalid` (RFC 2606).
- `assertAdminRemains` : refuse de désactiver/rétrograder/anonymiser le dernier compte `admin` actif.
- Chaque mutation (`PATCH`, bulk, invitation, anonymisation) journalisée dans l'audit (`auth.audit.record`), à
  l'intérieur même du routeur pour ces quatre cas — le trou signalé par la fiche 61 est comblé.

### 2.2 Profil et authentification — `profile.tsx` (829 l.), `login.tsx` (365 l.), `forgot-password.tsx`, `reset-password.tsx`, `auth-router.ts`, `packages/auth/src/{mfa,recovery-codes,totp,webauthn,sessions,rate-limit,user-agent,password}.ts`

- Changement de mot de passe (avec l'ancien), TOTP (enrôlement, confirmation, désactivation), passkeys (WebAuthn),
  sessions actives avec révocation individuelle.
- **Codes de récupération** (fiche 18 tâche 1, complet) : 10 codes générés à la confirmation TOTP et à la
  régénération, alphabet sans caractères ambigus, hachés avec le même scrypt qu'un mot de passe, compteur restant,
  consommation par compare-and-set (retry sous concurrence), connexion par code (`recoveryCodeLogin`) en alternative
  au TOTP à l'écran de connexion, notice de sécurité recalculée depuis l'audit (fenêtre 30 jours) à chaque
  consommation.
- « Déconnecter toutes les autres sessions » (`sessions.revokeAllExcept`), épargne explicitement et visiblement la
  session courante.
- Métadonnées de session **sans IP en clair** : `user-agent.ts` (zéro dépendance, R9) ne garde que famille de
  navigateur + type d'appareil, jette le `User-Agent` brut immédiatement après usage.
- Politique de mot de passe exposée par route publique (`GET /api/auth/password-policy`), consommée à l'identique
  côté client (indicateur de robustesse) et côté serveur — pas de duplication.
- « Mon activité » (`GET /api/audit/me`) : acteur forcé côté serveur, jamais un paramètre client.
- Limitation des tentatives de connexion : backoff progressif à quatre seuils (5/10/15/20 tentatives →
  1 s/10 s/60 s/15 min), jamais un verrou définitif.
- « Se souvenir de moi » (TTL de session court explicite sinon), redirection post-connexion vers la page demandée,
  message d'erreur uniforme (`AUTH_INVALID_CREDENTIALS`) qui ne distingue jamais e-mail inconnu / mauvais mot de
  passe / compte désactivé côté public.

### 2.3 Rôles et permissions — `packages/admin/src/routes/roles.tsx` (879 l.), `packages/api/src/access/permissions.ts`, `packages/api/src/rest/role-permissions-router.ts`, `packages/schema/src/store/role-permission-{store,overlay,tables,export}.ts`

- Matrice de lecture : onglet par collection/taxonomie × 5 actions, onglet inversé par rôle, section commerce
  séparée (vocabulaire propre au contrat E), lien vers les capacités de plugins.
- Diagnostics d'anomalies, les cinq règles de la fiche 19 tâche 3 implémentées dans
  `packages/admin/src/schema/permission-diagnostics.ts` : collection illisible, écriture ouverte à `public`,
  collection routée mais fermée à `public` en lecture (le cas sitemap 500 de L10, littéralement testé), rôle
  utilisé par un compte mais inconnu du schéma, rôle déclaré mais porté par aucun compte.
- **Écriture réelle des permissions** (ADR-0028, actée et implémentée, pas seulement rédigée) : table site-scopée
  `cogenta_role_permissions`, `PermissionLayer` (en réalité `packages/api/src/access/permissions.ts`, pas
  `packages/schema`) l'interroge en priorité via `ruleFor`/`ruleForTerm`, retombe sur le fichier de schéma sinon —
  jamais l'inverse. Écran `roles.tsx` : édition → aperçu diff avant/après → confirmation explicite, jamais
  d'écriture silencieuse. Validation réutilise `defineCollection`/`defineTaxonomy` (fiche 63 tâche 4). Deux
  appelants qui lisaient encore le fichier directement (`assertOwnAware` dans `content-service.ts`,
  `holdsRole` dans `review-router.ts`) ont bien été corrigés pour interroger la règle effective.
- Permission par propriétaire (`own: true`, ADR-0027) : `PermissionLayer.can()` compare l'acteur au propriétaire de
  l'entrée ; refusée à la définition sur `create` et `read`/`publish`.
- Chaque `PUT`/`DELETE` réussi sur `/api/role-permissions` journalisé (`recordRolePermissionAudit`, `serve.ts`).

### 2.4 Clés d'API — `packages/admin/src/routes/api-keys.tsx` (644 l.), `packages/api/src/rest/api-keys-router.ts`, `packages/auth/src/api-keys.ts`

- Création avec nom + portée (liste de rôles) + expiration au choix (30j/90j/1an/jamais, défaut 90 jours).
- Rotation avec fenêtre de sursis bornée à 7 jours (les deux clés valides pendant la fenêtre).
- **Quota par clé réellement appliqué** : `resolveApiKeyActor` (`auth-router.ts`) consomme le quota
  (`rateLimitPerMinute`, défaut 600/min) via un driver dédié (`packages/core/src/rate-limit/{memory,redis}.ts` —
  paire optimal/dégradé conforme R1), lève `API_KEY_RATE_LIMITED` au dépassement ; `cogenta serve` traduit cette
  erreur précise en `429` avec en-têtes `Retry-After`/`RateLimit-*`.
- Purge (`POST .../purge`, uniquement une clé révoquée depuis au moins `MIN_PURGE_AFTER_REVOKED_DAYS`) et
  récupération (`POST .../recover`, option (b) de la fiche 62 : mint une clé de remplacement dans une fenêtre
  courte après révocation par erreur, `revoked_at` de la clé originale ne repasse **jamais** à `null`).
- Usage agrégé 7/30 jours, signal « jamais utilisée »/« inutilisée depuis 90 jours ».
- Portées affichées comme liste de rôles bruts avec détail complet **au survol seulement** (`title=`), et
  avertissement visible quand une portée donne un accès en écriture (`apiKeys.scopeWriteWarning`).
- `listApiKeys` ne renvoie jamais la clé brute (test de non-régression explicite).
- Chaque création/rotation/révocation/purge/récupération journalisée (`recordApiKeyAudit`, `serve.ts`), jamais la
  clé elle-même dans le diff.

### 2.5 Journal d'audit — `packages/admin/src/routes/audit.tsx` (591 l.), `packages/api/src/rest/audit-router.ts`, `packages/auth/src/{audit,audit-integrity}.ts`

- Chaîne de hachage (`createAuditLog`), `GET /api/audit/verify` exposé à l'écran, en un clic.
- Détail d'une entrée avec diff, réutilisant le même composant `DiffView` que l'historique de versions — pas de
  second calcul.
- Filtre par plage de dates avec raccourcis (aujourd'hui / 7 j / 30 j), export CSV et JSON de la vue filtrée
  (l'export lui-même journalisé, avec le compte des lignes exportées mais jamais les lignes elles-mêmes),
  pagination par curseur.
- Vérification d'intégrité **planifiée** (tâche `'audit-integrity'` dans `cogenta serve`, intervalle quotidien),
  vérification incrémentale réelle (`verifyRange(since)`, table « genesis » comme point de reprise), notice
  admin-only non-rejetable et alerte de canal (`sendAuditIntegrityAlert`) en cas de rupture.
- Distinction humain / agent / clé API / système (`classifyAuditActor`), filtre dédié dans l'écran
  (`ACTOR_KINDS`).
- Rétention : l'écran dit honnêtement que le journal croît sans limite (`audit.retentionUnbounded`) — et c'est
  vrai : `AuditLog.prune()` existe, préserve la vérifiabilité du segment restant (table « genesis » ancrant le
  hash de coupure), est testé, mais **n'est appelée nulle part** en dehors des tests.

## 3. Vérification des fiches, critère par critère

| Fiche | Tâche / critère | Verdict | Preuve | Écart |
|---|---|---|---|---|
| 17 | T1 Invitation par e-mail + repli R1 | FAIT | `users-router.ts` ~758-790, `inviteRoute` L919 | — |
| 17 | T2 Recherche, pagination, tri, actions groupées | FAIT | `users-router.ts` 687-803, `bulkRoute` L803 (`Promise.allSettled`) | — |
| 17 | T3 Profil de compte (nom, avatar, bio, locale) | FAIT | `users.ts` `UpdateProfileInput`/`updateProfile`, `profileRoute` | — |
| 17 | T4 Dernière connexion, dormant, badge MFA | FAIT | `publicUser()` L334, `isDormant()` L326, `sensitiveRoles()`/`requiresMfa()` | — |
| 17 | T5 Suppression correcte (anonymisation) | FAIT | `anonymizeRoute` 984-1040, `anonymizedEmail()` (`.invalid`) | — |
| 17 | Critère : cent comptes gérables | FAIT | pagination curseur, non testé à 100 en vrai mais mécanisme borné | — |
| 17 | Critère : e-mail plus seul identifiant | FAIT | nom affiché exposé par `publicUser` | — |
| 61 | T1 Journaliser chaque mutation | FAIT | `applyUserChange` L616 (`user.update`), `inviteRoute` L952/973, `anonymizeRoute` L1029 | mutations création/mdp/session toujours journalisées par sniffing chemin (`serve.ts:3181`), pas dans le routeur — fragile, cf. §4 |
| 61 | T2 Décision (a) anonymisation = réponse produit | FAIT | `hint` explicite « Anonymization is irreversible... invite a new account instead » | à confirmer que l'écran ne suggère nulle part une suppression dure — vu correct dans le code lu |
| 61 | T3 Réattribution (optionnelle) | NON FAIT (explicitement optionnel) | — | hors périmètre tant qu'aucun besoin réel n'apparaît, conforme à la fiche |
| 18 | T1 Codes de récupération | FAIT | `recovery-codes.ts`, `credentials.ts` L197-257, `login.ts` L321/423/514, notice `recovery-code-used.ts` | — |
| 18 | T2 Sessions lisibles + révocation en masse | FAIT | `sessions.ts` `revokeAllExcept` L94/171 | — |
| 18 | T3 Robustesse mot de passe + politique visible | FAIT | `password-policy.ts`, `GET /api/auth/password-policy`, `profile.tsx` 116/532-590 | — |
| 18 | T4 Mon activité | FAIT | `audit-router.ts` 328-340, acteur codé en dur | — |
| 18 | T5 Confort de connexion | PARTIEL | rate-limit progressif FAIT (`rate-limit.ts`), `AUTH_RATE_LIMITED` sans en-tête `Retry-After` exploitable côté client (contrairement à `API_KEY_RATE_LIMITED`) | ajouter le même traitement d'en-tête que pour les clés API |
| 18 | Critère : perdre l'authentificateur n'enferme plus | FAIT | codes de récupération + connexion par code | — |
| 18 | Critère : aucune IP en clair stockée/affichée | FAIT | `user-agent.ts`, aucune occurrence trouvée | — |
| 19 | T1 Matrice en lecture | FAIT | `roles.tsx`, onglets `byCollection`/`byRole`, section commerce | — |
| 19 | T2 Explication au point d'usage | FAIT | `users.tsx` L1027 `grantsForRole`, `unknownRoleWarning` | — |
| 19 | T3 Diagnostic de cohérence (5 règles) | FAIT | `permission-diagnostics.ts` (5 règles dont `routedNotPublic` = cas sitemap L10) | — |
| 19 | T4 Écriture (option retenue) | FAIT | option (c) tranchée (ADR-0028), `role-permissions-router.ts`, `roles.tsx` diff+confirmation | — |
| 19 | T5 Permission par propriétaire | FAIT | ADR-0027, `permissions.ts` 168-170, `define-collection.ts` 360-388 | — |
| 20 | T1 Expiration au choix | FAIT | `api-keys-router.ts` `DEFAULT_EXPIRY_MS` | — |
| 20 | T2 Rotation avec sursis | FAIT | `graceHoursField` borné 7j, `rotateRoute` | — |
| 20 | T3 Limitation de débit sans Redis | FAIT | `resolveApiKeyActor`, driver mémoire + Redis, R1 respecté | contredit fiche 62 qui le donnait pour non branché — code postérieur à la fiche |
| 20 | T4 Usage et hygiène + audit | FAIT | usage 7/30j, `recordApiKeyAudit` (`serve.ts` L3234) | audit hors du routeur lui-même, cf. §4 |
| 20 | T5 Portées lisibles | PARTIEL | liste brute + détail complet en `title=` seulement, avertissement écriture présent | rendre le détail visible sans survol (accessibilité clavier/tactile) |
| 62 | T1 Audit (priorité) | FAIT | `recordApiKeyAudit`, `serve.ts` L3234 | contredit l'état « aucun appel » que décrivait la fiche |
| 62 | T2 Purge | FAIT | `POST .../purge`, refuse une clé non révoquée | — |
| 62 | T3 Réactivation, option (b) | FAIT | `POST .../recover`, `revoked_at` jamais relevé | conforme à la recommandation de la fiche |
| 62 | T4 Vérifier limitation de débit branchée | FAIT | confirmé branché (voir 20 T3) | la fiche disait « à vérifier », vérifié positif |
| 21 | T1 Détail d'une entrée + diff | FAIT | `audit.tsx` modal `EntryDetail`, `DiffView` réutilisé | — |
| 21 | T2 Dates, export, pagination | FAIT | `audit.tsx` `since`/`until`, `runExport('csv'\|'json')`, export lui-même journalisé | — |
| 21 | T3 Vérification d'intégrité planifiée + alerte | FAIT | tâche `'audit-integrity'` (`serve.ts` ~L5897), `sendAuditIntegrityAlert`, `verifyRange` incrémental | — |
| 21 | T4 Distinguer les agents | FAIT | `classifyAuditActor` (audit.ts L181), filtre `ACTOR_KINDS` dans `audit.tsx` | pas un onglet dédié séparé, mais un filtre — couvre l'esprit du critère |
| 21 | T5 Rétention | **POINT MORT** | `AuditLog.prune()` écrit et testé (`audit.ts` ~L379-410, `audit.test.ts` L350) | jamais appelé par `cogenta serve`, aucune config, aucune route, aucune tâche planifiée — l'écran dit honnêtement « croît sans limite » |
| 63 | T1 Décision préalable | FAIT | ADR-0028 actée le 2026-08-26, option (c) | — |
| 63 | T2 (option b, abandonnée) | N/A | — | abandonnée par la décision, conforme |
| 63 | T3 Table `role_permissions`, priorité table>fichier | FAIT | `role-permission-tables.ts`, `permissions.ts` 81-97 | — |
| 63 | T4 Validation réutilisée | FAIT | `role-permission-store.ts` importe `defineCollection` (L2), revalide (L143-156) | — |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| P1 | `packages/auth/src/audit.ts` (`prune()`, ~L163/379-410) | `AuditLog.prune()` est complet et testé (archivage du hash d'ancrage dans une table « genesis », préserve la vérifiabilité du segment restant) mais n'est appelé nulle part hors des tests — ni `cogenta serve`, ni une tâche planifiée, ni une route API, ni une commande CLI. Fiche 21 tâche 5 reste donc réellement ouverte malgré la partie la plus dure (l'algorithme) déjà faite. | Ajouter une configuration `security.audit.retentionDays` (ou équivalent), une tâche planifiée mensuelle appelant `prune()`, et une ligne dans `audit.tsx` affichant la vraie politique au lieu du message « croît sans limite » quand elle est configurée. |
| P2 | `packages/api/src/rest/http.ts` L479 `errorResponse()` | `errorResponse()` ne sérialise jamais `error.details` sur le fil, pour aucun code d'erreur — `AUTH_RATE_LIMITED` porte un `details.retryAfterMs` calculé (`rate-limit.ts`) qui n'atteint jamais le client, contrairement à `API_KEY_RATE_LIMITED` qui reçoit un traitement spécifique dans `serve.ts` L5172 (en-tête `Retry-After`). Un client de connexion ne peut donc pas savoir programmatiquement combien de temps attendre. | Donner à `AUTH_RATE_LIMITED` le même traitement spécial que `API_KEY_RATE_LIMITED` dans `serve.ts`, ou généraliser la sérialisation d'un `Retry-After` pour tout code d'erreur portant un `details.retryAfterMs`/`resetAt`. |
| P2 | `packages/admin/src/routes/api-keys.tsx` L399-405 | Le détail des portées (« que peut faire ce rôle sur ce site ») n'est disponible qu'à travers l'attribut HTML `title`, jamais visible au clavier ni sur un écran tactile, et non lu de façon fiable par un lecteur d'écran. La fiche 20 tâche 5 demandait explicitement « au survol » mais le résultat est moins accessible qu'un texte inline ou un bouton « détail ». | Remplacer le `title=` par un élément `<details>`/popover accessible au clavier, ou un lien vers la matrice de rôles (fiche 19) qui montre déjà ce détail de façon accessible. |
| P3 (dette, pas un bug) | `packages/cli/src/commands/serve.ts` `recordUserAudit` (~L3181), `recordApiKeyAudit` (~L3234), `recordRolePermissionAudit` (~L3019) | Trois fonctions journalisent en **devinant l'action depuis la forme du chemin HTTP** (`method`/segments de l'URL) plutôt qu'au point d'écriture réel dans le routeur. C'est exactement la classe de bug que la fiche 61 a trouvée et corrigée pour `bulk` (`/api/users/bulk` ne matchait aucune forme attendue, donc une désactivation groupée ne produisait aucune entrée) — corrigée pour `users.tsx`/`applyUserChange`, mais le même schéma persiste, non corrigé par construction, pour la création de compte, le changement de mot de passe, la révocation de session, et pour l'intégralité des clés API et des permissions de rôle. Une future route dont la forme d'URL ne correspond pas exactement au pattern attendu par ces trois fonctions ne produira **aucune erreur visible**, juste une absence silencieuse d'entrée d'audit. | Pas un correctif isolé : documenter le risque, et pour toute nouvelle route de ces trois domaines, ajouter systématiquement un test qui vérifie qu'une entrée d'audit apparaît (comme fait pour `bulk` par la fiche 61) plutôt que de supposer que le sniffing suit. |
| P3 | Absent des huit fiches — trouvé en vérifiant la mission | Aucun **export RGPD des données personnelles** (droit d'accès / portabilité) : `packages/auth/src/users.ts` implémente l'anonymisation (droit à l'effacement) mais aucune route ni écran ne permet à un utilisateur ou à un admin d'exporter les données personnelles d'un compte (profil, sessions, clés API créées, entrées d'audit le concernant) dans un format portable. | Voir T09-09 en §6. |
| — (documentation, pas un bug) | `docs/05-securite.md` §4-5 | Le document de conception promet une « allowlist IP optionnelle sur l'admin » (absente du code, confirmé par grep) et une « protection CSRF sur toutes les mutations » — cette dernière est probablement sans objet réel puisque l'authentification est un jeton `Authorization: Bearer`, jamais un cookie de session (`auth-router.ts` L71), ce qui rend un CSRF classique inopérant par construction. Le document n'a pas été mis à jour pour refléter ce choix d'architecture. | Signalé à `docs-sync`, pas un correctif de code. |

Aucun `any`, `@ts-ignore`, `console.log` ni `throw new Error(` nu trouvé dans les fichiers du périmètre. Aucun
contrôle de permission trouvé à l'intérieur d'un outil plutôt qu'au niveau du routeur (R4 respecté). i18n vérifié
programmatiquement (393 clés `t(...)` utilisées dans `users.tsx`/`profile.tsx`/`login.tsx`/`roles.tsx`/
`api-keys.tsx`/`audit.tsx` contre `fr.json`/`en.json`) : zéro clé manquante après élimination des faux positifs de
regex (`t('a')`, `t('csv')` etc. qui sont en fait `document.createElement('a')` ou des littéraux de type, pas des
appels i18n).

## 5. Comparaison marché

### WordPress (Utilisateurs)

| Fonction | WordPress | Cogenta |
|---|---|---|
| Liste, filtre par rôle | ✅ | ✅ |
| Recherche par e-mail/nom | ✅ | ✅ |
| Pagination | ✅ | ✅ |
| Actions groupées (changer rôle, désactiver) | ✅ | ✅ (`Promise.allSettled`, rapport d'échecs) |
| Ajout avec e-mail (invitation) | ✅ | ✅ (avec repli mot de passe si pas de transport, R1) |
| Suppression avec réattribution du contenu | ✅ (choix réattribuer/supprimer à la suppression) | PARTIEL — anonymisation seulement, pas de choix de réattribution (fiche 61 T3, explicitement non construite) |
| Dernière connexion | plugin | ✅ |
| Export CSV des comptes | plugin | ❌ (existe pour l'audit, pas pour la liste des comptes) |
| Rôle personnalisé | plugin | ✅ (chaîne libre + matrice d'édition, ADR-0028) |

### WordPress (Profil : sessions, mots de passe d'application)

| Fonction | WordPress | Cogenta |
|---|---|---|
| Langue par utilisateur | ✅ | ✅ |
| « Déconnecter partout » | ✅ | ✅ (épargne la session courante) |
| Session identifiée (appareil/navigateur) | ❌ (juste IP) | ✅ **mieux**, sans IP stockée (choix vie privée) |
| Mots de passe d'application (portée limitée par app) | ✅ | PARTIEL — clés d'API jouent ce rôle mais portée = rôle entier, pas par app avec label et révocation individuelle aussi fine |
| Historique de ses propres actions | ❌ | ✅ **mieux** (« Mon activité », audit filtré serveur) |

### Members / User Role Editor (matrice de capacités)

| Fonction | Members/URE | Cogenta |
|---|---|---|
| Matrice rôles × capacités visible | ✅ | ✅ (`roles.tsx`, deux sens de lecture) |
| Créer/modifier un rôle et ses capacités depuis l'admin | ✅ | ✅ (ADR-0028, édition avec diff+confirmation) |
| Capacité par type de contenu | ✅ (par type de post) | ✅ (par collection/taxonomie, 5 actions figées contrat A) |
| Permission par propriétaire (« ses propres articles ») | ✅ (`edit_own_posts`) | ✅ (ADR-0027, `own: true`) |
| Diagnostic d'incohérence de permissions | ❌ | ✅ **mieux** (5 règles, dont le cas sitemap 500) |

### Wordfence / plugins 2FA (MFA, verrouillage)

| Fonction | Wordfence/2FA | Cogenta |
|---|---|---|
| TOTP | ✅ | ✅ |
| Codes de secours | ✅ | ✅ |
| Limite de tentatives avec délai progressif | ✅ | ✅ |
| Liste blanche IP | ✅ | ❌ (docs/05-securite.md le promet, absent du code) |
| Imposer la MFA à un rôle | ✅ (option de blocage) | ❌ **délibérément** (ADR-0021 : recommandation, jamais blocage — choix produit assumé, pas un manque) |
| Passkeys/WebAuthn | rarement natif | ✅ **mieux** |

### WP Activity Log

| Fonction | WP Activity Log | Cogenta |
|---|---|---|
| Journal des actions | ✅ | ✅ |
| Intégrité vérifiable cryptographiquement | ❌ | ✅ **unique**, chaîne de hachage |
| Détail : qu'est-ce qui a changé (diff) | ✅ | ✅ |
| Export CSV/JSON | ✅ | ✅ |
| Plage de dates + raccourcis | ✅ | ✅ |
| Alerte automatique sur événement sensible | ✅ | ✅ (alerte de canal sur rupture d'intégrité) |
| Rétention configurable avec purge | ✅ | ❌ **point mort** — le mécanisme existe (`prune()`), rien ne l'appelle |
| Distinction acteur humain/automatisé | partiel | ✅ **mieux** (humain/agent/clé API/système) |

### Export/effacement RGPD natif (WordPress Outils > Exporter/Effacer les données personnelles)

| Fonction | WordPress | Cogenta |
|---|---|---|
| Effacement des données personnelles d'un compte | ✅ | ✅ (anonymisation, irréversible, confirmation stricte) |
| **Export des données personnelles d'un compte** (droit d'accès/portabilité) | ✅ natif depuis WP 4.9.6 | ❌ **absent**, non mentionné par aucune des huit fiches |
| Demande/confirmation en deux étapes | ✅ | N/A (pas de flux existant à comparer) |

### Strapi 5 (RBAC, clés API)

| Fonction | Strapi 5 | Cogenta |
|---|---|---|
| Permission par type de contenu et par action | ✅ | ✅ (5 actions figées contrat A) |
| **Permission fine par champ** | ✅ | ❌ absent — hors contrat A actuel (pas dans les fiches non plus) |
| Conditions (ex. `own`) | ✅ | ✅ (ADR-0027) |
| Clé API à portée précise (pas un rôle entier) | ✅ (par ressource et action) | PARTIEL — portée = liste de rôles, pas de granularité par collection/action indépendante d'un rôle réel |
| Expiration de clé | ✅ | ✅ |
| Rotation de clé | ❌ | ✅ **mieux** |

### Drupal 11 (matrice de permissions)

| Fonction | Drupal | Cogenta |
|---|---|---|
| Matrice de permissions visible | ✅ | ✅ |
| Rôles multiples par compte | ✅ | ✅ |
| Permission par propriétaire de contenu | ✅ | ✅ |
| Session identifiée, révocation | ✅ | ✅ |

### SSO/OAuth (Google, GitHub)

| Fonction | Référence | Cogenta |
|---|---|---|
| Connexion admin via SSO OIDC/OAuth externe | courant (Google Workspace, GitHub Enterprise) | ❌ absent, explicitement différé (« module ultérieur », `docs/05-securite.md` §4) — cohérent, pas un oubli |

## 6. Spécification ultra détaillée des corrections et ajouts

### T09-01 — Câbler `AuditLog.prune()` à une politique de rétention réelle

**Priorité** : P1. **Effort** : 1 j. **ADR requise** : non (le mécanisme et son modèle de données sont déjà actés
implicitement par le code de `audit.ts`, aucune interface publique ne change).

**Fichiers à toucher** : `packages/core/src/config/{schema,types}.ts` (nouveau champ optionnel, section `security`
existante), `packages/cli/src/commands/serve.ts` (nouvelle tâche planifiée, sur le modèle exact de la tâche
`'audit-integrity'` déjà câblée), `packages/admin/src/routes/audit.tsx` (afficher la politique réelle au lieu du
message générique quand elle est configurée), `packages/admin/src/i18n/locales/{fr,en}.json`.

**Travail détaillé** :
1. Ajouter `security.audit.retentionDays?: number` à la configuration du site (optionnel — absent = comportement
   actuel inchangé, R1/rétrocompatibilité totale).
2. Dans `cogenta serve`, à côté de la tâche `'audit-integrity'` déjà existante (voir `serve.ts` ~L5897), ajouter une
   tâche planifiée (fréquence raisonnable : quotidienne, alignée sur la vérification d'intégrité) qui, si
   `retentionDays` est configuré, appelle `auth.audit.prune(cutoffIso)` avec `cutoffIso` calculé à
   `now - retentionDays`.
3. Journaliser l'exécution de la purge elle-même (nombre de lignes prunées, nouveau point d'ancrage) — même logique
   que pour l'export (fiche 21 tâche 2 : « l'export d'un journal d'audit est lui-même un événement à journaliser »).
4. `audit.tsx` section rétention (déjà présente, L583-591) : si `retentionDays` est configuré, afficher « purge
   automatique au-delà de N jours, dernière exécution le … » au lieu de `audit.retentionUnbounded`.
5. Ne jamais purger si aucune configuration n'est présente — le silence actuel (« croît sans limite ») reste le
   comportement par défaut, honnête, pas un choix implicite de purge.

**Critères d'acceptation** :
- Sans configuration, comportement inchangé à l'octet (aucune purge, message inchangé).
- Avec `retentionDays` configuré, une entrée plus vieille que la fenêtre disparaît après le prochain passage de la
  tâche planifiée, et `verifyRange` depuis un checkpoint antérieur au point de troncature continue de réussir
  (résume depuis le genesis, comme déjà testé dans `audit.test.ts`).
- La purge elle-même produit une entrée d'audit.

**Tests exigés** : un test d'intégration qui configure `retentionDays`, avance une horloge simulée, déclenche la
tâche planifiée, et vérifie à la fois la disparition des lignes et la préservation de `verify()`. Réutiliser les
fixtures déjà écrites dans `packages/auth/test/audit.test.ts` (`describe('AuditLog.prune (fiche 21 task 5)')`).

**Impact contrat/ADR** : aucun — extension additive de la configuration, ADR requise : non.

---

### T09-02 — `Retry-After` exploitable sur le backoff de connexion

**Priorité** : P2. **Effort** : 2-3 h. **ADR requise** : non.

**Fichiers à toucher** : `packages/cli/src/commands/serve.ts` (le point où `API_KEY_RATE_LIMITED` est déjà traduit
en en-têtes, ~L5172), éventuellement `packages/api/src/rest/http.ts` si le traitement est généralisé plutôt que
dupliqué pour `AUTH_RATE_LIMITED`.

**Travail détaillé** : reproduire, pour l'erreur `AUTH_RATE_LIMITED` (levée par `rate-limit.ts` avec
`details.retryAfterMs` déjà calculé), exactement le traitement déjà écrit pour `API_KEY_RATE_LIMITED` dans
`serve.ts` : intercepter le code d'erreur avant la sérialisation générique, poser `Retry-After` (en secondes,
arrondi) et le statut 429. Alternative plus propre à évaluer : généraliser `errorResponse()`/le point d'appel dans
`serve.ts` pour tout code d'erreur portant un `details.retryAfterMs`, plutôt que de dupliquer le traitement une
troisième fois (une route de formulaire — fiche 16 — a le même besoin avec `FORM_RATE_LIMITED`).

**Critères d'acceptation** : une tentative de connexion après avoir franchi le premier seuil de backoff reçoit une
réponse 429 avec un en-tête `Retry-After` numérique, jamais seulement un message texte.

**Tests exigés** : test d'intégration login → 5 échecs → 6ᵉ tentative → vérifier le code 429 et l'en-tête.

**Impact contrat/ADR** : aucun.

---

### T09-03 — Détail de portée de clé API accessible sans survol

**Priorité** : P2. **Effort** : 3-4 h. **ADR requise** : non.

**Fichiers à toucher** : `packages/admin/src/routes/api-keys.tsx` (L390-405).

**Travail détaillé** : remplacer l'attribut `title=` porteur du détail par un composant interactif du design system
déjà utilisé ailleurs dans l'admin (`<details>`/popover/bouton « détail »), atteignable au clavier (`Tab`+`Entrée`)
et visible sur un écran tactile. Réutiliser `roleDetail()` tel quel (la fonction de calcul n'a pas besoin de
changer, seulement sa présentation).

**Critères d'acceptation** : le détail complet d'une portée est consultable sans souris et sans `hover`, vérifié par
un test de navigation clavier (`vitest`/`@testing-library` + `userEvent.tab()`).

**Tests exigés** : test composant d'accessibilité clavier.

**Impact contrat/ADR** : aucun.

---

### T09-04 — Export RGPD des données personnelles d'un compte

**Priorité** : P1 (absent des huit fiches, mais explicitement demandé par la mission de cet audit et couvert par
le RGPD au même titre que l'effacement déjà construit). **Effort** : 1-2 j. **ADR requise** : non — aucune
interface publique versionnée n'est touchée, c'est une nouvelle route et un nouvel écran, dans le même esprit que
l'anonymisation déjà livrée (fiche 17 tâche 5).

**Fichiers à toucher** : nouvelle route `GET /api/users/{id}/export` (self **ou** `admin`, même règle que la
lecture de profil, `requireSelfOrAdmin`), `packages/auth/src/users.ts` (fonction d'assemblage), `profile.tsx`
(bouton « Exporter mes données »), `users.tsx` (action « Exporter les données » par compte, `admin` seulement pour
un autre compte), `packages/admin/src/i18n/locales/{fr,en}.json`.

**Travail détaillé** :
1. Assembler, pour un compte donné : profil (nom, e-mail, rôles, statut, dates), liste des sessions actives
   (métadonnées seulement — jamais un jeton), liste des clés API créées par ce compte (jamais la clé brute, déjà
   irrécupérable de toute façon), les 500 dernières entrées d'audit où ce compte est l'acteur **ou** le sujet
   (réutiliser le même filtrage que `GET /api/audit/me`, jamais un paramètre laissant élargir la portée).
2. Format JSON structuré, téléchargeable (même patron `<a download>` que `downloadRecoveryCodes` dans
   `profile.tsx` et l'export CSV/JSON de l'audit).
3. **L'export lui-même est un événement d'audit** — même règle que pour l'export du journal (fiche 21 tâche 2) :
   une extraction de données personnelles se journalise.
4. Un export demandé par un `admin` pour le compte d'un tiers doit rester possible (obligation légale de répondre à
   une demande RGPD reçue par un canal externe), mais avec une confirmation explicite à l'écran nommant qu'il s'agit
   d'une extraction de données personnelles d'un tiers.

**Critères d'acceptation** :
- Un compte peut exporter ses propres données sans intervention d'un admin.
- Un `admin` peut exporter les données d'un autre compte, avec confirmation et entrée d'audit.
- Aucun secret (mot de passe haché, clé API brute, jeton de session) ne figure dans l'export.
- L'export est lui-même journalisé.

**Tests exigés** : bout en bout self-export, bout en bout export par un admin pour un tiers, sécurité (un non-admin
ne peut jamais exporter les données d'un autre compte), vérification qu'aucun champ secret ne fuit (test de
non-régression explicite, sur le modèle du test déjà existant pour `listApiKeys`).

**Impact contrat/ADR** : aucun.

---

### T09-05 — Journalisation directe (pas de sniffing de chemin) pour création de compte, changement de mot de passe, révocation de session, clés API, permissions de rôle

**Priorité** : P3 (dette documentée, pas un bug actif — les trois fonctions marchent aujourd'hui). **Effort** :
1-2 j selon l'ampleur retenue. **ADR requise** : non.

**Fichiers à toucher** : `packages/api/src/rest/{users,api-keys,role-permissions}-router.ts`,
`packages/cli/src/commands/serve.ts` (suppression progressive de `recordUserAudit`/`recordApiKeyAudit`/
`recordRolePermissionAudit` une fois leurs cas couverts directement dans les routeurs).

**Travail détaillé** : déplacer, un cas à la fois, la journalisation depuis le sniffing de chemin HTTP
(`serve.ts`) vers un appel direct `auth.audit.record` au point exact de mutation dans chaque routeur — exactement
le geste déjà fait par la fiche 61 pour `applyUserChange`/`bulkRoute`/`inviteRoute`. Les cas restants à migrer :
création de compte, changement de mot de passe, révocation de session (users-router.ts) ; toutes les mutations de
`api-keys-router.ts` ; toutes les mutations de `role-permissions-router.ts`. Chaque migration doit être accompagnée
d'un test qui échouerait si l'appel direct était retiré (pas seulement un test qui passe parce que le sniffing de
secours fonctionne encore) — puis suppression du sniffing correspondant dans `serve.ts` une fois le nouveau chemin
prouvé.

**Critères d'acceptation** : une entrée d'audit apparaît pour chacune de ces mutations même si l'appelant construit
une URL de forme inhabituelle (par exemple via un futur endpoint MCP ou une API en lot) — ce que le sniffing actuel
ne garantit pas.

**Tests exigés** : par mutation migrée, un test qui appelle la fonction du routeur directement (sans passer par
`serve.ts`) et vérifie l'entrée d'audit.

**Impact contrat/ADR** : aucun — refactorisation interne, aucune route ni forme de réponse ne change.

---

### T09-06 — Clé d'API à portée fine (par collection/action), au-delà du rôle entier

**Priorité** : P2 (parité Strapi/GitHub/Contentful, déjà signalée par L20 §3.6, toujours vraie). **Effort** :
3-5 j. **ADR requise** : oui — c'est un changement de modèle de sécurité pour les clés API (aujourd'hui `scope`
est une liste de noms de rôle interprétée par `PermissionLayer` exactement comme un compte ; une portée par
collection/action romprait cette équivalence et poserait la question de son interaction avec `own`/ADR-0027).

**Fichiers à toucher (une fois l'ADR actée)** : `packages/auth/src/api-keys.ts` (nouvelle forme de `scope`),
`packages/api/src/access/permissions.ts`, `api-keys-router.ts`, `api-keys.tsx`.

**Travail détaillé** : hors périmètre de code tant que l'ADR n'est pas actée — texte d'ADR à proposer : une clé API
porterait, en plus (ou à la place) d'une liste de rôles, une liste explicite de `(collection|taxonomy, action)`
qui **restreint** (jamais n'élargit) ce que ses rôles accorderaient déjà — cohérent avec le principe déjà appliqué
par ADR-0028 (la table de permissions ne fait jamais que restreindre/remplacer, jamais qu'accorder au-delà du
fichier).

**Impact contrat/ADR** : ADR requise avant tout code, ne rien implémenter avant.

---

### T09-07 — Onglet dédié « actions d'agents » dans le journal d'audit

**Priorité** : P3 (confort — le filtre existe déjà et couvre l'esprit du critère de la fiche 21 tâche 4). **Effort**
: 2-3 h. **ADR requise** : non.

**Fichiers à toucher** : `packages/admin/src/routes/audit.tsx`.

**Travail détaillé** : ajouter un onglet préréglé qui pose `actorKind=agent` par défaut plutôt que de laisser
l'utilisateur découvrir le filtre — cohérent avec la remarque de la fiche 21 (« c'est la question qu'un exploitant
se pose en premier sur un CMS agentique »). Changement de présentation seulement, aucune nouvelle donnée.

**Critères d'acceptation** : ouvrir l'onglet affiche directement les actions d'agent, sans configuration manuelle
du filtre.

**Tests exigés** : test composant.

**Impact contrat/ADR** : aucun.

## 7. Ordre d'exécution recommandé et dépendances

1. **T09-01** (rétention de l'audit) — aucune dépendance, le mécanisme dur (`prune()`) existe déjà ; c'est le seul
   vrai point mort du domaine, à traiter en premier.
2. **T09-02** (`Retry-After` sur le login) et **T09-03** (détail de portée accessible) — indépendants entre eux et
   de T09-01, petits, à traiter en parallèle.
3. **T09-04** (export RGPD) — indépendant, mais logiquement à la suite de T09-01/02/03 puisqu'il touche les mêmes
   écrans (`users.tsx`/`profile.tsx`) et bénéficie d'être livré avec un test de non-régression sur les secrets déjà
   affûté par la même occasion.
4. **T09-07** (onglet agents) — indépendant, très petit, à glisser n'importe où.
5. **T09-05** (journalisation directe) — à faire en dernier parmi les correctifs de code : c'est une
   refactorisation qui touche trois routeurs, sans urgence fonctionnelle (le sniffing marche aujourd'hui), mieux
   traitée une fois le reste stabilisé pour ne pas multiplier les diffs concurrents sur les mêmes fichiers
   (`users-router.ts`, `api-keys-router.ts`, `role-permissions-router.ts` sont déjà touchés par T09-01/02/04).
6. **T09-06** (portée fine de clé API) — dépend d'une ADR actée en amont ; ne pas commencer le code avant. Peut être
   instruit (texte d'ADR proposé) en parallèle du reste, mais son implémentation attend la décision humaine.
