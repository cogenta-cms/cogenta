# Ce qui attend une décision ou un accès humain — L15 (e-commerce)

Rien ici n'est du travail en attente que j'aurais pu faire et laissé de côté. Ce sont
des points qui exigent soit une validation humaine, soit un accès que je n'ai pas.

## 1. L'ADR-0023 n'est pas actée — **bloquant pour figer le contrat E**

`ADR-DRAFT-commerce.md` (racine du dépôt) propose que le commerce vive dans un
**contrat E séparé** plutôt que dans une extension du contrat A. Tout le code livré
suppose cette recommandation.

La consigne du lot disait d'insérer l'ADR dans `docs/03-decisions.md`. Je ne l'ai pas
fait, délibérément : une nouvelle décision d'architecture mérite une validation humaine
avant d'être actée, et ce fichier est append-only — y écrire une décision qu'un humain
n'a pas prise la rendrait immodifiable.

**Ce qu'il faut faire** : relire le brouillon, puis l'insérer tel quel à la fin de
`docs/03-decisions.md` (en renumérotant si un autre lot a pris le 0023 entre-temps), ou
dire pourquoi la recommandation est mauvaise. La section « Contrat E » de
`docs/04-contrats.md` porte le même avertissement et devra perdre son bandeau
« Proposé, non figé » au même moment.

**Si l'arbitrage renverse la décision** : ce qui change est le placement des tables et du
paquet, pas la logique métier. Les stores, les drivers, la fonction de totaux et les
tests de concurrence sont réutilisables tels quels.

## 2. Le test Stripe contre un vrai bac à sable n'a jamais tourné — **accès manquant**

`packages/commerce/test/integration/stripe.test.ts` est écrit et attend
`COGENTA_TEST_STRIPE_SECRET_KEY`. Sans la variable il se **skippe bruyamment** en la
nommant, jamais silencieusement.

Il refuse par ailleurs de tourner contre une clé qui ne commence pas par `sk_test_` :
une suite de tests capable de déplacer de l'argent réel est une erreur qui attend son
mauvais jour.

Ce qui est déjà prouvé sans clé : le format de fil, le mapping des sept statuts Stripe,
et le schéma de signature de webhook — testés contre un vrai serveur `node:http` sur une
socket réelle (`test/payment-stripe.test.ts`, 30 tests). Ce que seule une vraie clé
prouve : que Stripe **lui-même** accepte encore les champs envoyés et renvoie encore les
statuts attendus, c'est-à-dire ce qui casse en silence quand une version d'API bouge.

## 3. Postgres / MySQL / MariaDB non exécutés cette session — **Docker indisponible**

`packages/commerce/test/integration/catalog.test.ts` et `checkout.test.ts` rejouent les
mêmes suites de contrat que SQLite contre les vrais serveurs. Elles se skippent
bruyamment en nommant `COGENTA_TEST_POSTGRES_URL` / `COGENTA_TEST_MYSQL_URL` /
`COGENTA_TEST_MARIADB_URL`.

C'est le point le plus important de cette liste, parce que trois affirmations du paquet
sont **sensibles au dialecte** et qu'aucune n'est vérifiée tant que ces suites n'ont pas
tourné :

- la sûreté du stock repose sur `update … where on_hand >= n` qui rapporte
  `rowsAffected` de la même façon partout — et **MySQL a son propre avis** sur ce que
  « affecté » veut dire quand une mise à jour trouve une ligne sans la changer
  (`CLIENT_FOUND_ROWS`). Si ça diffère, la survente est silencieuse.
- tout montant est un `bigint`, et `pg` rend `int8` sous forme de **chaîne**. Le
  décodeur `toInt()` existe précisément pour ça, mais il n'a été exercé que contre
  SQLite.
- `create index if not exists` n'existe pas sur les MySQL anciens : le schéma lui-même a
  une branche par dialecte que seul un vrai serveur peut valider.

**À faire** : `pnpm services:up` puis `pnpm -F @cogenta/commerce test:integration`.

## 4. Pas d'écrans React pour la boutique — **choix de périmètre, pas un oubli**

Le lot demande « CRUD admin basique » pour les produits. Ce qui est livré est un routeur
sans transport (`createCommerceAdminRouter`) avec le vocabulaire de permissions du
contrat E, testé rôle par rôle — c'est-à-dire toute la partie qui porte une décision de
sécurité.

Les écrans eux-mêmes ne sont pas écrits : `packages/admin` reçoit son design system dans
le **L11**, et écrire maintenant des formulaires qui seront refaits dans quelques jours
coûterait deux fois. Le routeur est prêt à être branché derrière eux.

Conséquence à connaître : `@cogenta/commerce` n'est branché nulle part aujourd'hui.
`cogenta serve` ne monte pas le routeur commerce, et rien dans `create-cogenta` ne
propose une boutique. C'est du câblage, pas de la capacité manquante — mais tant qu'il
n'est pas fait, la boutique n'est atteignable que par du code appelant.

## 5. Pas de blocs de vitrine — **hors périmètre, à confirmer**

Rien n'affiche un produit sur le site public : pas de bloc `productList`, pas de bloc
`addToCart`. Le contrat B est figé et `AGENTS.md` exige une RFC pour ajouter un bloc au
vocabulaire, donc je ne l'ai pas fait de mon propre chef — c'est exactement la règle que
le L10 a déjà respectée en renonçant à son bloc `search`.

**Décision attendue** : soit une RFC pour deux ou trois blocs commerce (et une montée du
contrat B), soit des pages servies par le routeur comme `/search` l'est aujourd'hui.

## 6. `commerce@1.0` n'est délibérément pas figé

Contrairement à A et B, le contrat E ne l'est pas le jour de sa création. C'est un choix
assumé et écrit dans l'ADR : figer un modèle de commerce jamais confronté à une vraie
boutique serait figer des devinettes. Les sites très précoces paieront une migration.
