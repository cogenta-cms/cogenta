import type { DocumentationCopy } from './documentation-copy.js'

/** The documentation of the product, in English. See `documentation-copy.ts` for the shape. */

const BLOCK_VERSION = '1.0.0'

const DOC_PAGES_ONLY = {
  pages: { mode: 'only', targets: [{ kind: 'collection', collection: 'doc_page' }] },
} as const

const PAGES: DocumentationCopy['pages'] = [
  {
    title: 'Introduction',
    slug: 'introduction',
    section: 'start',
    summary: 'What %N% does, where it runs next to your application, and where to read next.',
    body: (w) => [
      w.p(
        '%N% delivers webhooks for your application. You send it an event over HTTP, and it signs a copy for every endpoint subscribed to that event type, sends each one, records every attempt, and retries failures on a fixed schedule until they succeed or run out of attempts.',
      ),
      w.p(
        'It runs as a single Node.js process next to a database: SQLite on a laptop, PostgreSQL in production. There is no hosted account to create and no message queue to operate.',
      ),
      w.h2('What it handles for you'),
      w.ul([
        '**Signing.** Every request carries a `%HDR%-Signature` header that a receiver checks with a few lines of code.',
        '**Retries.** A failed delivery is tried again after 30 seconds, 2 minutes, 10 minutes, 1 hour, 6 hours and 24 hours.',
        '**A delivery log.** The status code, the duration and the first kilobyte of the response of every attempt, kept for 30 days.',
        '**Replay.** Any event from the last 30 days can be sent again, to one endpoint or to all of them.',
      ]),
      w.h2('What stays in your application'),
      w.p(
        'Your application decides which events exist and what their payloads contain. %N% stores the JSON it receives as it is and delivers exactly those bytes, so a receiver sees the same payload your code sent.',
      ),
      w.h2('How this documentation is organised'),
      w.ul([
        '[Getting started](/docs/installation) installs the command-line tool, runs a local server and sends a first event.',
        '[Guides](/docs/verifying-signatures) cover the work that follows: verifying signatures, handling failures, configuring and deploying a server.',
        '[Reference](/docs/cli-reference) lists every command, configuration key and HTTP endpoint.',
      ]),
      w.note(
        'Tip',
        'With ten minutes to spare, go straight to the [Quickstart](/docs/quickstart). It ends with a signed event arriving at a receiver on your own machine.',
      ),
    ],
  },
  {
    title: 'Installation',
    slug: 'installation',
    section: 'start',
    summary:
      'Install the command-line tool or run the container image, then check that a server can start.',
    body: (w) => [
      w.p(
        '%N% is published as one npm package that contains the server and the `%cli%` command. The same release is available as a container image.',
      ),
      w.h2('Requirements'),
      w.ref([
        ['Node.js', '20.11 or later', 'Check with `node --version`.'],
        ['SQLite', 'included', 'Used by `%cli% dev`. Nothing to install.'],
        ['PostgreSQL', '14 or later', 'Required by `%cli% start` in production.'],
      ]),
      w.h2('Install the command'),
      w.code('Terminal', '$ npm install --global %cli%\n$ %cli% --version\n%cli% 2.4.1'),
      w.p(
        'To pin the version for one project, add it as a development dependency and run it through npx:',
      ),
      w.code(
        'Terminal',
        '$ npm install --save-dev %cli%@2.4.1\n$ npx %cli% --version\n%cli% 2.4.1',
      ),
      w.note(
        'Note',
        'On Linux, install Node.js with a version manager such as nvm or fnm rather than running npm with sudo. A global package installed with sudo leaves files the next upgrade cannot replace.',
      ),
      w.h2('Run the container image'),
      w.p(
        'The image reads its settings from environment variables, so a first run needs no configuration file. It listens on port 8787.',
      ),
      w.code(
        'Terminal',
        '$ docker run --rm -p 8787:8787 \\\n    -e %ENV%_API_KEY=rk_dev_local \\\n    ghcr.io/example/%cli%:2.4.1\nListening on http://0.0.0.0:8787',
      ),
      w.h2('Check the installation'),
      w.p(
        '`%cli% doctor` checks the Node.js version, the configuration file, the database and the API key, and says what to fix.',
      ),
      w.code(
        'Terminal',
        '$ %cli% doctor\nNode.js 22.11.0                 ok\nConfiguration %cli%.yaml        ok\nDatabase sqlite:.%cli%/dev.db   ok\n%ENV%_API_KEY                   missing, run %cli% init to create one',
      ),
      w.h2('Upgrade'),
      w.p(
        'Install the new version over the old one, then run `%cli% migrate` before the server starts again. Each release lists its migrations in [What’s new](/docs/whats-new).',
      ),
      w.note(
        'Warning',
        'A migration marked as locking in the release notes needs every server stopped first. Servers of the previous version keep running during all the other migrations.',
      ),
    ],
  },
  {
    title: 'Quickstart',
    slug: 'quickstart',
    section: 'start',
    summary:
      'Run a local server, create an endpoint and send it a signed event, in about five minutes.',
    body: (w) => [
      w.p(
        'You need %N% installed (see [Installation](/docs/installation)) and two terminal windows. Everything below runs on your own machine.',
      ),
      w.h2('Create a project'),
      w.p(
        'In an empty directory, `%cli% init` writes a configuration file and a `.env` file holding a new API key.',
      ),
      w.code(
        'Terminal',
        '$ mkdir billing-webhooks && cd billing-webhooks\n$ %cli% init\nCreated %cli%.yaml\nCreated .env with %ENV%_API_KEY',
      ),
      w.h2('Start the development server'),
      w.p(
        '`%cli% dev` starts a server on port 8787 with a SQLite database in `.%cli%/dev.db`, and prints each delivery as it happens. Leave it running; `Ctrl+C` stops it.',
      ),
      w.code(
        'Terminal',
        '$ %cli% dev\nDatabase sqlite:.%cli%/dev.db, 14 migrations applied\nListening on http://localhost:8787',
      ),
      w.h2('Start a receiver'),
      w.p(
        'In the second terminal, `%cli% listen` starts a small receiver that prints every request it gets, headers included. It stands in for the endpoint one of your customers would run.',
      ),
      w.code('Terminal', '$ %cli% listen --port 4000\nReceiving on http://localhost:4000/webhooks'),
      w.h2('Create an endpoint'),
      w.p(
        'An endpoint is a URL and the event types it subscribes to. The wildcard `invoice.*` matches every type that starts with `invoice.`.',
      ),
      w.code(
        'Terminal',
        '$ %cli% endpoints create \\\n    --url http://localhost:4000/webhooks --events "invoice.*"\nEndpoint ep_01J8Z3HQ7N5V created\nSecret   whsec_4f9c2a7e1b0d6c3a',
      ),
      w.h2('Send an event'),
      w.code(
        'Terminal',
        '$ %cli% events send invoice.paid \\\n    --data \'{"invoice_id":"in_1042","amount":4900,"currency":"eur"}\'\nEvent evt_01J8Z3K6QF2M created, 1 delivery scheduled',
      ),
      w.p('Within a second, the receiver prints the request:'),
      w.code(
        'Receiver output',
        'POST /webhooks\nContent-Type: application/json\n%HDR%-Event-Id: evt_01J8Z3K6QF2M\n%HDR%-Event-Type: invoice.paid\n%HDR%-Delivery-Attempt: 1\n%HDR%-Signature: t=1757854800,v1=9b1c4e0f7a2d63b8c5e1f09a4d7b2c6e\n\n{"invoice_id":"in_1042","amount":4900,"currency":"eur"}',
      ),
      w.h2('Next steps'),
      w.ul([
        '[Verify the signature](/docs/verifying-signatures) in your receiving code before you trust a payload.',
        'Read [Core concepts](/docs/core-concepts) to see what happens when an endpoint fails.',
        'Send events from your application with the [HTTP API](/docs/http-api) instead of the command line.',
      ]),
    ],
  },
  {
    title: 'Core concepts',
    slug: 'core-concepts',
    section: 'start',
    summary:
      'Events, endpoints, deliveries and attempts, and how one event becomes several signed requests.',
    body: (w, media) => [
      w.p(
        'Four objects describe everything %N% does. Once they are clear, the command line and the HTTP API read as two ways of creating and inspecting the same things.',
      ),
      media.deliveryFlow === undefined
        ? []
        : [
            {
              _key: 'core-concepts-figure',
              _type: 'media',
              id: media.deliveryFlow,
              caption:
                'One event, three endpoints. Each delivery is signed and sent on its own, and a failed one is retried without holding up the others.',
            },
          ],
      w.h2('Events'),
      w.p(
        'An event records something that happened in your application, such as an invoice being paid. It has a type (`invoice.paid`), a JSON payload of up to 256 KB, and an id that starts with `evt_`. Events never change after they are created; to correct one, send a new event.',
      ),
      w.h2('Endpoints'),
      w.p(
        'An endpoint is a URL that receives events, the event types it subscribes to, and a secret that starts with `whsec_`. A type can end in a wildcard: `invoice.*` matches `invoice.paid` and `invoice.voided`.',
      ),
      w.h2('Deliveries and attempts'),
      w.p(
        'When an event arrives, %N% creates one delivery for each endpoint subscribed to its type. Every delivery is sent on its own, so a slow endpoint never delays the others.',
      ),
      w.p(
        'An attempt is one HTTP request for a delivery. A 2xx response within 10 seconds completes the delivery. Any other result, a redirect included, fails the attempt and schedules the next one.',
      ),
      w.h3('Delivery states'),
      w.ref([
        ['pending', null, 'Waiting for its first attempt, usually for less than a second.'],
        ['retrying', null, 'At least one attempt failed and another one is scheduled.'],
        ['succeeded', null, 'An attempt received a 2xx response. No further attempts are made.'],
        ['failed', null, 'All seven attempts failed. The delivery can still be retried by hand.'],
      ]),
      w.note(
        'Note',
        'An endpoint whose deliveries have failed for five days in a row is disabled. Run `%cli% endpoints enable` once the receiver works again; see [Retries and replay](/docs/retries-and-replay).',
      ),
    ],
  },
  {
    title: 'Verifying signatures',
    slug: 'verifying-signatures',
    section: 'guides',
    summary:
      'Check that a request came from your %N% server and was not modified in transit, before your code acts on it.',
    body: (w) => [
      w.p(
        'Every delivery carries a `%HDR%-Signature` header. Checking it proves two things: the request was signed with the endpoint’s secret, and its body has not changed since.',
      ),
      w.h2('How the signature is built'),
      w.p('The header holds a Unix timestamp and one or more signatures:'),
      w.code(
        '',
        '%HDR%-Signature: t=1757854800,v1=5f2b8c0e61d3a9b7e4f0c2d1a8b6e3f9c7d5a1b2e4f6a8c0d2e4f6a8b0c2d4e6',
      ),
      w.p(
        'Each `v1` value is the hex-encoded HMAC-SHA256 of the timestamp, a full stop and the raw request body, keyed with the endpoint secret. While a secret is being rotated, the header carries one `v1` value per secret.',
      ),
      w.h2('Verify in Node.js'),
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
  // Refuse old signatures: a captured request cannot be replayed later
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
      w.h3('In an Express route'),
      w.p(
        'Read the body as raw bytes on the webhook route only, so the signature is computed over exactly what was sent.',
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
  // Answer first, then do the work: an attempt times out after 10 s
  res.status(204).end()
  handleEvent(JSON.parse(body))
})`,
      ),
      w.note(
        'Warning',
        'Most frameworks parse JSON before your handler runs. Serialising the parsed object again changes whitespace and key order, and the signature stops matching. Always verify the raw body.',
      ),
      w.h2('Verify in Python'),
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
      w.h2('Rotate a secret'),
      w.p(
        'A rotation issues a new secret and keeps the previous one valid for a grace period, so receivers can switch without rejecting a single request.',
      ),
      w.code(
        'Terminal',
        '$ %cli% endpoints rotate-secret ep_01J8Z3HQ7N5V --grace 24h\nNew secret      whsec_7d31b0c9e25a4f18\nPrevious secret valid until 2026-09-15 09:12 UTC',
      ),
    ],
  },
  {
    title: 'Retries and replay',
    slug: 'retries-and-replay',
    section: 'guides',
    summary:
      'What happens when an endpoint fails, how to retry a delivery by hand, and how to send past events again.',
    body: (w) => [
      w.p(
        'Endpoints go down, deploys return errors and certificates expire. A failed attempt is the start of a schedule, and the delivery log shows every step of it.',
      ),
      w.h2('The retry schedule'),
      w.p(
        'A delivery gets up to seven attempts. After a failure the next attempt waits for the interval below, plus up to 10 percent of random jitter, so an endpoint coming back from an outage does not receive every retry at the same moment.',
      ),
      w.ref([
        ['30s', 'attempt 2', 'Covers a restart or a deploy in progress.'],
        ['2m', 'attempt 3', 'Covers a short network interruption.'],
        ['10m', 'attempt 4', 'Covers a failed deploy that gets rolled back.'],
        ['1h', 'attempt 5', 'Covers most incidents on the receiving side.'],
        ['6h', 'attempt 6', 'Covers an outage that lasts into the evening.'],
        ['24h', 'attempt 7', 'The last attempt, a little over 31 hours after the first.'],
      ]),
      w.p(
        'Change the intervals with `delivery.retries.schedule` in the [configuration file](/docs/configuration-reference). There is always one more attempt than there are intervals.',
      ),
      w.h2('Retry a delivery by hand'),
      w.p(
        'Once a receiver is fixed there is no need to wait for the next scheduled attempt. List the failed deliveries of the endpoint and retry the ones you need:',
      ),
      w.code(
        'Terminal',
        '$ %cli% deliveries list --endpoint ep_01J8Z3HQ7N5V --status failed\nID                 EVENT           ATTEMPTS  LAST RESULT\ndlv_01J8Z9AQ2C7R   invoice.paid    7         503\ndlv_01J8Z9B4TMW1   invoice.voided  7         timeout\n$ %cli% deliveries retry dlv_01J8Z9AQ2C7R\nAttempt 8 scheduled for dlv_01J8Z9AQ2C7R',
      ),
      w.p(
        'A manual retry adds an attempt to the same delivery. The receiver sees the same `%HDR%-Event-Id` as before and can recognise a request it has already processed.',
      ),
      w.h2('Replay past events'),
      w.p(
        'A replay creates new deliveries for events that already exist. Use it after adding an endpoint that should have received earlier events, or after a receiver lost data.',
      ),
      w.code(
        'Terminal',
        '$ %cli% events replay --since 2026-09-12T08:00:00Z \\\n    --types "invoice.*" --endpoint ep_01J8Z3HQ7N5V\n38 events matched, 38 deliveries scheduled',
      ),
      w.note(
        'Note',
        'A replay reaches only the events still inside the retention window, 30 days by default. A replayed event keeps its original id, so receivers should use `%HDR%-Event-Id` to skip events they have already handled.',
      ),
    ],
  },
  {
    title: 'Configuration',
    slug: 'configuration',
    section: 'guides',
    summary:
      'Where the server reads its settings, and which ones to review before a server goes to production.',
    body: (w) => [
      w.p(
        'The server reads `%cli%.yaml` from its working directory, then applies environment variables on top. A value set in the environment always wins, so one file serves development and production.',
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
      w.h2('Environment variables'),
      w.p(
        'Every key has an environment variable: write its path in capitals, replace the dots with underscores and add the `%ENV%_` prefix. `database.url` becomes `%ENV%_DATABASE_URL`.',
      ),
      w.ref([
        [
          '%ENV%_API_KEY',
          'required',
          'Authenticates calls to the HTTP API, including the ones the command line makes.',
        ],
        [
          '%ENV%_DATABASE_URL',
          'optional',
          'Overrides `database.url`. Use it for production credentials.',
        ],
        ['%ENV%_CONFIG', 'optional', 'Path of a configuration file other than `%cli%.yaml`.'],
      ]),
      w.note(
        'Warning',
        'Keep secrets out of `%cli%.yaml`. The file is meant to be committed with your code; the API key and the database password belong in the environment or in your platform’s secret store.',
      ),
      w.h2('Before a server goes to production'),
      w.ul([
        '`server.public_url`, so links in the delivery log point at the right host.',
        '`delivery.concurrency`, the number of requests one server sends at the same time. Raise it when deliveries start to wait.',
        '`retention.events`, when your customers expect replays reaching further back than 30 days.',
      ]),
      w.p(
        'The [configuration reference](/docs/configuration-reference) lists every key with its type and default value.',
      ),
    ],
  },
  {
    title: 'Deploying to production',
    slug: 'deploying-to-production',
    section: 'guides',
    summary:
      'Run %N% on PostgreSQL behind a reverse proxy, with health checks, and with more than one server.',
    body: (w) => [
      w.p(
        'A production server needs three things: a PostgreSQL database, an API key in the environment, and a supervisor that restarts the process if it exits.',
      ),
      w.h2('Prepare the database'),
      w.code(
        'Terminal',
        '# The password comes from PGPASSWORD or your platform’s secret store\n$ export %ENV%_DATABASE_URL=postgres://%cli%@db.internal:5432/%cli%\n$ %cli% migrate\nApplied 14 migrations in 1.8 s',
      ),
      w.p(
        'Run `%cli% migrate` once for each release, before the new version starts. A server refuses to start against a database with pending migrations.',
      ),
      w.h2('Run the server'),
      w.p('The image runs `%cli% start` by default. With Docker Compose:'),
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
      w.h2('Put a proxy in front'),
      w.p(
        'Terminate TLS at a reverse proxy or a load balancer and forward traffic to port 8787. Only the HTTP API needs inbound traffic; deliveries are outbound requests.',
      ),
      w.h2('Health checks'),
      w.p(
        '`GET /healthz` answers 200 when the database is reachable and its migrations are current, and 503 otherwise. Point both liveness and readiness probes at it.',
      ),
      w.h2('Run more than one server'),
      w.p(
        'Servers can share a database. Each one claims deliveries with a row lock (`FOR UPDATE SKIP LOCKED`), so two servers never send the same attempt. Add a server when `%cli% status` shows deliveries waiting for more than a few seconds.',
      ),
      w.note(
        'Tip',
        'Stop a server with SIGTERM. It finishes the attempts already in flight, for up to the delivery timeout, before it exits.',
      ),
    ],
  },
  {
    title: 'CLI reference',
    slug: 'cli-reference',
    section: 'reference',
    summary:
      'Every command and global flag of the %N% command line, and what each exit code means.',
    body: (w) => [
      w.p(
        'Every command reads `%cli%.yaml` and the `%ENV%_` environment variables described in [Configuration](/docs/configuration). `%cli% help COMMAND` prints the flags of one command.',
      ),
      w.h2('Project and server'),
      w.ref([
        [
          '%cli% init',
          null,
          'Writes `%cli%.yaml` and a `.env` file with a new API key in the current directory.',
        ],
        ['%cli% dev', null, 'Starts a development server on SQLite and prints each delivery.'],
        [
          '%cli% start',
          null,
          'Starts a production server. `database.url` must point at PostgreSQL.',
        ],
        ['%cli% migrate', null, 'Applies pending database migrations, then exits.'],
        [
          '%cli% status',
          null,
          'Shows running servers, queued deliveries and the oldest waiting delivery.',
        ],
        ['%cli% doctor', null, 'Checks Node.js, the configuration, the database and the API key.'],
      ]),
      w.h2('Endpoints'),
      w.ref([
        [
          '%cli% endpoints create',
          null,
          'Creates an endpoint from `--url` and `--events`, and prints its secret once.',
        ],
        [
          '%cli% endpoints list',
          null,
          'Lists endpoints with their state and their failure rate over 24 hours.',
        ],
        [
          '%cli% endpoints disable ID',
          null,
          'Stops deliveries to an endpoint. New deliveries wait until it is enabled.',
        ],
        ['%cli% endpoints enable ID', null, 'Resumes deliveries to an endpoint.'],
        [
          '%cli% endpoints rotate-secret ID',
          null,
          'Issues a new secret. `--grace` keeps the previous one valid, 24 hours by default.',
        ],
      ]),
      w.h2('Events and deliveries'),
      w.ref([
        [
          '%cli% events send TYPE',
          null,
          'Sends an event. The payload comes from `--data` or from standard input.',
        ],
        [
          '%cli% events replay',
          null,
          'Creates new deliveries for past events, filtered by `--since`, `--types` and `--endpoint`.',
        ],
        [
          '%cli% deliveries list',
          null,
          'Lists deliveries, filtered by `--endpoint` and `--status`.',
        ],
        [
          '%cli% deliveries retry ID',
          null,
          'Schedules an extra attempt for a delivery, right away.',
        ],
        [
          '%cli% listen',
          null,
          'Starts a local receiver that prints every request. For development only.',
        ],
      ]),
      w.h2('Global flags'),
      w.ref([
        ['--config PATH', 'string', 'Reads another configuration file.'],
        [
          '--api-url URL',
          'string, default http://localhost:8787',
          'The server a command talks to.',
        ],
        ['--json', 'boolean', 'Prints one JSON object per line instead of a table.'],
        ['--quiet', 'boolean', 'Prints errors only.'],
      ]),
      w.h2('Exit codes'),
      w.ref([
        ['0', null, 'The command succeeded.'],
        ['1', null, 'The command failed. The reason is printed on standard error.'],
        ['2', null, 'An argument or the configuration is invalid.'],
        ['3', null, 'The server could not be reached.'],
      ]),
    ],
  },
  {
    title: 'Configuration reference',
    slug: 'configuration-reference',
    section: 'reference',
    summary: 'Every key the configuration file accepts, with its type and default value.',
    body: (w) => [
      w.p(
        'Durations accept the suffixes `ms`, `s`, `m`, `h` and `d`. Every key can also be set as an environment variable, as described in [Configuration](/docs/configuration).',
      ),
      w.h2('server'),
      w.ref([
        ['server.port', 'integer, default 8787', 'Port the HTTP API listens on.'],
        ['server.host', 'string, default 0.0.0.0', 'Network interface to bind.'],
        ['server.public_url', 'string', 'Address used in links in the delivery log.'],
      ]),
      w.h2('database'),
      w.ref([
        [
          'database.url',
          'string, required',
          'A `sqlite:` path or a `postgres://` connection string.',
        ],
        ['database.pool_size', 'integer, default 10', 'Connections one server keeps open.'],
      ]),
      w.h2('delivery'),
      w.ref([
        [
          'delivery.timeout',
          'duration, default 10s',
          'How long an endpoint has to answer an attempt.',
        ],
        [
          'delivery.concurrency',
          'integer, default 32',
          'Requests one server sends at the same time.',
        ],
        [
          'delivery.retries.schedule',
          'list of durations',
          'Waits between attempts. The default is `[30s, 2m, 10m, 1h, 6h, 24h]`.',
        ],
        ['delivery.retries.jitter', 'number, default 0.1', 'Share of each wait added at random.'],
        [
          'delivery.disable_after',
          'duration, default 5d',
          'Disables an endpoint that has failed for this long.',
        ],
      ]),
      w.h2('signing'),
      w.ref([
        [
          'signing.tolerance',
          'duration, default 5m',
          'Age after which the official libraries reject a signature.',
        ],
        ['signing.header', 'string, default %HDR%-Signature', 'Name of the signature header.'],
      ]),
      w.h2('retention'),
      w.ref([
        [
          'retention.events',
          'duration, default 30d',
          'How long events, deliveries and attempts are kept.',
        ],
        [
          'retention.response_body',
          'size, default 1KB',
          'How much of each response body is stored.',
        ],
      ]),
    ],
  },
  {
    title: 'HTTP API',
    slug: 'http-api',
    section: 'reference',
    summary:
      'Send events and inspect deliveries over HTTP, with example requests, responses and errors.',
    body: (w) => [
      w.p(
        'Every %N% server serves the API under `/v1`. Requests and responses are JSON, and every request except the health check authenticates with the API key as a bearer token.',
      ),
      w.code(
        'Terminal',
        '$ curl http://localhost:8787/v1/endpoints \\\n    -H "Authorization: Bearer $%ENV%_API_KEY"',
      ),
      w.h2('Resources'),
      w.ref([
        ['POST /v1/events', null, 'Sends an event and schedules its deliveries.'],
        ['GET /v1/events/{id}', null, 'Returns an event and the state of each of its deliveries.'],
        ['POST /v1/endpoints', null, 'Creates an endpoint.'],
        ['GET /v1/endpoints', null, 'Lists endpoints.'],
        [
          'PATCH /v1/endpoints/{id}',
          null,
          'Changes the URL, the event types or the state of an endpoint.',
        ],
        [
          'GET /v1/deliveries',
          null,
          'Lists deliveries, filtered by `status`, `endpoint` or `event`.',
        ],
        [
          'GET /v1/deliveries/{id}/attempts',
          null,
          'Lists the attempts of a delivery, newest first.',
        ],
        ['POST /v1/deliveries/{id}/retry', null, 'Schedules an extra attempt.'],
        ['GET /healthz', null, 'Reports whether the server is ready. Needs no API key.'],
      ]),
      w.h2('Send an event'),
      w.p(
        '`idempotency_key` is optional. A second request with the same key within 24 hours returns the first event instead of creating a new one.',
      ),
      w.code(
        'Request',
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
        'Response: 202 Accepted',
        `{
  "id": "evt_01J8Z3K6QF2M",
  "type": "invoice.paid",
  "created_at": "2026-09-14T09:12:04Z",
  "deliveries": 3
}`,
      ),
      w.h2('List failed deliveries'),
      w.code(
        'Request',
        'GET /v1/deliveries?status=failed&limit=2 HTTP/1.1\nHost: localhost:8787\nAuthorization: Bearer rk_live_2Jx8Qd4mT7',
      ),
      w.code(
        'Response: 200 OK',
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
      w.h2('Errors'),
      w.p(
        'An error has a standard status code and a body with a stable `code` and a readable `message`.',
      ),
      w.code(
        'Response: 409 Conflict',
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
          'The body is not valid JSON, or a required field is missing.',
        ],
        ['401 unauthorized', null, 'The API key is missing or has been revoked.'],
        ['404 not_found', null, 'No object with this id exists.'],
        [
          '409 idempotency_conflict',
          null,
          'The idempotency key was used with a different body in the last 24 hours.',
        ],
        ['413 payload_too_large', null, 'The event payload is larger than 256 KB.'],
        [
          '429 rate_limited',
          null,
          'Too many requests. Wait for the number of seconds in the `Retry-After` header.',
        ],
      ]),
    ],
  },
  {
    title: 'Troubleshooting',
    slug: 'troubleshooting',
    section: 'help',
    summary: 'The problems that come up most often, what causes each one and how to fix it.',
    body: (w) => [
      w.p(
        'Start with `%cli% doctor`, which catches most configuration problems. The sections below cover what it cannot see from the server.',
      ),
      w.h2('Signatures never match'),
      w.p(
        'The receiver is almost always verifying a body that was parsed and serialised again. Verify the raw bytes, as shown in [Verifying signatures](/docs/verifying-signatures). If the body is raw and signatures still fail, check that the secret belongs to this endpoint: every endpoint has its own.',
      ),
      w.h2('Timestamp outside the tolerance'),
      w.p(
        'The receiver’s clock is more than five minutes away from the server’s. Turn on NTP on that host, or raise `signing.tolerance` while it gets fixed.',
      ),
      w.h2('Deliveries stay pending'),
      w.p(
        'No server is claiming deliveries. `%cli% migrate` exits once it has run, so check that a process runs `%cli% start`, then look at `%cli% status`:',
      ),
      w.code(
        'Terminal',
        '$ %cli% status\nServers         2 running\nQueued          1,284 deliveries\nOldest waiting  3 min 12 s\nAttempts        2,410 per minute',
      ),
      w.p(
        'A queue that keeps growing while servers run means `delivery.concurrency` is too low for your traffic, or one endpoint is slow enough to hold every request slot. Raise the concurrency or add a server.',
      ),
      w.h2('Every attempt fails with a redirect'),
      w.p(
        '%N% does not follow redirects: a signed request sent on to another host would hand its payload to a server nobody chose. Update the endpoint to its final URL, which is usually the `https://` form of the address.',
      ),
      w.h2('Connection refused from a container'),
      w.p(
        'Inside a container, `localhost` is the container itself. Use `host.docker.internal` with Docker Desktop, or the service name on a Compose network.',
      ),
      w.h2('An endpoint was disabled'),
      w.p(
        'An endpoint is disabled after five days of failed deliveries. Fix the receiver, run `%cli% endpoints enable ID`, then send what it missed with `%cli% events replay --endpoint ID --since` and the time the failures started.',
      ),
    ],
  },
  {
    title: 'What’s new',
    slug: 'whats-new',
    section: 'help',
    summary: 'The changes in each release of %N%, newest first, with what to do when upgrading.',
    body: (w) => [
      w.p(
        '%N% follows semantic versioning. A minor release never changes the configuration format or the HTTP API in a way that breaks an existing integration.',
      ),
      w.h2('2.4, September 2, 2026'),
      w.ul([
        'Endpoint event types accept a trailing wildcard, such as `invoice.*`.',
        '`%cli% events replay` accepts `--since` and `--types`, so a replay no longer needs a list of event ids.',
        'The `%HDR%-Delivery-Attempt` header tells a receiver which attempt it is handling.',
        '`delivery.retries.jitter` spreads retries after an outage. The default is 10 percent.',
      ]),
      w.h3('Upgrading from 2.3'),
      w.p(
        'Run `%cli% migrate` before starting 2.4. The migration adds an index to the deliveries table and takes under a minute on ten million rows.',
      ),
      w.h2('2.3, July 15, 2026'),
      w.ul([
        '`%cli% dev` runs on SQLite, so a local server no longer needs PostgreSQL.',
        'New `%cli% doctor` command.',
        '`retention.response_body` sets how much of each response is stored.',
      ]),
      w.h3('Upgrading from 2.2'),
      w.p(
        'Nothing to change in the configuration file. Development projects that pointed `database.url` at a local PostgreSQL can switch to SQLite by removing the key, since `%cli% dev` now creates its own database.',
      ),
      w.h2('2.2, May 20, 2026'),
      w.ul([
        'Idempotency keys on `POST /v1/events`.',
        'Endpoints are disabled after five days of failures instead of seven. Set `delivery.disable_after` to keep the previous behaviour.',
      ]),
    ],
  },
]

