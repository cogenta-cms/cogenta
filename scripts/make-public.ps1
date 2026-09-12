<#
.SYNOPSIS
Make the fourteen freshly published packages public.

.DESCRIPTION
They went onto the registry restricted, not public, even though every one of
them sets `publishConfig.access: "public"` and the publish passed
`--access public` as well. Neither is what decides it: the @cogenta
organisation's own default package visibility is private, and for a scoped
package that default wins at first publish.

The symptom is a 404 on install, which reads as "this package does not
exist" and means "you may not see it" — the registry masks a 403 as a 404 on
purpose, so `npm install` and `npm view` both lie in the same direction.
`npm access list packages @cogenta` is what gives it away: the packages are
listed there, owned and writable, while the outside world gets nothing.

Changing visibility is an account-level action, so npm raises a 2FA challenge
for each one. That is why this has to run in a real terminal rather than
through an agent: a passkey answers in a browser, and there is no code to
pass on a command line.

Worth doing once afterwards, so the next new package does not repeat this:
set the organisation's default package visibility to public on npmjs.com.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\make-public.ps1
#>

$ErrorActionPreference = 'Continue'

$packages = @(
  '@cogenta/comments'
  '@cogenta/export'
  '@cogenta/forms'
  '@cogenta/observability'
  '@cogenta/theme-kit'
  '@cogenta/theme-association'
  '@cogenta/theme-blog'
  '@cogenta/theme-docs'
  '@cogenta/theme-ecommerce'
  '@cogenta/theme-entreprise'
  '@cogenta/theme-magazine'
  '@cogenta/theme-portfolio'
  '@cogenta/theme-restaurant'
  '@cogenta/theme-saas'
)

$who = & npm whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host 'npm will not say who you are:' -ForegroundColor Red
  $who | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "Acting as: $who" -ForegroundColor Green
Write-Host ''

$done = 0
$failed = @()

foreach ($name in $packages) {
  Write-Host "+ $name" -ForegroundColor Cyan
  & npm access set status=public $name
  if ($LASTEXITCODE -eq 0) { $done++ } else { $failed += $name }
}

Write-Host ''
Write-Host '----'
Write-Host "made public: $done   failed: $($failed.Count)"
if ($failed.Count -gt 0) {
  Write-Host "failed: $($failed -join ', ')" -ForegroundColor Red
  Write-Host 'EOTP means the 2FA challenge was not completed — re-run; the ones'
  Write-Host 'already public are simply set again, which costs nothing.'
  exit 1
}
Write-Host 'Now check it from outside: bash scripts/verify-npm-install.sh'
