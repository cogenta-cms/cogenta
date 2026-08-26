# 63 — Rôles et permissions personnalisés

> **État** : la matrice de lecture (fiche 19, tâches 1-3) est déjà livrée —
> diagnostics d'anomalies compris. Créer un rôle « custom » comme simple **nom**
> est déjà trivial et sans risque (champ libre). Le vrai sujet — lui donner un
> **pouvoir réel** — exige d'écrire dans `cogenta.schema.*`, exactement ce
> qu'ADR-0010 réserve au mode développement. **Décision structurante à trancher
> avant tout code.**
> **Fichiers** : `packages/admin/src/routes/roles.tsx`,
> `packages/admin/src/schema/permissions.ts`
> **Effort** : 0,5 j (décision + ADR si (c)) + 3–5 j (option b) ou 5–7 j (option c)
> **ADR requise** : **oui, si l'option (c) est retenue** ; non pour (b)

---

## 1. Ce qui existe réellement

Matrice lecture seule par collection et par rôle, section commerce séparée, lien
vers les capacités de plugins, diagnostics d'anomalies (collection illisible,
écriture publique, rôle inconnu utilisé, rôle déclaré mais inutilisé). C'est
strictement l'option (a) déjà recommandée par la fiche 19 — l'écran est en
**lecture seule**, aucune écriture de permission n'existe.

**Point technique central, vérifié** : un rôle **n'est ni un enum TypeScript
fermé, ni une table en base** — une chaîne libre, extraite dynamiquement du bloc
`permissions` de chaque collection/taxonomie (code, versionné, ADR-0010) et du
tableau `roles` de chaque compte (donnée). Aucun `switch` exhaustif sur un nom de
rôle n'a été trouvé dans le code métier — **le risque de régression par `switch`
exhaustif est donc faible** (contrairement à ce que redoutait `ContentStatus`,
qu'ADR-0027 a justement évité pour cette raison). Créer un rôle au sens de « lui
assigner un nom » est déjà trivial.

Le vrai problème : donner un pouvoir réel à ce nom (quelles collections, quelles
actions) suppose d'écrire dans `cogenta.schema.*`, réservé au mode développement
par ADR-0010 — tâche 4 de la fiche 19, **délibérément non construite**.

## 2. Plan de développement

**Tâche 1 — Décision, préalable à tout code** :
- **(b)** Réutiliser tel quel le mécanisme de L19 (`RunServeOptions.development`,
  `CONTENT_READ_ONLY` en production, diff prévisualisé avant écriture du fichier de
  schéma) — cohérent avec ADR-0010, mais un changement de droit en production reste
  dépendant d'un déploiement.
- **(c)** Faire des permissions une donnée de site en base, surchargeant le
  fichier — utilisable en production, mais change le modèle de sécurité (la source
  de vérité des droits ne serait plus versionnée en git) — **ADR obligatoire**,
  nommant explicitement ce renoncement.
- **Recommandation : (b) d'abord.**

**Tâche 2** *(si (b))* — Écran d'édition dans `roles.tsx`, même porte que L19
(diff, confirmation, entrée d'audit systématique — aucun changement de permission
sans confirmation explicite).

**Tâche 3** *(si (c))* — ADR + table `role_permissions` (site-scopée) +
`PermissionLayer` lit la table en priorité, retombe sur le fichier sinon (jamais
l'inverse, pour ne pas masquer une régression de déploiement) + export vers fichier
pour figer l'état dans le dépôt.

**Tâche 4** *(les deux options)* — La création d'un rôle avec permissions passe
par la même validation que `defineCollection`/`validateCollectionSet` déjà
utilisée par L19, pour ne pas dupliquer une seconde logique de validation.

## 3. Critères d'acceptation

- Créer un rôle personnalisé et lui attribuer des permissions ne contourne jamais
  `PermissionLayer` — celui-ci reste l'unique point de vérification serveur.
- Chaque changement de permission est confirmé explicitement et journalisé.
- (b) : refusé en production, appliqué en développement seulement, avec message
  clair. (c) : la table prime sur le fichier, jamais l'inverse.

## 4. Tests exigés

- R4 : chaque route d'écriture de permission testée par rôle.
- (b) : test « refus en production, écriture en développement ».
- (c) : test de priorité table/fichier, et export vers fichier round-trip.
- Contrat : validation d'un rôle personnalisé via le même chemin que
  `validateCollectionSet`.

## 5. Pièges connus

- Ne pas créer de second mécanisme de contrôle d'accès parallèle à
  `PermissionLayer` — R4 reste non négociable.
- (c) déplace la source de vérité des droits hors de git — à nommer sans
  euphémisme dans l'ADR si retenue.

## 6. Décisions à prendre

Tâche 1 — (b) vs (c), avant tout autre travail de cette fiche. `contract-guardian`
à consulter avant fusion dans les deux cas (le bloc `permissions` du contrat A est
concerné si (c) est retenue).

**Tranchée le 2026-08-26, en direct avec l'utilisateur : option (c).** Un
changement de permission doit être applicable en production sans cycle de
déploiement — c'est le besoin réel qui motive la fiche. **ADR-0028 rédigée
(« Les permissions de rôle personnalisé vivent en base, en surcouche du fichier
de schéma »), remise à l'humain pour insertion dans `docs/03-decisions.md`**
(fichier protégé en écriture par un hook). Renoncement assumé, nommé dans
l'ADR : la source de vérité des droits d'un site n'est plus purement versionnée
en git — exactement le risque qu'ADR-0010 nommait pour le schéma, accepté ici
uniquement pour les permissions, pas pour la structure du contenu. La tâche 3
(table `role_permissions`, priorité table > fichier, jamais l'inverse, export
vers fichier pour figer l'état dans le dépôt) devient la tâche à coder ; la
tâche 2 (option b) est abandonnée.
