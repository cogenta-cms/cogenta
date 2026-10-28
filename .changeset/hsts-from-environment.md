---
'@cogenta/core': patch
---

`COGENTA_SECURITY_HSTS_MAX_AGE` sets `security.hstsMaxAge` from the environment, validated by the same bounds as the config file (a whole number of seconds, 0 to two years), so a container or Helm deployment can turn on `Strict-Transport-Security` without a config file.
