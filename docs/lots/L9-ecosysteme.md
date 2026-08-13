# L9 — Écosystème

## Objectif

Tout ce qui fait qu'un projet open source est adopté plutôt qu'admiré : l'installation,
la migration, la documentation, la gouvernance.

Ce lot n'est pas un lot final. **Il commence à L3** et se poursuit en continu. Un projet
qui reporte sa documentation à la fin ne la fait jamais.

## Dépendances

L3 pour l'installeur et la génération de skin. L1 pour l'import. Le reste est
indépendant.

## Périmètre

- `create-cogenta` et l'assistant d'installation
- Génération de skin par IA
- Blueprints de site
- Import WordPress, Ghost, Markdown
- CLI complet
- Profil mutualisé testé et documenté
- Documentation fonctionnelle et technique
- Site du projet et playground
- Gouvernance : contribution, sécurité, RFC, roadmap

## L'assistant d'installation

C'est la première impression. **Moins de 60 secondes entre la commande et un site qui
tourne**, sinon la moitié des essais s'arrêtent là.

Le déroulé :

1. Vérification de l'environnement — version de Node, gestionnaire de paquets, droits
   d'écriture, services détectés
2. Nom du site, URL, langue principale
3. **Type de site** → sélection d'un blueprint
4. **Base de données** — SQLite proposé par défaut avec « vous pourrez changer plus
   tard », Postgres et MySQL proposés si détectés
5. **Fournisseur LLM** — liste, dont « aucun pour l'instant » en option de premier rang,
   pas cachée en bas
6. Modèle et clé API si un fournisseur est choisi ; validation immédiate de la clé
7. **Génération du skin** si un LLM est configuré, sinon skin par défaut
8. Compte administrateur, avec passkey proposée avant le mot de passe
9. Installation, migrations, contenu de démo
10. Récapitulatif : ce qui est actif, ce qui est dégradé et pourquoi, prochaine étape

Règles :

- Chaque question a un **défaut sensé**. Appuyer sur Entrée neuf fois doit produire un
  site fonctionnel.
- Aucune question dont l'utilisateur ne peut pas comprendre l'enjeu à ce moment-là.
- Une erreur d'environnement dit quoi faire, pas seulement ce qui a échoué.
- `--yes` pour tout accepter, `--config fichier` pour une installation non interactive.

## Génération de skin par IA

L'IA **ne produit pas de CSS**. Elle remplit le schéma de tokens du contrat D, à partir
d'une description en langage naturel : secteur, ambiance, public, éventuelles couleurs
de marque.

Le pipeline :

1. Description libre de l'utilisateur, plus le blueprint choisi
2. Le modèle produit un JSON de tokens, et rien d'autre
3. **Validation automatique en refus dur** : contraste AA sur toutes les paires,
   échelle typographique monotone, tokens complets, mouvement respectant
   `prefers-reduced-motion`
4. En cas d'échec, correction automatique et nouvelle validation, trois tentatives
5. Aperçu proposé sur trois pages types, avec possibilité de régénérer ou d'ajuster

C'est la différence entre « l'IA écrit un thème », qui ne marche jamais, et « l'IA
configure un thème », qui marche toujours. La contrainte fait la qualité.

## Blueprints

Un blueprint = modèle de contenu + skin + agents préconfigurés + contenu de démo + pages
types.

Livrés : vitrine, blog, magazine, portfolio, documentation, association, restaurant,
SaaS.

C'est la réponse concrète à « le CMS s'adapte à tout type de site ». Un blueprint n'est
pas un thème : c'est une configuration complète et cohérente dont on peut ensuite tout
changer.

## Import

**WordPress (WXR)** en priorité — c'est la rampe d'accès du projet.

À traiter, et c'est plus dur que ça n'en a l'air : articles et pages, catégories et
étiquettes, médias (téléchargement et réécriture des URL), auteurs, commentaires,
champs personnalisés, blocs Gutenberg convertis vers le vocabulaire sémantique quand
c'est possible, **redirections préservées**, et un rapport de ce qui n'a pas pu être
converti.

Le rapport de conversion est aussi important que la conversion : un import silencieux
qui perd 5 % du contenu est pire qu'un import qui le signale.

Puis Ghost (JSON), puis Markdown avec frontmatter.

## CLI

