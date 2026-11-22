#!/usr/bin/env python3
"""Artem Carbon read-only host checks with deduplicated email / Telegram alerts.

Standard library only; no passwords, buyer IPs, request paths or notification tokens
are written to logs or state. Designed to run under a systemd timer as root.
"""
import datetime as dt
import json
from email.message import EmailMessage
import smtplib
import ssl
import os
import sys
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request

SERVICES = ("nginx", "postgresql", "artems-carbon", "fail2ban", "ssh")
URLS = {
    "website": "https://artemcarbon.ru/",
    "api": "https://api.artemcarbon.ru/health",
}
LOG_PATH = Path("/var/log/nginx/artemcarbon-antiflood.log")
STATE_PATH = Path("/var/lib/artemcarbon-monitor/state.json")
TIME_WINDOW_SECONDS = 300
# Conservative absolute thresholds for rolling five-minute window.
MAX_5XX = 5
MAX_429 = 20
MAX_SSH_NEW_BANS = 10
MAX_MEMORY_PERCENT = 90
MAX_DISK_PERCENT = 85
MAX_LOG_LINES = 15000
# Short spikes are ephemeral: react on the first qualifying 5-minute sample.
IMMEDIATE_ALERT_KEYS = frozenset(("nginx:5xx", "nginx:429", "sshd:bans"))


def command(*args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=7, check=False)
        return result.returncode, result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return 1, ""


def fetch_ok(url):
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "ArtemCarbon-Monitor/1.0"})
        with urllib.request.urlopen(request, timeout=7) as response:
            return 200 <= response.status < 400
    except Exception:
        return False


def memory_percent():
    try:
        data = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                data[key] = int(value.split()[0])
        total, available = data["MemTotal"], data["MemAvailable"]
        return round((1 - available / total) * 100) if total else None
    except (OSError, KeyError, ValueError, ZeroDivisionError):
        return None


def rate_counts(now):
    counts = {"5xx": 0, "429": 0}
    try:
        from collections import deque
        with LOG_PATH.open(encoding="utf-8", errors="replace") as logfile:
            last_lines = deque(logfile, maxlen=MAX_LOG_LINES)
        for line in last_lines:
            # Never retain, return, or log client IP addresses.
            match = re.search(r"\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d)\]", line)
            status = re.search(r"\bstatus=(\d{3})\b", line)
            if not match or not status:
                continue
            stamp = dt.datetime.fromisoformat(match.group(1))
            age = (now - stamp).total_seconds()
            if age < 0 or age > TIME_WINDOW_SECONDS:
                continue
            code = int(status.group(1))
            if code >= 500:
                counts["5xx"] += 1
            if code == 429:
                counts["429"] += 1
    except OSError:
        return None
    return counts


def total_bans():
    code, output = command("fail2ban-client", "status", "sshd")
    if code:
        return None
    match = re.search(r"Total banned:\s*(\d+)", output)
    return int(match.group(1)) if match else None


def load_state():
    try:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError):
        return {}


def save_state(state):
    STATE_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".monitor-", dir=STATE_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(state, file, ensure_ascii=False, sort_keys=True)
            file.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, STATE_PATH)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def telegram_send(message):
    token = os.getenv("ARTEM_MONITOR_BOT_TOKEN", "").strip()
    chat_id = os.getenv("ARTEM_MONITOR_CHAT_ID", "").strip()
    if not token or not chat_id:
        return False
    body = urllib.parse.urlencode({"chat_id": chat_id, "text": message,
                                   "disable_web_page_preview": "true"}).encode()
    request = urllib.request.Request(
        "https://api.telegram.org/bot" + token + "/sendMessage",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.load(response)
            return response.status == 200 and payload.get("ok") is True
    except Exception:
        # Do not print exceptions: they may contain the bot token in the URL.
        return False



def email_send(message):
    """SMTP with verified TLS; no secrets or detailed exceptions in logs.

    Only explicit configuration enables sending. Prefer SMTPS (465) or
    STARTTLS (587); refuse unauthenticated plaintext delivery.
    """
    host = os.getenv("ARTEM_MONITOR_SMTP_HOST", "").strip()
    username = os.getenv("ARTEM_MONITOR_SMTP_USER", "").strip()
    password = os.getenv("ARTEM_MONITOR_SMTP_PASSWORD", "")
    sender = os.getenv("ARTEM_MONITOR_SMTP_FROM", "").strip()
    recipient = os.getenv("ARTEM_MONITOR_EMAIL_TO", "motostrelok@yandex.ru").strip()
    try:
        port = int(os.getenv("ARTEM_MONITOR_SMTP_PORT", "465"))
    except ValueError:
        return False
    if not all((host, username, password, sender, recipient)) or port not in (465, 587):
        return False

    subject = ("[Artem Carbon] Восстановление" if "ВОССТАНОВЛЕНО" in message
               else "[Artem Carbon] Аварийное уведомление")
    letter = EmailMessage()
    letter["From"] = sender
    letter["To"] = recipient
    letter["Subject"] = subject
    letter.set_content(message, charset="utf-8")
    context = ssl.create_default_context()
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=10, context=context) as client:
                client.login(username, password)
                client.send_message(letter)
        else:
            with smtplib.SMTP(host, port, timeout=10) as client:
                client.ehlo()
                client.starttls(context=context)
                client.ehlo()
                client.login(username, password)
                client.send_message(letter)
        return True
    except (OSError, smtplib.SMTPException, ssl.SSLError, ValueError):
        # Exceptions may include credentials or private transport details.
        return False


