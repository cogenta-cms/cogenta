<#
.SYNOPSIS
Publish the sixteen packages `@cogenta/cli@0.8.0` depends on and npm does not have.

.DESCRIPTION
The PowerShell twin of `publish-missing.sh`, and the one to use on Windows.
The shell version kept losing to the environment rather than to npm: run as
`scripts/publish-missing.sh` PowerShell does not execute it at all and Windows
offers to open it with Notepad, and run through `bash` it reads a different
environment than the shell the operator logged in from.

Why this is run by hand at all: `.github/workflows/release.yml` publishes
through npm Trusted Publishing (OIDC) and carries no token. That cannot create
a package's *first* version — the trusted publisher is configured on a
package's settings page, and a package with no versions has no settings page
(npm/cli#8544). So the first version of each of these goes out once from a
signed-in machine; every release after that is CI's job again, once each
package is linked to the workflow on npmjs.com.

**The versions are deliberately not bumped.** `@cogenta/cli@0.8.0` is already
on the registry and pins each of these to an exact version — it asks for
`@cogenta/analytics@0.3.3`, not `^0.3.3`. Publishing anything higher leaves
that release permanently uninstallable. These are the exact versions it asks
for, which is what makes this a repair rather than a release.

.PARAMETER Otp
A one-time password, when the account's 2FA is a TOTP app and npm is in
"Authorization and writes" mode. Omit it for a passkey or a security key,
which produce no code at all: npm then raises its own challenge in the
browser, which is why this has to run in a real terminal.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\publish-missing.ps1

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\publish-missing.ps1 -Otp 123456
#>
param([string]$Otp = '')

$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')

# `pnpm publish`, never `npm publish`: only pnpm rewrites `workspace:*` into a
# real version. An `npm publish` here would put a package on the registry whose
# own dependencies read `workspace:*`, which no consumer can resolve — the bug
# that forced the 0.1.0 to 0.1.1 republish of all seventeen packages.
#
# `--provenance=false` because the repository's own .npmrc sets
# `provenance=true`, and provenance needs the OIDC token only CI has.
#
# `--access public` is passed and does **not** decide the outcome: these
# packages all set `publishConfig.access: "public"` too, and every one of them
# still landed restricted, because the @cogenta organisation's default package
# visibility is private and that wins at a scoped package's first publish. The
# flag stays because it is correct; `scripts/make-public.ps1` is what actually
# fixes it afterwards.
$publishFlags = @('--provenance=false', '--no-git-checks', '--access', 'public')
if ($Otp -ne '') { $publishFlags += "--otp=$Otp" }

# Dependency order. The registry does not care — it accepts a package whose
# dependencies do not exist yet — but it matters if the run stops half way:
# at every point, what has been published so far installs.
$packages = @(
  @{ Dir = 'packages/analytics';         Name = '@cogenta/analytics';         Version = '0.3.3' }
  @{ Dir = 'packages/comments';          Name = '@cogenta/comments';          Version = '0.2.3' }
  @{ Dir = 'packages/commerce';          Name = '@cogenta/commerce';          Version = '0.4.3' }
  @{ Dir = 'packages/export';            Name = '@cogenta/export';            Version = '0.2.3' }
  @{ Dir = 'packages/forms';             Name = '@cogenta/forms';             Version = '0.2.4' }
  @{ Dir = 'packages/observability';     Name = '@cogenta/observability';     Version = '0.2.3' }
  @{ Dir = 'packages/theme-kit';         Name = '@cogenta/theme-kit';         Version = '0.3.2' }
  @{ Dir = 'packages/theme-association'; Name = '@cogenta/theme-association'; Version = '0.3.2' }
  @{ Dir = 'packages/theme-blog';        Name = '@cogenta/theme-blog';        Version = '0.3.2' }
  @{ Dir = 'packages/theme-docs';        Name = '@cogenta/theme-docs';        Version = '0.3.2' }
  @{ Dir = 'packages/theme-ecommerce';   Name = '@cogenta/theme-ecommerce';   Version = '1.1.2' }
  @{ Dir = 'packages/theme-entreprise';  Name = '@cogenta/theme-entreprise';  Version = '1.1.2' }
  @{ Dir = 'packages/theme-magazine';    Name = '@cogenta/theme-magazine';    Version = '1.1.2' }
  @{ Dir = 'packages/theme-portfolio';   Name = '@cogenta/theme-portfolio';   Version = '1.1.2' }
  @{ Dir = 'packages/theme-restaurant';  Name = '@cogenta/theme-restaurant';  Version = '0.3.2' }
  @{ Dir = 'packages/theme-saas';        Name = '@cogenta/theme-saas';        Version = '0.3.2' }
)

# Never swallowed: claiming "not signed in" while npm would have said exactly
# what was wrong cost a whole round trip earlier.
$who = & npm whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host 'npm will not say who you are:' -ForegroundColor Red
  $who | ForEach-Object { Write-Host "  $_" }
  Write-Host ''
  Write-Host "If that is a 401, run 'npm login' in this same window."
  exit 1
}
Write-Host "Publishing as: $who" -ForegroundColor Green
if ($Otp -eq '') {
  Write-Host 'No one-time password given — npm will raise its own 2FA challenge if it needs one.'
}
Write-Host ''

$published = 0
$skipped = 0

foreach ($package in $packages) {
  # Idempotent: a re-run after an interrupted attempt must not republish, and
  # must not report a failure for the half that already went through.
  & npm view "$($package.Name)@$($package.Version)" version *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "= $($package.Name)@$($package.Version) already on the registry, skipping"
    $skipped++
    continue
  }

  Write-Host "+ publishing $($package.Name)@$($package.Version)" -ForegroundColor Cyan
  Push-Location $package.Dir
  & pnpm publish @publishFlags
  $code = $LASTEXITCODE
  Pop-Location

  if ($code -eq 0) {
    $published++
    Write-Host ''
    continue
  }

  # Stop at the first failure. Carrying on with a code that has just expired,
  # or against a policy that refuses every package equally, turns one honest
  # error into fifteen identical ones and buries it.
  Write-Host ''
  Write-Host "FAILED: $($package.Name)@$($package.Version) — nothing was published for it." -ForegroundColor Red
  Write-Host '  EOTP           the account is in "Authorization and writes" mode: pass -Otp <code>.'
  Write-Host '  E403 naming 2FA  the @cogenta organisation requires 2FA to publish, which no'
  Write-Host '                 account setting overrides. A passkey cannot answer -Otp, so the'
  Write-Host "                 way through is the organisation's own settings on npmjs.com."
  Write-Host '  E404           almost always authorisation, not a missing package: the registry'
  Write-Host '                 masks 403 as 404 on purpose.'
  Write-Host ''
  Write-Host "published: $published   already there: $skipped   stopped at: $($package.Name)"
  Write-Host 'Re-run when fixed — everything already published is skipped.'
  exit 1
}

Write-Host '----'
Write-Host "published: $published   already there: $skipped" -ForegroundColor Green
Write-Host ''
Write-Host 'Next, and only a human can do it: on npmjs.com, open each of these'
Write-Host "packages' settings and add the Trusted Publisher (repository"
Write-Host 'cogenta-cms/cogenta, workflow release.yml). Until that link exists the'
Write-Host 'release workflow cannot publish them again — it has no token to fall'
Write-Host 'back on, and it fails with the same lying 404.'
