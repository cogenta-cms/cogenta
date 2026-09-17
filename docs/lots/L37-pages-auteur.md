# L37 — Les pages d'auteur

> Deuxième série de manques face à WordPress, engagée le 2026-09-17 : pages d'auteur,
> aperçu automatique des liens intégrés (oEmbed), recadrage et rotation dans la
> médiathèque, tri par la date propre à une collection. Ce lot traite le premier.

## Le problème

Un article affiche le nom de son auteur (contrat D `theme@1.4`, quand le compte a un nom
public), mais ce nom ne mène nulle part. WordPress a une page par auteur depuis toujours ;
un magazine ou un blog à plusieurs plumes l'attend.

## Décisions

1. **Adresse : `/archive/author/{slug}`**, pas `/author/…`. Le modèle Magazine déclare une
   taxonomie nommée `author`, dont les archives de termes répondent déjà à `/author/…` ;
   `/archive/` est la famille des archives par date, réservée à l'hôte.
2. **Une page n'existe que pour un compte qui a un nom public et au moins un contenu daté
   publié** (une collection routée qui déclare `publishedAt`). Tout le reste est un 404 :
   les adresses ne servent pas à énumérer les comptes, et les pages légales d'un site ne
   font pas d'un administrateur un « auteur ». Un auteur dont aucun contenu n'est lisible
   par le visiteur n'a pas de page pour lui.
3. **Le slug vient du nom public** ; le plus ancien compte garde le slug simple, un
   homonyme reçoit un suffixe tiré de son identifiant, stable même si d'autres comptes
   apparaissent ou disparaissent.
4. **Même rendu que les archives de termes et de dates** (`renderTermArchivePage`), mêmes
   relectures d'entrée à travers la couche de permissions (R4), même plafond de 600.
5. **Contrat D `theme@1.8`, additif** : `PageEntryAuthor.href` (la signature devient un
   lien) et `TermArchiveInput.intro` (bio et portrait). Deux aides `@cogenta/theme-kit`,
   `authorNode` et `renderArchiveIntro`, une ligne chacune dans les dix thèmes. Aucune ADR :
   c'est un ajout par le bas, comme `theme@1.5`.
6. Les pages d'auteur entrent dans `/sitemap.xml`.

## Vérifié

- `packages/cli/test/serve-author-archive.test.ts` sur un vrai serveur : liste et bio,
  brouillon absent, lien depuis l'article, homonyme séparé, 404 et pas de lien sans nom
  public ou sans contenu daté, présence dans le plan du site.
- `packages/theme-kit/test/author.test.ts` : lien ou texte, intro ou rien.
- Suites complètes de `theme-kit`, des dix thèmes et de la CLI. Les chartes de quatre
  thèmes interdisent les coins arrondis sur une photo : le portrait est carré partout.
- Dans un navigateur, sur la vitrine en français : la signature d'une actualité mène à
  `/archive/author/helene-vasseur`, qui affiche la bio puis les articles.

## Reste ouvert

- **Sur un site de démonstration, la page d'auteur n'apparaît qu'une fois le nom public
  renseigné** : l'installation attribue le contenu semé au compte administrateur, mais ne
  lui invente pas de nom — c'est à la personne qui installe de le choisir dans son profil.
  Vérifié sur la vitrine : dès le nom et la bio saisis, les quatre actualités portent le
  lien et la page les liste.
- Le slug suit le nom public : le changer change l'adresse de la page (aucune redirection
  automatique n'est créée).
