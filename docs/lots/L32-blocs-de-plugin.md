# L32 — Des blocs et des widgets qu'un plugin apporte

> Demandé en direct après l'essai de L31 : « le but c'est vraiment d'avoir la
> possibilité d'améliorer la page en ajoutant des blocs ou autre, comme ça se
> fait sur WordPress. »

## Le problème, énoncé honnêtement

Une galerie est déjà native, deux fois : le bloc `gallery` du contrat B (grille,
carrousel, mosaïque) et le widget `gallery`. Ce qui manque n'est pas la galerie,
c'est **tout ce qui n'est pas déjà dans le vocabulaire** : un comparateur, un
compte à rebours, une carte, un bloc propre à un métier.

Aujourd'hui un plugin sait réagir à un événement, servir **sa propre** page sous
`/_cogenta/plugins/<nom>/`, et tourner sur une cadence. Il ne sait pas ajouter un
bloc à une page existante. `provides.blocks` existe dans la *forme* du manifeste
depuis L7 — avec son `fallback` obligatoire — mais **rien ne le lit** : L7 l'a
écrit tout de suite pour ne pas casser la forme du manifeste le jour où on le
brancherait, et a remis le branchement à plus tard. Ce lot est ce jour-là.

## La décision qui tient tout : un bloc de plugin n'entre pas dans le vocabulaire

Le contrat B est **gelé**, et AGENTS.md exige une RFC pour y ajouter un bloc.
Rien de ce lot n'y touche : un bloc de plugin est une **extension enregistrée à
côté**, avec un repli déclaré vers un bloc du vocabulaire. C'est exactement ce
que `BlockRegistry` prévoit depuis le premier jour (« les douze du vocabulaire,
plus ce qu'un thème ou un plugin ajoute »), et ce que `resolveRenderable`
implémente déjà : suivre `fallback` jusqu'à trouver quelque chose que le thème
sait rendre.

La conséquence est la garantie anti-enfermement rendue concrète : **une page
écrite avec un bloc de plugin continue de s'afficher après la désinstallation du
plugin ou un changement de thème** — dégradée, jamais perdue. `resolveBlockForRender`
valide déjà les données contre le schéma du repli et rend `null` si elles ne
collent pas : un bloc de plugin mal replié disparaît, il ne casse pas la page.

## Ce qu'un plugin rend, et ce qu'il ne peut pas rendre

Un plugin ne rend **jamais une chaîne HTML**. Il renvoie l'arbre de
`@cogenta/theme-kit` — `{kind:'element', tag, attrs, children}` — qui est déjà du
JSON pur, donc traverse la frontière du bac à sable sans rien inventer, et qui
n'a **aucun `raw()`** par construction (R3 : un bloc ne stocke ni HTML ni CSS,
et ici il n'en produit pas non plus). L'hôte revalide l'arbre reçu contre une
liste blanche de balises et d'attributs avant de le sérialiser : pas de
`<script>`, pas de `on*`, pas de `javascript:`.

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 1 | Déclarer et enregistrer : `provides.blocks` gagne un libellé, un schéma de champs déclaré **en données** et `fallbackFrom` ; un bloc de plugin devient une vraie `AnyBlockDefinition` du registre du site | **fait** |
| 2 | Rendre : handler `onRenderBlock`, exécution dans le processus restreint de L31, validation de l'arbre reçu contre une liste blanche, cache par empreinte, repli sur erreur/absence/désactivation | **fait** |
| 3 | L'éditeur : le bloc apparaît dans le panneau d'insertion avec ses champs et les libellés que son auteur a écrits, et la prévisualisation le rend vraiment | **fait** |
| 4 | Les widgets : même chose pour un type de widget fourni par un plugin | à faire |
| 5 | ADR, documentation d'auteur, et un vrai plugin d'exemple vérifié dans un navigateur sur un site réel | à faire |

## Pièges connus, écrits avant de coder

1. **Le coût du rendu.** Un bloc de plugin rendu à chaque visite, c'est un
   `fork` par bloc et par requête. Inacceptable tel quel : le rendu est mis en
   cache sur l'empreinte (plugin + version + empreinte du code + type + données +
   locale), et le plafond de huit exécutions simultanées de L31 s'applique déjà.
2. **Un thème tiers n'a pas à connaître ce lot.** Le point d'extension du
   contrat D est additif (`theme@1.7`) ; un thème qui ne l'implémente pas rend le
   repli, ce qui est la dégradation voulue, pas un accident.
3. **Un bloc de plugin n'est pas une porte vers l'hôte.** Le rendu tourne avec
   les capacités accordées au plugin, et un bloc qui n'en demande aucune n'a
   accès à rien — ni base, ni réseau, ni fichiers (R5 vaut pour lui comme pour un
   thème).
4. **Désinstaller doit rester sans danger.** Les données du bloc restent dans
   l'entrée ; c'est le rendu qui disparaît, remplacé par le repli.


## Ce qui est fait (2026-09-16)

