# 23 — Réglages du site

> **État** : **une seule option** — la langue de l'interface. C'est l'écran qui
> illustre le mieux la remarque de départ : « une page bleue où on ne peut pas faire
> grand-chose ».
> **Écrans** : `packages/admin/src/routes/settings.tsx` (69 lignes),
> `routes/ops-settings.tsx` (168, lecture seule)
> **Configuration réelle** : `packages/core/src/config/schema.ts`
> **Effort** : 6–8 jours
> **ADR requise** : **oui** — c'est la fiche qui doit trancher où vivent les réglages

---

## 1. Ce qui existe réellement

**`settings.tsx` contient exactement un réglage** : la langue de l'interface
(ADR-0019), qui est une préférence de la personne connectée, pas une propriété du
site. Plus un lien vers le profil. C'est tout.

**`ops-settings.tsx`** montre en lecture seule ce que le processus applique vraiment
pour la sécurité et les webhooks. Sa lecture-seule est **délibérée et argumentée** :
ces réglages vivent dans `cogenta.config.mjs`, versionné en git et déployé avec le
code qui en dépend (une CSP qui autorise un hôte de script doit voyager avec le
déploiement qui a ajouté ce script). Écrire depuis l'admin créerait une seconde source
de vérité qui diverge dès que l'une des deux bouge. L'écran prouve la correspondance
entre le fichier et ce qui est appliqué — ce qui est réellement utile.

La configuration réelle porte, vérifié dans le schéma Zod :

`site` (`name`, `url`, `locales`, `defaultLocale`, `notFoundPath`), `database`,
`cache`, `queue`, `storage`, `security` (`cors`, `csp`, `hstsMaxAge`,
`hstsIncludeSubDomains`, `pageMaxAge`), `webhooks`, `llm`, `embeddings`,
`imageGeneration`, `vector`, `billing` (`legalName`, `address`, `taxId`, `footer`).

**Ce qui n'existe nulle part** : titre affiché et accroche du site (au-delà de `name`),
fuseau horaire, format de date, e-mail d'administration, réglages de lecture (page
d'accueil, éléments par page), réglages de discussion, réglages de médias, réglages
de permaliens (ils sont dans le schéma des collections), réglages de confidentialité.

## 2. Ce que font les CMS de référence

WordPress a **sept** écrans de réglages (Général, Écriture, Lecture, Discussion,
Médias, Permaliens, Confidentialité). Cogenta en a un, avec une option.

| Réglage | WordPress | Drupal 11 | Cogenta |
|---|---|---|---|
| Titre, accroche, logo, favicon | ✅ | ✅ | `name` seulement |
| E-mail d'administration | ✅ | ✅ | ❌ |
| Fuseau horaire | ✅ | ✅ | ❌ |
| Format de date et d'heure | ✅ | ✅ | ❌ |
| Page d'accueil | ✅ | ✅ | ❌ (`/home` en dur) |
| Éléments par page | ✅ | ✅ | ❌ |
| Visibilité moteurs de recherche | ✅ | ✅ | ❌ |
| Réglages de discussion | ✅ | ✅ | sans objet (fiche 15) |
| Tailles d'images | ✅ | ✅ | ❌ (dérivées) |
| Confidentialité / cookies | ✅ | ✅ | ❌ |
| Langues du site | plugin | ✅ | fichier |
| Page 404 personnalisée | plugin | ✅ | ✅ (`notFoundPath`) |
| Fournisseur e-mail | ✅ | ✅ | fichier |

## 3. La décision centrale : où vit un réglage ?

C'est la question de cette fiche, et elle a déjà été tranchée deux fois dans ce projet,
dans deux directions différentes :

- **`ops-settings.tsx`** : fichier seul, admin en lecture. Argument : le réglage doit
  voyager avec le déploiement.
- **L19** : proposer partout, appliquer seulement en développement. Argument :
  ADR-0010, le schéma est en lecture seule en production.

