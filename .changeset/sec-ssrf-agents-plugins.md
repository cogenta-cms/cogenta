---
"@cogenta/agents": patch
"@cogenta/plugins": patch
---

The agent `http.fetch` tool and the plugin `http.fetch` capability now resolve the host, refuse loopback, private, link-local and other non-public addresses, and connect to the address they checked, so a granted or allowed host name no longer reaches the internal network. No configuration option for internal hosts exists, so there is no opt-in: private targets are always refused. A site served only from a private address (for example a development site on localhost) can therefore no longer be fetched by the agent tool.
