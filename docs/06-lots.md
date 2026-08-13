# 06 — Découpage en lots

> Dix lots. Chacun autonome, testable, et livrable par une série de sessions de
> développement assistées. Un lot n'est **fini** que quand ses critères de sortie sont
> vérifiés par des tests automatisés.

## Vue d'ensemble

```
L0 Socle
 └─ L1 Contenu
     ├─ L2 Admin
     └─ L3 Rendu ──────────▶ 🚀 le blog passe en production
         └─ L4 Runtime agentique
             ├─ L5 Agents
             ├─ L6 Canaux
             └─ L7 Extensibilité
                 └─ L8 Flotte
L9 Écosystème — en continu, à partir de L3
```

## Les trois règles qui rendent ce découpage tenable

1. **Les contrats se figent avant le lot qui les consomme.** Contrat A avant L1,
   contrat B avant L1, contrat D avant L3, contrat C avant L4.
2. **Un lot n'est fini que quand ses tests passent.** Développer vite avec de l'IA sans
   filet produit une dette qui se paie exactement au moment où le projet devient trop
   gros pour tenir en tête.
3. **Dogfooding à partir de L3.** Chaque lot suivant est validé sur un site réel en
   production. C'est le meilleur harnais de test, et il est gratuit.

---

## L0 — Socle

**Contenu** — Monorepo pnpm + Changesets + Turborepo. Configuration typée et
validée. Système de drivers (interface + registre + sélection par environnement).
Drivers base (Postgres, MySQL, SQLite via Drizzle), cache, queue, storage. Moteur de
migrations. Génération de types. Logger structuré. Harnais de tests (unitaires,
intégration avec base réelle, e2e Playwright). CI complète.

**Produit** — `@cogenta/core`, `@cogenta/cli` (squelette)

**Critères de sortie** — Les trois bases passent la même suite d'intégration. Un
driver dégradé peut se substituer à son équivalent optimal sans changement de code
appelant. La CI joue tout sur Linux, macOS, ARM et Node 22 et 24.

---

## L1 — Contenu

**Dépend de** — L0. **Contrats** — A et B figés.

**Contenu** — `defineCollection` et les types de champ. Migrations générées.
Champs système dont `provenance`. Brouillons, versions, historique, diff, restauration.
Programmation de publication. i18n. Taxonomies. Slugs et redirections 301 automatiques.
Vocabulaire de blocs. API REST et GraphQL. Permissions par collection et par action.
Preview tokens. Recherche full-text.

**Produit** — `@cogenta/schema`, `@cogenta/api`, `@cogenta/blocks`

**Critères de sortie** — Un schéma modifié génère une migration correcte, jouable et
réversible sur les trois bases. Un thème référençant un champ inexistant échoue à la
compilation des types. Les permissions sont testées par rôle sur chaque route.

---

## L2 — Admin

**Dépend de** — L1.

**Contenu** — SPA React. Auth : mot de passe, passkeys, TOTP, sessions. Rôles et
permissions. Interface générée depuis le schéma. Éditeur de texte riche. Éditeur de
blocs. Médiathèque avec variantes, point focal, alt-text. Prévisualisation. Journal
d'audit consultable. Tableau de bord.

**Produit** — `@cogenta/admin`

**Critères de sortie** — Un nouveau type de contenu apparaît dans l'admin sans écrire
une ligne d'interface. Parcours d'authentification testés en e2e. Admin conforme
WCAG 2.2 AA, vérifié automatiquement.

---

## L3 — Rendu 🚀

**Dépend de** — L1. **Contrat** — D figé.

**Contenu** — Intégration Astro. Contrat de thème. Thème canonique implémentant les
douze blocs. Système de skins par tokens, changement à chaud. Trois cibles de build.
Manifeste de besoins runtime et refus de build statique explicite. Socle SEO complet.
PWA. Pipeline d'images avec repli WASM.

**Produit** — `@cogenta/render`, `@cogenta/theme-canonical`

**Critères de sortie** — Le blog du créateur est en production. Lighthouse 100 sur les
quatre axes. Changer de skin ne déclenche aucun build. Le même contenu produit un
résultat équivalent en statique, SSR et edge.

**À partir d'ici, tout est validé sur un site réel.**

---

## L4 — Runtime agentique

**Dépend de** — L1. **Contrat** — C figé.

