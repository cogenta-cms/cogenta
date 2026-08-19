# 18 — Profil et authentification

> **État** : bon — mot de passe, TOTP, passkeys, sessions. Il manque le confort et la
> traçabilité.
> **Écrans** : `packages/admin/src/routes/profile.tsx` (315 lignes),
> `login.tsx` (202), `forgot-password.tsx` (100), `reset-password.tsx` (109)
> **API existante** : `packages/api/src/rest/auth-router.ts`, `@cogenta/auth`
> **Effort** : 3–4 jours
> **ADR requise** : non — ADR-0018 et ADR-0021 couvrent le sujet

---

## 1. Ce qui existe réellement

`profile.tsx` couvre déjà, réellement :

- changement de son propre mot de passe (avec l'ancien — c'est un changement, pas une
  réinitialisation) ;
- **TOTP** : début d'enrôlement, affichage de la clé, confirmation par code,
  désactivation ;
- **passkeys** : enregistrement avec libellé, comptage ;
- **sessions actives** avec révocation individuelle, en réutilisant le composant
  `SessionList` partagé avec l'écran des utilisateurs.

Et le flux de mot de passe oublié existe en libre-service (`/forgot-password`,
`/reset-password`).

ADR-0021 est appliquée : la MFA est **recommandée** par une notice, jamais exigée à la
connexion. La notice pointe vers cette page, et c'est pour cela que les passkeys y ont
été déplacés depuis les réglages.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Changer son mot de passe | ✅ | ✅ | ✅ | ✅ |
| Mot de passe oublié | ✅ | ✅ | ✅ | ✅ |
| TOTP | plugin | ✅ | plugin | ✅ |
| Passkeys / WebAuthn | plugin | ❌ | plugin | ✅ **mieux** |
| Sessions actives + révocation | ❌ | ❌ | ✅ | ✅ **mieux** |
| **Codes de récupération** | plugin | ✅ | plugin | ❌ |
| « Déconnecter partout ailleurs » | ✅ | ❌ | ✅ | ❌ (une par une) |
| Session identifiée (appareil, IP approx., date) | ❌ | ❌ | ✅ | partiel |
| Alerte e-mail sur connexion inhabituelle | plugin | ❌ | ✅ | notice ✅ |
| Nom affiché, avatar | ✅ | partiel | ✅ | ❌ (voir fiche 17) |
| Préférences (langue, fuseau) | ✅ | ✅ | ✅ | langue seulement |
| Historique de ses propres actions | ❌ | ❌ | ✅ | ❌ |
| Limitation des tentatives de connexion | plugin | ✅ | ✅ | ? à vérifier |

## 3. Écarts, classés

### Bloquants

1. **Pas de codes de récupération.** C'est le trou dangereux de cette fiche : quelqu'un
   qui active le TOTP puis perd son téléphone **est enfermé dehors**, et l'admin ne
   peut pas réinitialiser un mot de passe (décision volontaire de la fiche
   [17](17-utilisateurs.md)). Les deux décisions sont bonnes séparément ; ensemble,
   sans codes de récupération, elles produisent un verrouillage définitif. Une passkey
   couvre partiellement le cas, mais seulement si la personne en a enregistré une
   avant.

### Importants

2. **Pas de « déconnecter partout ailleurs ».** Après un vol d'ordinateur, révoquer
   session par session est exactement ce qu'on ne veut pas faire dans l'urgence.
3. **Les sessions sont peu identifiables.** `label` et `lastSeenAt` ne suffisent pas
   à savoir « laquelle est mon téléphone ». Appareil, navigateur et localisation
   approximative sont attendus — en pesant la vie privée (voir pièges).
4. **Vérifier la limitation des tentatives de connexion.** Si elle n'existe pas, c'est
   un constat de sécurité à traiter en priorité, indépendamment de cette fiche.

### Confort

5. Pas de mesure de robustesse du mot de passe à la saisie (la politique existe côté
   serveur : `packages/api/src/rest/password-policy.ts`).
6. Pas d'historique personnel (« mes dernières actions »), alors que le journal
   d'audit contient tout.
7. Pas de fuseau horaire : toutes les dates de l'admin sont dans le fuseau du
   navigateur, ce qui est raisonnable mais jamais dit.

## 4. Plan de développement

### Tâche 1 — Codes de récupération (priorité)

**Fichiers** : `packages/auth/src/mfa.ts`, `packages/api/src/rest/auth-router.ts`,
`routes/profile.tsx`, `routes/login.tsx`.

- À l'activation du TOTP, générer dix codes à usage unique, **affichés une seule
  fois**, avec un bouton de téléchargement. Stockés hachés, comme des mots de passe.
- Écran de connexion : « utiliser un code de récupération » à côté du champ TOTP.
- Compteur de codes restants sur le profil, et régénération (qui invalide les
  anciens).
