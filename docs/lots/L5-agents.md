# L5 — Agents

## Objectif

Les agents eux-mêmes, construits sur le runtime de L4. Quatre agents en priorité —
Sécurité, SEO, Contenu, Performance — puis les suivants.

C'est ce lot qui rend le wedge visible. Un agent médiocre est pire que pas d'agent :
il détruit la confiance dans tout le système.

## Dépendances

L4. Les agents Sécurité et Performance ont besoin de L3 pour mesurer un site réel.

## Périmètre

**Priorité 1 — livrés ensemble** : Sécurité, SEO, Contenu, Performance.
**Priorité 2** : Média, Traduction, Modération.
**Priorité 3** : Analytics, Migration, Accessibilité, Conformité.

Chaque agent = une identité, un jeu d'outils, des skills, des déclencheurs, un jeu
d'évaluation.

## Arborescence

```
packages/agents-builtin/
├── security/
│   ├── agent.ts           # defineAgent
│   ├── identity.md        # rôle, objectifs, style
│   ├── tools/             # outils spécifiques
│   ├── skills/            # cve-triage, security-report
│   └── evals/             # cas de test rejouables
├── seo/
├── content/
└── performance/
```

## Agent Sécurité

**Outils** : `deps.scan`, `deps.patch`, `content.read`, `site.config_read`,
`http.fetch(osv.dev, api.github.com)`, `channel.send`, `build.trigger`.

**Déclencheurs** : publication d'une CVE (webhook ou poll horaire), planification
quotidienne, après chaque installation de dépendance.

**Cycle** — voir `docs/05-securite.md` §2. Les points qui font la différence :

- Ne signaler que si **le site est réellement concerné** : version installée affectée,
  chemin de code atteignable, exposition réelle. Un agent qui crie au loup est
  désactivé en une semaine.
- Croiser CVSS **et** EPSS (probabilité d'exploitation réelle). Une CVE 9.8 jamais
  exploitée est moins urgente qu'une 6.5 activement utilisée.
- Le rapport suit un format imposé : ce qui est touché / ce qu'un attaquant pourrait
  faire / si le site est exposé / ce qui est proposé / ce qui se passe si on ne fait rien.
  Aucun jargon brut.
- Le correctif est une PR avec les tests joués, jamais une modification directe.

**Autonomie par défaut** : `deps.scan` autonome, `deps.patch` en proposition. Le mode
autonome sur `deps.patch` est désactivé à l'installation et exige une confirmation
avec avertissement.

## Agent SEO

**Outils** : `content.read`, `content.write_draft`, `http.fetch`, `channel.send`.

**Déclencheurs** : avant publication, planification hebdomadaire, après un changement
de structure.

**Ce qu'il fait** : audit à la publication (titres, méta, structure de titres, alt,
maillage interne, canoniques, longueur, lisibilité), génération et vérification du
JSON-LD, propositions de liens internes, détection de cannibalisation entre pages,
suivi des redirections orphelines.

**Ce qui le différencie** : l'**AEO/GEO** — optimisation pour les moteurs de réponse IA
et non seulement pour Google. Vérification de `llms.txt`, structuration extractible,
réponses directes en tête de section, données factuelles balisées. Aucun CMS grand
public ne le fait sérieusement ; c'est un argument de vente à part entière.

**Règle** : il propose des brouillons, il ne publie jamais.

## Agent Contenu

**Outils** : `content.read`, `content.write_draft`, `media.read`, `agent.delegate`.

**Skills** : charte éditoriale du site, guide de ton, modèles d'articles.

**Ce qu'il fait** : rédaction assistée, réécriture, résumés, titres alternatifs,
extraits, suggestions de sujets à partir des lacunes du contenu existant, cohérence
terminologique.

**Règles dures** : il écrit toujours dans un brouillon, jamais en publication.
Tout contenu produit porte `provenance: generated` ou `assisted`. Le champ n'est pas
optionnel et n'est pas modifiable par l'agent.

