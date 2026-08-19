# 19 — Rôles et permissions

> **État** : **absent côté admin.** Les permissions existent, sont testées, sont
> appliquées — et ne sont visibles nulle part.
> **Modèle** : contrat A — cinq actions figées
> (`read`/`create`/`update`/`delete`/`publish`), rôles en ensemble ouvert
> **Écran** : aucun (les rôles se saisissent en texte libre dans `users.tsx`)
> **Effort** : 5–7 jours
> **ADR requise** : **oui** si les permissions doivent devenir modifiables à
> l'exécution — c'est le cœur du sujet

---

## 1. Ce qui existe réellement

Le modèle est simple et solide :

- Cinq actions par collection, **figées** au contrat A.
- Un rôle est une chaîne arbitraire. Le serveur ne connaît pas de liste de rôles ; il
  connaît le bloc `permissions` de chaque collection, qui nomme des rôles.
- `PermissionLayer` a gagné `canTerm`/`assertTerm` pour les taxonomies (ADR-0022),
  sans chemin de prévisualisation — parce qu'un jeton nomme une collection et qu'un
  site peut avoir une collection `category` et une taxonomie `category`.
- Le contrat E (commerce) a **son propre vocabulaire** de permissions, parce que
  « rembourser » n'est pas un `update` (ADR-0024). L'argent qui entre et l'argent qui
  sort sont deux permissions distinctes.
- Côté admin, `schema/permissions.ts` reproduit la règle pour masquer les boutons —
  politesse, jamais le contrôle (R4).
- `users.tsx` propose quatre rôles conventionnels et accepte n'importe quelle chaîne.

**Ce qui manque** : aucun écran ne dit ce qu'un rôle peut faire. Un admin qui coche
« contributor » ne sait pas ce qu'il vient d'accorder, et ne peut le découvrir qu'en
lisant `cogenta.schema.*`.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Rôles prédéfinis | ✅ | ✅ | ✅ | convention seulement |
| **Voir ce qu'un rôle peut faire** | plugin | ✅ | ✅ | ❌ |
| Modifier les permissions d'un rôle | plugin | ✅ | ✅ | ❌ (fichier) |
| Créer un rôle | plugin | ✅ | ✅ | ✅ (chaîne libre) |
| Permission par type de contenu | ✅ | ✅ | ✅ | ✅ (déclarée) |
| Permission par entrée (propriétaire) | ✅ (`edit_own_posts`) | partiel | ✅ | ❌ |
| Matrice rôles × permissions | plugin | ✅ | ✅ | ❌ |
| Permissions d'API séparées | ❌ | ✅ | ❌ | ✅ (clés d'API à portées) |

## 3. Le point dur : ADR-0010

Modifier les permissions à l'exécution veut dire écrire dans `cogenta.schema.*` — ou
créer une seconde source de vérité. C'est **exactement** le mur que L19 a rencontré et
tranché : proposer et relire partout, **appliquer seulement sous `cogenta dev`**.

Trois issues possibles, et il faut choisir avant de coder :

- **(a) Lecture seule, entièrement.** Une matrice qui montre, pour chaque collection et
  chaque action, quels rôles sont autorisés. Zéro écriture, zéro contradiction avec
  ADR-0010, et cela **résout déjà 80 % du problème réel** — le problème est qu'on ne
  voit rien, pas qu'on ne peut pas modifier.
- **(b) Lecture seule en production, écriture en développement**, comme L19. Cohérent
  avec un précédent acté, mais un site en production reste dépendant d'un déploiement
  pour changer un droit.
- **(c) Les permissions deviennent une donnée de site**, en base, surchargeant le
  fichier. Utilisable partout — mais c'est un changement de modèle de sécurité majeur :
  la source de vérité des droits ne serait plus versionnée, plus revue en PR, plus
  déployée avec le code. Sur un CMS dont l'argument est qu'un site s'exploite
  lui-même **en rendant des comptes**, c'est un vrai renoncement.

**Recommandation : (a) d'abord, sans discussion** — c'est utile, sans risque et sans
ADR. Puis (b) si le besoin persiste. **(c) ne se décide pas sans ADR explicite** qui
nomme ce qu'on perd.

## 4. Plan de développement

### Tâche 1 — Matrice des permissions, en lecture

**Fichiers** : nouvelle route `packages/admin/src/routes/roles.tsx`,
`shell/nav-items.ts`, `packages/api` (`/api/schema` porte déjà les permissions).

Un tableau : lignes = collections (et taxonomies), colonnes = les cinq actions,
cellules = les rôles autorisés. Un second onglet inversé : lignes = rôles, colonnes =
collections — parce que la question posée est aussi souvent « que peut faire un
éditeur ? » que « qui peut publier des articles ? ».

Y ajouter, comme sections distinctes et clairement séparées, parce que ce sont des
vocabulaires différents et que les confondre serait faux :

