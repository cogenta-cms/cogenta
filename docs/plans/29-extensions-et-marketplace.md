# 29 — Extensions et marketplace

> **État** : bon — l'écran est récent et respecte des règles fortes. Il manque la
> gestion du parc installé.
> **Écrans** : `packages/admin/src/routes/marketplace.tsx` (508 lignes),
> `plugins/permission-review.tsx`, `plugins/granted-permissions.tsx`
> **Paquets** : `@cogenta/plugins` (worker isolé à deux couches, signature Ed25519,
> capacités), `packages/api/src/rest/marketplace-router.ts`
> **Effort** : 3–4 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Le socle est l'un des plus solides du projet (L7, 14 tâches) :

- **Isolation à deux couches** : `worker_threads` + `vm`, prouvée contre quatre
  vecteurs d'évasion.
- **SDK construit dynamiquement selon les capacités accordées**, avec la propriété
  « absente, pas refusée » — un plugin sans la capacité `http.fetch` ne voit pas la
  fonction, il ne reçoit pas une erreur.
- **Pas d'auto-octroi à la mise à jour** : une version qui demande plus exige une
  approbation.
- **Signature Ed25519 réelle**, sans échappatoire, obligatoire pour un plugin de
  registre.
- **Limites de temps et de mémoire**, avec désactivation et alerte.
- Écran de permissions **en langage clair**, sans identifiant technique brut.
- L'écran marketplace tient trois règles explicites : ce qui s'installe est du vrai
  code, un refus de signature est montré comme un refus de signature (jamais fondu
  dans une erreur générique), et une mise à jour qui élargit les permissions passe par
  une confirmation dédiée.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Strapi 5 | Cogenta |
|---|---|---|---|---|
| Découverte / recherche | ✅ | ✅ | ✅ | ✅ |
| Installation | ✅ | ✅ (composer) | ✅ (npm) | ✅ |
| **Liste des extensions installées** | ✅ | ✅ | ✅ | ❌ |
| Activer / désactiver | ✅ | ✅ | ❌ | partiel |
| Désinstaller | ✅ | ✅ | ✅ | ? |
| Mises à jour disponibles | ✅ | ✅ | ✅ | partiel |
| Mise à jour automatique | ✅ | ❌ | ❌ | ❌ |
| Écran de permissions avant installation | ❌ | ❌ | ❌ | ✅ **unique** |
| Signature obligatoire | ❌ | ❌ | ❌ | ✅ **unique** |
| Isolation d'exécution | ❌ | ❌ | ❌ | ✅ **unique** |
| Journal d'activité d'une extension | ❌ | ✅ | ❌ | ❌ |
| Compatibilité annoncée | ✅ | ✅ | ✅ | ? |

Trois lignes marquées « unique » : sur la sécurité des extensions, Cogenta est
nettement au-dessus de l'état de l'art de son marché. Le manque est ailleurs — dans la
gestion ordinaire du parc installé.

## 3. Écarts, classés

### Importants

1. **Pas d'écran « extensions installées ».** L'écran actuel est un catalogue ; il n'y
   a pas de vue « ce qui tourne chez moi », qui est l'écran le plus consulté sur
   WordPress.
2. **Pas de mise à jour groupée** ni de signalement clair « 3 extensions à mettre à
   jour ».
3. **Pas de journal par extension.** L'isolation compte le temps et la mémoire
   (L7 tâche 6) ; ces chiffres devraient être visibles — c'est ce qui permet de
   repérer l'extension qui ralentit le site.
4. **Pas de vue des désactivations automatiques.** Une extension coupée pour
   dépassement de ressources doit être visible avec la raison, sinon elle est
   simplement « cassée ».

### Confort

5. Pas de compatibilité de version annoncée avant installation.
6. Pas de galerie de skins dans l'admin — elle existe côté `@cogenta/plugins` (L7
   tâche 10) et relève de la fiche [14](14-apparence-et-theme.md).
7. Pas de désinstallation avec nettoyage des données.

## 4. Plan de développement

### Tâche 1 — Écran « Extensions installées »

**Fichiers** : `routes/marketplace.tsx` (onglets), ou nouvelle route.

Deux onglets : **Installées** (par défaut) et **Découvrir**. Pour chaque extension
installée : nom, version, auteur, état (active / désactivée / **désactivée
automatiquement, avec la raison**), capacités accordées (réutiliser
`granted-permissions.tsx`, ne pas le dupliquer), mise à jour disponible, et les actions
— activer, désactiver, mettre à jour, revoir les permissions, désinstaller.

