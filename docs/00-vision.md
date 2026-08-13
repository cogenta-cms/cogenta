# 00 — Vision

## Le problème

Le marché du CMS est coincé entre deux mondes qui ne se parlent pas.

D'un côté **WordPress et Drupal** : une expérience éditeur mûre, un écosystème
immense, et une dette technique et sécuritaire qui coûte cher tous les mois. Les
agences vivent de contrats de maintenance qui absorbent leur marge — mises à jour,
plugins qui cassent, sites compromis, clients qui appellent le vendredi soir.

De l'autre les **CMS headless modernes** — Strapi, Payload, Directus, Sanity :
excellente expérience développeur, mais pas de système de thèmes, une expérience
éditeur pauvre, et un frontend à reconstruire de zéro à chaque projet.

Aucun des deux n'a intégré l'IA autrement qu'en surface : un bouton « générer un
texte » branché sur un modèle, sans mémoire, sans autonomie, sans garde-fous, sans
capacité à agir sur le site.

## La proposition

> **Le premier CMS qui exploite les sites à votre place.**
> Il se surveille, se patche, s'optimise, et vous rend des comptes.

Cogenta n'est pas un CMS avec des fonctions d'IA. C'est un CMS dont le **runtime
multi-agents fait partie du noyau**, au même titre que la base de données ou le
moteur de rendu. Les agents surveillent les CVE et proposent les correctifs,
auditent le SEO à chaque publication, mesurent les performances, rédigent et
traduisent — chacun avec ses outils, ses permissions, sa mémoire, son budget et son
niveau d'autonomie, sous contrôle humain.

## Pour qui

**Les développeurs et les agences web.** Ceux qui construisent des sites pour des
clients non techniques, qui portent la responsabilité de la maintenance, et qui
lisent le code source avant d'adopter quoi que ce soit.

C'est le segment le plus mal servi : les CMS modernes leur donnent une bonne DX mais
laissent leurs clients incapables d'éditer ; WordPress fait l'inverse et leur coûte
en maintenance ce qu'il leur rapporte en projets.

## Ce que Cogenta n'est pas

- **Pas un builder no-code.** Le schéma de contenu est du code, versionné.
- **Pas un SaaS.** L'auto-hébergement est le mode par défaut, pas une option dégradée.
- **Pas un framework frontend.** On s'appuie sur Astro, on n'en réécrit pas un.
- **Pas dépendant de l'IA.** Sans clé API, sans fournisseur, en panne de réseau,
  le CMS reste pleinement fonctionnel. Les agents accélèrent ; ils ne conditionnent rien.
- **Pas un CMS pour blogueur solo sans développeur.** Le public est technique. On
  assume l'exclusion plutôt que de servir mal les deux.

## Les cinq convictions qui structurent le produit

**1. La sécurité est une propriété de l'architecture, pas une liste de fonctionnalités.**
Un plugin tiers ne doit pas *pouvoir* lire la base, pas simplement s'engager à ne pas
le faire. L'isolation, les permissions déclarées et le journal d'audit sont dans le
noyau.

**2. Un site doit pouvoir tourner sans serveur.**
Le plan de contrôle et le plan de diffusion sont séparés. Un site peut être servi en
statique sur un CDN, en SSR sur Node, ou en edge — sans changer une ligne de contenu
ni de thème.

**3. Aucune dépendance dure à une infrastructure.**
Redis, Docker, S3, worker persistant : tous optionnels, tous avec un driver dégradé.
`npm create cogenta` doit produire un site qui tourne, sans rien installer d'autre.
C'est ce qui permet aussi de servir l'hébergement mutualisé, que tout l'écosystème
Node a abandonné et où vit la majorité des petits sites.

**4. Le contenu est sémantique, jamais visuel.**
Un bloc stocke « un hero avec ce titre, cette image, ce bouton », jamais du HTML ni
des classes CSS. C'est la seule façon de changer de thème sans rien casser, et la
seule façon de rendre la génération de thème par IA fiable.

**5. Une action d'agent est une proposition avant d'être un fait.**
Diff, journal, réversibilité, budget, niveau d'autonomie explicite. On ne demande
jamais à l'utilisateur de faire confiance à un modèle : on lui donne les moyens de
vérifier.

## Critères de succès

**À six mois** — le blog du créateur tourne en production sur Cogenta. Les quatre
agents de la v1 fonctionnent sur un site réel.

**À douze mois** — cent sites en production hors du cercle initial. Dix contributeurs
externes. Un import WordPress qui marche sur des sites réels sans intervention manuelle.

**À vingt-quatre mois** — un écosystème de thèmes et de skins vivant. Des agences qui
gèrent des flottes. Le projet cité comme référence quand on parle de CMS agentique.

## Ce qui ferait échouer le projet

Par ordre de probabilité décroissante :

1. **La dispersion.** Le périmètre est immense. Sans discipline de découpage et de
   contrats figés, le projet s'effondre sous son propre poids vers le sixième mois.
2. **Des agents décevants.** Si les agents sont des gadgets, il ne reste qu'un
   Payload moins mûr, et aucune raison de migrer.
3. **Un incident de sécurité précoce.** Un projet qui vend la sécurité et se fait
   compromettre ne s'en relève pas.
4. **Une installation qui échoue.** Si `npm create` prend quatre minutes ou plante
   sur une plateforme courante, la moitié des essais s'arrêtent là.
