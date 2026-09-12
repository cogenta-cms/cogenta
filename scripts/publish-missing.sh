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

# The one-time password, when the account needs one.
#
# npm has two 2FA modes. Under "Authorization and writes" (the default) every
# publish demands a code; under "Authorization only" a publish needs none, and
# 2FA still guards login, profile and token changes. Which one is in force is
# the account's setting, not this script's business — so the code is optional
# here and simply omitted when it is not given.
#
# This matters for more than convenience: a second factor that is a passkey or
# a hardware key produces no six-digit code at all, so there is nothing to pass
# to --otp. For those accounts "Authorization only" is not a shortcut, it is
# the only way to publish from a CLI.
#
#   bash scripts/publish-missing.sh            # no 2FA needed for publishing
#   bash scripts/publish-missing.sh 123456     # Authorization and writes (TOTP)
#
# An organisation can *also* require 2FA for publishing, and that requirement
# is not overridden by the account's own mode: with it on, a publish is
# refused with a 403 naming two-factor authentication however the account is
# configured. The route that stays open — and the one the registry's own error
# message points at — is a granular access token with "Bypass 2FA" enabled,
# scoped to write the @cogenta packages. Put it in your own npm config
# (`npm config set //registry.npmjs.org/:_authToken=…`) rather than passing it
# through a shell command, so it never lands in a transcript or a history
# file, and revoke it once the run is done. npm is removing direct publishing
# with such a token in January 2027, which is exactly why this is a one-off
# repair and not how releases should work.
#
# With a code, one code covers however many publishes fit inside its window.
# When it expires the run stops immediately rather than burning through the
# remaining packages with a code it knows is dead, and you re-run with a fresh
# one. Nothing is republished, because every package already on the registry is
# skipped.
OTP="${1:-${NPM_OTP:-}}"
if [ -n "$OTP" ]; then
  OTP_FLAG="--otp=$OTP"
  echo "Using the one-time password given on the command line."
else
  OTP_FLAG=""
  echo "No one-time password given — assuming the account is in"
  echo "\"Authorization only\" mode, where a publish needs none."
fi
echo

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

  echo "+ publishing $name@$version"
  # shellcheck disable=SC2086
  if (cd "$dir" && pnpm publish $PUBLISH_FLAGS $OTP_FLAG); then
    published=$((published + 1))
  else
    echo "  FAILED: $name@$version"
    failed=$((failed + 1))
    failures="$failures $name"
    # Stop at the first failure. Carrying on with a code that has just expired
    # turns one honest "your code ran out" into fifteen identical errors, and
    # buries a real refusal — a 404, which the registry uses to mask a 403 —
    # in the noise.
    echo
    echo "  Stopped here. Nothing was published for this package."
    echo "  EOTP: the account is in \"Authorization and writes\" mode — pass a"
    echo "    fresh code as the first argument."
    echo "  E403 naming two-factor authentication: the @cogenta organisation"
    echo "    requires 2FA to publish, which no account-level setting overrides."
    echo "    Publish with a granular access token that has \"Bypass 2FA\" on"
    echo "    (see the header of this script), or lift the requirement in the"
    echo "    organisation's own settings."
    echo "  E404: almost always authorisation rather than a missing package —"
    echo "    the registry masks 403 as 404 on purpose."
    echo "  The $published already published will be skipped on the next run."
    break
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
