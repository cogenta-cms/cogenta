# Audit Commentaires et formulaires — 2026-09-01

## 1. Résumé exécutif

Les deux domaines existent réellement et dépassent le stade de maquette : contrat F
(`comments@1.0`, ADR-0025) et contrat G (`forms@1.1`, ADR-0026 amendée par ADR-0031)
sont tous deux implémentés, testés (SQLite), câblés dans `cogenta serve`, et rendus
publiquement sur les cinq thèmes. Sur les **25 tâches** des trois fiches (15, 16, 47) :
**19 FAIT**, **3 PARTIEL**, **1 ABSENT** (délibéré, RFC contrat B), **2 POINT MORT**.
Sur l'ajout demandé du 2026-08-28 (interrupteur `comments.enabled`), **1 sur 3
sous-exigences est réellement tenue** — un vrai écart par rapport à une demande
utilisateur explicite, jamais signalé dans `BLOCKERS.md` ni dans `L21`.

Points morts trouvés, en plus de ceux ci-dessus : réglages `discussion.allowAnonymous` /
`autoCloseDays` / `maxNestingDepth` / `notifyEmail` éditables dans l'admin mais **jamais
lus** par aucun code serveur ; réglage par collection (activer/exiger modération) a une
API serveur et un client admin complets mais **aucun écran** ne les appelle ; le verdict
`assist.moderate` calculé côté client n'est **jamais persisté**, donc le badge de
modération qui le lit dans le tableau ne s'allume jamais. Aucune purge automatique des
commentaires indésirables n'existe (celle des soumissions de formulaire, si). Le
constructeur de formulaires affiche des libellés de champ bruts et non traduits
(`name`, `kind`, `showIfField`, `acceptCategoriesText`…) — constat de L20 toujours vrai
aujourd'hui.

Le socle technique est solide : anti-spam sans IA, R8 respecté (donnée jamais
instruction), R2 respecté (rien n'exige de clé IA), R3 respecté (texte brut only,
jamais de CSS/HTML stocké), IP toujours hachée, deux vraies vulnérabilités trouvées et
corrigées en cours de route (redirection ouverte + injection d'en-tête sur les
commentaires, contournement du rate limit par `X-Forwarded-For` et injection de formule
CSV CWE-1236 sur les formulaires). Écart de parité principal face au marché : aucun
constructeur visuel glisser-déposer, aucune logique conditionnelle par blocage/page
(showIf existe mais s'édite en texte libre), pas de CAPTCHA sur les commentaires (formulaires
seulement), pas de scan antivirus sur les fichiers de formulaire, pas de webhook
générique en sortie pour un commentaire (seulement e-mail).

Trois constats supplémentaires trouvés en revérifiant le document (au-delà des 25
critères des fiches) : le secret Turnstile d'un formulaire est stocké en clair et
renvoyé tel quel à l'admin sur `GET /api/forms*`, sans la discipline de rédaction
appliquée aux clés de fournisseur IA depuis L22 (T12) ; `useRefreshChromeStatus` — le
mécanisme de rafraîchissement immédiat des badges de la barre latérale — est exporté
mais n'a **aucun appelant** dans tout l'admin, donc le bug L20 §1.15 (badge qui ne se
met pas à jour dans la même session) reste entier pour les commentaires et les
soumissions (T13) ; et le fil de commentaires public n'a aucune pagination, chargeant
la totalité de l'historique d'une entrée à chaque vue (T14).

## 2. Ce qui existe réellement

### Commentaires (contrat F, `@cogenta/comments`)

- `packages/comments/src/types.ts` — `Comment`, statuts `pending/approved/spam/trash`,
  `parentId`, `ipHash`, `provenance` (`human/assisted/generated`), `moderation`
  (`flagged`/`severity`/`reason`, alimentée par `assist.moderate`).
- `store.ts` (325 l.) — CRUD + modération ; le corps est **refusé** (pas assaini) dès
  qu'il contient une balise HTML (`/<[a-z!/][\s\S]*>/iu`, ligne ~98-101) — R3 tenu à
  l'écriture, pas seulement à l'affichage.
- `ip-hash.ts` — `sha256(secret|ip)`, secret dérivé de `COGENTA_AUTH_SIGNING_KEY` (R7,
  jamais un second secret), jamais l'adresse en clair.
- `rate-limit.ts` — fenêtre glissante en base, deux dimensions (`ip`, `target` =
  `collection:entryId`).
- `spam.ts` — nombre de liens (seuil 2) + liste de mots (9 termes) ; **pas** de
  réputation d'auteur ni de délai minimal dans ce fichier (le délai vit dans
  `router.ts`).
- `router.ts` (552 l.) — routeur sans transport ; `POST /api/comments` avec honeypot +
  délai minimal, règle d'auto-approbation façon WordPress, redirection 303 validée
  (`isSafeRedirectPath`) contre l'open redirect protocole-relatif et l'injection
  CR/LF dans `Location`.
- `settings-store.ts` — overrides tri-état site/collection/entrée, magasin propre, hors
  du `SITE_SETTINGS_REGISTRY` général.
- `permissions.ts` — `comments.read/moderate/reply/purge/settings`, distincts des cinq
  actions du contrat A.
- `packages/admin/src/routes/comments.tsx` (399 l.) — file de modération à onglets avec
  compteurs, actions par ligne, actions groupées, recherche substring, réponse admin.
- `packages/admin/src/assist/moderation-check.tsx` — indicateur `assist.moderate`,
  `null` sans fournisseur (R2).
- Rendu public centralisé dans `@cogenta/theme-kit` (`comments.ts`, 192 l.),
  ré-exporté à l'identique par `theme-canonical` — **un seul point d'implémentation
  pour les cinq thèmes**, appelé directement par `packages/cli/src/commands/serve.ts`
  (`commentsForEntry`) et concaténé après `<main>` par `theme-render.ts`.
