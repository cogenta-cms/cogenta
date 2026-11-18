# L41 — Le MCP du site comme connecteur claude.ai (OAuth) et publication autonome

Demandé par l'utilisateur le 2026-11-18. Le MCP d'un site déployé (`/api/mcp`) n'accepte
qu'une clé d'API collée dans un en-tête : il faut l'ajouter à la main sur chaque machine,
et il est impossible de l'ajouter comme connecteur claude.ai (qui ne parle qu'OAuth), donc
impossible à utiliser depuis une tâche planifiée dans le cloud. Second manque, constaté en
publiant tous les jours sur scaleruptech.com par MCP : il faut encore passer par REST pour
la couverture, les tags et la traduction, et chaque écriture attend un humain.

## Partie 1 — Serveur d'autorisation OAuth 2.1 pour `/api/mcp`

Conforme à la spécification d'autorisation MCP (2025-06-18) : RFC 9728 (métadonnées de
ressource protégée), RFC 8414 (métadonnées du serveur d'autorisation), RFC 7591
(enregistrement dynamique de client), OAuth 2.1 avec PKCE S256 obligatoire, RFC 8707
(paramètre `resource`).

**Principe : OAuth ne crée pas un second type d'identité.** Une autorisation accordée
crée **une clé d'API** ordinaire (nom « OAuth · <nom du client> », portée = rôles choisis
à l'écran de consentement, jamais plus que les rôles de la personne qui consent). Les
jetons d'accès OAuth sont des jetons courts rattachés à cette clé : l'acteur résolu est
`apikey:<id>`, donc tout l'aval (relecture de la clé avant chaque appel MCP, révocation,
quota par minute, audit, file d'approbation) fonctionne sans changement. Révoquer la clé
dans l'admin coupe le connecteur.

- `GET /.well-known/oauth-protected-resource` et `…/oauth-protected-resource/api/mcp` :
  `resource` = `<site.url>/api/mcp`, `authorization_servers` = `[<site.url>]`.
- `GET /.well-known/oauth-authorization-server` : `issuer` = `site.url` (jamais l'en-tête
  `Host`), endpoints, `code_challenge_methods_supported: ["S256"]`,
  `grant_types_supported: ["authorization_code","refresh_token"]`,
  `token_endpoint_auth_methods_supported: ["none","client_secret_post","client_secret_basic"]`.
- Le 401 de `/api/mcp` porte `WWW-Authenticate: Bearer resource_metadata="…"`.
- `POST /oauth/register` (RFC 7591), anonyme, limité en débit par adresse, nombre de
  clients plafonné ; `redirect_uris` en `https:` ou boucle locale `http://127.0.0.1|localhost`.
- `GET /oauth/authorize` : valide client, `redirect_uri` (égalité exacte), `response_type=code`,
  `code_challenge` S256, `resource` éventuel. Un client ou une adresse de retour invalide
  donne une page d'erreur, **jamais une redirection**. Sinon : demande en attente côté
  serveur (10 min) puis redirection vers l'écran de consentement de l'admin.
- Écran admin `/admin/oauth/consent` : nom du client (déclaré par le client, montré comme
  tel), hôte de retour, rôles accordés (sous-ensemble des siens), accepter / refuser.
  `POST /api/oauth/consent` (session requise) rend l'adresse de retour avec `code` et `state`.
- `POST /oauth/token` : `authorization_code` (code à usage unique, 60 s, lié au client, à
  l'adresse de retour, au vérificateur PKCE et à la ressource) et `refresh_token` (rotation
  à chaque usage ; la réutilisation d'un jeton déjà tourné révoque l'autorisation).
  Jeton d'accès 1 h, jeton de rafraîchissement 30 jours glissants. Tout est stocké haché.
- Désactivable : `mcp.oauth: false` dans la configuration.

## Partie 2 — Les outils qui manquaient pour publier par MCP seul

- `content.write_draft` accepte `translationOf` (identifiant de l'entrée source).
- Un outil pour créer un terme de taxonomie (tag) et un pour importer une image depuis une
  adresse `https:` publique (garde SSRF existante, types d'image seulement, taille plafonnée,
  crédit/licence en métadonnées).
- `content.write_draft` et `content.publish` deviennent **réversibles** (`revert` réel :
  mise à la corbeille du brouillon créé ; retour à l'état publié précédent ou dépublication).
- Politique d'approbation **par clé** : `always` (défaut, comportement actuel : toute
  écriture attend un humain) ou `reversible-auto` (une écriture réversible s'exécute sans
  attendre, journalisée et annulable depuis l'Historique ; une écriture non réversible
  attend toujours un humain — R6 intact). Choisie à la création de la clé et à l'écran de
  consentement OAuth.

## Critères d'acceptation

- Un client MCP réel découvre, s'enregistre, obtient le consentement et appelle un outil
  (test de bout en bout sur un vrai serveur, PKCE réel).
- Refus testés : mauvais vérificateur PKCE, code rejoué, adresse de retour différente,
  jeton de rafraîchissement réutilisé, clé révoquée, rôles demandés au-delà des siens.
- Revue `security-reviewer` et `contract-guardian` (contrat C : `translationOf` et nouveaux
  outils sont additifs, `tools@1.x` mineur) avant fusion.
