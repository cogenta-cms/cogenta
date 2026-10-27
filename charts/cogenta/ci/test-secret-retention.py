#!/usr/bin/env python3
"""Exercise Helm lookup against a loopback-only, read-only fake API, never a cluster."""
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import sys
import threading
import unittest
from urllib.parse import urlsplit

sys.dont_write_bytecode = True

from verify import render, resource


class SecretRetention(unittest.TestCase):
    def setUp(self):
        self.generated = render()
        self.secrets = {
            item["metadata"]["name"]: item
            for item in self.generated if item["kind"] == "Secret"
        }
        self.requests = []
        secrets, requests = self.secrets, self.requests

        class FakeApi(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                path = urlsplit(self.path).path
                requests.append(path)
                if path == "/version":
                    data = {"major": "1", "minor": "34", "gitVersion": "v1.34.0"}
                elif path == "/api":
                    data = {"kind": "APIVersions", "apiVersion": "v1", "versions": ["v1"]}
                elif path == "/apis":
                    data = {"kind": "APIGroupList", "apiVersion": "v1", "groups": []}
                elif path == "/api/v1":
                    data = {"kind": "APIResourceList", "apiVersion": "v1", "groupVersion": "v1", "resources": [
                        {"name": "secrets", "singularName": "secret", "namespaced": True, "kind": "Secret", "verbs": ["get"]}
                    ]}
                elif path.startswith("/api/v1/namespaces/cms/secrets/") and path.rsplit("/", 1)[-1] in secrets:
                    data = secrets[path.rsplit("/", 1)[-1]]
                else:
                    self.send_error(404)
                    return
                body = json.dumps(data).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeApi)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.directory = tempfile.TemporaryDirectory(prefix="cogenta-fake-api-")
        self.kubeconfig = Path(self.directory.name) / "kubeconfig"
        self.kubeconfig.write_text(json.dumps({
            "apiVersion": "v1", "kind": "Config", "current-context": "fake-only",
            "clusters": [{"name": "fake", "cluster": {"server": f"http://127.0.0.1:{self.server.server_port}"}}],
            "contexts": [{"name": "fake-only", "context": {"cluster": "fake", "user": "fake"}}],
            "users": [{"name": "fake", "user": {}}],
        }))
        self.kubeconfig.chmod(0o600)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()

    def upgrade(self, values=None, success=True):
        return render(values, extra_args=["--is-upgrade", "--dry-run=server", "--kubeconfig", str(self.kubeconfig)], success=success)

    def test_live_lookup_preserves_all_generated_credentials_and_pod_checksums(self):
        upgraded = self.upgrade()
        for item in upgraded:
            if item["kind"] == "Secret":
                self.assertEqual(item["data"], self.secrets[item["metadata"]["name"]]["data"])
        before = resource(self.generated, "Deployment")["spec"]["template"]["metadata"]["annotations"]
        after = resource(upgraded, "Deployment")["spec"]["template"]["metadata"]["annotations"]
        self.assertEqual(before, after)
        self.assertIn("/api/v1/namespaces/cms/secrets/test-cogenta", self.requests)
        self.assertIn("/api/v1/namespaces/cms/secrets/test-cogenta-postgresql", self.requests)

    def test_lookup_rejects_reserved_characters_in_an_existing_postgresql_password(self):
        self.secrets["external-db"] = {
            "apiVersion": "v1", "kind": "Secret", "metadata": {"name": "external-db"},
            "data": {"postgres-password": base64.b64encode("reserved:character".encode()).decode()},
        }
        message = self.upgrade({"postgresql": {"existingSecret": "external-db"}}, success=False)
        self.assertIn("URI-unreserved", message)


if __name__ == "__main__":
    unittest.main(verbosity=2)
