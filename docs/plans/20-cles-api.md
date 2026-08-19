# 20 — Clés d'API

> **État** : bon — création, portées, révocation, dernière utilisation. Il manque le
> cycle de vie et la traçabilité.
> **Écran** : `packages/admin/src/routes/api-keys.tsx` (246 lignes)
> **API existante** : `packages/api/src/rest/api-keys-router.ts`
> **Effort** : 2–3 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Et c'est bien fait :

- Liste des clés avec nom, préfixe, portées, création, dernière utilisation, statut
  (active / expirée / révoquée).
- Création avec nom et portées ; la clé brute est renvoyée **une seule fois** par le
  serveur, tenue dans un unique état local, et effacée dès que sa notice est fermée.
  `listApiKeys` ne renvoie jamais la clé — seulement le préfixe. Il n'existe donc
  aucun chemin de code qui pourrait la montrer deux fois.
- Révocation, avec confirmation.
- `admin` seulement.
- Le modèle porte déjà `expiresAt` — l'écran calcule l'expiration mais ne permet pas de
  la **fixer** à la création.

## 2. Ce que font les CMS de référence

| Fonction | Strapi 5 | Contentful | Sanity | Cogenta |
|---|---|---|---|---|
| Créer une clé à portées | ✅ | ✅ | ✅ | ✅ |
| Clé affichée une seule fois | ✅ | ✅ | ✅ | ✅ |
| Révoquer | ✅ | ✅ | ✅ | ✅ |
| Dernière utilisation | ✅ | ✅ | ❌ | ✅ |
| **Date d'expiration au choix** | ✅ | ✅ | ❌ | ❌ |
| **Rotation** (nouvelle clé, ancienne en sursis) | ❌ | ✅ | ✅ | ❌ |
| Restriction par IP / origine | ❌ | ✅ | ❌ | ❌ |
| Journal d'usage par clé | partiel | ✅ | ❌ | ❌ (dernière utilisation) |
| Limitation de débit par clé | ❌ | ✅ | ✅ | ❌ |
| Alerte sur clé inutilisée | ❌ | ❌ | ❌ | ❌ |

## 3. Écarts, classés

### Importants

1. **Pas d'expiration choisie à la création.** Le modèle a `expiresAt` ; l'écran ne
   l'expose pas. Une clé sans expiration est une clé éternelle, et c'est le défaut le
   plus courant des fuites de secrets.
2. **Pas de rotation.** Remplacer une clé en service impose de créer la nouvelle,
   déployer, puis révoquer — trois étapes manuelles, avec une fenêtre d'indisponibilité
   si l'ordre est mauvais. Une rotation propre crée la nouvelle et laisse l'ancienne
   valide pendant N heures.
3. **Pas de limitation de débit par clé.** Une clé compromise peut lire l'intégralité
   du contenu aussi vite que le serveur le permet.

### Confort

4. Pas de journal d'usage par clé (quelles routes, combien d'appels).
5. Pas de restriction d'origine.
6. Pas de signal sur une clé jamais utilisée depuis N jours — souvent le signe d'une
   intégration morte qu'on a oublié de révoquer.
7. `globalThis.confirm()` pour la révocation, incohérent avec le design system.

## 4. Plan de développement

### Tâche 1 — Expiration

**Fichiers** : `routes/api-keys.tsx`, `api-keys-router.ts`.

Choix à la création : 30 jours / 90 jours / 1 an / sans expiration. **Par défaut :
90 jours** — un défaut sûr vaut mieux qu'un champ vide qu'on ne remplit jamais.
« Sans expiration » reste possible, avec un avertissement.

Affichage du délai restant, et une notice (fiche
[38](38-notifications-et-notices.md)) quand une clé expire dans moins de sept jours —
une clé qui expire sans prévenir casse une intégration en production.

**Critère** : créer une clé à 90 jours, voir « expire dans 90 jours », et recevoir une
notice au septième jour restant.

### Tâche 2 — Rotation

**Fichiers** : `api-keys-router.ts`, `routes/api-keys.tsx`.

« Faire tourner cette clé » : produit une nouvelle valeur, affichée une fois, et
laisse l'ancienne valide pendant une période choisie (1 h / 24 h / 7 j). Les deux
apparaissent dans la liste, l'ancienne marquée « en sursis jusqu'à … ».

