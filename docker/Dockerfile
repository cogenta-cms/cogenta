# syntax=docker/dockerfile:1.7
#
# The official Cogenta image: ghcr.io/cogenta-cms/cogenta
#
# Built from THIS checkout, not from npm, so any commit can be turned into an
# image before its packages are published. The packages are packed exactly as
# `pnpm publish` would, then installed with npm into /opt/cogenta — the same
# tree a user gets from the registry, minus the registry.
#
#   docker build -f docker/Dockerfile -t cogenta .
#   docker buildx build --platform linux/amd64,linux/arm64 -f docker/Dockerfile .
#
# Contract (the Helm chart relies on it):
#   user         10001:10001, never root
#   filesystem   works with readOnlyRootFilesystem: writes only /data and /tmp
#   code         /opt/cogenta (immutable, in the image)
#   site         /data/site (the volume): config, schema, tokens, .cogenta/ state
#   entrypoint   cogenta-entrypoint [bootstrap|serve|up|migrate|cli ...]
#   port         4000, probes /livez and /readyz

ARG NODE_IMAGE=node:22-bookworm-slim

# --- 1. build the workspace, once, on the builder's own architecture ---------------
# The output is JavaScript and does not depend on the target CPU, so a
# multi-arch build compiles it a single time instead of once under emulation.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build

ENV CI=true \
    TURBO_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /src

COPY . .
# The store is a BuildKit cache mount, so a source change re-links packages
# instead of downloading them again. --ignore-scripts: the only lifecycle script
# that matters here is the git-hook installer, and there is no git in the image.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

# create-cogenta depends on the CLI, which depends on every theme, the starters
# and the admin: building "create-cogenta and what it needs" builds all of it.
RUN pnpm exec turbo run build --filter='create-cogenta...' --concurrency=2
RUN node docker/pack-workspace.mjs /tarballs /opt/cogenta

# --- 2. install the packed packages for the target architecture -----------------------
# npm, not pnpm: this is what a user's install does, and sharp's prebuilt binary
# is chosen here, for the architecture the image will actually run on.
FROM ${NODE_IMAGE} AS install
WORKDIR /opt/cogenta
COPY --from=build /tarballs /tarballs
COPY --from=build /opt/cogenta/package.json ./package.json
# Peer dependencies are not installed (--legacy-peer-deps): the themes name
# `astro` as a peer for a build pipeline this runtime does not use, and it
# weighs hundreds of megabytes.
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    npm install --omit=dev --legacy-peer-deps --no-audit --no-fund --no-update-notifier \
 && rm -rf /tarballs
COPY docker/bootstrap.mjs ./bootstrap.mjs
# A missing peer shows up as ERR_MODULE_NOT_FOUND the first time a request
# needs it. Loading the entry points and the optional native path here turns
# that into a failed build.
RUN node --input-type=module -e "await import('create-cogenta'); await import('@cogenta/cli'); await import('sharp'); await import('postgres'); await import('mysql2')"

# --- 3. the runtime image ---------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime

ARG VERSION=0.0.0
ARG REVISION=unknown
ARG CREATED=unknown

LABEL org.opencontainers.image.title="Cogenta" \
      org.opencontainers.image.description="Cogenta, an agentic CMS for Node.js: the server, the admin and every theme, configured by environment variables." \
      org.opencontainers.image.source="https://github.com/cogenta-cms/cogenta" \
      org.opencontainers.image.url="https://github.com/cogenta-cms/cogenta" \
      org.opencontainers.image.documentation="https://github.com/cogenta-cms/cogenta/blob/main/docker/README.md" \
      org.opencontainers.image.licenses="MPL-2.0" \
      org.opencontainers.image.vendor="Cogenta" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"

# tini as PID 1: it forwards SIGTERM to the server and reaps the child processes
# plugins run in. npm, npx and corepack are removed: nothing in a running site
# installs packages (an upgrade is a new image), and their bundled dependencies
# are the part of a Node image a vulnerability scanner reports most.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && groupadd --gid 10001 cogenta \
 && useradd --uid 10001 --gid 10001 --home-dir /data --shell /usr/sbin/nologin --no-create-home cogenta \
 && mkdir -p /data/site \
 && chown -R 10001:10001 /data

COPY --from=install /opt/cogenta /opt/cogenta
COPY docker/entrypoint.sh /usr/local/bin/cogenta-entrypoint
RUN chmod 0755 /usr/local/bin/cogenta-entrypoint

ENV NODE_ENV=production \
    HOME=/tmp \
    PORT=4000 \
    COGENTA_SITE_DIR=/data/site

USER 10001:10001
WORKDIR /data/site
VOLUME ["/data"]
EXPOSE 4000

# /readyz answers 200 only while the database does; see packages/cli/src/commands/probes.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/readyz').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--", "cogenta-entrypoint"]
CMD ["serve"]