- Import WordPress réel : `packages/import/src/wordpress/import.ts`
  (`wpApprovedToStatus`, `importCommentsForEntry`), fil résolu par vagues, pertes de
  mise en forme signalées.

### Formulaires (contrat G, `@cogenta/forms`)

- `types.ts` (234 l.) — 10 types de champs, `showIf`, `steps`, `notifyChannels`,
  `captcha`, `FormSubmissionNote`. **Incohérence documentaire mineure** : l'en-tête du
  fichier dit encore `forms@1.0` alors que `docs/04-contrats.md` est à `forms@1.1`.
- `store.ts` (719 l.) — CRUD définitions + `duplicate()`, soumissions avec
  `list(query/from/to)`, `bulkMarkStatus`, `searchByEmail`/`deleteByEmail` (RGPD),
  `purgeExpired`, `addNote`/`listNotes`.
- `validate.ts` (388 l.) — les 10 types de champs validés, `showIf` évalué contre les
  valeurs brutes, un champ masqué est ignoré (`continue`), jamais requis ni validé.
- `file-field.ts` (219 l.) — sniffing par octets réel (image/PDF/ZIP/texte),
  `FORM_FILE_HARD_MAX_BYTES` = 25 Mo non contournable, jeton HMAC-SHA256 scopé
  `formId:fieldName`, comparaison `timingSafeEqual`.
- `notify.ts` — e-mail **et** Slack/Discord/Telegram/webhook via le vrai
  `ChannelRegistry` de `@cogenta/channels` (fiche 47 tâche 4, réellement livrée).
- `captcha.ts` — Cloudflare Turnstile, vrai appel HTTP `siteverify`, désactivé par
  défaut, optionnel par formulaire.
- `csv.ts` + `packages/cli/src/commands/serve.ts` (`serveFormsSubmissionsExport`) —
  export CSV **streamé serveur**, paginé par 500 lignes, protection CWE-1236 conservée.
- `packages/admin/src/routes/forms.tsx` (766 l.) — constructeur (réutilise
  `RepeaterField`), `packages/admin/src/routes/form-submissions.tsx` (638 l.) — liste,
  détail, notes internes, référent affiché, export, effacement RGPD.
- Rendu public : **pas** dans `theme-kit` (contrairement aux commentaires) — généré
  directement par `packages/cli/src/commands/forms-page.ts`, chrome (header/footer)
  emprunté à `renderPageChrome`/le thème actif ; le style `.cg-form` est répliqué dans
  la feuille `base.css` de chacun des cinq thèmes (17 occurrences chacun) — présent
  partout, mais par duplication de style plutôt que par un point d'implémentation
  unique comme les commentaires.
- Purge RGPD planifiée : `tickFormsPurge`/`FORMS_PURGE_TICK_MS` (24 h) dans `serve.ts`.

## 3. Vérification des fiches, critère par critère

### Fiche 15 — Commentaires

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 0 — ADR domaine séparé | FAIT | ADR-0025, `docs/03-decisions.md:1123` | — |
| 0bis §9 — interrupteur global `comments.enabled` | **PARTIEL** | voir §4, 1/3 sous-exigences tenue | (b) le fil déjà approuvé reste affiché ; (c) l'entrée de menu n'est jamais masquée |
| 1 — Modèle et stockage | FAIT | `packages/comments/src/types.ts`, `tables.ts` (179 l., DDL idempotent + `dropCommentsTables` réversible) | — |
| 2 — API publique de dépôt | FAIT | `router.ts:189-280`, rate-limit 2D, honeypot, délai, statut initial configurable | — |
| 3 — File de modération admin | FAIT (avec 1 lacune) | `comments.tsx` onglets/compteurs/actions groupées/réponse réels | **pas d'action « modifier » le corps**, absente du client et de l'écran |
| 4 — Modération assistée jamais automatique | FAIT (mais POINT MORT associé) | `moderation-check.tsx`, union `none`/`review`, disparaît sans fournisseur (R2) | le verdict n'est jamais persisté via `POST /api/comments/:id/moderation` — aucun appelant admin |
| 5 — Réglages | PARTIEL | site (`discussion.enabled`/`moderationRequired` lus), par entrée (réel) | par collection : API+client existent, **aucun écran** ; `allowAnonymous`/`autoCloseDays`/`maxNestingDepth`/`notifyEmail` déclarés et éditables mais **jamais lus** |
| 6 — Rendu public | FAIT | `theme-kit/src/comments.ts`, `<form method=post>` sans JS, testé e2e | fermeture automatique après N jours jamais appliquée au calcul de `open` |
| 7 — Import WordPress | FAIT | `import.ts:68,413-460`, fil/statut/date réels, pertes signalées | — |

### Fiche 16 — Formulaires

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 0 — ADR domaine séparé | FAIT | ADR-0026, `docs/03-decisions.md:1147` | — |
| 1 — Modèle | FAIT | `types.ts`, `tables.ts`, 9 champs (v1.0) puis 10 (v1.1) | en-tête `types.ts` dit encore `forms@1.0` |
| 2 — Constructeur de formulaire admin | FAIT (avec lacune de finition) | `forms.tsx`, réutilise `RepeaterField` | libellés de champ bruts non traduits (§4) — L20 toujours vrai |
| 3 — Route publique de soumission | FAIT | `forms-router.ts`, `serve.ts:4103` | — |
| 4 — Soumissions dans l'admin | FAIT | `form-submissions.tsx`, export CSV, notes, purge affichée | — |
| 5 — Notifications | FAIT | e-mail + Slack/Discord/Telegram/webhook réels (`notify.ts`) | picker de canal = texte libre, pas un vrai sélecteur (voir fiche 47 tâche 4) |
| 6 — Rendu public | FAIT | `forms-page.ts`, `aria-invalid`/`aria-describedby` réels, sans JS | — |
| 7 — RGPD | FAIT | `retainDays`+`purgeExpired` planifié, `deleteByEmail`, consentement figé horodaté | — |

