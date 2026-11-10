# AtajoLab QR

Aplicación web para que un comercio o profesional arme un código QR con el enlace de su ubicación en Google Maps o con el enlace para dejar una reseña.

Valida el enlace, muestra la pieza y guarda el pedido en PostgreSQL. El editor ofrece tres plantillas. Un pedido pagado descarga PNG, SVG y PDF generados en el servidor, también para las plantillas anteriores. No hay cuentas de usuario. El pago usa Mercado Pago Checkout Pro. `MERCADOPAGO_ENV=test` cobra con la cuenta de prueba. `MERCADOPAGO_ENV=production` cobra con la cuenta real. Si el token y la cuenta no coinciden, el cobro queda deshabilitado.

El flujo de ramas y los commits están en [CONTRIBUTING.md](CONTRIBUTING.md).

## Requisitos locales

- Node.js 22
- pnpm 11.1.3
- Docker, solo para PostgreSQL local

## Desarrollo

Copiá `.env.example` a `.env` y definí una clave local. Después levantá la base de este proyecto y aplicá las migraciones:

```bash
docker compose up -d
pnpm install --frozen-lockfile
pnpm exec prisma migrate dev
pnpm dev
```

La aplicación queda en el puerto que muestre `pnpm dev`. Si el 3000 está ocupado, Next usa el siguiente. `APP_URL` tiene que coincidir con esa dirección. PostgreSQL escucha en `127.0.0.1:54329` y usa el volumen `atajolab-google-qr-pgdata`.

`.env.example` no lleva secretos. Los valores reales no se commitean.

## Variables

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL. En local apunta a `127.0.0.1:54329`. En producción: Neon directo + `sslmode=require`. |
| `APP_URL` | Origen público de esta aplicación, sin barra final. |
| `MERCADOPAGO_ENV` | `test` para la pestaña Prueba. `production` para la pestaña Producción. Otro valor o un token que no coincida deja el cobro deshabilitado. |
| `MERCADOPAGO_ACCESS_TOKEN` | Access token de la misma pestaña que `MERCADOPAGO_ENV`. Vacío en el ejemplo. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Clave de la notificación, no el access token. |
| `MERCADOPAGO_NOTIFICATION_URL` | URL `https` que Mercado Pago llama. Vacía en local. |
| `EMAIL_PROVIDER` | Vacío en desarrollo. `resend` para enviar correos. |
| `RESEND_API_KEY` | Clave de Resend. Empieza con `re_`. No va al navegador. |
| `EMAIL_FROM` | `email@dominio` o `Nombre <email@dominio>` de un dominio verificado. |
| `ORDER_ACCESS_SECRET` | ≥32 caracteres. Deriva deliveryKey de pedidos Studio v8. Obligatorio en production antes de habilitar checkout Studio. |
| `MAIL_DISPATCH_SECRET` | ≥16 caracteres. Bearer de `POST /api/mail/dispatch` (reintentos del outbox). |
| `STUDIO_CLEANUP_SECRET` | ≥16 caracteres. Bearer de `POST /api/studio/assets/cleanup`. |
| `STUDIO_CHECKOUT_ENABLED` | Off por defecto. Solo `true`/`1`/`yes`/`on` habilita pedidos y checkout Studio v8. |
| `STUDIO_EXPORT_ENABLED` | En production, vacío = export preview cerrado. |
| `RATE_LIMIT_TRUST_PROXY` | Vacío = no confiar IP headers (clave compartida `untrusted`, límites por IP ×20). `xff` = IP agregada por el proxy (Render, Caddy). `cloudflare` solo con origen cerrado a Cloudflare. |
| `RATE_LIMIT_PROXY_HOPS` | Con `xff`: cuántos proxies agregan entradas a `X-Forwarded-For` (por defecto 1). |
| `ALERT_WEBHOOK_URL` | Opcional. Webhook https (Slack/Discord) para avisos de error del servidor. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Opcional. Analítica sin cookies; se lee en el build. |

`MERCADOPAGO_ACCESS_TOKEN_LIVE` y `MERCADOPAGO_WEBHOOK_SECRET_LIVE` no las lee el código. No las completes.

