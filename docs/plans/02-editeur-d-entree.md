# 02 — Éditeur d'entrée

> **État** : partiel — beaucoup de fonctions, aucune organisation.
> **Écran** : `packages/admin/src/routes/entry-edit.tsx` (789 lignes)
> **Formulaire** : `packages/admin/src/collections/entry-form.tsx` (68 lignes)
> **API existante** : `GET/PATCH /api/content/{c}/{id}`, `POST .../publish`,
> `.../unpublish`, `.../duplicate`, `.../preview`, `.../history`, `.../diff`,
> `.../restore`, `.../translations`
> **Effort** : 8–12 jours
> **ADR requise** : oui pour le verrouillage d'édition (tâche 7) et le statut
> « en relecture » (renvoyé à la fiche [37](37-workflow-editorial.md))

---

## 1. Ce qui existe réellement

`entry-edit.tsx` est l'écran le plus riche de l'admin. Il porte réellement :

- création et modification, la même route pour les deux ;
- sélecteur de statut (`draft`/`published`/`archived`) et bouton publier, gardés par
  `canPerform('publish')` ;
- **programmation réelle** : `datetime-local` + `POST .../unpublish` avec
  `status: 'scheduled'`, et le planificateur tourne vraiment côté serveur ;
- duplication ;
- lien de prévisualisation signé, ouvert sur le vrai site ;
- **autosave local** (`localStorage`), proposé et jamais appliqué tout seul, avec un
  libellé qui dit explicitement que ce n'est pas une sauvegarde serveur ;
- bascule formulaire / page builder visuel, mémorisée par navigateur ;
- panneaux d'assistant IA (rédaction, classification, modération, FAQ/Schema.org),
  qui disparaissent entièrement sans fournisseur (R2) ;
- sélecteur de traduction et historique de versions.

`entry-form.tsx`, lui, fait **une seule chose** : `collection.fields.map()`. Un champ,
une ligne, dans l'ordre de déclaration. Rien d'autre.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Strapi 5 | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Colonne principale + barre latérale de publication | ✅ | ✅ | ✅ | ❌ (tout empilé) |
| Groupes / onglets de champs | ✅ (métaboxes) | ✅ | ✅ (field groups) | ❌ |
| Champs conditionnels (afficher si…) | ✅ (ACF) | ✅ (conditions) | ✅ (states API) | ❌ |
| Garde-fou « modifications non enregistrées » | ✅ | ✅ | ✅ | ❌ |
| `Ctrl+S` / `⌘+S` | ✅ | ✅ | ❌ | ❌ |
| Validation affichée champ par champ avant envoi | ✅ | ✅ | ✅ | ❌ (erreur globale) |
| Verrouillage d'édition concurrente | ✅ | ❌ | ✅ | ❌ |
| Permalien éditable + aperçu de l'URL | ✅ | ❌ | ✅ | ❌ |
| Auteur assignable | ✅ | ✅ | ✅ | ❌ |
| Extrait / image à la une conventionnels | ✅ | ❌ | ✅ | ❌ |
| Panneau SEO dans l'éditeur | ✅ (Yoast/RankMath) | plugin | plugin | ❌ (voir fiche 13) |
| Compteur de mots / temps de lecture | ✅ | ❌ | ✅ | ❌ |
| Corbeille depuis l'éditeur | ✅ | ✅ | ✅ | ❌ |
| Autosave **serveur** (révision brouillon) | ✅ | ✅ | ✅ | ❌ (local seulement) |

## 3. Écarts, classés

### Bloquants

1. **Aucun garde-fou de sortie.** Un clic sur un lien du menu perd les modifications
   non enregistrées. L'autosave local les retrouve à la réouverture, mais rien ne le
   dit au moment où on part — et le nouveau contenu, non enregistré, n'a pas d'id,
   donc pas de clé d'autosave stable.
2. **Aucune validation affichée avant envoi.** Un champ requis vide produit un 422
   serveur affiché en bandeau générique, sans dire **quel** champ. Sur un formulaire à
   quinze champs, c'est une chasse au trésor.
3. **Pas de mise à la corbeille depuis l'éditeur.** Il faut revenir à la liste.
4. **Tout est empilé verticalement.** Sur une collection à quinze champs plus quatre
   panneaux d'assistant plus l'historique, le bouton « Enregistrer » est à deux écrans
   de défilement du titre.

### Importants

5. Pas de groupement des champs. Le contrat A porte-t-il un `admin.group` ? À vérifier
   ; sinon, une convention par préfixe ou une déclaration côté admin.
6. Pas de champs conditionnels.
7. Pas d'auteur affiché ni assignable — pourtant `createdBy`/`updatedBy` existent en
   base et le journal d'audit les nomme.
8. Pas d'aperçu du permalien pendant la saisie du slug. On découvre l'URL après avoir
   publié.
9. Pas de `Ctrl+S`.
10. L'autosave est **local uniquement**. Un navigateur qui plante avant le premier
    enregistrement ne laisse rien de récupérable côté serveur.
