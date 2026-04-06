#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/ondc_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump and compress
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# Cleanup old backups
find "$BACKUP_DIR" -name "ondc_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Cleanup complete. Retained last $RETENTION_DAYS days."