- Consommation d'un code : entrée d'audit **et** notice de sécurité, parce que c'est
  un événement qui mérite d'être remarqué.

**Critère** : activer le TOTP, « perdre » son authentificateur, se reconnecter avec un
code, et constater que ce code ne fonctionne plus.

### Tâche 2 — Sessions lisibles et révocation en masse

**Fichiers** : `@cogenta/auth`, `users-router.ts`, `routes/profile.tsx`.

- Bouton « Déconnecter toutes les autres sessions », qui épargne explicitement la
  session courante et le dit.
- Session courante identifiée comme telle dans la liste.
- Métadonnées : famille de navigateur et type d'appareil, dérivés du `user-agent` — et
  **rien d'autre**. Pas d'IP en clair, pas de géolocalisation par service tiers (R1 :
  aucune dépendance dure à un service externe, et c'est aussi une question de vie
  privée). Date de création et de dernière activité.

**Critère** : après un vol d'ordinateur, tout couper en un clic depuis un téléphone.

### Tâche 3 — Robustesse du mot de passe et politique visible

**Fichiers** : `routes/profile.tsx`, `routes/reset-password.tsx`,
`password-policy.ts` (réutilisation).

Afficher la politique **avant** la saisie, pas comme un refus après. Un indicateur de
robustesse calculé côté client à partir des **mêmes règles** que le serveur — pas une
deuxième politique. Idéalement, exposer la politique par une route et la rendre, plutôt
que de la recopier.

### Tâche 4 — Mon activité

**Fichiers** : `routes/profile.tsx`, `packages/api/src/rest/audit-router.ts`.

Les vingt dernières actions de la personne connectée, lues depuis le journal d'audit
filtré sur son propre identifiant. Aucune donnée nouvelle : c'est une vue.

Attention permission : le journal d'audit est `admin` seulement. Il faut donc une
route « mon activité » qui **force** le filtre sur l'acteur courant côté serveur — pas
un paramètre que le client fournit, sinon n'importe qui lit le journal de n'importe
qui.

### Tâche 5 — Confort de connexion

**Fichiers** : `routes/login.tsx`, `auth-router.ts`.

- « Se souvenir de moi » avec une durée de session explicite.
- Redirection vers la page demandée après connexion.
- Message clair sur un compte désactivé — sans révéler si l'e-mail existe (un message
  générique côté public, un message précis dans le journal).
- Vérifier la limitation des tentatives ; si elle manque, l'ajouter avec un délai
  croissant, jamais un verrouillage définitif (qui devient un déni de service contre
  un compte donné).

## 5. Critères d'acceptation

- Perdre son authentificateur n'enferme plus personne dehors.
- On coupe toutes les autres sessions en un clic.
- Aucune adresse IP en clair n'est affichée ni stockée pour les sessions.
- La MFA reste recommandée, jamais imposée (ADR-0021).
- « Mon activité » ne peut pas être détournée pour lire le journal d'un autre.
- La politique de mot de passe est annoncée avant d'être appliquée.

## 6. Tests exigés

- Bout en bout : enrôlement TOTP, connexion par code de récupération, code consommé,
  refus à la seconde tentative.
- Bout en bout : « déconnecter les autres » laisse la session courante vivante.
- Sécurité : la route « mon activité » ignore tout identifiant fourni par le client.
- Sécurité : limitation des tentatives de connexion.
- Permissions par rôle : les routes `me` résolvent l'acteur depuis le jeton, jamais
  depuis le corps (comportement actuel — à ne pas régresser).
- Passage par `security-reviewer` : obligatoire.

## 7. Pièges connus

- **Le verrouillage définitif est un risque réel et déjà présent.** Pas de
  réinitialisation par un admin (fiche 17) + TOTP sans codes de récupération = compte
  perdu. La tâche 1 n'est pas une commodité.
- **Les codes de récupération sont des mots de passe.** Hachés, à usage unique,
  affichés une fois, jamais journalisés.
- **Le `user-agent` est une donnée personnelle** dès qu'il est stocké entier. En
  extraire une famille de navigateur et le jeter.
- **La géolocalisation d'IP demande un service externe** — R1, et une fuite de vie
  privée. À écarter.
- **Un verrouillage de compte après N tentatives** est une arme contre le
  propriétaire du compte. Préférer un délai croissant.
- **Ne pas réintroduire de blocage MFA à la connexion** : ADR-0021 l'a explicitement
  remplacé par une recommandation, et ADR-0018 n'est pas remplacée, seulement nuancée.

## 8. Décisions à prendre

- Codes de récupération : dix codes (recommandé, conventionnel) ; format et longueur.
- Métadonnées de session : quel niveau de détail, en gardant « pas d'IP en clair »
  comme règle.
