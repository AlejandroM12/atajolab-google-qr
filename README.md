# AtajoLab Google QR

Aplicación web para que un comercio o profesional arme un código QR con el enlace de su ubicación en Google Maps o con el enlace para dejar una reseña.

Valida el enlace, muestra la pieza y guarda el pedido en PostgreSQL. El editor ofrece tres plantillas. Un pedido pagado descarga PNG, SVG y PDF generados en el servidor, también para las plantillas anteriores. No hay cuentas de usuario. El pago usa Mercado Pago Checkout Pro solo con credenciales de prueba. Cualquier valor de `MERCADOPAGO_ENV` distinto de `test` deja el cobro deshabilitado.

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
| `DATABASE_URL` | PostgreSQL. En local apunta a `127.0.0.1:54329`. |
| `APP_URL` | Origen público de esta aplicación, sin barra final. |
| `MERCADOPAGO_ENV` | `test` habilita Checkout Pro de prueba. Otro valor lo deshabilita. |
| `MERCADOPAGO_ACCESS_TOKEN` | Access token de la pestaña Prueba. Vacío en el ejemplo. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Clave de la notificación, no el access token. |
| `MERCADOPAGO_NOTIFICATION_URL` | URL `https` que Mercado Pago llama. Vacía en local. |
| `EMAIL_PROVIDER` | Vacío en desarrollo. `resend` para enviar correos. |
| `RESEND_API_KEY` | Clave de Resend. Empieza con `re_`. No va al navegador. |
| `EMAIL_FROM` | `email@dominio` o `Nombre <email@dominio>` de un dominio verificado. |

`MERCADOPAGO_ACCESS_TOKEN_LIVE` y `MERCADOPAGO_WEBHOOK_SECRET_LIVE` no las lee el código. No las completes.

## Mercado Pago en modo de prueba

El access token de Checkout Pro empieza con `APP_USR-` tanto en la pestaña Prueba como en la de Producción. Usá solo el de Prueba. Con `MERCADOPAGO_ENV=test`, un pago aprobado marca el pedido solo si la API de Mercado Pago confirma que comprador y vendedor son cuentas `test_user`.

Sin esas credenciales el pedido se puede crear, pero el botón de pago permanece deshabilitado. Los tests de pago usan mocks y no llaman a Mercado Pago.

`MERCADOPAGO_NOTIFICATION_URL` tiene que ser `https`. Mercado Pago no puede llamar a localhost. Un túnel de desarrollo permite apuntarla a `https://<tunel>/api/payments/mercadopago`.

El regreso del navegador no marca el pedido como pagado. El estado `PAID` sale de la API de Mercado Pago, por el webhook o por la consulta del servidor al volver.

## Entrega y recuperación

PNG, SVG y PDF se generan al descargar, solo si el pedido está pagado y la cookie httpOnly del pedido coincide. No quedan guardados en un almacenamiento externo. Las fuentes están en `assets/fonts`.

Un pedido nuevo pide un correo antes del pago y lo guarda normalizado. Los pedidos anteriores siguen con la cookie, sin correo. Desde el pedido pagado se puede generar un enlace privado de un solo uso, vigente 30 minutos. Desde otro dispositivo, `/recuperar` pide ese correo y, si hay compras pagadas, prepara el mismo tipo de enlace. La respuesta no dice si el correo tiene compras. El token se guarda solo como hash.

El correo sale por Resend cuando `EMAIL_PROVIDER=resend` y el servidor tiene `RESEND_API_KEY` y `EMAIL_FROM`. Si falta la configuración o Resend rechaza el envío, el enlace no queda activo. En desarrollo, con el proveedor vacío, el mensaje queda en `.data/mail-outbox.jsonl`. Ese directorio no se commitea.

## Comprobaciones

```bash
pnpm test:links
pnpm test:orders
pnpm test:payments
pnpm test:files
pnpm test:access
pnpm lint
pnpm build
pnpm typecheck
```

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

Cargá las variables en el panel de Render, no en el repositorio. `DATABASE_URL` es la conexión directa de Neon, con `sslmode=require`. `APP_URL` es `https://qr.atajolab.dev`. Dejá `MERCADOPAGO_ENV=test` y usá el token de prueba. La notificación, si se prueba, es `https://qr.atajolab.dev/api/payments/mercadopago`. Para el correo: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` y `EMAIL_FROM`.

La base de Neon ya tiene las tres migraciones. El primer despliegue no debe volver a aplicarlas como si la base estuviera vacía. Cuando aparezca una migración nueva, el comando previo al deploy es `pnpm exec prisma migrate deploy`.

El plan Free tiene 0,1 CPU y 512 MB, se suspende tras 15 minutos sin tráfico y tarda cerca de un minuto en volver. El dominio propio entra en el plan Hobby, con TLS. El registro de `qr.atajolab.dev` es un CNAME al host de Render. Conservá los registros de correo de `mail.atajolab.dev`.
