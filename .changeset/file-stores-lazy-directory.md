---
'@cogenta/agents': patch
---

The file-backed stores (agent declarations, memory, prompt templates, provider
configs, skills, agent skills, traces) no longer start creating their directory
the moment they are constructed. They create it on the first call that needs
it. Before, a store whose directory could not be created (a path under a file,
a read-only mount) raised an unhandled promise rejection even if nothing ever
used it — which ends a Node process by default. The error now reaches the first
call instead, and a later call retries once the directory becomes creatable.
