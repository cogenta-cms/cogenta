# 35 — Coquille et navigation

> **État** : partiel — 23 entrées de navigation à plat, sans regroupement ni
> permissions.
> **Écrans** : `packages/admin/src/shell/app-shell.tsx` (123 lignes),
> `shell/nav-items.ts` (41), `shell/theme-toggle.tsx`,
> `styles/shell.css`, `styles/theme.css`
> **Effort** : 3–4 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- Une coquille en grille CSS : barre supérieure, barre latérale, `<main>`, pied de
  page, plus un lien d'évitement — présent pour une raison écrite dans le fichier : un
  utilisateur clavier voyant ne doit pas traverser toute la barre latérale à chaque
  navigation.
- Navigation pilotée par les données (`NAV_ITEMS`), avec des icônes par route et des
  libellés traduits (ADR-0019).
- Recherche globale dans la barre supérieure.
- Bascule de thème clair/sombre.
- Palette refaite (papier chaud en clair, presque noir en sombre, accent orange brûlé),
  avec IBM Plex Mono et Sans auto-hébergés.
- Le tableau de notices est monté au-dessus de la page routée, jamais en modale ni en
  garde de route.

## 2. Le problème principal

**`NAV_ITEMS` contient 23 entrées, à plat, dans un ordre qui mélange tout** : contenu,
commerce, IA, exploitation, comptes. Et son propre commentaire annonce un filtrage par
permission « quand les permissions arriveront » — elles sont arrivées, le filtrage
non.

Conséquences concrètes :

- un contributeur voit « Clés d'API », « Journal d'audit », « Marketplace » et sept
  écrans commerce, dont aucun ne lui répondra autre chose qu'un refus ;
- une boutique inactive affiche quand même quatre entrées commerce ;
- l'ordre ne raconte rien : « Corbeille » entre « Redirections » et « Assistant ».

## 3. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Menu groupé par domaine | ✅ | ✅ | ✅ | ❌ (plat) |
| Sous-menus | ✅ | ✅ | ✅ | ❌ |
| **Masqué selon les permissions** | ✅ | ✅ | ✅ | ❌ |
| Masqué selon les fonctionnalités actives | ✅ | ✅ | ✅ | ❌ |
| Barre latérale repliable | ✅ | ✅ | ✅ | ❌ |
| Barre d'administration sur le site public | ✅ | ❌ | ✅ | ❌ |
| Fil d'Ariane | partiel | ✅ | ✅ | ❌ |
| Compteurs (en attente, à modérer) | ✅ | ❌ | ✅ | ❌ |
| Favoris / épinglés | ✅ | ❌ | ✅ | ❌ |
| Palette de commandes (`⌘K`) | ❌ | ❌ | ❌ | partiel (recherche) |
| Thème clair/sombre | ✅ | ✅ | ✅ | ✅ |

## 4. Plan de développement

### Tâche 1 — Regrouper et filtrer

**Fichiers** : `shell/nav-items.ts`, `shell/app-shell.tsx`.

Groupes, avec un ordre qui suit la fréquence d'usage :

| Groupe | Entrées |
|---|---|
| **Contenu** | Tableau de bord, Collections, Médias, Taxonomies, Menus, Corbeille |
| **Apparence** | Thème, Page builder (via une entrée), Redirections |
| **Boutique** | Produits, Commandes, Clients, Coupons, Abonnements, Réglages boutique |
| **IA** | Assistant, Plan de site, Agents |
| **Comptes** | Utilisateurs, Rôles, Clés d'API |
| **Exploitation** | Santé, Outils, Analytics, Journal, Tâches, Import/Export, Extensions |
| **Réglages** | Réglages du site, Mon profil |

Chaque entrée déclare **la condition de son affichage** :

