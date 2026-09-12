# Trusted Publisher — paquets à lier sur npmjs.com

Pour chaque paquet : npmjs.com, page du paquet, **Settings**, **Trusted
Publisher** ; dépôt `cogenta-cms/cogenta`, workflow `release.yml`.

Sans ce lien la CI ne peut pas publier : `release.yml` ne porte aucun jeton de
repli, et l'échec se présente comme un 404 qui masque en réalité un refus
d'autorisation. Le registre n'expose pas ce réglage — rien ne permet de le
vérifier autrement qu'en ouvrant la page.

## Certain : publiés à la main le 2026-09-12, jamais liés (16)

- [ ] @cogenta/analytics
- [ ] @cogenta/comments
- [ ] @cogenta/commerce
- [ ] @cogenta/export
- [ ] @cogenta/forms
- [ ] @cogenta/observability
- [ ] @cogenta/theme-kit
- [ ] @cogenta/theme-association
- [ ] @cogenta/theme-blog
- [ ] @cogenta/theme-docs
- [ ] @cogenta/theme-ecommerce
- [ ] @cogenta/theme-entreprise
- [ ] @cogenta/theme-magazine
- [ ] @cogenta/theme-portfolio
- [ ] @cogenta/theme-restaurant
- [ ] @cogenta/theme-saas

## À vérifier : publiés avant, statut inconnu (15)

Les notes du projet ne citent que `create-cogenta` et `@cogenta/cli` comme
réellement configurés. Les suivants sont donc probablement à faire aussi, mais
c'est à confirmer page par page.

- [ ] @cogenta/agents
- [ ] @cogenta/agents-builtin
- [ ] @cogenta/api
- [ ] @cogenta/auth
- [ ] @cogenta/blocks
- [ ] @cogenta/channels
- [ ] @cogenta/core
- [ ] @cogenta/fleet
- [ ] @cogenta/import
- [ ] @cogenta/mcp
- [ ] @cogenta/plugins
- [ ] @cogenta/render
- [ ] @cogenta/schema
- [ ] @cogenta/seo
- [ ] @cogenta/theme-canonical

## Déjà configurés d'après les notes du projet (2)

- [x] create-cogenta
- [x] @cogenta/cli

