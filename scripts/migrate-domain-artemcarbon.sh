#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }

APP_ROOT="/opt/artems-carbon"
SERVER_DIR="$APP_ROOT/server"
ADMIN_DIR="$APP_ROOT/admin"
ENV_FILE="$SERVER_DIR/.env"
OLD_SITE="/etc/nginx/sites-available/carbon-api.dvizh-school.ru"
SITE="/etc/nginx/sites-available/api.artemcarbon.ru"
ENABLED="/etc/nginx/sites-enabled/api.artemcarbon.ru"

[[ -f "$ENV_FILE" ]] || { echo "Missing app .env; refusing." >&2; exit 1; }
[[ -f "$ADMIN_DIR/index.html" ]] || { echo "Admin UI missing; refusing." >&2; exit 1; }
systemctl is-active --quiet postgresql || { echo "PostgreSQL must be active." >&2; exit 1; }

# Deploy the updated API from the controlled branch; deploy script preserves .env.
DEPLOY_BRANCH=ops/new-vds-bootstrap
export DEPLOY_BRANCH
curl -fsSL "https://raw.githubusercontent.com/motostrelok1/Artem_Carbon/ops/new-vds-bootstrap/scripts/deploy-api.sh" | bash

# Preserve every secret and change only public URL settings.
python3 - "$ENV_FILE" <<'PY'
import os,sys,tempfile
p=sys.argv[1]
with open(p,encoding='utf-8') as f: lines=f.read().splitlines()
updates={
 'PUBLIC_SITE_URL':'https://artemcarbon.ru',
 'PUBLIC_BASE_PATH':'/',
 'API_PUBLIC_URL':'https://api.artemcarbon.ru',
}
seen=set(); out=[]
for line in lines:
    key=line.split('=',1)[0] if '=' in line else ''
    if key in updates:
        if key not in seen: out.append(key+'='+updates[key]); seen.add(key)
    else: out.append(line)
for key,value in updates.items():
    if key not in seen: out.append(key+'='+value)
fd,tmp=tempfile.mkstemp(dir=os.path.dirname(p),prefix='.env.')
with os.fdopen(fd,'w',encoding='utf-8') as f: f.write('\n'.join(out)+'\n')
os.chmod(tmp,0o600); os.replace(tmp,p)
PY
chown artems-carbon:artems-carbon "$ENV_FILE"
chmod 0600 "$ENV_FILE"

# Keep a dated copy of the current virtual host before replacing its domain.
if [[ -f "$OLD_SITE" && ! -f "$SITE" ]]; then cp -a "$OLD_SITE" "$OLD_SITE.before-artemcarbon"; fi
cat > "$SITE" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name api.artemcarbon.ru;
    root /opt/artems-carbon/admin;
    index index.html;
    server_tokens off;
    client_max_body_size 1m;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options DENY always;

    location = /health {
        proxy_pass http://127.0.0.1:3002/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
    location / { try_files $uri $uri/ =404; }
}
NGINX
ln -sfn "$SITE" "$ENABLED"
chmod 0755 "$APP_ROOT" "$ADMIN_DIR"
chmod 0644 "$ADMIN_DIR/index.html" "$ADMIN_DIR/admin.js" "$ADMIN_DIR/admin.css"
nginx -t
systemctl reload nginx
systemctl restart artems-carbon
sleep 2
systemctl is-active --quiet artems-carbon || { journalctl -u artems-carbon -n 50 --no-pager; exit 1; }
curl -fsS http://127.0.0.1:3002/health
echo
echo "API host changed to api.artemcarbon.ru. DNS and TLS are the remaining steps."
