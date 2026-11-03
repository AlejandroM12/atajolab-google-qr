# Studio v8 — Cutover de producción (guía única)

Objetivo: migrar Neon, desplegar `develop` (Studio v8), configurar secrets/crons, validar con checkout **OFF**, y solo entonces pedir autorización para una compra real de $4.900 ARS.

Estado verificado al preparar esta guía:

| Hecho | Evidencia |
| --- | --- |
| `develop` incluye PR #12–#20 | `ca4bb4f` |
| Neon Primary: 3 migraciones históricas OK, 4 Studio **pendientes** | Confirmado por operador |
| Producción `https://qr.atajolab.dev` aún sirve código **pre-Studio** | `/studio`, `/api/mail/dispatch`, `/api/studio/*` → **404** |
| Render documentado sobre rama `main` | `main` está **19 commits detrás** de `develop` |
| Este entorno de agente **no** tiene `DATABASE_URL` Neon ni API Render/Neon | Solo Postgres local |

---

## A. Orden exacto (no saltar)

1. Backup Neon (branch).
2. `prisma migrate deploy` sobre Primary.
3. Verificar 7 migraciones + 4 tablas.
4. Cargar secrets en Render (`STUDIO_CHECKOUT_ENABLED` vacío).
5. Desplegar código Studio (`develop` o merge a la rama que Render usa).
6. Configurar crons.
7. Smoke (checkout off).
8. **Parar** y pedir autorización explícita para compra real / flip de checkout.

---

## B. Neon — backup y migrate

### B1. Branch de respaldo (consola Neon)

1. Proyecto → branch **Primary** / DB `neondb`.
2. Create branch, nombre sugerido: `pre-studio-v8-YYYYMMDD`.
3. En el branch, SQL de solo lectura:

```sql
SELECT migration_name, finished_at
FROM "_prisma_migrations"
ORDER BY started_at;

SELECT to_regclass('"Order"') AS order_t,
       to_regclass('"DownloadAccessLink"') AS access_link,
       to_regclass('"StudioAsset"') AS studio_asset;
```

Esperado en el backup: 3 migraciones históricas; `Order` / access presentes; `StudioAsset` **null**.

### B2. Migrar Primary

En una máquina con acceso a Neon (no localhost):

```bash
# DATABASE_URL = connection string DIRECTA de Primary con sslmode=require
# (no pegar la URL en chats)

pnpm install --frozen-lockfile

CONFIRM_STUDIO_MIGRATE=YES BACKUP_BRANCH_NAME=pre-studio-v8-YYYYMMDD \
  node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  scripts/studio-prod-migrate.mjs
```

El script:

- rechaza `localhost` / no-Neon / sin `sslmode=require`;
- exige `CONFIRM_STUDIO_MIGRATE=YES` y `BACKUP_BRANCH_NAME`;
- corre `prisma migrate status` → `migrate deploy` → `status` otra vez;
- no imprime credenciales.

### B3. Verificar Primary

```sql
SELECT migration_name, finished_at IS NOT NULL AS ok
FROM "_prisma_migrations"
ORDER BY started_at;
-- 7 filas ok=true

SELECT to_regclass('"StudioAsset"'),
       to_regclass('"RateLimitBucket"'),
       to_regclass('"StudioOrderAttempt"'),
       to_regclass('"MailNotification"');
-- cuatro no-null
```

### B4. Rollback Neon

Si `migrate deploy` falla a mitad: restaurar desde el branch `pre-studio-v8-*` (PITR / restore según Neon) **antes** de desplegar Studio.  
Si migrate OK pero hay que abortar producto: dejar tablas; no hace falta borrarlas.

---

## C. Secrets Render

Archivo local generado (gitignored, no commitear):

`.data/studio-v8-prod-secrets-ONCE.txt`

Contiene `ORDER_ACCESS_SECRET`, `MAIL_DISPATCH_SECRET`, `STUDIO_CLEANUP_SECRET` (valores solo allí).

En Render → Environment:

| Key | Valor |
| --- | --- |
| `APP_URL` | `https://qr.atajolab.dev` |
| `DATABASE_URL` | Neon Primary directo + `sslmode=require` |
| `ORDER_ACCESS_SECRET` | desde el archivo ONCE |
| `MAIL_DISPATCH_SECRET` | desde el archivo ONCE |
| `STUDIO_CLEANUP_SECRET` | desde el archivo ONCE |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` / `EMAIL_FROM` | existentes (dominio verificado) |
| `STUDIO_CHECKOUT_ENABLED` | **vacío** |
| `STUDIO_EXPORT_ENABLED` | vacío (recomendado) |
| `RATE_LIMIT_TRUST_PROXY` | vacío |
| MP_* | production ya usados por v7 |

Después de cargarlos en Render: **borrar** el archivo ONCE local.

---

## D. Deploy Render

Hoy el sitio público **no** incluye Studio (`/studio` 404). Hay que publicar el código de `develop`.

Opciones (elegir una):

1. **Cambiar** el servicio Render a branch `develop` y redeploy.  
2. **Merge** `develop` → `main` (si la política del repo lo exige) y redeploy `main`.

Build / start (README):

```bash
pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm build
pnpm start
```

`prisma generate` en build **no** aplica migraciones: el migrate (sección B) debe hacerse **antes** o como release command explícito.

No subir de plan Free sin autorización. Anotar: Free suspende ~15 min → crons/webhooks pueden fallar por cold start.

---

## E. Crons

| Job | Schedule | Request |
| --- | --- | --- |
| Mail dispatch | cada **5** min | `POST https://qr.atajolab.dev/api/mail/dispatch` Header `Authorization: Bearer $MAIL_DISPATCH_SECRET` |
| Asset cleanup | cada **1** h | `POST https://qr.atajolab.dev/api/studio/assets/cleanup` Header `Authorization: Bearer $STUDIO_CLEANUP_SECRET` |

Probar:

- sin Bearer → **401**
- con Bearer → **200** JSON

Si Render Cron no está disponible en Free, usar un scheduler externo con el mismo Bearer (sin loguear el secret).

---

## F. Smoke (checkout OFF)

```text
GET  /                  → 200
GET  /crear             → 200 (v7)
GET  /studio            → 200 (editor)
GET  /recuperar         → 200
POST /api/studio/draft  Origin https://qr.atajolab.dev → 200 + Set-Cookie draft
POST /api/mail/dispatch sin auth → 401
POST /api/studio/assets/cleanup sin auth → 401
POST /api/orders body v8 → rechazado por flag (403/disabled), no crea cobro
```

Pedido v7 PAID existente: descarga con cookie sigue OK.

---

## G. Compra real controlada ($4.900) — solo con autorización explícita

No habilitar ni cobrar hasta mensaje claro del operador.

Cuando autorice:

1. `STUDIO_CHECKOUT_ENABLED=true` + restart/redeploy env.  
2. Una compra A6 mínima → PENDING → MP → PAID.  
3. Verificar `MailNotification` SENT, email, `/recuperar`, PNG/SVG/PDF, QR.  
4. Si falla grave: `STUDIO_CHECKOUT_ENABLED=` vacío de inmediato.

---

## H. Qué falta para “vender”

1. Migrar Neon (4 pendientes).  
2. Desplegar `develop` (hoy prod = `main` sin Studio).  
3. Secrets + crons.  
4. Smoke F.  
5. Autorización para flip + compra de prueba.  
6. Decisión sobre Free sleep vs plan que no duerma (requiere tu OK para pagar).
