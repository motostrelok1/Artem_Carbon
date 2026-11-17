#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy API source from the controlled ops branch. No data import, no payment
# activation, no SMTP activation, and no overwrite of an existing .env.
if [[ "${EUID}" -ne 0 ]]; then echo "Run with sudo: sudo bash $0" >&2; exit 1; fi
APP_ROOT="/opt/artems-carbon"
REPO_DIR="$APP_ROOT/repo"
SERVER_DIR="$APP_ROOT/server"
REPO_URL="https://github.com/motostrelok1/Artem_Carbon.git"
BRANCH="${DEPLOY_BRANCH:-ops/new-vds-bootstrap}"

systemctl is-active --quiet postgresql || { echo "PostgreSQL must be active first." >&2; exit 1; }
install -d -o artems-carbon -g artems-carbon -m 0750 "$APP_ROOT"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" fetch --depth=1 origin "$BRANCH"
  git -C "$REPO_DIR" checkout -f FETCH_HEAD
else
  [[ ! -e "$REPO_DIR" ]] || { echo "$REPO_DIR exists but is not a Git repository; refusing to overwrite." >&2; exit 1; }
  git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

[[ -f "$REPO_DIR/server/package.json" ]] || { echo "API package.json missing." >&2; exit 1; }
if [[ -e "$SERVER_DIR/.env" ]]; then
  cp -a "$SERVER_DIR/.env" "$SERVER_DIR/.env.deploy-backup"
fi
install -d -o artems-carbon -g artems-carbon -m 0750 "$SERVER_DIR"
rsync -a --delete --exclude='.env' --exclude='.env.deploy-backup' "$REPO_DIR/server/" "$SERVER_DIR/"
chown -R artems-carbon:artems-carbon "$REPO_DIR" "$SERVER_DIR"
chmod 0750 "$APP_ROOT" "$REPO_DIR" "$SERVER_DIR"

if [[ -e "$SERVER_DIR/.env" ]]; then
  chmod 0600 "$SERVER_DIR/.env"
else
  echo "No server/.env yet. Run scripts/prepare-database.sh after deploy, then configure API secrets." >&2
fi

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
systemctl daemon-reload
if [[ -f "$SERVER_DIR/.env" ]]; then
  systemctl enable artems-carbon
  echo "API files installed and tests passed. Unit created; service not started yet."
else
  echo "API files installed and tests passed. Unit created; run prepare-database.sh before starting."
fi
