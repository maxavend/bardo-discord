# Bardo Discord · Serverless + Activity

Bardo es un asistente ligero para Discord construido sobre Cloudflare Workers + D1 + Discord Activities.

Hoy tiene dos capacidades principales:

1. **Documentos**: `/doc` recibe Markdown, TXT, PDF o Word (`.docx`) y los abre con un lector unificado.
2. **Tareas**: `/tablero` y `/tarea` permiten mantener un mini Kanban del servidor sin salir de Discord.

No hay proceso Node permanente: el backend corre serverless y las experiencias completas se muestran dentro de una Discord Activity.

## Documentos

- `.md` / `.markdown`: se almacenan directamente como Markdown canónico.
- `.txt`: se almacena como texto y se muestra con el mismo lector.
- `.docx`: la Activity convierte la estructura semántica de Word a Markdown normalizado la primera vez que se abre.
- `.pdf`: la Activity extrae el texto y lo normaliza al lenguaje visual de Bardo la primera vez que se abre.
- `.doc`: el formato Word legado todavía no está soportado; conviértelo a `.docx`.

Los PDF escaneados sin texto seleccionable todavía requieren OCR.

Flujo:

`/doc` → preview → **📖 Mostrar más** → lector completo → copiar / guardar PDF / Markdown / Word.

## Tareas y mini Kanban

Bardo permite crear varios tableros por servidor.

### Crear un tablero

```text
/tablero crear nombre:ORION descripcion:Trabajo del equipo ORION
```

También existen:

```text
/tablero listar
/tablero abrir tablero:ORION
```

Al crear o abrir un tablero, Bardo publica **📋 Abrir tablero**, que lanza la Activity Kanban.

### Crear una tarea

```text
/tarea tablero:ORION titulo:Revisar onboarding responsable:@Cami chips:UX, urgente estado:backlog prioridad:alta
```

Opciones de `/tarea`:

- `tablero`: nombre del tablero.
- `titulo`: título de la tarjeta.
- `descripcion`: opcional.
- `responsable`: usuario seleccionado mediante el picker nativo de Discord.
- `chips`: etiquetas separadas por coma; Bardo conserva hasta 6.
- `estado`: Backlog, Por hacer, En curso o Hecho.
- `prioridad`: Baja, Media, Alta o Urgente.

La Activity ofrece una experiencia interactiva completa:

- **Cuatro columnas con acentos visuales**: Backlog (gris), Por hacer (azul blurple), En curso (ámbar) y Hecho (verde esmeralda).
- **Gestión completa (CRUD)**: creación rápida con `+` en cada columna o botón global, modal centrado de edición y borrado con confirmación.
- **Búsqueda y filtros en tiempo real**: buscador por texto, filtro rápido "Mis tareas", selector de prioridad y filtro por etiquetas/chips.
- **Sincronización multi-usuario inteligente**: polling adaptativo de 7s pausado en segundo plano para optimizar cuota de Cloudflare.
- **Interacción fluida**: Drag & drop en desktop y selectores rápidos en móvil.

## Arquitectura y Almacenamiento (D1 + R2)

Bardo combina almacenamiento operativo relacional en **Cloudflare D1** con almacenamiento de archivo y respaldo durable en **Cloudflare R2**:

- **Discord HTTP Interactions**: recibe `/doc`, `/tablero` y `/tarea` sin Gateway persistente.
- **Components V2 / componentes interactivos**: previews y botones de lanzamiento.
- **Discord Activity**: lector de documentos y mini Kanban embebidos.
- **Cloudflare Workers Static Assets**: sirve las Activities y parsers lazy de PDF/DOCX.
- **Cloudflare D1 (`bardo-db`)**: base de datos relacional operativa para documentos, tableros, tareas y contextos de sesión.
- **Cloudflare R2 (`bardo-backups`)**: capa persistente de archivo para:
  1. **Archivos originales permanentes**: `documents/{documentId}/original.{pdf|docx|md|txt}` conservados de forma duradera con metadatos.
  2. **Respaldos normalizados**: `documents/{documentId}/document.md` y `documents/{documentId}/metadata.json` actualizados al normalizar o editar.
  3. **Snapshots diarios de D1**: `database/YYYY-MM-DD/{timestamp}/` generados automáticamente cada día vía Cron Trigger (`0 3 * * *`).

