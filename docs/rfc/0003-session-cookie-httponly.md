# Proposition d'ADR — La session humaine de l'admin passe en cookie `HttpOnly`

> Proposée le 2026-10-26 à la suite du test de pénétration du même jour (constat F-04,
> `docs/qa/pentest-2026-10-26/`). **Non actée, non codée** : `docs/03-decisions.md` est
> protégé en écriture et ce changement touche le contrat d'authentification. Le numéro
> définitif sera attribué à l'insertion (ADR-0038 est déjà réservée par L40).

## Contexte

L'admin garde son jeton de session dans `localStorage` (`cogenta.session.token`,
`packages/admin/src/auth/auth-context.tsx`) et l'envoie en `Authorization: Bearer`.
`localStorage` est partagé par tous les chemins d'une origine : un script qui
s'exécuterait sur une page publique du site (XSS, ressource compromise, extension de
thème) lirait le jeton de l'admin et l'emporterait. Aucune XSS n'a été trouvée par le
test, et la CSP envoyée par défaut depuis le 2026-10-26 réduit fortement ce risque ;
elle ne le supprime pas, parce qu'une CSP se règle et peut être désactivée par site.

## Décision proposée

1. Une session **humaine** ouverte depuis l'admin est portée par un cookie
   `cogenta_session`, `HttpOnly; Secure` (sauf `http://localhost`), `SameSite=Strict`,
   `Path=/api`. Le JavaScript de l'origine ne peut plus la lire.
2. Les clés d'API, MCP et les clients headless gardent `Authorization: Bearer` : rien ne
   change pour eux. Une requête porteuse d'un `Bearer` ignore le cookie.
3. **CSRF** : toute requête authentifiée par cookie et non sûre (`POST`, `PUT`, `PATCH`,
   `DELETE`) exige un en-tête `X-Cogenta-CSRF` égal à un jeton lié à la session (double
   soumission signée), plus une vérification `Origin`/`Sec-Fetch-Site` same-origin.
   `SameSite=Strict` est la première barrière, pas la seule.
4. Déconnexion et révocation suppriment le cookie côté serveur (la session est déjà
   révocable en base) ; la rotation du jeton à l'élévation (step-up MFA) est conservée.
5. Migration : l'admin d'une version antérieure qui détient un jeton en `localStorage`
   l'échange une fois contre le cookie, puis l'efface.

## Conséquences

- **Contrat d'authentification** : nouveau mode de transport de session, additif côté
  API (le `Bearer` reste accepté), mais l'admin change de comportement.
- Tests requis : CSRF refusé sans en-tête, refusé depuis une autre origine, accepté
  same-origin ; cookie absent des réponses aux clés d'API ; déconnexion ; trois bases
  pour la table de sessions si elle évolue ; e2e Playwright du parcours de connexion.
- `docs/05-securite.md` « CSRF : sans objet » devient faux et doit être réécrit.

## Renoncement assumé

Une origine d'admin séparée (sous-domaine) isolerait mieux encore, mais imposerait une
configuration DNS et TLS à chaque site, contraire à la cible hébergement mutualisé
(`docs/hebergement-mutualise.md`). Elle reste possible pour qui la veut, sans être le
défaut.