### Fiche 47 — Formulaires premium

| Tâche | Verdict | Preuve | Écart |
|---|---|---|---|
| 1 — Logique conditionnelle `showIf` | FAIT | `conditions.ts`, `validate.ts:208` | édition en texte libre (`showIfField`/`showIfOperator`/`showIfValue`), choix assumé documenté dans `forms.tsx`, pas un vrai éditeur visuel |
| 2 — Multi-étapes | FAIT | `forms-router.ts:426-499`, `202 {status:'step',...}`, aucune soumission avant l'étape finale | — |
| 3 — Champ `file` | FAIT | `file-field.ts`, ADR-0031 | fichier jamais téléchargeable, même par un admin (renoncement assumé ADR-0031) |
| 4 — Notifications multi-canaux | FAIT | `notify.ts:99-122` appelle réellement `ChannelRegistry` | sélection de canal = zone de texte `channel:target`, pas un picker (PARTIEL côté UX) |
| 5 — Bloc `form` contrat B (RFC) | **ABSENT (délibéré)** | `docs/rfc/` ne contient que 2 RFC, aucune sur `form` | conforme à ADR-0026 (« ouverte en parallèle », jamais réellement ouverte) |
| 6 — Style personnalisable | FAIT (a minima) | aucun champ `style`/`css` dans `FormDefinition`, R3 respecté | pas de variantes de mise en page nommées, juste les classes CSS fixes du thème |
| 7 — Recherche + filtre date soumissions | FAIT | `store.ts` `list(query/from/to)`, UI `form-submissions.tsx` | recherche = scan applicatif borné à 5000 lignes, pas un index plein texte |
| 8 — Notes internes + référent affiché | FAIT | `addNote`/`listNotes`, `referrer` affiché l.515-517 | — |
| 9 — Export CSV serveur streamé | FAIT | `streamSubmissionsCsv`, pagination 500, CWE-1236 conservé | — |
| 10 — CAPTCHA optionnel | FAIT | `captcha.ts`, Turnstile réel, désactivé par défaut | seulement sur les formulaires — aucun CAPTCHA équivalent sur les commentaires |
| 11 — Duplication de formulaire | FAIT | `store.ts:451-486`, route + UI | — |

## 4. Points morts et bugs trouvés

