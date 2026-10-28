# Cogenta Helm chart

The official Cogenta CMS chart. Chart version **0.1.0** is independent of the
application version; `appVersion` is the Cogenta release whose image the chart
runs by default, and it moves with every Cogenta release. The image contract is `ghcr.io/cogenta-cms/cogenta:<appVersion>` with port 4000,
`/livez`, `/readyz`, and `cogenta-entrypoint bootstrap|serve|cli`.

Requires Helm 3.19+, Kubernetes 1.27+, a default StorageClass supporting fsGroup,
a NetworkPolicy-capable CNI and an ingress controller. No AI key, Redis, S3,
Bitnami chart or external database is required. PostgreSQL 17 is bundled as a
single-instance StatefulSet, without chart dependencies.

## Quick start

Point DNS at the ingress controller. These three commands install the chart,
retrieve the initial admin password, and check readiness:

```sh
helm install blog oci://ghcr.io/cogenta-cms/charts/cogenta --set site.url=https://blog.example.com --set ingress.host=blog.example.com
kubectl get secret blog-cogenta -o jsonpath='{.data.admin-password}' | base64 -d; echo
helm test blog
```

Open the configured site URL and sign in with `admin@example.com`. Configure
`site.adminEmail` before the first bootstrap to use another address. Helm returns
before pods are necessarily ready; use `kubectl rollout status deployment/blog-cogenta`
if the readiness test times out. Bootstrap restarts until the database is available.
The initial password seeds the account once; editing the Secret later does not
reset an existing account. Use the application's account recovery instead.

An HTTPS site URL alone does not provision a certificate. Before public traffic,
set `ingress.tls.enabled=true` and either `ingress.tls.secretName` for an existing
certificate or `ingress.tls.clusterIssuer` for cert-manager. The default ingress
class is omitted, so the cluster's default class must be configured, or set
`ingress.className`. Change `networkPolicy.ingressControllerNamespace` if the
controller does not run in `kube-system`. Configure `site.trustProxy` for the
actual trusted path before accepting traffic.

## Values

See [values.yaml](values.yaml) for every default and [values.schema.json](values.schema.json)
for types and validation. Unknown chart-specific fields are rejected; native
Kubernetes scheduling, volume and policy objects are validated by Kubernetes.