Las descargas digitales (`DIGITAL_DOWNLOADS_ENABLED`) están **siempre habilitadas en código**; no hay flag de entorno para apagarlas (evitar romper pedidos PAID). Siguen exigiendo estado PAID y cookie/clave de acceso.

Checklist de lanzamiento (configuración de Render, Neon y Mercado Pago, datos legales pendientes y riesgos): [docs/produccion-lanzamiento.md](docs/produccion-lanzamiento.md). Checklist de producción Studio: [docs/studio-v8-production-readiness.md](docs/studio-v8-production-readiness.md). Plantilla de env de producción: [deploy/env.production.example](deploy/env.production.example).

## Mercado Pago

El access token de Checkout Pro empieza con `APP_USR-` tanto en la pestaña Prueba como en la de Producción. El prefijo no alcanza para distinguirlas. `TEST-` solo sirve en `MERCADOPAGO_ENV=test`. En producción el servidor rechaza un token `TEST-`.

Antes de crear una preferencia, el servidor llama a `GET /users/me`. En prueba la cuenta tiene que ser `test_user`. En producción tiene que ser una cuenta real: correo presente, sin marca `test_user` y sin el correo oficial de prueba. Si el perfil viene incompleto, la consulta falla o no coincide con el modo, no se abre el checkout. Esta comprobación se verificó con la credencial de prueba. Una credencial de producción no se consultó desde este repositorio: un perfil real sin correo queda sin verificar y el cobro sigue cerrado.

En prueba, un pago aprobado marca el pedido solo si comprador y vendedor son cuentas `test_user`. En producción, además, `live_mode` tiene que ser verdadero y el `collector_id` del pago tiene que ser el id de `users/me`. Un pago de otra cuenta no acredita el pedido.

Un reembolso o un contracargo de un pedido que ya está `PAID` no cambia el estado ni quita la descarga. Esa revocación queda para una decisión posterior.

Sin esas credenciales el pedido se puede crear, pero el botón de pago permanece deshabilitado. Los tests de pago usan mocks y no llaman a Mercado Pago.

`MERCADOPAGO_NOTIFICATION_URL` tiene que ser `https`. Mercado Pago no puede llamar a localhost. Un túnel de desarrollo permite apuntarla a `https://<tunel>/api/payments/mercadopago`.

El regreso del navegador no marca el pedido como pagado. El estado `PAID` sale de la API de Mercado Pago, por el webhook o cuando alguien con la cookie del pedido vuelve a abrir un pedido pendiente. Esa consulta no crea un pago nuevo. Cada pedido admite seis consultas automáticas cada 15 minutos, y cada consulta revisa como máximo ocho pagos. Si Mercado Pago o la base fallan, el pedido se sigue mostrando pendiente y el registro no incluye el token.

## Entrega y recuperación

PNG, SVG y PDF se generan al descargar, solo si el pedido está pagado y la cookie httpOnly del pedido coincide. No quedan guardados en un almacenamiento externo. Las fuentes están en `assets/fonts`.

Un pedido nuevo pide un correo antes del pago y lo guarda normalizado. Los pedidos anteriores siguen con la cookie, sin correo. Desde el pedido pagado se puede generar un enlace privado de un solo uso, vigente 30 minutos. Desde otro dispositivo, `/recuperar` pide ese correo y, si hay compras pagadas, prepara el mismo tipo de enlace. La respuesta no dice si el correo tiene compras. El token se guarda solo como hash.

Al pasar a `PAID`, el servidor encola de forma atómica una fila `MailNotification` (outbox en PostgreSQL) y intenta enviar en el mismo request. Si Resend falla de forma temporal, o el proceso cae entre el pago y el envío, el cron `POST /api/mail/dispatch` (Bearer `MAIL_DISPATCH_SECRET`) reintenta sin generar un segundo correo de compra. El enlace de acceso se reutiliza cifrado en la fila hasta el envío exitoso. Fallos permanentes marcan `FAILED` y revocan el enlace; el comprador puede usar `/recuperar`.

En desarrollo, con `EMAIL_PROVIDER` vacío, el envío se “guarda” además en `.data/mail-outbox.jsonl` (mock local, no es el outbox durable). Ese directorio no se commitea.

