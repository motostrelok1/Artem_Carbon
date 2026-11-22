#!/usr/bin/env python3
"""Regression checks for five-minute local monitoring (no external calls)."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/monitoring/check.py"
UNIT = ROOT / "config/systemd/artemcarbon-monitor.service"
TIMER = ROOT / "config/systemd/artemcarbon-monitor.timer"
DEPLOY = ROOT / "scripts/deploy-full-vds.sh"

spec = importlib.util.spec_from_file_location("artemcarbon_monitor", SCRIPT)
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class MonitorTests(unittest.TestCase):
    def test_timer_and_deploy_are_safe(self):
        unit = UNIT.read_text(encoding="utf-8")
        timer = TIMER.read_text(encoding="utf-8")
        deploy = DEPLOY.read_text(encoding="utf-8")
        self.assertIn("OnCalendar=*:0/5", timer)
        self.assertIn("Persistent=true", timer)
        self.assertIn("EnvironmentFile=-/etc/artemcarbon-monitor.env", unit)
        self.assertIn("StateDirectory=artemcarbon-monitor", unit)
        self.assertIn("ProtectSystem=strict", unit)
        self.assertIn("ExecStart=/usr/bin/python3", unit)
        self.assertIn("systemctl enable --now artemcarbon-monitor.timer", deploy)
        self.assertNotIn("ufw allow", deploy)
        self.assertNotIn("fail2ban-client banip", deploy)

    def test_log_counts_are_windowed_without_using_ips(self):
        now = dt.datetime(2026, 11, 22, 16, 55, 0, tzinfo=dt.timezone.utc)
        current = (now - dt.timedelta(seconds=10)).isoformat(timespec="seconds")
        old = (now - dt.timedelta(minutes=9)).isoformat(timespec="seconds")
        with tempfile.TemporaryDirectory() as td:
            log = Path(td) / "requests.log"
            log.write_text(
                f'1.2.3.4 [{current}] api.artemcarbon.ru "GET /api/test" status=429 req=0.1 req_limit=REJECTED\n'
                + f'1.2.3.4 [{current}] api.artemcarbon.ru "GET /api/test" status=503 req=0.1 req_limit=PASSED\n'
                + f'1.2.3.4 [{old}] api.artemcarbon.ru "GET /api/test" status=500 req=0.1 req_limit=PASSED\n'
            )
            with mock.patch.object(monitor, "LOG_PATH", log):
                self.assertEqual(monitor.rate_counts(now), {"5xx": 1, "429": 1})

    def test_alert_after_two_failures_and_recovery_only_once(self):
        with tempfile.TemporaryDirectory() as td:
            state_path = Path(td) / "state.json"
            service_up = False
            messages = []

            def fake_observations(now, state):
                return {"service:nginx": "Служба nginx остановлена"} if not service_up else {}

            def fake_telegram(message):
                messages.append(message)
                return True

            with mock.patch.object(monitor, "STATE_PATH", state_path), \
                 mock.patch.object(monitor, "observations", side_effect=fake_observations), \
                 mock.patch.object(monitor, "telegram_send", side_effect=fake_telegram):
                monitor.main()
                self.assertEqual(messages, [])
                monitor.main()
                self.assertEqual(len(messages), 1)
                monitor.main()
                self.assertEqual(len(messages), 1)
                service_up = True
                monitor.main()
                self.assertEqual(len(messages), 2)
                self.assertIn("ВОССТАНОВЛЕНО", messages[-1])
                monitor.main()
                self.assertEqual(len(messages), 2)
                stored = json.loads(state_path.read_text())
                self.assertEqual(stored["issues"], {})

    def test_telegram_without_credentials_makes_no_requests(self):
        with mock.patch.dict(monitor.os.environ, {}, clear=True), \
             mock.patch.object(monitor.urllib.request, "urlopen") as opener:
            self.assertFalse(monitor.telegram_send("test"))
            opener.assert_not_called()

    def test_no_customer_addresses_in_alert_messages(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("print(line)", source)
        self.assertNotIn("print(token)", source)
        self.assertNotIn("status sshd --all", source)


if __name__ == "__main__":
    unittest.main()
