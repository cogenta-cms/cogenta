# 16 — Formulaires et soumissions

> **État** : **absent partout.** Aucun formulaire, aucune soumission, aucun envoi de
> message depuis le site public.
> **Vérification** : aucune trace de `contactForm`, `formSubmission` ou équivalent
> dans `packages/*/src`.
> **Effort** : 10–14 jours
> **ADR requise** : **oui** — nouveau domaine de données, et une route publique en
> écriture

---

## 1. Ce qui existe réellement

Rien. Un site Cogenta publié aujourd'hui n'a **aucun moyen d'être contacté**. C'est,
avec les commentaires et l'apparence, l'un des trois grands trous de l'admin — et
sans doute le plus surprenant, parce qu'un formulaire de contact est la première
chose qu'on ajoute à un site vitrine.

Les briques existent séparément :

- `@cogenta/channels` sait envoyer un e-mail (adaptateur sortant), poster sur Slack,
  Discord, Telegram, et livrer un webhook signé HMAC-SHA256 avec fenêtre de fraîcheur
  et protection contre le rejeu.
- Le contrat B a douze blocs, dont aucun n'est un formulaire.
- Le contrat A sait modéliser des données structurées.

## 2. Ce que font les CMS de référence

| Fonction | Contact Form 7 / WPForms | Drupal Webform | Cogenta |
|---|---|---|---|
| Construire un formulaire sans code | ✅ | ✅ | ❌ |
| Champs variés (texte, e-mail, choix, fichier, consentement) | ✅ | ✅ | ❌ |
| Stocker les soumissions | ✅ | ✅ | ❌ |
| Notification e-mail à l'admin | ✅ | ✅ | ❌ |
| Accusé de réception à l'expéditeur | ✅ | ✅ | ❌ |
| Anti-spam | ✅ | ✅ | ❌ |
| Export CSV des soumissions | ✅ | ✅ | ❌ |
| Champs conditionnels | ✅ | ✅ | ❌ |
| Message de confirmation / redirection | ✅ | ✅ | ❌ |
| Consentement RGPD + rétention | partiel | ✅ | ❌ |
| Webhook vers un service tiers | ✅ | ✅ | brique ✅ |

## 3. Décisions à prendre AVANT toute ligne de code

Trois questions, dans cet ordre.

**(1) Où vit la définition d'un formulaire ?**

- **(a) Une collection du contrat A**, dont chaque entrée est un formulaire, avec ses
  champs en `json` ou en répéteur. Zéro contrat nouveau. Mais on met une structure
  dans un champ `json`, ce qui rejoue exactement le problème de la fiche
  [03](03-champs-de-formulaire.md).
- **(b) Un domaine séparé** (`@cogenta/forms`), avec sa table de définitions, sa table
  de soumissions, ses routes.

**Recommandation : (b)**, même argument qu'ADR-0024 et que la fiche
[15](15-commentaires.md) : une soumission n'a ni traduction, ni brouillon, ni version,
et son volume est d'un autre ordre.

**(2) Comment un formulaire arrive-t-il sur une page ?**

Le contrat B est **figé**. Ajouter un bloc `form` exige une RFC. Trois voies :

- **RFC contrat B** pour un bloc `form` référençant un formulaire par id. C'est la
  solution propre et attendue. Une RFC est explicitement le chemin prévu par
  `AGENTS.md` — ce n'est pas un contournement, c'est la procédure.
- **Une route dédiée** (`/contact`) rendue par le gabarit, comme `/search` l'a été en
  L10 sans toucher au contrat. Rapide, mais limite le formulaire à ses propres pages.
- **Un bloc `embed`** existant détourné. À écarter : c'est du bricolage qui se paiera.

**Recommandation** : livrer la **route dédiée** en premier (utile immédiatement,
aucun contrat touché), et ouvrir la **RFC contrat B** en parallèle pour le bloc, qui
est la vraie cible.

**(3) Stocke-t-on les soumissions ?**

Stocker, c'est créer un registre de données personnelles. Ne pas stocker, c'est perdre
les messages quand l'e-mail échoue. **Recommandation : stocker, avec rétention
configurable et purge automatique**, sur le modèle exact de la corbeille d'ADR-0022
(`retainDays`, `purgeExpired()`) — le mécanisme existe et a fait ses preuves.

## 4. Plan de développement

### Tâche 1 — Modèle

**Fichiers** : nouveau paquet `@cogenta/forms` (skill `new-package`).

- **Définition** : nom, libellé, liste de champs typés (texte, texte long, e-mail,
  téléphone, nombre, date, choix simple/multiple, fichier, **consentement**), champ
  requis, aide, validation.
- **Soumission** : formulaire, valeurs, horodatage, statut (nouveau / lu / archivé /
  indésirable), IP **hachée**, référent, et le consentement recueilli avec sa date et
  son texte exact — c'est le texte au moment du recueil qui compte juridiquement, pas
  celui d'aujourd'hui.
- Migration réversible, trois bases (skill `write-migration`).

### Tâche 2 — Constructeur de formulaire dans l'admin

**Fichiers** : nouvelle route `packages/admin/src/routes/forms.tsx`,
`shell/nav-items.ts`.

Liste des formulaires, création, édition des champs (ajouter, ordonner, supprimer —
réutiliser le répéteur de la fiche [03](03-champs-de-formulaire.md) plutôt que d'en
écrire un second), aperçu, et par formulaire : message de confirmation ou redirection,
destinataires de notification, activation.

