# 38 — Notifications et notices

> **État** : partiel — le mécanisme existe, il a deux consommateurs.
> **Écran** : `packages/admin/src/notices/notice-board.tsx`
> **Serveur** : `packages/api/src/notices/` (`types.ts`, `router.ts`,
> `dismissals.ts`, `mfa-recommendation.ts`, `suspicious-activity.ts`)
> **Canaux** : `@cogenta/channels` (Telegram, Slack, Discord, webhook, e-mail sortant)
> **Effort** : 3–4 jours
> **ADR requise** : non — ADR-0021 a posé le mécanisme

---

## 1. Ce qui existe réellement

Le mécanisme d'ADR-0021 est en place et bien conçu :

- Le tableau de notices est monté **au-dessus de la page routée**, dans la coquille —
  une recommandation est donc visible où qu'on soit.
- Il n'est **jamais** une modale, jamais une garde de route, jamais une redirection.
  C'est tout l'intérêt : informer sans se mettre en travers. C'est ce qui a remplacé le
  blocage de connexion pour la MFA.
- **Un échec de chargement est silencieux** — et le fichier explique pourquoi : une
  recommandation qu'on n'a pas pu charger ne vaut pas une barre rouge en haut de chaque
  écran.
- Rejet persistant (`dismissals.ts`).
- Deux consommateurs réels : recommandation MFA (ADR-0021) et activité suspecte.

Et, côté sortie, `@cogenta/channels` porte déjà : quatre canaux temps réel vivants,
une file d'approbation actionnable à jetons à usage unique, des formats
alerte/rapport/notification **avec budget-écran imposé**, des préférences de
notification et du **regroupement** (« quinze constats → un seul message »).

Les deux moitiés existent. Elles ne se parlent pas.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Cogenta |
|---|---|---|---|
| Notices d'admin persistantes | ✅ | ✅ | ✅ |
| Rejet mémorisé | partiel | ✅ | ✅ |
| **Centre de notifications** (historique) | ❌ | ✅ | ❌ |
| Notification par e-mail | ✅ | ✅ | brique ✅ |
| Préférences par utilisateur | plugin | ✅ | brique ✅ |
| Notification temps réel dans l'admin | ❌ | ❌ | ❌ |
| Sévérité et regroupement | partiel | ✅ | partiel |
| Notification vers Slack/Discord | plugin | plugin | ✅ **mieux** |
| File d'approbation actionnable | ❌ | ✅ | ✅ **mieux** |

## 3. Écarts, classés

### Importants

1. **Seulement deux consommateurs.** Presque tout ce qui devrait produire une notice
   n'en produit pas : mise à jour d'extension disponible, migration en attente,
   sauvegarde absente, clé d'API qui expire, tâche planifiée en retard, rupture
   d'intégrité de l'audit, stock bas, impayé, commentaire en attente, formulaire non
   lu. Chaque fiche de cet ensemble en cite au moins un.
2. **Pas d'historique.** Une notice rejetée disparaît définitivement. Il n'y a aucun
   endroit où retrouver « qu'est-ce qui s'est passé pendant mes vacances ».
3. **Les canaux ne sont pas branchés sur l'admin.** `@cogenta/channels` est vivant,
   testé, complet — et rien dans la console d'un site ne l'utilise. C'est du travail
   déjà fait qui ne sert à rien.
4. **Pas de préférences côté admin.** Les préférences existent dans `@cogenta/channels`,
   sans écran.

### Confort

5. Pas de sévérité visuelle (info / avertissement / critique).
6. Pas de notification temps réel.
7. Pas de regroupement côté admin (il existe côté canaux).

## 4. Plan de développement

### Tâche 1 — Un registre de notices

**Fichiers** : `packages/api/src/notices/`.

Aujourd'hui, chaque notice a son module (`mfa-recommendation.ts`,
`suspicious-activity.ts`). Ce motif ne passe pas l'échelle de la douzaine de sources
attendues.

Un registre : chaque source déclare un identifiant, une sévérité, une condition
d'apparition, un titre, un corps, une action et son lien, et son comportement de rejet
(rejetable définitivement, rejetable pour 7 jours, non rejetable).

Sources à brancher dès le départ (une ligne chacune, une fois le registre en place) :
migrations en attente, mises à jour d'extension, extension désactivée automatiquement,
sauvegarde absente depuis N jours, clé d'API expirant, tâche planifiée en retard,
rupture d'intégrité de l'audit, stock bas, abonnement impayé, commentaires en attente,
soumissions non lues, contenu programmé dont la publication a échoué.

**Critère** : ajouter une source de notice = une déclaration, aucun écran à modifier.

### Tâche 2 — Centre de notifications

**Fichiers** : nouvelle route ou popover, `packages/api/src/notices/`.

Une cloche dans la barre supérieure, avec un compteur de non-lues, et une liste :
notice, date, sévérité, lien d'action, état (lue / rejetée / résolue). Filtre par
sévérité et par période, marquage groupé comme lu.

