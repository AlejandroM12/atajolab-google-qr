#!/bin/bash
# Copia diaria de la base de AtajoLab QR (Neon) en el VPS, con 14 días de retención.
#   40 3 * * *  /opt/atajolab/apps/atajolab-qr/backup-db.sh >> /opt/atajolab/apps/atajolab-qr/logs/backup.log 2>&1
# La URL de la base se toma del contenedor y viaja por variable de entorno (no por la línea de comandos).
# pg_dump 18 coincide con la versión de Neon. Restaurar: gunzip -c archivo.sql.gz | psql "$DATABASE_URL"
set -euo pipefail
DIR=/opt/atajolab/backups/atajolab-qr
KEEP_DAYS=14
umask 077
mkdir -p "$DIR"
out="$DIR/atajolab-qr-$(date -u +%Y%m%d-%H%M).sql.gz"
export PGDUMP_URL
PGDUMP_URL=$(docker exec atajolab-qr printenv DATABASE_URL)
docker run --rm -e PGDUMP_URL postgres:18-alpine sh -c 'pg_dump --no-owner --no-privileges "$PGDUMP_URL"' | gzip > "$out.tmp"
unset PGDUMP_URL
size=$(stat -c %s "$out.tmp")
if [ "$size" -lt 5000 ] || ! gunzip -c "$out.tmp" | tail -5 | grep -q "PostgreSQL database dump complete"; then
  rm -f "$out.tmp"; echo "$(date -u +%FT%TZ) backup FALLÓ (tamaño $size)"; exit 1
fi
mv "$out.tmp" "$out"
find "$DIR" -name 'atajolab-qr-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok $(basename "$out") ${size} bytes; copias: $(ls "$DIR"/atajolab-qr-*.sql.gz | wc -l)"
