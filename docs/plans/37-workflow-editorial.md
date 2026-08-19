# 37 — Workflow éditorial

> **État** : **absent.** Il existe des statuts et des permissions ; il n'existe aucun
> processus.
> **Modèle actuel** : `ContentStatus` = `draft` | `scheduled` | `published` |
> `archived` — **union fermée du contrat A, figée**
> **Écran** : aucun
> **Effort** : 8–10 jours
> **ADR requise** : **oui, obligatoire**

---

## 1. Ce qui existe réellement

- Quatre statuts, dans une union fermée du contrat A.
- Cinq actions de permission par collection, dont `publish` — donc il est déjà possible
  d'avoir un rôle qui écrit sans publier. **C'est la moitié d'un workflow**, et
  personne ne peut s'en servir : un contributeur qui a fini son article n'a aucun
  moyen de le signaler, et un éditeur n'a aucun moyen de savoir ce qui l'attend.
- Le journal d'audit trace qui a fait quoi.
- L'historique de versions permet de comparer.

Autrement dit : **la brique d'autorisation existe, la brique de coordination manque
entièrement.**

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Contentful | Cogenta |
|---|---|---|---|---|
| Statut « en attente de relecture » | ✅ | ✅ | ✅ | ❌ |
| File « à relire » | ✅ | ✅ | ✅ | ❌ |
| Assignation à une personne | plugin | ✅ | ✅ | ❌ |
| Commentaires de relecture sur une entrée | plugin | ✅ | ✅ | ❌ |
| Notification de changement d'état | plugin | ✅ | ✅ | ❌ |
| Transitions par rôle | plugin | ✅ (Workflows) | ✅ | partiel (`publish`) |
| Historique du workflow | plugin | ✅ | ✅ | audit seulement |
| Permission « ses propres contenus » | ✅ | ✅ | ✅ | ❌ |
| Verrouillage pendant relecture | ✅ | ✅ | ✅ | ❌ |
| Échéances éditoriales / calendrier | plugin | ✅ | ✅ | ❌ |

## 3. La décision centrale : où mettre l'état du workflow ?

`ContentStatus` est une **union fermée du contrat A, figée**. Ajouter `pending` est une
montée de version, avec migration et note pour tout client headless qui traite les
statuts de façon exhaustive.

Quatre options :

- **(a) Ajouter `pending` à `ContentStatus`.** Le plus naturel à lire. **ADR + montée du
  contrat A**, et tout consommateur qui fait un `switch` exhaustif casse.
- **(b) Un état de workflow orthogonal**, exactement comme `deletedAt` l'est à `status`
  (ADR-0022). Une entrée reste `draft` et porte en plus `reviewState`. Aucun statut
  nouveau, aucun `switch` cassé, et **le précédent existe dans ce projet** — c'est
  précisément le raisonnement qui a rendu la corbeille compatible avec tout ce qui
  était écrit avant.
- **(c) Une table de workflow séparée** liée à l'entrée. Le plus flexible (plusieurs
  états, plusieurs relecteurs), le plus lourd, et l'état n'est plus visible dans une
  lecture d'entrée.
- **(d) Une taxonomie « état éditorial ».** Zéro contrat touché, mais aucune règle de
  transition, aucune permission propre — un contributeur pourrait se marquer
  « approuvé ».

**Recommandation : (b).** ADR-0022 a démontré qu'un champ orthogonal se glisse dans ce
modèle sans casser les lecteurs existants, et sa règle de filtrage par défaut donne
même le gabarit : `reviewState` est ignoré par défaut, et devient un opt-in explicite
pour qui veut la file de relecture.

**Livrable de la tâche 0 : une ADR**, sur le modèle d'ADR-0022, tranchant l'option et
énonçant ce qu'on perd.

## 4. Plan de développement

### Tâche 1 — Modèle et transitions

**Fichiers** : `packages/schema/src/`, migration, `packages/api/src/rest/router.ts`.

- `reviewState` : `none` | `pending` | `changes-requested` | `approved`.
- **Table de transitions fermée**, côté serveur, avec la permission requise pour
  chacune — le même motif que la table de transitions des commandes du contrat E, qui
  a fait ses preuves : la règle vit sur le serveur, l'écran ne la duplique pas.
- Nouvelles actions REST : `POST .../submit`, `.../approve`, `.../request-changes`.
  **Pas de nouveau verbe sur un chemin existant** — la leçon d'ADR-0022, qui a mis
  `purge` en `POST` sur son propre chemin plutôt qu'en second sens de `DELETE`.
- `approved` n'est **pas** `published` : approuver autorise, publier reste l'action
  `publish`. Les confondre ferait publier par surprise.

### Tâche 2 — Assignation et permission « ses propres contenus »

**Fichiers** : `packages/schema/src/`, `PermissionLayer`, écrans.

- Champ « relecteur assigné », posé à la soumission ou choisi.
- **Permission par propriétaire** : « un auteur modifie ses propres entrées ». Le
  contrat A n'exprime pas cela ; c'est la même question ouverte que la fiche
  [19](19-roles-et-permissions.md) tâche 5, et **elle doit être tranchée dans la même
  ADR** que la tâche 0 — les deux sujets partagent le besoin.