| Value | Default | Purpose |
| --- | --- | --- |
| `nameOverride`, `fullnameOverride` | empty | Resource names; full names are capped at 45 characters to leave suffix room |
| `image.repository` | `ghcr.io/cogenta-cms/cogenta` | Application image |
| `image.tag`, `image.pullPolicy`, `imagePullSecrets` | appVersion, `IfNotPresent`, `[]` | Release tag and registry access |
| `replicaCount`, `strategy.type` | `1`, `Recreate` | Application replicas and update strategy |
| `site.url`, `site.name` | `http://cogenta.local`, `Cogenta` | Public origin and site title |
| `site.locales`, `site.defaultLocale` | `[en]`, `en` | Initial content locales; default must be in the list |
| `site.blueprint`, `site.adminEmail` | `blog`, `admin@example.com` | Initial scaffolding and administrator |
| `site.trustProxy` | `"off"` | `off`, `cloudflare`, or the trusted proxy hop count |
| `existingSecret` | empty | Existing application Secret; recommended for production/GitOps |
| `secrets.authSigningKey`, `secrets.previewSigningKey` | generated | At least 32 characters if explicitly supplied |
| `secrets.adminPassword` | generated | At least 16 characters if explicitly supplied |
| `secretChecksum` | empty | Change this value to roll pods after existing Secret rotation |
| `persistence.size`, `persistence.accessMode` | `10Gi`, `ReadWriteOnce` | Mandatory `/data` PVC |
| `persistence.storageClass`, `persistence.existingClaim` | empty | Default class or existing claim; `"-"` sets `storageClassName: ""` |
| `storage.driver`, `storage.bucket`, `storage.region`, `storage.endpoint` | `local`, empty | Local media or S3; credentials come from Secret references |
| `cache.driver`, `rateLimit.driver` | `memory`, `memory` | Redis optional; connection URLs come from Secret references |
| `resources.requests` | `250m`, `512Mi` | Application and bootstrap requests |
| `resources.limits` | memory `1Gi` | No default CPU limit |
| `startupProbe`, `livenessProbe`, `readinessProbe` | `/livez`, `/livez`, `/readyz` | Probe objects; startup allows up to 5 minutes |
| `terminationGracePeriodSeconds` | `30` | Application shutdown grace period |
| `podAnnotations`, `podLabels` | `{}` | Additional application pod metadata; reserved keys cannot be overridden |
| `nodeSelector`, `tolerations`, `affinity`, `topologySpreadConstraints` | empty | Application scheduling |
| `priorityClassName` | empty | Application priority |
| `extraEnv`, `extraEnvFrom` | `[]` | Environment shared by bootstrap and serve; Secret references for sensitive values |
| `extraVolumes`, `extraVolumeMounts` | `[]` | Shared bootstrap/serve mounts; `/data` and `/tmp` are reserved |
| `service.port`, `service.annotations` | `80`, `{}` | ClusterIP service to application port 4000 |
| `ingress.enabled`, `ingress.host`, `ingress.className` | `true`, `cogenta.local`, empty | Ingress routing |
| `ingress.annotations` | `{}` | Additional ingress annotations |
| `ingress.tls.enabled`, `ingress.tls.secretName`, `ingress.tls.clusterIssuer` | `false`, empty | TLS and optional cert-manager issuance |
| `networkPolicy.enabled`, `networkPolicy.ingressControllerNamespace` | `true`, `kube-system` | Permit app ingress from that namespace and same-release pods |
| `networkPolicy.additionalIngress`, `networkPolicy.egress` | `[]`, `[]` | Extra app ingress; empty egress allows all destinations |
| `postgresql.enabled`, `postgresql.image` | `true`, `postgres:17-alpine` | Built-in single-instance PostgreSQL 17 |
| `postgresql.username`, `postgresql.database` | `cogenta`, `cogenta` | Initial PostgreSQL user/database |
| `postgresql.password`, `postgresql.existingSecret` | generated, empty | Password or existing Secret with `postgres-password` |
| `postgresql.secretChecksum` | empty | Restart app/database after managed credential changes |
| `postgresql.persistence.size`, `.storageClass`, `.existingClaim` | `10Gi`, empty | Separate RWO database PVC, kept on uninstall |
| `postgresql.resources` | requests `100m/256Mi`, memory limit `1Gi` | Database resources |
| `externalDatabase.driver` | `postgres` | `postgres`, `mysql`, or `sqlite` when bundled DB is disabled |
| `externalDatabase.existingSecret`, `.secretKey` | application existingSecret, `database-url` | Database URL reference; never a ConfigMap |
| `backup.enabled`, `backup.schedule`, `backup.retentionDays` | `false`, `0 3 * * *`, `7` | Built-in PostgreSQL custom-format dumps and retention |
| `backup.persistence.size`, `.storageClass`, `.existingClaim` | `10Gi`, empty | Dedicated backup PVC |
| `backup.resources` | requests `100m/128Mi`, memory limit `512Mi` | Dump job resources |
| `backup.activeDeadlineSeconds` | `3600` | Limit job duration |
| `backup.successfulJobsHistoryLimit`, `.failedJobsHistoryLimit` | `1`, `3` | Job history retention |
| `autoscaling.enabled`, `.minReplicas`, `.maxReplicas` | `false`, `2`, `5` | HPA; RWX and a metrics server are required |
| `autoscaling.targetCPUUtilizationPercentage` | `70` | CPU utilization target relative to requests |
| `podDisruptionBudget.maxUnavailable` | `1` | PDB rendered only when fixed replicas or HPA minimum exceeds one |
| `serviceMonitor.enabled`, `.labels` | `false`, `{}` | Prometheus Operator integration and discovery labels |
| `serviceMonitor.path`, `.interval`, `.scrapeTimeout` | `/metrics`, `30s`, `10s` | Requires an actual compatible metrics endpoint |
| `test.image` | `curlimages/curl:8.16.0` | Pinned readiness hook image |