Ni l'une ni l'autre ne répond au besoin d'un rédacteur qui veut changer l'accroche de
son site. Il faut donc **une troisième catégorie explicite** :

| Catégorie | Exemples | Où | Modifiable dans l'admin |
|---|---|---|---|
| **Infrastructure** | base, cache, file, stockage, fournisseurs | fichier | non, lecture seule |
| **Sécurité et déploiement** | CORS, CSP, HSTS, cache de page | fichier | non, lecture seule |
| **Éditorial** | accroche, logo, fuseau, format de date, page d'accueil, éléments par page, discussion, confidentialité | **base** | **oui** |
| **Préférence personnelle** | langue de l'interface, densité, widgets | `localStorage` | oui |

**Recommandation** : livrer cette classification comme une **ADR courte**. Elle ne
contredit ni ADR-0010 (qui porte sur le schéma) ni l'argument d'`ops-settings` (qui
porte sur l'infrastructure) : elle nomme une troisième catégorie qui n'avait jamais
été traitée. Et la nommer explicitement évite la dérive « chaque nouveau réglage
choisit son camp au cas par cas ».

## 4. Plan de développement

### Tâche 1 — Table de réglages de site

**Fichiers** : nouveau module (`@cogenta/schema` ou `@cogenta/core`), route
`/api/settings`, migration.

Un magasin clé/valeur typé, avec un schéma Zod déclarant chaque réglage : clé, type,
valeur par défaut, portée (site ou locale), permission requise. Un réglage inconnu
est refusé — pas un dépotoir de clés libres.

Toute écriture produit une entrée d'audit.

**Critère** : ajouter un réglage nouveau = une ligne de déclaration, et il apparaît à
l'écran sans code d'interface supplémentaire.

### Tâche 2 — Écran « Réglages » à onglets

**Fichiers** : `routes/settings.tsx` (réécriture), `shell/nav-items.ts`.

Onglets, sur le modèle de WordPress parce qu'il est connu de tout le monde :

- **Général** : titre affiché, accroche, e-mail d'administration, fuseau horaire,
  format de date et d'heure, langue par défaut du site.
- **Lecture** : page d'accueil (remplace le repli `/home` en dur de
  `theme-render.ts` — c'est une vraie correction, pas un confort), éléments par page,
  page 404 (`notFoundPath` existe déjà en configuration : décider s'il migre ici ou
  reste dans le fichier).
- **Discussion** : sans objet tant que la fiche [15](15-commentaires.md) n'est pas
  faite ; prévoir l'onglet.
- **Médias** : tailles de variantes, formats produits, taille maximale de
  téléversement.
- **Confidentialité** : page de politique, bandeau cookies (à n'afficher que si le
  site en pose réellement — Cogenta n'en pose aucun par défaut, et c'est un argument
  produit à ne pas dilapider), rétention des données.
- **Avancé** : lien vers `ops-settings.tsx`, en lecture seule et en le disant.

**Chaque champ affiche sa provenance** : « défini dans `cogenta.config.mjs` » ou
« modifiable ici ». C'est ce qui empêche l'écran de mentir.

### Tâche 3 — Fuseau horaire et formats

**Fichiers** : réglages, `packages/admin/src/lib/format.ts` (nouveau), et tout écran
qui affiche une date.

Aujourd'hui, chaque écran affiche des ISO brutes ou se fie au fuseau du navigateur.
Un fuseau de site et un format de date déclarés, plus **une seule** fonction de
formatage utilisée partout, corrigent d'un coup un défaut présent sur une douzaine
d'écrans.

Point délicat, à décider explicitement : la programmation de publication est saisie en
`datetime-local`, donc dans le fuseau du navigateur (le code le dit et c'est
volontaire). Avec un fuseau de site, il faut choisir lequel fait foi et **l'afficher
à côté du champ**. Un décalage silencieux entre les deux publie un article à la
mauvaise heure — et c'est le genre d'erreur qu'on ne découvre qu'après.

### Tâche 4 — Page d'accueil, réellement

**Fichiers** : réglages, `packages/cli/src/commands/theme-render.ts`.

`theme-render.ts` retente `/home` en dur quand `/` ne correspond à rien. C'est un
pansement honnête et documenté. Le remplacer par un réglage explicite « page servie à
la racine », avec un repli sur le comportement actuel si rien n'est choisi.

**Critère** : choisir une autre page d'accueil depuis l'admin, sans redéployer.

### Tâche 5 — Miroir de configuration enrichi

**Fichiers** : `routes/ops-settings.tsx`.

Garder la lecture seule, et étendre la couverture à toutes les sections que l'écran ne
montre pas encore : base (driver et **jamais l'URL**, qui contient un mot de passe),
cache, file, stockage, fournisseurs LLM/embeddings/vecteur (présence et modèle,
jamais la clé), facturation.

Deux constats hors périmètre L10 restent ouverts et concernent directement cet écran :
`create-cogenta` écrit l'URL de base de données — mot de passe compris — verbatim dans
`cogenta.config.mjs`, que le `.gitignore` généré ne couvre pas, et `SECRET_KEYS` ne
liste pas `database.url` ; et le `.env` généré (qui contient
`COGENTA_AUTH_SIGNING_KEY`) est écrit sans `mode`, donc lisible par les autres
locataires d'un hébergement mutualisé. **L'écran doit détecter et signaler ces deux
situations** : c'est exactement le rôle d'un miroir de configuration.

## 5. Critères d'acceptation

- Un rédacteur change l'accroche et la page d'accueil sans terminal.
- Chaque réglage dit d'où il vient et s'il est modifiable.
- Aucun secret n'apparaît, nulle part, sur aucun écran de réglages.
- Toutes les dates de l'admin passent par une seule fonction de formatage.
- Le fuseau qui fait foi pour une programmation est affiché à côté du champ.
- L'écran signale un secret présent dans un fichier versionné.

## 6. Tests exigés

- Bout en bout : changer la page d'accueil, `curl /`, obtenir la nouvelle page.
- Unitaires : refus d'un réglage hors schéma.
- Sécurité : aucun champ portant un secret n'est sérialisé vers le client — test
  explicite sur `database.url` et sur les clés de fournisseur.
- Unitaires : le détecteur de secret en fichier versionné (les deux cas ci-dessus).
- Permissions : réglages éditoriaux réservés à `admin` ; préférences personnelles
  accessibles à tous.
- Bout en bout : programmation avec un fuseau de site différent de celui du
  navigateur — l'heure de publication réelle est celle annoncée.

## 7. Pièges connus

- **Deux sources de vérité.** C'est l'argument exact qui a rendu `ops-settings.tsx`
  volontairement en lecture seule. La classification de la section 3 est ce qui évite
  de le répéter ; sans elle, chaque réglage rouvre le débat.
- **Le fuseau horaire est un piège à décalage.** Une date affichée dans un fuseau et
  saisie dans un autre publie au mauvais moment. Une seule fonction, et le fuseau
  écrit à côté du champ.
- **Les secrets fuient par les écrans de réglages** — c'est le mode de fuite le plus
  classique. `database.url` contient un mot de passe.
- **Ne pas ajouter de bandeau cookies par défaut** : Cogenta n'en pose aucun, et
  c'est un argument produit. Le réglage doit exister pour un site qui en pose, pas
  imposer un bandeau à ceux qui n'en ont pas besoin.
- **`notFoundPath` a une bonne raison d'être en configuration** (commentaire du
  schéma) : le migrer en base n'est pas gratuit, à trancher plutôt qu'à faire par
  symétrie.

## 8. Décisions à prendre

- **ADR de classification des réglages** (section 3) — préalable à tout le reste.
- Quels réglages existants migrent du fichier vers la base : recommandation, **aucun**
  dans un premier temps. N'ajouter que les réglages éditoriaux qui n'existent nulle
  part, et laisser le fichier tranquille.
- Fuseau : celui du site fait foi pour la publication (recommandé, prévisible) ou
  celui du navigateur (statu quo).
