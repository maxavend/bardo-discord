# Bardo Discord

Bardo publica documentos Markdown largos en Discord como **un único mensaje navegable** usando Components V2.

En vez de partir una minuta en muchos mensajes, Bardo la divide internamente en páginas seguras para Discord y muestra botones:

`← Anterior` · `2 / 5` · `Siguiente →`

Al cambiar de página, **se actualiza el mismo mensaje**.

## Qué necesitas

- Node.js 22.12 o superior.
- Una aplicación/bot creada en Discord Developer Portal.
- El bot instalado en tu servidor.

## 1. Crear Bardo en Discord

1. Abre Discord Developer Portal.
2. Crea una nueva Application llamada `Bardo`.
3. En **Bot**, crea/activa el bot y copia su token.
4. No publiques ni subas ese token a GitHub.
5. En **Installation** configura una instalación para servidor con los scopes `bot` y `applications.commands`.
6. Dale al bot al menos permisos para ver el canal y enviar mensajes.
7. Instala Bardo en tu servidor.

No necesitas activar `Message Content Intent`: Bardo funciona con slash commands e interacciones.

## 2. Preparar el proyecto

```bash
npm install
cp .env.example .env
```

Edita `.env`:

```env
DISCORD_TOKEN=pega_aqui_el_token_del_bot
DISCORD_GUILD_ID=pega_aqui_el_id_de_tu_servidor
```

Para copiar el ID del servidor, activa Developer Mode en Discord y usa **Copy Server ID**.

`.env` está ignorado por Git y no se sube al repositorio.

## 3. Encender Bardo

```bash
npm start
```

Cuando esté listo verás algo parecido a:

```text
Bardo está listo como Bardo#0000.
Comando /documento registrado en Mi servidor.
```

Mientras ese proceso esté corriendo, los botones del documento funcionan.

## 4. Publicar un documento

En el canal de Discord donde quieras publicarlo:

1. Escribe `/documento`.
2. En `archivo`, adjunta un `.md`, `.markdown` o `.txt`.
3. `titulo` es opcional.
4. Envía el comando.

Si no escribes título y el Markdown empieza con un `# H1`, Bardo usa ese H1 como título automáticamente.

Ejemplo:

```md
# Minuta — Weekly UX

**Fecha:** 19 de agosto de 2026

## Resumen

Aquí va una minuta muy larga...

## Acuerdos

- Primer acuerdo.
- Segundo acuerdo.
```

Bardo divide el documento respetando párrafos, headings y bloques de código siempre que puede.

## Límite de Discord

Discord limita el texto visible acumulado de un mensaje Components V2. Bardo evita ese límite manteniendo cada página alrededor de 3.200 caracteres y mostrando una sola página a la vez.

El mensaje sigue siendo uno solo; los botones reemplazan su contenido al navegar.

## Persistencia

Cuando Bardo publica un documento guarda sus páginas localmente en `data/` usando el ID del mensaje.

Eso permite que los botones sigan funcionando después de reiniciar Bardo en el mismo computador.

`data/` no se sube a GitHub.

Si mueves Bardo a otro computador o servidor y quieres conservar botones de documentos antiguos, copia también la carpeta `data/`.

## Desarrollo

```bash
npm run dev
npm test
npm run check
```

## Seguridad

Nunca pongas el token en el código, README, issues, commits o capturas públicas. Si un token se expone, regénéralo inmediatamente en Discord Developer Portal.
