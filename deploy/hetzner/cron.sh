#!/bin/bash
# Tareas programadas de AtajoLab QR en el VPS. Se ejecuta con el crontab del usuario `deploy`:
#   */2 * * * *  /opt/atajolab/apps/atajolab-qr/cron.sh dispatch >> /opt/atajolab/apps/atajolab-qr/logs/cron.log 2>&1
#   17  * * * *  /opt/atajolab/apps/atajolab-qr/cron.sh cleanup  >> /opt/atajolab/apps/atajolab-qr/logs/cron.log 2>&1
#   */5 * * * *  /opt/atajolab/apps/atajolab-qr/cron.sh watch    >> /opt/atajolab/apps/atajolab-qr/logs/cron.log 2>&1
# Los secretos nunca están en el crontab: se leen del entorno del contenedor. `flock` evita que dos
# ejecuciones de la misma tarea se pisen; el servidor, además, reclama cada notificación de forma atómica.
set -u
C=atajolab-qr
task="${1:-}"
lock="/tmp/atajolab-qr-$task.lock"

call() { # $1 = ruta, $2 = variable con el secreto
  docker exec "$C" node -e "
    const t = process.env.$2;
    if (!t) { console.log(new Date().toISOString(), '$1', 'sin-secreto'); process.exit(1); }
    fetch('http://127.0.0.1:3000$1', { method: 'POST', headers: { authorization: 'Bearer ' + t }, signal: AbortSignal.timeout(55000) })
      .then(async (r) => { console.log(new Date().toISOString(), '$1', r.status, (await r.text()).slice(0, 200)); process.exit(r.ok ? 0 : 1); })
      .catch((e) => { console.log(new Date().toISOString(), '$1', 'error', e.message); process.exit(1); });"
}

case "$task" in
  dispatch) exec flock -n "$lock" bash -c "$(declare -f call); C=$C; call /api/mail/dispatch MAIL_DISPATCH_SECRET" ;;
  cleanup)  exec flock -n "$lock" bash -c "$(declare -f call); C=$C; call /api/studio/assets/cleanup STUDIO_CLEANUP_SECRET" ;;
  watch)
    status=$(docker inspect -f '{{.State.Health.Status}}' "$C" 2>/dev/null || echo missing)
    if [ "$status" = "unhealthy" ]; then
      echo "$(date -u +%FT%TZ) watch: $C unhealthy, restarting"
      docker restart "$C" >/dev/null
    fi
    ;;
  *) echo "uso: cron.sh dispatch|cleanup|watch" >&2; exit 2 ;;
esac