La rotation conserve **le nom et les portées** : c'est la même intégration, pas une
nouvelle.

**Critère** : faire tourner une clé sans aucune interruption de service, puis voir
l'ancienne expirer d'elle-même.

### Tâche 3 — Limitation de débit

**Fichiers** : `api-keys-router.ts` ou la couche d'accès de `@cogenta/api`.

Quota configurable par clé (requêtes par minute), avec en-têtes standards
`RateLimit-*` et un `429` propre portant `Retry-After`.

**R1** : le compteur doit fonctionner **sans Redis**. Un compteur en mémoire de
processus suffit pour un site mono-processus ; le driver Redis, quand il existe, sert
le cas multi-processus. C'est exactement le motif interface + deux implémentations que
le projet applique partout (skill `new-driver`).

**Critère** : dépasser le quota renvoie 429 avec `Retry-After`, sur un site sans Redis.

### Tâche 4 — Usage et hygiène

**Fichiers** : `api-keys-router.ts`, `routes/api-keys.tsx`.

- Compteur d'appels sur 7 et 30 jours, par clé. Agrégé, pas un journal ligne à ligne
  (le volume serait absurde) — le journal d'audit reste le lieu des événements
  sensibles.
- Signal « jamais utilisée » et « inutilisée depuis 90 jours », avec un bouton
  révoquer à côté.
- Modale du design system au lieu de `confirm()`.
- Entrée d'audit à chaque création, rotation et révocation — vérifier que c'est déjà
  le cas ; si non, c'est le correctif le plus important de cette fiche.

### Tâche 5 — Portées lisibles

**Fichiers** : `routes/api-keys.tsx`, fiche [19](19-roles-et-permissions.md).

Les portées sont affichées telles quelles (`key.scope.join(', ')`). Les rendre en
langue naturelle, avec le détail exact au survol, et un avertissement quand une portée
donne un accès en écriture. Réutiliser la matrice de la fiche 19 pour dire ce qu'une
portée permet réellement sur ce site.

## 5. Critères d'acceptation

- Une clé neuve a une expiration par défaut.
- Une clé se remplace sans interruption.
- Une clé compromise ne peut pas aspirer le site aussi vite que le réseau le permet.
- La limitation fonctionne sans Redis (R1).
- Chaque événement de cycle de vie est dans le journal d'audit.
- La clé brute reste affichée exactement une fois — propriété actuelle, à ne surtout
  pas régresser.

## 6. Tests exigés

- Bout en bout : rotation avec période de sursis — les deux clés fonctionnent, puis
  l'ancienne cesse.
- Bout en bout : dépassement de quota → 429 + `Retry-After`, avec le driver dégradé
  (mémoire) **et** l'optimal (Redis) — suite de contrat unique, comme pour tout driver.
- Unitaires : une clé expirée est refusée, même non révoquée.
- Sécurité : `listApiKeys` ne renvoie jamais la valeur brute (test de
  non-régression explicite).
- Permissions : `admin` seulement sur toutes les routes.

## 7. Pièges connus

- **La propriété « affichée une fois » est fragile.** Toute nouvelle route qui
  renverrait la clé, tout état ajouté qui la conserverait, la casse. Le commentaire du
  fichier explique précisément pourquoi il n'y a qu'un seul état ; le lire avant de
  toucher.
- **La rotation crée une fenêtre à deux clés valides.** Elle doit être bornée et
  visible, sinon c'est une clé de plus qu'on oublie.
- **La limitation par clé ne remplace pas celle par IP** sur les routes publiques
  (fiches [15](15-commentaires.md) et [16](16-formulaires.md)) : une clé est
  authentifiée, un commentaire ne l'est pas.
- **Le compteur d'appels ne doit pas devenir un journal.** Agréger, pas empiler.
- **Une expiration par défaut change le comportement** pour tout script qui crée des
  clés. Changement cassant à signaler dans le changeset.

## 8. Décisions à prendre

- Expiration par défaut : 90 jours (recommandé) ou sans expiration pour préserver la
  compatibilité. Recommandation : 90 jours, avec la note de rupture.
- Quota par défaut : une valeur généreuse mais réelle (par exemple 600 req/min), plutôt
  que « illimité par défaut » qui ne protège personne.
