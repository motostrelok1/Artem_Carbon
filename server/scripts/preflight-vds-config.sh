#!/usr/bin/env bash
# Read-only system/service and secret-presence preflight. Does not source .env.
set -Eeuo pipefail
ENV_FILE="${1:-/opt/artems-carbon/server/.env}"
python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import sys
env=Path(sys.argv[1])
if not env.is_file():
    raise SystemExit('ERROR: server/.env not found')
keys={}
for line in env.read_text(encoding='utf-8').splitlines():
    line=line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    key,val=line.split('=',1)
    keys[key.strip()]=val.strip().strip('"').strip("'")
print('=== Artem Carbon config preflight (no secrets printed) ===')
print('PAYMENTS_ENABLED:', keys.get('PAYMENTS_ENABLED','MISSING'))
for key in ('DATABASE_URL','TBANK_TERMINAL_KEY','TBANK_PASSWORD',
            'TBANK_TAXATION','TBANK_ITEM_TAX','TBANK_API_URL',
            'EMAIL_ENABLED','SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'):
    print(key+':', 'configured' if keys.get(key) else 'MISSING')
print('RECONCILIATION_ENABLED:',
      'true' if keys.get('RECONCILIATION_ENABLED')=='true' else 'disabled')
PY
printf '\n=== Service states ===\n'
for name in postgresql nginx artems-carbon; do
  printf '%s: ' "$name"
  systemctl is-active "$name" || true
done
printf '\nRead-only configuration check complete.\n'
