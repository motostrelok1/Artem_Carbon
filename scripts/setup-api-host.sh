#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="carbon-api.dvizh-school.ru"
APP_ROOT="/opt/artems-carbon"
SERVER_DIR="$APP_ROOT/server"
ADMIN_DIR="$APP_ROOT/admin"
ENV_FILE="$SERVER_DIR/.env"
SITE="/etc/nginx/sites-available/$DOMAIN"
ENABLED="/etc/nginx/sites-enabled/$DOMAIN"

if [[ "$EUID" -ne 0 ]]; then echo "Run with sudo: sudo bash $0" >&2; exit 1; fi
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE; prepare the database first." >&2; exit 1; }
[[ -f "$ADMIN_DIR/index.html" && -f "$ADMIN_DIR/admin.js" && -f "$ADMIN_DIR/admin.css" ]] || { echo "Admin UI files missing." >&2; exit 1; }
systemctl is-active --quiet postgresql || { echo "PostgreSQL is not active." >&2; exit 1; }
command -v nginx >/dev/null || { echo "Nginx is not installed." >&2; exit 1; }

echo "This config prepares HTTP only. DNS must point to this VDS before issuing TLS."
echo "Current public DNS:"
getent ahostsv4 "$DOMAIN" | awk '!seen[$1]++ {print "  " $1}' || true
echo "New VDS IPv4: $(hostname -I | awk '{print $1}')"

if grep -q '^ADMIN_PASSWORD_HASH=' "$ENV_FILE" && grep -q '^SESSION_SECRET=' "$ENV_FILE"; then
  echo "Admin credentials already exist; preserving them."
else
  if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
    echo "Interactive terminal is required. Run this script from an SSH terminal." >&2
    exit 1
  fi
  read -r -s -p "Set a new strong admin password (minimum 14 characters): " ADMIN_PASSWORD </dev/tty
  echo >/dev/tty
  [[ "${#ADMIN_PASSWORD}" -ge 14 ]] || { unset ADMIN_PASSWORD; echo "Password too short." >&2; exit 1; }
  export ADMIN_PASSWORD
  ADMIN_PASSWORD_HASH="$(node -e "const c=require('node:crypto');let s=c.randomBytes(16).toString('hex');let p=process.env.ADMIN_PASSWORD;process.stdout.write(s+':'+c.scryptSync(p,s,64).toString('hex'))")"
  unset ADMIN_PASSWORD
  SESSION_SECRET="$(openssl rand -hex 32)"
  export ADMIN_PASSWORD_HASH SESSION_SECRET
  python3 - "$ENV_FILE" <<'PY'
import os,sys,tempfile
p=sys.argv[1]
with open(p,encoding='utf-8') as f: lines=f.read().splitlines()
updates={'ADMIN_PASSWORD_HASH':os.environ['ADMIN_PASSWORD_HASH'],'SESSION_SECRET':os.environ['SESSION_SECRET']}
seen=set(); out=[]
for line in lines:
    key=line.split('=',1)[0] if '=' in line else ''
    if key in updates:
        if key not in seen: out.append(key+'='+updates[key]); seen.add(key)
    else: out.append(line)
for key,value in updates.items():
    if key not in seen: out.append(key+'='+value)
fd,tmp=tempfile.mkstemp(dir=os.path.dirname(p),prefix='.env.')
with os.fdopen(fd,'w',encoding='utf-8') as f:
    f.write('\n'.join(out)+'\n')
os.chmod(tmp,0o600); os.replace(tmp,p)
PY
  unset ADMIN_PASSWORD_HASH SESSION_SECRET
fi

# Set the API's canonical public origin; keep DB and payment/email settings intact.
export API_PUBLIC_URL="https://$DOMAIN"
python3 - "$ENV_FILE" <<'PY'
import os,sys,tempfile
p=sys.argv[1]
with open(p,encoding='utf-8') as f: lines=f.read().splitlines()
key='API_PUBLIC_URL'; value=os.environ[key]; out=[]; done=False
for line in lines:
    if line.startswith(key+'='):
        if not done: out.append(key+'='+value); done=True
    else: out.append(line)
if not done: out.append(key+'='+value)
fd,tmp=tempfile.mkstemp(dir=os.path.dirname(p),prefix='.env.')
with os.fdopen(fd,'w',encoding='utf-8') as f: f.write('\n'.join(out)+'\n')
os.chmod(tmp,0o600); os.replace(tmp,p)
PY
chown artems-carbon:artems-carbon "$ENV_FILE"
chmod 0600 "$ENV_FILE"

cat > "$SITE" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name carbon-api.dvizh-school.ru;

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

    location / {
        try_files $uri $uri/ =404;
    }
}
NGINX
ln -sfn "$SITE" "$ENABLED"
nginx -t
systemctl reload nginx

systemctl daemon-reload
systemctl enable artems-carbon
systemctl restart artems-carbon
sleep 2
systemctl is-active --quiet artems-carbon || { journalctl -u artems-carbon -n 60 --no-pager; exit 1; }
curl -fsS http://127.0.0.1:3002/health
echo
echo "Nginx HTTP vhost installed; API service active."
echo "Do not request a certificate until DNS A record points to this VDS (195.209.222.219)."