const FOOTER: DocumentationCopy['footer'] = [
  {
    heading: 'Get started',
    links: [
      { label: 'Introduction', url: '/docs/introduction' },
      { label: 'Installation', url: '/docs/installation' },
      { label: 'Quickstart', url: '/docs/quickstart' },
    ],
  },
  {
    heading: 'Guides',
    links: [
      { label: 'Verifying signatures', url: '/docs/verifying-signatures' },
      { label: 'Retries and replay', url: '/docs/retries-and-replay' },
      { label: 'Deploying to production', url: '/docs/deploying-to-production' },
    ],
  },
  {
    heading: 'Reference',
    links: [
      { label: 'CLI', url: '/docs/cli-reference' },
      { label: 'Configuration', url: '/docs/configuration-reference' },
      { label: 'HTTP API', url: '/docs/http-api' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { label: 'Troubleshooting', url: '/docs/troubleshooting' },
      { label: 'What’s new', url: '/docs/whats-new' },
    ],
  },
]

export const DOCUMENTATION_COPY_EN: DocumentationCopy = {
  locale: 'en',
  sections: { start: 'Getting started', guides: 'Guides', reference: 'Reference', help: 'Help' },
  pages: PAGES,
  changelogSlug: 'whats-new',
  typography: (value) => value,
  home: {
    slug: 'home',
    title: (name) => `${name} documentation`,
    blocks: (names, w) => {
      const { name } = names
      return [
        {
          _key: 'home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: `${name} 2.4`,
          title: `${name} documentation`,
          subtitle:
            'Send signed webhooks from your application, retry failed deliveries on a schedule, and replay events from the last 30 days. Start with the quickstart, or search the guides and the reference.',
          actions: [
            { label: 'Quickstart', target: { href: '/docs/quickstart' }, emphasis: 'primary' },
            { label: 'HTTP API reference', target: { href: '/docs/http-api' } },
          ],
        },
        {
          _key: 'home-start',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'Start here',
          items: [
            {
              _key: 'home-start-install',
              title: 'Install the command',
              text: 'Node.js 20.11 or later, or the container image.',
              link: { href: '/docs/installation' },
            },
            {
              _key: 'home-start-quickstart',
              title: 'Send your first event',
              text: 'A local server, an endpoint and a signed request, in about five minutes.',
              link: { href: '/docs/quickstart' },
            },
            {
              _key: 'home-start-concepts',
              title: 'Learn the concepts',
              text: 'Events, endpoints, deliveries and attempts, and what happens on a failure.',
              link: { href: '/docs/core-concepts' },
            },
          ],
        },
        {
          _key: 'home-browse',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'Browse the documentation',
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
            w.h2('Send an event from your application'),
            w.p(
              'Once a server runs, your application sends events over HTTP. Every endpoint subscribed to the event type receives its own signed copy.',
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

// 202 Accepted: the event is stored and its deliveries are scheduled
const { id, deliveries } = await response.json()`,
            ),
            w.p(
              'The [HTTP API reference](/docs/http-api) lists every resource, with example responses and errors.',
            ),
          ],
        },
        {
          _key: 'home-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Common questions',
          items: [
            {
              _key: 'home-faq-databases',
              question: `Which databases does ${name} support?`,
              answer: [
                w.p(
                  'SQLite for local development with `%cli% dev`, and PostgreSQL 14 or later for `%cli% start` in production.',
                ),
              ],
            },
            {
              _key: 'home-faq-licence',
              question: `Is ${name} open source?`,
              answer: [
                w.p(
                  'Yes. The server, the command line and the signature libraries are released under the Apache License 2.0.',
                ),
              ],
            },
            {
              _key: 'home-faq-retention',
              question: 'How long are events kept?',
              answer: [
                w.p(
                  '30 days by default, with every attempt and the first kilobyte of each response. Change it with `retention.events`.',
                ),
              ],
            },
            {
              _key: 'home-faq-outage',
              question: 'What happens when an endpoint is down for a day?',
              answer: [
                w.p(
                  'Its deliveries are retried for a little over 31 hours. After that, [retry them by hand or replay them](/docs/retries-and-replay) once the endpoint is back.',
                ),
              ],
            },
          ],
        },
        {
          _key: 'home-help',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Stuck on something',
          text: 'Most delivery problems come down to a signature, a clock, or an endpoint that answers with a redirect.',
          actions: [
            { label: 'Troubleshooting', target: { href: '/docs/troubleshooting' } },
            { label: 'What’s new in 2.4', target: { href: '/docs/whats-new' } },
          ],
        },
      ]
    },
  },
  diagram: {
    file: 'documentation/delivery-flow-en.png',
    alt: 'Diagram: your application sends an event to the delivery server, which stores it, signs a copy for each endpoint and sends three requests; two endpoints answer 200 and one answers 503 and is retried in two minutes.',
  },
  menus: {
    header: [
      { label: 'Get started', url: '/docs/quickstart' },
      { label: 'Guides', url: '/docs/verifying-signatures' },
      { label: 'Reference', url: '/docs/cli-reference' },
      { label: 'Changelog', url: '/docs/whats-new' },
    ],
  },
  footer: FOOTER,
  settings: {
    'general.tagline': 'Signed webhook delivery for your application, with retries and replay.',
    'general.socialLinks': [
      { label: 'GitHub', url: 'https://github.com/example' },
      { label: 'Bluesky', url: 'https://bsky.app/profile/example.com' },
      { label: 'X', url: 'https://x.com/example' },
    ],
    'general.footerNote':
      'Released under the Apache License 2.0.\nDocumentation text under CC BY 4.0.',
    // Documentation pages are not discussions.
    'discussion.enabled': false,
  },
  widgets: (slugs) => [
    {
      area: 'sidebar',
      type: 'links',
      title: 'Need help?',
      settings: {
        items: [
          { label: 'Troubleshooting', href: '/docs/troubleshooting' },
          { label: 'Configuration reference', href: '/docs/configuration-reference' },
          { label: 'Report a problem on GitHub', href: 'https://github.com/example', newTab: true },
        ],
      },
      visibility: DOC_PAGES_ONLY,
    },
    {
      area: 'sidebar',
      type: 'cta',
      settings: {
        heading: 'Upgrading from 2.3?',
        body: 'Run the migration before starting 2.4. It adds one index and takes under a minute on ten million deliveries.',
        label: 'Read the release notes',
        href: '/docs/whats-new',
      },
      visibility: {
        pages: {
          mode: 'only',
          targets: slugs
            .filter((slug) => slug !== 'whats-new')
            .map((slug) => ({ kind: 'path', path: `/docs/${slug}` })),
        },
      },
    },
    {
      area: 'sidebar',
      type: 'links',
      title: 'Popular pages',
      settings: {
        items: [
          { label: 'Quickstart', href: '/docs/quickstart' },
          { label: 'Verifying signatures', href: '/docs/verifying-signatures' },
          { label: 'Retries and replay', href: '/docs/retries-and-replay' },
          { label: 'HTTP API', href: '/docs/http-api' },
          { label: 'CLI reference', href: '/docs/cli-reference' },
        ],
      },
      visibility: { pages: { mode: 'only', targets: [{ kind: 'search' }] } },
    },
  ],
}
