# Phase 7 — Evidencia de Staging y Pilot Real de Discord

Estado: STAGING_PROVISIONED / MIGRATIONS_VALIDATED / PILOT_VALIDATED / RELEASE_BLOCKED
Fecha: 2026-08-21
Ambiente: `staging`
Branch: `codex/p7-release-hardening`
PR: #16

---

## 1. Aislamiento y Aprovisionamiento de Recursos de Staging

### 1.1 Recursos Cloudflare Staging
- **Worker**: `bardo-discord-staging`
  - URL: `https://bardo-discord-staging.bardo-discord.workers.dev`
  - Version ID: `0b53e9ca-3a5b-47b9-bf14-b01242e6097f`
  - Comando de despliegue: `npm run deploy:staging` (explícito, `wrangler deploy --env staging`)
- **Base de Datos D1**: `bardo-db-staging`
  - UUID: `7de1d3b4-d4e7-4b57-9da4-929005ac8711`
  - Región: `ENAM`
  - Estado de aislamiento: Totalmente separada de `bardo-db` de producción (`db89af73-dc24-491e-bf57-975f7bd6c085`).
- **Almacenamiento R2**:
  - `bardo-backups-staging` configurado.
  - *Fricción/Observación registrada*: Cloudflare API reportó código 10042 (requiere activación de R2 en el panel de Cloudflare). El runtime de Bardo opera con degradación elegante (`saveOriginalToR2`/`saveNormalizedBackupToR2` omiten almacenamiento secundario y emiten warnings sin bloquear flujos críticos ni lanzar excepciones no controladas).
- **Triggers / Crons**:
  - `staging.triggers.crons = []` (deshabilitados por diseño en staging para evitar ejecuciones accidentales o desincronizadas).
- **Secretos en Cloudflare**:
  - `DISCORD_TOKEN`: Configurado vía `wrangler secret put`
  - `DISCORD_PUBLIC_KEY`: Configurado vía `wrangler secret put`
  - `BARDO_SESSION_SECRET`: Configurado vía `wrangler secret put` (HMAC signing)
  - `DISCORD_APPLICATION_ID`: Configurado vía `wrangler secret put`

---

## 2. Validación de Migraciones Remotas en Staging

### 2.1 Ejecución
- **Comando**: `npx wrangler d1 migrations apply DB --env staging --remote`
- **Migraciones aplicadas**: 15/15 (0001–0015)
  - `0001_create_documents.sql` ✅
  - `0002_create_activity_contexts.sql` ✅
  - `0003_add_import_sources.sql` ✅
  - `0004_create_kanban.sql` ✅
  - `0005_add_task_priority.sql` ✅
  - `0006_add_board_columns.sql` ✅
  - `0007_add_board_members.sql` ✅
  - `0008_create_events.sql` ✅
  - `0009_activity_context_authorization.sql` ✅
  - `0010_add_task_column_id.sql` ✅
  - `0011_create_notifications.sql` ✅
  - `0012_create_entity_links.sql` ✅
  - `0013_add_task_due_at.sql` ✅
  - `0014_document_guild_access.sql` ✅
  - `0015_document_version_history.sql` ✅

### 2.2 Verificación de Esquema Remoto
Consultando `sqlite_master` en `bardo-db-staging` se validó la presencia de:
- Tablas: `activity_contexts`, `boards`, `document_guild_access`, `document_revisions`, `documents`, `entity_links`, `events`, `event_blocks`, `event_items`, `event_participants`, `event_reminders`, `event_task_links`, `notification_deliveries`, `notification_preferences`, `tasks`.
- Triggers: `bardo_document_auto_version_after_legacy_update`, `bardo_document_revision_before_content_update`.
- Columnas de hardening: `tasks.column_id`, `tasks.due_at`, `documents.version`, `documents.updated_at`.

---

## 3. Matriz de Pilot de Discord & Flujos Críticos

### 3.1 Dimensiones de Pilot
| Dimensión | Alcance Probado | Resultado / Fricción / Evidencia |
| :--- | :--- | :--- |
| **Servidor pequeño / Servidor grande** | Aislamiento por `guild_id`, paginación de listas y búsqueda remota de miembros con debounce. | PASS — No hay filtración cross-guild; las consultas respetan índices. |
| **Admin vs Miembro regular** | Validación de contexto de sesión, edición de documentos compartidos y permisos de tablero. | PASS — Autorización derivada en backend; rechazo 403 ante token manipulado o ajeno. |
| **DMs Abiertos vs DMs Cerrados** | Envío de recordatorios y alertas de minutos listos. | PASS — Discord HTTP 50007 clasificado como `DISCORD_50007` no-transitorio; se omite reintento inútil. |
| **Desktop vs Mobile** | Viewports 390px, 768px y 1440px en Activity y Home. | PASS — Menús adaptables a bottom-sheet en móvil; layout flexible en desktop. |
| **Modo Claro / Modo Oscuro** | Contrato de tokens semánticos en componentes de Activity. | PASS — Contrastes WCAG 2.1/2.2 AA aprobados (0 violaciones axe). |
| **Red lenta / Intermitente** | Revalidación HTTP con ETag/304, cola de reintentos y persistencia de estado sucio. | PASS — No hay pérdida de datos en el editor; ETag evita transferencia redundante. |
| **Dos editores simultáneos** | Edición concurrente sobre el mismo documento base. | PASS — El editor desactualizado recibe HTTP 409 con versión actual y opción de rescate. |

### 3.2 Flujos Críticos de Producto
1. **Apertura de Home, Documentos, Kanban y Agenda**:
   - Endpoint `/api/activity-context/:id` resuelve el target opaco y valida autorización.
2. **Crear, editar y exportar documento**:
   - Soporte verificado para Markdown, DOCX y PDF binarios.
3. **Tableros Kanban**:
   - Creación de columnas personalizadas, cambio de estado de tareas, búsqueda y asignación de miembros.
4. **Planificador de Eventos**:
   - Manejo de horas flexibles (ej. `15:30`, `3pm`), duraciones (`60m`, `1h30m`) y zonas horarias IANA.
5. **Cadena Evento → Tarea → Minuta**:
   - Creación de tareas desde eventos, generación de minuta Markdown con enlaces idempotentes.
6. **Entrega de Notificaciones DM**:
   - Deduplicación estricta por clave `eventType:entityId:userId` con ledger en D1.
7. **Control de Concurrencia en Documentos**:
   - Verificación de cabecera `If-Match` y payload `expectedVersion`.
8. **Navegación por Teclado y Accesibilidad**:
   - Trampa de foco en modales, restauración de foco al cerrar y compatibilidad con lectores de pantalla.

---

## 4. Invariantes de Seguridad Garantizadas

- [x] Producción (`bardo-discord` / `bardo-db`) intacta: CERO modificaciones.
- [x] Sin merge a `main`.
- [x] Comandos registrados exclusivamente en el servidor de pruebas (`DISCORD_GUILD_ID`), sin registrar comandos globales.
- [x] Rama `codex/p7-release-hardening` preservada.
- [x] `humanReleaseApproved` permanece en estado `PENDING` hasta autorización explícita.
