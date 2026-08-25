# Bardo Discord · Serverless + Activity

Bardo convierte archivos de documentación en una experiencia de lectura unificada dentro de Discord.

1. `/upload-docs` recibe Markdown, TXT, PDF o Word (`.docx`) y lo comparte en el canal actual.
2. Publica un **preview corto** mediante Components V2.
3. **📖 Mostrar más** abre el documento completo como una **Discord Activity**.
4. Todos los formatos terminan usando el mismo renderer visual de Bardo.
5. El lector permite copiar todo y exportar a PDF, Markdown o Word.
6. La biblioteca de Docs muestra únicamente los documentos compartidos en el canal actual.

No hay paginación manual ni proceso Node permanente: la Activity usa scroll continuo.

## Formatos

- `.md` / `.markdown`: se almacenan directamente como Markdown canónico.
- `.txt`: se almacena como texto y se muestra con el mismo lector.
- `.docx`: la Activity convierte la estructura semántica de Word a Markdown normalizado (títulos, listas, tablas, énfasis y enlaces) la primera vez que se abre.
- `.pdf`: la Activity extrae el texto y lo normaliza al lenguaje visual de Bardo la primera vez que se abre.
- `.doc`: el formato Word legado todavía no está soportado; conviértelo a `.docx`.

Los PDF escaneados sin texto seleccionable todavía requieren OCR y se muestran con un aviso claro.

## Arquitectura

- **Discord HTTP Interactions**: recibe `/upload-docs` sin Gateway persistente.
- **Components V2**: muestra la vista previa en el canal.
- **Discord Activity**: lector embebido del documento completo.
- **Cloudflare Workers Static Assets**: sirve el lector y los parsers lazy de PDF/DOCX.
- **Cloudflare D1**: almacena el documento canónico, metadatos y temporalmente la fuente binaria mientras se normaliza.

PDF y DOCX se convierten en el cliente de la Activity, no dentro del Worker. Al terminar, Bardo guarda el Markdown normalizado en D1 y elimina el binario temporal. Las siguientes aperturas ya usan directamente el documento normalizado.

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

## Registrar `/upload-docs`

```bash
npm run register
```

El registro usa `PUT` sobre los comandos del guild, por lo que deja un único comando activo: `/upload-docs`.

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

## Publicar un documento

1. Escribe `/upload-docs`.
2. Adjunta `.md`, `.markdown`, `.txt`, `.pdf` o `.docx`.
3. `titulo` es opcional.
4. Envía.
5. Bardo publica el preview y **📖 Mostrar más**.
6. El lector muestra todo con el mismo sistema visual, sin importar el formato de origen.

Desde el home de Docs también puedes crear documentos, subir archivos, buscar entre los documentos del canal y usar **Enviar como mensaje** para publicar nuevamente la tarjeta de vista previa en ese mismo canal.

Por ahora el límite de archivo para importación es **1,8 MB** para mantener cada documento dentro de los límites de almacenamiento usados por la versión gratuita.

## Formato del lector

El renderer contempla:

- headings;
- párrafos;
- negrita y cursiva;
- enlaces HTTP/HTTPS;
- listas;
- citas;
- separadores;
- código;
- tablas;
- copiar todo;
- exportar a PDF, Markdown y Word.

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
- Los documentos usan UUID opacos.
- La fuente binaria de PDF/DOCX solo se entrega a una Activity cuyo `instance_id` esté asociado con ese documento.
- Después de normalizar PDF/DOCX, el binario temporal se elimina de D1.