```
cogenta dev            # serveur de développement
cogenta build          # build vers la cible configurée
cogenta generate       # types, schéma, migrations
cogenta migrate        # appliquer, rollback, statut
cogenta doctor         # diagnostic complet
cogenta backup         # créer, lister, restaurer, tester
cogenta upgrade        # mise à jour avec migrations et vérification
cogenta deploy         # vers la cible configurée
cogenta import         # wordpress, ghost, markdown
cogenta theme          # lister, activer, valider
cogenta skin           # lister, appliquer, générer, valider
cogenta agent          # lister, activer, exécuter, tracer, budget
```

`cogenta doctor` est le plus important : il diagnostique l'environnement, les drivers
sélectionnés, les versions, les problèmes de configuration, et l'état de santé. C'est ce
qui évite la moitié des tickets.

## Profil mutualisé

Documenté et **testé sur un vrai hébergement cPanel**, pas supposé.

Ce qui doit être vérifié : Node via Passenger, MySQL, cron à la minute, absence de
Redis, absence de Docker, pas de compilation native, limites de mémoire, recyclage des
processus.

La documentation dit explicitement ce qui fonctionne, ce qui fonctionne en dégradé, et
ce qui ne fonctionne pas. Aucune surprise après installation.

## Documentation

**Fonctionnelle** — pour l'éditeur et le propriétaire de site. Sans jargon.

**Technique** — pour le développeur. Référence d'API générée depuis les types,
guides, tutoriels, recettes.

**Architecture** — les schémas, dont les SVG animés demandés, montrant les deux plans,
le cycle de vie d'un contenu, le cycle d'exécution d'un agent, le pipeline de build.

Trois règles : tout exemple de code est testé en CI et ne peut pas pourrir ; la
documentation d'un contrat vit à côté du contrat ; une fonctionnalité non documentée
n'est pas livrée.

## Gouvernance

`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `security.txt`, modèles d'issue
et de PR, processus de RFC pour toute modification de contrat ou ajout au vocabulaire de
blocs, roadmap publique, politique de versionnement et de dépréciation, CLA.

Un premier contributeur doit pouvoir soumettre un correctif utile en moins d'une heure,
sans poser de question.

## Tâches, dans l'ordre

1. `create-cogenta` : squelette, vérification d'environnement, questions, installation
2. `cogenta doctor`
3. Blueprint « blog » complet — celui qui sert au dogfooding
4. Contenu de démo et pages types
5. Documentation technique de démarrage
6. Import WordPress WXR avec rapport de conversion
7. Génération de skin par IA avec validation
8. Blueprints restants
9. CLI complet
10. Documentation fonctionnelle
11. Schémas d'architecture, dont les SVG animés
12. Site du projet et playground
13. Profil mutualisé testé et documenté
14. Fichiers de gouvernance et processus de RFC

## Critères d'acceptation

- `npm create cogenta` produit un site qui tourne en moins de 60 secondes, sur macOS,
  Linux et Windows
- Neuf fois Entrée produit un site fonctionnel
- Un export WordPress réel s'importe sans intervention manuelle, avec rapport
- Les redirections d'un site WordPress importé sont préservées
- Un skin généré par IA passe la validation, ou est rejeté et régénéré, jamais livré invalide
- `cogenta doctor` diagnostique correctement une installation cassée de trois façons différentes
- Tous les exemples de code de la documentation sont exécutés en CI
- Un contributeur externe soumet une PR acceptée sans poser de question préalable

## Tests exigés

| Type | Portée |
|---|---|
| e2e | Installation complète sur les trois systèmes |
| e2e | Installation non interactive avec `--yes` |
| Intégration | Import d'exports WordPress réels et variés |
| Validation | Corpus de skins générés, taux de rejet mesuré |
| Documentation | Exécution de tous les extraits de code |
| Manuel | Installation sur un hébergement mutualisé réel |

## Pièges connus

**L'installeur qui pose trop de questions.** Chaque question fait perdre des gens.
Si une valeur peut être déduite, elle est déduite ; si elle peut être changée plus tard,
elle n'est pas demandée maintenant.

**L'import WordPress est un marais.** Les exports réels sont sales, incomplets,
encodés de travers, avec des médias manquants. Construire sur un corpus d'exports réels,
jamais sur un export propre fabriqué pour l'occasion.

**La documentation qui pourrit.** D'où l'exécution des exemples en CI. C'est la seule
mesure qui tient dans le temps.

**Le playground coûte cher.** Un bac à sable public exécutant du code arbitraire est une
cible. Commencer par une démo en lecture seule réinitialisée périodiquement.

## Hors périmètre

Version traduite de la documentation (après stabilisation), marketplace commerciale,
programme de certification, hébergement géré.
