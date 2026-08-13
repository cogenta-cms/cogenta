# 01 — PRD

## Personas

### P1 — Le développeur d'agence (primaire)

Construit et livre des sites clients. Connaît TypeScript, git, Docker. A déjà souffert
sur WordPress et ACF. Évalue un outil en lisant son code et sa documentation, pas sa
page marketing.

**Ce qu'il veut** : typage de bout en bout, schéma dans git, déploiement reproductible,
pas de dérive entre staging et prod, une API propre, un CLI qui marche.

**Ce qui le fait fuir** : magie non documentée, configuration en base de données,
dépendances lourdes obligatoires, un système de plugins qui exécute n'importe quoi.

### P2 — Le client éditeur (secondaire, mais décisif)

Publie et modifie le contenu du site que l'agence a livré. Non technique. Ne doit
jamais avoir besoin d'appeler l'agence pour changer un texte ou une image.

**Ce qu'il veut** : une interface claire, une prévisualisation fidèle, pas de peur de
tout casser.

**Ce qu'il ne fera jamais** : ajouter un champ, toucher au schéma, comprendre ce
qu'est un build.

### P3 — Le responsable de flotte (v2)

Gère 20 à 100 sites clients. Veut une vue unique : quelles versions, quelles CVE
ouvertes, quels sites lents, quels backups ont échoué.

## Jobs-to-be-done

Formulés du point de vue de P1, par ordre d'importance.

**JTBD-1** — *Quand une faille est publiée dans une de mes dépendances, je veux savoir
en heures si mes sites sont concernés et avoir un correctif prêt, pour ne pas
découvrir le problème par un client compromis.*

**JTBD-2** — *Quand je livre un site, je veux qu'il reste rapide et bien référencé sans
que j'y repasse tous les mois, pour ne pas vendre de la maintenance à perte.*

**JTBD-3** — *Quand mon client veut éditer son site, je veux qu'il puisse le faire seul
sans rien casser, pour ne pas être interrompu.*

**JTBD-4** — *Quand je démarre un projet, je veux un site qui tourne en moins d'une
minute et un thème présentable, pour passer au travail réel.*

**JTBD-5** — *Quand je reprends un site WordPress, je veux migrer le contenu sans
saisie manuelle, pour que la bascule soit rentable.*

## Périmètre v1

Décision : **tout le périmètre est visé**, livré en dix lots ordonnés
(voir `06-lots.md`). Le blog du créateur passe en production dès le lot L3, et chaque
lot ultérieur est validé sur un site réel.

### Fonctionnel — contenu

- Types de contenu définis en code TypeScript, migrations versionnées
- Champs typés : texte, texte riche, nombre, booléen, date, média, relation, sélection, JSON, géo
- Vocabulaire de blocs sémantiques (voir `04-contrats.md`)
- Brouillons, versions, historique, restauration, diff
- Preview tokens partageables
- Programmation de publication
- i18n : locales, traductions, fallback, hreflang
- Taxonomies, menus, redirections avec 301 automatique au changement de slug
- Médiathèque : upload, variantes AVIF/WebP, srcset, point focal, alt-text
- Recherche hybride : full-text + vectorielle

### Fonctionnel — administration

- Interface générée depuis le schéma
- Auth : mot de passe, passkeys/WebAuthn, TOTP, sessions révocables
- Rôles et permissions granulaires par type de contenu et par action
- Journal d'audit consultable
- Tableau de bord : santé du site, CVE ouvertes, Core Web Vitals, activité des agents

### Fonctionnel — rendu

- Astro comme moteur de thèmes
- Thème canonique implémentant tout le vocabulaire de blocs
- Skins par tokens de design, changement à chaud sans build
- Thèmes complets pour contrôle total
- Trois cibles de build : statique, Node SSR, edge
- Socle SEO : sitemap, robots, JSON-LD, Open Graph, RSS/Atom, hreflang, `llms.txt`, IndexNow
- PWA : manifest, service worker, mode hors ligne, installable

### Fonctionnel — agentique

Voir `02-architecture.md` §4 pour le détail.

- Runtime : constitution hiérarchique, registre d'outils, permissions, sous-agents,
  skills, mémoire, budgets, niveaux d'autonomie, kill switch, traces
- Agents v1 : Sécurité, SEO, Contenu, Performance
- Agents ultérieurs : Média, Traduction, Modération, Analytics, Migration, A11y, Conformité
- Serveur MCP (le CMS exposé comme outil) et client MCP (le CMS consomme des serveurs tiers)
- Canaux : Telegram d'abord, puis Slack, Discord, email, webhooks
- Fournisseurs : Anthropic, OpenAI, Google, DeepSeek, Qwen, Z.ai, Mistral, Ollama, compatibles OpenAI
- Embeddings locaux par défaut (`multilingual-e5-small`, ONNX, CPU)

### Fonctionnel — installation et exploitation

- `npm create cogenta` : assistant interactif — base de données, LLM et modèle, clé
  API, type de site, génération du skin
- Blueprints de site : vitrine, blog, magazine, portfolio, documentation, association,
  restaurant, SaaS — modèle de contenu + skin + agents préconfigurés + contenu de démo
- CLI : `dev`, `build`, `generate`, `migrate`, `doctor`, `backup`, `upgrade`, `deploy`
- Import WordPress (WXR), Ghost, Markdown
- Profils de déploiement : Solo/statique, Managed, mutualisé (cPanel), Fleet
- Backups chiffrés avec test de restauration automatisé

### Non-fonctionnel

| Exigence | Cible |
|---|---|
| `npm create` → site qui tourne | < 60 s |
| Rendu d'une page en SSR, p95 | < 100 ms |
| Lighthouse du thème canonique | 100/100/100/100 |
| Build statique, 1000 pages | < 3 min |
| Empreinte mémoire au repos | < 200 Mo |
| Node minimum | 22 LTS, ESM uniquement |
| Accessibilité | WCAG 2.2 AA sur l'admin et le thème canonique |
| Couverture de tests du noyau | > 80 % |

## Hors périmètre, explicitement

E-commerce complet, gestion d'abonnements et paywall, éditeur de page visuel en
glisser-déposer libre, hébergement SaaS géré par le projet, application mobile native,
CRM, marketing automation.

Ces éléments sont servis par intégration ou par plugin, jamais par le noyau.
