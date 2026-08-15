---
'@cogenta/core': minor
'@cogenta/cli': minor
---

CORS, security headers and a coherent cache-control on `cogenta serve`
(L10 task 6).

`@cogenta/core`'s configuration gains a `security` section:

```ts
security: {
  cors: { origins: ['https://app.example.com'], credentials: false },
  csp: "default-src 'self'",
  hstsMaxAge: 31536000,
  pageMaxAge: 60,
}
```

Every field is off or permissive-by-omission by default, and that is a
decision rather than timidity. CORS is off unless a site names an origin —
the origin list *is* the switch, so "CORS is on" and "these origins may read
it" cannot drift apart. HSTS is off unless asked and is never sent over plain
HTTP: on a host that is not fully HTTPS it locks browsers out for `maxAge`
seconds with no server-side undo, and it is the one header a wrong default can
take a site offline with. Credentials together with the `*` origin is refused
at startup, because every browser refuses that pair and a server that accepted
it would look configured while granting nothing.

`cogenta serve` applies all of it in one place, before any route runs, so a
route added later cannot opt out by forgetting:

- `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` and
  `Referrer-Policy: strict-origin-when-cross-origin` on every response.
- The configured CSP verbatim — a string, not a builder, because a CSP depends
  on which analytics, fonts and embeds a site actually uses.
- CORS with an echoed (never blindly reflected) origin and `Vary: Origin`,
  plus a real preflight answer.
- Cache-control by path class: `no-store` for `/api/*` and for the admin,
  `public, max-age=0, s-maxage=<pageMaxAge>, must-revalidate` for a public
  page, and the long immutable value image variants already set for
  themselves.
