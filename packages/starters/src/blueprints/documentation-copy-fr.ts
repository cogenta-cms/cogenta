import type { VocabularyBlock } from '@cogenta/blocks'
import type { DocumentationCopy } from './documentation-copy.js'
import { deepFrenchTypography, frenchTypography } from './documentation-writer.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * La documentation du produit, en français. Voir `documentation-copy.ts`
 * pour la forme.
 *
 * Le texte est écrit avec des espaces ordinaires : `writer` (et
 * `deepFrenchTypography` pour le reste) y met les espaces insécables avant
 * `: ; ? ! %` et dans les guillemets. Les commandes, clés de configuration,
 * noms d’API et sorties de terminal restent en anglais, comme dans toute
 * documentation française d’un outil de développement ; les commentaires
 * des exemples de code sont traduits.
 */

const BLOCK_VERSION = '1.0.0'

const DOC_PAGES_ONLY = {
  pages: { mode: 'only', targets: [{ kind: 'collection', collection: 'doc_page' }] },
} as const

const PAGES: DocumentationCopy['pages'] = [
  {
    title: 'Introduction',
    slug: 'introduction',
    section: 'start',
    summary:
      'Ce que fait %N%, où il s’exécute à côté de votre application, et par où poursuivre la lecture.',
    body: (w) => [
      w.p(
        '%N% livre les webhooks de votre application. Vous lui envoyez un événement en HTTP ; il signe une copie pour chaque point de terminaison abonné à ce type d’événement, envoie chacune d’elles, enregistre chaque tentative et réessaie les échecs selon un calendrier fixe, jusqu’au succès ou à l’épuisement des tentatives.',
      ),
      w.p(
        'Il s’exécute comme un seul processus Node.js, à côté d’une base de données : SQLite sur un poste de développement, PostgreSQL en production. Aucun compte hébergé à créer, aucune file de messages à exploiter.',
      ),
      w.h2('Ce qu’il prend en charge'),
      w.ul([
        '**La signature.** Chaque requête porte un en-tête `%HDR%-Signature` que le destinataire vérifie en quelques lignes de code.',
        '**Les réessais.** Une livraison en échec est retentée après 30 secondes, 2 minutes, 10 minutes, 1 heure, 6 heures et 24 heures.',
        '**Le journal des livraisons.** Le code de statut, la durée et le premier kilo-octet de la réponse de chaque tentative, conservés 30 jours.',
        '**Le rejeu.** Tout événement des 30 derniers jours peut être renvoyé, à un point de terminaison ou à tous.',
      ]),
      w.h2('Ce qui reste dans votre application'),
      w.p(
        'Votre application décide quels événements existent et ce que contiennent leurs charges utiles. %N% stocke le JSON qu’il reçoit tel quel et livre exactement ces octets : le destinataire voit la même charge que celle envoyée par votre code.',
      ),
      w.h2('Organisation de cette documentation'),
      w.ul([
        '[Premiers pas](/docs/installation) installe l’outil en ligne de commande, lance un serveur local et envoie un premier événement.',
        '[Les guides](/docs/verifier-les-signatures) couvrent la suite du travail : vérifier les signatures, gérer les échecs, configurer et déployer un serveur.',
        '[La référence](/docs/reference-cli) liste chaque commande, chaque clé de configuration et chaque route HTTP.',
      ]),
      w.note(
        'Tip',
        'Si vous avez dix minutes, allez directement au [démarrage rapide](/docs/demarrage-rapide). Il se termine par un événement signé qui arrive chez un récepteur, sur votre propre machine.',
      ),
    ],
  },
  {
    title: 'Installation',
    slug: 'installation',
    section: 'start',
    summary:
      'Installez l’outil en ligne de commande ou lancez l’image de conteneur, puis vérifiez qu’un serveur démarre.',
    body: (w) => [
      w.p(
        '%N% est publié sous la forme d’un seul paquet npm qui contient le serveur et la commande `%cli%`. La même version existe en image de conteneur.',
      ),
      w.h2('Prérequis'),
      w.ref([
        ['Node.js', '20.11 ou plus récent', 'Vérifiez avec `node --version`.'],
        ['SQLite', 'inclus', 'Utilisé par `%cli% dev`. Rien à installer.'],
        ['PostgreSQL', '14 ou plus récent', 'Obligatoire pour `%cli% start` en production.'],
      ]),
      w.h2('Installer la commande'),
      w.code('Terminal', '$ npm install --global %cli%\n$ %cli% --version\n%cli% 2.4.1'),
      w.p(
        'Pour figer la version d’un projet, ajoutez-la en dépendance de développement et lancez-la avec npx :',
      ),
      w.code(
        'Terminal',
        '$ npm install --save-dev %cli%@2.4.1\n$ npx %cli% --version\n%cli% 2.4.1',
      ),
      w.note(
        'Note',
        'Sous Linux, installez Node.js avec un gestionnaire de versions comme nvm ou fnm plutôt que de lancer npm avec sudo. Un paquet global installé avec sudo laisse des fichiers que la mise à jour suivante ne peut pas remplacer.',
      ),
      w.h2('Lancer l’image de conteneur'),
      w.p(
        'L’image lit sa configuration dans des variables d’environnement : un premier lancement n’a donc besoin d’aucun fichier. Elle écoute sur le port 8787.',
      ),
      w.code(
        'Terminal',
        '$ docker run --rm -p 8787:8787 \\\n    -e %ENV%_API_KEY=rk_dev_local \\\n    ghcr.io/example/%cli%:2.4.1\nListening on http://0.0.0.0:8787',
      ),
      w.h2('Vérifier l’installation'),
      w.p(
        '`%cli% doctor` contrôle la version de Node.js, le fichier de configuration, la base de données et la clé d’API, et indique quoi corriger.',
      ),
      w.code(
        'Terminal',
        '$ %cli% doctor\nNode.js 22.11.0                 ok\nConfiguration %cli%.yaml        ok\nDatabase sqlite:.%cli%/dev.db   ok\n%ENV%_API_KEY                   missing, run %cli% init to create one',
      ),
      w.h2('Mettre à jour'),
      w.p(
        'Installez la nouvelle version par-dessus l’ancienne, puis lancez `%cli% migrate` avant de redémarrer le serveur. Chaque version liste ses migrations dans les [nouveautés](/docs/nouveautes).',
      ),
      w.note(
        'Warning',
        'Une migration signalée comme bloquante dans les notes de version demande d’arrêter d’abord tous les serveurs. Pour toutes les autres, les serveurs de la version précédente continuent de tourner.',
      ),
    ],
  },
  {
    title: 'Démarrage rapide',
    slug: 'demarrage-rapide',
    section: 'start',
    summary:
      'Lancez un serveur local, créez un point de terminaison et envoyez-lui un événement signé, en cinq minutes environ.',
    body: (w) => [
      w.p(
        'Il vous faut %N% installé (voir l’[installation](/docs/installation)) et deux fenêtres de terminal. Tout ce qui suit s’exécute sur votre propre machine.',
      ),
      w.h2('Créer un projet'),
      w.p(
        'Dans un répertoire vide, `%cli% init` écrit un fichier de configuration et un fichier `.env` qui contient une nouvelle clé d’API.',
      ),
      w.code(
        'Terminal',
        '$ mkdir webhooks-facturation && cd webhooks-facturation\n$ %cli% init\nCreated %cli%.yaml\nCreated .env with %ENV%_API_KEY',
      ),
      w.h2('Démarrer le serveur de développement'),
      w.p(
        '`%cli% dev` démarre un serveur sur le port 8787 avec une base SQLite dans `.%cli%/dev.db`, et affiche chaque livraison au moment où elle a lieu. Laissez-le tourner ; `Ctrl+C` l’arrête.',
      ),
      w.code(
        'Terminal',
        '$ %cli% dev\nDatabase sqlite:.%cli%/dev.db, 14 migrations applied\nListening on http://localhost:8787',
      ),
      w.h2('Démarrer un récepteur'),
      w.p(
        'Dans le second terminal, `%cli% listen` lance un petit récepteur qui affiche chaque requête reçue, en-têtes compris. Il joue le rôle du point de terminaison que l’un de vos clients exploiterait.',
      ),
      w.code('Terminal', '$ %cli% listen --port 4000\nReceiving on http://localhost:4000/webhooks'),
      w.h2('Créer un point de terminaison'),
      w.p(
        'Un point de terminaison est une URL et les types d’événements auxquels elle s’abonne. Le joker `invoice.*` correspond à tous les types qui commencent par `invoice.`.',
      ),
      w.code(
        'Terminal',
        '$ %cli% endpoints create \\\n    --url http://localhost:4000/webhooks --events "invoice.*"\nEndpoint ep_01J8Z3HQ7N5V created\nSecret   whsec_4f9c2a7e1b0d6c3a',
      ),
      w.h2('Envoyer un événement'),
      w.code(
        'Terminal',
        '$ %cli% events send invoice.paid \\\n    --data \'{"invoice_id":"in_1042","amount":4900,"currency":"eur"}\'\nEvent evt_01J8Z3K6QF2M created, 1 delivery scheduled',
      ),
      w.p('Moins d’une seconde plus tard, le récepteur affiche la requête :'),
      w.code(
        'Sortie du récepteur',
        'POST /webhooks\nContent-Type: application/json\n%HDR%-Event-Id: evt_01J8Z3K6QF2M\n%HDR%-Event-Type: invoice.paid\n%HDR%-Delivery-Attempt: 1\n%HDR%-Signature: t=1757854800,v1=9b1c4e0f7a2d63b8c5e1f09a4d7b2c6e\n\n{"invoice_id":"in_1042","amount":4900,"currency":"eur"}',
      ),
      w.h2('Pour aller plus loin'),
      w.ul([
        '[Vérifiez la signature](/docs/verifier-les-signatures) dans le code de réception avant de faire confiance à une charge utile.',
        'Lisez les [concepts clés](/docs/concepts-cles) pour voir ce qui se passe quand un point de terminaison échoue.',
        'Envoyez des événements depuis votre application avec l’[API HTTP](/docs/api-http) plutôt qu’en ligne de commande.',
      ]),
    ],
  },
  {
    title: 'Concepts clés',
    slug: 'concepts-cles',
    section: 'start',
    summary:
      'Événements, points de terminaison, livraisons et tentatives : comment un événement devient plusieurs requêtes signées.',
    body: (w, media) => [
      w.p(
        'Quatre objets décrivent tout ce que fait %N%. Une fois qu’ils sont clairs, la ligne de commande et l’API HTTP se lisent comme deux façons de créer et d’inspecter les mêmes choses.',
      ),
      media.deliveryFlow === undefined
        ? []
        : [
            {
              _key: 'concepts-cles-figure',
              _type: 'media',
              id: media.deliveryFlow,
              caption: frenchTypography(
                'Un événement, trois points de terminaison. Chaque livraison est signée et envoyée séparément ; celle qui échoue est réessayée sans retarder les autres.',
              ),
            },
          ],
      w.h2('Les événements'),
      w.p(
        'Un événement consigne ce qui s’est passé dans votre application, par exemple le paiement d’une facture. Il a un type (`invoice.paid`), une charge utile JSON de 256 Ko au plus et un identifiant qui commence par `evt_`. Un événement ne change jamais après sa création : pour en corriger un, envoyez-en un nouveau.',
      ),
      w.h2('Les points de terminaison'),
      w.p(
        'Un point de terminaison est une URL qui reçoit des événements, les types d’événements auxquels il s’abonne, et un secret qui commence par `whsec_`. Un type peut se terminer par un joker : `invoice.*` correspond à `invoice.paid` comme à `invoice.voided`.',
      ),
      w.h2('Livraisons et tentatives'),
      w.p(
        'Quand un événement arrive, %N% crée une livraison pour chaque point de terminaison abonné à son type. Chaque livraison est envoyée séparément : un point de terminaison lent ne retarde jamais les autres.',
      ),
      w.p(
        'Une tentative est une requête HTTP pour une livraison. Une réponse 2xx en moins de 10 secondes termine la livraison. Tout autre résultat, redirection comprise, fait échouer la tentative et planifie la suivante.',
      ),
      w.h3('États d’une livraison'),
      w.ref([
        [
          'pending',
          null,
          'En attente de sa première tentative, le plus souvent moins d’une seconde.',
        ],
        ['retrying', null, 'Au moins une tentative a échoué et une autre est planifiée.'],
        ['succeeded', null, 'Une tentative a reçu une réponse 2xx. Aucune autre n’est faite.'],
        [
          'failed',
          null,
          'Les sept tentatives ont échoué. La livraison peut encore être relancée à la main.',
        ],
      ]),
      w.note(
        'Note',
        'Un point de terminaison dont les livraisons échouent depuis cinq jours d’affilée est désactivé. Lancez `%cli% endpoints enable` quand le récepteur refonctionne ; voir [Réessais et rejeu](/docs/reessais-et-rejeu).',
      ),
    ],
  },
  {
    title: 'Vérifier les signatures',
    slug: 'verifier-les-signatures',
    section: 'guides',
    summary:
      'Vérifiez qu’une requête vient bien de votre serveur %N% et qu’elle n’a pas été modifiée en route, avant que votre code n’agisse dessus.',
    body: (w) => [
      w.p(
        'Chaque livraison porte un en-tête `%HDR%-Signature`. Le vérifier prouve deux choses : la requête a été signée avec le secret du point de terminaison, et son corps n’a pas changé depuis.',
      ),
      w.h2('Comment la signature est construite'),
      w.p('L’en-tête contient un horodatage Unix et une ou plusieurs signatures :'),
      w.code(
        '',
        '%HDR%-Signature: t=1757854800,v1=5f2b8c0e61d3a9b7e4f0c2d1a8b6e3f9c7d5a1b2e4f6a8c0d2e4f6a8b0c2d4e6',
      ),
      w.p(
        'Chaque valeur `v1` est le HMAC-SHA256, en hexadécimal, de l’horodatage, d’un point et du corps brut de la requête, avec le secret du point de terminaison pour clé. Pendant la rotation d’un secret, l’en-tête porte une valeur `v1` par secret.',
      ),
      w.h2('Vérifier en Node.js'),
      w.code(
        'verify-signature.ts',
        `import { createHmac, timingSafeEqual } from 'node:crypto'

const TOLERANCE_SECONDS = 300

export function verifySignature(
  rawBody: string,
  header: string,
  secret: string,
): boolean {
  const parts = header.split(',').map((part) => part.split('='))
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1])
  // Refuse les signatures trop anciennes : une requête interceptée
  // ne pourra pas être rejouée plus tard
  const age = Math.abs(Date.now() / 1000 - timestamp)
  if (Number.isNaN(timestamp) || age > TOLERANCE_SECONDS) return false

  const expected = createHmac('sha256', secret)
    .update(timestamp + '.' + rawBody)
    .digest()
  return parts
    .filter(([key]) => key === 'v1')
    .some(([, value]) => {
      const received = Buffer.from(value ?? '', 'hex')
      return (
        received.length === expected.length &&
        timingSafeEqual(received, expected)
      )
    })
}`,
      ),
      w.h3('Dans une route Express'),
      w.p(
        'Lisez le corps en octets bruts sur la seule route du webhook, afin que la signature soit calculée sur exactement ce qui a été envoyé.',
      ),
      w.code(
        'server.ts',
        `import express from 'express'
import { handleEvent } from './events.js'
import { verifySignature } from './verify-signature.js'

const app = express()
const rawJson = express.raw({ type: 'application/json' })

app.post('/webhooks', rawJson, (req, res) => {
  const body = req.body.toString('utf8')
  const header = req.get('%HDR%-Signature') ?? ''
  const secret = process.env.WEBHOOK_SECRET ?? ''
  if (verifySignature(body, header, secret) === false) {
    res.status(400).send('invalid signature')
    return
  }
  // Répondre d’abord, traiter ensuite : une tentative expire après 10 s
  res.status(204).end()
  handleEvent(JSON.parse(body))
})`,
      ),
      w.note(
        'Warning',
        'La plupart des frameworks analysent le JSON avant que votre gestionnaire ne s’exécute. Sérialiser à nouveau l’objet obtenu change les espaces et l’ordre des clés, et la signature ne correspond plus. Vérifiez toujours le corps brut.',
      ),
      w.h2('Vérifier en Python'),
      w.code(
        'verify_signature.py',
        `import hashlib
import hmac
import time

TOLERANCE = 300

def verify_signature(raw_body: bytes, header: str, secret: str) -> bool:
    parts = [part.split("=", 1) for part in header.split(",")]
    stamps = [value for name, value in parts if name == "t"]
    if not stamps or abs(time.time() - int(stamps[0])) > TOLERANCE:
        return False
    signed = stamps[0].encode() + b"." + raw_body
    key = secret.encode()
    digest = hmac.new(key, signed, hashlib.sha256).hexdigest()
    received = [value for name, value in parts if name == "v1"]
    return any(hmac.compare_digest(digest, value) for value in received)`,
      ),
      w.h2('Renouveler un secret'),
      w.p(
        'Un renouvellement émet un nouveau secret et garde le précédent valide pendant un délai de grâce : les destinataires peuvent basculer sans rejeter une seule requête.',
      ),
      w.code(
        'Terminal',
        '$ %cli% endpoints rotate-secret ep_01J8Z3HQ7N5V --grace 24h\nNew secret      whsec_7d31b0c9e25a4f18\nPrevious secret valid until 2026-09-15 09:12 UTC',
      ),
    ],
  },
  {
    title: 'Réessais et rejeu',
    slug: 'reessais-et-rejeu',
    section: 'guides',
    summary:
      'Ce qui se passe quand un point de terminaison échoue, comment relancer une livraison à la main et comment renvoyer des événements passés.',
    body: (w) => [
      w.p(
        'Les points de terminaison tombent, les déploiements renvoient des erreurs et les certificats expirent. Une tentative échouée ouvre un calendrier, et le journal des livraisons en montre chaque étape.',
      ),
      w.h2('Le calendrier des réessais'),
      w.p(
        'Une livraison reçoit jusqu’à sept tentatives. Après un échec, la tentative suivante attend l’intervalle ci-dessous, plus jusqu’à 10 % de gigue aléatoire : un point de terminaison qui se remet d’une panne ne reçoit pas tous les réessais au même instant.',
      ),
      w.ref([
        ['30s', 'tentative 2', 'Couvre un redémarrage ou un déploiement en cours.'],
        ['2m', 'tentative 3', 'Couvre une courte coupure réseau.'],
        ['10m', 'tentative 4', 'Couvre un déploiement raté que l’on annule.'],
        ['1h', 'tentative 5', 'Couvre la plupart des incidents côté récepteur.'],
        ['6h', 'tentative 6', 'Couvre une panne qui dure jusque dans la soirée.'],
        ['24h', 'tentative 7', 'La dernière, un peu plus de 31 heures après la première.'],
      ]),
      w.p(
        'Modifiez les intervalles avec `delivery.retries.schedule` dans le [fichier de configuration](/docs/reference-configuration). Il y a toujours une tentative de plus que d’intervalles.',
      ),
      w.h2('Relancer une livraison à la main'),
      w.p(
        'Une fois le récepteur réparé, inutile d’attendre la prochaine tentative planifiée. Listez les livraisons en échec du point de terminaison et relancez celles qu’il vous faut :',
      ),
      w.code(
        'Terminal',
        '$ %cli% deliveries list --endpoint ep_01J8Z3HQ7N5V --status failed\nID                 EVENT           ATTEMPTS  LAST RESULT\ndlv_01J8Z9AQ2C7R   invoice.paid    7         503\ndlv_01J8Z9B4TMW1   invoice.voided  7         timeout\n$ %cli% deliveries retry dlv_01J8Z9AQ2C7R\nAttempt 8 scheduled for dlv_01J8Z9AQ2C7R',
      ),
      w.p(
        'Une relance manuelle ajoute une tentative à la même livraison. Le récepteur voit le même `%HDR%-Event-Id` qu’avant et peut reconnaître une requête déjà traitée.',
      ),
      w.h2('Rejouer des événements passés'),
      w.p(
        'Un rejeu crée de nouvelles livraisons pour des événements qui existent déjà. Utilisez-le après avoir ajouté un point de terminaison qui aurait dû recevoir des événements antérieurs, ou après qu’un récepteur a perdu des données.',
      ),
      w.code(
        'Terminal',
        '$ %cli% events replay --since 2026-09-12T08:00:00Z \\\n    --types "invoice.*" --endpoint ep_01J8Z3HQ7N5V\n38 events matched, 38 deliveries scheduled',
      ),
      w.note(
        'Note',
        'Un rejeu n’atteint que les événements encore dans la fenêtre de conservation, 30 jours par défaut. Un événement rejoué garde son identifiant d’origine : les récepteurs doivent s’appuyer sur `%HDR%-Event-Id` pour ignorer ceux qu’ils ont déjà traités.',
      ),
    ],
  },
  {
    title: 'Configuration',
    slug: 'configuration',
    section: 'guides',
    summary:
      'Où le serveur lit ses réglages, et lesquels revoir avant de passer un serveur en production.',
    body: (w) => [
      w.p(
        'Le serveur lit `%cli%.yaml` dans son répertoire de travail, puis applique par-dessus les variables d’environnement. Une valeur définie dans l’environnement l’emporte toujours : un seul fichier sert au développement comme à la production.',
      ),
      w.code(
        '%cli%.yaml',
        `server:
  port: 8787
  public_url: http://localhost:8787

database:
  url: sqlite:.%cli%/dev.db

delivery:
  timeout: 10s
  concurrency: 32
  retries:
    schedule: [30s, 2m, 10m, 1h, 6h, 24h]

retention:
  events: 30d`,
      ),
      w.h2('Variables d’environnement'),
      w.p(
        'Chaque clé a sa variable d’environnement : écrivez son chemin en majuscules, remplacez les points par des tirets bas et ajoutez le préfixe `%ENV%_`. `database.url` devient `%ENV%_DATABASE_URL`.',
      ),
      w.ref([
        [
          '%ENV%_API_KEY',
          'obligatoire',
          'Authentifie les appels à l’API HTTP, y compris ceux de la ligne de commande.',
        ],
        [
          '%ENV%_DATABASE_URL',
          'facultative',
          'Remplace `database.url`. À utiliser pour les identifiants de production.',
        ],
        [
          '%ENV%_CONFIG',
          'facultative',
          'Chemin d’un fichier de configuration autre que `%cli%.yaml`.',
        ],
      ]),
      w.note(
        'Warning',
        'Gardez les secrets hors de `%cli%.yaml`. Ce fichier est fait pour être versionné avec votre code ; la clé d’API et le mot de passe de la base relèvent de l’environnement ou du gestionnaire de secrets de votre plateforme.',
      ),
      w.h2('Avant de passer un serveur en production'),
      w.ul([
        '`server.public_url`, pour que les liens du journal des livraisons pointent vers le bon hôte.',
        '`delivery.concurrency`, le nombre de requêtes qu’un serveur envoie en même temps. Augmentez-le quand des livraisons commencent à attendre.',
        '`retention.events`, si vos clients attendent des rejeux qui remontent au-delà de 30 jours.',
      ]),
      w.p(
        'La [référence de configuration](/docs/reference-configuration) liste chaque clé avec son type et sa valeur par défaut.',
      ),
    ],
  },
  {
    title: 'Déploiement en production',
    slug: 'deploiement-en-production',
    section: 'guides',
    summary:
      'Faites tourner %N% sur PostgreSQL derrière un reverse proxy, avec des sondes de santé et plusieurs serveurs.',
    body: (w) => [
      w.p(
        'Un serveur de production a besoin de trois choses : une base PostgreSQL, une clé d’API dans l’environnement, et un superviseur qui relance le processus s’il s’arrête.',
      ),
      w.h2('Préparer la base de données'),
      w.code(
        'Terminal',
        '# Le mot de passe vient de PGPASSWORD ou du gestionnaire de secrets\n$ export %ENV%_DATABASE_URL=postgres://%cli%@db.internal:5432/%cli%\n$ %cli% migrate\nApplied 14 migrations in 1.8 s',
      ),
      w.p(
        'Lancez `%cli% migrate` une fois par version, avant le démarrage de la nouvelle. Un serveur refuse de démarrer sur une base qui a des migrations en attente.',
      ),
      w.h2('Lancer le serveur'),
      w.p('L’image exécute `%cli% start` par défaut. Avec Docker Compose :'),
      w.code(
        'compose.yaml',
        `services:
  %cli%:
    image: ghcr.io/example/%cli%:2.4.1
    ports:
      - "8787:8787"
    environment:
      %ENV%_API_KEY: \${%ENV%_API_KEY}
      %ENV%_DATABASE_URL: \${%ENV%_DATABASE_URL}
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8787/healthz"]
      interval: 10s
    restart: unless-stopped`,
      ),
      w.h2('Placer un proxy devant'),
      w.p(
        'Terminez TLS sur un reverse proxy ou un répartiteur de charge et transmettez le trafic au port 8787. Seule l’API HTTP reçoit du trafic entrant ; les livraisons sont des requêtes sortantes.',
      ),
      w.h2('Sondes de santé'),
      w.p(
        '`GET /healthz` répond 200 quand la base est joignable et ses migrations à jour, et 503 sinon. Pointez-y à la fois les sondes de vivacité et de disponibilité.',
      ),
      w.h2('Faire tourner plusieurs serveurs'),
      w.p(
        'Plusieurs serveurs peuvent partager une base. Chacun réserve ses livraisons avec un verrou de ligne (`FOR UPDATE SKIP LOCKED`) : deux serveurs n’envoient jamais la même tentative. Ajoutez un serveur quand `%cli% status` montre des livraisons qui attendent plus de quelques secondes.',
      ),
      w.note(
        'Tip',
        'Arrêtez un serveur avec SIGTERM. Il termine les tentatives en cours, pendant la durée du délai de livraison au plus, avant de s’arrêter.',
      ),
    ],
  },
  {
    title: 'Référence de la CLI',
    slug: 'reference-cli',
    section: 'reference',
    summary:
      'Chaque commande et chaque option globale de la ligne de commande %N%, et ce que signifie chaque code de sortie.',
    body: (w) => [
      w.p(
        'Chaque commande lit `%cli%.yaml` et les variables d’environnement `%ENV%_` décrites dans la page [Configuration](/docs/configuration). `%cli% help COMMANDE` affiche les options d’une commande.',
      ),
      w.h2('Projet et serveur'),
      w.ref([
        [
          '%cli% init',
          null,
          'Écrit `%cli%.yaml` et un fichier `.env` avec une nouvelle clé d’API dans le répertoire courant.',
        ],
        [
          '%cli% dev',
          null,
          'Démarre un serveur de développement sur SQLite et affiche chaque livraison.',
        ],
        [
          '%cli% start',
          null,
          'Démarre un serveur de production. `database.url` doit pointer vers PostgreSQL.',
        ],
        ['%cli% migrate', null, 'Applique les migrations de base en attente, puis s’arrête.'],
        [
          '%cli% status',
          null,
          'Montre les serveurs en marche, les livraisons en file et la plus ancienne en attente.',
        ],
        [
          '%cli% doctor',
          null,
          'Contrôle Node.js, la configuration, la base de données et la clé d’API.',
        ],
      ]),
      w.h2('Points de terminaison'),
      w.ref([
        [
          '%cli% endpoints create',
          null,
          'Crée un point de terminaison à partir de `--url` et `--events`, et affiche son secret une seule fois.',
        ],
        [
          '%cli% endpoints list',
          null,
          'Liste les points de terminaison avec leur état et leur taux d’échec sur 24 heures.',
        ],
        [
          '%cli% endpoints disable ID',
          null,
          'Arrête les livraisons vers un point de terminaison. Les nouvelles attendent sa réactivation.',
        ],
        ['%cli% endpoints enable ID', null, 'Reprend les livraisons vers un point de terminaison.'],
        [
          '%cli% endpoints rotate-secret ID',
          null,
          'Émet un nouveau secret. `--grace` garde le précédent valide, 24 heures par défaut.',
        ],
      ]),
      w.h2('Événements et livraisons'),
      w.ref([
        [
          '%cli% events send TYPE',
          null,
          'Envoie un événement. La charge utile vient de `--data` ou de l’entrée standard.',
        ],
        [
          '%cli% events replay',
          null,
          'Crée de nouvelles livraisons pour des événements passés, filtrés par `--since`, `--types` et `--endpoint`.',
        ],
        [
          '%cli% deliveries list',
          null,
          'Liste les livraisons, filtrées par `--endpoint` et `--status`.',
        ],
        [
          '%cli% deliveries retry ID',
          null,
          'Planifie sans attendre une tentative supplémentaire pour une livraison.',
        ],
        [
          '%cli% listen',
          null,
          'Démarre un récepteur local qui affiche chaque requête. Pour le développement uniquement.',
        ],
      ]),
      w.h2('Options globales'),
      w.ref([
        ['--config PATH', 'chaîne', 'Lit un autre fichier de configuration.'],
        [
          '--api-url URL',
          'chaîne, http://localhost:8787 par défaut',
          'Le serveur avec lequel une commande dialogue.',
        ],
        ['--json', 'booléen', 'Affiche un objet JSON par ligne au lieu d’un tableau.'],
        ['--quiet', 'booléen', 'N’affiche que les erreurs.'],
      ]),
      w.h2('Codes de sortie'),
      w.ref([
        ['0', null, 'La commande a réussi.'],
        ['1', null, 'La commande a échoué. La raison est écrite sur la sortie d’erreur standard.'],
        ['2', null, 'Un argument ou la configuration est invalide.'],
        ['3', null, 'Le serveur est injoignable.'],
      ]),
    ],
  },
  {
    title: 'Référence de configuration',
    slug: 'reference-configuration',
    section: 'reference',
    summary:
      'Chaque clé acceptée par le fichier de configuration, avec son type et sa valeur par défaut.',
    body: (w) => [
      w.p(
        'Les durées acceptent les suffixes `ms`, `s`, `m`, `h` et `d`. Chaque clé peut aussi être définie par une variable d’environnement, comme l’explique la page [Configuration](/docs/configuration).',
      ),
      w.h2('server'),
      w.ref([
        ['server.port', 'entier, 8787 par défaut', 'Port sur lequel écoute l’API HTTP.'],
        ['server.host', 'chaîne, 0.0.0.0 par défaut', 'Interface réseau à laquelle se lier.'],
        [
          'server.public_url',
          'chaîne',
          'Adresse utilisée dans les liens du journal des livraisons.',
        ],
      ]),
      w.h2('database'),
      w.ref([
        [
          'database.url',
          'chaîne, obligatoire',
          'Un chemin `sqlite:` ou une chaîne de connexion `postgres://`.',
        ],
        ['database.pool_size', 'entier, 10 par défaut', 'Connexions qu’un serveur garde ouvertes.'],
      ]),
      w.h2('delivery'),
      w.ref([
        [
          'delivery.timeout',
          'durée, 10s par défaut',
          'Temps dont dispose un point de terminaison pour répondre à une tentative.',
        ],
        [
          'delivery.concurrency',
          'entier, 32 par défaut',
          'Requêtes qu’un serveur envoie en même temps.',
        ],
        [
          'delivery.retries.schedule',
          'liste de durées',
          'Attentes entre les tentatives. La valeur par défaut est `[30s, 2m, 10m, 1h, 6h, 24h]`.',
        ],
        [
          'delivery.retries.jitter',
          'nombre, 0.1 par défaut',
          'Part de chaque attente ajoutée au hasard.',
        ],
        [
          'delivery.disable_after',
          'durée, 5d par défaut',
          'Désactive un point de terminaison en échec depuis cette durée.',
        ],
      ]),
      w.h2('signing'),
      w.ref([
        [
          'signing.tolerance',
          'durée, 5m par défaut',
          'Âge à partir duquel les bibliothèques officielles rejettent une signature.',
        ],
        ['signing.header', 'chaîne, %HDR%-Signature par défaut', 'Nom de l’en-tête de signature.'],
      ]),
      w.h2('retention'),
      w.ref([
        [
          'retention.events',
          'durée, 30d par défaut',
          'Durée de conservation des événements, des livraisons et des tentatives.',
        ],
        [
          'retention.response_body',
          'taille, 1KB par défaut',
          'Part du corps de chaque réponse qui est conservée.',
        ],
      ]),
    ],
  },
  {
    title: 'API HTTP',
    slug: 'api-http',
    section: 'reference',
    summary:
      'Envoyez des événements et inspectez les livraisons en HTTP, avec des exemples de requêtes, de réponses et d’erreurs.',
    body: (w) => [
      w.p(
        'Chaque serveur %N% expose l’API sous `/v1`. Les requêtes et les réponses sont en JSON, et toute requête, sauf la sonde de santé, s’authentifie avec la clé d’API comme jeton porteur.',
      ),
      w.code(
        'Terminal',
        '$ curl http://localhost:8787/v1/endpoints \\\n    -H "Authorization: Bearer $%ENV%_API_KEY"',
      ),
      w.h2('Ressources'),
      w.ref([
        ['POST /v1/events', null, 'Envoie un événement et planifie ses livraisons.'],
        [
          'GET /v1/events/{id}',
          null,
          'Renvoie un événement et l’état de chacune de ses livraisons.',
        ],
        ['POST /v1/endpoints', null, 'Crée un point de terminaison.'],
        ['GET /v1/endpoints', null, 'Liste les points de terminaison.'],
        [
          'PATCH /v1/endpoints/{id}',
          null,
          'Modifie l’URL, les types d’événements ou l’état d’un point de terminaison.',
        ],
        [
          'GET /v1/deliveries',
          null,
          'Liste les livraisons, filtrées par `status`, `endpoint` ou `event`.',
        ],
        [
          'GET /v1/deliveries/{id}/attempts',
          null,
          'Liste les tentatives d’une livraison, de la plus récente à la plus ancienne.',
        ],
        ['POST /v1/deliveries/{id}/retry', null, 'Planifie une tentative supplémentaire.'],
        ['GET /healthz', null, 'Indique si le serveur est prêt. Ne demande aucune clé d’API.'],
      ]),
      w.h2('Envoyer un événement'),
      w.p(
        '`idempotency_key` est facultative. Une seconde requête avec la même clé dans les 24 heures renvoie le premier événement au lieu d’en créer un nouveau.',
      ),
      w.code(
        'Requête',
        `POST /v1/events HTTP/1.1
Host: localhost:8787
Authorization: Bearer rk_live_2Jx8Qd4mT7
Content-Type: application/json

{
  "type": "invoice.paid",
  "idempotency_key": "invoice-in_1042-paid",
  "data": {
    "invoice_id": "in_1042",
    "amount": 4900,
    "currency": "eur"
  }
}`,
      ),
      w.code(
        'Réponse : 202 Accepted',
        `{
  "id": "evt_01J8Z3K6QF2M",
  "type": "invoice.paid",
  "created_at": "2026-09-14T09:12:04Z",
  "deliveries": 3
}`,
      ),
      w.h2('Lister les livraisons en échec'),
      w.code(
        'Requête',
        'GET /v1/deliveries?status=failed&limit=2 HTTP/1.1\nHost: localhost:8787\nAuthorization: Bearer rk_live_2Jx8Qd4mT7',
      ),
      w.code(
        'Réponse : 200 OK',
        `{
  "data": [
    {
      "id": "dlv_01J8Z9AQ2C7R",
      "event": "evt_01J8Z3K6QF2M",
      "endpoint": "ep_01J8Z3HQ7N5V",
      "status": "failed",
      "attempts": 7,
      "last_response": { "status": 503, "duration_ms": 10000 }
    }
  ],
  "next_cursor": null
}`,
      ),
      w.h2('Erreurs'),
      w.p(
        'Une erreur porte un code de statut standard et un corps avec un `code` stable et un `message` lisible.',
      ),
      w.code(
        'Réponse : 409 Conflict',
        `{
  "error": {
    "code": "idempotency_conflict",
    "message": "This idempotency key was used with a different body."
  }
}`,
      ),
      w.ref([
        [
          '400 invalid_request',
          null,
          'Le corps n’est pas du JSON valide, ou un champ obligatoire manque.',
        ],
        ['401 unauthorized', null, 'La clé d’API est absente ou a été révoquée.'],
        ['404 not_found', null, 'Aucun objet n’existe avec cet identifiant.'],
        [
          '409 idempotency_conflict',
          null,
          'La clé d’idempotence a été utilisée avec un autre corps au cours des 24 dernières heures.',
        ],
        ['413 payload_too_large', null, 'La charge utile de l’événement dépasse 256 Ko.'],
        [
          '429 rate_limited',
          null,
          'Trop de requêtes. Attendez le nombre de secondes indiqué dans l’en-tête `Retry-After`.',
        ],
      ]),
    ],
  },
  {
    title: 'Dépannage',
    slug: 'depannage',
    section: 'help',
    summary: 'Les problèmes les plus fréquents, la cause de chacun et la façon de les résoudre.',
    body: (w) => [
      w.p(
        'Commencez par `%cli% doctor`, qui repère la plupart des problèmes de configuration. Les sections ci-dessous couvrent ce qu’il ne peut pas voir depuis le serveur.',
      ),
      w.h2('Les signatures ne correspondent jamais'),
      w.p(
        'Presque toujours, le récepteur vérifie un corps qui a été analysé puis sérialisé de nouveau. Vérifiez les octets bruts, comme le montre la page [Vérifier les signatures](/docs/verifier-les-signatures). Si le corps est brut et que les signatures échouent encore, vérifiez que le secret appartient bien à ce point de terminaison : chacun a le sien.',
      ),
      w.h2('Horodatage hors de la tolérance'),
      w.p(
        'L’horloge du récepteur est décalée de plus de cinq minutes par rapport à celle du serveur. Activez NTP sur cet hôte, ou augmentez `signing.tolerance` le temps de corriger.',
      ),
      w.h2('Des livraisons restent en attente'),
      w.p(
        'Aucun serveur ne prend les livraisons en charge. `%cli% migrate` s’arrête une fois terminé : vérifiez donc qu’un processus exécute `%cli% start`, puis regardez `%cli% status` :',
      ),
      w.code(
        'Terminal',
        '$ %cli% status\nServers         2 running\nQueued          1,284 deliveries\nOldest waiting  3 min 12 s\nAttempts        2,410 per minute',
      ),
      w.p(
        'Une file qui grossit alors que des serveurs tournent signifie que `delivery.concurrency` est trop bas pour votre trafic, ou qu’un point de terminaison est assez lent pour occuper tous les emplacements de requête. Augmentez la concurrence ou ajoutez un serveur.',
      ),
      w.h2('Chaque tentative échoue sur une redirection'),
      w.p(
        '%N% ne suit pas les redirections : une requête signée transmise à un autre hôte lui livrerait sa charge utile, alors que personne ne l’a choisi. Mettez le point de terminaison à jour avec son URL définitive, le plus souvent la forme en `https://` de l’adresse.',
      ),
      w.h2('Connexion refusée depuis un conteneur'),
      w.p(
        'Dans un conteneur, `localhost` désigne le conteneur lui-même. Utilisez `host.docker.internal` avec Docker Desktop, ou le nom du service sur un réseau Compose.',
      ),
      w.h2('Un point de terminaison a été désactivé'),
      w.p(
        'Un point de terminaison est désactivé après cinq jours de livraisons en échec. Réparez le récepteur, lancez `%cli% endpoints enable ID`, puis renvoyez ce qu’il a manqué avec `%cli% events replay --endpoint ID --since` suivi de l’heure à laquelle les échecs ont commencé.',
      ),
    ],
  },
  {
    title: 'Nouveautés',
    slug: 'nouveautes',
    section: 'help',
    summary:
      'Les changements de chaque version de %N%, de la plus récente à la plus ancienne, avec la marche à suivre pour mettre à jour.',
    body: (w) => [
      w.p(
        '%N% suit le versionnage sémantique. Une version mineure ne change jamais le format de configuration ni l’API HTTP d’une manière qui casserait une intégration existante.',
      ),
      w.h2('2.4, 2 septembre 2026'),
      w.ul([
        'Les types d’événements d’un point de terminaison acceptent un joker final, comme `invoice.*`.',
        '`%cli% events replay` accepte `--since` et `--types` : un rejeu n’a plus besoin d’une liste d’identifiants d’événements.',
        'L’en-tête `%HDR%-Delivery-Attempt` indique au récepteur de quelle tentative il s’agit.',
        '`delivery.retries.jitter` étale les réessais après une panne. La valeur par défaut est de 10 %.',
      ]),
      w.h3('Mettre à jour depuis la 2.3'),
      w.p(
        'Lancez `%cli% migrate` avant de démarrer la 2.4. La migration ajoute un index à la table des livraisons et prend moins d’une minute sur dix millions de lignes.',
      ),
      w.h2('2.3, 15 juillet 2026'),
      w.ul([
        '`%cli% dev` s’exécute sur SQLite : un serveur local n’a plus besoin de PostgreSQL.',
        'Nouvelle commande `%cli% doctor`.',
        '`retention.response_body` règle la part de chaque réponse qui est conservée.',
      ]),
      w.h3('Mettre à jour depuis la 2.2'),
      w.p(
        'Rien à changer dans le fichier de configuration. Les projets de développement qui pointaient `database.url` vers un PostgreSQL local peuvent passer à SQLite en retirant la clé, puisque `%cli% dev` crée désormais sa propre base.',
      ),
      w.h2('2.2, 20 mai 2026'),
      w.ul([
        'Clés d’idempotence sur `POST /v1/events`.',
        'Les points de terminaison sont désactivés après cinq jours d’échecs au lieu de sept. Définissez `delivery.disable_after` pour conserver l’ancien comportement.',
      ]),
    ],
  },
]

