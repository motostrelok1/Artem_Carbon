#!/usr/bin/env bash
set -Eeuo pipefail

# Full ARTEMS CARBON deployment: static public website + admin + API.
# Keeps the existing PostgreSQL data and server/.env secrets.
[[ "$EUID" -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }

APP_ROOT="/opt/artems-carbon"
REPO_DIR="$APP_ROOT/repo"
SERVER_DIR="$APP_ROOT/server"
SITE_DIR="$APP_ROOT/site"
ENV_FILE="$SERVER_DIR/.env"
REPO_URL="https://github.com/motostrelok1/Artem_Carbon.git"
BRANCH="main"

systemctl is-active --quiet postgresql || { echo "PostgreSQL must be active first." >&2; exit 1; }
command -v nginx >/dev/null || { echo "Nginx is not installed." >&2; exit 1; }
command -v rsync >/dev/null || { echo "rsync is required." >&2; exit 1; }

install -d -o artems-carbon -g artems-carbon -m 0750 "$APP_ROOT"
# Nginx (www-data) must traverse APP_ROOT to read the public static site,
# but must not be able to list the application root.
chmod 0711 "$APP_ROOT"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" fetch --depth=1 origin "$BRANCH"
  git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" checkout -f FETCH_HEAD
else
  [[ ! -e "$REPO_DIR" ]] || { echo "$REPO_DIR exists but is not a Git repository; refusing to overwrite." >&2; exit 1; }
  git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

[[ -f "$REPO_DIR/index.html" && -f "$REPO_DIR/styles.css" && -f "$REPO_DIR/script.js" ]] || {
  echo "Public website files are missing from repository root." >&2; exit 1;
}
[[ -f "$REPO_DIR/admin/index.html" && -f "$REPO_DIR/server/src/app.js" ]] || {
  echo "Admin or API source is missing." >&2; exit 1;
}
[[ -f "$ENV_FILE" ]] || {
  echo "Missing $ENV_FILE. Prepare PostgreSQL and configure secrets first; no blank env will be created." >&2; exit 1;
}

# Copy the whole static website (including product photos, video assets and music).
install -d -o root -g www-data -m 0755 "$SITE_DIR"
rsync -a --delete \
  --exclude='.git/' --exclude='.github/' --exclude='server/' \
  --exclude='scripts/' --exclude='docs/' --exclude='README.md' \
  --exclude='CNAME' --exclude='.nojekyll' \
  "$REPO_DIR/" "$SITE_DIR/"
chown -R root:www-data "$SITE_DIR"
find "$SITE_DIR" -type d -exec chmod 0755 {} +
find "$SITE_DIR" -type f -exec chmod 0644 {} +

# Deploy API source without overwriting .env or its backup.
if [[ -e "$ENV_FILE" ]]; then cp -a "$ENV_FILE" "$ENV_FILE.deploy-backup.$(date -u +%Y%m%dT%H%M%SZ)"; fi
install -d -o artems-carbon -g artems-carbon -m 0750 "$SERVER_DIR"
rsync -a --delete --exclude='.env' --exclude='.env.deploy-backup*' "$REPO_DIR/server/" "$SERVER_DIR/"
chown -R artems-carbon:artems-carbon "$SERVER_DIR"
chmod 0750 "$SERVER_DIR"
chmod 0600 "$ENV_FILE"

# Change only public origins; preserve DB credentials, admin hash, payment and SMTP secrets.
python3 - "$ENV_FILE" <<'PY'
import os,sys,tempfile
p=sys.argv[1]
with open(p,encoding='utf-8') as f: lines=f.read().splitlines()
updates={'PUBLIC_SITE_URL':'https://artemcarbon.ru','PUBLIC_BASE_PATH':'/','API_PUBLIC_URL':'https://api.artemcarbon.ru'}
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

runuser -u artems-carbon -- bash -lc "cd '$SERVER_DIR' && npm install --omit=dev"
runuser -u artems-carbon -- bash -lc "cd '$SERVER_DIR' && npm test"

cat > /etc/systemd/system/artems-carbon.service <<'UNIT'
[Unit]
Description=ARTEMS CARBON API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=artems-carbon
Group=artems-carbon
WorkingDirectory=/opt/artems-carbon/server
EnvironmentFile=/opt/artems-carbon/server/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/artems-carbon/server/src/app.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/artems-carbon/server
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT

# Preserve the already-issued Let's Encrypt certificate on every deployment.
CERT_DIR="/etc/letsencrypt/live/artemcarbon.ru"
[[ -s "$CERT_DIR/fullchain.pem" && -s "$CERT_DIR/privkey.pem" ]] || {
  echo "Existing Let's Encrypt certificate is missing; refusing to install HTTPS config." >&2
  exit 1
}
install -d -o root -g root -m 0755 /var/www/letsencrypt

cat > /etc/nginx/sites-available/artemcarbon.ru <<'NGINX'
# HTTP: allow ACME HTTP-01 challenges and redirect all other traffic to HTTPS.
server {
    listen 80;
    listen [::]:80;
    server_name artemcarbon.ru www.artemcarbon.ru api.artemcarbon.ru;
    server_tokens off;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type text/plain;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# Public website.
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name artemcarbon.ru;
    root /opt/artems-carbon/site;
    index index.html;
    server_tokens off;
    client_max_body_size 20m;

    ssl_certificate /etc/letsencrypt/live/artemcarbon.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/artemcarbon.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options SAMEORIGIN always;

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

# www is covered by the same certificate and redirects to the canonical host.
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.artemcarbon.ru;

    ssl_certificate /etc/letsencrypt/live/artemcarbon.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/artemcarbon.ru/privkey.pem;
    return 301 https://artemcarbon.ru$request_uri;
}

# API: separate hostname, same certificate.
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.artemcarbon.ru;
    server_tokens off;
    client_max_body_size 1m;

    ssl_certificate /etc/letsencrypt/live/artemcarbon.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/artemcarbon.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

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
    location / { return 404; }
}
NGINX

# The API hostname is defined above in the consolidated vhost. Disable only
# the duplicate symlink; retain the available file for rollback/reference.
if [[ -L /etc/nginx/sites-enabled/api.artemcarbon.ru ]]; then
  rm -f /etc/nginx/sites-enabled/api.artemcarbon.ru
fi
ln -sfn /etc/nginx/sites-available/artemcarbon.ru /etc/nginx/sites-enabled/artemcarbon.ru

nginx -t
systemctl reload nginx
systemctl daemon-reload
systemctl enable artems-carbon
systemctl restart artems-carbon
sleep 2
systemctl is-active --quiet artems-carbon || { journalctl -u artems-carbon -n 60 --no-pager; exit 1; }
curl -fsS http://127.0.0.1:3002/health
echo
test -s "$SITE_DIR/index.html"
test -s "$SITE_DIR/admin/index.html"
curl -fsS https://artemcarbon.ru/ >/dev/null
curl -fsS https://api.artemcarbon.ru/health
echo
echo "Full website + admin + API deployed on this VDS over HTTPS."
