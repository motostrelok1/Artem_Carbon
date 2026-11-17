#!/usr/bin/env bash
set -Eeuo pipefail

# Run as root after the repository is deployed to /opt/artems-carbon.
# Creates a fresh app DB, applies the five ordered migrations, and writes
# DATABASE_URL only if no .env exists. Does not import production data.
if [[ "${EUID}" -ne 0 ]]; then echo "Run with sudo: sudo bash $0" >&2; exit 1; fi
APP_ROOT="${APP_ROOT:-/opt/artems-carbon}"
SERVER_DIR="$APP_ROOT/server"
SQL_DIR="$SERVER_DIR/sql"
ENV_FILE="$SERVER_DIR/.env"
DB_NAME="${DB_NAME:-artems_carbon}"
DB_USER="${DB_USER:-artems_app}"

[[ "$DB_NAME" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]] || { echo "Invalid DB_NAME" >&2; exit 1; }
[[ "$DB_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]] || { echo "Invalid DB_USER" >&2; exit 1; }
for f in 001_sales.sql 002_email_outbox.sql 003_course_buyer.sql 004_lesson_numbers.sql 005_checkout_consents.sql; do
  [[ -f "$SQL_DIR/$f" ]] || { echo "Missing migration: $SQL_DIR/$f" >&2; exit 1; }
done
[[ ! -e "$ENV_FILE" ]] || { echo "$ENV_FILE already exists; refusing to overwrite secrets." >&2; exit 1; }
systemctl is-active --quiet postgresql || { echo "PostgreSQL is not active." >&2; exit 1; }

DB_PASSWORD="$(openssl rand -hex 32)"
export DB_PASSWORD DB_NAME DB_USER
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -v db_user="$DB_USER" -v db_password="$DB_PASSWORD" postgres <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password') \gexec
SQL

if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  runuser -u postgres -- createdb --owner="$DB_USER" "$DB_NAME"
fi

for f in 001_sales.sql 002_email_outbox.sql 003_course_buyer.sql 004_lesson_numbers.sql 005_checkout_consents.sql; do
  echo "Applying $f as $DB_USER"
  PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SQL_DIR/$f"
done

install -d -o artems-carbon -g artems-carbon -m 0750 "$SERVER_DIR"
umask 077
cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgres://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME
PORT=3002
PUBLIC_SITE_URL=https://motostrelok1.github.io
PUBLIC_BASE_PATH=/Artem_Carbon/
PAYMENTS_ENABLED=false
TBANK_API_URL=https://securepay.tinkoff.ru/v2
EOF
chown artems-carbon:artems-carbon "$ENV_FILE"
chmod 0600 "$ENV_FILE"
unset DB_PASSWORD

echo "Database and migrations ready. DATABASE_URL saved with mode 0600; password was not displayed."