## Comprobaciones

```bash
pnpm test        # todos los tests unitarios (links, studio, orders, payments, files, access, platform)
pnpm lint
pnpm build
pnpm typecheck
```

Tests de integración contra el PostgreSQL local (se niegan a correr contra una base remota). CI los corre en cada PR:

```bash
for f in scripts/*-pg.integration.mjs; do
  node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-test.mjs "$f"
done
```

## Operación

- `GET /api/health`: 200 si la base responde, 503 si no. Con `Authorization: Bearer $MAIL_DISPATCH_SECRET` agrega la vista de operador: qué configuración falta (sin valores), mails fallidos, pedidos pendientes con pago aprobado y la clave de rate limit del request.
- Los logs del servidor son JSON (una línea por evento, `event` + `level`). Buscá `payment.approved-but-ignored`: es un pago cobrado que no se acreditó.
- Los datos del titular y los textos legales están en `lib/legal.ts`. Mientras tengan `[COMPLETAR]`, las páginas legales muestran un aviso de borrador y el formulario de arrepentimiento queda apagado.

`pnpm typecheck` necesita `next-env.d.ts`, que genera `pnpm build` o `pnpm dev`.

## Render Free

Servicio web de Node, plan Free, rama `main`. Node 22.

Comando de build:

```bash
pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm build
```

Comando de start:

```bash
pnpm start
```

`next start` lee `PORT`. No uses `deploy/atajolab-google-qr.service`: esa unidad es para un VPS y escucha solo en `127.0.0.1`.

Cargá las variables en el panel de Render, no en el repositorio. No copies el `.env` local: apunta a un túnel, a PostgreSQL de desarrollo y a una cuenta de prueba. `DATABASE_URL` es la conexión directa de Neon, con `sslmode=require`. `APP_URL` es `https://qr.atajolab.dev`, sin barra final. Usá `deploy/env.production.example` como checklist (sin valores reales).

Para cobrar de verdad, después de desplegar este código: `MERCADOPAGO_ENV=production`, el access token `APP_USR-` de la pestaña Producción de la aplicación de Argentina, y el secreto de webhook de esa misma aplicación. `MERCADOPAGO_NOTIFICATION_URL` es `https://qr.atajolab.dev/api/payments/mercadopago`. En Mercado Pago, la URL de notificaciones tiene que ser esa misma. No uses el túnel de desarrollo. Para el correo: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` y `EMAIL_FROM`.

**Migraciones:** Neon debió partir con las tres migraciones históricas de pedidos. Studio v8 agrega cuatro más (`studio_assets`, `rate_limit_buckets`, `studio_order_attempts`, `mail_notifications`). Tras un backup, el comando pre-deploy es:

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
```

No asumas que la base ya está al día: verificá `_prisma_migrations` antes de habilitar `STUDIO_CHECKOUT_ENABLED`.

**Studio (secretos y crons, checkout off hasta GO):**

- `ORDER_ACCESS_SECRET`, `MAIL_DISPATCH_SECRET`, `STUDIO_CLEANUP_SECRET`
- Cron cada 1–5 min: `POST /api/mail/dispatch` con Bearer `MAIL_DISPATCH_SECRET`
- Cron horario: `POST /api/studio/assets/cleanup` con Bearer `STUDIO_CLEANUP_SECRET`
- Dejá `STUDIO_CHECKOUT_ENABLED` vacío/false hasta completar [docs/studio-v8-production-readiness.md](docs/studio-v8-production-readiness.md)

Si el token de producción se carga mientras sigue desplegado el código anterior, o mientras `MERCADOPAGO_ENV` sigue en `test`, el cobro puede abrirse sin poder acreditarse, o quedar cerrado. Primero el código, después las credenciales.

El plan Free tiene 0,1 CPU y 512 MB, se suspende tras 15 minutos sin tráfico y tarda cerca de un minuto en volver. Eso afecta webhooks y crons: validalo antes de tráfico comercial Studio. El dominio propio entra en el plan Hobby, con TLS. El registro de `qr.atajolab.dev` es un CNAME al host de Render. Conservá los registros de correo de `mail.atajolab.dev`.
