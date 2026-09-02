# Audit complet Cogenta vs specs vs marché — 2026-09-01

> Rapport maître, mis à jour au fil de l'eau (chaque section est écrite dès que
> l'audit correspondant est terminé, pour ne rien perdre si la session s'arrête).
> Méthode commune : `_TEMPLATE-INSTRUCTIONS.md`.
> Historique : première tentative (15 agents Fable en parallèle, 2026-09-01 20:50) tuée par la
> limite de session avant tout écrit ; relance le 2026-09-02 01:30 en Sonnet, deux vagues.

## État des audits

| # | Domaine | Fichier | État |
|---|---|---|---|
| 01 | Contenu éditorial | `01-contenu-editorial.md` | **terminé** (414 lignes) |
| 02 | Page builder | `02-page-builder.md` | **terminé** (416 lignes) |
| 03 | Versions / corbeille / workflow / traductions | `03-versions-corbeille-workflow-traductions.md` | **terminé** (588 lignes) |
| 04 | Taxonomies / menus | `04-taxonomies-menus.md` | **terminé** (445 lignes) |
| 05 | Médiathèque | `05-mediatheque.md` | **terminé** (407 lignes) |
| 06 | Redirections / SEO | `06-redirections-seo.md` | **terminé** (378 lignes) |
| 07 | Apparence / thèmes / rendu | `07-apparence-themes-rendu.md` | **terminé** (478 lignes) |
| 08 | Commentaires / formulaires | `08-commentaires-formulaires.md` | **terminé** (578 lignes) |
| 09 | Comptes / sécurité | `09-comptes-securite.md` | **terminé** (502 lignes) |
| 10 | Coquille / réglages / tableau de bord | `10-coquille-reglages-dashboard.md` | **terminé** (454 lignes) |
| 11 | Exploitation | `11-exploitation.md` | **terminé** (686 lignes) |
| 12 | Extensions / marketplace | `12-extensions-marketplace.md` | **terminé** (466 lignes) |
| 13 | Agents / IA / MCP / canaux | `13-agents-ia-mcp-canaux.md` | **terminé** (627 lignes) |
| 14 | Commerce | `14-commerce.md` | **terminé** (410 lignes) |
| 15 | Installeur / CLI / docs / flotte | `15-installeur-cli-docs-flotte.md` | **terminé** (664 lignes) |

## Synthèses par domaine (ajoutées à la fin de chaque audit)


## Journal des corrections lancées

### 02 — Page builder (terminé 2026-09-02 01:40, 175 k tokens Sonnet)
Décompte : 31 FAIT, 7 PARTIEL, 1 ABSENT, 4 POINT MORT (43 critères). Aucune violation R3/R9, aucun `any`/`console.log`.
Constat majeur : `CLAUDE.md` est périmé — fiche 43 C/D (17 blocs `blocks@2.0`, champ `variant`) est **entièrement livrée** et actée par ADR-0030 déjà insérée.
Items prioritaires :
- **T01 (P1, 1,5 j)** registre de blocs par site : `resolveBlockForRender`/`BlockRegistry` codés et testés mais `cogenta serve` ne construit jamais autre chose que `vocabularyRegistry` → aucun thème ne peut enregistrer un bloc privé en prod. Point mort.
- T02 (P2, 0,5 j) `docs/04-contrats.md` § B omet la RFC 0002 (`variant`).
- T05 (P2, 0,5 j) test e2e insertion de motif + collage contre vrai serveur jamais ajouté (`serve-builder.test.ts`).
- T04 (P2, 1 j) double-clic sur un champ richText dans l'aperçu ne fait rien (repli « ouvrir le panneau, focus » jamais construit).
- T03 (P3, 1 h) 5 nouveaux blocs mal catégorisés dans le panneau d'insertion.
- T06 (P3) motifs livrés par le thème jamais construits, renoncement non documenté.

