#!/usr/bin/env bash
# READ-ONLY reservation readiness audit for Artem Carbon production.
# Run as a PostgreSQL-capable OS user (normally postgres). No migrations here.
set -Eeuo pipefail
DB_NAME="${1:-artems_carbon}"
case "$DB_NAME" in
  *[!a-zA-Z0-9_]*|'') echo "Invalid database name" >&2; exit 2 ;;
esac
command -v psql >/dev/null || { echo "psql missing" >&2; exit 2; }
printf '=== Artem Carbon: read-only database preflight ===\n'
# Disallow writes, including accidental changes when queries are edited.
export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on -c statement_timeout=10000"
psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" <<'SQL'
\pset pager off
\pset tuples_only off
SELECT current_database() AS database, current_user AS db_user,
       pg_is_in_recovery() AS replica_mode,
       current_setting('default_transaction_read_only') AS read_only_guard;
SELECT to_regclass('public.orders') IS NOT NULL AS orders_table,
       to_regclass('public.order_items') IS NOT NULL AS items_table,
       to_regclass('public.lesson_number_pool') IS NOT NULL AS number_pool,
       to_regclass('public.lesson_reservation_release_audit') IS NOT NULL AS audit_table;
SELECT table_name,column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('orders','lesson_number_pool')
  AND column_name IN ('status','provider_payment_id','amount_kopecks',
     'reserved_order_id','reserved_at','reservation_expires_at',
     'number','order_id','assigned_at','voided_at')
ORDER BY table_name,column_name;
SELECT
 (SELECT COUNT(*) FROM public.orders) AS all_orders,
 (SELECT COUNT(*) FROM public.orders WHERE status='pending') AS pending_orders,
 (SELECT COUNT(*) FROM public.orders WHERE status='paid') AS paid_orders,
 (SELECT COUNT(*) FROM public.orders
    WHERE status='pending' AND provider_payment_id IS NULL) AS pending_without_payment_id,
 (SELECT COUNT(*) FROM public.lesson_number_pool) AS pool_total,
 (SELECT COUNT(*) FROM public.lesson_number_pool WHERE order_id IS NOT NULL) AS assigned_ever,
 (SELECT COUNT(*) FROM public.lesson_number_pool WHERE order_id IS NULL) AS unassigned_old_schema,
 (SELECT COUNT(*) FROM public.lesson_number_pool WHERE voided_at IS NOT NULL) AS voided_ever;
SELECT COUNT(*) AS out_of_range_numbers
 FROM public.lesson_number_pool WHERE number NOT BETWEEN 1 AND 9500;
SELECT COUNT(*) AS assigned_without_order
 FROM public.lesson_number_pool p LEFT JOIN public.orders o ON o.id=p.order_id
 WHERE p.order_id IS NOT NULL AND o.id IS NULL;
SELECT COUNT(*) AS duplicated_order_payment_ids
 FROM (SELECT provider_payment_id FROM public.orders
  WHERE provider_payment_id IS NOT NULL
  GROUP BY provider_payment_id HAVING COUNT(*)>1) duplicates;
SQL
printf '\nPreflight finished. No migration or state change performed.\n'
