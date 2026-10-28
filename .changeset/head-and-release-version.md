---
'@cogenta/cli': patch
---

`cogenta serve` answers `HEAD` like `GET` without a body, for public pages, `/robots.txt`, `/sitemap.xml`, the admin and the probes; link checkers and uptime monitors that use `HEAD` saw 404 and 405 on a healthy site. The version shown in the public footer, the admin and `GET /api/shell-status` is now the `@cogenta/cli` release (the one the container image and Helm chart carry) instead of the independently versioned `@cogenta/core`.
