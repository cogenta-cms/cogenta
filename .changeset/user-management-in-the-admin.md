---
'@cogenta/api': minor
'@cogenta/cli': minor
'create-cogenta': patch
---

Account management moves out of the terminal: `@cogenta/api` gains
`createUsersRouter`, mounted by `cogenta serve` at `/api/users`.

Until now `cogenta users create` was the only way to make an account. The new
routes are:

- `GET /api/users` (admin) — every account, optionally filtered by `?role=`,
  each with a summary of the second factors it holds
- `POST /api/users` (admin) — creates the account and returns a server-generated
  password exactly once, the same rule the CLI already follows. The admin never
  chooses it.
- `PATCH /api/users/{id}` (admin) — roles and status. Disabling an account
  revokes its live sessions in the same move.
- `GET /api/users/{id|me}` and `GET /api/users/{id|me}/sessions` — yours, or
  anyone's with `admin`
- `DELETE /api/users/{id|me}/sessions/{sessionId}` — revoke one session
- `POST /api/users/me/password` — change your own password, current one
  required, rate-limited on the same store as sign-in

Two deliberate absences. There is no delete: accounts are disabled, never
removed, because an account that wrote content still has to be nameable in the
audit log. And there is no route for an admin to set somebody else's password —
that is a reset, it needs a delivery channel and a single-use token to be
anything but a back door, and it is L13's task.

Two safety properties worth naming, both covered by tests:

- The last active `admin` cannot be demoted or disabled. Not a permission
  question — the person doing it is allowed to — but with no password reset yet
  there is no way back into a site with no administrator.
- `DELETE /api/users/me/sessions/{id}` checks the session actually belongs to
  the caller before revoking it, so passing someone else's session id under
  `me` is a 404 rather than a successful revocation.

`cogenta serve` records `user.create`, `user.update`, `user.password_change` and
`user.session_revoke` in the audit log, naming the actor and the subject and
nothing that could sign anyone in.

`cogenta users create`'s closing hint and `create-cogenta`'s install recap no
longer tell people they will be asked to set up a second factor at first
sign-in: since ADR-0021 they will not be.
