---
'@cogenta/cli': patch
---

Give the home page the same widget rules whichever URL reached it.

`/` and `reading.homePath` (`/home` by default) resolve to one entry, but the
widget context was derived from the requested path — `kind: pathname === '/'
? 'home' : 'entry'` — so that one entry looked like the home page through one
URL and like an ordinary entry through the other, and a visibility rule
matched one and not the other.

Which side was wrong is not the obvious one. Every blueprint that excludes a
widget from the home page does it with `mode: 'except'` and a `{ kind: 'home'
}` target: on `/` the target matched and the widget was correctly hidden, on
`/home` it did not and the widget appeared on the very page the editor had
excluded. The audit measured five widget areas on `/home` against none on `/`
and read it as `/` losing its widgets; `/home` was showing what nobody asked
for.

The path resolved to is read only when widgets are actually being resolved,
since `homePath` is a live settings read on every request by design.
