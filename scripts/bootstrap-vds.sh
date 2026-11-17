#!/usr/bin/env bash
set -Eeuo pipefail

# ARTEMS CARBON — Ubuntu 22.04 VDS bootstrap.
# Safe to rerun. Does NOT migrate data, write application secrets, configure DNS,
# enable payments, or replace existing Nginx/application configuration.

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with: sudo bash $0" >&2
  exit 1
fi

log(){ printf '\n[%s] %s\n' "$(date -Is)" "$*"; }
has_cmd(){ command -v "$1" >/dev/null 2>&1; }

. /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "22.04" ]]; then
  echo "This bootstrap is intended for Ubuntu 22.04 LTS; detected ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

log "Set timezone"
timedatectl set-timezone Europe/Moscow

log "Refresh package index and install base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git jq rsync unzip htop ufw fail2ban nginx postgresql-common

log "Ensure Node.js 24 repository exists"
if ! apt-cache policy nodejs 2>/dev/null | grep -q 'nodesource.com/node_24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get update
fi
apt-get install -y nodejs

log "Ensure PostgreSQL 16 PGDG repository exists"
if ! apt-cache policy postgresql-16 2>/dev/null | grep -q 'apt.postgresql.org'; then
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  apt-get update
fi
apt-get install -y postgresql-16 postgresql-client-16

log "Create dedicated service account and application directories"
if ! id artems-carbon >/dev/null 2>&1; then
  useradd --system --home-dir /opt/artems-carbon --create-home --shell /usr/sbin/nologin artems-carbon
fi
install -d -o artems-carbon -g artems-carbon -m 0750 /opt/artems-carbon
install -d -o artems-carbon -g artems-carbon -m 0750 /opt/artems-carbon/server
# Allow the initial Ubuntu operator account to traverse/manage deployment files
# through the dedicated service group. A fresh SSH login is required afterwards.
if id ubuntu >/dev/null 2>&1; then
  usermod -aG artems-carbon ubuntu
fi
install -d -o www-data -g www-data -m 0755 /var/www/artems-carbon

log "Enable core services"
systemctl enable --now nginx
systemctl enable --now postgresql
systemctl enable --now fail2ban

log "Configure UFW without locking out SSH"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw default allow outgoing
if ! ufw status | grep -q '^Status: active'; then
  ufw --force enable
fi

log "Verify local PostgreSQL listener and runtime versions"
if ! pg_lsclusters | awk 'NR>1 && $1=="16" && $4=="online" {found=1} END{exit !found}'; then
  echo "PostgreSQL 16 cluster is not online. Inspect: sudo pg_lsclusters" >&2
  exit 1
fi
if ! ss -lnt | grep -qE '127\.0\.0\.1:5432|\[::1\]:5432'; then
  echo "Warning: no loopback PostgreSQL listener detected; inspect pg_hba.conf/postgresql.conf before proceeding." >&2
fi

log "Bootstrap complete"
printf '\nNode: '; node --version
printf 'npm: '; npm --version
printf 'PostgreSQL: '; psql --version
printf '\n'
systemctl is-active nginx postgresql fail2ban
ufw status verbose
pg_lsclusters
printf '\nNext: review docs/NEW_VDS_BOOTSTRAP.md before creating DB credentials or deploying the app.\n'