### 06 — Redirections et SEO (terminé 2026-09-02 01:41, 180 k tokens Sonnet)
Décompte : 43 FAIT, 5 PARTIEL, 3 ABSENT, 4 POINT MORT. Aucune violation de règle, i18n FR/EN à parité stricte (233 clés).
Constat : les fiches 12 et 13 sont périmées (décrivent « minimal/absent » alors que 50 et 70 ont livré bien plus) ; 50 et 70 sont fidèles au code.
Items prioritaires :
- **T01 (P0, 0,5 j)** aucun des 9 blueprints `create-cogenta` ne déclare `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex` → le panneau SEO par entrée (construit, testé) n'apparaît sur **aucun** site fraîchement créé. Question ouverte de la fiche 13 §8 jamais tranchée.
- **T02 (P1, humain)** ADR-0032 (Search Console OAuth) implémentée mais jamais insérée dans `docs/03-decisions.md` (s'arrête à ADR-0031).
- T03 (P2, 0,5 j) `packages/seo/src/feeds.ts` (RSS/Atom) écrit et testé, jamais importé. Point mort.
- T04 (P2, 1 j) compteur de hits sur les redirections elles-mêmes (le journal 404 en a, la table des redirections non).
- T05 (P3) outil « où mène cette URL ? » ; T06 (P3) `nofollow` par entrée.

### 04 — Taxonomies et menus (terminé 2026-09-02 01:42, 193 k tokens Sonnet)
Décompte : 31 FAIT, 3 PARTIEL, 8 ABSENT (dont 3 différés par les fiches elles-mêmes), 1 POINT MORT structurel. Zéro bug P0, i18n FR/EN synchronisée (57 + 80 clés).
Constat : fiches 08 et 09 périmées (presque tout est livré) ; fiche 41 fidèle.
Items prioritaires :
- **T01 (P1, 2-3 j)** aucune page d'archive de terme publique (`/category/<slug>`) : `resolveMenuTerm` dans `serve.ts` renvoie toujours `route: null` (commentaire dans le code l'admettant) → un élément de menu de type taxonomie se crée dans l'admin mais n'est **jamais** un lien cliquable sur le site.
- **T02 (P1, 0,5-1 j)** aucun blueprint n'utilise `defineTaxonomy()` (`blog.ts` reste en `f.relation()`) → l'écran Taxonomies affiche « aucune taxonomie » sur le scaffold le plus courant (déjà relevé par L20, toujours vrai).
- T04 (P2, 1-1,5 j) classe CSS et visibilité par rôle sur un élément de menu.
- P3 : repli de locale périmé dans `delete-term-modal.tsx:59`, pas de pagination sur `GET /{taxonomy}`, pas d'import de termes en masse.

### 10 — Coquille, réglages, tableau de bord (terminé 2026-09-02 01:43, 229 k tokens Sonnet)
Décompte : ~140 critères → FAIT ≈118, PARTIEL ≈12, ABSENT ≈6, POINT MORT ≈4. Domaine le plus mûr ; les 11 fiches décrivent un état antérieur, le code a dépassé la spec.
Items prioritaires (tous P1, aucun P0) :
- Page de connexion : logo Cogenta en dur, ignore la marque blanche (`login.tsx:24`) — 3 h.
- Barre d'admin publique : texte anglais et « Cogenta Admin » en dur (`theme-render.ts:725-732`), ignore marque et locale — 3 h.
- Badge corbeille non rafraîchi après mise à la corbeille depuis l'éditeur ou la liste (`entry-edit.tsx:871`, `collection-list.tsx:435` n'appellent jamais `useRefreshChromeStatus`) — 1 h.
- Écran de préférences de notification par personne absent : `getChannelPreferences`/`setChannelPreferences` existent côté client, jamais appelés (point mort) — 1 j.
- Filtre de période du centre de notifications annoncé en commentaire, absent — 2 h.
- Notes libres de `cogenta doctor` affichées non traduites sur l'écran Santé — 3 h-1 j.
- Test axe-core sur la coquille exigé par la fiche 35, jamais écrit — 3 h.
- Dette `describeApiError` : 194 erreurs brutes restantes (dont le brouillon rapide du tableau de bord).
- Gestion des locales de contenu depuis l'admin (fiche 68 t.3-4) : **ADR requise**, aucune rédigée.
- Clé i18n FR manquante `richText.imageDropHint`.

