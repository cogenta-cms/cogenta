---
"create-cogenta": patch
---

A site created with MySQL or PostgreSQL now installs its database client. `mysql2` and `postgres` are optional peers of `@cogenta/core`, so nothing installed them: `npm create cogenta` with MySQL failed to create the admin account (`DRIVER_UNAVAILABLE`), and the generated site could not start. The installer now ships both clients, and the generated `package.json` declares the one the chosen driver needs.
