#!/bin/bash
# Rollback de AtajoLab QR en Hetzner. Ver docs/hetzner.md.
#   rollback.sh app      vuelve a la imagen anterior (.previous) sin tocar el DNS
#   rollback.sh render   apaga las tareas del VPS y te dice cómo devolver el tráfico a Render
set -euo pipefail
HOST="${HOST:-deploy@167.233.65.236}"
KEY="${SSH_KEY:-$HOME/.ssh/atajolab_prod}"
DIR=/opt/atajolab/apps/atajolab-qr
# En el VPS (existe $DIR) los comandos corren acá; en tu PC, por SSH.
if [ -d "$DIR" ]; then SSH=(bash -c); else SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST"); fi
case "${1:-}" in
  app)
    prev=$("${SSH[@]}" "cat $DIR/.previous 2>/dev/null || true")
    [ -n "$prev" ] || { echo "!! no hay imagen anterior registrada"; exit 1; }
    "${SSH[@]}" "cd $DIR && TAG=$prev docker compose up -d --no-build --force-recreate app && echo '$prev' > .current"
    echo ">> app en $prev";;
  render)
    "${SSH[@]}" "crontab -l 2>/dev/null | grep -v 'atajolab-qr/cron.sh' | crontab - ; echo 'tareas del VPS apagadas'"
    cat <<MSG
>> Para devolver el tráfico a Render (efecto en ~5 min, TTL Auto):
   Cloudflare > atajolab.dev > DNS: borrá el registro  qr  A  167.233.65.236
   y creá                           qr  CNAME  atajolab-google-qr.onrender.com  (solo DNS)
   Render sigue desplegado y con sus variables; despertará con el primer pedido (plan Free).
   Después, en el VPS:  docker stop atajolab-qr   (para que no atienda webhooks ni correos duplicados)
MSG
    ;;
  *) echo "uso: rollback.sh app|render" >&2; exit 2;;
esac
