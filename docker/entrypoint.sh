#!/bin/sh
# cogenta-entrypoint — the one command the Cogenta image runs.
#
#   bootstrap   make /data/site ready (first boot or migrations), then exit
#   serve       start the server (the default)
#   up          bootstrap, then serve — one container, one replica
#   migrate     run the pending migrations
#   cli <args>  any other `cogenta` command, in the site directory
#
# Everything is configured by environment variables; see docker/README.md.
# POSIX sh on purpose: the image has no bash.
set -eu

SITE_DIR="${COGENTA_SITE_DIR:-/data/site}"
RUNTIME_DIR="${COGENTA_RUNTIME_DIR:-/opt/cogenta}"
export COGENTA_SITE_DIR="$SITE_DIR"

say() { printf 'cogenta-entrypoint: %s\n' "$*" >&2; }
die() { say "$*"; exit 78; }

# --- *_FILE variables -----------------------------------------------------------
# Docker and Kubernetes mount secrets as files. COGENTA_AUTH_SIGNING_KEY_FILE=
# /run/secrets/auth is read into COGENTA_AUTH_SIGNING_KEY, so a secret never
# has to appear in `docker inspect` or in a manifest. Setting both is an error:
# which one wins should not be a guess.
for name in $(env | sed -n 's/^\(COGENTA_[A-Z0-9_]*\)_FILE=.*/\1/p'); do
  file_var="${name}_FILE"
  eval "file=\${$file_var}"
  eval "current=\${$name:-}"
  [ -n "$file" ] || continue
  [ -z "$current" ] || die "both $name and $file_var are set; set only one."
  [ -r "$file" ] || die "$file_var points at $file, which cannot be read."
  value=$(cat "$file")
  export "$name=$value"
  unset "$file_var"
done

# --- the site directory ---------------------------------------------------------
# node_modules next to the site is a symlink into the image, recreated at every
# start: an upgraded image upgrades the code, the volume keeps only the site.
link_runtime() {
  mkdir -p "$SITE_DIR" || die "cannot create $SITE_DIR. Mount a writable volume on /data."
  ln -sfn "$RUNTIME_DIR/node_modules" "$SITE_DIR/node_modules" \
    || die "cannot write in $SITE_DIR. The volume must be writable by uid $(id -u)."
}

# --- the two keys the server cannot start without ---------------------------------
require_keys() {
  [ -n "${COGENTA_AUTH_SIGNING_KEY:-}" ] \
    || die "COGENTA_AUTH_SIGNING_KEY is not set. It signs sessions; generate one with: openssl rand -base64 32"
  [ -n "${COGENTA_PREVIEW_SIGNING_KEY:-}" ] \
    || die "COGENTA_PREVIEW_SIGNING_KEY is not set. It signs draft-preview links; generate one with: openssl rand -base64 32"
  [ "${#COGENTA_PREVIEW_SIGNING_KEY}" -ge 32 ] \
    || die "COGENTA_PREVIEW_SIGNING_KEY must hold at least 32 characters (openssl rand -base64 32 gives 44)."
  if [ "${COGENTA_DATABASE_DRIVER:-sqlite}" != "sqlite" ] && [ -z "${COGENTA_DATABASE_URL:-}${DATABASE_URL:-}" ]; then
    die "COGENTA_DATABASE_DRIVER is ${COGENTA_DATABASE_DRIVER} but COGENTA_DATABASE_URL is not set."
  fi
}

cogenta() {
  # SQLite is a stable module in Node 22 for this use but still prints an
  # "experimental" notice; the CLI's own entry point filters that one warning.
  exec node "$RUNTIME_DIR/node_modules/@cogenta/cli/dist/bin.js" "$@"
}

bootstrap() {
  require_keys
  link_runtime
  cd "$SITE_DIR"
  node --disable-warning=ExperimentalWarning "$RUNTIME_DIR/bootstrap.mjs"
}

serve() {
  require_keys
  link_runtime
  cd "$SITE_DIR"
  found=""
  for name in cogenta.config.ts cogenta.config.mts cogenta.config.js cogenta.config.mjs; do
    [ -f "$name" ] && found="$name"
  done
  [ -n "$found" ] || die "no site in $SITE_DIR yet. Run 'cogenta-entrypoint bootstrap' first (or use 'up')."
  cogenta serve --host 0.0.0.0 --port "${PORT:-4000}"
}

command="${1:-serve}"
[ "$#" -eq 0 ] || shift

case "$command" in
  bootstrap)
    bootstrap
    ;;
  serve)
    serve
    ;;
  up)
    bootstrap
    serve
    ;;
  migrate)
    require_keys
    link_runtime
    cd "$SITE_DIR"
    cogenta migrate up "$@"
    ;;
  cli)
    link_runtime
    cd "$SITE_DIR"
    cogenta "$@"
    ;;
  *)
    # Anything else is run as given (a shell for debugging, `node -v`...).
    exec "$command" "$@"
    ;;
esac
