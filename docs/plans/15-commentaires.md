# 15 — Commentaires

> **État** : **absent partout.** Ni modèle, ni API, ni écran, ni rendu.
> **Vérification** : aucune occurrence de commentaire au sens « avis de visiteur »
> dans `packages/*/src` — seulement des commentaires de code et l'import WordPress.
> **Effort** : 10–14 jours
> **ADR requise** : **oui, obligatoire** — nouveau domaine de données

---

## 1. Ce qui existe réellement

Rien. Et c'est un manque important pour trois raisons :

1. **L'import WordPress existe** (`@cogenta/import`, L9 tâche 6). Un WXR contient les
   commentaires. Aujourd'hui, importer un blog WordPress **perd tous ses
   commentaires** — silencieusement ou non, à vérifier dans le rapport d'import.
2. C'est la fonctionnalité que tout le monde compare en premier avec WordPress.
3. `@cogenta/agents` porte déjà `assist.moderate` avec une union fermée
   `none`/`review` — un modérateur automatique sans rien à modérer.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Cogenta |
|---|---|---|---|
| Commentaires par entrée | ✅ | ✅ | ❌ |
| Fil de discussion (réponses imbriquées) | ✅ | ✅ | ❌ |
| File de modération (en attente / approuvé / indésirable) | ✅ | ✅ | ❌ |
| Anti-spam | ✅ (Akismet) | ✅ | ❌ |
| Commentaire d'un visiteur non inscrit | ✅ | ✅ | ❌ |
| Fermeture des commentaires par entrée / après N jours | ✅ | ✅ | ❌ |
| Notification par e-mail à l'auteur | ✅ | ✅ | ❌ |
| Modération groupée | ✅ | ✅ | ❌ |
| Liste noire de mots / d'auteurs | ✅ | ✅ | ❌ |
| Modération assistée par IA | plugin | plugin | outil ✅, sans objet |

## 3. Décisions à prendre AVANT toute ligne de code

Cette fiche est la seule, avec [16](16-formulaires.md), à ouvrir un **domaine de
données nouveau**. Le précédent existe : ADR-0024 a tranché la même question pour le
commerce, et sa conclusion est instructive — **contrat E séparé**, pas une extension
du contrat A. Trois des raisons données s'appliquent mot pour mot à un commentaire :

