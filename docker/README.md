# Cogenta container image

`ghcr.io/cogenta-cms/cogenta` runs a production Cogenta site from environment
variables alone. The code is in the image (`/opt/cogenta`, immutable); the site —
its config, schema, theme tokens and local state — lives on one volume
(`/data/site`). Upgrading means running a newer image on the same volume.

```sh
docker build -f docker/Dockerfile -t cogenta .          # from a checkout, any commit
```

## Quick start

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:17
    environment: { POSTGRES_PASSWORD: "${DB_PASSWORD}", POSTGRES_DB: cogenta }
    volumes: [dbdata:/var/lib/postgresql/data]
  cogenta:
    image: ghcr.io/cogenta-cms/cogenta:latest
    command: ["up"]                       # bootstrap, then serve
    ports: ["4000:4000"]
    depends_on: [db]
    read_only: true
    tmpfs: [/tmp]
    user: "10001:10001"
    volumes: [site:/data]
    environment:
      COGENTA_DATABASE_URL: ${COGENTA_DATABASE_URL}                # a postgres:// URL for the db service
      COGENTA_AUTH_SIGNING_KEY: ${COGENTA_AUTH_SIGNING_KEY}        # openssl rand -base64 32
      COGENTA_PREVIEW_SIGNING_KEY: ${COGENTA_PREVIEW_SIGNING_KEY}  # openssl rand -base64 32
      COGENTA_SITE_URL: https://example.com
      COGENTA_SITE_NAME: My site
      COGENTA_SITE_LOCALES: fr,en
      COGENTA_BLUEPRINT: blog
      COGENTA_ADMIN_EMAIL: you@example.com
      COGENTA_ADMIN_PASSWORD: ${COGENTA_ADMIN_PASSWORD}
volumes: { dbdata: {}, site: {} }
```

Then `http://localhost:4000/` is the site and `/admin` the admin. On Kubernetes run
`bootstrap` once (an init container or a Job) and `serve` in the Deployment.

## Commands

