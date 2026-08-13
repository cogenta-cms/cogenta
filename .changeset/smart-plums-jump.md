---
'@cogenta/cli': minor
---

Add `cogenta users create` — the bootstrap for the very first admin account.

An admin panel nobody can sign into is not usable, and until now there was no way to
create the first user at all. `cogenta users create --email <email> --admin` generates a
random password, prints it once, and stores only its hash — the same path any later
account goes through, just run from the command line before the admin UI exists to do it
for you.
