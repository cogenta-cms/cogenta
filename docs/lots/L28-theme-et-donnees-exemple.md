# L28 — Appliquer un thème avec ses données d'exemple

> Demandé en direct par l'utilisateur le 2026-09-14, après avoir appliqué un thème refait en
> L27 sur son site local : « quand j'applique un thème je n'ai pas le même résultat, il faut
> permettre que soit on applique juste le thème, soit on applique le thème + les sample data
> (comme on fait sur WordPress, donc on demande si on reset complètement le site ou si on
> importe les sample data en conservant les données déjà sur le site), afficher les warnings ».
> Mode de travail : autonomie (CLAUDE.md). Ce document est la source de vérité de reprise.

## Le constat

Un thème ne dessine que ce que le site contient. Les démos vues sur les sites scaffoldés de
L27 (page d'accueil composée, menus, accroche, réseaux, photos, articles, plats, produits,
événements, collections dédiées comme `dish`, `product`, `case_study`) viennent du **pack de
contenu du blueprint** (`packages/create-cogenta/src/blueprints/*.ts`), semé une seule fois par
`npm create cogenta`. Appliquer `@cogenta/theme-restaurant` sur un site existant change donc la
mise en page, jamais le contenu : le résultat ne ressemble pas à la démo.

## Décisions (autonomie, signalées dans le rapport)

### D1 — Un nouveau paquet `@cogenta/starters` porte les packs de contenu

`create-cogenta` dépend de `@cogenta/cli` ; la CLI ne peut donc pas importer les blueprints sans
cycle. Les packs (`blueprints/`), le rendu procédural `demo-art`, les photos et logos bundlés
(`assets/`), `seedDemoMedia`, les semeurs de menus et réglages et le type `BlueprintContentPack`
sortent dans `@cogenta/starters`, dont dépendent `create-cogenta` (qui réexporte, zéro rupture
pour ses appelants) et `@cogenta/cli`. Aucune dépendance npm nouvelle (R9) : le paquet ne dépend
que de paquets du monorepo. **Conséquence humaine** : la première publication npm d'un nouveau
paquet exige la configuration du Trusted Publisher OIDC par l'humain (CLAUDE.md).

### D2 — Trois choix, jamais appliqués sans décision humaine (R6)

À la sélection d'un thème dans Apparence :

1. **Thème seul** — mise en page, avec ou sans ses couleurs et polices (L27, déjà livré).
2. **Thème + données d'exemple, en conservant le site** — import additif.
3. **Thème + données d'exemple, en réinitialisant le site** — remplacement.

Un thème sans pack de contenu (`canonical`, thèmes locaux) ne propose que le choix 1. La
correspondance thème → blueprint se lit sur `defaultTheme` des packs, jamais une table en dur.

### D3 — Aperçu avant application, avec avertissements chiffrés

`POST /api/theme/sample-data/preview` calcule sans rien écrire ce que l'import ferait : collections
et taxonomies ajoutées, collections existantes compatibles ou non, entrées importées, entrées
ignorées pour conflit de slug, menus et réglages remplis ou conservés, médias ajoutés, et pour
une réinitialisation le nombre exact d'entrées, termes, médias, menus et réglages supprimés. L'écran
affiche ces avertissements avant tout bouton d'application. `POST /api/theme/sample-data/apply`
rejoue le même calcul (jamais une confiance aveugle dans l'aperçu envoyé par le client).

### D4 — Conserver : strictement additif, jamais un écrasement

- Collection ou taxonomie absente : ajoutée au schéma, tables créées.
- Collection présente et **compatible** (chaque champ utilisé par les entrées d'exemple existe avec
  le même type) : entrées importées ; **incompatible** : ses entrées sont ignorées, avertissement nommé.
- Entrée dont le slug existe déjà (dont la page d'accueil) : ignorée, l'entrée du site est gardée,
  avertissement nommé.
- Menu d'un emplacement déjà rempli, réglage déjà renseigné (accroche, réseaux, note de pied) :
  conservé, avertissement ; sinon rempli.
- Médias : toujours ajoutés (nouvelles lignes, jamais de remplacement).
- Thème activé avec ses couleurs et polices (le choix « thème + données » est un choix de look complet).

### D5 — Réinitialiser : destructif, donc sauvegarde vérifiée et confirmation explicite

Avant toute suppression, une **sauvegarde complète** est créée par la fonction réelle de
`cogenta backup create` (`createSiteBackup`, préfixe `theme-reset-`) et relue (manifeste présent,
nombre de tables et de lignes cohérent) ; sans sauvegarde valide, rien n'est supprimé. La
confirmation exige de saisir le nom du site. **Supprimé** : entrées de toutes les collections, termes,
menus, médias (lignes et fichiers), redirections, réglages publics d'identité (accroche, réseaux,
note de pied), surcharges de thème. Le schéma est **remplacé** par celui du pack (une collection
propre au site disparaît du schéma ; ses tables sont conservées dans la sauvegarde). **Jamais
supprimé** : comptes utilisateurs, clés d'API, journal d'audit, fournisseurs et agents, réglages
techniques. Le rapport nomme le fichier de sauvegarde et la commande `cogenta restore apply`.

### D6 — Uniquement sous `cogenta dev` (ADR-0010, ADR-0023)

Importer des données d'exemple écrit le schéma. Sous `cogenta serve`, les choix 2 et 3 sont
visibles mais désactivés, avec l'explication et la commande à lancer ; le choix 1 reste disponible.
Les routes répondent `CONTENT_READ_ONLY` hors développement.

### D7 — `cogenta dev` redémarre seul quand le schéma change

Le processus charge ses collections au démarrage (L19 le signalait déjà). Sous `cogenta dev`, un
superviseur relance le serveur quand `cogenta.schema.*` change ; l'écran admin affiche « Le site
redémarre… » et se reconnecte. `cogenta serve` n'est pas concerné (production : jamais de
redémarrage implicite).

### D8 — Les entrées d'exemple restent du contenu humain de démonstration

Même règle que L25 : publiées, `provenance: 'human'` (texte écrit par le projet, pas par un
modèle), nommant le site (`siteName`). Les photos passent par le pipeline média réel.

## Ordre de travail (séquentiel : la machine partagée manque de mémoire)

1. D1 — extraction de `@cogenta/starters` (création du paquet, déplacement, réexports, tests
   déplacés, `create-cogenta` inchangé pour ses appelants, build/typecheck/tests verts).
2. D7 — superviseur de `cogenta dev`.
3. D3–D6, D8 — moteur d'import dans la CLI, routes API, tests d'intégration sur SQLite réel
   (conserver, réinitialiser, conflits, sauvegarde, refus hors dev).
4. D2/D3 — écran Apparence : trois choix, avertissements, confirmation par nom du site, état de
   redémarrage ; tests admin.
5. Vérification réelle : un site `blog` existant, application de `restaurant` en « conserver » puis
   en « réinitialiser », captures, restauration de la sauvegarde.

## État d'avancement

| Étape | État | Notes |
|---|---|---|
| Diagnostic et décisions | fait | 2026-09-14 |
| D1 `@cogenta/starters` | à faire | |
| D7 superviseur `cogenta dev` | à faire | |
| Moteur d'import et routes | à faire | |
| Écran Apparence | à faire | |
| Vérification réelle | à faire | |
