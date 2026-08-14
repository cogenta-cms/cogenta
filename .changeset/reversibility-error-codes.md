---
'@cogenta/core': minor
---

Add three error codes for L4's reversibility layer:
`RECEIPT_UNKNOWN` (reverting a receipt id that does not exist),
`RECEIPT_ALREADY_REVERTED` (reverting a receipt a second time), and
`RECEIPT_NOT_REVERTIBLE` (the matching tool has no `revert()` available in
the current run).
