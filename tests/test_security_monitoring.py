#!/usr/bin/env python3
"""Safety checks for staged SSH Fail2ban and aggregate-only monitoring."""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JAIL = ROOT / "config/fail2ban/jail.d/artemcarbon-sshd.local"
MONITOR = ROOT / "scripts/security-status.sh"
DEPLOY = ROOT / "scripts/deploy-full-vds.sh"

class SecurityMonitoringTests(unittest.TestCase):
    def test_ssh_only_fail2ban_jail(self):
        content = JAIL.read_text(encoding="utf-8")
        self.assertIn("[sshd]", content)
        self.assertIn("backend = systemd", content)
        self.assertIn("enabled = true", content)
        self.assertIn("maxretry = 5", content)
        self.assertIn("findtime = 10m", content)
        self.assertIn("bantime = 1h", content)
        self.assertNotIn("[nginx", content.lower())
        self.assertNotIn("http 429", content.lower().split("[sshd]")[-1])
        self.assertEqual(content.count("\n["), 1)

    def test_monitor_is_aggregated_read_only(self):
        monitor = MONITOR.read_text(encoding="utf-8")
        subprocess.run(["bash", "-n", str(MONITOR)], check=True)
        self.assertIn("tail -n 1000", monitor)
        self.assertIn("codes[status]++", monitor)
        self.assertIn("status sshd", monitor)
        self.assertNotIn("$remote_addr", monitor)
        self.assertNotIn("fail2ban-client banip", monitor)
        self.assertNotIn("systemctl restart", monitor)

    def test_not_auto_installed_by_production_deploy(self):
        deploy = DEPLOY.read_text(encoding="utf-8")
        self.assertNotIn("systemctl enable fail2ban", deploy)
        self.assertNotIn("systemctl restart fail2ban", deploy)

if __name__ == "__main__":
    unittest.main()
