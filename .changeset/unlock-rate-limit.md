---
'@cogenta/cli': minor
---

A page password can no longer be guessed in a loop

`/_cogenta/unlock` counts attempts through the `rateLimit` driver the project
already has: ten per ten minutes, keyed by address **and** entry. Counted
before the password is checked and whatever the entry id turns out to be — an
answer that came faster for an unknown id would say which ids are real — and
per entry rather than per site, so an attacker spends their own budget on the
page they are attacking instead of locking every reader out of every protected
page. A correct answer clears the counter.

The form tells the two apart: a wrong password says so, a exhausted budget
says to wait, and the response carries `Retry-After`.
