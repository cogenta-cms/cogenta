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
| 1 | Déclarer et enregistrer : `provides.blocks` gagne un libellé et un schéma de champs (types fermés, réutilisant `@cogenta/blocks`) ; un bloc de plugin devient une vraie `AnyBlockDefinition` du registre du site | à faire |
| 2 | Rendre : handler `onRenderBlock`, exécution dans le processus restreint de L31, validation de l'arbre reçu, cache par empreinte des données, repli sur erreur/absence/désactivation | à faire |
| 3 | L'éditeur : le bloc apparaît dans le panneau d'insertion du page builder avec ses champs, comme un bloc du vocabulaire | à faire |
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