- les permissions du **contrat E** (commerce), avec leur propre vocabulaire ;
- les portées des **clés d'API** (fiche [20](20-cles-api.md)) ;
- les **capacités de plugins** accordées (`plugins/granted-permissions.tsx` existe
  déjà — y renvoyer, ne pas le dupliquer).

**Critère** : répondre en dix secondes à « qui peut supprimer un produit ? » sans
ouvrir un fichier.

### Tâche 2 — Explication au point d'usage

**Fichiers** : `routes/users.tsx`, `routes/roles.tsx`.

Dans la boîte de dialogue de changement de rôle, un résumé en langue naturelle de ce
que chaque rôle coché accorde réellement **sur ce site** — calculé à partir du schéma,
jamais une description générique codée en dur, qui mentirait sur un site dont les
permissions sont personnalisées.

Signaler un rôle attribué à un compte mais **nommé par aucune collection** : il
n'accorde rien, et c'est probablement une faute de frappe. C'est un vrai bug
silencieux que l'écran actuel ne peut pas détecter.

**Critère** : cocher « contributor » affiche la liste exacte de ce que cela autorise ;
taper « editeur » au lieu d'« editor » provoque un avertissement.

### Tâche 3 — Diagnostic de cohérence

**Fichiers** : `routes/roles.tsx`, `packages/api`.

Une section « anomalies », qui est la partie la plus utile :

- collection sans aucun rôle en lecture (invisible pour tout le monde) ;
- collection ouverte à `public` en écriture (**alerte forte**) ;
- rôle utilisé par un compte mais inconnu du schéma ;
- rôle nommé par le schéma mais porté par aucun compte ;
- collection routée mais fermée à `public` en lecture — c'est exactement le cas qui
  faisait répondre 500 à `/sitemap.xml` avant le correctif L10.

**Critère** : le diagnostic aurait attrapé le bug de sitemap de L10 avant qu'il ne
soit trouvé en branchant.

### Tâche 4 — Écriture (seulement si (b) ou (c) est retenu)

**Fichiers** : selon la décision.

Si **(b)** : réutiliser tel quel le mécanisme de L19 —
`RunServeOptions.development`, refus `CONTENT_READ_ONLY` avec la marche à suivre en
production, et une prévisualisation du diff avant écriture du fichier.

Si **(c)** : ADR obligatoire, plus un journal d'audit exhaustif de tout changement de
permission, plus une possibilité d'export vers le fichier pour figer l'état dans le
dépôt.

Dans les deux cas : **aucun changement de permission ne s'applique sans confirmation
explicite**, et chacun produit une entrée d'audit.

### Tâche 5 — Permission par propriétaire

**ADR requise.** « Un auteur modifie ses propres articles, pas ceux des autres » est
la permission la plus demandée après les cinq actions. Le contrat A ne l'exprime pas :
ses actions sont par collection, pas par entrée.

Deux façons :

- une convention de rôle (`author:own`) interprétée par `PermissionLayer` ;
- une clause `own: true` dans le bloc `permissions` du contrat A → montée de version.

À traiter avec la fiche [37](37-workflow-editorial.md), qui en a le même besoin. Ne
pas l'improviser ici.

## 5. Critères d'acceptation

- On voit, sans ouvrir un fichier, ce que chaque rôle peut faire.
- Une anomalie de permission est signalée avant qu'elle ne produise un incident.
- Aucune écriture de permission n'est possible sans que la décision (a)/(b)/(c) ait
  été actée.
- L'écran n'invente aucune permission : il rend ce que le schéma déclare.
- Le vocabulaire du contrat E reste distinct de celui du contrat A à l'écran.

## 6. Tests exigés

- Unitaires : construction de la matrice à partir d'un schéma réel, avec rôles
  personnalisés, collections sans permissions déclarées, et taxonomies.
- Unitaires : chaque règle de diagnostic, y compris le cas du sitemap de L10.
- Composant : `admin` seulement.
- Si écriture : bout en bout, refus en production avec le bon code d'erreur, écriture
  en développement, entrée d'audit produite.

## 7. Pièges connus

- **Un écran de permissions qui ment est pire que pas d'écran.** Il doit lire le
  schéma servi, jamais une description figée dans l'admin.
- **Les rôles sont un ensemble ouvert, exprès.** Ne pas transformer la convention des
  quatre rôles en contrainte : le commentaire de `users.tsx` le dit clairement, et
  c'est ce qui permet à un site d'avoir un rôle `redacteur-invite`.
- **Trois vocabulaires coexistent** : contrat A (cinq actions), contrat E (commerce),
  capacités de plugins. Les mélanger dans une seule matrice produirait un écran faux.
- **(c) déplace la sécurité hors du dépôt.** C'est un renoncement à nommer
  explicitement dans une ADR, pas un détail d'implémentation.
- **La permission par propriétaire est un changement de modèle**, pas un ajout d'écran.

## 8. Décisions à prendre

- **(a), (b) ou (c)** — à trancher avant la tâche 4. (a) est livrable immédiatement et
  n'engage rien.
- Permission par propriétaire : ADR conjointe avec la fiche 37.