11. Pas de verrouillage : deux éditeurs sur la même entrée, le dernier qui enregistre
    écrase l'autre sans le savoir. Il n'y a même pas de détection *a posteriori*
    (pas de contrôle d'`updatedAt` à l'envoi).

### Confort

12. Compteur de mots, temps de lecture.
13. Comparaison « ce que j'ai modifié depuis l'ouverture » avant d'enregistrer.
14. Boutons d'action collants en bas d'écran.

## 4. Plan de développement

### Tâche 1 — Mise en page à deux colonnes

**Fichiers** : `entry-edit.tsx`, `packages/admin/src/styles/entry-form.css`.

Colonne principale : titre, champs, blocs / builder.
Barre latérale collante : statut, publication, programmation, langue, permalien,
auteur, actions (dupliquer, corbeille, prévisualiser).
Sous la colonne principale, en accordéons repliés par défaut : historique,
traductions, panneaux d'assistant.

Une seule ligne de fond : **un seul `<form>`, un seul enregistrement** — la règle déjà
posée par L16 pour le builder. La barre latérale n'introduit pas un deuxième chemin
d'écriture.

Responsive : sous 1024 px, la barre latérale repasse au-dessus du formulaire, jamais
en tiroir caché (un statut invisible est un statut qu'on oublie de changer).

**Critère** : sur une collection à quinze champs, « Enregistrer » et le statut sont
visibles sans défiler.

### Tâche 2 — Garde-fou de sortie

**Fichiers** : `entry-edit.tsx`, nouveau `packages/admin/src/lib/use-dirty-guard.ts`.

Deux mécanismes, parce qu'ils couvrent deux sorties différentes :

- `beforeunload` pour la fermeture d'onglet et le rechargement ;
- `useBlocker` de React Router pour la navigation interne, avec une vraie modale
  (« Enregistrer », « Quitter sans enregistrer », « Annuler ») plutôt que le
  `confirm()` du navigateur.

« Sale » = `snapshot` différent de `baseline` — la comparaison que `useAutosave` fait
déjà. La réutiliser, ne pas en écrire une deuxième.

**Critère** : modifier un champ, cliquer sur « Médias » dans le menu, une modale
apparaît ; « Annuler » laisse l'entrée exactement dans son état modifié.

### Tâche 3 — Validation champ par champ

**Fichiers** : `entry-form.tsx`, `packages/admin/src/fields/field-wrapper.tsx`,
`entry-edit.tsx`.

Deux niveaux, dans cet ordre :

- **Avant envoi** : les contraintes que le schéma expose déjà (`required`, `unique`,
  `min`/`max` s'ils sont dans `options`) sont vérifiées côté client et affichées sous
  le champ, avec `aria-invalid` et `aria-describedby`. Le premier champ en erreur
  reçoit le focus.
- **Après un refus serveur** : le corps d'erreur doit nommer le champ. Vérifier ce que
  `CogentaError.details` contient pour `CONTENT_VALIDATION_FAILED` ; s'il ne nomme pas
  le champ, c'est un travail côté `packages/schema` — et il faut le faire, parce que
  le client ne peut pas deviner une règle de validation personnalisée
  (`hasCustomValidation`).

**Critère** : envoyer une entrée avec deux champs requis vides → deux messages sous
les deux champs, aucun bandeau générique, focus sur le premier.

### Tâche 4 — Corbeille, auteur, permalien dans la barre latérale

**Fichiers** : `entry-edit.tsx`.

- **Corbeille** : `DELETE`, gardé par `canPerform('delete')`, avec confirmation
  nommant le titre, puis retour à la liste avec un message « mis à la corbeille » et
  un bouton « annuler » qui appelle `POST .../untrash`. C'est cette annulation
  immédiate qui rend la confirmation supportable.
- **Auteur** : afficher `createdBy`/`updatedBy` résolus en e-mail via
  `/api/users`. Rendre l'auteur **assignable** demande une route
  (`PATCH` avec `createdBy`) et une permission dédiée → à traiter dans la fiche
  [37](37-workflow-editorial.md), pas ici. Ici : afficher, seulement.
- **Permalien** : recomposer l'URL avec `buildPath` (déjà utilisé côté serveur par
  `previewPath`). Le rendre visible pendant qu'on tape le slug, avec le préfixe de
  locale. Le contrat A porte déjà `routing` par collection.

**Critère** : mettre à la corbeille depuis l'éditeur, puis annuler en un clic, et
retrouver l'entrée intacte, statut compris (ADR-0022).

### Tâche 5 — Raccourcis et confort

**Fichiers** : `entry-edit.tsx`.

`Ctrl/⌘+S` enregistre (et `preventDefault` sur le dialogue de sauvegarde du
navigateur). `Ctrl/⌘+Shift+P` prévisualise. Une aide listant les raccourcis,
atteignable au clavier. Compteur de mots sur les champs `text` et `richText`, calculé
localement.

**Critère** : `⌘+S` enregistre et annonce « enregistré » via `role="status"`.

### Tâche 6 — Groupes de champs

**Fichiers** : `packages/admin/src/schema/types.ts`, `entry-form.tsx`.

Vérifier d'abord si le bloc `admin` du contrat A porte déjà `group`/`fieldset`/`order`.

- S'il le porte : lire et rendre, aucun contrat touché.
- S'il ne le porte pas : **ne pas modifier le contrat A**. Grouper côté admin, à
  partir d'une convention documentée : les champs `seoTitle`, `seoDescription`,
  `ogImage` dans un groupe « SEO » ; `publishedAt`, `locale` dans « Publication ».
  C'est une heuristique, elle doit être visible et surchargeable, jamais magique.
- Champs conditionnels : les reporter tant que le contrat A n'a pas de quoi les
  déclarer. Une condition inventée côté admin diverge du serveur au premier import.

**Critère** : une collection à quinze champs se lit en trois groupes repliables, sans
qu'une ligne de son schéma ait changé.

### Tâche 7 — Édition concurrente

**ADR requise.** Deux approches, incompatibles :

- **Détection** (léger) : l'admin envoie l'`updatedAt` qu'il a chargé ; le serveur
  refuse un `PATCH` dont l'`updatedAt` ne correspond plus, avec un code
  `CONTENT_STALE_WRITE`. L'admin propose alors de comparer et de fusionner.
  Aucune table nouvelle, aucun état à expirer.
- **Verrouillage** (WordPress) : une table de verrous, un TTL, une reprise forcée.
  Plus visible pour l'éditeur, mais introduit un état qui survit aux crashs et qu'il
  faut nettoyer.

Recommandation : **la détection**, d'abord. Elle est sans état, elle ne peut pas
bloquer un site, et elle attrape le cas réel (écrasement silencieux). Le verrouillage
peut venir après, par-dessus, s'il manque.

**Critère** : deux onglets ouvrent la même entrée, le premier enregistre, le second
reçoit un refus explicite proposant de voir la différence — jamais un écrasement muet.

### Tâche 8 — Autosave serveur

**Fichiers** : `packages/schema/src/store/`, `packages/api/src/rest/router.ts`,
`use-autosave.ts`.

L'autosave local couvre le crash du navigateur, pas la perte de machine. Un vrai
autosave serveur écrit une version `working` sans créer d'entrée de version publiable.
Le contrat A a déjà `state: 'working'` et un historique de versions : vérifier si un
`update()` en état `working` suffit, ou s'il faut un `autosave: true` qui n'incrémente
pas le numéro de version (sinon vingt versions par article).

Si cela demande un champ nouveau → **ADR**, contrat A figé.

**Critère** : fermer l'onglet sans enregistrer, rouvrir depuis une autre machine, et
se voir proposer la reprise.

## 5. Critères d'acceptation

- On ne perd jamais une modification sans avoir été prévenu.
- Un champ invalide est nommé sous lui-même, jamais dans un bandeau générique.
- On met à la corbeille et on annule sans quitter l'éditeur.
- Deux éditeurs simultanés ne s'écrasent pas silencieusement.
- L'écran reste utilisable au clavier seul, du titre au bouton d'enregistrement.
- Aucun panneau d'assistant n'apparaît sans fournisseur IA (R2 — déjà vrai, à ne pas
  casser).

## 6. Tests exigés

- Composant : le garde-fou se déclenche sur navigation interne et pas quand rien n'a
  changé.
- Composant : validation locale (deux champs requis vides → deux messages, focus au
  premier).
- Composant : chaque bouton de la barre latérale absent pour le rôle sans la
  permission correspondante.
- Bout en bout : corbeille depuis l'éditeur puis `untrash`, en vérifiant que le
  statut d'origine est rendu tel quel (ADR-0022).
- Bout en bout : écriture concurrente refusée (tâche 7).
- Accessibilité : axe-core sur l'écran à deux colonnes, sans régression.

## 7. Pièges connus

- **La barre latérale ne doit pas devenir un second formulaire.** Un `<form>` unique,
  un `submit` unique, une version unique — la règle que L16 a posée pour le builder
  vaut ici mot pour mot.
- **Le garde-fou et l'autosave se contredisent facilement.** Si l'autosave a écrit,
  l'utilisateur croit être protégé ; le message de sortie doit donc dire *ce qui est
  vraiment enregistré*, pas « vous allez perdre vos modifications » quand c'est faux.
- **`beforeunload` seul ne suffit pas** : la navigation interne de React Router ne le
  déclenche pas.
- **L'aperçu du permalien ment facilement.** `buildPath` dépend de la locale et du
  motif de la collection ; le recalculer côté admin est une deuxième implémentation
  qui divergera. Préférer un appel au serveur, ou extraire `buildPath` dans un module
  partagé sans dépendance à la base.
- **Le compteur de mots sur `richText`** doit traverser le portable-text, pas
  `JSON.stringify` — sinon il compte les noms de clés.

## 8. Décisions à prendre

- Groupes de champs : convention admin (recommandé) ou extension du contrat A (ADR).
- Édition concurrente : détection ou verrouillage (ADR dans les deux cas, parce que
  ça ajoute un code d'erreur ou une table).
- Autosave serveur : réutiliser `state: 'working'` ou introduire une notion
  d'autosave distincte (ADR si le contrat A bouge).