`cogenta-entrypoint <command>` (the image's entrypoint; `serve` is the default):

| Command | What it does |
|---|---|
| `bootstrap` | Idempotent. No site on the volume: scaffold it from the environment (the installer's own code, no `npm install`), migrate, seed the blueprint, create the first admin. Site present: run the pending migrations. Holds an exclusive lock on the volume, so two at once are safe. Exits non-zero, with the reason, when it cannot finish. |
| `serve` | Links `/data/site/node_modules` to the image, starts `cogenta serve --host 0.0.0.0 --port $PORT`. Refuses to start with no site on the volume. SIGTERM closes the listener and the database, then exits 0. |
| `up` | `bootstrap`, then `serve`. For one container. |
| `migrate` | `cogenta migrate up`. |
| `cli <args>` | Any other `cogenta` command, run in the site directory (`cli users create --email … --admin`, `cli doctor`). |

## Environment

Required: `COGENTA_AUTH_SIGNING_KEY` and `COGENTA_PREVIEW_SIGNING_KEY` (32+ characters;
the entrypoint refuses to start without them), and `COGENTA_DATABASE_URL` for any
database but the default SQLite file on the volume.

| Variable | Purpose |
|---|---|
| `COGENTA_DATABASE_DRIVER`, `COGENTA_DATABASE_URL` | `sqlite` (default, `/data/site/.cogenta/site.db`), `postgres` or `mysql`; the driver is inferred from the URL scheme |
| `COGENTA_SITE_URL`, `COGENTA_SITE_NAME` | Public address (canonical links, sitemap) and name |
| `COGENTA_SITE_LOCALES`, `COGENTA_SITE_DEFAULT_LOCALE` | `fr,en`; the default is the first |
| `COGENTA_BLUEPRINT` | First boot only: `vitrine` (default), `blog`, `magazine`, `portfolio`, `documentation`, `association`, `restaurant`, `saas`, `store`, `blank` |
| `COGENTA_ADMIN_EMAIL`, `COGENTA_ADMIN_PASSWORD` | First boot only; both required, since without an account there is no way into `/admin` |
| `COGENTA_STORAGE_DRIVER=s3`, `_BUCKET`, `_REGION`, `_ENDPOINT`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | Media in S3 or MinIO; the demo media are seeded there too |
| `COGENTA_STORAGE_SIGNING_KEY` | Keeps signed media URLs valid across restarts and replicas |
| `COGENTA_CACHE_*`, `COGENTA_RATE_LIMIT_*`, `REDIS_URL` | Redis for the shared cache and rate limits |
| `COGENTA_LLM_PROVIDER`, `_MODEL`, `COGENTA_LLM_API_KEY` | Optional; the CMS works without AI |
| `COGENTA_TRUST_PROXY`, `COGENTA_TRUST_PROXY_FROM` | See below |
| `PORT` | Listening port (4000) |
| `COGENTA_BOOTSTRAP_WAIT_SECONDS` | How long `bootstrap` waits for the database to answer (60) |

Any `COGENTA_*` variable can be given as `COGENTA_*_FILE=/path` instead (Docker and
Kubernetes secrets); setting both is an error.

**No secret is written to the volume.** The config file `bootstrap` writes carries the
site name, locales and local paths — never the database URL, the keys or the admin
password — and no `.env` is created. The runtime reads them from the environment,
which overrides the file.

## Behind a reverse proxy

Every request reaches the pod from the ingress, so by default per-address limits
(login back-off, comments, forms) become one global limit. Set `COGENTA_TRUST_PROXY`:

- `cloudflare` (or any header name, e.g. `x-real-ip`): the client address is that
  header's value. Use it only if the proxy overwrites the header.
- `1`, `2`, …: the number of proxies you run; the client address is that many
  entries from the **right** of `x-forwarded-for` (the end a visitor cannot write).
  Behind Cloudflare and an ingress, use `2`.

An address that is missing, malformed or beyond the chain falls back to the socket's.
`x-forwarded-proto` decides whether a request is HTTPS (HSTS, `Secure` cookies).

Set `COGENTA_TRUST_PROXY_FROM` to the addresses or CIDR blocks the proxies connect from,
comma separated, IPv4 or IPv6 (`10.0.0.0/8,fd00::/8`). The header is then honoured only
when the connection comes from one of them; a caller that reaches the pod directly is
attributed to its own address. Without it the header is believed from any socket, the
server logs a warning at start-up saying so, and the pod must be reachable only through
the proxy (a NetworkPolicy, a private network) or a caller can pick its own address.

## Probes

Anonymous, a bare word, `cache-control: no-store`, never rate limited or traced:

- `GET /livez`: the process is up (no I/O). Use it as the liveness probe.
- `GET /readyz`: the database answers `select 1` within 3 s; `503` otherwise and once
  shutdown has begun. Use it as the readiness probe. The image's `HEALTHCHECK` uses it.

The two paths are reserved: a page with the slug `livez` or `readyz` is unreachable.

## Filesystem

Runs as `10001:10001` with `readOnlyRootFilesystem: true`. The only writable paths are
`/data` (the volume, owned by 10001; set `fsGroup: 10001` on Kubernetes) and `/tmp`.
`npm` is not in the image: an update is a new image, not `cogenta update`.

## Good to know

- Replicas share the site directory: use a `ReadWriteMany` volume, or run `bootstrap`
  once and give each replica a copy. A new, empty volume pointed at a database that
  already holds a site would try to create the admin a second time and fail.
- If the first boot fails after the admin account was created, drop the database and
  the volume and start again; a failure before that leaves nothing behind.
- Verify an image before running it:

  ```sh
  cosign verify ghcr.io/cogenta-cms/cogenta:<version> \
    --certificate-identity-regexp '^https://github\.com/cogenta-cms/cogenta/\.github/workflows/docker\.yml@refs/tags/v.+$' \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com
  ```

  The identity is limited to the workflow running on a `v*` tag, so an image signed
  from a branch (a manual run on a fork or a feature branch) does not verify. Pin the
  digest the command prints (`image@sha256:...`) in your manifests rather than a tag.
- The workflow (`.github/workflows/docker.yml`) pushes multi-arch (amd64, arm64) to
  GHCR with provenance and an SBOM after a Trivy scan, and signs the digest. A Docker
  Hub mirror is written but commented out; its two secrets are `DOCKERHUB_USERNAME` and
  `DOCKERHUB_TOKEN`.
