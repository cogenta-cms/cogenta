# Risque résiduel : http-cache-semantics

Analyse du 4 octobre 2026. L'avis [GHSA-ch52-4w7c-c8xp / CVE-2026-93748](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
classe `http-cache-semantics <= 4.2.0` en sévérité haute et ne fournit aucune
version corrigée. Un cache partagé peut réutiliser une réponse pourtant privée,
dont le cookie d'un autre utilisateur, lorsqu'un client impose `max-stale`.
Le [rapport amont](https://github.com/kornelski/http-cache-semantics/issues/56)
précise que l'exploitation nécessite de conserver cette réponse et de consulter
la méthode de réutilisation lors de sa lecture.

## Chemin dans ce dépôt

L'audit initial conservé dans
`.cogenta/remediation-2026-10-03/dependency-audit-before.json` indique un unique
chemin : `examples/theme-starter > astro > http-cache-semantics@4.2.0`.
Le starter est privé et ses commandes locales sont des contrôles de types et
des tests. Cette constatation ne couvre pas les dépendances ou usages ajoutés
par un utilisateur dans un thème dérivé.

Le [code publié d'Astro 7.2.8](https://raw.githubusercontent.com/withastro/astro/astro@7.2.8/packages/astro/src/assets/build/remote.ts)
conserve cette dépendance. Son consommateur calcule uniquement la durée de
fraîcheur des images distantes de build avec `storable()` et `timeToLive()`.
Il construit les requêtes, sans transmettre les directives d'un visiteur.
La revalidation ajoute seulement les validateurs d'image. Les résultats exposent
le contenu de l'image, l'expiration, l'ETag et Last-Modified ; les cookies et
les autres en-têtes de réponse ne sont pas retournés. Il ne consulte ni
`evaluateRequest()` ni `satisfiesWithoutRevalidation()`.

**Conclusion de portée :** la branche qui permet la fuite décrite par cet avis
n'est pas atteinte dans le consommateur Astro examiné. Ce constat ne corrige pas
la bibliothèque et ne vaut pas garantie pour un autre cache HTTP, un autre
consommateur ou une version future d'Astro.

## Preuve reproductible

```sh
node docs/qa/remediation-2026-10-03/http-cache-semantics-proof.mjs
```

La preuve résout les versions réellement installées et refuse un consommateur
Astro supplémentaire. Un contrôle positif reproduit d'abord le défaut de la
bibliothèque avec un cookie synthétique. Les méthodes vulnérables sont ensuite
instrumentées pour faire échouer tout appel. Un serveur HTTP local éphémère
renvoie une image avec `Set-Cookie` ; les chargements et revalidations 200/304
d'Astro ne retournent aucun cookie, ne transmettent aucune identité et attribuent
une durée de fraîcheur nulle. Aucun service externe ni secret n'est utilisé.

La commande a été vérifiée avec Astro 7.2.1 et http-cache-semantics 4.2.0 avant
la mise à jour du catalogue. La preuve doit être relancée sur le verrou final ;
le code primaire de 7.2.8 conserve le comportement examiné.

## Suivi obligatoire

L'alerte reste visible dans `pnpm audit` et dans le bilan de validation. Aucun
`ignoreGhsas`, override factice ou résultat d'audit silencieusement filtré n'est
ajouté. Un résultat d'audit entièrement vert n'est pas revendiqué.

Aucun patch local du fournisseur n'est proposé : il ne réduirait pas une voie
atteignable dans ce dépôt et engagerait une maintenance supplémentaire. Lorsqu'une
version corrigée est publiée, mettre à jour le transitif et remplacer le contrôle
positif par une assertion de refus. Relancer cette analyse si Astro ajoute un
consommateur, si un cache partagé reprend les requêtes des visiteurs ou si la
dépendance est utilisée ailleurs. L'acceptation de ce risque résiduel doit rester
explicite dans la revue de livraison.