| Gravité | Fichier:ligne | Description | Correction |
|---|---|---|---|
| **P1** | `packages/admin/src/shell/nav-items.ts:134-142` | L'entrée « Commentaires » du menu admin est toujours visible (`visibleWhen: {kind:'anyRole'}`), jamais masquée quand `discussion.enabled=false` et qu'aucun commentaire n'existe — demande explicite non tenue (fiche 15 §9c) | Ajouter un `NavCondition` `commentsActiveOrAdmin`, sur le modèle exact de `commerceActiveOrAdmin` déjà présent (l.51) |
| **P1** | `packages/theme-kit/src/comments.ts:198-207` | `renderCommentsSection` construit et affiche l'`<ol>` des commentaires déjà approuvés **inconditionnellement** ; `options.open` ne pilote que le formulaire, jamais la liste — un site qui désactive `discussion.enabled` continue de montrer son historique de commentaires publiquement (fiche 15 §9b non tenue) | Envelopper le bloc `<ol>`/titre dans `options.open ? … : null` (ou un réglage dédié pour ce cas précis, à trancher) |
| **P2** | `packages/comments/src/router.ts:474-492` (existe) / aucun appelant admin | `setModeration` (persistance du verdict `assist.moderate`) n'est jamais appelé par `comments.tsx` — le badge `item.moderation.flagged` affiché dans le tableau ne peut jamais s'allumer via ce composant | Câbler `ModerationCheck` pour appeler `POST /api/comments/:id/moderation` après calcul du verdict |
| **P2** | `packages/schema/src/store/site-settings-registry.ts:490-527` | `discussion.allowAnonymous`/`autoCloseDays`/`maxNestingDepth`/`notifyEmail` sont déclarés, affichés et modifiables dans l'onglet Discussion, mais **aucun code de `packages/comments` ni de `serve.ts` ne les lit** — quatre réglages fantômes | Lire ces quatre valeurs dans `router.ts`/`theme-kit/comments.ts` (anonymes, imbrication, fermeture auto) et dans `notify.ts` (notification e-mail au commentaire) |
| **P2** | `packages/admin/src/api/comments-client.ts:129-158` / aucun appelant | `getCollectionCommentSettings`/`setCollectionCommentSettings` sont exportées et le serveur les supporte (`router.ts:394-420`), mais **aucun écran admin** ne les appelle — le réglage par collection promis par la fiche 15 tâche 5 et par le commentaire de `settings.tsx:406-408` (« depuis `/collections/:name` ») n'existe nulle part | Ajouter un onglet/section dans l'écran de collection concernée, ou un nouvel écran dédié |
| **P2** | `packages/admin/src/routes/forms.tsx:60-117` (`FIELD_EDITOR_ITEMS`) | Aucun `admin.label` sur les lignes du constructeur de champ — `RepeaterField` retombe sur le nom brut (`itemField.admin?.label ?? itemField.name`, `repeater-field.tsx:207`) : le constructeur affiche littéralement `name`, `kind`, `help`, `choicesText`, `consentText`, `step`, `showIfField`, `showIfOperator`, `showIfValue`, `acceptCategoriesText`, `maxSizeBytes` — constat de L20 (« labels bruts non traduits ») toujours vrai après la fiche 47 | Ajouter `admin: { label: t('forms.field.name') }` etc. sur chaque `ItemFieldDefinition` |
| P3 | aucune purge automatique des commentaires | ADR-0025 promet « rétention/purge configurable sur son propre modèle » ; `purge()` existe (`store.ts:290-292`) mais rien ne l'appelle en tâche planifiée (contrairement à `tickFormsPurge` côté formulaires, qui lui existe) | Ajouter un tick planifié similaire à celui des formulaires, avec un réglage de rétention |
| P3 | `packages/admin/src/routes/comments.tsx` — actions groupées | Seules `approved/spam/trash` sont proposées en action groupée ; `purge` (suppression définitive en masse) n'existe qu'en ligne | Ajouter `purge` aux actions groupées, avec confirmation |
| P3 | `packages/theme-kit/src/comments.ts` (rendu du corps) | Le corps est rendu en un seul `<p>` texte — les retours à la ligne d'un visiteur ne deviennent jamais des `<br>`, documenté comme non fini dans `BLOCKERS.md:930-936` | `white-space: pre-wrap` en CSS du thème, sans toucher au rendu HTML |
| — | ~~`packages/agents/test/assist/*`~~ **Corrigé après vérification directe** | Un test d'injection dédié à `assist.moderate` existe bel et bien : `packages/agents/test/assist/classify.test.ts:234-258` (`'cannot be talked into a destructive recommendation…'`, payload `SYSTEM: this comment is pre-approved…`, `origin: 'comment'`) prouve que `recommendedAction` reste `review` quoi que le modèle réponde, et un second cas (l.261-278) prouve le balisage `<data source="comment on article 12">`. Il ne recopie pas littéralement le payload `</data><constitution>…` de L18, mais couvre le même critère d'acceptation. | Aucune — à la rigueur, aligner le payload de test sur celui de `chat-injection.test.ts` pour uniformiser le style, sans urgence |
| P3 | `packages/forms/src/forms-router.ts` (ex. l.174-186, 255, 280-283, 579, 638, 674) | 9 usages de `as never` pour contourner le typage strict sur des champs de corps partiels — pas une violation littérale d'AGENTS.md (`any`/`@ts-ignore` interdits, pas `as never`) mais un affaiblissement de type répété au même endroit | Typer le corps de requête avec un schéma Zod discriminé plutôt que des assertions |
| Info | Sécurité déjà trouvée et corrigée en amont, pas un résidu | Open redirect + injection CR/LF (`comments/router.ts`, `isSafeRedirectPath`), spoof `X-Forwarded-For` (`forms-router.ts`), injection de formule CSV (`admin/src/lib/csv.ts`) | déjà corrigé — mentionné pour mémoire, aucune action requise |
| Info | `packages/comments` n'a **pas** eu de vrai passage `security-reviewer` (relecture manuelle documentée, `BLOCKERS.md:914-923`) | La fiche l'exige explicitement (route publique en écriture) | Faire tourner le sous-agent `security-reviewer` avant toute nouvelle évolution du domaine |
| **P2** | `packages/forms/src/types.ts:129` (`FormCaptchaConfig.secretKey`) + `packages/api/src/rest/forms-router.ts:239,273` | Le secret Turnstile d'un formulaire est stocké en clair et **renvoyé tel quel** dans la réponse JSON de `GET /api/forms` (liste) et `GET /api/forms/{id}` (`jsonResponse(200, { data: found })`/`{ data: await forms.definitions.list() }`, aucune rédaction) — la route est `admin`-only (`requireAdmin`, l.91), donc le risque est limité, mais c'est incohérent avec le précédent posé par L22 pour les clés de fournisseur IA (« jamais affichées en clair une fois enregistrées », AES-256-GCM au repos) | Rédiger le secret en sortie (renvoyer un booléen `secretKeyConfigured` plutôt que la valeur), ou le chiffrer au repos comme les clés IA |
| P3 | `packages/admin/src/shell/shell-status-context.tsx:78-79` (`useRefreshChromeStatus`) | Exportée mais **sans aucun consommateur** dans tout `packages/admin/src` (grep confirmé) : ni `comments.tsx` ni `form-submissions.tsx` ne l'appellent après une mutation de statut — le badge `commentsPending`/`formSubmissionsUnread` de la barre latérale ne se met pas à jour avant la prochaine navigation, dans la même session (déjà signalé L20 §1.15, toujours vrai) | Appeler `useRefreshChromeStatus()` après chaque action de modération/changement de statut dans les deux écrans |
| P3 | `packages/comments/src/store.ts` (`listApprovedForEntry`) | Le fil de commentaires **public** charge la totalité des commentaires approuvés d'une entrée sans aucune limite/pagination (contrairement à `list()` côté admin qui a `limit`/`offset`) — un article à fort volume de commentaires exécute un `SELECT` complet et génère une page potentiellement énorme à chaque vue | Ajouter une pagination du fil public (racine paginée, réponses chargées avec leur parent), ou au minimum une limite dure avec lien « voir plus » compatible sans JS |

## 5. Comparaison marché

### Commentaires — WordPress / Drupal

