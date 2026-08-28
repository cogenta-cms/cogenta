## ADR-0032 — Un connecteur Google Search Console optionnel, désactivé par défaut, est accepté (renonce partiellement à la posture « pas d'OAuth » de la fiche 50)

**Statut** : Acté

**Contexte** — La fiche 50 (SEO éditoriale avancée) avait explicitement écarté tout appel
OAuth vers Google/Bing : *« Ne pas ajouter d'appel OAuth Google/Bing — R1/R7 : rester sur
la vérification par balise meta, sans nouveau secret tiers »*. La fiche 70 (SEO niveau
plateforme complète), écrite après une recherche réelle sur AIOSEO/The SEO
Framework/MonsterInsights/Site Kit demandée directement par l'utilisateur, a identifié que
le vrai différenciateur de ces quatre outils face à Cogenta n'est pas la production de
métadonnées (déjà bonne) mais la donnée de performance réelle — clics, impressions,
position moyenne — que seule une connexion Search Console peut fournir. Tranché en direct
avec l'utilisateur le 2026-08-28 : accepter le connecteur, à la condition explicite que la
fonctionnalité SEO reste excellente même sans jamais l'activer.

**Décision** — Un connecteur Search Console optionnel, **désactivé par défaut**, s'ajoute
à `@cogenta/seo`/`@cogenta/api`/`@cogenta/admin` :

1. **Aucune fonctionnalité de la fiche 70 n'en dépend.** Score de contenu, assistant de
   maillage interne, grille de fonctionnalités activables : les trois tâches qui font le
   corps de la fiche fonctionnent intégralement sans ce connecteur (R2). Le connecteur
   n'ajoute qu'une **quatrième source de données** à un écran déjà complet, jamais une
   fonctionnalité dont dépendent les autres.
2. **Le jeton OAuth est un secret par site, jamais vu par un modèle** (R7) — injecté par
   le runtime dans un client pré-configuré, jamais transmis en clair à l'admin après
   l'échange initial, sur le modèle déjà établi pour les fournisseurs LLM chiffrés au repos
   (AES-256-GCM, clé dérivée de `COGENTA_AUTH_SIGNING_KEY`, L22 tâche 1).
3. **Repli complet si non configuré** (R1) : l'écran SEO fonctionne identiquement, la
   section « Performance réelle » est simplement absente plutôt que vide ou en erreur — le
   même contrat que `GET /api/assistant` répondant `{available:false}` sans fournisseur
   (L18).
4. **Portée strictement lecture seule** — le connecteur ne fait jamais d'appel en écriture
   vers l'API Google (jamais de soumission de sitemap via l'API, IndexNow reste le canal
   pour ça), pour limiter la surface de ce que le jeton autorise.

**Renoncement assumé** — R1 (« aucune dépendance dure à une infrastructure ») visait à
l'origine toute dépendance à un service externe pour une fonctionnalité *cœur*. Cette ADR
ne le renverse pas : elle ouvre une exception nommée et bornée (lecture seule, désactivée
par défaut, un connecteur parmi plusieurs, jamais un chemin obligatoire) plutôt que de
réinterpréter R1 lui-même. Le prix payé est réel : c'est la première fois que ce projet
accepte un flux OAuth vers un tiers, et donc la première fois qu'un jeton long-vivant par
site existe dans ce système — géré avec la même discipline que les clés de fournisseur LLM
existantes, pas une nouvelle catégorie de risque non gouvernée.

**Écarté** — Bing Webmaster Tools et les autres moteurs n'ont pas d'API comparable
largement adoptée ; ce connecteur reste spécifique à Google Search Console. Une intégration
Google Analytics complète (au-delà de Search Console) n'est pas actée ici — seulement
envisageable dans une ADR ultérieure si le besoin est prouvé, `@cogenta/analytics` (fiche
64) restant la source de vérité pour les données de trafic auto-hébergées.
