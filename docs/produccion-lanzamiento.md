# Lanzamiento a producción — checklist

Rama: `feature/produccion-lista`. Complementa [studio-v8-production-readiness.md](studio-v8-production-readiness.md) (cutover de Studio v8). Este documento suma lo que cambió en la puesta a punto y lo que falta configurar.

## 1. Qué cambió en el código

| Área | Cambio | Archivos |
| --- | --- | --- |
| Pagos | En producción se acredita al comprador invitado o con perfil privado. Se exige `live_mode`, `collector_id` = dueño del token, monto y moneda. Se siguen rechazando usuarios de prueba. | `lib/payments/test-accounts.ts`, `lib/payments/gateway.ts` |
| Pagos | `GET /users/me` se cachea 10 min. El webhook sin firma responde 401 antes de llamar a Mercado Pago. Un pago aprobado que no se aplica genera `payment.approved-but-ignored` (error + alerta). | `lib/payments/mercadopago.ts`, `lib/payments/ignored-payment.ts`, `app/api/payments/mercadopago/route.ts` |
| Rate limit | Modo `RATE_LIMIT_TRUST_PROXY=xff` (Render/Caddy). Sin proxy confiable, los límites por IP se multiplican ×20 para no bloquear el sitio entero. Límites en Postgres para pedidos heredados, checkout, reconciliación, descargas, recuperación, export y arrepentimiento. | `lib/client-ip.ts`, `lib/rate-limit/policies.ts`, rutas en `app/api/**` |
| Seguridad | CSP, HSTS (solo con https), X-Frame-Options, nosniff, Permissions-Policy. Chequeo de Origin en todos los POST con cookie. Lectura de body con tope real (también chunked). Links de acceso con página de confirmación + POST (los escáneres de correo ya no los gastan). | `next.config.ts`, `lib/security-headers.ts`, `lib/http/body.ts`, `app/acceso/[token]/route.ts` |
| Producto | El QR de un pedido tiene que ser un link de Google Maps o de reseñas. Control de densidad del QR (link largo en QR chico). Los pedidos ya pagados se siguen descargando igual. | `lib/studio/export/validate.ts`, `lib/studio/qr-density.ts` |
| Rendimiento | Home: HTML de 1.025 KB → 61 KB. Las muestras ya no embeben fuentes en base64; son WebP de ~22 KB con caché de 1 año. `/crear` ya no renderiza 6 PNG por request. | `app/previews/**`, `lib/landing-samples.ts`, `lib/studio/inspiration-preview*.ts` |
| SEO | `robots.txt`, `sitemap.xml`, `metadataBase`, canonical, imagen OG, Twitter card, JSON-LD (Organization, WebSite, Product, FAQPage). `noindex` en `/pedido`, `/recuperar`, `/acceso` y `/api`. Copy corregido: no se ofrece "sticker". | `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`, `lib/site.ts` |
| Observabilidad | Logs JSON con mensaje y stack, sin emails ni tokens. Alerta opcional por webhook. `/api/health` (público) + vista de operador. Los errores del navegador llegan a los logs. `global-error.tsx`. | `lib/log.ts`, `lib/health.ts`, `app/api/health`, `app/api/client-error`, `app/error.tsx`, `app/global-error.tsx` |
| Compra | La página del pedido se actualiza sola mientras el pago está "en verificación". Textos para el comprador sin jerga interna. Una sola vista de pedido para todas las versiones (sin duplicación). Checkbox de términos en el checkout. | `components/order-payment-actions.tsx`, `components/order-summary.tsx`, `components/order-downloads.tsx`, `components/studio/studio-panels.tsx` |
| Legal | `/terminos`, `/privacidad`, `/reembolsos`, `/arrepentimiento` (formulario + código de solicitud), `/contacto`, `/preguntas-frecuentes`. Datos del titular centralizados con marcadores `[COMPLETAR]`. | `lib/legal.ts`, `app/*/page.tsx`, `app/api/arrepentimiento` |
| Medición | Plausible opcional (sin cookies) con eventos del embudo. | `components/analytics-script.tsx`, `lib/analytics.ts` |
| CI | Postgres como servicio, `migrate deploy`, chequeo de drift, 6 tests de integración, auditoría de dependencias. Dependabot. | `.github/workflows/ci.yml`, `.github/dependabot.yml` |

## 2. Datos que tenés que completar (bloquean la venta)

Todo está en `lib/legal.ts`. Solo faltan los datos del titular marcados con `pending("…")`. Mientras falte alguno, en producción la venta queda cerrada y las páginas legales muestran el aviso de borrador.

