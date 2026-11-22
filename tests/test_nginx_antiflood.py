#!/usr/bin/env python3
"""Static contract and isolated nginx -t for Artem Carbon anti-flood rollout."""
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "scripts/deploy-full-vds.sh"
ZONES = ROOT / "config/nginx/artemcarbon-antiflood.conf"

def get_vhost():
    script = DEPLOY.read_text(encoding="utf-8")
    match = re.search(
        r"cat > /etc/nginx/sites-available/artemcarbon\.ru <<'NGINX'\n(.*?)\nNGINX",
        script, re.S
    )
    if not match:
        raise AssertionError("Expected the tracked production Nginx vhost heredoc")
    return match.group(1)

class AntiFloodConfigTests(unittest.TestCase):
    def test_deployment_contract(self):
        script = DEPLOY.read_text(encoding="utf-8")
        zones = ZONES.read_text(encoding="utf-8")
        vhost = get_vhost()
        subprocess.run(["bash", "-n", str(DEPLOY)], check=True)
        self.assertIn("limit_req_zone $binary_remote_addr zone=ac_api:10m rate=8r/s;", zones)
        self.assertIn("limit_req_zone $binary_remote_addr zone=ac_admin_login:10m rate=5r/m;", zones)
        self.assertIn("limit_conn_zone $binary_remote_addr zone=ac_api_connections:10m;", zones)
        self.assertEqual(vhost.count("location ^~ /api/ {"), 2)
        self.assertEqual(vhost.count("location = /api/admin/login {"), 2)
        self.assertEqual(vhost.count("location = /api/payments/tbank/notification {"), 2)
        self.assertEqual(vhost.count("limit_req zone=ac_api burst=20;"), 2)
        self.assertEqual(vhost.count("limit_req zone=ac_admin_login burst=3;"), 2)
        self.assertEqual(vhost.count("limit_req_dry_run on;"), 4)
        self.assertEqual(vhost.count("limit_conn_dry_run on;"), 4)
        self.assertEqual(vhost.count("access_log /var/log/nginx/artemcarbon-antiflood.log ac_antiflood;"), 6)
        self.assertIn("restore_nginx_config", script)
        self.assertIn("nginx -t", script)
        self.assertIn("systemctl reload nginx", script)
        # No rate limits on the signed T-Bank webhook. Keep bank retries working.
        for loc in re.findall(
            r"location = /api/payments/tbank/notification \{(.*?)\n    \}", vhost, re.S
        ):
            self.assertNotIn("limit_req ", loc)
            self.assertNotIn("limit_conn ", loc)
            self.assertIn("proxy_pass http://127.0.0.1:3002;", loc)
        self.assertIn("location ^~ /.well-known/acme-challenge/", vhost)
        self.assertIn("server_name www.artemcarbon.ru;", vhost)

    @unittest.skipUnless(shutil.which("nginx") and shutil.which("openssl"), "Nginx and OpenSSL are required")
    def test_nginx_syntax_with_isolated_certificate(self):
        vhost = get_vhost()
        zones = ZONES.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory(prefix="artemcarbon-nginx-test-") as dirname:
            tmp = Path(dirname)
            key = tmp / "key.pem"
            cert = tmp / "cert.pem"
            subprocess.run([
                "openssl", "req", "-x509", "-newkey", "rsa:2048",
                "-nodes", "-keyout", str(key), "-out", str(cert),
                "-days", "1", "-subj", "/CN=artemcarbon.ru"
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            vhost = vhost.replace("listen 80;", "listen 18080;")
            vhost = vhost.replace("listen [::]:80;", "listen [::]:18080;")
            vhost = vhost.replace("listen 443 ssl http2;", "listen 18443 ssl http2;")
            vhost = vhost.replace("listen [::]:443 ssl http2;", "listen [::]:18443 ssl http2;")
            vhost = vhost.replace(
                "/etc/letsencrypt/live/artemcarbon.ru/fullchain.pem", str(cert)
            ).replace(
                "/etc/letsencrypt/live/artemcarbon.ru/privkey.pem", str(key)
            ).replace(
                "/var/log/nginx/artemcarbon-antiflood.log", str(tmp / "access.log")
            )
            (tmp / "zones.conf").write_text(zones, encoding="utf-8")
            (tmp / "vhost.conf").write_text(vhost, encoding="utf-8")
            (tmp / "nginx.conf").write_text(
                "worker_processes 1;\n"
                f"pid {tmp / 'nginx.pid'};\n"
                f"error_log {tmp / 'error.log'} notice;\n"
                "events { worker_connections 128; }\n"
                f"http {{ include {tmp / 'zones.conf'}; include {tmp / 'vhost.conf'}; }}\n",
                encoding="utf-8",
            )
            subprocess.run([
                "nginx", "-t", "-p", str(tmp) + "/", "-c", str(tmp / "nginx.conf")
            ], check=True, capture_output=True, text=True)

if __name__ == "__main__":
    unittest.main()