Sans permission par propriétaire, un workflow reste incomplet : un contributeur peut
modifier l'article d'un autre pendant sa relecture.

### Tâche 3 — File de relecture

**Fichiers** : nouvelle route `packages/admin/src/routes/review.tsx`,
`shell/nav-items.ts`.

Trois onglets : à relire (assignées à moi), toutes en attente, mes soumissions.
Par ligne : titre, auteur, date de soumission, âge, collection, actions (ouvrir,
approuver, demander des modifications).

Badge de navigation avec le nombre en attente — c'est ce qui fait qu'une file est
traitée (fiche [35](35-coquille-et-navigation.md) tâche 3).

### Tâche 4 — Éditeur

**Fichiers** : `routes/entry-edit.tsx`.

Dans la barre latérale (fiche [02](02-editeur-d-entree.md)) : état du workflow,
relecteur, bouton d'action contextuel (« Soumettre à relecture » pour un contributeur,
« Approuver » / « Demander des modifications » pour un relecteur).

Le bouton « Publier » est **remplacé** par « Soumettre à relecture » pour qui n'a pas
`publish` — aujourd'hui, il n'y a tout simplement aucun bouton, ce qui est une impasse
silencieuse.

### Tâche 5 — Commentaires de relecture

**Fichiers** : nouveau modèle, route, écran.

Un fil de discussion **interne** sur l'entrée : commentaire, réponse, résolution. Le
minimum viable est un fil au niveau de l'entrée ; les commentaires ancrés sur un champ
ou un bloc sont un second temps (ils exigent des ancres stables dans le contenu, ce qui
est un vrai travail).

À ne **pas** confondre avec les commentaires de visiteurs de la fiche
[15](15-commentaires.md) : ceux-ci sont internes, ceux-là publics. Deux domaines, deux
modèles, deux écrans.

### Tâche 6 — Notifications

**Fichiers** : `@cogenta/channels` (réutilisation), fiche
[38](38-notifications-et-notices.md).

À chaque transition : notification à la personne concernée — e-mail, notice dans
l'admin, et éventuellement un canal. Regroupement pour éviter quinze messages
(`@cogenta/channels` a déjà le regroupement : « quinze constats → un seul message »).

### Tâche 7 — Verrouillage et calendrier

**Fichiers** : `routes/review.tsx`, `routes/entry-edit.tsx`.

- Verrouillage pendant relecture : la détection d'écriture concurrente de la fiche
  [02](02-editeur-d-entree.md) tâche 7 suffit dans un premier temps ; un verrou dur
  n'est justifié que si la détection ne suffit pas en pratique.
- Calendrier éditorial : vue mensuelle des dates de publication programmées et des
  échéances. Utile, non bloquant, à faire en dernier.

## 5. Critères d'acceptation

- Un contributeur soumet, un éditeur voit, approuve ou demande des modifications.
- Approuver ne publie pas.
- Toute transition est journalisée et notifiée.
- La table de transitions vit sur le serveur ; l'écran ne la duplique pas.
- Un site qui n'active pas le workflow fonctionne exactement comme avant.
- Aucun client headless écrit avant ce lot ne casse.

## 6. Tests exigés

- Bout en bout : cycle complet, quatre rôles différents.
- Permissions : chaque transition refusée pour le rôle qui n'a pas le droit — testée
  côté serveur, pas seulement à l'écran.
- Unitaires : la table de transitions refuse tout saut illégal.
- Compatibilité : un client qui lit `status` **avant** ce lot obtient exactement les
  mêmes valeurs (la propriété que l'option (b) achète — à prouver, pas à supposer).
- Intégration trois bases pour la migration.
- Passage par `contract-guardian` : le contrat A est touché.

## 7. Pièges connus

- **`ContentStatus` est une union fermée et figée.** Y ajouter une valeur casse tout
  `switch` exhaustif chez les consommateurs. C'est l'argument principal en faveur de
  l'option (b).
- **Approuvé ≠ publié.** Les fondre publie par surprise, et supprime le contrôle que
  la permission `publish` apportait.
- **Sans permission par propriétaire, le workflow est troué.** Les deux vont ensemble,
  dans la même ADR.
- **Un `DELETE` à deux sens** est ce qu'ADR-0022 a refusé. Chaque transition a son
  propre chemin en `POST`.
- **Commentaires internes et commentaires publics sont deux domaines.** Les fusionner
  finirait par publier une remarque de relecture.
- **Le workflow doit être optionnel.** Un site d'une personne n'en veut pas ; il ne
  doit rien voir.

## 8. Décisions à prendre

- **ADR de la tâche 0** : option (a), (b) — recommandée —, (c) ou (d). Plus la
  permission par propriétaire, dans la même ADR.
- Workflow activé par collection ou pour tout le site : par collection (recommandé,
  plus fin, et cohérent avec les permissions déjà déclarées par collection).
