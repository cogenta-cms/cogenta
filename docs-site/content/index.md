---
title: Documentation Cogenta
order: 0
---

# Documentation Cogenta

Cogenta est un CMS agentique open source pour Node.js : un site qui
s'exploite lui-même — se surveille, se patche, s'optimise, et rend des
comptes — sans jamais dépendre d'une clé API pour fonctionner (R2).

Cette documentation est **déployée avec le code**, jamais consultée depuis un
site séparé toujours-à-jour : la version affichée en bas de chaque page est
celle du `@cogenta/core` réellement installé. Un site qui tourne sur une
ancienne version de Cogenta voit, depuis son propre `/admin/documentation`,
la documentation de cette même ancienne version — parce que les deux sont le
même fichier, publié le même jour que le code.

Deux arborescences, pour deux lecteurs différents :

## [Documentation fonctionnelle](functional/index.html)

Pour qui **administre un site** : comment créer du contenu, personnaliser
l'apparence, vendre en ligne, travailler avec les agents IA, gérer les
comptes, régler le site et l'exploiter au quotidien. Organisée par tâche à
accomplir, pas par écran de l'admin.

## [Documentation technique](technical/index.html)

Pour qui **développe autour de Cogenta** : l'architecture, les paquets et
drivers, les contrats d'interface versionnés (A à G), comment créer un thème
ou un plugin, la référence des API REST/GraphQL/MCP. Deux modèles de départ
téléchargeables — un thème minimal et un plugin minimal — accompagnent les
guides correspondants.

---

Cette même documentation est aussi consultable depuis l'admin de tout site
Cogenta, sous **Documentation** (section réglages) — contenu identique,
rendu par le même moteur, jamais deux copies qui peuvent diverger.
