# 17 — Utilisateurs

> **État** : bon — l'un des écrans les plus complets. Il manque le cycle de vie.
> **Écran** : `packages/admin/src/routes/users.tsx` (552 lignes)
> **API existante** : `packages/api/src/rest/users-router.ts`
> **Effort** : 3–4 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- Liste des comptes, filtrable par rôle, avec les rôles réellement présents sur le
  site (pas une liste devinée).
- Création d'un compte avec un mot de passe généré, montré **une seule fois**.
- Modification des rôles : quatre rôles standard proposés en cases à cocher plus tout
  rôle personnalisé déjà utilisé sur le site, plus un champ libre. Bien pensé : le
  serveur accepte n'importe quelle chaîne, ces quatre noms sont une convention d'UX
  et le code le dit explicitement.
- Activation / désactivation.
- Sessions actives par compte, avec révocation individuelle.
- Colonne MFA (TOTP / passkeys).
- `admin` seulement, avec la même politesse-plus-vérification-serveur que partout.

Et deux absences **délibérées et bien argumentées**, à ne pas « corriger » sans y
penser :

- **Pas de suppression de compte** : un compte qui a écrit du contenu doit rester
  nommable dans le journal d'audit.
- **Pas de réinitialisation du mot de passe d'autrui** : un admin qui pourrait poser
  le mot de passe de quelqu'un pourrait se connecter à sa place, et chaque entrée
  d'audit ensuite nommerait la mauvaise personne. Le chemin est le `/forgot-password`
  en libre-service.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Liste, filtre par rôle | ✅ | ✅ | ✅ | ✅ |
| Créer un compte | ✅ | ✅ | ✅ | ✅ |
| Modifier les rôles | ✅ | ✅ | ✅ | ✅ |
| Désactiver | ✅ (bloquer) | ✅ | ✅ | ✅ |
| Sessions actives + révocation | ❌ | ❌ | ✅ | ✅ **mieux** |
| **Invitation par e-mail** | ✅ | ✅ | ✅ | ❌ (mot de passe affiché) |
| Recherche par e-mail / nom | ✅ | ✅ | ✅ | ❌ |
| Pagination | ✅ | ✅ | ✅ | ❌ |
| Actions groupées | ✅ | ✅ | ✅ | ❌ |
| Profil (nom affiché, avatar, bio) | ✅ | partiel | ✅ | ❌ |
| Dernière connexion | plugin | ✅ | ✅ | ❌ |
| Export CSV | plugin | ✅ | ✅ | ❌ |
| Suppression avec réattribution du contenu | ✅ | ✅ | ✅ | ❌ (voulu) |
| Imposer la MFA à un rôle | plugin | ✅ | ✅ | recommandation (ADR-0021) |

## 3. Écarts, classés

### Importants

1. **Le mot de passe est affiché à l'écran.** C'est honnête (il est montré une fois,
   stocké haché) mais cela oblige l'admin à le transmettre par un canal de son choix —
   souvent un chat, souvent conservé. L'invitation par e-mail avec un jeton à usage
   unique est strictement meilleure, et `@cogenta/channels` sait déjà envoyer un
   e-mail.
2. **Pas de recherche ni de pagination.** Au-delà de cinquante comptes, l'écran est un
   mur.
3. **Pas de profil.** Un compte n'a qu'un e-mail : aucun nom affiché. Les listes de
   contenu ne peuvent donc afficher qu'une adresse e-mail comme auteur — ce qui, sur
   un site public dont le thème afficherait l'auteur, est une fuite d'adresse.
4. **Pas de dernière connexion.** C'est l'information qui permet de repérer un compte
   dormant, donc une porte oubliée.

### Confort

5. Pas d'actions groupées.
6. Pas d'export.
7. La recommandation MFA (ADR-0021) est dans les notices, mais l'écran ne dit pas
   d'un coup d'œil qui devrait l'activer et ne l'a pas fait.

## 4. Plan de développement

### Tâche 1 — Invitation par e-mail

**Fichiers** : `packages/api/src/rest/users-router.ts`, `@cogenta/auth`,
`@cogenta/channels` (réutilisation), `routes/users.tsx`.

- Créer un compte **sans mot de passe**, en état « invité ».
- Émettre un jeton à usage unique, à durée limitée — réutiliser la primitive du
  `/forgot-password`, ne pas en écrire une deuxième.
- Envoyer l'invitation par l'adaptateur e-mail existant.
- Écran : état « invitation envoyée le … », bouton « renvoyer », bouton « annuler
  l'invitation ».
- **Repli obligatoire** : sans transport e-mail configuré, garder le comportement
  actuel (mot de passe affiché une fois) — R1, aucune dépendance dure à une
  infrastructure. Et le dire à l'écran.