**Contenu** — Boucle d'exécution, appel de modèle, tool-calling, reprises, timeouts.
Hiérarchie d'identité. Registre d'outils et vérification de permissions. Sous-agents.
Skills. Les quatre mémoires. Budgets et quotas. Niveaux d'autonomie. Kill switch.
Journal d'audit à chaînage de hash. Traces rejouables. File d'approbation humaine.
Abstraction fournisseurs LLM. Embeddings locaux ONNX. RAG hybride avec filtrage de
permissions. Serveur et client MCP. Bac à sable.

**Produit** — `@cogenta/agents`, `@cogenta/mcp`

**Critères de sortie** — Un agent sans la permission d'un outil ne peut pas l'appeler,
prouvé par test. Un test d'injection de prompt via un commentaire hostile échoue à
provoquer une action non autorisée. Un dépassement de budget arrête l'agent proprement.
Toute action est réversible et journalisée. **Le CMS fonctionne intégralement sans
aucune clé API configurée.**

---

## L5 — Agents

**Dépend de** — L4.

**Contenu** — Agent Sécurité (SBOM, corrélation CVE, évaluation d'exploitabilité,
rapport, PR de correctif). Agent SEO (audit à la publication, JSON-LD, maillage interne,
AEO/GEO). Agent Contenu (rédaction, réécriture, résumés, suggestions, sous charte).
Agent Performance (Core Web Vitals, budgets, régressions). Puis Média, Traduction,
Modération, Analytics, Migration, A11y, Conformité.

**Critères de sortie** — Les quatre agents v1 tournent sur le site de production depuis
un mois sans incident. Évaluations rejouables en CI pour chacun. Coût mensuel réel
mesuré et documenté.

---

## L6 — Canaux

**Dépend de** — L4.

**Contenu** — Adaptateur de canal bidirectionnel. Telegram, puis Slack, Discord, email,
webhooks. Liaison compte ↔ identité de canal, vérifiée et révocable. Approbations depuis
le canal. Formats de rapport lisibles.

**Critères de sortie** — Une commande entrante s'exécute avec les permissions de
l'humain, jamais celles de l'agent — prouvé par test. Une identité non liée est refusée.

---

## L7 — Extensibilité

**Dépend de** — L4.

**Contenu** — API de plugin. Manifeste unifié. Isolation en worker avec client RPC
limité aux capacités approuvées. Écran de permissions à l'installation. Signature et
vérification. Registre de thèmes, skills et skins. Galerie de skins (JSON, sans
exécution de code).

**Critères de sortie** — Un plugin de test qui tente d'accéder à `fs`, au réseau ou aux
secrets échoue. Le surcoût de latence de l'isolation est mesuré et documenté.

---

## L8 — Flotte

**Dépend de** — L5, L6.

**Contenu** — Plan de contrôle multi-sites. Inventaire, versions, CVE ouvertes, Core
Web Vitals, état des backups. Mises à jour groupées. Rapports par client. Isolation
stricte entre sites, y compris pour la mémoire des agents.

**Critères de sortie** — Aucune donnée ni mémoire ne traverse la frontière entre deux
sites, prouvé par test. Une mise à jour groupée est annulable site par site.

---

## L9 — Écosystème (continu, dès L3)

**Contenu** — `create-cogenta` et l'assistant d'installation (base, LLM, modèle, clé,
type de site, génération du skin). Blueprints de site. Import WordPress WXR, Ghost,
Markdown. CLI complet dont `doctor`. Documentation fonctionnelle et technique avec
schémas SVG animés. Site du projet. Playground. `CONTRIBUTING`, `SECURITY`, code de
conduite, processus de RFC, roadmap publique. Profil mutualisé testé et documenté.

**Critères de sortie** — `npm create cogenta` produit un site qui tourne en moins de
60 secondes, sur macOS, Linux et Windows. Un export WordPress réel s'importe sans
intervention manuelle.

---

## Ordre recommandé

`L0 → L1 → L3 → L2 → L4 → L5 → L9(installeur) → L6 → L7 → L8`

**Pourquoi L3 avant L2** — Le rendu avant l'admin permet de mettre le blog en
production plus tôt, quitte à saisir le contenu par le CLI ou par des fichiers pendant
quelques semaines. Le dogfooding précoce vaut plus que le confort d'édition.
