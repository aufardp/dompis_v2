#!/bin/bash
# Manual script untuk drop redundant index di table ticket
# Jalankan di VPS: bash scripts/cleanup-ticket-indexes.sh
set -euo pipefail

DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
DB_HOST="${DB_HOST:-localhost}"
DB_NAME="${DB_NAME:-dompis_db}"

if [ -n "$DB_PASS" ]; then
  MYSQL_CMD="mysql -u${DB_USER} -h${DB_HOST} -p${DB_PASS} ${DB_NAME}"
else
  MYSQL_CMD="mysql -u${DB_USER} -h${DB_HOST} ${DB_NAME}"
fi

echo "=== Drop redundant indexes on ticket ==="

for idx in idx_ticket_witel idx_ticket_guarantee idx_tech_status; do
  $MYSQL_CMD -e "DROP INDEX \`${idx}\` ON \`ticket\`" 2>/dev/null \
    && echo "  ${idx}: dropped" \
    || echo "  ${idx}: skipped (not found)"
done

echo ""
echo "=== ANALYZE TABLE ticket ==="
$MYSQL_CMD -e "ANALYZE TABLE ticket;"

echo ""
echo "=== Restart projection worker ==="
pm2 restart dompis-projection-worker || echo "  (pm2 not available, skip restart)"

echo ""
echo "=== VERIFY ==="
$MYSQL_CMD -e "SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name IN ('idx_ticket_witel','idx_ticket_guarantee','idx_tech_status');"
echo "  (should return 0 rows)"
echo ""
echo "=== Selesai ==="
