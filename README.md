# Bardo Discord (Serverless en Cloudflare Workers)

Bardo publica documentos Markdown largos en Discord como **un único mensaje navegable** usando Components V2.

En vez de partir una minuta en muchos mensajes, Bardo la divide internamente en páginas seguras para Discord y muestra botones:

`← Anterior` · `2 / 5` · `Siguiente →`

Al cambiar de página, **se actualiza el mismo mensaje** consultando la persistencia en **Cloudflare D1**.

## Arquitectura Serverless

- **Cloudflare Workers**: Procesa las interacciones HTTP de Discord sin servidor permanente.
- **Cloudflare D1**: Base de datos SQLite serverless de alta consistencia para almacenar páginas y metadatos del documento.
- **Discord HTTP Interactions**: Validación criptográfica Ed25519 sin necesidad de conexión WebSocket Gateway abierta.

## Qué necesitas

- Node.js 22.12 o superior.
- Una aplicación/bot en Discord Developer Portal.
- Cuenta en Cloudflare y CLI Wrangler autenticado.

## 1. Configuración en Discord

1. En **Discord Developer Portal** → tu aplicación:
   - En **General Information**, copia **Public Key**.
   - En **Bot**, copia **Bot Token**.
2. En **Installation**, configura los scopes `bot` y `applications.commands`.
3. Instala Bardo en tu servidor de Discord.

## 2. Preparar el proyecto localmente

```bash
npm install
cp .env.example .env
```

Edita `.env` (solo necesario para ejecutar scripts locales como registrar comandos):

```env
DISCORD_TOKEN=pega_aqui_el_token_del_bot
DISCORD_GUILD_ID=pega_aqui_el_id_de_tu_servidor
```

## 3. Despliegue en Cloudflare Workers

1. Autenticar Wrangler:
   ```bash
   npx wrangler login
   ```

2. Aplicar migraciones D1:
   ```bash
   npx wrangler d1 migrations apply bardo-db --remote
   ```

3. Configurar secretos en Cloudflare Workers:
   ```bash
   npx wrangler secret put DISCORD_PUBLIC_KEY
   npx wrangler secret put DISCORD_TOKEN
   ```

4. Desplegar el Worker:
   ```bash
   npm run deploy
   ```

5. Registrar los slash commands en Discord:
   ```bash
   npm run register
   ```

## 4. Conectar Discord con Cloudflare

En **Discord Developer Portal** → tu aplicación → **General Information**:

1. En **Interactions Endpoint URL**, pega la URL pública de tu Worker (ej. `https://bardo-discord.bardo-discord.workers.dev`).
2. Guarda los cambios. Discord validará inmediatamente enviando un PING criptográfico Ed25519 que el Worker responderá con PONG.

## 5. Publicar un documento

En cualquier canal del servidor:

1. Escribe `/documento`.
2. En `archivo`, adjunta un `.md`, `.markdown` o `.txt`.
3. `titulo` es opcional (si se omite y el Markdown comienza con `# H1`, Bardo lo usa automáticamente).
4. Envía el comando.

## Desarrollo y Tests

```bash
npm test
npm run check
npm run dev
```

## Seguridad

- `.env`, tokens y claves privadas están fuera del repositorio (en `.gitignore`).
- Las credenciales en producción residen exclusivamente en Cloudflare Secrets.
