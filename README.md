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

## Arquitectura

- **Discord HTTP Interactions**: recibe `/doc`, `/tablero` y `/tarea` sin Gateway persistente.
- **Components V2 / componentes interactivos**: previews y botones de lanzamiento.
- **Discord Activity**: lector de documentos y mini Kanban embebidos.
- **Cloudflare Workers Static Assets**: sirve las Activities y parsers lazy de PDF/DOCX.
- **Cloudflare D1**: almacena documentos, tableros, tareas y contextos de Activity.
- **Worker Kanban wrapper**: intercepta únicamente tareas/tableros y delega el resto al Worker de documentos existente.

PDF y DOCX se convierten en el cliente de la Activity, no dentro del Worker. Al terminar, Bardo guarda el Markdown normalizado en D1 y elimina el binario temporal.

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
- La fuente binaria de PDF/DOCX solo se entrega a la Activity asociada.
- Los cambios de estado del Kanban requieren un `activity_instance_id` asociado al tablero abierto.
- Después de normalizar PDF/DOCX, el binario temporal se elimina de D1.