PDF y DOCX se convierten en el cliente de la Activity, no dentro del Worker. Al terminar, Bardo guarda el Markdown normalizado en D1 y libera el `source_blob` temporal de D1, mientras que el archivo original en R2 se preserva de forma permanente.

## Configuración de R2 y Backups

### 1. Crear el bucket R2 en Cloudflare

Si el bucket aún no existe en tu cuenta de Cloudflare, créalo con Wrangler o desde el Dashboard:

```bash
npx wrangler r2 bucket create bardo-backups
```

### 2. Regla de Ciclo de Vida (Retención de 90 días para snapshots)

Para optimizar el almacenamiento dentro del plan gratuito de Cloudflare, se recomienda configurar una regla de ciclo de vida para los snapshots de base de datos:

1. Ve a **Cloudflare Dashboard → R2 Object Storage → `bardo-backups`**.
2. Entra a la pestaña **Settings / Configuración → Lifecycle Rules / Reglas de ciclo de vida**.
3. Añade una regla:
   - **Prefix / Prefijo**: `database/`
   - **Action / Acción**: Delete objects older than / Eliminar objetos con más de **90 días**.
4. Deja la raíz y el prefijo `documents/` **sin fecha de expiración** para conservar permanentemente los documentos y sus archivos originales.

### 3. Recuperación de Desastres (Disaster Recovery)

Bardo incluye la utilidad CLI `scripts/restore.js` para consultar y restaurar datos en caso de contingencia:

```bash
# Listar snapshots diarios disponibles en R2
node scripts/restore.js --list-snapshots

# Inspeccionar un snapshot específico
node scripts/restore.js --inspect-snapshot database/2026-08-20/1787250000000

# Inspeccionar metadatos de un documento en R2
node scripts/restore.js --inspect-doc <ID_DOCUMENTO>

# Localizar y descargar el archivo original
node scripts/restore.js --download-original <ID_DOCUMENTO> original.pdf
```

Para restaurar una base de datos D1 desde un snapshot o reconstruir un documento específico, el módulo `src/backup-r2.js` expone las funciones `restoreDocumentToD1(env, docId)` y `restoreDatabaseFromSnapshot(env, snapshotPrefix)`.

## Requisitos

- Node.js 22.12 o superior.
- Aplicación Bardo creada en Discord Developer Portal.
- Cuenta Cloudflare con Wrangler autenticado.

## Configuración local

```bash
npm install
cp .env.example .env
```

## Registrar comandos

```bash
npm run register
```

El registro usa `PUT` sobre los comandos del guild y publica el set completo actual:

- `/doc`
- `/tablero`
- `/tarea`

## Cloudflare

Aplicar migraciones y desplegar:

```bash
npx wrangler login
npx wrangler d1 migrations apply bardo-db --remote
npm run deploy
```

Los secretos de producción viven en Wrangler Secrets:

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_TOKEN
```

Worker actual:

`https://bardo-discord.bardo-discord.workers.dev`

## Discord · Interactions Endpoint

En **Discord Developer Portal → Bardo → Información general**:

```text
https://bardo-discord.bardo-discord.workers.dev
```

## Discord · Activity

En **Activities / Actividades → Settings / Configuración**:

```text
Prefix: /
Target: bardo-discord.bardo-discord.workers.dev
```

## Migraciones

Las migraciones viven en `migrations/`.

- `0001`: documentos.
- `0002`: contextos de Discord Activity.
- `0003`: importación temporal PDF/DOCX.
- `0004`: tableros y tareas Kanban.
- `0005`: columna de prioridad e índices en tareas Kanban.
- `0006`: gestión y persistencia de columnas personalizadas de tablero.
- `0007`: miembros persistentes por tablero.

## Desarrollo y tests

```bash
npm install
npm run check
npm test
npm run dev
```

## Seguridad

- `.env` y credenciales están fuera del repositorio.
- Los secretos de producción residen en Cloudflare Secrets.
- Los documentos y tableros usan UUID opacos.
- Los backups en R2 son completamente privados (sin acceso público directo).
- No se almacenan tokens de Discord, firmas ni credenciales dentro de los backups.
- La fuente binaria de PDF/DOCX solo se entrega a la Activity asociada.
- Los cambios de estado del Kanban requieren un `activity_instance_id` asociado al tablero abierto.
- Después de normalizar PDF/DOCX, el binario temporal se elimina de D1 para ahorrar espacio, conservando el archivo original de forma permanente y segura en R2.