| Campo | Qué poner | Dónde se muestra |
| --- | --- | --- |
| `taxId` | CUIT | términos, privacidad, contacto |
| `taxCondition` | condición frente al IVA (define si el precio incluye IVA) | términos, contacto |
| `address` | domicilio legal o comercial | términos, privacidad, contacto |

Ya cargados: titular, correo y horario de atención, jurisdicción, conservación de datos, reembolsos, correcciones y enlace oficial de Defensa del Consumidor. Opcional: `supportPhone` (WhatsApp; vacío lo oculta). `GET /api/health` de operador lista lo que falta en `config.legalPending`. Botón de arrepentimiento: Ley 24.240 art. 34 y Disposición 954/2025 (derogó la Res. 424/2020).

## 3. Configuración

### Render

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | no hace falta: `next build` y `next start` usan `production` |
| `APP_URL` | `https://qr.atajolab.dev` (también se usa en el build para canonical/sitemap) |
| `DATABASE_URL` | Neon, conexión directa, `sslmode=require` |
| `MERCADOPAGO_ENV` | `production` |
| `MERCADOPAGO_ACCESS_TOKEN` | `APP_USR-…` de la pestaña Producción |
| `MERCADOPAGO_WEBHOOK_SECRET` | clave secreta de notificaciones de la misma aplicación |
| `MERCADOPAGO_NOTIFICATION_URL` | `https://qr.atajolab.dev/api/payments/mercadopago` |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` / `EMAIL_FROM` | `resend` / `re_…` / remitente de dominio verificado |
| `ORDER_ACCESS_SECRET` | ≥32 caracteres aleatorios (obligatorio también para los mails de pedidos v7) |
| `MAIL_DISPATCH_SECRET` | ≥16 caracteres (cron de mails + health de operador) |
| `STUDIO_CLEANUP_SECRET` | ≥16 caracteres |
| `RATE_LIMIT_TRUST_PROXY` | `xff` (verificar, ver abajo) |
| `RATE_LIMIT_PROXY_HOPS` | `1` |
| `ALERT_WEBHOOK_URL` | webhook https de Slack/Discord (recomendado) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | opcional; requiere cuenta en Plausible y rebuild |
| `STUDIO_CHECKOUT_ENABLED` | vacío hasta terminar el checklist; después `true`. Primer interruptor de la venta; la venta abre cuando también está `STUDIO_SALES_CONFIRMED=true`. Los datos legales pendientes (`[COMPLETAR]`) no la cierran |
| `ALLOW_REMOTE_DATABASE` | `1` (la app rechaza bases remotas fuera de Render; Render define `RENDER=true`, pero dejalo explícito) |
| `RATE_LIMIT_HASH_SECRET` | opcional; clave del hash de IP (si falta, usa `ORDER_ACCESS_SECRET`) |
| `STUDIO_EXPORT_ENABLED` | vacío (si lo activás, regala archivos sin pago) |

**Crons** (Render Cron Job o un servicio externo):

- cada 1–5 min: `POST /api/mail/dispatch` con `Authorization: Bearer $MAIL_DISPATCH_SECRET`
- cada 1 h: `POST /api/studio/assets/cleanup` con `Authorization: Bearer $STUDIO_CLEANUP_SECRET`
- cada 5 min: `GET /api/health` (uptime; en Free además evita que el servicio se duerma)

**Plan**: Render Free duerme el servicio a los 15 min. Un webhook que llega dormido tarda ~1 min y Mercado Pago reintenta, pero la descarga y el primer render quedan lentos (0,1 CPU). Para vender, pasá a un plan sin sleep (Starter) o aceptá el riesgo con el ping de health.

**Verificar el rate limit**: con el servicio desplegado, desde Wi-Fi y desde datos móviles:

```bash
curl -s https://qr.atajolab.dev/api/health -H "Authorization: Bearer $MAIL_DISPATCH_SECRET"
```

Tienen que cumplirse las dos pruebas:

1. `rateLimit.clientKey` es distinto en cada red (los límites son por visitante).
2. **Anti-falsificación**: repetí el pedido desde la misma red agregando `-H "X-Forwarded-For: 1.2.3.4"` y después `-H "X-Forwarded-For: 5.6.7.8"`. La clave **no** puede cambiar. Si cambia, `RATE_LIMIT_PROXY_HOPS` está más alto que la cantidad real de proxies y la IP es falsificable: bajalo.

Si la prueba 1 falla con `HOPS=1` (misma clave en las dos redes), probá `HOPS=2` y repetí la prueba 2. Si no encontrás un valor que pase las dos, dejá `RATE_LIMIT_TRUST_PROXY` vacío: los límites ×20 siguen protegiendo.

### Neon

1. Backup (branch o `pg_dump`) **antes** de migrar.
2. `pnpm exec prisma migrate deploy` y `pnpm exec prisma migrate status` contra Neon. Son las 4 migraciones de Studio v8 que siguen pendientes; esta rama no agrega ninguna.
3. El `.env` de esta máquina tiene `DATABASE_URL` de Neon. Desde esta rama la app **se niega** a usarla fuera de Render (`lib/db-guard.ts`): `pnpm dev` y `next start` locales fallan con un mensaje claro y no se conectan. Cambiá el `.env` a la base local de Docker. Para migrar Neon, pasá la URL solo a ese comando (`DATABASE_URL=… pnpm exec prisma migrate deploy`); el CLI de Prisma no usa el guard.

### Mercado Pago

1. Aplicación de Argentina, pestaña **Producción**: access token `APP_USR-…` y clave secreta de Webhooks.
2. Webhooks → URL `https://qr.atajolab.dev/api/payments/mercadopago`, evento **Pagos**.
3. La cuenta vendedora tiene que tener email visible en `/users/me` (el servidor lo exige para abrir el cobro). `GET /api/health` de operador muestra `paymentsCredentialShape`.
4. Hacé **una compra real controlada** (F2) con otra persona/tarjeta. Es el único modo de confirmar la acreditación con un comprador real: los tests cubren comprador invitado y perfil privado, pero no la API real de producción.

