---
'@cogenta/cli': patch
---

The official container image starts on Kubernetes with an empty volume. Its working directory was `/data/site`, inside the volume, so the container runtime created that directory as root before the entrypoint ran, and the first boot stopped with "cannot write in /data/site". The image now works from `/data`, and the entrypoint replaces an empty site directory it cannot write, which repairs a volume a 0.21.0 pod already touched. Chart 0.1.1 also sets `workingDir: /data`.