def alert_send(message):
    """Email is primary. Fall back to Telegram only when email fails."""
    if email_send(message):
        return True
    return telegram_send(message)


def observations(now, state):
    problems = {}
    for service in SERVICES:
        code, output = command("systemctl", "is-active", service)
        if code or output.strip() != "active":
            problems["service:" + service] = "Служба " + service + " остановлена"
    for name, url in URLS.items():
        if not fetch_ok(url):
            problems["site:" + name] = ("Сайт недоступен" if name == "website"
                                         else "API недоступен")
    disk = shutil.disk_usage("/")
    disk_pct = round(100 * disk.used / disk.total) if disk.total else 0
    if disk_pct >= MAX_DISK_PERCENT:
        problems["disk"] = "Диск заполнен на " + str(disk_pct) + "%"
    mem_pct = memory_percent()
    if mem_pct is None:
        problems["memory:unknown"] = "Невозможно измерить использование памяти"
    elif mem_pct >= MAX_MEMORY_PERCENT:
        problems["memory"] = "Память занята на " + str(mem_pct) + "%"
    counts = rate_counts(now)
    if counts is None:
        problems["nginx:logs"] = "Журнал Nginx недоступен"
    else:
        if counts["5xx"] >= MAX_5XX:
            problems["nginx:5xx"] = "HTTP 5xx за 5 минут: " + str(counts["5xx"])
        if counts["429"] >= MAX_429:
            problems["nginx:429"] = "HTTP 429 за 5 минут: " + str(counts["429"])
    bans = total_bans()
    previous = state.get("last_ssh_bans")
    if bans is None:
        problems["sshd:metrics"] = "Недоступна статистика блокировок Fail2ban"
    else:
        if isinstance(previous, int) and bans >= previous:
            diff = bans - previous
            if diff >= MAX_SSH_NEW_BANS:
                problems["sshd:bans"] = "Новых блокировок SSH: " + str(diff) + " за проверку"
        state["last_ssh_bans"] = bans
    return problems


def main():
    now = dt.datetime.now(dt.timezone.utc)
    state = load_state()
    problems = observations(now, state)
    issues = state.setdefault("issues", {})
    active_keys = set(problems)
    # Removed metrics are no longer problematic; allow a fresh incident in future.
    for key in set(issues) | active_keys:
        incident = issues.setdefault(key, {"bad": 0, "alerted": False})
        if key in problems:
            incident["bad"] = min(incident.get("bad", 0) + 1, 10000)
            required_checks = 1 if key in IMMEDIATE_ALERT_KEYS else 2
            if incident["bad"] >= required_checks and not incident.get("alerted", False):
                message = "🚨 Artem Carbon — ПРОБЛЕМА\n" + problems[key]
                if alert_send(message):
                    incident["alerted"] = True
                    print("Alert sent:", key)
                else:
                    print("Alert pending (email/Telegram not configured or unavailable):", key)
        else:
            if incident.get("alerted", False):
                if alert_send("✅ Artem Carbon — ВОССТАНОВЛЕНО\n" + key):
                    issues.pop(key, None)
                    print("Recovery sent:", key)
                else:
                    print("Recovery pending:", key)
            else:
                issues.pop(key, None)
    save_state(state)
    print("Monitoring complete: " + str(len(problems)) + " issue(s), " +
          str(sum(1 for issue in issues.values() if issue.get("alerted"))) + " alert(s) active")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--test-email":
        if email_send("✅ Artem Carbon — тест мониторинга Email"):
            print("Email test sent")
        else:
            print("Email test failed; check SMTP settings and outbound access")
            sys.exit(1)
    elif len(sys.argv) == 2 and sys.argv[1] == "--test-telegram":
        if telegram_send("✅ Artem Carbon — тест мониторинга Telegram"):
            print("Telegram test sent")
        else:
            print("Telegram test failed; check token, chat ID and outbound access")
            sys.exit(1)
    elif len(sys.argv) == 1:
        main()
    else:
        print("Usage: check.py [--test-email | --test-telegram]", file=sys.stderr)
        sys.exit(2)