All chart-owned containers use a non-root user, read-only root filesystem,
`allowPrivilegeEscalation: false`, dropped capabilities and RuntimeDefault
seccomp. App/bootstrap/test use UID/GID 10001; PostgreSQL/backup use UID/GID 70,
the [official Alpine image's user](https://github.com/docker-library/postgres/blob/master/17/alpine3.23/Dockerfile).
Every pod uses the dedicated ServiceAccount with token automount disabled.
Writable PostgreSQL socket and temporary directories have explicit emptyDirs;
PGDATA is a subdirectory of its PVC so initialization works without a root init
container. Application `/tmp` is ephemeral and `/data` is always persistent.

## Secrets and GitOps / ArgoCD

Without `existingSecret`, Helm generates signing keys and an admin password with
`randAlphaNum`, then [looks up](https://helm.sh/docs/chart_template_guide/functions_and_pipelines/#using-the-lookup-function)
the existing Secret on later live upgrades. The database password behaves the
same way. Generated Secrets and PVCs have `helm.sh/resource-policy: keep`, so
uninstall does not erase credentials or data. Reinstall with the same release
name and namespace to reuse them; retained resources require explicit manual
cleanup after backups are verified.

ArgoCD and client-side `helm template` do **not** perform live lookups. Generated
values change on every offline render, including their pod checksums. Always use
pre-provisioned `existingSecret` resources for GitOps. Use External Secrets,
Sealed Secrets, or another secret controller; never commit plaintext secrets or
private values to an unencrypted repository. A Kubernetes Secret is base64,
not encrypted by the manifest format.

Provision the following keys securely in the target namespace before syncing:

| Secret | Keys |
| --- | --- |
| `cogenta-app-private` | `auth-signing-key`, `preview-signing-key`, `admin-password`; also `database-url` when used for the external DB |
| `cogenta-db-private` | `postgres-password` for bundled PostgreSQL, or `database-url` for an external DB |
| `cogenta-services-private` | Environment keys such as `COGENTA_STORAGE_ACCESS_KEY_ID`, `COGENTA_STORAGE_SECRET_ACCESS_KEY`, `COGENTA_CACHE_URL`, `COGENTA_RATE_LIMIT_URL`, optional `COGENTA_LLM_*` |

Example private values for a managed PostgreSQL database (replace names/origin):

```yaml
# private-values.yaml — supplied privately to Helm or a protected GitOps source.
existingSecret: cogenta-app-private
secretChecksum: "1"
postgresql:
  enabled: false
externalDatabase:
  driver: postgres
  existingSecret: cogenta-db-private
site:
  url: https://cms.example.com
  adminEmail: administrator@example.com
  trustProxy: "1"
ingress:
  host: cms.example.com
  className: nginx
  tls:
    enabled: true
    clusterIssuer: letsencrypt-prod
networkPolicy:
  ingressControllerNamespace: ingress-nginx
```

For ArgoCD, reference the chart OCI repository with Helm support enabled:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cogenta
  namespace: argocd
spec:
  project: default
  source:
    repoURL: ghcr.io/cogenta-cms/charts
    chart: cogenta
    targetRevision: 0.1.0
    helm:
      releaseName: blog
      valuesObject:
        existingSecret: cogenta-app-private
        postgresql:
          existingSecret: cogenta-db-private
        site:
          url: https://cms.example.com
          trustProxy: "1"
        ingress:
          host: cms.example.com
  destination:
    server: https://kubernetes.default.svc
    namespace: cms
  syncPolicy:
    syncOptions: [CreateNamespace=true]
```

The ArgoCD example uses the **bundled** database and pre-created Secrets. Its DB
Secret must contain `postgres-password`. Add the protected private values for
your ingress/TLS settings, or use the managed database values above together.
`extraEnvFrom` accepts Secret references only. Explicit chart env entries take
precedence over envFrom; extra environment entries cannot override chart-owned
variables. This keeps URLs/passwords out of the ConfigMap while allowing
optional S3, Redis and LLM credentials in both bootstrap and serve.

Checksums automatically roll pods for chart-owned config and secret changes.
External Secret changes require a rollout controller or a bump to
`secretChecksum` / `postgresql.secretChecksum`. Restarting a pod does not rotate
a PostgreSQL role password on an existing PGDATA: first coordinate `ALTER ROLE`
and Secret updates during a maintenance window, then restart app/database pods.
Do not change signing keys casually: sessions and encrypted state may depend on
them. Back them up securely with the database.

Bundled PostgreSQL passwords must contain only URI-unreserved characters
(`A-Z a-z 0-9 . _ ~ -`), because kubelet interpolates the password into the app's
connection URL. Generated passwords satisfy this. This also applies to
`postgresql.existingSecret`; Helm checks it when it can look it up. For other
credentials use an external database with a complete percent-encoded URL in a
Secret. SQLite uses, for example, `file:/data/cogenta.sqlite` in `database-url`;
keep one replica with `Recreate` and disable the built-in backup job. All three
drivers remain available without AI, S3 or Redis.

## Upgrades, scaling and rollback

```sh
helm upgrade blog oci://ghcr.io/cogenta-cms/charts/cogenta --version 0.1.0 -f private-values.yaml --set image.tag=0.21.0 --wait --timeout 10m
helm history blog
helm rollback blog <revision> --wait --timeout 10m
```

Replace versions with published releases. Keep the same private values on every
upgrade. Chart and app versions are separate: image-only upgrades can bump
`image.tag`; chart changes require a chart version bump before publishing. On
`v*` git tags the workflow packages with `appVersion` set to the tag without `v`;
manual dispatch can supply an app version. No image is built by this workflow.
The initial source appVersion remains a placeholder until the matching image is
published by the image pipeline.

The initContainer runs bootstrap before every pod starts: first-run scaffolding,
then DB migrations on subsequent boots. `Recreate` is the default so a RWO volume
is detached before replacement pods start. This causes downtime during upgrades.
The retained app/database/backup claims keep stable names; avoid release renames,
StorageClass/access-mode changes or reducing requested storage after installation.
Existing claims must have the configured access mode and permit the container's
UID/fsGroup to write.

`RollingUpdate` is permitted only with RWX or S3 media. **S3 alone does not make
the `/data` PVC shareable**: site files and state still live there. Multiple
replicas and HPA therefore require `persistence.accessMode: ReadWriteMany`, even
with S3. A single-replica rolling deployment on RWO+S3 is allowed, but overlapping
pods can only mount that claim on the same node; scheduling may stall during a
node move. Prefer RWX for rolling deployments. RWO is not a cross-node shared
filesystem, as described by [Kubernetes volume access modes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes).

For more than one replica, use an external HA database, S3 for media, RWX for
shared site/state, and shared Redis for rate limits/cache. See
[ci/ha-s3.yaml](ci/ha-s3.yaml) and provision the referenced Secrets first. HPA is
off by default and removes the Deployment's fixed replica count when enabled.
PDB is emitted only when the fixed count or HPA minimum is greater than one.

A rolling upgrade runs bootstrap in each new pod while old pods may still serve.
Only use it when the image's bootstrap/migrations are safe under concurrency and
compatible with the old app. For schema changes without those guarantees, disable
HPA, scale to one, switch to `Recreate`, and perform a maintenance upgrade.
**Helm rollback does not reverse database migrations or restore PVC contents.**
Review migration compatibility; restore a verified database backup and matching
site snapshot for an incompatible rollback. Destructive migrations require an
explicit operator decision and a verified backup under Cogenta's migration rules.

## Backup and restore

Enable `backup.enabled=true` for the bundled PostgreSQL database. Every run uses
`pg_dump -Fc`, verifies the archive's table of contents, atomically renames it,
and only then expires old completed dumps. `find -mtime +N` uses whole-day
rounding, so removal can occur after more than N+1 days. Partial failed dumps are
removed; failed jobs are retained for inspection. Jobs never overlap and have a
one-hour default deadline. Copy dumps off-cluster, encrypt them at rest and alert
on failures and capacity exhaustion. A PVC on the same cluster is not a disaster
recovery plan; rehearse full restoration, not just archive listing.

```sh
# Run the scheduled job immediately and wait for success (choose a unique name).
kubectl create job blog-db-backup-manual --from=cronjob/blog-cogenta-backup
kubectl wait --for=condition=complete job/blog-db-backup-manual --timeout=1h
kubectl logs job/blog-db-backup-manual
# During a maintenance window, inspect and restore a previously exported dump.
pg_restore --list ./cogenta-YYYYMMDDTHHMMSSZ.dump
# Set PGSERVICE/PGSERVICEFILE or PGHOST/PGUSER/PGDATABASE and PGPASSFILE securely.
pg_restore --exit-on-error --single-transaction --clean --if-exists --no-owner --no-privileges ./cogenta-YYYYMMDDTHHMMSSZ.dump
```

The last command replaces database objects: verify the target, stop application
writers, verify a fresh backup, and explicitly approve the maintenance operation
before running it. For bundled DB access from an operator workstation, use
`kubectl port-forward service/blog-cogenta-postgresql 5432:5432` and local
PostgreSQL 17 client tools with protected credentials. The backup PVC is separate
from `/data`; use your CSI backup/snapshot tooling to export it, or a temporary
non-root maintenance pod mounting **only** that claim while the CronJob is
suspended. Some PostgreSQL initialization metadata such as cluster-wide roles is
outside a per-database dump; retain infrastructure configuration and credentials.

The CronJob deliberately does not tar media: mounting the app's RWO `/data`
claim from another node can fail. Use CSI VolumeSnapshots or Velero for `/data`,
including local media and site/state, and S3 bucket versioning/backups when S3
is enabled. Coordinate DB dumps and filesystem snapshots with an application
maintenance window for a consistent recovery point. External PostgreSQL/MySQL
should use provider/CNPG backup and PITR; SQLite requires a SQLite-aware backup or
an application-stopped snapshot of `/data`. This PostgreSQL dump is an operational
archive, separate from Cogenta's `cogenta-backup@1.0` application ZIP contract.

## Production checklist

- Use a managed HA database or CloudNativePG; the bundled single PostgreSQL
  StatefulSet has no replication, failover, pooling or PITR.
- Configure TLS, DNS, ingress class/namespace and `site.trustProxy` for the real
  number of trusted hops (`"1"` for one trusted ingress; `cloudflare` only for the
  matching deployment). Incorrect proxy trust affects HTTPS/IP/rate limiting.
- Store credentials in an external secret controller and enable Kubernetes Secret
  encryption and least-privilege RBAC. Preserve keys alongside tested backups.
- For >1 replica, configure RWX site/state, S3 media, shared Redis rate limiting
  and caching. The chart does not install Redis or an S3 service. Use resource
  measurements to size requests, limits, storage, backup retention and HPA.
- Enable and monitor backups, export them off-cluster, and test database **and**
  media/site restoration before relying on rollback.
- Confirm your CNI enforces NetworkPolicy. PostgreSQL ingress permits only app
  pods and the backup job in the same namespace/release. App ingress permits the
  configured ingress-controller namespace and same-release pods, including the
  readiness test. Labels and namespace access remain an RBAC trust boundary.
- App egress is open by default for LLM providers, webhooks, object storage and
  other integrations. To restrict it, set `networkPolicy.egress` with UDP/TCP DNS
  to your actual DNS service and TCP 5432 to bundled PostgreSQL (or the external
  DB's address/port), plus required Redis/S3/HTTPS destinations. Kubernetes
  NetworkPolicy cannot select an external service by DNS name; use CNI-specific
  egress policies if required. Empty egress values intentionally mean allow all.
- ServiceMonitor is optional and does not create a metrics endpoint: enable it
  only when your image exposes the configured path and Prometheus Operator CRDs
  exist. Allow Prometheus in `networkPolicy.additionalIngress`; the HA fixture
  demonstrates namespace admission. Otherwise monitor readiness externally.
- Check migration compatibility and serialize maintenance upgrades when needed;
  select an ingress controller that drains terminating endpoints gracefully.

## Verification and release

All verification is offline; no cluster installation is required:

```sh
helm lint charts/cogenta --strict
for values in charts/cogenta/ci/*.yaml; do
  helm lint charts/cogenta --strict -f "$values"
  helm template ci charts/cogenta --kube-version 1.34.0 -f "$values" | kubeconform -strict -summary -kubernetes-version 1.34.0 -ignore-missing-schemas
done
# Test-only dependency: PyYAML 6.0.3; no chart/runtime dependencies are added.
python3 -m pip install PyYAML==6.0.3
python3 charts/cogenta/ci/verify.py
python3 charts/cogenta/ci/test-secret-retention.py
helm package charts/cogenta --destination /tmp
```

Use `set -o pipefail` in shells to catch render failures in pipelines. The three
fixtures cover bundled PostgreSQL + backup/TLS, external MySQL, and RWX/S3/Redis
HA. Behavior tests also render SQLite and enforce secret separation, container
hardening, selector wiring, retained claims, configuration checksums and invalid
configuration rejection. A loopback-only fake Kubernetes API also verifies that
Helm lookup preserves generated credentials and pod checksums on upgrade; it
accepts only read requests and never contacts a cluster. Kubeconform targets 1.34; ServiceMonitor is skipped when
its external CRD schema is unavailable, rather than claiming CRD validation.

The workflow uses major-pinned actions, Helm 3.19.0 and checksum-verified
kubeconform 0.7.0. PyYAML (maintained at https://github.com/yaml/pyyaml, roughly
800 KiB for a typical Linux wheel) is used only to parse YAML in CI/tests, not
as a direct application or chart dependency. No Node packages or lockfiles change.
Live image execution, CSI behavior, migration races, actual readiness and
`lookup` authorization still require staging verification by the operator.
