## ADR-0034 — Un thème peut venir d'un dossier local au projet, pas seulement d'un paquet npm de `@cogenta/cli`

**Statut** : Acté (en direct avec l'utilisateur, 2026-09-07)

**Contexte** — Depuis L23, `cogenta serve` ne peut activer qu'un thème présent dans
`BUILTIN_THEMES` : une liste figée, une par une, aux dépendances npm de `@cogenta/cli`
lui-même. Le commentaire du fichier était explicite : « jamais un scan du système de
fichiers ». Cette limite entrait frontalement en collision avec une demande produit déjà
formulée par l'utilisateur — générer des thèmes par IA — puisqu'un thème généré,
aussi bon soit-il, n'avait littéralement nulle part où être posé pour un site réel : il
aurait fallu le publier sur npm et l'ajouter à cette liste, un geste qui n'appartient
qu'à l'équipe Cogenta, jamais à l'opérateur d'un site.

**Décision** — `cogenta serve` cherche un thème d'abord dans `BUILTIN_THEMES`
(inchangé, à l'octet), puis dans `<projectRoot>/themes/<nom>/` — un dossier que le
projet du site possède lui-même, chargé dynamiquement au démarrage. Même principe que
`cogenta.schema.ts`, déjà chargé ainsi depuis L2. Un thème local suit exactement la
même forme qu'un thème npm (`theme.config.*` pour le manifeste, contrat D inchangé) et
gagne un second fichier requis, `theme.render.*`, exportant `renderPage`/`renderChrome`.

**Justification** — Le vocabulaire de blocs (contrat B) n'était pas le vrai verrou : un
bloc propre à un thème, avec repli, est déjà résolu côté rendu depuis la fiche 43. Le
verrou réel était l'emplacement où un thème peut vivre. `loadTheme`
(`@cogenta/render`) cherchait déjà dans `themes/` sans que rien ne l'appelle en
production — la moitié du travail était déjà écrite, simplement jamais branchée.

**Conséquences** — Un développeur peut écrire un thème à la main et le déposer dans
`themes/`, sans jamais invoquer l'IA ni ce dépôt. C'est la fondation de la fiche 73
(`docs/plans/73-themes-locaux-bac-a-sable-ia.md`) : bac à sable isolé, pipeline de
déploiement avec scan de sécurité, génération par IA, export/import — chacune une
tâche séparée, ordonnée, construite sur cette fondation.

**Le point de vigilance que cette ADR pose, sans le résoudre entièrement** — un thème
est du code exécuté dans le process de `cogenta serve`. `verifyTheme` (scan statique
d'imports interdits — `node:fs`, une connexion base, un paquet de driver) s'exécute
avant tout chargement d'un thème local, refusant plutôt qu'avertissant un thème qui
échoue ce contrôle — corrigé pendant la revue de cette tâche même (`contract-guardian`
avait d'abord trouvé le chemin de chargement local sans ce scan). C'est une protection
réelle contre la classe d'attaque la plus évidente (un thème qui lit `process.env` ou
une base directement), mais **ce n'est pas une isolation d'exécution** — un thème qui
passe le scan statique tourne toujours dans le même process, sans limite de temps ni de
mémoire. La fiche 73 prévoit l'isolation complète par `worker_threads`/`vm`
(réutilisant `@cogenta/plugins`) pour le bac à sable de développement/aperçu — cette
ADR ne couvre que la fondation (le chemin de résolution + le scan statique), pas encore
l'isolation d'exécution complète, qui reste un chantier ouvert et explicitement nommé
comme le principal inconnu technique de la fiche.

**Renoncement assumé** — Un thème local n'a, pour l'instant, aucune garantie
d'isolation d'exécution au-delà du scan statique. Un opérateur qui dépose un thème
malveillant suffisamment habile pour passer ce scan (par exemple un import
dynamiquement construit que le scan ne peut pas lire statiquement — déjà détecté et
refusé, en fait, par `verifyTheme`) reste, en théorie, un risque tant que la tâche
d'isolation par worker n'est pas livrée. Ce renoncement est documenté, pas caché : la
fiche 73 le nomme explicitement comme son inconnu technique principal, à chiffrer avant
toute génération de thème par IA en production.

**Écarté** — Copier le mécanisme WordPress tel quel (un dossier déposé est exécuté
sans aucun contrôle) a été explicitement écarté : c'est le mécanisme précis qui a fait
de WordPress la cible la plus compromise du web via ses thèmes et extensions tierces.