### 14 — Commerce (terminé 2026-09-02 01:45, 205 k tokens Sonnet)
Décompte : 34 FAIT, 9 PARTIEL, 6 ABSENT, 4 POINT MORT. Fiches 51-54 globalement fiables (catalogue, commandes, coupons, réglages câblés bout en bout).
Constats majeurs :
- **P0 non documenté ailleurs** : `SubscriptionStore.runBilling`/`runDunning`/`sendRenewalNotices` (facturation récurrente, relance d'impayé, avis de renouvellement — présentés comme « faits ») ne sont appelés par **aucune** des 9 tâches planifiées de `cogenta serve`. Un abonnement n'est jamais facturé à échéance sur un vrai site.
- **P0 pont vitrine confirmé par grep** : `theme-ecommerce` ne dépend pas de `@cogenta/commerce` ; `/api/commerce/*` n'est monté que sous le routeur admin ; le panier persistant (`cart/store.ts`) est instancié dans `serve.ts` mais jamais exposé en HTTP ; webhook Stripe/PayPal jamais branché en HTTP.
Items prioritaires :
- **T-COM-01 (P0, 0,5 j, sans ADR)** brancher billing/dunning/renewal sur le planificateur.
- **T-COM-04 (P0, 10-15 j, ADR requise — texte proposé dans le document)** pont vitrine complet : routeur public, panier de session, pages produit/panier/checkout/compte, webhook.
- T-COM-02 (P1, 0,5 j) exposer `changePlan` dans l'écran abonnement (route existe, UI absente).
- T-COM-03 (P1, 1 j) recherche/filtres avancés sur la liste des commandes.
- P1 : aucun test admin pour `commerce-customer-detail.tsx` (export/anonymisation RGPD).
- P2 : modification des lignes d'une commande pré-paiement ; `abandon()` panier jamais déclenché automatiquement.

### 05 — Médiathèque (terminé 2026-09-02 01:50, 206 k tokens Sonnet)
Décompte : 34 FAIT, 8 PARTIEL, 7 ABSENT, 5 POINT MORT (~54 critères). Fiches 11 et 46 fusionnées, médiathèque bien plus riche que documenté.
Deux bugs P0 masqués par des commentaires de code trompeurs :
- **P0-1** l'upload admin (`upload-form.tsx`, `media-picker.tsx`) envoie toujours JSON+base64 (`fileToBase64`/`uploadMedia`), jamais multipart, malgré un commentaire « fiche 46 t.7 — upload multipart multiple avec progression » et une vraie route serveur multipart. Pas de progression réelle, pas de parallélisme, pas de zone de dépôt.
- **P0-2** `MediaAsset.version` (cache-bust `&v=` sur `/_image` après remplacement de fichier, documenté « theme@1.2 ») n'est ni renseigné (`loadRenderMedia` dans `serve.ts`) ni lu (`variantUrl()`) — le « piège le plus coûteux » nommé par la fiche 11 ; absent aussi du contrat D documenté.
Items prioritaires : upload multipart réel + progression (2-3 j) ; cache-bust (0,5-1 j, contract-guardian) ; usage avant suppression groupée (1 j) ; dossiers dans le sélecteur de média des champs (0,5-1 j) ; tests manquants pour `replace`/`usage`/`exif`/bulk-tag (1-1,5 j) ; `cogenta doctor` ne rapporte pas le driver d'images (R1, 0,5 j) ; filtre de date et compteur total jamais affichés (0,5 j) ; recadrage/rotation absents ; prévisualisation vidéo/PDF absente ; pas d'AVIF ni de transformation à la volée honorée par `/_image` malgré le contrat.

### 07 — Apparence, thèmes, rendu public (terminé 2026-09-02 02:00, 239 k tokens Sonnet)
Décompte : 31 FAIT, 6 PARTIEL, 5 ABSENT, 6 POINT MORT (48 critères). Fiches 14/48/49 très majoritairement FAIT.
Constat central : ~40 % de `@cogenta/render` (`astro/`, `build/`, `cache/`, `pwa/` — 22 fichiers testés) n'a **aucun appelant** dans `@cogenta/cli` ; le rendu réel est un moteur maison en chaînes, un seul mode, TTL HTTP en guise de cache — jamais l'invalidation par tags que L3 posait en critère. Non documenté (seul l'abandon d'Astro l'est).
Items prioritaires :
- **P1 (1,5 j)** identité du site (logo, logo sombre, favicon, image de partage) stockée et éditable mais **jamais lue par le rendu** ; `ChromeInput` n'a aucun champ logo → aucun thème ne peut afficher un logo.
- P1 (0,5 j) image de partage : deux champs concurrents, `shareImageMediaId` mort, `seo.defaultSocialImageUrl` vivant.
- P1 cache de rendu par tags : `page-cache.ts` testé, jamais câblé (ADR si retenu).
- P1 (0,5 j) RSS/Atom jamais servis (`feeds.ts` — même constat que l'audit 06).
- P1 PWA : 5 fichiers testés, zéro appelant (décision à documenter).
- P1 (1 j) aucune page d'accueil configurable, `/home` en dur.
- P1 ADR « overlays de thème en base » recommandée par la fiche 14, jamais rédigée.
- P1 (0,5 j) scanner d'isolation contrat D jamais exécuté sur les 5 thèmes intégrés.
- P1 (1 j + 2 j) polices non préchargées, `font-display: swap` absent de 4/5 thèmes, pas de Lighthouse CI malgré critère L3/L12.
Deux régressions de L20 (pages recherche/formulaires/commentaires non stylées, JSON-LD incomplet) vérifiées corrigées.

### 01 — Contenu éditorial (terminé 2026-09-02 02:05, 223 k tokens Sonnet)
Décompte : 33 tâches → 29 FAIT, 2 PARTIEL, 2 ABSENT documentés comme renoncement (autosave serveur, verrou d'édition exclusif). Domaine bien plus mûr que les fiches : sélecteur de relation, médias multiples, répéteurs, image/lien interne/menu slash/undo-redo/source dans le texte riche, compteurs par statut, actions groupées, garde de sortie, validation, aperçu de permalien, auteur, détection d'écriture concurrente — tous livrés et testés sur base réelle.
Items prioritaires :
- **P0 (15 min)** clé i18n `richText.imageDropHint` présente en EN, absente en FR (diff programmatique : 1 clé manquante) → aria-label non traduit.
- **P1 (1 j)** détection d'écriture concurrente (`CONTENT_STALE_WRITE`, `packages/schema/src/store/store.ts:1216-1240`) en prod, **zéro test** dans tout le dépôt (viole la DoD et le critère de la fiche).
- P2 (3-4 h) libellés de champ non humanisés : `field.admin?.label ?? field.name` (`field-wrapper.tsx:47`) affiche `title`/`slug` bruts sans `admin.label` (bug L20 toujours présent).
- P3 : édition rapide en ligne (2 j), vue grille (1,5 j) ; champs conditionnels et verrou exclusif = ADR requise.

### 03 — Versions, corbeille, workflow, traductions (terminé 2026-09-02 02:10, 215 k tokens Sonnet)
Décompte : 26 FAIT, 8 PARTIEL, 6 ABSENT, 2 POINT MORT (42 critères). Fiches largement périmées : ADR-0027 (workflow éditorial, `schema@2.1`) actée et insérée, lot non documenté dans `CLAUDE.md`. Aucune violation R1-R10.
Items prioritaires :
- **P1 (0,5 j)** assigner un relecteur : route `assign-reviewer` et `assignReviewer` (`content-client.ts:614`) existent et sont testées, **aucun écran ne les appelle**. Point mort.
- P2 (0,25 j) badge « à relire » périmé : `review.tsx` et `entry-edit.tsx` n'appellent jamais `useRefreshChromeStatus()` après transition (même famille que le badge corbeille, audit 10).
- P2 (1 j) note de révision absente (fiche 06 t.4).
- P2 (3-4 j) commentaires de relecture internes absents (fiche 37 t.5), table hors contrat A.
- P2 (1-2 j) notifications de transition absentes (fiche 37 t.6), réutilisation de `@cogenta/channels`.
- P2 (2 j, **ADR requise**) texte alternatif média non traduisible (`MediaAsset.alt` chaîne unique).
- P3 : vue côte à côte source/cible (2-3 j), sélecteur de traduction à remonter en sidebar (0,5 j), calendrier éditorial (2 j), tri dans la corbeille (0,5 j).

### 09 — Comptes et sécurité (terminé 2026-09-02 02:15, 225 k tokens Sonnet)
Décompte : 41 FAIT, 3 PARTIEL, 0 ABSENT, 2 POINT MORT (46 critères, 8 fiches). Aucun bug P0, aucune régression de sécurité (R4 respecté, clé API brute jamais réexposée). ADR-0028 (permissions de rôle en base) actée et intégralement implémentée.
Items prioritaires :
- **T09-01 (P1, 1 j)** `AuditLog.prune()` (rétention du journal d'audit) : algorithme existant et testé, jamais invoqué. Point mort.
- **T09-04 (P1, 1-2 j)** export RGPD des données personnelles (droit d'accès/portabilité) totalement absent, y compris des fiches ; seule l'anonymisation existe.
- T09-02 (P2, 2-3 h) en-tête `Retry-After` manquant sur `AUTH_RATE_LIMITED` (les clés API l'ont).
- T09-06 (P2, 3-5 j, **ADR requise**) clé API à portée fine par collection/action.
- T09-03 (P2, 3-4 h) portée de clé API lisible seulement au survol (`title=`).
- T09-05 (P2, 1-2 j) journalisation d'audit par sniffing de chemin HTTP pour 3 domaines, à remplacer par un appel direct dans le routeur.
- P3 : onglet « actions d'agents » dans l'audit ; allowlist IP admin promise par `docs/05-securite.md`, absente ; SSO/OIDC différé délibérément.

### 12 — Extensions et marketplace (terminé 2026-09-02 02:18, 209 k tokens Sonnet)
Décompte : 15 FAIT, 6 PARTIEL, 4 ABSENT, **10 POINT MORT** (~35 critères). Le socle d'isolation L7 (sandbox worker, Ed25519, SDK « absent pas refusé », limites) est réel ; le système de plugins entier est largement théâtral en pratique.
Items prioritaires :
- **T01 (P0, 0,5 j)** `PluginGrantStore.grant()` jamais appelé en production : installer un plugin via le marketplace n'accorde **aucune** capacité, l'écran de revue de permissions n'a aucun effet.
- **P0 structurel** `runPlugin` jamais invoqué par `cogenta serve` ; `manifest.provides` (tools/blocks/fields/channels/drivers) jamais lu → un plugin installé ne fait rien.
- T02 (P1, 1 j) écran de révocation par capacité testé, jamais monté sur une route.
- T06 (P1, décision) 3 des 4 registres L7 (plugins/thèmes/skills) sont du code mort.
- T05 (P1, 1 j) aucune commande `cogenta plugin install/remove/list`.
- T04 (P1, 1 h) `engineVersion` jamais configurée dans `serve` → contrôle de compatibilité toujours `null`.
- P2 : notice « mises à jour disponibles » absente du centre de notifications (2 h) ; filtres thème/skin/skill trompeurs dans « Découvrir » (1 h) ; catalogue « Découvrir » vide par construction (aucun registre distant configuré nulle part).

### 11 — Exploitation (terminé 2026-09-02 02:25, 216 k tokens Sonnet)
Décompte : 47 FAIT, 11 PARTIEL, 10 ABSENT, 6 POINT MORT. Domaine bien plus construit que ses fiches (fiche 26 dit « absent » alors que `@cogenta/export`, 1 967 lignes, existe et est documenté au contrat) ; le vrai manque est le câblage.
Items prioritaires :
- **T01 (P0, 0,5 j)** facturation d'abonnement jamais planifiée (confirme l'audit 14) : `runBilling`/`runDunning`/`sendRenewalNotices` absents des 9 tâches de `serve.ts`.
- **T02 (P0, 1 j)** export RGPD `exportPersonalData` (170 lignes, testé) : **zéro appelant** dans tout le dépôt — obligation légale inexerçable (confirme l'audit 09).
- T03 (P1, 0,5 j) `config.scheduler.mode` (`internal`/`external-cron`) résolu par `@cogenta/core` mais `serve.ts` code `'internal'` en dur — réglage mort.
- T04 (P1, 3-4 j) commande `cogenta cron` (hébergement mutualisé) jamais construite malgré le mode promis par le type.
- T05 (P1, 2 j) route `/api/export` citée en commentaire, inexistante — export CLI seulement, non vérifiable par rôle.
- T06 (P1, 1-2 j) deux importeurs JSON non fusionnés (`json-import.ts` ne consomme pas le format `export@1.0` qu'il dit devoir lire).
- T07 (P1, 2 j) widget de sauvegarde du tableau de bord = placeholder statique, aucune API de statut.
- T08 (P2, 2 j) sauvegardes planifiées/rotation/alerte absentes.
- T09 (P2) écran de mapping de champs d'import (`mapping.ts`) jamais exposé ; T10 (P2, 4-5 j) importeurs Ghost/Medium absents.
Bien construit et vérifié : registre de tâches avec verrou compare-and-set testé sur 3 bases, écran Mises à jour (points de restauration, risque de contrat), analytics (fiche 64 réellement faite).

### 08 — Commentaires et formulaires (terminé 2026-09-02 02:30, 265 k tokens Sonnet)
Décompte : 25 critères → 19 FAIT, 3 PARTIEL, 1 ABSENT (bloc formulaire : RFC jamais ouverte, délibéré), 2 POINT MORT, + 6 bugs hors fiches. Aucun P0. Contrats F (`comments@1.0`, ADR-0025) et G (`forms@1.1`, ADR-0026/0031) réels, socle solide (revue sécu déjà appliquée : open redirect, CRLF, contournement de rate-limit par IP, injection de formule CSV).
Items prioritaires (tous P1/P2, sans ADR) :
- T01 (0,5 j) entrée « Commentaires » du menu jamais masquée même désactivée/vide.
- T02 (0,5 j) désactiver les commentaires site-entier ne cache que le formulaire, pas le fil déjà publié.
- T03 (1 j) verdict `assist.moderate` calculé, jamais persisté (le badge ne s'allume jamais). Point mort.
- T04 (1,5 j) quatre réglages `discussion.*` (anonyme, fermeture auto, profondeur, e-mail de notification) éditables, **jamais lus**. Réglages morts.
- T05 (1 j) réglages de commentaires par collection : API + client complets, aucun écran.
- T06 (0,5 j) constructeur de formulaire affiche des libellés bruts non traduits (`name`, `kind`, `help`) — constat L20 aggravé par la fiche 47.
- T09 (1 j) sélecteur de canal de notification = champ texte libre.
- T12 (0,5 j) clé secrète CAPTCHA stockée et renvoyée en clair à l'admin (contraire au précédent L22 de chiffrement des clés LLM).
- Aussi : fil de commentaires public non paginé ; rétention/effacement RGPD présents pour les formulaires, absents pour les commentaires.

### 15 — Installeur, CLI, docs, flotte (terminé 2026-09-02 02:40, 226 k tokens Sonnet)
Décompte : 18 FAIT, 9 PARTIEL, 6 ABSENT, 3 POINT MORT. Changesets : aucun paquet public modifié depuis le 2026-08-20 sans changeset (91 en attente, publication bloquée par l'accès npm OIDC humain).
Constat central : **`@cogenta/fleet` (L8, « 11/11 terminé ») n'a aucun point d'entrée exécutable** — aucune dépendance depuis un `package.json`, aucune commande CLI, aucune route serveur, `FleetDashboard` (`packages/admin/src/fleet/dashboard.tsx`) jamais monté (son propre commentaire l'admet). Bibliothèque testée en vase clos, pas une fonctionnalité.
Items prioritaires :
- **T01 (P0, 3-5 j)** donner un point d'entrée réel à `@cogenta/fleet` (route/écran/commande).
- T02 (P1, 1 h) `docs/versionnement.md` affirme à tort que rien n'est publié sur npm.
- T03 (P1, 0,5-1 j) `docs/06-lots.md`, roadmap publique arrêtée à L9.
- T04 (P1, 2-3 h) scaffold sans `scripts.start`/`engines` → bloque un déploiement Passenger.
- T05 (P2, 3-4 h) `cogenta doctor` ignore les drivers `vector`/`imageGeneration`.
- T06 (P2) `hebergement-mutualise.md` documente une lacune cron obsolète ; T07 (P2, 1-1,5 j) `cogenta update` ne compare que 2 paquets sur ~26.
- T08 (P2, 1 j) CSV/JSON/RSS importables en admin seulement, pas en CLI.
- T10 (P3, 1-1,5 j) blueprints : `defineTaxonomy()` et champs SEO (confirme audits 04 et 06).

### 13 — Agents, IA, MCP, canaux (terminé 2026-09-02 02:45, 271 k tokens Sonnet)
Décompte : 78 FAIT, 8 PARTIEL, 5 ABSENT, 4 POINT MORT (~95 critères, 8 fiches toutes réellement fusionnées, `tools@1.4`). Zéro violation R1-R10.
Deux P0 nouveaux, non documentés ailleurs :
- **`AgentDeclaration.triggers` (planification cron des agents) totalement inerte** : stocké et renvoyé par l'API, lu par aucun planificateur (~10 tickers réels dans `serve.ts`, aucun pour les agents). Activer un agent ne le fait jamais tourner seul.
- **Les six agents spécialisés de `@cogenta/agents-builtin`** (content, designer, developer, performance, security, seo) **sont orphelins** : jamais importés par `cli`/`api`/`admin` ; `code.propose_patch` (permission `tools@1.3`) jamais enregistré dans le manifeste réel. 154 tests en vase clos.
Items prioritaires : T10 (1 j) semer les six agents orphelins ; T01 trancher le sort des `triggers` (planificateur réel) ; T02 notice d'honnêteté sur l'autonomie ; T08 libellés de section du plan de site en anglais en dur (viole ADR-0019) ; T04/T05 ressources MCP et transport HTTP.

---

## Plan de correction consolidé (rédigé le 2026-09-02 02:45, 15/15 audits rendus)

### Bilan chiffré (15 domaines)
FAIT ≈ 633 · PARTIEL ≈ 108 · ABSENT ≈ 75 · POINT MORT ≈ 64. Aucune violation R1-R10 dans le code lu (pas de `any`, `console.log`, contrôle de permission dans un outil, dépendance sauvage). Le motif dominant n'est pas le code manquant mais **le câblage manquant** : des dizaines de fonctions écrites et testées que rien n'appelle.

### P0 transverses (à corriger en premier)
| # | Constat | Audits | Effort |
|---|---|---|---|
| P0-1 | Facturation d'abonnement (`runBilling`/`runDunning`/`sendRenewalNotices`) jamais planifiée | 14, 11 | 0,5 j |
| P0-2 | Export RGPD `exportPersonalData` : zéro appelant | 09, 11 | 1 j |
| P0-3 | Blueprints sans champs SEO (`seoTitle`…) ni `defineTaxonomy()` → panneau SEO et écran Taxonomies vides sur tout site neuf | 06, 04, 15 | 1 j |
| P0-4 | Upload média en base64 malgré route multipart et commentaire mensonger ; pas de progression | 05 | 2-3 j |
| P0-5 | `MediaAsset.version` (cache-bust `/_image`) ni renseigné ni lu | 05 | 0,5-1 j |
| P0-6 | `PluginGrantStore.grant()` jamais appelé : un plugin installé n'a aucune capacité ; `runPlugin`/`manifest.provides` jamais exécutés | 12 | 0,5 j + chantier |
| P0-7 | Clé i18n FR `richText.imageDropHint` manquante | 01, 10 | 15 min |
| P0-8 | `@cogenta/fleet` sans aucun point d'entrée | 15 | 3-5 j |
| P0-9 | Pont vitrine commerce (aucune page publique, panier/checkout/webhook non exposés) | 14 | 10-15 j, ADR |
| P0-10 | `AgentDeclaration.triggers` inerte : un agent activé ne tourne jamais seul | 13 | 1-2 j |
| P0-11 | Six agents intégrés orphelins, `code.propose_patch` jamais enregistré | 13 | 1 j |

### Vagues de correction
- **Vague A (lancée 02:50)** — P0-1..P0-7 + P1 de câblage sans ADR, six agents en worktree : A1 commerce, A2 RGPD/audit/auth, A3 blueprints+scaffold, A4 rendu public (archives de termes, identité du site, flux RSS, accueil configurable, barre d'admin), A5 médiathèque, A6 finitions admin (badges, relecteur, libellés, notifications, santé, axe).
- **Vague B** — A7 commentaires/formulaires, A8 plugins, A9 exploitation, A10 documentation/CLAUDE.md, A11 agents IA (après audit 13).
- **Vague C** — P0-8 flotte, P0-9 pont vitrine (ADR rédigée d'abord), registre de blocs par site, `cogenta cron`, cache par tags (décision).

## Journal des corrections lancées
- 2026-09-02 02:55 — **Vague A lancée** (worktrees isolés) : A1 commerce (Sonnet), A2 RGPD/audit/auth (Sonnet), A3 blueprints/scaffold/doctor (Sonnet), A4 rendu public/thèmes (Opus), A5 médiathèque (Sonnet), A6 finitions admin (Sonnet). Rapports attendus dans `corrections/A*.md`. Fusion séquentielle dans `main` avec typecheck + tests après chaque fusion.
- 2026-09-02 04:05 — **A3 fusionné** (`ad8d963`, 5 commits) : champs SEO sur toutes les collections routées des 10 blueprints (`SEO_FIELDS`/`definePageCollection`), `blog` migré vers `defineTaxonomy()` (catégorie, étiquette), scaffold avec `scripts.start`/`engines`, `cogenta doctor` rapporte les drivers `images`/`vector` (+ note `imageGeneration`), `getting-started.md` à jour. Vérifié après fusion : typecheck `create-cogenta` + `@cogenta/cli` propres, `create-cogenta` 156/156. Deux vrais bugs trouvés par l'agent en testant (publication requise pour le rendu SEO d'un `post` versionné ; test doctor supposant tous les drivers dégradés). Rapport : `corrections/A3-blueprints-scaffold-doctor.md`.
- 2026-09-02 ~04:30 — **Limite de session atteinte** (reset 06:30) : A1, A2, A6 tués en plein travail (worktrees conservés avec commits + fichiers modifiés non commités ; A4/A5 vraisemblablement aussi). Consigne de reprise : renvoyer un message à chaque agent (reprise de sa transcription) plutôt que relancer à neuf, pour ne pas payer deux fois la lecture. État des worktrees au moment de la coupure : A1 2 commits + 8 fichiers, A2 0 commit + 25 fichiers, A4 1 commit + 28 fichiers, A5 3 commits + 4 fichiers, A6 3 commits + 6 fichiers.
- 2026-09-02 06:31 — limite levée, **A1/A2/A4/A5/A6 repris depuis leur transcription** (pas de relance à neuf).