- une permission (`admin`, ou `canPerform` sur une collection) ;
- une fonctionnalité active (un site sans produit ne montre pas le groupe Boutique) ;
- une capacité présente (pas de fournisseur IA → le groupe IA se réduit à la page
  d'explication de la fiche [30](30-agents-et-assistant-ia.md)).

**R4 rappelé** : masquer est une politesse, le serveur reste le contrôle. Mais une
politesse qui divise par deux la surface visible d'un contributeur est un vrai gain.

**Critère** : un compte `author` voit six entrées, pas vingt-trois.

### Tâche 2 — Barre latérale repliable et responsive

**Fichiers** : `shell/app-shell.tsx`, `styles/shell.css`.

Repli en mode icônes seules, mémorisé en `localStorage`, avec une info-bulle au
survol et le nom complet accessible. Sous 768 px, un tiroir qui s'ouvre depuis la barre
supérieure, avec piège de focus et fermeture à `Échap`.

### Tâche 3 — Compteurs et badges

**Fichiers** : `shell/app-shell.tsx`, routes concernées.

Compteurs sur : Corbeille (éléments), Commandes (à traiter), Commentaires (en attente,
fiche [15](15-commentaires.md)), Formulaires (non lus, fiche
[16](16-formulaires.md)), Extensions (mises à jour), Tâches (en échec).

**Une seule requête agrégée** au chargement de la coquille, pas une par badge. Sinon
chaque navigation déclenche dix appels.

### Tâche 4 — Fil d'Ariane et titre de page

**Fichiers** : `shell/app-shell.tsx`, chaque route.

Fil d'Ariane dans la barre supérieure (`Collections › Articles › Mon titre`), et
`document.title` mis à jour à chaque navigation — aujourd'hui, tous les onglets de
l'admin s'appellent pareil, ce qui rend cinq onglets ouverts indistinguables.

### Tâche 5 — Palette de commandes

**Fichiers** : `shell/global-search.tsx` (extension).

`⌘K` / `Ctrl+K` ouvre la recherche existante, enrichie d'actions : « aller à … »,
« créer un … », « basculer le thème », « se déconnecter ». La recherche de contenu
reste ce qu'elle est ; les actions s'ajoutent au-dessus.

### Tâche 6 — Barre d'administration sur le site public

**Fichiers** : `packages/cli/src/commands/theme-render.ts`.

Pour un visiteur **authentifié**, une barre fine en haut de la page publique :
« Modifier cette page », « Nouveau », lien vers l'admin. C'est le raccourci le plus
utilisé de WordPress.

Trois précautions : elle ne s'affiche que sur session authentifiée ; sa présence rend
la réponse `private, no-store` (la règle posée en L10 pour toute requête portant des
identifiants — sinon un cache partagé sert la barre à un anonyme) ; et elle n'ajoute
aucun script sur une page servie à un anonyme.

## 5. Critères d'acceptation

- La navigation ne montre que ce que l'acteur peut atteindre.
- Un site sans boutique n'a pas de groupe Boutique.
- Cinq onglets d'admin ouverts sont distinguables par leur titre.
- Les badges coûtent une requête, pas dix.
- Le lien d'évitement et la navigation clavier restent corrects (comportement actuel,
  documenté — ne pas régresser).
- La barre publique n'apparaît jamais pour un anonyme et ne casse pas le cache.

## 6. Tests exigés

- Composant : navigation rendue pour `admin`, `editor`, `author`, `viewer` —
  quatre instantanés attendus différents.
- Composant : groupe Boutique absent sans commerce actif.
- Accessibilité : axe-core sur la coquille, tiroir mobile compris ; piège de focus et
  `Échap`.
- Bout en bout : page publique servie à un anonyme — pas de barre, cache public
  inchangé ; servie à un authentifié — barre présente, `private, no-store`.

## 7. Pièges connus

- **Masquer n'est pas sécuriser** (R4). Le filtrage de navigation ne remplace aucune
  vérification serveur.
- **Un badge par entrée = N requêtes par navigation.** Agréger.
- **Le lien d'évitement existe pour une raison écrite** dans `app-shell.tsx`. Une
  refonte qui l'oublierait dégraderait l'accessibilité de chaque page.
- **La barre publique casse le cache** si elle est rendue sans passer la réponse en
  `private, no-store` — le constat « moyen » de la revue de sécurité L10, à ne pas
  reproduire.
- **Le thème est stocké côté client.** Une bascule qui déclencherait un appel serveur à
  chaque changement serait une régression.
- **`NAV_ITEMS` est un constant de module**, hors de tout composant, donc il ne peut
  pas appeler `useTranslation` — c'est pourquoi il porte des clés. Le filtrage par
  permission doit donc se faire au rendu, pas dans le constant.

## 8. Décisions à prendre

- Groupes ouverts par défaut ou repliés : recommandation, **Contenu** ouvert, le reste
  replié, avec mémorisation.
- Barre publique : activée par défaut pour les authentifiés (recommandé) ou opt-in.
