# Studio v8 — Production readiness (F1 / F1.1)

Documento de auditoría de infraestructura para habilitar comercialmente AtajoLab Studio v8.  
**No habilita checkout, no aplica migraciones de producción, no configura secrets ni cron.**

Rama de trabajo: `studio/production-readiness-v8` (desde `develop` con PR #19 mergeado: `ba4ce7a`).  
Destino de producción documentado: `https://qr.atajolab.dev` (Render + Neon + Cloudflare DNS + Resend + Mercado Pago).

### F1.1 (código + docs)

- Política centralizada de IP para rate limits: `lib/client-ip.ts` (default **no confía** headers).
- Recovery alineado (ya no usa XFF leftmost).
- README + `deploy/env.production.example` actualizados.
- `DIGITAL_DOWNLOADS_ENABLED` permanece hardcode `true` a propósito (sin flag env).

---

## 1. Arquitectura real detectada

```
Cliente (navegador)
  │  HTTPS
  ▼
Cloudflare (CNAME qr.atajolab.dev → Render)
  │  (IP headers solo confiables si RATE_LIMIT_TRUST_PROXY=cloudflare
  │   y el origen está cerrado a Cloudflare — ver §4)
  ▼
Render Web Service (Next.js 16 / Node 22, plan Free documentado)
  │
  ├─ PostgreSQL Neon (Order, StudioAsset, StudioOrderAttempt,
  │                   RateLimitBucket, MailNotification,
  │                   DownloadAccessLink/Credential)
  │
  ├─ Mercado Pago Checkout Pro
  │     webhook POST /api/payments/mercadopago
  │     reconcile desde /pedido/[publicId]
  │
  └─ Resend (EMAIL_PROVIDER=resend)
        compra: MailNotification outbox + POST /api/mail/dispatch
        recuperación: POST /api/access/recover (best-effort)
```

### Superficies Studio v8

| Área | Rutas / piezas | Flag |
| --- | --- | --- |
| Editor | `/studio`, draft cookie HttpOnly | siempre (UI) |
| Export preview | `/api/studio/export/[format]` | `STUDIO_EXPORT_ENABLED` (prod off por defecto) |
| Upload privado | `POST /api/studio/assets`, `POST /api/studio/draft` | sesión draft + Origin/Referer |
| Pedido + checkout | `POST /api/orders` (v8), checkout existente | **`STUDIO_CHECKOUT_ENABLED` off por defecto** |
| Descargas PAID | `/api/orders/[id]/files/[format]` | cookie delivery / access credential |
| Email compra | outbox `MailNotification` + `/api/mail/dispatch` | Resend + secrets |
| Cleanup assets | `/api/studio/assets/cleanup` | `STUDIO_CLEANUP_SECRET` |
| v7 clásico | `/crear`, pedidos artwork v1–v7 | independiente del flag Studio |

### Persistencia relevante

- **Assets:** bytes en `StudioAsset` (TEMPORARY 48h / RETAINED ligado a Order).
- **Idempotencia pedido:** `StudioOrderAttempt` + deliveryKey derivado con `ORDER_ACCESS_SECRET`.
- **Rate limit:** `RateLimitBucket` en PostgreSQL (compartido entre instancias).
- **Mail compra:** `MailNotification` unique `(orderId, kind=PURCHASE_ACCESS)`; token AES-256-GCM hasta `SENT`/`FAILED`.
- **Sin Redis** y sin object storage externo.

### Hosting (README actual)

- Render Free: 0,1 CPU / 512 MB, **suspende tras ~15 min sin tráfico**, cold start ~1 min.
- Neon: `DATABASE_URL` con host **directo** y `sslmode=require` (no hay `DIRECT_URL` en Prisma).
- Cloudflare: DNS + TLS en dominio; correo en `mail.atajolab.dev`.

---

## 2. Checklist de configuración (separado por fase)

### 2.1 Antes de desplegar código Studio (migrate + secrets, checkout off)

- [ ] Backup lógico de Neon.
- [ ] `pnpm exec prisma migrate deploy` + verificación §3.3.
- [ ] Deploy del build (`generate` + `build`); rama según proceso (README cita `main` históricamente).
- [ ] `APP_URL=https://qr.atajolab.dev`
- [ ] `DATABASE_URL` Neon directa + SSL
- [ ] `ORDER_ACCESS_SECRET` ≥32
- [ ] `MAIL_DISPATCH_SECRET` ≥16 + cron dispatch (§5)
- [ ] `STUDIO_CLEANUP_SECRET` ≥16 + cron cleanup (§5)
- [ ] Resend: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (no `@resend.dev`)
- [ ] MP production ya alineado (v7): env, token, webhook secret, notification URL
- [ ] `STUDIO_CHECKOUT_ENABLED` **ausente/false**
- [ ] `RATE_LIMIT_TRUST_PROXY` vacío (recomendado) **o** `cloudflare` solo tras origin lockdown
- [ ] Smoke §7 verde

### 2.2 Antes de habilitar checkout Studio (`STUDIO_CHECKOUT_ENABLED=true`)

- [ ] Todo §2.1 en verde
- [ ] Crons dispatch + cleanup observados (ideal ≥24h) sin 401/timeouts recurrentes
- [ ] Mitigación aceptada de Render Free sleep (C3) o plan sin sleep
- [ ] Plan F2 (§9) con operador y email de prueba
- [ ] Rollback: saber apagar el flag en menos de 5 minutos

### 2.3 Antes de recibir compradores reales (post-F2 OK)

- [ ] Compra controlada F2 exitosa (mail SENT, descargas OK, recovery OK)
- [ ] Sin `MailNotification` FAILED anómalos
- [ ] Monitoreo mínimo §10 en marcha
- [ ] Marketing / tráfico abierto solo después de lo anterior

### Variables (clasificación)

| Variable | Clase | Secreta | Antes deploy código | Antes habilitar checkout | Notas |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | obligatoria | sí | sí | sí | Neon directo + `sslmode=require` |
| `APP_URL` | obligatoria | no | sí | sí | Origen público canónico |
| `MERCADOPAGO_ENV` | obligatoria cobro | no | sí (prod) | sí | `production` |
| `MERCADOPAGO_ACCESS_TOKEN` | obligatoria cobro | sí | sí | sí | `APP_USR-` pestaña Producción |
| `MERCADOPAGO_WEBHOOK_SECRET` | obligatoria cobro | sí | sí | sí | Firma webhook |
| `MERCADOPAGO_NOTIFICATION_URL` | obligatoria cobro | no | sí | sí | `https://qr.atajolab.dev/api/payments/mercadopago` |
| `EMAIL_PROVIDER` | obligatoria mail | no | sí | sí | `resend` |
| `RESEND_API_KEY` | obligatoria mail | sí | sí | sí | Prefijo `re_` |
| `EMAIL_FROM` | obligatoria mail | no* | sí | sí | Dominio verificado (*no es secreto pero es sensible) |
| `ORDER_ACCESS_SECRET` | obligatoria Studio | sí | **sí** (antes migrate/checkout) | sí | ≥32; sin ella prod Studio no deriva deliveryKey |
| `MAIL_DISPATCH_SECRET` | obligatoria mail durable | sí | sí | sí | ≥16; Bearer cron |
| `STUDIO_CLEANUP_SECRET` | obligatoria ops Studio | sí | sí | sí | ≥16; Bearer cron |
| `STUDIO_CHECKOUT_ENABLED` | flag | no | **no** (debe estar off) | **sí = true** solo en GO | Default off |
| `STUDIO_EXPORT_ENABLED` | opcional | no | opcional | opcional | Preview export; off recomendado |
| `DIGITAL_DOWNLOADS_ENABLED` | N/A env | — | — | — | Hardcode `true` a propósito; no introducir flag |
| `RATE_LIMIT_TRUST_PROXY` | opcional | no | sí (vacío) | sí | Default off; `cloudflare` solo con origen cerrado |
| `DIRECT_URL` | no usada | — | — | — | Schema Prisma solo `DATABASE_URL` |
| `POSTGRES_PASSWORD` | solo local | sí | no | no | Docker compose local |

Plantilla actualizada: `deploy/env.production.example`.

---

## 3. Migraciones

### 3.1 Inventario (orden de aplicación)

| # | Migración | Contenido Studio / comercial |
| --- | --- | --- |
| 1 | `20261027160411_init_orders` | Orders base (prod histórica) |
| 2 | `20261027171500_payment_audit` | Auditoría MP |
| 3 | `20261027194500_buyer_access` | Email + access links/credentials |
| 4 | **`20261103160000_studio_assets`** | `StudioAsset` |
| 5 | **`20261103180000_rate_limit_buckets`** | `RateLimitBucket` |
| 6 | **`20261103210000_studio_order_attempts`** | `StudioOrderAttempt` |
| 7 | **`20261103223000_mail_notifications`** | `MailNotification` + enums |

README histórico: “Neon ya tiene las tres migraciones”. Las **cuatro** filas 4–7 son **pendientes de confirmar en producción**. Asumir que faltan hasta verificar `_prisma_migrations`.

### 3.2 Comando (producción — no ejecutar en F1)

```bash
# En un entorno con DATABASE_URL de producción (CI/ops), tras backup:
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
```

Build Render documentado hoy:

```bash
pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm build
```

**Recomendación:** correr `migrate deploy` como paso explícito pre-deploy o release command, no solo `generate`. `generate` no aplica SQL.

### 3.3 Verificación posterior

```sql
SELECT migration_name, finished_at
FROM "_prisma_migrations"
ORDER BY finished_at;

SELECT to_regclass('"StudioAsset"') AS studio_asset,
       to_regclass('"RateLimitBucket"') AS rate_limit,
       to_regclass('"StudioOrderAttempt"') AS order_attempt,
       to_regclass('"MailNotification"') AS mail_notification;
```

Esperado: las cuatro relaciones no-nulas y las siete migraciones `finished_at` no nulo.

### 3.4 Backup

1. Snapshot / export Neon (punto en el tiempo o `pg_dump` lógico) **antes** de `migrate deploy`.
2. Conservar dump ≥7 días y el hash del commit desplegado.
3. Anotar hora UTC del backup y del migrate.

### 3.5 Rollback operativo de migraciones

Prisma no ofrece rollback automático de SQL ya aplicado.

| Situación | Acción |
| --- | --- |
| Migrate falló a mitad | Restaurar backup Neon; no habilitar Studio; corregir y reintentar |
| Migrate OK pero app rota | Revertir deploy de la app al release anterior; **dejar tablas nuevas** (compatibles / unused) o restaurar backup si hubo corrupción |
| Checkout ya habilitado y hay pedidos v8 | **No borrar** `StudioAsset` / `MailNotification`; rollback solo del flag `STUDIO_CHECKOUT_ENABLED` |

No escribir migraciones “down” ad-hoc en caliente sin backup.

---

## 4. Riesgos (por severidad)

### Críticos (bloquean GO comercial)

| ID | Riesgo | Evidencia | Mitigación |
| --- | --- | --- | --- |
| C1 | Migraciones Studio no aplicadas en Neon | README “tres migraciones”; 4 nuevas en repo | Verificar + `migrate deploy` tras backup |
| C2 | Sin cron mail, compras PAID pueden quedar sin email tras fallo Resend / cold start | Outbox requiere `/api/mail/dispatch` | Configurar cron 1–5 min + secret; monitorear `PENDING` |
| C3 | Render Free suspende el servicio | README Free sleep | Cron externo que despierte el servicio; o plan que no duerma antes de tráfico comercial |
| C4 | `ORDER_ACCESS_SECRET` ausente en prod | Requerido para deliveryKey v8 | Setear ≥32 chars antes de checkout |

### Altos

| ID | Riesgo | Mitigación |
| --- | --- | --- |
| A1 | ~~Recovery XFF~~ **Resuelto en F1.1** — política `lib/client-ip.ts` | Default `untrusted`; opt-in cloudflare documentado |
| A2 | Origen Render alcanzable sin Cloudflare: headers CF forjables | No activar `RATE_LIMIT_TRUST_PROXY=cloudflare` sin firewall; default off es seguro |
| A3 | Cold start + webhook MP: timeouts / 500 → reintentos MP OK, pero UX de retorno demorada | Smoke webhook; considerar plan sin sleep |
| A4 | `deploy/env.production.example` y tramo README “no ejecutes migrate” desactualizados | Actualizar docs en PR de readiness / deploy |

### Medios

| ID | Riesgo | Mitigación |
| --- | --- | --- |
| M1 | Recovery limiter **in-memory** (no Postgres): por instancia / se pierde con sleep | Aceptable a bajo volumen; migrar a `RateLimitBucket` si hay abuso |
| M2 | Assets BYTEA en Neon: crecimiento disco / costo | TTL cleanup + cuotas draft; alerta tamaño DB |
| M3 | Sin métricas/alertas estructuradas | Consultas SQL + logs Render (§7) |
| M4 | Reembolsos MP no revocan PAID/descarga (decisión de producto) | Documentado; no cambiar en F1 |

### Bajos / aceptados

| ID | Riesgo | Notas |
| --- | --- | --- |
| B1 | `DIGITAL_DOWNLOADS_ENABLED` hardcode | Intencional (F1.1): evitar apagar descargas PAID por accidente |
| B2 | Export Studio preview separado del checkout | Flag propio |
| B3 | Sin `DIRECT_URL` | OK si `DATABASE_URL` ya es directa |

---

## 5. Cron jobs (definir, no configurar aún)

### 5.1 `POST /api/mail/dispatch`

| Campo | Valor recomendado |
| --- | --- |
| Frecuencia | Cada **2 minutos** (rango 1–5) |
| Auth | `Authorization: Bearer $MAIL_DISPATCH_SECRET` (≥16) |
| Timeout cliente | ≥60 s (job usa txn Prisma hasta 60s) |
| Concurrencia | Advisory lock `MAIL_DISPATCH_LOCK_KEY`; overlapping → skip |
| Logs | Respuesta JSON `{ ok, claimed, sent, held, retryable, failed, skipped }` — **sin tokens** |
| Alertas | HTTP 401 sostenido; `failed>0`; filas `PENDING` con `attempts` altas; `FAILED` nuevo |
| Reintentos cron | El propio outbox reintenta con backoff; el cron solo debe volver a llamar |

### 5.2 `POST /api/studio/assets/cleanup`

| Campo | Valor recomendado |
| --- | --- |
| Frecuencia | **Horario** |
| Auth | `Authorization: Bearer $STUDIO_CLEANUP_SECRET` (≥16) |
| Timeout | ≥60 s |
| Concurrencia | Advisory lock cleanup |
| Logs | `{ ok, skipped, deletedAssets, deletedRateBuckets }` |
| Alertas | 401; `cleanup-failed`; crecimiento de `TEMPORARY` vencidos |

### 5.3 Proveedor de cron

Opciones sin Redis:

1. **Render Cron Jobs** (si el plan lo permite) hacia la URL pública.
2. Cron externo (GitHub Actions scheduled / otro) con secret en secrets store.

**Importante con Free sleep:** el primer hit del cron paga cold start; si supera el timeout del scheduler, el dispatch no corre. Validar en staging/prod con un ping autenticado antes del GO.

---

## 6. Procedimiento de despliegue (F1 → código listo, checkout off)

1. Backup Neon.
2. `pnpm exec prisma migrate deploy` contra prod (ventana corta).
3. Verificar tablas (§3.3).
4. Setear secrets nuevos en Render (sin imprimir valores): `ORDER_ACCESS_SECRET`, `MAIL_DISPATCH_SECRET`, `STUDIO_CLEANUP_SECRET`.
5. Confirmar `STUDIO_CHECKOUT_ENABLED` unset/false.
6. Deploy del build (`generate` + `build` + `start`).
7. Configurar crons (§5) y probar 401 sin secret / 200 con secret.
8. Smoke §7.
9. Observar 24h (§7 métricas manuales).
10. **No** poner `STUDIO_CHECKOUT_ENABLED=true` hasta criterios GO (§8).

### Rollback de deploy

1. `STUDIO_CHECKOUT_ENABLED` off (si se hubiera encendido).
2. Redeploy release anterior en Render.
3. Crons pueden quedar (endpoints antiguos deben seguir rechazando sin secret o no existir — preferir deploy forward-only tras migrate).
4. DB: no revertir migraciones; solo restore desde backup si hay corrupción.

---

## 7. Smoke tests (sin compra Studio real)

Ejecutar contra `https://qr.atajolab.dev` tras deploy+migrate, **con checkout off**:

1. `GET /` y `/studio` → 200; editor carga.
2. `POST /api/orders` body v8 → **403/flag off** (no crea pedido Studio).
3. Pedido v7 existente PAID (si hay) → descarga PNG con cookie sigue OK.
4. `POST /api/mail/dispatch` sin Bearer → 401; con Bearer → 200 JSON.
5. `POST /api/studio/assets/cleanup` sin Bearer → 401; con Bearer → 200.
6. `POST /api/access/recover` email inventado → `{ status: "accepted" }` (no filtra existencia).
7. Webhook MP: sin firma válida → 401 (no altera órdenes).
8. SQL: `MailNotification` / `StudioAsset` accesibles; sin errores de schema en logs.

Integraciones **locales** (Postgres local + mocks), ya usadas en desarrollo:

- `scripts/studio-delivery-email-v8-pg.integration.mjs`
- `scripts/studio-checkout-v8-pg.integration.mjs`
- `scripts/studio-downloads-pg.integration.mjs`
- `scripts/studio-secure-upload-pg.integration.mjs`

---

## 8. Criterios GO / NO-GO

### GO deploy código (checkout off) — §2.1

- Migraciones 4–7 en Neon verificadas.
- Secrets Studio/mail/cleanup cargados.
- Crons configurados y respondiendo 200 con Bearer.
- `STUDIO_CHECKOUT_ENABLED` off.
- Smoke §7 verde.

### GO habilitar checkout (flip flag) — §2.2

- Todo GO deploy.
- Crons estables; C3 sleep mitigado o aceptado por escrito.
- Plan F2 listo.

### GO compradores reales — §2.3

- F2 exitoso; sin FAILED mail anómalos; monitoreo mínimo.

### NO-GO (cualquier fase)

- Falta migración Studio / errores de schema.
- Sin cron mail o secret inválido.
- `ORDER_ACCESS_SECRET` ausente/corto en production con intención de checkout.
- Cold starts rompen webhook/cron de forma recurrente.
- `RATE_LIMIT_TRUST_PROXY=cloudflare` sin origin lockdown (no bloquear deploy, sí corregir antes de confiar en IP).

---

## 9. Procedimiento de compra controlada (F2)

**Objetivo:** una sola compra Studio v8 real (o MP production de monto catálogo) con checkout habilitado temporalmente, sin abrir marketing.

1. **Preflight:** checklist GO §8; backup Neon; anunciar ventana.
2. **Enable:** `STUDIO_CHECKOUT_ENABLED=true` en Render; reinicio/redeploy si hace falta leer env.
3. **Actores:** un operador; email de prueba controlado; tarjeta/cuenta MP de producción o flujo acordado por finanzas.
4. **Pasos:**
   1. Abrir `/studio`, diseñar A6 mínimo (QR válido + título).
   2. Preparar pedido → PENDING; anotar `publicId`.
   3. Pagar por Checkout Pro.
   4. Confirmar `Order.status=PAID` (webhook o reconcile en `/pedido/...`).
   5. Verificar `MailNotification` → `SENT` (o `PENDING` luego `SENT` vía cron).
   6. Abrir enlace del mail (o recovery) **sin** depender solo de la cookie original.
   7. Descargar PNG, SVG, PDF; comprobar filename/snapshot.
5. **Datos a capturar:** `publicId`, payment id MP, `MailNotification.status`, timestamps, cold-start sí/no.
6. **Disable inmediato si falla grave:** `STUDIO_CHECKOUT_ENABLED=false`.
7. **Post:** si OK, dejar flag on solo con monitoreo; si no, off + incidente + no marketing.
8. **Prohibido en F2:** carga masiva, ads, cambiar precios, tocar webhook MP, enviar campaigns Resend.

---

## 10. Observabilidad mínima (sin servicios nuevos)

Usar logs Render + SQL Neon:

| Señal | Cómo |
| --- | --- |
| Pagos aprobados | Conteos `Order` `PAID` / día; logs webhook |
| PAID sin mail SENT | `Order` PAID join `MailNotification` where status ≠ SENT |
| Mail FAILED | `MailNotification` status FAILED + `lastError` (código corto) |
| Fallos cron | HTTP ≠ 200 o 401 en dispatch/cleanup |
| Descargas | 403/404/500 en `/files/` |
| TEMPORARY no limpios | `StudioAsset` TEMPORARY `expiresAt < now()` |
| Errores MP | logs `payment lookup failed` / checkout 503 |

Alertas operativas iniciales: revisión diaria manual o query guardada; escalar a uptime ping autenticado de `/api/mail/dispatch` si el volumen crece.

---

## 11. Mercado Pago y Resend (estado de código)

- Webhook público autenticado (`x-signature` + secret); topic `payment`; apply idempotente vía `decidePayment` + `updateMany PENDING`.
- PAID + enqueue mail atómicos; dispatch best-effort post-commit.
- Reconcile desde página de pedido con cookie.
- Resend: `sent` / `retryable` (429/5xx/red) / `refused` (4xx).
- Recovery no revela si el email existe; falla de provider revoca links emitidos.
- **No** ejecutar pagos ni emails reales en F1.

---

## 12. Seguridad (resumen de verificación)

### Política de IP / rate limit (F1.1)

Implementación: `lib/client-ip.ts` → usada por Studio (draft/upload/orders) y `/api/access/recover`.

| Modo `RATE_LIMIT_TRUST_PROXY` | Comportamiento |
| --- | --- |
| vacío / off (default) | Ignora XFF, CF-Connecting-IP, X-Real-IP → clave fija `untrusted`. Spoofing no evade el bucket IP. Límites por draft/email/order siguen. |
| `cloudflare` | Usa `CF-Connecting-IP` solo si también hay `CF-Ray`. Nunca XFF ni X-Real-IP. **Requiere** que el origen no acepte tráfico directo. **`CF-Ray` no autentica al proxy por sí solo** (es forjable en un origen expuesto); solo reduce falsos positivos junto con origin lockdown. |

Checkout preference limiter sigue por `publicId` (no IP).

| Tema | Estado |
| --- | --- |
| IP rate limit | Política centralizada; default conservador |
| Endpoints internos | Bearer secret timing-safe; sin secret → 401 |
| Cookies pedido/draft | HttpOnly, SameSite=Lax, Secure si HTTPS |
| CSRF mutaciones Studio | Origin/Referer vs `APP_URL` |
| Assets | No URL pública; ownership draft/order; cuotas y MIME |
| Descargas | Siempre habilitadas en código + PAID + deliveryKey/hash |
| Feature flags | Solo server env (`STUDIO_CHECKOUT_ENABLED`, etc.) |
| PII | `buyerEmail` normalizado; no tokens en logs |

---

## 13. Veredicto F1 / F1.1

| Pregunta | Respuesta |
| --- | --- |
| ¿Código Studio v8 en `develop` listo? | **Sí** (#12–#19) |
| ¿Gap recovery XFF? | **Cerrado en F1.1** (código local en esta rama) |
| ¿Docs/env production actualizados? | **Sí** (README + deploy example + este doc) |
| ¿Producción lista para habilitar checkout? | **NO-GO** (ops: migrate, secrets, crons, sleep) |
| Bloqueos restantes | C1 migraciones Neon; C2/C4 secrets+crons; C3 Render Free sleep |
| Siguiente | Commit/PR F1.1 → merge → ventana §6 deploy (checkout off) → smoke → F2 |

**Sin commit/push/PR/deploy/migrate/secrets/cron/checkout en el alcance F1.1 hasta que el operador lo pida.**
