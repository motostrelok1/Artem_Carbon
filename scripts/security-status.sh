#!/usr/bin/env bash
# Read-only Artem Carbon host security summary. Does not print visitors' IPs.
set -Eeuo pipefail
LOG="${ARTEMCARBON_ANTI_FLOOD_LOG:-/var/log/nginx/artemcarbon-antiflood.log}"
printf '=== Services ===\n'
for service in nginx ssh fail2ban artems-carbon; do
  printf '%s: ' "$service"
  systemctl is-active "$service" 2>/dev/null || true
done
printf '\n=== Host resources ===\n'
uptime
free -h
df -h / | tail -n 1
printf '\n=== Anti-flood last 1000 requests (aggregated, no IPs) ===\n'
if [[ -r "$LOG" ]]; then
  tail -n 1000 "$LOG" | awk '
    {
      status="unknown"; req="unknown"; conn="unknown";
      for (i=1; i<=NF; i++) {
        if ($i ~ /^status=/) status=substr($i,8);
        if ($i ~ /^req_limit=/) req=substr($i,11);
        if ($i ~ /^conn_limit=/) conn=substr($i,12);
      }
      codes[status]++;
      request[req]++;
      connections[conn]++;
      total++;
    }
    END {
      print "requests=" total+0;
      for (k in codes) print "http_" k "=" codes[k];
      for (k in request) print "req_limit_" k "=" request[k];
      for (k in connections) print "conn_limit_" k "=" connections[k];
    }
  ' | sort
else
  echo 'Anti-flood log is not readable; try sudo. Do not paste raw logs with buyer IPs.'
fi
printf '\n=== SSH jail (aggregated) ===\n'
if command -v fail2ban-client >/dev/null; then
  fail2ban-client status sshd 2>/dev/null | sed -n '/Currently failed:/p;/Total failed:/p;/Currently banned:/p;/Total banned:/p' || true
else
  echo 'Fail2ban not installed.'
fi
