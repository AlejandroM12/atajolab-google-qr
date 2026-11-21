#!/bin/bash
# Cambio de tráfico Render -> Hetzner para qr.atajolab.dev. Ver docs/hetzner.md.
# Se corre DESPUÉS de cargar las credenciales reales de Mercado Pago en el .env del servidor y se queda
# esperando a que el DNS apunte al VPS (el cambio de DNS se hace en Cloudflare, ver abajo).
#   1) pasa la app a APP_URL=https://qr.atajolab.dev y abre la venta (STUDIO_SALES_CONFIRMED=true)
#   2) publica el sitio qr.atajolab.dev en Caddy (y retira el de pruebas)
#   3) instala las tareas programadas (mail cada 2 min, limpieza cada hora, vigilancia cada 5)
#   4) espera el DNS, fuerza el certificado y verifica de punta a punta
# Se niega a seguir si Mercado Pago no está en modo producción.
set -euo pipefail
HOST="${HOST:-deploy@167.233.65.236}"
KEY="${SSH_KEY:-$HOME/.ssh/atajolab_prod}"
IP=167.233.65.236
DIR=/opt/atajolab/apps/atajolab-qr
SITES=/opt/atajolab/apps/agendia/deploy/sites
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")
ops() { "${SSH[@]}" "docker exec atajolab-qr node -e \"
  fetch('http://127.0.0.1:3000/api/health',{headers:{authorization:'Bearer '+process.env.MAIL_DISPATCH_SECRET}})
  .then(async r=>console.log(await r.text())).catch(e=>console.log(JSON.stringify({error:e.message})))\""; }

echo ">> 0. comprobaciones previas"
env_mp=$("${SSH[@]}" "grep -E '^MERCADOPAGO_ENV=' $DIR/.env | head -1 | sed \"s/^[^=]*=//; s/'//g\"")
[ "$env_mp" = "production" ] || { echo "!! MERCADOPAGO_ENV='$env_mp': cargá las credenciales de PRODUCCIÓN (token, webhook secret y MERCADOPAGO_ENV=production) en $DIR/.env"; exit 1; }

echo ">> 1. APP_URL y venta"
"${SSH[@]}" "cd $DIR && sed -i \"s#^APP_URL=.*#APP_URL='https://qr.atajolab.dev'#; s#^STUDIO_SALES_CONFIRMED=.*#STUDIO_SALES_CONFIRMED='true'#\" .env && TAG=\$(cat .current) docker compose up -d --no-build --force-recreate app"
for i in $(seq 1 24); do
  [ "$("${SSH[@]}" "docker inspect -f '{{.State.Health.Status}}' atajolab-qr")" = healthy ] && break
  sleep 5
done
health=$(ops)
echo "$health" | grep -q '"paymentsEnvironment":"production"' || { echo "!! el health no muestra paymentsEnvironment=production: $health"; exit 1; }
echo "$health" | grep -q '"studioSalesOpen":true' || { echo "!! la venta no quedó abierta"; exit 1; }
echo "$health" | grep -q '"rateLimitTrustProxy":"xff"' || { echo "!! RATE_LIMIT_TRUST_PROXY no es xff"; exit 1; }

echo ">> 2. Caddy"
"${SSH[@]}" "cp $DIR/qr.caddy $SITES/qr.caddy && rm -f $SITES/qr-staging.caddy && docker exec agendia-caddy-1 caddy validate --config /etc/caddy/Caddyfile >/dev/null && docker exec agendia-caddy-1 caddy reload --config /etc/caddy/Caddyfile"

echo ">> 3. tareas programadas"
"${SSH[@]}" "(crontab -l 2>/dev/null | grep -v 'atajolab-qr/cron.sh'; cat <<'CRON'
*/2 * * * * $DIR/cron.sh dispatch >> $DIR/logs/cron.log 2>&1
17 * * * * $DIR/cron.sh cleanup >> $DIR/logs/cron.log 2>&1
*/5 * * * * $DIR/cron.sh watch >> $DIR/logs/cron.log 2>&1
CRON
) | crontab -"

cat <<MSG

>> 4. CAMBIO DE DNS (Cloudflare, zona atajolab.dev). Reemplazá el registro actual:
     qr   CNAME   atajolab-google-qr.onrender.com   (se guarda para el rollback)
   por:
     qr   A       $IP   (solo DNS, nube gris, TTL Auto)
   Esperando a que resuelva al VPS (hasta 30 min)...
MSG
for i in $(seq 1 180); do
  got=$(nslookup qr.atajolab.dev 1.1.1.1 2>/dev/null | awk '/^Address/ && !/#/ {print $2}' | tr '\n' ' ')
  case "$got" in *"$IP"*) break;; esac
  sleep 10
done
case "$got" in *"$IP"*) ;; *) echo "!! el DNS todavía no apunta a $IP (ve: $got). Volvé a correr este script cuando cambie."; exit 1;; esac

echo ">> 5. certificado y verificación"
"${SSH[@]}" "docker exec agendia-caddy-1 caddy reload --config /etc/caddy/Caddyfile"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://qr.atajolab.dev/api/health || true)
  [ "$code" = 200 ] && break
  sleep 5
done
[ "$code" = 200 ] || { echo "!! https://qr.atajolab.dev/api/health no responde 200 (último: $code). Rollback: deploy/hetzner/rollback.sh"; exit 1; }
curl -sI https://qr.atajolab.dev/ | grep -i '^server\|^via' | head -2
"${SSH[@]}" "$DIR/cron.sh dispatch"
echo ">> listo: qr.atajolab.dev atendido por Hetzner. Siguiente: probar el webhook de Mercado Pago (docs/hetzner.md)."