### Resend

1. Dominio de envío verificado en Resend (registros SPF y DKIM en el DNS de `mail.atajolab.dev`; conservá los que ya existen).
2. `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=re_…` (permiso de envío), `EMAIL_FROM=AtajoLab <pedidos@mail.atajolab.dev>` (no `@resend.dev`).
3. La casilla de `supportEmail` en `lib/legal.ts` tiene que existir y leerse: recibe las solicitudes de arrepentimiento.

## 4. Checklist operativo de lanzamiento

En los comandos, `APP=https://qr.atajolab.dev` y `OPS=<valor de MAIL_DISPATCH_SECRET>`. Ningún comando de esta lista borra datos.

**A. Antes de integrar (local)**

- [ ] `.env` local con la base de Docker: `DATABASE_URL=postgresql://atajolab:<clave>@127.0.0.1:54329/atajolab_google_qr`
- [ ] `lib/legal.ts` sin `[COMPLETAR]` (CUIT, condición fiscal, domicilio)
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- [ ] PR `feature/produccion-lista` → `develop`, CI verde; después `develop` → `main`

**B. Neon (una sola vez, antes del deploy)**

- [ ] Backup: en la consola de Neon, crear un branch del primario (por ejemplo `backup-pre-studio-v8`)
- [ ] Estado: `DATABASE_URL='<neon-directa>' pnpm exec prisma migrate status`; tienen que figurar 4 migraciones pendientes de Studio
- [ ] Aplicar: `DATABASE_URL='<neon-directa>' pnpm exec prisma migrate deploy`
- [ ] Confirmar: repetir `migrate status`, que debe decir `Database schema is up to date!`

**C. Render**

- [ ] Variables de la tabla §3 cargadas, con `STUDIO_CHECKOUT_ENABLED` todavía vacío
- [ ] Build `pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm build`; start `pnpm start`
- [ ] Deploy de `main`
- [ ] `curl -s $APP/api/health` responde `{"status":"ok","database":"ok"}`
- [ ] `curl -s $APP/api/health -H "Authorization: Bearer $OPS"`:
  - `paymentsCredentialShape: "ready"`, `mailMode: "resend"`, `orderAccessSecretSet` y `cleanupSecretSet` en `true`
  - `legalPending: []`
  - `signals` en 0
- [ ] Rate limit (§3), desde dos redes y con `-H "X-Forwarded-For: 1.2.3.4"`
- [ ] Crons: `curl -s -X POST $APP/api/mail/dispatch -H "Authorization: Bearer $OPS"` → `{"ok":true,…}`. Después programar ese, el de cleanup y el de health
- [ ] Alertas: `curl -s -X POST "$ALERT_WEBHOOK_URL" -H 'content-type: application/json' -d '{"text":"prueba AtajoLab","content":"prueba AtajoLab"}'` tiene que llegar al canal
- [ ] Plan sin sleep, o riesgo aceptado

**D. Mercado Pago**

