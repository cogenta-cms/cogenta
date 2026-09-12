#!/usr/bin/env bash
#
# Publish the sixteen packages `@cogenta/cli@0.8.0` already depends on and npm
# does not have.
#
# Why this script exists, and why it is run by hand.
#
# `.github/workflows/release.yml` publishes through npm Trusted Publishing
# (OIDC) and carries no token at all. That cannot make a package's *first*
# version: the trusted publisher is configured on a package's settings page,
# and a package with no versions has no settings page. npm's own issue for it
# is npm/cli#8544, still open. So the first version of each of these has to be
# pushed from a logged-in machine, once; every release after that goes through
# CI as usual, provided the human then links each package to the workflow on
# npmjs.com.
#
# **The versions here are deliberately not bumped.** `@cogenta/cli@0.8.0` is
# already on the registry and pins each of these to an exact version — it asks
# for `@cogenta/analytics@0.3.3`, not `^0.3.3`. Publishing anything higher
# leaves that release permanently uninstallable. These are the exact versions
# it asks for, which is what makes this a repair rather than a new release.
#
# Order is dependency-first. It does not matter to the registry, which accepts
# a package whose dependencies do not exist yet, but it matters if the run
# stops half way: at every point, what has been published so far installs.
set -u

cd "$(dirname "$0")/.." || exit 1

# `pnpm publish`, never `npm publish`: only pnpm rewrites `workspace:*` into a
# real version, and only outside `-r` does it honour `--provenance=false`.
# An `npm publish` here would put a package on the registry whose own
# dependencies read `workspace:*`, which no consumer can resolve — the bug
# that forced the 0.1.0 → 0.1.1 republish of all seventeen packages.
#
# `--provenance=false` because every package.json asks for provenance, and
# provenance needs the OIDC token only CI has. The trade is deliberate and
# narrow: these sixteen first versions carry no attestation, every release
# after them does.
PUBLISH_FLAGS="--provenance=false --no-git-checks --access public"

PACKAGES="
packages/analytics|@cogenta/analytics|0.3.3
packages/comments|@cogenta/comments|0.2.3
packages/commerce|@cogenta/commerce|0.4.3
packages/export|@cogenta/export|0.2.3
packages/forms|@cogenta/forms|0.2.4
packages/observability|@cogenta/observability|0.2.3
packages/theme-kit|@cogenta/theme-kit|0.3.2
packages/theme-association|@cogenta/theme-association|0.3.2
packages/theme-blog|@cogenta/theme-blog|0.3.2
packages/theme-docs|@cogenta/theme-docs|0.3.2
packages/theme-ecommerce|@cogenta/theme-ecommerce|1.1.2
packages/theme-entreprise|@cogenta/theme-entreprise|1.1.2
packages/theme-magazine|@cogenta/theme-magazine|1.1.2
packages/theme-portfolio|@cogenta/theme-portfolio|1.1.2
packages/theme-restaurant|@cogenta/theme-restaurant|0.3.2
packages/theme-saas|@cogenta/theme-saas|0.3.2
"

if ! npm whoami >/dev/null 2>&1; then
  echo "Not signed in to npm. Run 'npm login' first — publishing is the one step"
  echo "that needs a credential this repository does not hold."
  exit 1
fi
echo "Publishing as: $(npm whoami)"
echo

# npm asks for a one-time password on every publish while the account's 2FA
# mode is "auth and writes". The CLI can prompt for it itself, but only from a
# real terminal — run non-interactively it fails outright with EOTP, which is
# how all sixteen failed on the first attempt here.
#
# So the code is asked for explicitly, once per package, and an empty answer
# reuses the previous one: a TOTP code stays valid for its whole window, which
# is usually long enough for two or three publishes in a row. Sixteen codes is
# the worst case, not the expected one.
#
# The alternative, if this is too tedious, is to set the account to
# "Authorization only" on npmjs.com for the length of the run — that is a
# security setting on a personal account, so it is deliberately not something
# this script touches.
OTP=""
ask_otp() {
  if [ ! -t 0 ] && [ ! -r /dev/tty ]; then
    echo "This script needs a terminal to ask for your one-time password."
    echo "Run it directly in your own shell, not through a pipe or an agent."
    exit 1
  fi
  printf 'One-time password for %s' "$1" >&2
  if [ -n "$OTP" ]; then printf ' (empty = reuse %s)' "$OTP" >&2; fi
  printf ': ' >&2
  read -r answer < /dev/tty
  if [ -n "$answer" ]; then OTP="$answer"; fi
  if [ -z "$OTP" ]; then
    echo "No code given; stopping rather than guessing." >&2
    exit 1
  fi
}

published=0
skipped=0
failed=0
failures=""

for entry in $PACKAGES; do
  dir="${entry%%|*}"
  rest="${entry#*|}"
  name="${rest%%|*}"
  version="${rest##*|}"

  # Idempotent: a re-run after a network drop or an OTP timeout must not report
  # a failure for the half that already went through.
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "= $name@$version already on the registry, skipping"
    skipped=$((skipped + 1))
    continue
  fi

  ask_otp "$name@$version"
  echo "+ publishing $name@$version"
  # shellcheck disable=SC2086
  if (cd "$dir" && pnpm publish $PUBLISH_FLAGS --otp="$OTP"); then
    published=$((published + 1))
  else
    echo "  FAILED: $name@$version"
    echo "  EOTP means the code was wrong or had expired — re-run, nothing was"
    echo "  published for it. A 404 almost always means authorisation rather than"
    echo "  a missing package: the registry masks 403 as 404 on purpose."
    # A stale code must not be offered for reuse on the next package.
    OTP=""
    failed=$((failed + 1))
    failures="$failures $name"
  fi
  echo
done

echo "----"
echo "published: $published   already there: $skipped   failed: $failed"
if [ -n "$failures" ]; then
  echo "failed:$failures"
  exit 1
fi

echo
echo "Next, and only a human can do it: on npmjs.com, open each of these"
echo "packages' settings and add the Trusted Publisher (repository"
echo "cogenta-cms/cogenta, workflow release.yml). Until that link exists, the"
echo "release workflow cannot publish them again — it has no token to fall back"
echo "on, and it will fail with the same lying 404."
echo
echo "Then check the repair actually holds:"
echo "  scripts/verify-npm-install.sh"