Une notice **résolue** (la mise à jour a été faite) disparaît toute seule — c'est ce
qui distingue une notice utile d'un bandeau qu'on apprend à ignorer.

### Tâche 3 — Brancher les canaux

**Fichiers** : `@cogenta/channels` (réutilisation), `packages/api/src/notices/`,
nouvelle route de réglages.

- Écran de configuration des canaux : ajouter un canal (Telegram / Slack / Discord /
  webhook / e-mail), **liaison d'identité par code à usage unique** — le mécanisme
  existe, ne pas en écrire un second.
- Par canal et par sévérité : quelles notices sont envoyées.
- Réutiliser les formats de message et leur **budget-écran imposé** plutôt que de
  composer des messages à la main.
- Réutiliser le **regroupement** existant.

**La règle de sécurité centrale de L6 s'applique telle quelle** : une commande entrante
s'exécute avec les permissions de l'humain identifié, jamais avec celles de l'agent.
Si la file d'approbation actionnable est branchée sur l'admin, cette règle est ce qui
la rend sûre — elle est déjà implémentée et prouvée par test contre l'escalade de
permission et l'usurpation d'identité. Ne pas la contourner.

### Tâche 4 — Préférences par personne

**Fichiers** : écran de profil (fiche
[18](18-profil-et-authentification.md)), `@cogenta/channels`.

Quelles notices je veux, sur quel canal, avec quel regroupement, et des heures
calmes. Le modèle de préférences existe côté canaux ; il lui faut un écran.

### Tâche 5 — Sévérité et présentation

**Fichiers** : `notices/notice-board.tsx`, `ui/notice.tsx`.

Quatre niveaux : information, recommandation, avertissement, critique. Une seule notice
critique reste visible en permanence ; les autres se replient au-delà de trois, avec
un « voir les N autres ».

**Ne jamais devenir bloquant** : c'est le principe d'ADR-0021, et une notice
« critique » n'est pas une exception. Elle est plus visible, pas plus autoritaire.

### Tâche 6 — Temps réel, si et seulement si c'est gratuit

**Fichiers** : `notices/notice-board.tsx`.

Un rafraîchissement périodique (une minute) suffit largement et ne coûte rien.
SSE ou WebSocket introduiraient une connexion persistante par onglet — donc un coût
d'infrastructure — pour un gain marginal sur ce cas d'usage. **R1** : ne pas créer de
dépendance à une infrastructure temps réel pour afficher une cloche.

## 5. Critères d'acceptation

- Chaque condition anormale du site produit une notice.
- Une notice résolue disparaît d'elle-même.
- On retrouve une notice rejetée dans l'historique.
- Les canaux de `@cogenta/channels` sont réellement utilisables depuis un site.
- Aucune notice n'est jamais bloquante (ADR-0021).
- Une commande entrante d'un canal s'exécute avec les permissions de l'humain
  identifié (règle L6, à ne pas affaiblir).

## 6. Tests exigés

- Unitaires : chaque condition de notice, dans les deux sens (apparaît / disparaît une
  fois résolue).
- Composant : une notice critique n'empêche jamais la navigation.
- Composant : `notice-board.test.tsx` reste stable en lot avec le test du tableau de
  bord (instabilité déjà rencontrée et documentée).
- Bout en bout : notice envoyée sur un canal, avec regroupement.
- Sécurité : rejouer les tests d'escalade de permission et d'usurpation d'identité de
  L6 si la file d'approbation est branchée.
- Permissions : une notice ne révèle rien que son destinataire ne puisse voir.

## 7. Pièges connus

- **Une notice ne bloque jamais.** C'est la décision d'ADR-0021, prise pour remplacer
  un blocage de connexion. Une modale bloquante la contredirait.
- **L'échec de chargement est silencieux, exprès.** Le commentaire du fichier explique
  pourquoi ; ne pas « améliorer » en affichant une erreur.
- **Trop de notices = plus aucune notice.** Sévérité, regroupement, disparition
  automatique une fois résolue.
- **Une notice peut fuiter.** « 3 commentaires en attente » adressé à quelqu'un qui ne
  peut pas modérer révèle une information sans utilité.
- **Les canaux entrants sont une surface d'autorisation.** La règle L6 est ce qui la
  ferme ; elle est déjà prouvée par test.
- **`notice-board.test.tsx` a une instabilité connue** en lot avec le test du tableau
  de bord. Ne pas la réintroduire.
- **R1** : pas de dépendance temps réel obligatoire pour une cloche.

## 8. Décisions à prendre

- Rafraîchissement périodique (recommandé) vs temps réel.
- Quelles notices sont rejetables définitivement, et lesquelles reviennent tant que la
  condition tient. Recommandation : une condition de sécurité ou de perte de données
  revient toujours.