- [ ] Credenciales de Producción y webhook (§3)
- [ ] En el panel de Webhooks, usar "Simular notificación" sobre la URL. Tiene que responder 200; un 401 (`payment.webhook.unauthentic` en el log) significa que `MERCADOPAGO_WEBHOOK_SECRET` no es el correcto

**E. Abrir la venta**

- [ ] `STUDIO_CHECKOUT_ENABLED=true` y redeploy; el health de operador debe mostrar `studioSalesOpen: true`
- [ ] Compra real controlada con otra persona o tarjeta:
  - pedido PAID;
  - mail recibido;
  - PNG, PDF y SVG descargados;
  - el QR impreso escanea;
  - el link de acceso funciona desde otro dispositivo;
  - `/recuperar` funciona.
- [ ] Reembolsar esa compra desde Mercado Pago (opcional)
- [ ] Arrepentimiento: enviar una solicitud de prueba y verificar que llega a `supportEmail`
- [ ] Recién entonces: tráfico y marketing

**Rollback rápido**: vaciar `STUDIO_CHECKOUT_ENABLED` y redeploy. Cierra las ventas nuevas; los pedidos pagados siguen descargando.

## 5. Riesgos que siguen abiertos

1. **Acreditación real sin probar contra la API de producción.** La lógica está corregida y testeada, pero falta la compra controlada.
2. **Datos legales y políticas de reembolso sin definir.** Vender sin identificar al vendedor incumple la Ley 24.240.
3. **Sin facturación.** Si corresponde emitir factura (según condición fiscal), hoy no hay integración con ARCA/AFIP; se haría a mano.
4. **Render Free.** Sleep + 0,1 CPU: webhooks lentos y descargas lentas la primera vez.
5. **Reembolsos/contracargos no revocan el acceso** (decisión documentada; con un producto digital es razonable, pero revisalo).
6. **Descargas se renderizan en cada pedido** (con límite de 40/h por pedido). Alcanza para el volumen inicial; si crece, cachear el archivo generado.
7. **Editor sin teclado**: no hay lista de capas ni movimiento con flechas (accesibilidad, P2).
8. **Autoguardado en sessionStorage**: cerrar la pestaña pierde el borrador (P2).
9. **La aceptación de términos se exige en el servidor** (`acceptedTerms: true` en `POST /api/orders`) y queda en los logs (`order.terms-accepted`, con la versión de los textos), pero **no en la base**. Para evidencia durable, sumar `Order.termsAcceptedAt` (requiere una migración nueva).
10. **Datos legales y venta separados.** Los `[COMPLETAR]` de `lib/legal.ts` ya no cierran el checkout: se muestran en las páginas legales y en el health de operador (`legalDataComplete`, solo informativo). Antes de activar `STUDIO_SALES_CONFIRMED`, el operador decide si los términos publicados alcanzan para cobrar (Ley 24.240: identificar al vendedor); esa decisión es suya, no un chequeo automático de los marcadores.

## Cómo se abren las ventas (y qué cambia solo en el sitio)

Hoy está abierto solo el primer QR gratis (`FREE_FIRST_QR_ENABLED`). La venta de QR adicionales abre cuando están las **dos** variables: `STUDIO_CHECKOUT_ENABLED=true` (checkout) y `STUDIO_SALES_CONFIRMED=true` (confirmación del operador). Ninguna depende de los datos legales de `lib/legal.ts`: los `[COMPLETAR]` no abren ni cierran la venta.

`STUDIO_SALES_CONFIRMED` es el "ok, salimos" del operador. Se activa recién cuando:

1. Mercado Pago está configurado (`MERCADOPAGO_ENV`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_NOTIFICATION_URL`) y el health de operador muestra `paymentsCredentialShape: "ready"` y `webhookSecretSet: true`.
2. La simulación de notificación del panel de Mercado Pago responde 200 y una compra real controlada deja el pedido PAID, la descarga y el correo funcionando.
3. Los términos, la privacidad y los reembolsos publicados fueron revisados para cobrar (identificación del vendedor según la Ley 24.240: CUIT, condición fiscal y domicilio en `lib/legal.ts` cuando existan).

Los textos públicos de precio y pago (landing, preguntas frecuentes, términos, resumen del pedido, panel de descarga y datos estructurados) siguen el estado real de la compra (`purchasesAvailable()` en `lib/payments/availability.ts`): sin venta abierta o con Mercado Pago sin configurar no muestran precio ni ofrecen una compra, y cuando se puede pagar vuelven solos. Las descargas pagas siguen exigiendo un pago aprobado y verificado contra la API de Mercado Pago (`PAID`).
