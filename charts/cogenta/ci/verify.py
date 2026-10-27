#!/usr/bin/env python3
"""Offline chart behavior and security checks; never connects to Kubernetes."""
import base64
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

import yaml

CHART = Path(__file__).resolve().parents[1]
HELM = os.environ.get("HELM", "helm")


class UniqueKeyLoader(yaml.SafeLoader):
    """Reject duplicate manifest keys instead of silently accepting overrides."""


def unique_mapping(loader, node):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if key in result:
            raise ValueError(f"Duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node)
    return result


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping
)


def render(values=None, fixture=None, extra_args=(), success=True):
    with tempfile.TemporaryDirectory(prefix="cogenta-helm-") as directory:
        command = [HELM, "template", "test", str(CHART), "--namespace", "cms", "--kube-version", "1.34.0"]
        if fixture:
            command += ["-f", str(CHART / "ci" / fixture)]
        if values is not None:
            path = Path(directory) / "values.yaml"
            path.write_text(yaml.safe_dump(values))
            command += ["-f", str(path)]
        result = subprocess.run(command + list(extra_args), capture_output=True, text=True, check=False)
    if success:
        if result.returncode:
            raise AssertionError(result.stderr)
        return [item for item in yaml.load_all(result.stdout, Loader=UniqueKeyLoader) if item]
    if not result.returncode:
        raise AssertionError("Unsafe or invalid values were accepted")
    return result.stderr


def resource(documents, kind):
    return next(item for item in documents if item["kind"] == kind)


def pod_specs(documents):
    for item in documents:
        if item["kind"] == "Pod":
            yield item["spec"]
        elif item["kind"] in {"Deployment", "StatefulSet"}:
            yield item["spec"]["template"]["spec"]
        elif item["kind"] == "CronJob":
            yield item["spec"]["jobTemplate"]["spec"]["template"]["spec"]