**Étape 1.** `PluginBlockProvision` gagne `label`, `fields` (déclaré en données,
parce que `plugin.manifest.json` est lu et jamais exécuté depuis la revue de
sécurité de L31), `headingLevel` et surtout **`fallbackFrom`** : d'où le bloc de
repli tire ses valeurs. Sans cette carte, « il se replie en `prose` » voulait
dire « il disparaît » — les données d'un `countdown` ne satisfont pas le schéma
de `prose`. `@cogenta/blocks` gagne `blockFieldFromDeclaration` /
`blockSchemaFromDeclaration` : le schéma est construit par **les constructeurs
`f.*` du vocabulaire lui-même**, donc un bloc de plugin a le même validateur, la
même enveloppe et la même chaîne de repli qu'un autre. Le contrat B ne bouge pas :
`VOCABULARY_NAMES` compte toujours dix-sept noms, vérifié par un test.

**Étape 2.** Le plugin implémente `onRenderBlock` et renvoie **un arbre**, jamais
une chaîne : la forme de nœud de `@cogenta/theme-kit` est déjà du JSON, donc elle
traverse la frontière du bac à sable sans rien inventer, et elle n'a aucun
`raw()`. L'hôte revalide quand même — liste blanche de balises et d'attributs,
URLs (`javascript:`, `data:` non-image), profondeur, nombre de nœuds, taille du
texte — parce qu'un plugin est du code tiers et que sa sortie est de la donnée
venue de l'extérieur (R8). Un bloc qui émet un `<script>` est **refusé en entier**
et remplacé par son repli, jamais « nettoyé » en autre chose. Le rendu tourne
dans le processus enfant restreint de L31, via un nouveau `PluginRuntime.invokeHandler`
qui applique les mêmes gardes qu'une route (plafond de huit exécutions, capacités
accordées, désactivation sur violation). Le résultat est mis en cache sur
l'empreinte (plugin, version, type, valeurs, locale), sinon un bloc coûterait un
`fork` par visite. Contrat D monté en **`theme@1.7`**, additif : `RenderContext.blockNodes`,
honoré par une ligne (`providedBlockNode`) dans chacun des dix thèmes ; un thème
tiers qui l'ignore rend le repli, ce qui est la dégradation promise depuis L3.

**Étape 3.** `GET /api/plugins/blocks` décrit les blocs du site dans la forme
qu'utilise la table de blocs de l'admin — **avant la porte admin**, parce que
c'est un rédacteur qui en a besoin : sans elle, le bloc qu'il édite n'aurait ni
libellé ni champs. L'admin les enregistre à côté du vocabulaire gelé, en
**restreignant** (jamais en castant) les types de champ qu'il sait rendre : un
`kind` venu d'un serveur plus récent est ignoré, le bloc se place quand même. Les
prévisualisations (page builder, apparence) reçoivent le registre et le rendeur,
sinon éditer un bloc de plugin se ferait à l'aveugle.

**Vérifié dans un navigateur, sur `examples/local-playground`** : un vrai plugin
`comparatif` déclare un bloc « Tableau comparatif » (titre, deux colonnes, liste
de lignes) ; il apparaît dans le panneau d'insertion (cherché par son libellé et
par `comparisonTable`), ses champs portent les libellés écrits par son auteur
(« Titre », « Colonne de gauche »), il figure dans le plan de la page, et la
prévisualisation dessine son vrai tableau au milieu des blocs du vocabulaire.
Trois tests de bout en bout sur un vrai serveur couvrent le reste : une page
s'enregistre avec un bloc que le vocabulaire n'a jamais connu, un plugin qui lève
une exception se replie sur le bloc qu'il a nommé, et un plugin qui émet un
script voit son bloc refusé.

