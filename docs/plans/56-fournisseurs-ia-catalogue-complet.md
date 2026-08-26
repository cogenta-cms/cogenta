# 56 — Fournisseurs IA : catalogue complet

> **État** : infrastructure à 70 % prête — l'adaptateur OpenAI existe déjà contre
> un `baseUrl` **déjà configurable**, qui couvre le format wire d'OpenRouter,
> DeepSeek, Qwen (mode compatible) et GLM (Zhipu) sans nouveau code réseau. Il
> manque le catalogue, pas le driver.
> **Fichiers** : `packages/agents/src/providers/*`,
> `packages/admin/src/routes/providers.tsx`, `packages/admin/src/api/providers-client.ts`
> **Effort** : 2–3 jours (+ effort séparé, non chiffré, si Replicate est inclus)
> **ADR requise** : non — provider redevient une chaîne libre plutôt qu'une union
> fermée, changement mineur

---

## 1. Ce qui existe réellement

**3 fournisseurs texte codés en dur** : `providers/registry.ts` —
`PROVIDER_NAMES = ['anthropic', 'openai', 'google']`. Chacun a son adaptateur natif.

`openai.ts` parle le format **OpenAI Chat Completions** contre une URL **déjà
configurable** (`config.baseUrl`) — exactement le format wire que OpenRouter,
DeepSeek, Qwen (DashScope compatible) et GLM (Zhipu, endpoint compatible OpenAI)
exposent tous. Le champ `baseUrl` existe déjà dans le formulaire admin et dans
`ProviderConfigInput`. Le champ `model` est déjà un `<Input>` texte libre — un
« modèle custom » est **déjà possible**, juste jamais présenté comme un concept
nommé.

`providers/store.ts` : un fichier `<provider>.json` par nom, où `provider` doit
être un des 3 littéraux de `PROVIDER_NAMES` — ne scale pas à N fournisseurs custom.

`providers-client.ts` : `KNOWN_PROVIDERS` duplique littéralement `PROVIDER_NAMES`
côté admin.

Réplicate n'est **pas** compatible OpenAI (API de prédiction asynchrone, polling) —
en faire un vrai adaptateur est un travail distinct.

## 2. Plan de développement

**Tâche 1** — `packages/agents/src/providers/catalog.ts` (nouveau, pur data) : table
statique `KNOWN_PROVIDER_CATALOG` — pour chaque fournisseur : `id`, `label`,
`defaultBaseUrl`, `wireFormat: 'openai-compatible' | 'anthropic' | 'google'`,
`knownModels: readonly string[]`. `wireFormat: 'openai-compatible'` réutilise
`createOpenAiClient` avec un `baseUrl` différent — **zéro nouveau code réseau**
pour OpenRouter/DeepSeek/Qwen/GLM.

**Tâche 2** — `registry.ts` : remplacer l'union fermée à 3 littéraux par
`provider: string` (validé contre le catalogue ou marqué `custom: true`).

**Tâche 3** — `createProviderRegistry` : pour un provider `openai-compatible`,
instancier `createOpenAiClient({ baseUrl: catalog.defaultBaseUrl, ... })` — Anthropic
et Google gardent leurs adaptateurs natifs (formats différents).

**Tâche 4** — Réplicate : hors périmètre explicite de cette fiche, documenté
honnêtement (comme d'autres écarts assumés du projet), sauf tâche séparée
ultérieure.

**Tâche 5** — Écran `providers.tsx` restructuré : une carte par fournisseur du
catalogue (statut configuré/non), formulaire d'ajout avec `<Select>` de modèles
connus **+** option « modèle personnalisé » (texte libre, déjà techniquement
supporté, rendu explicite), section « Fournisseur personnalisé » pour un endpoint
OpenAI-compatible non listé.

**Tâche 6** — `providers-client.ts` : lire le catalogue depuis une route `GET
/api/providers/catalog` plutôt que dupliquer `KNOWN_PROVIDERS` à la main — évite le
piège de désynchronisation déjà vécu avec `CONTRACT_C_PERMISSIONS`.

## 3. Critères d'acceptation

- OpenRouter, DeepSeek, Qwen et GLM sont configurables sans code réseau nouveau.
- Un modèle personnalisé est un concept explicite dans l'écran, pas un champ texte
  anonyme.
- Ajouter un fournisseur au catalogue ne nécessite aucune modification de
  `providers-client.ts`.

## 4. Tests exigés

- Contrat : un fournisseur `openai-compatible` du catalogue produit des appels
  identiques (hors `baseUrl`/modèle) à l'adaptateur OpenAI existant.
- Non-régression : les 3 fournisseurs actuels (Anthropic, OpenAI, Google) restent
  fonctionnels après le passage à une union ouverte.
- Bout en bout : ajout d'un fournisseur custom (nom + baseUrl + modèle), test de
  connexion réel avec un faux serveur.

## 5. Pièges connus

- Réplicate n'a pas le même format wire — ne pas le forcer dans le mécanisme
  `openai-compatible`, ce serait un faux client synchrone.
- Les valeurs exactes de `knownModels` par fournisseur doivent être vérifiées au
  moment de l'implémentation (elles évoluent) — ne pas les figer sans vérification.

## 6. Décisions à trancher

Inclure ou non un adaptateur Replicate dans ce lot (recommandation : non, tâche
séparée).
