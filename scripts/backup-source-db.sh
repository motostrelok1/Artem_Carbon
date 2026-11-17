#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only source DB backup. Run on the OLD production VDS.
# Does not stop services, alter schema, or delete/overwrite existing backups.
APP_ENV="${APP_ENV:-/opt/artems-carbon/server/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/artems-carbon}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/artems-carbon-$STAMP.dump"

if [[ -z "${DATABASE_URL:-}" ]]; then
  [[ -r "$APP_ENV" ]] || { echo "Cannot read $APP_ENV; set DATABASE_URL explicitly." >&2; exit 1; }
  DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$APP_ENV" | tail -n1)"
  DATABASE_URL="${DATABASE_URL%$'\r'}"
  DATABASE_URL="${DATABASE_URL#\"}"; DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\'}"; DATABASE_URL="${DATABASE_URL%\'}"
fi
[[ "$DATABASE_URL" == postgres://* || "$DATABASE_URL" == postgresql://* ]] || {
  echo "DATABASE_URL is missing or is not a PostgreSQL URL. Nothing was changed." >&2; exit 1;
}
command -v pg_dump >/dev/null || { echo "pg_dump is not installed." >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "pg_restore is not installed." >&2; exit 1; }

install -d -m 0700 "$BACKUP_DIR"
[[ ! -e "$OUT" ]] || { echo "Backup destination already exists; refusing to overwrite." >&2; exit 1; }
umask 077

echo "Creating consistent PostgreSQL custom-format backup..."
pg_dump --format=custom --no-owner --no-acl --verbose --dbname="$DATABASE_URL" --file="$OUT"
echo "Verifying archive structure..."
pg_restore --list "$OUT" >/dev/null
chmod 0600 "$OUT"
sha256sum "$OUT" | tee "$OUT.sha256"
chmod 0600 "$OUT.sha256"

echo
echo "Backup completed and archive list verified."
echo "File: $OUT"
echo "Size: $(du -h "$OUT" | awk '{print $1}')"
echo "SHA256 file: $OUT.sha256"
echo "Transfer both files to the new VDS; do not delete this source backup."