**Étape 4.** Un plugin déclare aussi des **types de widget** (`provides.widgets`),
même forme et même implémentation que les blocs — le processus, la liste blanche,
le cache et la politique d'échec sont partagés exprès, pour qu'un trou fermé d'un
côté ne puisse pas rester ouvert de l'autre. Deux différences voulues : un widget
**ne déclare pas de repli** (un widget est de l'habillage, pas du contenu — celui
qui ne peut pas se rendre n'est pas dessiné, et ses réglages attendent en base) ;
et **aucun thème n'a eu besoin d'une ligne**, puisque les zones de widgets sont
rendues par `renderWidgetArea` de theme-kit et non par chaque thème.
`@cogenta/widgets` accepte des `extraTypes` : un type fourni par un plugin est
validé contre le schéma que ce plugin a déclaré, et un type que rien ne sait
rendre reste refusé — la base ne doit jamais contenir un widget que personne ne
peut dessiner. Côté admin, le type apparaît dans la bibliothèque sous un groupe
« Extensions », avec un formulaire de réglages **engendré** à partir des champs
déclarés.

**Étape 5.** `docs/guide-plugin.md` gagne une section complète (déclarer, rendre,
ce que l'hôte refuse, ce que ça coûte) ; `examples/plugin-starter` — le modèle que
le guide désigne — fournit maintenant un bloc et un widget, et **son propre test
les exécute vraiment** dans le bac à sable et compare l'arbre rendu, donc
l'exemple ne peut pas pourrir en silence.

### Reste à faire, et limites assumées

- **ADR-0033 rédigée, non insérée** (`docs/03-decisions.md` est protégé en
  écriture — texte ci-dessous, à insérer par l'humain).
- **Cache en mémoire**, borné à 500 rendus : un redémarrage le vide, donc un bloc
  de plugin sur une page très visitée paie un `fork` au premier affichage après
  chaque redémarrage. Un cache durable serait un vrai choix d'infrastructure
  (R1), pas une retouche.
- **Un bloc de plugin ne fournit pas son propre CSS.** Il émet des classes ; les
  styler reste au thème ou à la personnalisation d'apparence. Donner à un plugin
  une feuille de style servie sur l'origine du site est une décision de sécurité
  à prendre séparément, pas un oubli.
- **L'édition en place du page builder** (double-clic sur un texte) ne couvre pas
  les champs d'un bloc de plugin : elle reconnaît les champs texte simples que le
  *type de bloc* déclare au thème, et un bloc de plugin est rendu par le plugin,
  pas par le thème. Le panneau de droite l'édite normalement.

## ADR-0033 — prête à insérer (fichier protégé)

```markdown
## ADR-0033 — Un plugin étend le vocabulaire sans y entrer

**Date** : 2026-09-16
**Statut** : acceptée

### Contexte

Les contrats B (blocs) et le vocabulaire de widgets sont fermés et figés. Un
utilisateur demande ce que tout CMS permet : qu'une extension ajoute un composant
à une page. Trois voies existaient :

1. ouvrir le contrat B par RFC à chaque besoin — un vocabulaire figé qui grossit
   n'est plus figé, et chaque ajout est une migration pour tous les thèmes ;
2. laisser un plugin rendre du HTML libre — ce que fait WordPress, et ce que R3
   interdit explicitement (« un bloc ne stocke jamais de HTML ni de CSS ») ;
3. enregistrer les blocs d'un plugin **à côté** du vocabulaire, avec un repli
   déclaré vers un bloc du vocabulaire.

`BlockRegistry` prévoyait la troisième depuis L3 (« les blocs du vocabulaire, plus
ce qu'un thème ou un plugin ajoute ») et `resolveRenderable` en implémentait déjà
la chaîne de repli, sans que rien ne l'utilise.

### Décision

Un bloc ou un widget fourni par un plugin **n'entre jamais dans le vocabulaire**.
Il est enregistré à côté, pour ce site-là, et :

- un **bloc** déclare un `fallback` (obligatoire) et un `fallbackFrom` qui dit
  d'où les champs du repli tirent leurs valeurs ; sans cette carte, « se replier
  sur `prose` » signifierait « disparaître », les données d'un bloc arbitraire ne
  satisfaisant pas le schéma d'un bloc du vocabulaire ;
- un **widget** ne déclare pas de repli : c'est de l'habillage, et un widget
  absent n'est pas dessiné ;
- le schéma des champs est déclaré **en données** dans `plugin.manifest.json`,
  jamais en code (ADR de L31 : le manifeste est lu, jamais exécuté), et il est
  compilé par les constructeurs `f.*` du vocabulaire lui-même, donc un bloc de
  plugin a le même validateur et la même enveloppe qu'un autre ;
- le rendu renvoie **un arbre** (`@cogenta/theme-kit`), jamais une chaîne, et
  l'hôte le revalide contre une liste blanche de balises, d'attributs et d'URLs
  avant sérialisation ; un arbre refusé fait tomber le bloc sur son repli, il
  n'est jamais « nettoyé » en autre chose ;
- le rendu s'exécute dans le processus enfant restreint de L31, avec les seules
  capacités accordées, et son résultat est mis en cache sur l'empreinte des
  entrées.

Contrat D monté en `theme@1.7`, additif : `RenderContext.blockNodes` porte le
markup déjà produit par l'hôte, et `ResolvedWidget` gagne un membre du même
genre. Un thème qui ignore l'un ou l'autre rend le repli déclaré — la dégradation
promise depuis L3, pas un accident.

### Conséquences

- Le contrat B reste figé et son compte de blocs ne bouge pas ; aucune RFC n'est
  requise pour qu'un site gagne un composant.
- Désinstaller un plugin dégrade les pages qui utilisaient ses blocs au lieu de
  les vider, et laisse leurs données intactes pour une réinstallation.
- Un bloc de plugin coûte une exécution de plugin au premier rendu de chaque
  combinaison (plugin, version, valeurs, locale) ; le cache est en mémoire, donc
  ce coût revient après un redémarrage.
- Un plugin ne peut pas livrer de CSS : il émet des classes, le thème les style.
  C'est une limite volontaire de cette ADR, à rouvrir séparément si besoin.
```
