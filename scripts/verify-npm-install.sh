#!/usr/bin/env bash
#
# Does a stranger's `npm install` of this CMS actually work?
#
# Installs `@cogenta/cli` and `create-cogenta` from the public registry into a
# throwaway directory with no access to this workspace at all — the only way to
# see what someone who has never cloned the repository gets. A workspace
# install proves nothing here: it resolves every `@cogenta/*` locally and would
# stay green with the registry completely empty.
#
# Before the sixteen missing packages went up, this failed on its first line
# with ETARGET: `No matching version found for @cogenta/analytics@0.3.3`.
set -u

VERSION="${1:-latest}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK" || exit 1
printf '%s' '{"name":"cogenta-install-check","version":"1.0.0","private":true}' > package.json

failed=0

echo "Installing @cogenta/cli@$VERSION from the public registry…"
if npm install "@cogenta/cli@$VERSION" --no-audit --no-fund >install-cli.log 2>&1; then
  echo "  ok"
else
  echo "  FAILED"
  tail -12 install-cli.log | sed 's/^/    /'
  failed=1
fi

echo "Installing create-cogenta@$VERSION from the public registry…"
if npm install "create-cogenta@$VERSION" --no-audit --no-fund >install-create.log 2>&1; then
  echo "  ok"
else
  echo "  FAILED"
  tail -12 install-create.log | sed 's/^/    /'
  failed=1
fi

# Installing is not running. A package whose files list is wrong installs
# perfectly and then has no binary, which is exactly the class of bug a
# registry round-trip is meant to catch.
if [ -x node_modules/.bin/cogenta ] || [ -f node_modules/.bin/cogenta ]; then
  echo "Running the installed binary…"
  if node_modules/.bin/cogenta --help >help.log 2>&1; then
    echo "  ok — $(head -1 help.log)"
  else
    echo "  FAILED to run"
    tail -12 help.log | sed 's/^/    /'
    failed=1
  fi
else
  echo "No cogenta binary was installed."
  failed=1
fi

echo "----"
if [ "$failed" -eq 0 ]; then
  echo "A clean install works."
else
  echo "A clean install is still broken."
fi
exit "$failed"
