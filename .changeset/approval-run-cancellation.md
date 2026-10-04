---
'@cogenta/agents': patch
'@cogenta/cli': patch
---

Cancel human approval waits when their run or server stops, and prevent late approvals from executing cancelled actions. Keep durable review records, consume expected cancellation of detached proposals, and report unexpected proposal storage failures through a structured logger without logging action input.

Enforce the run duration budget during provider calls and human approval waits, and render pages with empty optional rich text fields without failing their public response.
