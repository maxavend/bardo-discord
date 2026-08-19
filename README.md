# Bardo Discord · Serverless + Activity

Bardo convierte documentos Markdown en una experiencia de lectura nativa para Discord:

1. `/documento` recibe un `.md`, `.markdown` o `.txt`.
2. Publica un **preview corto** mediante Components V2.
3. El botón **📖 Mostrar más** abre el documento completo como una **Discord Activity** dentro de Discord.
4. El documento completo se sirve desde Cloudflare Workers y se persiste en Cloudflare D1.

No hay paginación manual ni proceso Node permanente: la Activity usa scroll continuo y renderiza títulos, listas, citas, código y tablas Markdown como HTML legible.

## Arquitectura

- **Discord HTTP Interactions**: recibe `/documento` sin Gateway persistente.
- **Components V2**: muestra la vista previa en el canal.
- **Discord Activity**: lector embebido del documento completo.
- **Cloudflare Workers Static Assets**: sirve el lector HTML/CSS/JS.
- **Cloudflare D1**: almacena Markdown original y metadatos.

## Requisitos

- Node.js 22.12 o superior.
- Aplicación Bardo creada en Discord Developer Portal.
- Cuenta Cloudflare con Wrangler autenticado.

## Configuración local

```bash
npm install
cp .env.example .env
```

`.env` solo se usa para scripts locales como registrar comandos:

```env
DISCORD_TOKEN=pega_aqui_el_token_del_bot
DISCORD_GUILD_ID=pega_aqui_el_id_de_tu_servidor
```

## Cloudflare

Aplicar migraciones y desplegar:

```bash
npx wrangler login
npx wrangler d1 migrations apply bardo-db --remote
npm run deploy
```

Los secretos de producción deben vivir en Wrangler Secrets:

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_TOKEN
```

El Worker actual se publica como:

`https://bardo-discord.bardo-discord.workers.dev`

## Discord · Interactions Endpoint

En **Discord Developer Portal → Bardo → Información general**, configura:

**URL del punto de conexión de las interacciones**

```text
https://bardo-discord.bardo-discord.workers.dev
```

Discord validará el endpoint con PING/PONG firmado.

## Discord · Activar el lector embebido

En **Discord Developer Portal → Bardo → Activities / Actividades → Settings / Configuración**:

1. Activa **Enable Activities / Habilitar actividades**.
2. En **URL Mappings / Asignaciones de URL**, crea el mapping:

```text
Prefix: /
Target: bardo-discord.bardo-discord.workers.dev
```

El botón `📖 Mostrar más` usa un deep link de Activity con un `custom_id` opaco para abrir exactamente el documento correspondiente.

## Publicar un documento

En Discord:

1. Escribe `/documento`.
2. Adjunta un `.md`, `.markdown` o `.txt` en `archivo`.
3. `titulo` es opcional. Si se omite y el Markdown empieza con `# H1`, Bardo lo usa como título.
4. Envía.
5. Bardo publica una vista previa y el botón **📖 Mostrar más**.
6. Al abrirlo, el lector muestra el documento completo con scroll continuo.

## Formato del lector

El renderer embebido contempla:

- H1–H6;
- párrafos;
- negrita y cursiva;
- enlaces HTTP/HTTPS;
- listas ordenadas y no ordenadas;
- citas;
- separadores;
- bloques de código e inline code;
- tablas Markdown con scroll horizontal cuando sea necesario.

En el preview de Discord, una tabla se sustituye por un fallback corto para evitar mostrar pipes crudos. La tabla real aparece correctamente en el lector completo.

## Desarrollo y tests

```bash
npm run check
npm test
npm run dev
```

## Seguridad

- `.env` y credenciales están fuera del repositorio.
- Los secretos de producción residen en Cloudflare Secrets.
- Los documentos reciben identificadores UUID no predecibles antes de ser almacenados en D1.
- El endpoint público del lector devuelve solo el contenido necesario para renderizar el documento.