Champs conditionnels : les reporter à une deuxième version. Ils sont attendus, mais
ils doublent la complexité du constructeur **et** du rendu, et un formulaire de
contact n'en a pas besoin.

### Tâche 3 — Route publique de soumission

**Fichiers** : `packages/api/src/rest/forms-router.ts`.

`POST /api/forms/{name}/submit`. Mêmes exigences que la fiche
[15](15-commentaires.md), et pour la même raison — c'est une route publique en
écriture :

- limitation de débit par IP et par formulaire ;
- champ piège et délai minimal ;
- validation serveur **complète**, indépendante du client ;
- taille maximale, et types de fichiers en liste blanche si les fichiers sont
  acceptés (réutiliser la détection de type par les octets du pipeline média, corrigée
  en L10 — ne pas faire confiance au type déclaré) ;
- **fonctionne sans JavaScript** : un `POST` HTML classique, avec redirection vers la
  page de confirmation.

### Tâche 4 — Soumissions dans l'admin

**Fichiers** : nouvelle route `packages/admin/src/routes/form-submissions.tsx`.

Liste par formulaire, avec compteur de non-lues dans la navigation. Détail d'une
soumission. Marquer lu / archivé / indésirable. Actions groupées. Export CSV
(réutiliser `lib/csv.ts`). Suppression, avec confirmation.

Affichage de la date de purge automatique, comme pour la corbeille.

### Tâche 5 — Notifications

**Fichiers** : `@cogenta/channels` (réutilisation), `forms-router.ts`.

- E-mail au(x) destinataire(s), via l'adaptateur existant.
- Accusé de réception à l'expéditeur, optionnel — et attention : c'est un e-mail
  envoyé à une adresse fournie par un anonyme. Limitation de débit obligatoire, sous
  peine de transformer le site en relais de spam.
- Notification Slack/Discord/Telegram, en réutilisant les formats de message de
  `@cogenta/channels` et son **budget-écran imposé** plutôt qu'en inventant un
  message.
- Webhook sortant signé, en réutilisant le webhook générique de L6 tâche — signature
  HMAC, fenêtre de fraîcheur, protection contre le rejeu : tout est déjà là.

**Le contenu de la soumission est de la donnée** (R8) : si un message part vers un
canal où un agent lit, il doit être balisé comme tel.

### Tâche 6 — Rendu public

**Fichiers** : `@cogenta/theme-canonical`, `theme-render.ts`, et la RFC contrat B si
elle aboutit.

Rendu du formulaire, avec libellés associés, messages d'erreur accessibles
(`aria-describedby`, `aria-invalid`), et réaffichage des valeurs saisies après un
refus — perdre ce qu'on vient de taper est la première cause d'abandon.

### Tâche 7 — RGPD

**Fichiers** : `@cogenta/forms`, fiche [23](23-reglages-du-site.md).

Case de consentement obligatoire quand des données personnelles sont collectées, avec
son texte versionné. Rétention configurable et purge automatique. Export et
suppression des données d'une personne sur demande — au minimum, une recherche par
e-mail dans les soumissions.

## 5. Critères d'acceptation

- Un visiteur envoie un message ; il arrive par e-mail **et** il est stocké.
- Le formulaire fonctionne sans JavaScript.
- La limitation de débit résiste à une soumission en boucle.
- L'accusé de réception ne peut pas servir de relais de spam.
- Aucune adresse IP en clair.
- Les soumissions se purgent automatiquement selon la rétention configurée.
- Une saisie refusée n'efface pas ce que le visiteur a tapé.

## 6. Tests exigés

- Bout en bout : soumission, stockage, notification, contre un vrai serveur.
- Bout en bout : soumission **sans JavaScript** (POST direct).
- Sécurité : XSS stocké dans une valeur de soumission, vérifié à l'affichage admin.
- Sécurité : limitation de débit sur la soumission **et** sur l'accusé de réception.
- Sécurité : un fichier téléversé dont les octets contredisent le type déclaré est
  refusé (la règle corrigée en L10).
- Unitaires : validation serveur indépendante du client, pour chaque type de champ.
- Intégration trois bases pour la migration.
- Passage par `security-reviewer` avant fusion — obligatoire.

## 7. Pièges connus

- **L'accusé de réception est un relais de spam potentiel.** Envoyer un e-mail à une
  adresse fournie par un anonyme, sans limite, permet d'inonder une boîte tierce
  depuis votre domaine — et de brûler la réputation de ce domaine. Limite stricte,
  désactivé par défaut.
- **Deuxième route publique en écriture** du CMS, après les commentaires. Mêmes
  précautions, mêmes relectures.
- **Le téléversement de fichiers multiplie la surface** : taille, type, stockage,
  antivirus (qu'on n'a pas). Recommandation : **pas de fichiers dans la première
  version**, et le dire.
- **Le consentement doit être horodaté avec son texte.** Stocker « a consenti : oui »
  sans le texte n'a aucune valeur probante.
- **Ne pas détourner le contrat B.** Si le bloc `form` est voulu, c'est une RFC.
- **Ne pas réinventer l'envoi d'e-mail.** `@cogenta/channels` a un adaptateur, avec
  ses erreurs typées (`CHANNEL_EMAIL_TRANSPORT_ERROR`).

## 8. Décisions à prendre

- **ADR** : domaine séparé (recommandé) vs collection du contrat A.
- **RFC contrat B** pour le bloc `form` : à ouvrir, en livrant la route dédiée en
  attendant.
- Fichiers joints : hors périmètre de la première version (recommandé).
- Rétention par défaut des soumissions.
