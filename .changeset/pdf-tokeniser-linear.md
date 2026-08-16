---
'@cogenta/agents': patch
---

The PDF tokeniser no longer backtracks quadratically on a long numeric token.

`/^[-+]?(\d+\.?\d*|\.\d+)$/` decided whether a bare token was a number. On a
run of digits that fails at the anchor it backtracks over every starting
position: measured at 6 ms for 2 000 digits, 51 ms for 8 000, 274 ms for
20 000 — so a single 2-million-digit token, which fits comfortably inside the
20 MB a document may be, costs roughly three quarters of an hour of CPU. A
content stream is attacker-supplied by definition here; that is a denial of
service for the price of one upload.

Replaced with a linear character scan plus a 64-character cap, since a real
PDF number is a handful of characters. A regression test reads a content
stream carrying a 200 000-digit token and asserts both that the surrounding
text still comes out and that it takes seconds rather than minutes.