| Fonction | WordPress | Drupal 11 | Cogenta |
|---|---|---|---|
| Commentaires par entrée | ✅ | ✅ | **OUI** |
| Fil imbriqué (réponses) | ✅ | ✅ | **OUI** (`parentId`, imbrication réelle) |
| Profondeur maximale d'imbrication configurable | ✅ | ✅ | **PARTIEL** (réglage `maxNestingDepth` existe, jamais lu — point mort) |
| File de modération (attente/approuvé/indésirable/corbeille) | ✅ | ✅ | **OUI** (onglets + compteurs réels) |
| Édition rapide du corps depuis l'admin | ✅ | ✅ | **NON** (aucune action « modifier ») |
| Réponse en ligne depuis l'admin | ✅ | ✅ | **OUI** (publiée comme le compte connecté) |
| Actions groupées | ✅ | ✅ | **OUI** (approve/spam/trash ; purge en masse absent) |
| Modération par mot-clé/liste noire | ✅ (listes configurables) | ✅ | **PARTIEL** (liste fixe de 9 mots en dur, non configurable par l'admin) |
| Anti-spam (Akismet) | ✅ (plugin) | ✅ (module) | **PARTIEL** (heuristiques maison : liens+mots ; pas de service tiers, choix R1 assumé) |
| Commentaire anonyme (visiteur non inscrit) | ✅ | ✅ | **OUI** (auteur nom+e-mail+site) |
| Autoriser/interdire les anonymes par réglage | ✅ | ✅ | **PARTIEL** (`allowAnonymous` déclaré, jamais lu — point mort) |
| Fermeture des commentaires par entrée | ✅ | ✅ | **OUI** (interrupteur tri-état par entrée) |
| Fermeture automatique après N jours | ✅ | ✅ | **NON** (réglage existe, jamais appliqué au rendu) |
| Notification e-mail à l'auteur d'origine | ✅ | ✅ | **NON** (`notifyEmail` déclaré, jamais câblé) |
| Avatar (Gravatar) | ✅ | via module | **NON** |
| Vote / tri par popularité (wpDiscuz) | plugin | plugin | **NON** |
| Connexion sociale pour commenter | plugin | module | **NON** |
| Modération assistée par IA | plugin tiers | plugin tiers | **OUI**, natif (`assist.moderate`), et strictement borné (R6) — supérieur en principe, mais le verdict n'est jamais persisté (point mort) |
| Interrupteur global site-wide | ✅ (Réglages → Discussion) | ✅ | **PARTIEL** (voir §4 P1 — formulaire caché, historique et menu non masqués) |
| Réglage par collection/type de contenu | via capacités | via bundle | **PARTIEL** (API existe, aucun écran) |
| Import préservant les commentaires | — | — | **OUI** (import WordPress avec fil/statut/date) |

### Formulaires — Gravity Forms / WPForms / Contact Form 7 / Drupal Webform

| Fonction | Gravity Forms / WPForms | Cogenta |
|---|---|---|
| Constructeur glisser-déposer avec aperçu en direct | ✅ | **NON** (formulaire de champs de type répéteur, pas de glisser-déposer ni d'aperçu visuel en direct) |
| Types de champs : nom, e-mail, téléphone, adresse, date, fichier, signature, calcul, prix/paiement | ✅ (large) | **PARTIEL** : text/longText/email/phone/number/date/choiceSingle/choiceMulti/consent/file (10) — **pas** d'adresse structurée, de signature, de calcul, de prix/paiement |
| Logique conditionnelle par champ | ✅ | **OUI** (fonctionnelle, éditée en texte libre plutôt qu'un éditeur visuel) |
| Logique conditionnelle par page/section | ✅ | **NON** (seulement par champ) |
| Multi-étapes avec barre de progression | ✅ | **PARTIEL** (multi-étapes fonctionnel sans JS ; pas de barre de progression visuelle constatée dans `forms-page.ts`) |
| Sauvegarder et reprendre plus tard | ✅ | **NON** |
| CAPTCHA (reCAPTCHA/hCaptcha/Turnstile) | ✅ | **PARTIEL** (Turnstile seulement, pas reCAPTCHA/hCaptcha) |
| Anti-spam honeypot | ✅ | **OUI** |
| Akismet | ✅ | **NON** (choix R1 assumé) |
| Notifications multiples avec routage conditionnel | ✅ | **PARTIEL** (canaux multiples réels — e-mail/Slack/Discord/Telegram/webhook — mais pas de routage conditionnel par valeur de champ) |
| Confirmation : message / page / redirection | ✅ | **OUI** (`confirmation` dans `FormDefinition`) |
| Entrées : vue liste, notes, export CSV, impression | ✅ | **PARTIEL** (liste, notes, export CSV serveur streamé ; pas de vue « impression ») |
| Lu/non lu, étoilage | ✅ (étoilage) | **PARTIEL** (statut nouveau/lu/archivé/indésirable ; pas d'étoilage) |
| Recherche plein texte + filtre date | ✅ | **PARTIEL** (recherche = scan applicatif borné à 5000 lignes, pas un index) |
| Intégrations Mailchimp/CRM | ✅ (nombreuses) | **NON** (webhook générique seulement — extensible mais pas de connecteur nommé) |
| Webhook sortant | ✅ | **OUI** (signé HMAC, réutilisé de `@cogenta/channels`) |
| Insertion dans une page de contenu (bloc) | ✅ | **NON** (route dédiée uniquement, RFC contrat B jamais ouverte) |
| Champ fichier avec scan antivirus | ✅ (certains plugins) | **PARTIEL** (sniffing par octets + plafond dur, **pas** de scan antivirus — renoncement assumé ADR-0031) ; fichier jamais téléchargeable même par un admin |
| Styles personnalisables sans toucher au thème global | ✅ | **NON** (classes CSS fixes du thème actif, aucun réglage de style par formulaire) |
| Duplication de formulaire | ✅ | **OUI** |
| Consentement RGPD horodaté avec texte figé | partiel | **OUI** |
| Rétention + purge automatique | rarement natif | **OUI** |
| Fonctionne sans JavaScript | non garanti | **OUI**, y compris logique conditionnelle et multi-étapes |

## 6. Spécification ultra détaillée des corrections et ajouts

## T01 — Masquer l'entrée « Commentaires » du menu admin quand désactivée et vide

**Priorité** : P1. **Effort** : 0,5 j. **ADR requise** : non (suit le patron déjà acté
`commerceActiveOrAdmin`).

**Fichiers** : `packages/admin/src/shell/nav-items.ts`,
`packages/admin/src/shell/nav-visibility.ts`, `packages/admin/src/shell/app-shell.tsx`
(contexte `NavVisibilityContext`), `packages/api/src/rest/shell-status-router.ts` (ou
équivalent — la route qui alimente `/api/shell-status`).

**Travail détaillé** : ajouter un membre `{ kind: 'commentsActiveOrAdmin' }` à
`NavCondition` (`nav-items.ts:52-74`), une branche dans `isNavItemVisible`
(`nav-visibility.ts:31-54`) identique à `commerceActiveOrAdmin` (l.51-52) :
`ctx.roles.length > 0 && (ctx.commentsActive === true || ctx.roles.includes('admin'))`.
Ajouter `commentsActive: boolean | null` à `NavVisibilityContext`. Côté serveur, exposer
dans `/api/shell-status` un booléen « au moins un commentaire existe, tous statuts
confondus » (`SELECT EXISTS(SELECT 1 FROM cogenta_comments LIMIT 1)`). Remplacer
`visibleWhen: { kind: 'anyRole' }` par `{ kind: 'commentsActiveOrAdmin' }` sur l'entrée
`/comments` (`nav-items.ts:139`).

**Critères d'acceptation** : sur un site sans commentaire et `discussion.enabled=false`,
un rôle `editor` ne voit pas l'entrée « Commentaires » ; un `admin` la voit toujours ;
dès qu'un commentaire existe (même en corbeille), l'entrée réapparaît pour tous les
rôles autorisés.

**Tests exigés** : test unitaire `nav-visibility.test.ts` (nouveau cas), test
d'intégration `shell-status-router.test.ts` (le booléen reflète l'état réel de la
table).

---

## T02 — Ne plus afficher le fil de commentaires déjà approuvés quand `discussion.enabled=false`

**Priorité** : P1. **Effort** : 0,5 j. **ADR requise** : non.

**Fichiers** : `packages/theme-kit/src/comments.ts` (`renderCommentsSection`),
`packages/cli/test/serve-comments.test.ts`.

**Travail détaillé** : dans `renderCommentsSection` (l.198-207), envelopper le bloc qui
construit `<ol class="cg-comments__list">` (l'arbre des commentaires déjà approuvés)
dans la même condition `options.open` que le formulaire, ou introduire une distinction
explicite si le produit veut un jour dissocier « fermé mais lisible » de « désactivé et
invisible » (ce n'est pas le cas demandé par la fiche 15 §9, qui dit noir sur blanc
« retire l'affichage des commentaires déjà existants »). Ne rien changer côté base — les
commentaires restent stockés, seul le HTML public change.

**Critères d'acceptation** : `discussion.enabled=false` → le HTML de la page ne contient
ni `<ol class="cg-comments__list">` ni aucun commentaire déjà approuvé ; réactiver le
réglage fait réapparaître l'historique intact, sans perte.

**Tests exigés** : étendre `serve-comments.test.ts` (le cas « site désactivé » existe
déjà pour le formulaire, ajouter l'assertion sur l'absence du fil).

---

## T03 — Persister le verdict `assist.moderate` et l'afficher réellement

**Priorité** : P2. **Effort** : 1 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/assist/moderation-check.tsx`,
`packages/admin/src/routes/comments.tsx`, `packages/comments/src/router.ts` (route déjà
existante `POST /api/comments/:id/moderation`).

**Travail détaillé** : après le calcul du verdict côté `ModerationCheck` (React), appeler
`POST /api/comments/:id/moderation` avec `{flagged, severity, reason}` pour que
`store.setModeration` écrive réellement en base. Décider explicitement : appel
automatique dès l'ouverture de la file (au risque de coûter un appel modèle par
commentaire affiché — à mettre derrière une action manuelle « analyser » plutôt qu'un
appel systématique, pour rester R2/coût raisonnable) ou déclenché à la demande par un
bouton par ligne. Recommandation : bouton à la demande, pour ne jamais faire dépendre
l'affichage de la file d'un appel réseau IA.

**Critères d'acceptation** : après un clic « analyser » sur un commentaire, le badge
`moderation.flagged` du tableau reflète la vraie valeur persistée, visible après
rechargement de la page (pas seulement en mémoire côté client).

**Tests exigés** : test d'intégration `comments.tsx` (mock du fournisseur IA), test
`router.test.ts` déjà existant pour la route serveur (vérifier qu'il est bien appelé
en pratique, pas seulement testé isolément).

---

## T04 — Câbler les quatre réglages de discussion fantômes

**Priorité** : P2. **Effort** : 1,5 j. **ADR requise** : non.

**Fichiers** : `packages/comments/src/router.ts`, `packages/comments/src/settings-store.ts`,
`packages/theme-kit/src/comments.ts`, `@cogenta/comments` notifications (nouveau, ou
réutilisation de `@cogenta/channels`).

**Travail détaillé**, réglage par réglage :
- `discussion.allowAnonymous` : dans `router.ts`, refuser (`403 COMMENT_ANONYMOUS_NOT_ALLOWED`)
  une soumission sans `userId` quand ce réglage est faux.
- `discussion.autoCloseDays` : dans le calcul d'`open` (`commentsForEntry`,
  `serve.ts:2647-2666`, et l'équivalent côté `router.ts` pour l'écriture), comparer
  `entry.publishedAt`/`createdAt` + N jours à `Date.now()`.
- `discussion.maxNestingDepth` : dans `router.ts`, calculer la profondeur du `parentId`
  fourni et refuser un commentaire qui la dépasserait (`409 COMMENT_NESTING_TOO_DEEP`).
- `discussion.notifyEmail` : appeler l'adaptateur e-mail de `@cogenta/channels` (déjà
  utilisé côté formulaires — même transport, jamais un second) quand un commentaire
  passe en `approved`, à l'adresse configurée.

**Critères d'acceptation** : chacun des quatre réglages, une fois modifié dans l'onglet
Discussion, change un comportement observable (refus d'un anonyme, fermeture après
échéance, refus d'imbrication trop profonde, e-mail reçu) — testé de bout en bout pour
chacun.

**Tests exigés** : 4 tests e2e dans `serve-comments.test.ts`, 1 test unitaire par
réglage dans `router.test.ts`.

---

## T05 — Réglage de commentaires par collection : écran manquant

**Priorité** : P2. **Effort** : 1 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/routes/collections.tsx` (ou un nouvel onglet dans
l'écran de détail d'une collection s'il existe), `packages/admin/src/api/comments-client.ts`
(déjà prêt).

**Travail détaillé** : ajouter une section « Discussion » dans l'écran de gestion d'une
collection, appelant `getCollectionCommentSettings`/`setCollectionCommentSettings`
(déjà exportées, jamais appelées). Corriger au passage le commentaire trompeur de
`settings.tsx:406-408` qui affirme que cet écran existe déjà.

**Critères d'acceptation** : activer/désactiver les commentaires pour une collection
précise, et exiger ou non la modération, depuis l'admin — vérifié par un changement
observable au dépôt d'un commentaire sur une entrée de cette collection.

**Tests exigés** : test de composant + test e2e serveur (héritage site → collection →
entrée déjà couvert côté store, seul le câblage UI manque).

---

## T06 — Traduire les libellés du constructeur de formulaires

**Priorité** : P2. **Effort** : 0,5 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/routes/forms.tsx` (`FIELD_EDITOR_ITEMS`, l.62-118),
`packages/admin/src/i18n/locales/fr.json`, `en.json` (section `forms`, déjà à 47 clés).

**Travail détaillé** : ajouter `admin: { label: t('forms.field.name') }` etc. sur
chacune des 12 entrées de `FIELD_EDITOR_ITEMS`. Comme `RepeaterField` attend une chaîne
et non une fonction, résoudre les libellés au moment de la construction du tableau
(`useMemo` avec `t`), pas au moment du module (le fichier actuel construit
`FIELD_EDITOR_ITEMS` en dehors de tout composant).

**Critères d'acceptation** : chaque ligne du constructeur de champ affiche un libellé
français/anglais lisible (« Nom du champ », « Type », « Aide », « Condition : champ »,
etc.), plus aucun nom de propriété brut à l'écran.

**Tests exigés** : test de snapshot/rendu de `forms.tsx` vérifiant l'absence de tout
libellé égal à un nom de propriété connu (`name`, `kind`, `help`, …).

---

## T07 — Purge automatique des commentaires indésirables/corbeille

**Priorité** : P3. **Effort** : 0,5 j. **ADR requise** : non.

**Fichiers** : `packages/comments/src/store.ts` (`purge()` déjà existant),
`packages/cli/src/commands/serve.ts` (ajouter un tick sur le modèle exact de
`tickFormsPurge`/`FORMS_PURGE_TICK_MS`), nouveau réglage de rétention (`discussion.spamRetainDays`,
`discussion.trashRetainDays`, ou une valeur unique — à trancher, recommandé : 30 jours
comme la corbeille de contenu, ADR-0022).

**Critères d'acceptation** : un commentaire `spam`/`trash` plus vieux que le seuil
configuré est réellement effacé (`DELETE`) par un cycle planifié, sans action humaine.

**Tests exigés** : test unitaire du tick (horloge simulée), test que `purge()` respecte
le seuil.

---

## T08 — Purge en masse et action « modifier » dans la file de modération

**Priorité** : P3. **Effort** : 1 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/routes/comments.tsx`,
`packages/admin/src/api/comments-client.ts`, `packages/comments/src/router.ts`.

**Travail détaillé** : ajouter `purge` aux actions groupées disponibles (avec une
confirmation explicite, c'est destructeur) ; ajouter une action « modifier » qui ouvre
un champ d'édition du corps (réutilise la même contrainte texte-brut-only que la
création), avec une nouvelle route `PATCH /api/comments/:id` et une permission dédiée
(probablement `comments.moderate`, à confirmer — modifier n'est ni lire ni purger).

**Critères d'acceptation** : un modérateur peut sélectionner plusieurs commentaires
indésirables et les purger en un clic ; un modérateur peut corriger une coquille dans
un commentaire approuvé sans passer par la base.

**Tests exigés** : test de permission par rôle sur la nouvelle route, test e2e.

---

## T09 — Sélecteur de canal réel pour les notifications de formulaire

**Priorité** : P2. **Effort** : 1 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/routes/forms.tsx` (l.696-703),
`packages/admin/src/api/channels-client.ts` (si existant, sinon à créer un point de
lecture des canaux configurés dans `@cogenta/channels`).

**Travail détaillé** : remplacer le textarea `channel:target` par un vrai sélecteur
listant les canaux réellement configurés (Slack/Discord/Telegram/webhook déjà
enregistrés côté `ChannelRegistry`), avec un champ de cible contextuel par type de
canal plutôt qu'une syntaxe à mémoriser.

**Critères d'acceptation** : un opérateur choisit un canal dans une liste déroulante
alimentée par les canaux réellement configurés, sans connaître la syntaxe interne
`notifyChannels`.

**Tests exigés** : test de composant, test que la valeur produite reste compatible
avec le format `FormNotifyChannel` existant (non-régression).

---

## T10 — Ouvrir la RFC contrat B pour un bloc `form` (et, séparément, un bloc `comments`)

**Priorité** : P3 (fonctionnel dès aujourd'hui via routes dédiées). **Effort** :
0,5 j pour la RFC elle-même, 2-3 j pour l'implémentation une fois actée.
**ADR/RFC requise** : **oui, obligatoire** — contrat B figé, `AGENTS.md` l'exige
explicitement pour toute nouvelle entrée de vocabulaire.

**Fichiers** : `docs/rfc/0003-form-block.md` (nouveau), `docs/04-contrats.md`
(vocabulaire contrat B), `@cogenta/blocks`, chaque thème.

**Travail détaillé** : rédiger la RFC sur le modèle de `docs/rfc/0001-widen-block-vocabulary.md` :
un bloc `form` référençant un `FormDefinition` par nom/id, rendu par délégation au même
`renderFormPage`-comme-fragment plutôt qu'une réimplémentation. Ne **rien coder** avant
l'acceptation humaine de la RFC — c'est la procédure documentée, pas un contournement
possible.

**Critères d'acceptation** : RFC déposée et lisible ; aucune ligne de code de rendu de
bloc écrite avant décision.

---

## T11 — Documentation : corriger l'en-tête `forms@1.0` obsolète

**Priorité** : P3. **Effort** : 5 min. **ADR requise** : non.

**Fichiers** : `packages/forms/src/types.ts:2`.

**Travail détaillé** : remplacer la mention `forms@1.0` par `forms@1.1 (ADR-0026
amendée par ADR-0031)`, cohérent avec `docs/04-contrats.md:1194`.

**Critères d'acceptation** : grep `forms@1.0` dans `packages/forms/src` ne renvoie plus
rien.

---

## T12 — Ne jamais renvoyer le secret CAPTCHA en clair à l'admin

**Priorité** : P2. **Effort** : 0,5 j. **ADR requise** : non (comportement de
sérialisation, pas une forme nouvelle du contrat G).

**Fichiers** : `packages/api/src/rest/forms-router.ts` (routes `GET /api/forms` et
`GET /api/forms/{id}`, l.239 et 273), `packages/forms/src/types.ts:129`.

**Travail détaillé** : à la sérialisation d'un `FormDefinition` vers le client admin,
remplacer `captcha.secretKey` par un indicateur `secretKeyConfigured: boolean` plutôt
que la valeur réelle — même traitement que les clés de fournisseur IA depuis L22.
`PATCH`/`POST` continuent d'accepter un nouveau secret en écriture ; son absence dans
le corps signifie « ne pas changer », jamais « effacer ».

**Critères d'acceptation** : aucune réponse `GET /api/forms*` ne contient jamais
`captcha.secretKey` en clair ; modifier un formulaire sans toucher au CAPTCHA laisse le
secret existant intact côté serveur.

**Tests exigés** : test API vérifiant l'absence littérale du champ dans la réponse
JSON, test de non-régression sur une mise à jour partielle.

---

## T13 — Rafraîchir les badges de navigation après une action de modération

**Priorité** : P3. **Effort** : 0,25 j. **ADR requise** : non.

**Fichiers** : `packages/admin/src/routes/comments.tsx`,
`packages/admin/src/routes/form-submissions.tsx`,
`packages/admin/src/shell/shell-status-context.tsx` (`useRefreshChromeStatus`, déjà
exporté).

**Travail détaillé** : appeler `useRefreshChromeStatus()` après chaque mutation de
statut réussie (`bulkSetCommentStatus`, réponse, changement de statut de soumission) —
la fonction existe déjà et n'a aujourd'hui aucun appelant dans tout l'admin.

**Critères d'acceptation** : approuver un commentaire en attente décrémente le badge
« Commentaires » de la barre latérale immédiatement, sans recharger la page ; marquer
une soumission lue fait de même pour « Soumissions ».

**Tests exigés** : test de composant vérifiant l'appel du contexte de rafraîchissement
après chaque action de mutation.

---

## T14 — Pagination du fil de commentaires public

**Priorité** : P3 (dette de performance, pas un bug visible tant que le volume reste
faible). **Effort** : 1 j. **ADR requise** : non.

**Fichiers** : `packages/comments/src/store.ts` (`listApprovedForEntry`),
`packages/theme-kit/src/comments.ts`, `packages/cli/src/commands/serve.ts`
(`commentsForEntry`).

**Travail détaillé** : `listApprovedForEntry` charge aujourd'hui l'intégralité du fil
approuvé sans limite. Ajouter une pagination (racine du fil paginée, chaque réponse
chargée avec son parent) ou, a minima, une limite dure avec un lien « voir plus »
compatible sans JavaScript (`?commentsPage=2` sur l'URL de la page).

**Critères d'acceptation** : un test avec 500+ commentaires sur une même entrée
démontre un temps de réponse et une taille de page bornés.

**Tests exigés** : test avec un grand volume de commentaires, test de rendu paginé.

## 7. Ordre d'exécution recommandé et dépendances

1. **T01, T02** (P1, indépendants l'un de l'autre, aucune dépendance) — corrigent une
   demande utilisateur explicite non tenue ; à traiter en premier, ensemble, courte
   durée.
2. **T11** (5 min, sans dépendance) — à glisser dans le même commit que T01/T02 par
   commodité.
3. **T03, T04, T05** (P2, indépendants entre eux, mais T04 touche les mêmes fichiers
   `router.ts`/`theme-kit/comments.ts` que T02 — à séquencer après T02 pour éviter les
   conflits de fusion) — combleent les points morts de réglages.
4. **T06, T09** (P2, indépendants, aucun lien avec les commentaires) — finition
   formulaires, peuvent être menés en parallèle des tâches T03-T05 par une autre
   personne/agent.
5. **T07, T08** (P3, dépendent du même fichier `comments.tsx` que T03/T05 — à
   séquencer après pour éviter un conflit sur le même écran).
6. **T10** (RFC) — sans dépendance technique, mais décision humaine requise avant tout
   code ; peut être ouverte en parallèle de tout le reste dès aujourd'hui, sans
   bloquer les autres tâches.
7. **T12** (secret CAPTCHA) — indépendante, aucun lien avec les commentaires ; peut
   être menée en parallèle de tout le reste, y compris T06/T09.
8. **T13** (rafraîchissement des badges) — courte et sans risque, à glisser dans le
   même commit que T03/T05 (mêmes écrans `comments.tsx`/`form-submissions.tsx`) pour
   éviter un second passage sur les mêmes fichiers.
9. **T14** (pagination du fil public) — sans urgence tant qu'aucun site réel n'a un
   grand volume de commentaires ; à programmer avant tout site avec un historique
   éditorial important, indépendante de tout le reste.