class ChartBehavior(unittest.TestCase):
    def assert_hardened(self, documents):
        for spec in pod_specs(documents):
            self.assertIs(spec["automountServiceAccountToken"], False)
            self.assertEqual(spec["serviceAccountName"], "test-cogenta")
            pod_security = spec["securityContext"]
            self.assertIs(pod_security["runAsNonRoot"], True)
            self.assertEqual(pod_security["fsGroupChangePolicy"], "OnRootMismatch")
            self.assertEqual(pod_security["seccompProfile"]["type"], "RuntimeDefault")
            for container in spec.get("initContainers", []) + spec["containers"]:
                security = container["securityContext"]
                self.assertIs(security["runAsNonRoot"], True)
                self.assertIs(security["readOnlyRootFilesystem"], True)
                self.assertIs(security["allowPrivilegeEscalation"], False)
                self.assertEqual(security["capabilities"]["drop"], ["ALL"])
                self.assertEqual(security["seccompProfile"]["type"], "RuntimeDefault")
                expected_uid = 70 if container["name"] in {"postgresql", "pg-dump"} else 10001
                self.assertEqual(security["runAsUser"], expected_uid)
                self.assertEqual(security["runAsGroup"], expected_uid)
                self.assertEqual(pod_security["fsGroup"], expected_uid)
                self.assertIn("requests", container["resources"])

    def assert_secrets_isolated(self, documents):
        secrets = [item for item in documents if item["kind"] == "Secret"]
        plaintext = [base64.b64decode(value).decode() for item in secrets for value in item["data"].values()]
        for item in documents:
            if item["kind"] == "ConfigMap":
                for key, value in item["data"].items():
                    self.assertIsNone(re.search(r"PASSWORD|SIGNING_KEY|DATABASE_URL|ACCESS_KEY|SECRET|TOKEN|API_KEY", key))
                    self.assertIsInstance(value, str)
                    for secret in plaintext:
                        self.assertNotIn(secret, value)

    def test_all_profiles_keep_credentials_out_of_configmaps_and_harden_every_container(self):
        for fixture in [None, "default.yaml", "external-db.yaml", "ha-s3.yaml"]:
            with self.subTest(fixture=fixture):
                documents = render(fixture=fixture)
                self.assert_hardened(documents)
                self.assert_secrets_isolated(documents)
                for claim in [item for item in documents if item["kind"] == "PersistentVolumeClaim"]:
                    self.assertEqual(claim["metadata"]["annotations"]["helm.sh/resource-policy"], "keep")

    def test_default_install_wires_bootstrap_storage_probes_and_database_credentials(self):
        documents = render()
        deployment = resource(documents, "Deployment")
        self.assertEqual(deployment["spec"]["strategy"], {"type": "Recreate"})
        self.assertEqual(deployment["spec"]["replicas"], 1)
        spec = deployment["spec"]["template"]["spec"]
        bootstrap, app = spec["initContainers"][0], spec["containers"][0]
        self.assertEqual(bootstrap["command"], ["cogenta-entrypoint", "bootstrap"])
        self.assertEqual(app["command"], ["cogenta-entrypoint", "serve"])
        for key in ["image", "env", "envFrom", "volumeMounts"]:
            self.assertEqual(bootstrap[key], app[key])
        self.assertEqual(spec["volumes"][0]["persistentVolumeClaim"]["claimName"], "test-cogenta")
        env = {item["name"]: item for item in app["env"]}
        self.assertIn("$(POSTGRES_PASSWORD)", env["COGENTA_DATABASE_URL"]["value"])
        self.assertLess([item["name"] for item in app["env"]].index("POSTGRES_PASSWORD"), [item["name"] for item in app["env"]].index("COGENTA_DATABASE_URL"))
        self.assertEqual(env["POSTGRES_PASSWORD"]["valueFrom"]["secretKeyRef"]["name"], "test-cogenta-postgresql")
        self.assertEqual(app["startupProbe"]["httpGet"]["path"], "/livez")
        self.assertEqual(app["livenessProbe"]["httpGet"]["path"], "/livez")
        self.assertEqual(app["readinessProbe"]["httpGet"]["path"], "/readyz")
        self.assertNotIn("cpu", app["resources"]["limits"])
        self.assertNotIn("PodDisruptionBudget", [item["kind"] for item in documents])
        self.assertNotIn("HorizontalPodAutoscaler", [item["kind"] for item in documents])
        postgres = resource(documents, "StatefulSet")["spec"]["template"]["spec"]
        self.assertEqual(postgres["containers"][0]["image"], "postgres:17-alpine")
        self.assertIn("127.0.0.1", postgres["containers"][0]["readinessProbe"]["exec"]["command"])

    def test_external_mysql_and_sqlite_profiles_create_no_postgresql_resources(self):
        for driver in ["mysql", "sqlite", "postgres"]:
            documents = render({"externalDatabase": {"driver": driver}}, fixture="external-db.yaml")
            self.assertNotIn("StatefulSet", [item["kind"] for item in documents])
            self.assertFalse([item for item in documents if item["kind"] in {"Secret", "PersistentVolumeClaim"}])
            self.assertEqual(resource(documents, "ConfigMap")["data"]["COGENTA_DATABASE_DRIVER"], driver)
            app = resource(documents, "Deployment")["spec"]["template"]["spec"]["containers"][0]
            url = next(item for item in app["env"] if item["name"] == "COGENTA_DATABASE_URL")
            self.assertEqual(url["valueFrom"]["secretKeyRef"], {"name": "cogenta-mysql-private", "key": "database-url"})

    def test_backup_writes_only_to_its_own_volume_and_limits_postgresql_ingress(self):
        documents = render(fixture="default.yaml")
        cron = resource(documents, "CronJob")
        self.assertEqual(cron["spec"]["concurrencyPolicy"], "Forbid")
        spec = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]
        self.assertEqual(spec["volumes"][0]["persistentVolumeClaim"]["claimName"], "test-cogenta-backup")
        self.assertNotIn("/data", [mount["mountPath"] for mount in spec["containers"][0]["volumeMounts"]])
        script = spec["containers"][0]["args"][0]
        self.assertIn("pg_dump -Fc", script)
        self.assertIn("pg_restore --list", script)
        self.assertIn("-mtime +7", script)
        policies = [item for item in documents if item["kind"] == "NetworkPolicy"]
        postgres = next(item for item in policies if item["metadata"]["name"].endswith("-postgresql"))
        peers = postgres["spec"]["ingress"][0]["from"]
        self.assertEqual({peer["podSelector"]["matchLabels"]["app.kubernetes.io/component"] for peer in peers}, {"app", "backup"})
        for peer in peers:
            self.assertEqual(peer["podSelector"]["matchLabels"]["app.kubernetes.io/instance"], "test")
        app_policy = next(item for item in policies if item["metadata"]["name"] == "test-cogenta")
        self.assertEqual(app_policy["spec"]["egress"], [{}])
        namespace = app_policy["spec"]["ingress"][0]["from"][0]["namespaceSelector"]["matchLabels"]
        self.assertEqual(namespace["kubernetes.io/metadata.name"], "kube-system")

    def test_ha_profile_enables_scaling_budget_monitoring_and_tls(self):
        documents = render(fixture="ha-s3.yaml")
        deployment = resource(documents, "Deployment")
        self.assertNotIn("replicas", deployment["spec"])
        self.assertEqual(deployment["spec"]["strategy"]["type"], "RollingUpdate")
        self.assertEqual(resource(documents, "HorizontalPodAutoscaler")["spec"]["minReplicas"], 3)
        self.assertEqual(resource(documents, "PodDisruptionBudget")["spec"]["maxUnavailable"], 1)
        monitor = resource(documents, "ServiceMonitor")
        services = [item for item in documents if item["kind"] == "Service"]
        self.assertEqual(len([service for service in services if all(service["metadata"]["labels"].get(k) == v for k, v in monitor["spec"]["selector"]["matchLabels"].items())]), 1)
        ingress = resource(documents, "Ingress")
        self.assertEqual(ingress["metadata"]["annotations"]["cert-manager.io/cluster-issuer"], "letsencrypt-prod")
        self.assertEqual(ingress["spec"]["tls"][0]["hosts"], ["cms.example.com"])
        for minimum, expected in [(1, False), (2, True)]:
            scaled = render({"autoscaling": {"minReplicas": minimum}}, fixture="ha-s3.yaml")
            self.assertEqual(any(item["kind"] == "PodDisruptionBudget" for item in scaled), expected)

    def test_changes_to_configuration_and_credentials_change_the_rollout_checksums(self):
        fixed = {"secrets": {"authSigningKey": "a" * 64, "previewSigningKey": "b" * 64, "adminPassword": "c" * 32}, "postgresql": {"password": "d" * 32}}
        def annotations(values, upgrade=False):
            documents = render(values, extra_args=["--is-upgrade"] if upgrade else [])
            return resource(documents, "Deployment")["spec"]["template"]["metadata"]["annotations"]
        # Changing only the app image must not restart the bundled database.
        before_db = resource(render(fixed), "StatefulSet")["spec"]["template"]
        after_db = resource(render(dict(fixed, image={"tag": "next-release"})), "StatefulSet")["spec"]["template"]
        self.assertEqual(before_db, after_db)
        original = annotations(fixed)
        self.assertEqual(original, annotations(fixed, upgrade=True))
        configured = dict(fixed, site={"name": "Another site"})
        self.assertNotEqual(original["checksum/config"], annotations(configured)["checksum/config"])
        changed = dict(fixed, secrets=dict(fixed["secrets"], authSigningKey="e" * 64))
        self.assertNotEqual(original["checksum/secret"], annotations(changed)["checksum/secret"])
        changed = dict(fixed, postgresql={"password": "f" * 32})
        self.assertNotEqual(original["checksum/postgresql-secret"], annotations(changed)["checksum/postgresql-secret"])
        changed = dict(fixed, secretChecksum="rotated")
        self.assertNotEqual(original["checksum/existing-secret"], annotations(changed)["checksum/existing-secret"])

    def test_optional_scheduling_mounts_claims_and_restricted_egress_are_rendered(self):
        values = {
            "postgresql": {"existingSecret": "database-private", "persistence": {"existingClaim": "database-data"}},
            "backup": {"enabled": True, "persistence": {"existingClaim": "backup-data"}},
            "persistence": {"storageClass": "-"},
            "priorityClassName": "critical-site", "nodeSelector": {"disk": "ssd"},
            "tolerations": [{"key": "site", "operator": "Exists"}],
            "affinity": {"podAntiAffinity": {"preferredDuringSchedulingIgnoredDuringExecution": []}},
            "podAnnotations": {"example.com/annotation": "present"}, "podLabels": {"team": "cms"},
            "extraEnv": [{"name": "COGENTA_LLM_API_KEY", "valueFrom": {"secretKeyRef": {"name": "llm", "key": "api-key"}}}],
            "extraVolumes": [{"name": "custom", "emptyDir": {}}],
            "extraVolumeMounts": [{"name": "custom", "mountPath": "/custom"}],
            "networkPolicy": {"egress": [{"ports": [{"port": 53, "protocol": "UDP"}]}]},
            "ingress": {"annotations": {"cert-manager.io/cluster-issuer": "custom-issuer"}},
        }
        documents = render(values)
        deployment = resource(documents, "Deployment")
        spec = deployment["spec"]["template"]["spec"]
        self.assertEqual(spec["priorityClassName"], "critical-site")
        self.assertEqual(spec["nodeSelector"], {"disk": "ssd"})
        self.assertEqual(spec["containers"][0]["env"], spec["initContainers"][0]["env"])
        self.assertEqual(spec["containers"][0]["volumeMounts"][-1]["mountPath"], "/custom")
        self.assertEqual(resource(documents, "PersistentVolumeClaim")["spec"]["storageClassName"], "")
        policies = [item for item in documents if item["kind"] == "NetworkPolicy"]
        self.assertEqual(policies[0]["spec"]["egress"], values["networkPolicy"]["egress"])
        self.assertEqual(len([item for item in documents if item["kind"] == "Secret"]), 1)
        self.assert_hardened(documents)

    def test_unsafe_storage_scaling_secret_and_override_combinations_fail_early(self):
        cases = [
            ({"replicaCount": 2}, "ReadWriteMany"),
            ({"autoscaling": {"enabled": True}}, "ReadWriteMany"),
            ({"storage": {"driver": "s3", "bucket": "media"}, "replicaCount": 2}, "ReadWriteMany"),
            ({"strategy": {"type": "RollingUpdate"}}, "RollingUpdate requires"),
            ({"postgresql": {"enabled": False}}, "database URL"),
            ({"postgresql": {"enabled": False}, "existingSecret": "private", "backup": {"enabled": True}}, "built-in PostgreSQL"),
            ({"postgresql": {"enabled": False}, "existingSecret": "private", "externalDatabase": {"driver": "sqlite"}, "persistence": {"accessMode": "ReadWriteMany"}, "replicaCount": 2}, "SQLite supports"),
            ({"storage": {"driver": "s3"}}, "storage.bucket"),
            ({"site": {"defaultLocale": "fr"}}, "site.defaultLocale"),
            ({"autoscaling": {"minReplicas": 5, "maxReplicas": 2}}, "minReplicas"),
            ({"podLabels": {"app.kubernetes.io/component": "postgresql"}}, "reserved"),
            ({"podAnnotations": {"checksum/config": "override"}}, "reserved"),
            ({"serviceMonitor": {"labels": {"app.kubernetes.io/name": "override"}}}, "reserved"),
            ({"extraEnv": [{"name": "COGENTA_DATABASE_URL", "value": "override"}]}, "chart-managed"),
            ({"extraEnv": [{"name": "DUPLICATE", "value": "one"}, {"name": "DUPLICATE", "value": "two"}]}, "duplicate"),
            ({"extraVolumes": [{"name": "data", "emptyDir": {}}]}, "override data"),
            ({"extraVolumeMounts": [{"name": "data", "mountPath": "/custom"}]}, "override /data"),
        ]
        for values, expected in cases:
            with self.subTest(values=values):
                self.assertIn(expected, render(values, success=False))

    def test_schema_rejects_typos_invalid_types_and_credential_leaks(self):
        cases = [
            {"replicas": 2}, {"replicaCount": 0}, {"replicaCount": "two"},
            {"postgresql": {"password": "contains:@reserved"}},
            {"externalDatabase": {"driver": "mongodb"}}, {"site": {"url": "https://" + "user:password" + "@example.com"}},
            {"persistence": {"size": "invalid"}}, {"site": {"locales": []}},
            {"extraEnvFrom": [{"configMapRef": {"name": "secrets"}}]},
            {"resources": {"requests": {"memory": "invalid"}}},
            {"secrets": {"authSigningKey": "short"}},
        ]
        for values in cases:
            with self.subTest(values=values):
                self.assertIn("schema", render(values, success=False))

    def test_yaml_boolean_shaped_names_remain_strings(self):
        documents = render({"fullnameOverride": "true", "nameOverride": "false", "existingSecret": "null"})
        for item in documents:
            self.assertIsInstance(item["metadata"]["name"], str)
            for value in item["metadata"].get("labels", {}).values():
                self.assertIsInstance(value, str)
        spec = resource(documents, "Deployment")["spec"]["template"]["spec"]
        self.assertEqual(spec["serviceAccountName"], "true")
        self.assertEqual(spec["containers"][0]["env"][0]["valueFrom"]["secretKeyRef"]["name"], "null")

    def test_maximum_length_release_names_still_leave_cronjob_suffix_room(self):
        # Helm limits release names to 53 chars; CronJob names must be <= 52.
        command = [HELM, "template", "r" * 53, str(CHART), "--set", "backup.enabled=true"]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        documents = [item for item in yaml.load_all(result.stdout, Loader=UniqueKeyLoader) if item]
        self.assertLessEqual(len(resource(documents, "CronJob")["metadata"]["name"]), 52)


if __name__ == "__main__":
    unittest.main(verbosity=2)