**Mémoire procédurale** : les corrections humaines sur ses brouillons alimentent son
apprentissage. C'est l'agent où le signal de feedback compte le plus.

## Agent Performance

**Outils** : `http.fetch(site propre)`, `content.read`, `channel.send`, `build.trigger`.

**Déclencheurs** : après chaque déploiement, planification quotidienne.

**Ce qu'il fait** : mesure des Core Web Vitals sur les pages clés, comparaison au budget
défini, détection de régression, identification de la cause probable (image non
optimisée, script tiers, bloc coûteux, requête lente), proposition de correction.

**Point clé** : il mesure le **site déployé**, pas un environnement local. Y compris en
profil statique, où c'est son seul mode de fonctionnement.

## Évaluations

**Chaque agent possède un jeu de cas rejouable en CI.** Sans cela, un changement de
prompt ou de modèle dégrade silencieusement la qualité et personne ne le voit avant un
mois.

Un cas d'évaluation = une entrée fixe, une sortie attendue ou un critère vérifiable, un
score. Le score est comparé entre versions de prompt et entre modèles. Une régression
au-delà d'un seuil échoue la CI.

Exemples : un `package.json` avec une CVE connue → l'agent Sécurité doit la détecter et
ne pas signaler les non-concernées. Un article mal structuré → l'agent SEO doit relever
les trois problèmes attendus et pas dix faux positifs.

## Tâches, dans l'ordre

1. Format d'agent intégré, chargement, activation/désactivation depuis l'admin
2. Harnais d'évaluation et intégration CI
3. Agent Sécurité : SBOM, corrélation OSV/GHSA, exploitabilité, rapport
4. Agent Sécurité : génération de PR de correctif
5. Agent SEO : audit à la publication
6. Agent SEO : JSON-LD, maillage interne, AEO/GEO
7. Agent Performance : mesure, budgets, détection de régression, diagnostic
8. Agent Contenu : rédaction, réécriture, résumés, sous charte
9. Interface d'administration des agents : état, autonomie, budget, historique, traces
10. Agents de priorité 2, puis 3

## Critères d'acceptation

- Les quatre agents tournent sur le site de production depuis un mois sans incident
- L'agent Sécurité détecte une CVE réellement applicable et **ne signale pas** les
  dépendances non affectées — taux de faux positifs mesuré et documenté
- Un rapport de sécurité est compréhensible par un non-spécialiste
- L'agent Contenu ne publie jamais ; `provenance` est toujours renseigné
- L'agent SEO ne produit pas plus de N faux positifs sur le jeu d'évaluation
- L'agent Performance identifie correctement la cause d'une régression injectée
- Le coût mensuel réel de chaque agent est mesuré et affiché
- Désactiver un agent l'arrête immédiatement, y compris un run en cours

## Tests exigés

| Type | Portée |
|---|---|
| Évaluation | Jeu de cas par agent, score seuil en CI |
| Intégration | Chaque agent bout en bout sur un site de test |
| Faux positifs | Corpus de dépendances saines : aucune alerte |
| Régression | Injection d'une régression de performance connue |
| Coût | Mesure du coût par run, comparaison au budget |

## Pièges connus

**Le faux positif tue l'agent.** Un agent Sécurité qui alerte trop est mis en sourdine,
et le jour où l'alerte est vraie personne ne la lit. Préférer manquer un cas douteux
plutôt qu'inonder.

**Le rapport illisible.** Copier un avis CVE brut n'est pas un rapport. Le format imposé
n'est pas une préférence esthétique, c'est le produit.

**L'agent Contenu produit de la bouillie par défaut.** Sans skill de charte éditoriale,
sans exemples, sans mémoire des corrections, il génère du texte générique. Le skill
compte plus que le modèle.

**Les mesures de performance sont bruitées.** Une seule mesure ne prouve rien. Médiane
sur plusieurs exécutions, et seuil de régression assez large pour ne pas crier à chaque
déploiement.

## Hors périmètre

Canaux (L6), agents fournis par des plugins tiers (L7), supervision de flotte (L8).
