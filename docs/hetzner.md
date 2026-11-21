# AtajoLab QR en Hetzner

Producción corre en el VPS de AtajoLab (Hetzner CX23: 2 vCPU, 3,8 GB de RAM, 38 GB de disco, Ubuntu 24.04), con el mismo patrón que Presupuestos: una carpeta por app en `/opt/atajolab/apps/<app>`, sin puertos publicados, detrás del Caddy de Agendia (red Docker `agendia-edge`).

```
Internet ─▶ agendia-caddy-1 (80/443, HTTPS automático)
              ├─ agendia / presupuestos (otros proyectos, sin cambios)
              └─ qr.atajolab.dev ─▶ atajolab-qr:3000  (esta app)
                                      └─▶ Neon (PostgreSQL, sin migrar)
```

## Qué corre

| Pieza | Dónde |
|---|---|
| App Next.js (editor, API, webhooks, descargas) | contenedor `atajolab-qr` (imagen `atajolab-qr:<sha>`, construida con `Dockerfile`) |
| Proxy y HTTPS | `agendia-caddy-1`; sitio en `/opt/atajolab/apps/agendia/deploy/sites/qr.caddy` |
| Base de datos | **Neon** (la misma de siempre). No hay Postgres local ni migración de datos |
| Tareas programadas | `crontab` de `deploy`: `cron.sh dispatch` (cada 2 min), `cleanup` (cada hora), `watch` (cada 5) |
| Workers | no hay: el correo y la limpieza son endpoints de la app disparados por el cron |

Contenedor: `restart: unless-stopped`, healthcheck sobre `/api/health`, sistema de archivos de solo lectura (tmpfs en `/tmp` y `.next/cache`), usuario `node`, sin capacidades, 1,1 GB / 1,5 CPU como tope, logs `json-file` con rotación (5 × 10 MB). La app no escribe nada en disco: no hay volúmenes. Los logs se ven con `docker logs atajolab-qr` y los accesos con `docker logs agendia-caddy-1`.

## Variables de entorno

Viven en `/opt/atajolab/apps/atajolab-qr/.env` (modo 600, fuera del repo y de la imagen). Nombres; los valores no se versionan:

`DATABASE_URL`, `ALLOW_REMOTE_DATABASE=1` (el guard de `lib/db-guard.ts` lo exige fuera de Render), `APP_URL`, `ORDER_ACCESS_SECRET`, `MAIL_DISPATCH_SECRET`, `STUDIO_CLEANUP_SECRET`, `MERCADOPAGO_ENV`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_NOTIFICATION_URL`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `STUDIO_CHECKOUT_ENABLED`, `STUDIO_SALES_CONFIRMED`, `FREE_FIRST_QR_ENABLED`, `RATE_LIMIT_TRUST_PROXY=xff`, `RATE_LIMIT_PROXY_HOPS=1`.

`ORDER_ACCESS_SECRET` **no se rota**: cifra el contenido de los pedidos (Wi-Fi, contactos, texto). Debe ser el mismo que usaba Render.

## IP del cliente y rate limiting

La app nunca confía en lo que mande el cliente. Caddy (`qr.caddy`) **reemplaza** `X-Forwarded-For` por la IP real de la conexión y borra `X-Real-IP` y `CF-Connecting-IP`; la app corre con `RATE_LIMIT_TRUST_PROXY=xff` y `RATE_LIMIT_PROXY_HOPS=1`, o sea toma la única entrada, la que puso Caddy. Se comprobó que cambiar esos encabezados no cambia la clave de rate limit. El contenedor solo es alcanzable desde la red `agendia-edge`.

Si algún día el dominio pasa por el proxy de Cloudflare (nube naranja), Caddy vería IPs de Cloudflare: habría que confiar en sus rangos (`trusted_proxies` + `client_ip_headers CF-Connecting-IP`) antes de hacerlo.

## Desplegar una versión

`deploy/hetzner/ship.sh` construye la imagen en tu máquina, la sube por SSH (sin registro ni credenciales en el servidor), levanta el contenedor y, si no queda `healthy`, vuelve solo a la versión anterior. La versión previa queda en `.previous`.

## Cambio de tráfico (Render → Hetzner)

1. Cargar en `/opt/atajolab/apps/atajolab-qr/.env` las credenciales **de producción** de Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_ENV=production`) y comprobar que `ORDER_ACCESS_SECRET`, `RESEND_API_KEY` y `MAIL_DISPATCH_SECRET` sean los de Render. `cutover.sh` se niega a seguir si `MERCADOPAGO_ENV` no es `production`.
2. `deploy/hetzner/cutover.sh`: pasa `APP_URL` a `https://qr.atajolab.dev`, abre la venta, publica el sitio en Caddy, instala el cron y espera el DNS.
3. En Cloudflare (zona `atajolab.dev`) reemplazar `qr CNAME atajolab-google-qr.onrender.com` por `qr A 167.233.65.236` (solo DNS). Caddy emite el certificado de Let's Encrypt en cuanto el dominio resuelve al VPS.
4. Probar el webhook: en Mercado Pago > Tus integraciones > Notificaciones > "Simular notificación" apuntando a `https://qr.atajolab.dev/api/payments/mercadopago`; debe responder 200 (con una firma que no coincida respondería 401). Mirar `docker logs atajolab-qr`.

## Rollback

- **Versión mala de la app:** `deploy/hetzner/rollback.sh app` (imagen anterior, sin tocar DNS).
- **Volver a Render:** `deploy/hetzner/rollback.sh render` apaga el cron del VPS; después, en Cloudflare, `qr A 167.233.65.236` → `qr CNAME atajolab-google-qr.onrender.com` (propaga en minutos) y `docker stop atajolab-qr` para que el VPS no atienda webhooks ni correos. Render sigue desplegado con sus variables y despierta con el primer pedido (plan Free).
- La base de datos es la misma en ambos lados: no hay nada que revertir ni datos que reconciliar.

## Tareas programadas y duplicados

`cron.sh` usa `flock` (no se pisa consigo mismo) y los endpoints reclaman cada notificación de forma atómica, así que una ejecución repetida es inofensiva. Render no tiene tareas propias de la app: todo es disparado por HTTP, y una vez cambiado el DNS esas llamadas llegan al VPS. Si existiera un cron externo apuntando a `qr.atajolab.dev`, seguirá funcionando sin cambios.

## Monitoreo

```
ssh deploy@167.233.65.236
docker stats --no-stream            # CPU y RAM por contenedor
docker inspect -f '{{.State.Health.Status}} reinicios={{.RestartCount}}' atajolab-qr
tail -f /opt/atajolab/apps/atajolab-qr/logs/cron.log
curl -s -H "authorization: Bearer $MAIL_DISPATCH_SECRET" https://qr.atajolab.dev/api/health   # estado de operador
```