**Critère** : inviter un collègue, qui pose lui-même son mot de passe, sans qu'aucun
mot de passe ne transite par un chat.

### Tâche 2 — Recherche, pagination, tri, actions groupées

**Fichiers** : `users-router.ts`, `routes/users.tsx`.

Recherche par e-mail, pagination par curseur cohérente avec le reste de l'API, tri par
création et dernière connexion, actions groupées (désactiver, changer de rôle) avec
`Promise.allSettled` et rapport nommant les échecs.

### Tâche 3 — Profil de compte

**Fichiers** : `@cogenta/auth`, `users-router.ts`, `routes/users.tsx`,
`routes/profile.tsx`.

Nom affiché, avatar (asset média), biographie courte, langue préférée de l'interface.

Deux conséquences immédiates, et c'est ce qui rend la tâche rentable :

- les listes de contenu et le journal d'audit affichent un nom, plus une adresse ;
- le thème peut afficher un auteur sans exposer son e-mail.

Vigilance : ces champs deviennent des données personnelles publiables. Dire clairement,
sur l'écran de profil, ce qui est visible publiquement.

### Tâche 4 — Dernière connexion et hygiène des comptes

**Fichiers** : `@cogenta/auth` (session), `users-router.ts`, `routes/users.tsx`.

- Colonne « dernière connexion », alimentée par le modèle de session existant.
- Signal visuel sur les comptes inactifs depuis N jours.
- Signal sur les comptes à rôle sensible sans MFA — réutiliser `sensitiveRoles()` /
  `requiresMfa()` de `packages/auth/src/mfa.ts`, que la notice ADR-0021 utilise déjà.
  **Un signal, jamais un blocage** : ADR-0021 est explicite.

### Tâche 5 — Suppression, correctement

**Fichiers** : `users-router.ts`, `routes/users.tsx`.

L'argument actuel contre la suppression est bon, mais il n'interdit pas de la faire
proprement — il interdit de la faire naïvement. Deux formes acceptables :

- **Anonymisation** : l'e-mail devient un jeton non réversible, le nom devient
  « Compte supprimé », les sessions sont révoquées, le contenu reste attribué au même
  identifiant. Le journal d'audit reste cohérent, la personne disparaît. **C'est la
  réponse au droit à l'effacement du RGPD.**
- **Réattribution** : transférer le contenu à un autre compte avant suppression.

Recommandation : **anonymisation**, plus simple et suffisante. La documenter comme
irréversible et la confirmer par saisie de l'e-mail.

## 5. Critères d'acceptation

- Un compte se crée sans qu'aucun mot de passe ne transite en clair, **quand** un
  transport e-mail existe — et le comportement actuel reste disponible sinon (R1).
- Cent comptes restent gérables.
- Une adresse e-mail n'est plus le seul identifiant humain d'un auteur.
- Un compte peut être anonymisé sans casser le journal d'audit ni les attributions.
- La MFA reste une recommandation, jamais un blocage (ADR-0021).

## 6. Tests exigés

- Bout en bout : invitation, acceptation, connexion.
- Bout en bout : jeton d'invitation à usage unique — refusé à la seconde utilisation
  et après expiration.
- Bout en bout : anonymisation, puis vérification que les entrées d'audit et les
  contenus attribués restent cohérents.
- Permissions par rôle sur chaque nouvelle route.
- Sécurité : un non-admin ne peut ni lister, ni inviter, ni modifier — vérifié côté
  serveur, pas seulement à l'écran.
- Passage par `security-reviewer` : cette fiche touche l'authentification.

## 7. Pièges connus

- **Ne pas rétablir la réinitialisation par un admin.** L'argument du code est juste
  et vaut d'être relu avant toute tentative.
- **L'invitation est un jeton d'élévation de privilège.** Usage unique, durée courte,
  invalidé au changement de rôle, jamais journalisé en clair.
- **Sans transport e-mail, l'invitation ne doit pas bloquer la création d'un
  compte** (R1). Le repli n'est pas optionnel.
- **Le profil public expose des données personnelles.** Le dire à la personne
  concernée, sur son propre écran de profil.
- **L'anonymisation est irréversible.** Confirmation forte, et une entrée d'audit qui
  la trace.
- **La colonne MFA ne doit pas devenir une contrainte.** ADR-0021 a explicitement
  remplacé le blocage par une recommandation ; un « forcer la MFA » ajouté ici la
  contredirait.

## 8. Décisions à prendre

- Invitation : par e-mail (recommandé) avec repli, ou lien d'invitation copiable
  manuellement (utile quand aucun transport n'existe).
- Suppression : anonymisation (recommandé) ou réattribution.
