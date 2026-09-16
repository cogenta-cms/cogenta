---
'@cogenta/api': minor
'@cogenta/cli': minor
---

A password-protected page asks for its password, and opens

`POST /{collection}/{id}/visibility` sets an entry public, private or
password-protected. Gated by **`publish`**, borrowed the way the trash borrows
`delete`: the five actions of contract A are frozen, and this changes what the
public sees. Someone who may fix a typo must not be able to make a private note
public.

`@cogenta/api` gains `createUnlockTokens`: the same signed-not-encrypted shape
as the preview tokens — HMAC-SHA256, constant-time comparison, a version in the
payload — carrying one assertion, "whoever holds this answered the password of
entry X, until this instant". One entry, one cookie, named after a digest of
the id rather than the id itself.

`cogenta serve` renders the page itself when it is locked — the theme's header,
the entry's own title, its footer — with a form where the content would be, and
answers `POST /_cogenta/unlock` with a cookie and a redirect. The password
travels in a form body, never in a URL, a referrer or a log line; a redirect
target that is not a path of this site becomes the home page; and a request
carrying any cookie was already answered `private, no-store`.
