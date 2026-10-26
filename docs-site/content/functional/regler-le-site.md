---
title: Régler le site
order: 7
---

# Régler le site

`/settings` regroupe les réglages généraux : nom et description du site,
langues disponibles et langue par défaut, sécurité (CORS, en-têtes CSP,
HSTS, durée de mise en cache d'une page publique — désactivé par défaut,
à activer explicitement).

`/profile` gère votre propre compte connecté : nom, e-mail, préférences
d'interface, double authentification.

Le menu latéral de l'admin se réduit ou se garde ouvert par section, et cette
préférence est mémorisée par navigateur — un réglage qui la persiste par
site plutôt que par appareil, et qui permette de masquer entièrement une
section non pertinente (l'exemple donné : retirer Boutique sur un site qui
ne vend rien), est une amélioration à venir, pas encore disponible dans
cette version.

Voir aussi [SEO](personnaliser-lapparence.html#seo) (section Apparence) et
[Fournisseurs IA](ia-et-agents.html#fournisseurs-et-modeles) (section IA),
réglés depuis leurs propres écrans plutôt que depuis les réglages généraux —
chacun vit là où on le cherche en premier.

## La politique de sécurité du contenu (CSP)

Par défaut, Cogenta envoie une politique de sécurité du contenu qui **bloque** tout script
en ligne ajouté à une page : seuls les scripts de Cogenta lui-même (la bascule clair/sombre,
les champs conditionnels d'un formulaire) s'exécutent. Elle interdit aussi les objets
embarqués, limite les connexions et les envois de formulaire au site, et n'autorise les
cadres que pour les services d'intégration reconnus (YouTube sans cookies, Vimeo,
Dailymotion, Spotify, SoundCloud) une fois le consentement donné. Les polices Google ne
sont ouvertes que si vous avez activé `appearance.remoteWebFonts`.

Deux réglages dans `security` du fichier `cogenta.config` :

- `csp: "…"` remplace la politique par la vôtre, mot pour mot, sur toutes les réponses —
  à utiliser si vous ajoutez un outil d'analyse, un widget ou un script tiers ;
- `csp: false` n'envoie aucun en-tête — pour un site dont le serveur frontal envoie déjà le
  sien. L'écran *Réglages → Exploitation* indique laquelle des trois situations s'applique.