const FOOTER: DocumentationCopy['footer'] = [
  {
    heading: 'Premiers pas',
    links: [
      { label: 'Introduction', url: '/docs/introduction' },
      { label: 'Installation', url: '/docs/installation' },
      { label: 'Démarrage rapide', url: '/docs/demarrage-rapide' },
    ],
  },
  {
    heading: 'Guides',
    links: [
      { label: 'Vérifier les signatures', url: '/docs/verifier-les-signatures' },
      { label: 'Réessais et rejeu', url: '/docs/reessais-et-rejeu' },
      { label: 'Déploiement en production', url: '/docs/deploiement-en-production' },
    ],
  },
  {
    heading: 'Référence',
    links: [
      { label: 'CLI', url: '/docs/reference-cli' },
      { label: 'Configuration', url: '/docs/reference-configuration' },
      { label: 'API HTTP', url: '/docs/api-http' },
    ],
  },
  {
    heading: 'Aide',
    links: [
      { label: 'Dépannage', url: '/docs/depannage' },
      { label: 'Nouveautés', url: '/docs/nouveautes' },
    ],
  },
]

export const DOCUMENTATION_COPY_FR: DocumentationCopy = {
  locale: 'fr',
  sections: { start: 'Premiers pas', guides: 'Guides', reference: 'Référence', help: 'Aide' },
  pages: PAGES,
  changelogSlug: 'nouveautes',
  typography: frenchTypography,
  home: {
    slug: 'home',
    title: (name) => `Documentation ${name}`,
    blocks: (names, w) => {
      const { name } = names
      const blocks: readonly VocabularyBlock[] = [
        {
          _key: 'home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: `${name} 2.4`,
          title: `Documentation ${name}`,
          subtitle:
            'Envoyez des webhooks signés depuis votre application, réessayez les livraisons en échec selon un calendrier et rejouez les événements des 30 derniers jours. Commencez par le démarrage rapide, ou cherchez dans les guides et la référence.',
          actions: [
            {
              label: 'Démarrage rapide',
              target: { href: '/docs/demarrage-rapide' },
              emphasis: 'primary',
            },
            { label: 'Référence de l’API HTTP', target: { href: '/docs/api-http' } },
          ],
        },
        {
          _key: 'home-start',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'Par où commencer',
          items: [
            {
              _key: 'home-start-install',
              title: 'Installer la commande',
              text: 'Node.js 20.11 ou plus récent, ou l’image de conteneur.',
              link: { href: '/docs/installation' },
            },
            {
              _key: 'home-start-quickstart',
              title: 'Envoyer votre premier événement',
              text: 'Un serveur local, un point de terminaison et une requête signée, en cinq minutes environ.',
              link: { href: '/docs/demarrage-rapide' },
            },
            {
              _key: 'home-start-concepts',
              title: 'Comprendre les concepts',
              text: 'Événements, points de terminaison, livraisons et tentatives, et ce qui se passe en cas d’échec.',
              link: { href: '/docs/concepts-cles' },
            },
          ],
        },
        {
          _key: 'home-browse',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'Parcourir la documentation',
          collection: 'doc_page',
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 100,
          layout: 'list',
        },
        {
          _key: 'home-send',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            w.h2('Envoyer un événement depuis votre application'),
            w.p(
              'Une fois qu’un serveur tourne, votre application envoie des événements en HTTP. Chaque point de terminaison abonné au type d’événement reçoit sa propre copie signée.',
            ),
            w.code(
              'send-event.ts',
              `const response = await fetch('http://localhost:8787/v1/events', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + process.env.%ENV%_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'invoice.paid',
    data: { invoice_id: 'in_1042', amount: 4900, currency: 'eur' },
  }),
})

// 202 Accepted : l’événement est stocké et ses livraisons sont planifiées
const { id, deliveries } = await response.json()`,
            ),
            w.p(
              'La [référence de l’API HTTP](/docs/api-http) liste chaque ressource, avec des exemples de réponses et d’erreurs.',
            ),
          ],
        },
        {
          _key: 'home-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Questions fréquentes',
          items: [
            {
              _key: 'home-faq-databases',
              question: `Quelles bases de données ${name} prend-il en charge ?`,
              answer: [
                w.p(
                  'SQLite pour le développement local avec `%cli% dev`, et PostgreSQL 14 ou plus récent pour `%cli% start` en production.',
                ),
              ],
            },
            {
              _key: 'home-faq-licence',
              question: `${name} est-il open source ?`,
              answer: [
                w.p(
                  'Oui. Le serveur, la ligne de commande et les bibliothèques de signature sont publiés sous licence Apache 2.0.',
                ),
              ],
            },
            {
              _key: 'home-faq-retention',
              question: 'Combien de temps les événements sont-ils conservés ?',
              answer: [
                w.p(
                  '30 jours par défaut, avec chaque tentative et le premier kilo-octet de chaque réponse. Modifiez cette durée avec `retention.events`.',
                ),
              ],
            },
            {
              _key: 'home-faq-outage',
              question:
                'Que se passe-t-il quand un point de terminaison est hors service pendant une journée ?',
              answer: [
                w.p(
                  'Ses livraisons sont réessayées pendant un peu plus de 31 heures. Passé ce délai, [relancez-les à la main ou rejouez-les](/docs/reessais-et-rejeu) une fois le point de terminaison rétabli.',
                ),
              ],
            },
          ],
        },
        {
          _key: 'home-help',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Une livraison qui échoue',
          text: 'La plupart des problèmes de livraison tiennent à une signature, à une horloge, ou à un point de terminaison qui répond par une redirection.',
          actions: [
            { label: 'Dépannage', target: { href: '/docs/depannage' } },
            { label: 'Nouveautés de la 2.4', target: { href: '/docs/nouveautes' } },
          ],
        },
      ]
      return deepFrenchTypography(blocks)
    },
  },
  diagram: {
    file: 'documentation/delivery-flow-fr.png',
    alt: 'Schéma : votre application envoie un événement au serveur de livraison, qui l’enregistre, signe une copie pour chaque point de terminaison et envoie trois requêtes ; deux points de terminaison répondent 200 et un répond 503 et sera réessayé dans deux minutes.',
  },
  menus: {
    header: deepFrenchTypography([
      { label: 'Premiers pas', url: '/docs/demarrage-rapide' },
      { label: 'Guides', url: '/docs/verifier-les-signatures' },
      { label: 'Référence', url: '/docs/reference-cli' },
      { label: 'Nouveautés', url: '/docs/nouveautes' },
    ]),
  },
  footer: deepFrenchTypography(FOOTER),
  settings: deepFrenchTypography({
    'general.tagline':
      'Livraison de webhooks signés pour votre application, avec réessais et rejeu.',
    'general.socialLinks': [
      { label: 'GitHub', url: 'https://github.com/example' },
      { label: 'Bluesky', url: 'https://bsky.app/profile/example.com' },
      { label: 'X', url: 'https://x.com/example' },
    ],
    'general.footerNote':
      'Publié sous licence Apache 2.0.\nTexte de la documentation sous licence CC BY 4.0.',
    // Une page de documentation n’est pas une discussion.
    'discussion.enabled': false,
  }),
  widgets: (slugs) => {
    const widgets: readonly BlueprintWidget[] = [
      {
        area: 'sidebar',
        type: 'links',
        title: 'Besoin d’aide ?',
        settings: {
          items: [
            { label: 'Dépannage', href: '/docs/depannage' },
            { label: 'Référence de configuration', href: '/docs/reference-configuration' },
            {
              label: 'Signaler un problème sur GitHub',
              href: 'https://github.com/example',
              newTab: true,
            },
          ],
        },
        visibility: DOC_PAGES_ONLY,
      },
      {
        area: 'sidebar',
        type: 'cta',
        settings: {
          heading: 'Vous migrez depuis la 2.3 ?',
          body: 'Lancez la migration avant de démarrer la 2.4. Elle ajoute un index et prend moins d’une minute sur dix millions de livraisons.',
          label: 'Lire les notes de version',
          href: '/docs/nouveautes',
        },
        visibility: {
          pages: {
            mode: 'only',
            targets: slugs
              .filter((slug) => slug !== 'nouveautes')
              .map((slug) => ({ kind: 'path', path: `/docs/${slug}` })),
          },
        },
      },
      {
        area: 'sidebar',
        type: 'links',
        title: 'Pages les plus lues',
        settings: {
          items: [
            { label: 'Démarrage rapide', href: '/docs/demarrage-rapide' },
            { label: 'Vérifier les signatures', href: '/docs/verifier-les-signatures' },
            { label: 'Réessais et rejeu', href: '/docs/reessais-et-rejeu' },
            { label: 'API HTTP', href: '/docs/api-http' },
            { label: 'Référence de la CLI', href: '/docs/reference-cli' },
          ],
        },
        visibility: { pages: { mode: 'only', targets: [{ kind: 'search' }] } },
      },
    ]
    return deepFrenchTypography(widgets)
  },
}
