---
'@cogenta/schema': minor
---

An entry can be private or password-protected (`schema@2.2`)

`visibility` joins `deletedAt` and `reviewState` as a field **orthogonal to
`status`**: a private page is `published` *and* private, so making it public
does not republish it and every exhaustive switch on `ContentStatus` in this
repository stays untouched.

`ContentStore` gains `setVisibility` and `verifyEntryPassword`. The password is
never stored in the clear and never read back: the store holds a hash the
caller computed, and verification takes the comparison rather than handing the
hash out, so no response can serialise it by accident. Turning a protected
entry public clears the hash, so an old unlock cannot open it again later.

`schema22Migration` adds both columns, reversibly: `visibility` is `not null
default 'public'`, so nothing becomes private by being migrated.