**Critère** : savoir en un écran ce qui tourne, dans quelle version, avec quels droits.

### Tâche 2 — Mises à jour

**Fichiers** : `marketplace-router.ts`, écran, fiche
[38](38-notifications-et-notices.md).

- Signal « N mises à jour disponibles » dans la navigation et en notice.
- Mise à jour groupée — **sauf** celles qui élargissent les permissions, qui restent
  une par une avec leur confirmation dédiée. C'est la règle d'auto-octroi de L7 : elle
  ne doit pas se diluer dans un bouton « tout mettre à jour ».
- Notes de version affichées avant la mise à jour.
- `@cogenta/plugins` a déjà un comparateur semver (réutilisé par `@cogenta/fleet` pour
  la dérive de version) : s'en servir, ne pas en écrire un second.

### Tâche 3 — Consommation de ressources

**Fichiers** : `@cogenta/plugins` (`PluginDisableStore` et les limites existent),
écran.

Par extension : temps d'exécution cumulé, mémoire maximale observée, nombre d'appels,
erreurs récentes, dépassements. Signal sur celle qui consomme le plus.

Ces données sont déjà mesurées par le mécanisme de limites ; il s'agit de les exposer,
pas de les créer.

### Tâche 4 — Désinstallation propre

**Fichiers** : `marketplace-router.ts`, écran.

Désinstaller doit dire ce qui reste : données créées par l'extension, capacités
révoquées, contenu qui la référence encore. Deux options offertes : conserver les
données (réinstallation possible) ou tout supprimer (irréversible, confirmation
forte).

### Tâche 5 — Compatibilité et confiance

**Fichiers** : manifeste de plugin (existe : `PLUGIN_MANIFEST_INVALID` et compagnie),
écran.

- Version de Cogenta requise, vérifiée **avant** l'installation, avec un refus clair
  plutôt qu'une erreur d'exécution.
- Auteur, source, état de la signature, date de la dernière mise à jour.
- Un lien vers `docs/guide-plugin.md` et le modèle de démarrage
  (`examples/plugin-starter/`) — les deux existent et sont testés, et personne ne les
  trouve depuis l'admin.

## 5. Critères d'acceptation

- On voit ce qui est installé, actif, à jour, et ce que chaque extension peut faire.
- Une mise à jour qui élargit les permissions ne s'applique jamais en lot.
- Une extension désactivée automatiquement affiche la raison.
- La désinstallation dit ce qu'elle laisse derrière elle.
- Aucune régression sur les propriétés de sécurité de L7 (isolation, signature,
  non-auto-octroi).

## 6. Tests exigés

- Bout en bout : installation, mise à jour élargissant les permissions refusée en lot,
  acceptée individuellement.
- Sécurité : rejouer les quatre vecteurs d'évasion de L7 après toute modification du
  chargement.
- Sécurité : `PLUGIN_SIGNATURE_MISSING` / `PLUGIN_SIGNATURE_INVALID` restent des
  refus explicites, jamais fondus dans une erreur générique (test de non-régression).
- Unitaires : comparaison de versions, refus d'incompatibilité.
- Permissions : `admin` seulement.
- Passage par `security-reviewer` : obligatoire, c'est de l'exécution de code tiers.

## 7. Pièges connus

- **La mise à jour groupée est le vecteur d'élargissement silencieux de permissions.**
  C'est le piège central de cette fiche, et il annulerait une propriété que L7 a
  construite exprès.
- **`CogentaError.details` n'est jamais envoyé au client** — l'écran affiche donc
  l'ensemble des capacités de la nouvelle version, pas un delta exact. C'est
  volontaire ; ne pas « corriger » en exposant `details`.
- **Une extension désactivée automatiquement doit rester visible**, sinon elle est
  indiscernable d'un bug du CMS.
- **Le compteur de ressources ne doit pas coûter plus cher que ce qu'il mesure.**
  Agréger.
- **`docs/guide-plugin.md` et `examples/plugin-starter/` existent** et sont testés.
  Les rendre atteignables coûte un lien.

## 8. Décisions à prendre

- Mise à jour automatique : à écarter par défaut. Sur un CMS qui exécute du code tiers
  isolé mais réel, la mise à jour automatique est une exécution de code non revue.
- Désinstallation : conserver les données par défaut (recommandé).