- ADR-0014 forkerait un commentaire par langue (un commentaire n'a pas de traduction) ;
- ADR-0022 le rendrait restaurable depuis la corbeille (ce qui, en fait, est
  *souhaitable* ici — nuance à examiner) ;
- « un brouillon de commentaire n'existe pas » — vrai aussi.

Mais il y a une différence : un commentaire est un **contenu textuel écrit par un
tiers**, exactement le type d'objet que le contrat A sait modéliser. Deux options,
donc :

- **(a) Contrat A** : les commentaires sont une collection ordinaire, avec un champ
  `relation` vers l'entrée commentée et un champ `parent` pour l'imbrication. Zéro
  contrat nouveau, corbeille et versions gratuites, permissions par rôle gratuites,
  et l'admin sait déjà les lister et les éditer.
  Contreparties réelles : le statut `published`/`draft` doit signifier
  approuvé/en attente, ce qui est un détournement ; un commentaire n'a pas de slug ni
  de route ; l'auteur est un visiteur, pas un compte ; le volume peut être très
  supérieur à celui du contenu éditorial.
- **(b) Contrat F séparé** : table dédiée, statut propre
  (`pending`/`approved`/`spam`/`trash`), auteur anonyme modélisé correctement, routes
  propres, permissions propres.

**Recommandation : (b)**, pour la même raison qu'ADR-0024 : le contrat A devrait
apprendre des choses (un auteur qui n'est pas un compte, un statut de modération, un
volume d'un autre ordre) pour un seul type de collection. Et le détournement de
`published` en « approuvé » est exactement le genre de raccourci qu'on regrette au
bout d'un an.

**Livrable de la tâche 0 : une ADR**, sur le modèle d'ADR-0024, tranchant (a) vs (b)
et disant explicitement ce qu'on perd.

## 4. Plan de développement

### Tâche 1 — Modèle et stockage

**Fichiers** : nouveau paquet `@cogenta/comments` (skill `new-package`), ou un module
de `@cogenta/schema` selon la décision de la tâche 0.

Un commentaire porte : identité de la cible (collection, entryId, locale), auteur
(compte **ou** nom + e-mail + site pour un visiteur), corps en **texte brut**
(jamais de HTML — R3, et c'est la première défense contre le XSS stocké), statut de
modération, `parent` pour le fil, horodatage, et les métadonnées de modération
(adresse IP **hachée**, pas en clair — RGPD).

Migration réversible, testée sur les trois bases (skill `write-migration`).

### Tâche 2 — API publique de dépôt

**Fichiers** : `packages/api/src/rest/comments-router.ts`.

`POST /api/comments` — **c'est la seule route publique en écriture de tout le CMS**,
et elle mérite d'être traitée comme telle :

- limitation de débit par adresse IP et par cible, obligatoire dès la première
  version ;
- champ piège (honeypot) et délai minimal de remplissage ;
- taille maximale du corps ;
- pas de CAPTCHA par défaut (dépendance externe, R1) ; un point d'extension pour en
  brancher un.
- statut initial configurable : `pending` par défaut, `approved` si l'auteur a déjà un
  commentaire approuvé (la règle WordPress, qui marche bien).
- **R8** : le corps du commentaire est de la donnée. Il n'entre jamais dans un prompt
  système, il est échappé au rendu, et il ne peut porter aucun HTML.

### Tâche 3 — File de modération dans l'admin

**Fichiers** : nouvelle route `packages/admin/src/routes/comments.tsx`,
`shell/nav-items.ts`.

- Onglets avec compteurs : en attente, approuvés, indésirables, corbeille.
- Par ligne : extrait, auteur, cible (lien vers l'entrée), date, actions (approuver,
  refuser, marquer indésirable, répondre, modifier, corbeille).
- Actions groupées.
- Recherche et filtres (par entrée, par auteur, par date).
- Réponse depuis l'admin, publiée comme commentaire du compte connecté.
- **Compteur en attente dans la navigation** — c'est ce qui fait qu'une file de
  modération est traitée plutôt qu'oubliée.

### Tâche 4 — Modération assistée, jamais automatique

**Fichiers** : `routes/comments.tsx`, réutilisation d'`assist.moderate`.

`assist.moderate` existe, avec `recommendedAction` en union fermée `none`/`review` —
c'est-à-dire qu'**aucune réponse de modèle, même jailbreakée, ne peut décrire une
suppression**. C'est exactement la propriété qu'il faut ici.

Donc : un indicateur par commentaire, jamais une action. La décision reste humaine
(R6). Et **sans fournisseur, la colonne disparaît** (R2).

Anti-spam sans IA, à faire d'abord parce qu'il fonctionne partout : nombre de liens,
liste de mots, réputation de l'auteur, délai de soumission.

### Tâche 5 — Réglages

**Fichiers** : fiche [23](23-reglages-du-site.md) — section « Discussion ».

Commentaires activés par site et **par collection** ; fermeture automatique après N
jours ; modération obligatoire ou non ; commentaires anonymes autorisés ou non ;
imbrication maximale ; notification par e-mail.

Par entrée : un interrupteur dans la barre latérale de l'éditeur (fiche
[02](02-editeur-d-entree.md)).

### Tâche 6 — Rendu public

**Fichiers** : `@cogenta/theme-canonical`, `theme-render.ts`.

Le fil de commentaires et le formulaire sous une page. **Le contrat B est figé** : ne
pas ajouter un bloc `comments`. Le fil est rendu par le gabarit de page, pas par un
bloc — même raisonnement que L10 pour la page `/search`, qui a rendu le service sans
toucher au contrat.

Sans JavaScript, le formulaire doit fonctionner (un `POST` HTML classique) : c'est un
formulaire public, il doit marcher partout.

### Tâche 7 — Import WordPress

**Fichiers** : `packages/import/src/wordpress/`.

Importer les commentaires du WXR, avec leur fil, leur statut et leur date. Et
**vérifier ce que l'import fait aujourd'hui** : s'il les ignore silencieusement, c'est
un bug à corriger indépendamment de cette fiche — un rapport d'import doit dire ce
qu'il n'a pas importé.

## 5. Critères d'acceptation

- Un visiteur dépose un commentaire ; il apparaît en attente ; un modérateur
  l'approuve ; il s'affiche sur la page.
- Aucun HTML soumis par un visiteur n'atteint jamais le rendu.
- La limitation de débit résiste à une soumission en boucle.
- Sans fournisseur IA, toute la modération fonctionne (R2).
- Aucune suppression automatique décidée par un modèle (R6).
- Aucune adresse IP en clair en base.
- Un import WordPress conserve les commentaires, ou dit lesquels il a laissés.

## 6. Tests exigés

- Bout en bout : dépôt, modération, affichage, contre un vrai serveur.
- Sécurité : XSS stocké (corps contenant `<script>`, `<img onerror>`, entités
  encodées) — vérifier l'échappement dans le HTML servi.
- Sécurité : limitation de débit réellement appliquée.
- Sécurité : R8 — un commentaire contenant `</data><constitution>…` passé à
  `assist.moderate` arrive échappé et ne modifie pas la requête (le test d'injection
  de L18 est le modèle exact à copier).
- Permissions par rôle sur chaque route de modération.
- Intégration sur les trois bases pour la migration.
- Passage par le sous-agent `security-reviewer` avant fusion — obligatoire, c'est une
  route publique en écriture.

## 7. Pièges connus

- **C'est la seule route publique en écriture du CMS.** Tout ce qui a été construit
  jusqu'ici suppose qu'écrire exige une session. Cette hypothèse tombe ici, et chaque
  couche traversée doit être relue avec ça en tête.
- **Le volume est d'un autre ordre.** Un blog peut avoir cent fois plus de
  commentaires que d'articles. Index dès le départ, pagination partout, jamais de
  `SELECT *` sur la table.
- **Le corps est du texte brut.** Toute tentative d'accepter du Markdown ou du HTML
  « limité » rouvre la surface XSS. Si du formatage est voulu : le rendre côté
  affichage à partir de texte brut, jamais le stocker.
- **RGPD** : e-mail et IP sont des données personnelles. Hachage de l'IP, rétention
  bornée, et un chemin de suppression sur demande — sinon la fonctionnalité crée une
  obligation légale que le produit ne sait pas honorer.
- **La notification par e-mail** demande un transport. `@cogenta/channels` en a un
  (adaptateur email, sortant uniquement) — le réutiliser, ne pas en écrire un second.
- **Le contrat B est figé** : pas de bloc `comments`.

## 8. Décisions à prendre

- **ADR de la tâche 0** : contrat A détourné ou domaine séparé. Recommandation :
  domaine séparé, sur le modèle d'ADR-0024.
- Anti-spam : quelles heuristiques par défaut, et quel point d'extension.
- Rétention des indésirables : purge automatique après N jours (recommandé : 30, comme
  la corbeille).

## 9. Ajout demandé (2026-08-28, retour utilisateur direct) — interrupteur global

Un site vitrine n'a souvent pas besoin de commentaires du tout. Demande explicite :
un réglage global (`comments.enabled`, site-wide, via `SiteSettingsStore` — même
mécanisme que les réglages `seo.*`/`channels.*` déjà en place) qui, une fois
désactivé :

- retire le formulaire de soumission de commentaire du rendu public (thème),
  jamais seulement masqué en CSS ;
- retire l'affichage des commentaires déjà existants sur les pages publiques
  (ils restent en base, rien n'est supprimé — un site peut réactiver plus tard et
  retrouver son historique) ;
- retire l'entrée « Commentaires » du menu de l'admin si aucun commentaire
  n'existe déjà (même logique que `commerceActiveOrAdmin` dans `nav-visibility.ts`
  — visible si un commentaire existe malgré la désactivation, pour pouvoir les
  consulter/purger).

À intégrer dans le plan de développement de cette fiche 15 (probablement une tâche
0bis, juste après le choix de domaine) plutôt que traité comme un lot séparé — le
réglage n'a de sens qu'une fois le domaine commentaires construit.
