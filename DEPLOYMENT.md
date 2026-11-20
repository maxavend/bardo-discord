# Despliegues de Bardo

Los registros describen el estado en su fecha. La versión vigente y las verificaciones más recientes aparecen primero.

## Bardo Desktop — pendiente de desplegar

- Rama `feat/desktop-electron`. Agrega la migración `0021_desktop_app.sql` (aditiva: columna `mcp_clients.first_party`, cliente `bardo_desktop` y columna `docs_sessions.app_grant_id`).
- **Antes del código va la migración:** el Worker nuevo escribe `docs_sessions.app_grant_id` en cada sesión de canal, también en la Activity. El workflow de deploy la aplica primero; si despliegas a mano, ejecuta antes `npx wrangler d1 migrations apply bardo-db --remote`.
- Nada que configurar en Discord ni secretos nuevos. Opcional: `DESKTOP_MIN_VERSION` (por defecto `0.1.0`) para exigir una versión mínima de la app.
- Instaladores: workflow «Bardo Desktop» (manual o etiqueta `desktop-v*`). Firma y Store: ver [apps/desktop/README.md](apps/desktop/README.md).

## Bardo no abría en canales privados — 19 de noviembre de 2026

- Causa: al retirar Administrador del rol Bardo (registro del 16 de noviembre), el bot dejó de ver los canales privados sin autorización explícita. El inicio de sesión de la Activity respondía 403 en esos canales; la última sesión correcta desde Discord era del 12 de noviembre.
- Discord, con autorización explícita: rol Bardo añadido a los permisos de `#weekly`, `#ux-general` y `#anuncios`. Verificado por API (el bot lee los tres canales) y abriendo Bardo en `#weekly` desde Discord web. `#ux-general` deja de estar sincronizado con su categoría. Un cuarto canal con sesiones antiguas (`1476575409305817300`) sigue sin acceso. No se restauró Administrador.
- App `bardo-discord`: versión `45e88d75-cddc-4e43-96aa-a18cb2891249`, al 100 %, publicada localmente con `--keep-vars`. Anteriores del mismo día: `d2cb2f64-1c10-432c-9f08-b0ed71913584`; antes, `e0991d4e-1764-4924-a406-dc260005408b`. Sin migraciones ni cambios de secretos.
- Desplegado en esa versión: el guard del SDK de Discord ya no descarta mensajes por ventana de origen ni por referencias repetidas (conserva los límites de tamaño), y las esperas agotadas muestran una referencia corta de diagnóstico. No resultó ser la causa.
- Pendiente de desplegar con este cambio: «Intentar de nuevo» reutiliza la conexión con Discord (un segundo SDK no recibe READY y su espera agotada tapaba el error real), y el servidor responde `bot_channel_forbidden` con un mensaje propio cuando es el bot quien no ve el canal.
- Validación: `npm run check` y 637 pruebas de Node. El guard y el reintento se probaron además contra un host de Discord simulado en local.

## Protección de producción — 16 de noviembre de 2026

- App `bardo-discord`: versión `e0991d4e-1764-4924-a406-dc260005408b`, al 100 %. Anterior: `02a2ba66-3dec-456f-861c-78845d3ffcdd`.
- Sitio `bardo-site`, perfil `maxavend-domain`: versión `93b80a1c-19ba-46ec-9b02-803afca2f101`, al 100 %. Anterior: `bfd76b49-7a22-4ca1-af44-ee2af31d98d9`.
- Ambos publicados localmente con `--keep-vars`; secretos y D1 preservados, sin migraciones pendientes. No se modificó contenido de usuarios. El código, los assets y la configuración de seguridad se versionan junto con este registro; los próximos despliegues deben partir de esta revisión o una posterior.
- Correcciones de OAuth/PKCE y consentimiento, permisos de hilos y mensajes directos, límites de cuerpos HTTP, descompresión DOCX, Markdown/PDF y guard del SDK de Discord. Tres bindings verificados en producción: autenticación 120/min por IP y grupo, API 300/min por usuario e interacciones 60/min por usuario firmado. Contadores aproximados por ubicación de Cloudflare.
- URLs de previews deshabilitadas en ambos Workers; la app conserva su URL oficial y el sitio solo su dominio personalizado. Discord: rol Bardo sin Administrador, limitado a ver, enviar y trabajar con hilos (`309237648384`). Conservado el intent de miembros necesario para el directorio.
- Dependencias corregidas: Wrangler 4.163.0, Hono y Astro 7.4.12. La auditoría npm queda en cero avisos para backend y sitio; los avisos residuales de la app y sus mitigaciones se detallan en `SECURITY.md`.
- Validación: `npm run check`, typechecks, 634 pruebas de Node, nueve pruebas del Worker del sitio y dry-runs correctos. El build completo del sitio usó `BARDO_CAPTURE_SOURCE=pinned`: valida el commit, árbol y hashes de las 16 capturas históricas conservadas; no son capturas nuevas del código actual.
- Producción: 18 comprobaciones HTTP correctas; HTML y assets de entrada coinciden con el build (incluida la marca web insertada por el servidor), APIs privadas/MCP rechazan sesiones ausentes, OAuth anuncia S256, cuerpo excesivo responde 413 y llamadas sin autorización/firma se rechazan. Configuración y despliegues corroborados por API. No se ejecutó una prueba de carga ni un recorrido autenticado en el cliente real de Discord.
- Discord, actualización posterior autorizada: las futuras instalaciones en servidores solicitan los mismos cuatro permisos (`309237648384`), incluido crear hilos públicos y sin Administrador. PATCH aplicado y GET posterior verificado; scopes y configuración de instalación de usuario conservados. No requirió otro despliegue de los Workers.
- Límites: CSP de frames de Activity continúa en reporte; mínimo TLS/WAF de la zona no verificados por falta de permiso de lectura; logs persistentes y alertas de seguridad no configurados por este cambio.
- Evidencia local sanitizada: `.wrangler/checkpoints/security-2026-11-16/` (excluida de Git), con estados anteriores/posteriores de Cloudflare y Discord y `production-smoke.json`.

Recuperación de código y assets, sin revertir la base de datos. Estas versiones anteriores no contienen las correcciones de seguridad; usarlas solo para resolver una regresión urgente y volver a publicar las correcciones:

```sh
node_modules/.bin/wrangler rollback 02a2ba66-3dec-456f-861c-78845d3ffcdd --message 'Recuperación por regresión del despliegue de seguridad' --yes
node_modules/.bin/wrangler rollback bfd76b49-7a22-4ca1-af44-ee2af31d98d9 --config site/wrangler.jsonc --profile maxavend-domain --message 'Recuperación del sitio por regresión' --yes
```

Conservar previews deshabilitadas y comprobar otra vez bindings y porcentaje activo después de una recuperación. No restaurar Administrador en Discord como parte de un rollback del código.

## Inicio por servidor con resumen de contenido — 16 de noviembre de 2026

- Aplicación `bardo-discord`: versión `02a2ba66-3dec-456f-861c-78845d3ffcdd`, publicada con `--keep-vars`. Anterior: `9b62094d-11ff-431b-9cf9-be13e1e22f04`. Sin migraciones ni cambios de secretos; la landing conserva su versión anterior.
- El inicio del servidor muestra primero los canales con documentos, reuniones o tareas sin archivar, ordenados por última actualización. Los vacíos siguen accesibles debajo y la búsqueda abarca ambos grupos. Las filas incluyen cantidades, categoría y fecha; carga, resumen desconocido y error no se confunden con vacío. La navegación continúa disponible si falla el resumen.
- Nuevo `GET /api/web/channel-content?guild_id=ID`: verifica permisos actuales del servidor y agrega únicamente metadatos de canales autorizados. Excluye documentos personales y contenido archivado; incluye tareas completadas sin archivar. Lecturas agrupadas y acotadas, sin crear tableros ni cargar cuerpos de documentos.
- Validación: lint, tipos y build correctos; 29 pruebas de backend (9 de resumen y 20 de autenticación/permisos), y 78 pruebas de interfaz (26 escenarios en 320, 390 y 1280 px). Empaquetado del Worker validado con `--dry-run`.
- Producción: verificación en el navegador integrado con sesión real a 320 y 390 px, más revisión visual a 1280 px. Comprobados orden por contenido, cantidades, canales homónimos, búsqueda de un canal vacío, apertura tanto de vacío como de canal con contenido y regreso a **Mis servidores**. Sin desbordamiento horizontal en la vista de 320 px. Se capturaron las pantallas del flujo; revisión visual independiente sin bloqueos. Prueba con viewport móvil, no con teclado de un dispositivo físico.

## Navegación móvil del inicio web — 16 de noviembre de 2026

- Aplicación `bardo-discord`: versión `9b62094d-11ff-431b-9cf9-be13e1e22f04`, publicada con `--keep-vars`. Anterior: `640b2042-c301-4531-9930-048544643e33`. Sin migraciones ni cambios de secretos; la landing conserva su versión anterior.
- La elección de servidor precede a los recientes y la instalación queda como acción secundaria. Dentro del servidor, el regreso y el buscador permanecen visibles al recorrer los canales. Dentro del canal, **Mis servidores** tiene un enlace directo visible en móvil.
- Validación: lint, tipos y build correctos; 54 pruebas del flujo web (18 escenarios en 320, 390 y 1280 px). En producción, navegador integrado con sesión real y vistas de 320 y 390 px: servidor, búsqueda, apertura de canal y regreso a **Mis servidores**; comprobados el encabezado fijo y la ausencia de desbordamiento horizontal en inicio y canal. Capturas del recorrido guardadas durante la revisión. Esta comprobación usa tamaños de viewport, no dispositivos físicos ni su teclado virtual.

## Inicio de cuenta web y acceso desde la landing — 16 de noviembre de 2026

- Despliegue local sobre `c3ebc117d779`, con los cambios del home de cuenta: raíz **Mis servidores**, elección de servidor y canal, recientes explícitos, búsqueda, recuperación parcial y regreso desde el espacio de trabajo. Sin migraciones ni cambios de secretos; ambos Workers publicados con `--keep-vars`.
- Aplicación `bardo-discord`: versión `640b2042-c301-4531-9930-048544643e33`. Anterior: `4d9ca9f2-9a9f-4565-a316-d1c8b348ea71`.
- Landing `bardo-site`, perfil `maxavend-domain`: versión `bfd76b49-7a22-4ca1-af44-ee2af31d98d9`. Anterior: `66f0cebf-5ffe-4d5e-b935-2033aceb1711`. La cabecera abre directamente la web; conserva las 16 capturas y Privacidad actualizada con `hello@maxavend.com`.
- Validación previa: lint, tipos y build; 16 escenarios de navegación en 320, 390 y 1280 px; 20 pruebas de autenticación y permisos; 9 pruebas de seguridad de la landing. Paquete final del Worker validado con `wrangler deploy --dry-run`.
- Producción: landing y Privacidad idénticas al build; módulos principales nuevos idénticos al build. APIs protegidas responden 401 sin sesión. En el navegador integrado se verificó con una cuenta real: inicio de sesión con Discord, elección de servidor, apertura de un canal y regreso a **Mis servidores** desde el menú de perfil. El enlace **Bardo Web** de la cabecera de la landing abre directamente ese inicio conservando la sesión.

## Web y MCP — 5 de noviembre de 2026

- Código: `c3ebc11` (`main`, PR #45). Worker activo al 100%: `4d9ca9f2-9a9f-4565-a316-d1c8b348ea71`, con `WEB_ORIGIN` configurado. Versión del código recién desplegado, sin encender: `f38c4e0d-a34b-4037-837f-a2b2aef22b6d`. Versión anterior: `3d3e45be-c731-42ca-8ad1-af8993302b80`.
- Migración remota aplicada: `0020_web_and_mcp` (aditiva: tablas nuevas y columna `docs_sessions.web_session_hash`).
- Web y MCP encendidos en `https://bardo-discord.bardo-discord.workers.dev`, y agregada la redirección OAuth `/auth/discord/callback` en el portal de Discord.
- Validación en producción: `/api/web/session` 200, `/auth/discord` redirige a Discord con PKCE, `/mcp` 401 con la dirección de autorización, `/api/docs` e interacciones sin firma 401. Pendiente: entrar con una cuenta real de Discord y autorizar una herramienta desde una sesión real de Claude Code o Codex.
- El run `40768216050` de `f36fdaf`, que trababa los deploys por GitHub, quedó cancelado.

### Cómo se despliega

Hacer merge a `main` no despliega por sí solo: el entorno `production` de GitHub pide aprobación. Al aprobar el run, el workflow aplica las migraciones y luego despliega. Un push nuevo a `main` puede cancelar un deploy que sigue en cola.

Si despliegas a mano con `npm run deploy`, aplica primero la migración: sin ella, el inicio de sesión de la Activity falla porque el código ya escribe la columna nueva.

```sh
npx wrangler d1 migrations apply bardo-db --remote
```

### Conectar una herramienta

```sh
claude mcp add --transport http bardo https://bardo-discord.bardo-discord.workers.dev/mcp
codex mcp add bardo --url https://bardo-discord.bardo-discord.workers.dev/mcp
codex mcp login bardo
```

En Claude Code, autoriza con `/mcp`. La conexión aparece en el menú de usuario, en **Conexiones de IA**, y se puede revocar desde ahí.

### Cambiar de dominio o apagar

Con otro dominio, cambia la redirección en el portal de Discord, `WEB_ORIGIN` y la dirección en `plugins/bardo/.mcp.json` y `plugins/bardo/mcp.json`.

Para apagar la web y el MCP sin desplegar, ejecuta `npx wrangler secret delete WEB_ORIGIN`. Las sesiones y permisos quedan guardados, pero dejan de funcionar.

Rollback del código a la versión anterior (las tablas y la columna nuevas son aditivas y esa versión las ignora):

```sh
npx wrangler rollback 3d3e45be-c731-42ca-8ad1-af8993302b80 --message 'Volver a 28e2900' --yes
```

## Proyectos en Tareas, ojitos al cargar y header móvil — 5 de noviembre de 2026

- Código: `28e2900` (`main`, PR #43). Worker activo al 100%: `3d3e45be-c731-42ca-8ad1-af8993302b80` (`wrangler deploy --keep-vars` local, con la cuenta de Cloudflare que tiene el Worker). Versión anterior: `e7ab2a39-ff0c-4c2f-a36a-18772b0840aa`.
- Tareas: nuevo campo **Proyecto** (la «épica», en lenguaje simple): cada tarea tiene a lo más uno. Se asigna o crea desde el detalle, se administra en «Proyectos…», se filtra desde la cabecera y lo que se crea con un proyecto filtrado queda en ese proyecto. Eliminarlo pide confirmación y deja sus tareas sin proyecto. Etiquetas y proyectos también se pueden renombrar.
- Etiquetas largas: los colores ya no se salen de la fila (antes, hasta 120 px a 320 de ancho). En móvil los círculos se ven de 16 px y el área táctil sigue en 24 × 32 px.
- Pantalla de carga: sin el `filter: blur` que desenfocaba el texto cada 3 s, al cambiar de mensaje. Vuelven los ojitos en lugar del wordmark; con movimiento reducido se quedan quietos.
- Header móvil: solo el símbolo y la flecha, sin desbordes. El título del módulo pasa al menú que abre el símbolo y sigue en el nombre accesible del botón.
- Migraciones remotas aplicadas antes del Worker: `0018_personal_documents` y `0019_kanban_projects` (aditivas: tablas nuevas y columna `kanban_cards.project_id`).
- Este deploy también lleva lo que seguía sin aprobar desde `9a9534c`: #40 (carga inicial) y #41 (Inicio y espacio personal).
- Validación: `npm run check`, 515 unitarias, E2E de los proyectos del CI (un fallo de `geometry.spec.js` a 320 px bajo carga no se repitió en 6 corridas aisladas) y CI de `main` en verde. Producción: `/` 200, HTML y assets iguales a `main`, `/api/kanban/board` y `/api/kanban/projects` 401 sin sesión, 5 tareas y 39 documentos intactos. Pendiente: probar en Discord con una sesión real, que aquí no se pudo.
- Importante: el deploy por GitHub sigue trabado por el run `40768216050` de `f36fdaf`, que espera aprobación desde el 28 de octubre. Hay que cancelarlo o rechazarlo y no aprobarlo: devolvería producción a ese commit. El `wrangler` local debe estar conectado a la cuenta de Gmail; con otra, responde 7403 o 10000.

Rollback a la versión anterior (las tablas y la columna nuevas son aditivas y esa versión las ignora):

```sh
npx wrangler rollback e7ab2a39-ff0c-4c2f-a36a-18772b0840aa --message 'Volver a 9a9534c' --yes
```

## Navbar «renglón», teclado en iOS, sin zoom y tema por cuenta — 28 de octubre de 2026

- Código: `9a9534c` (`main`, con #32, #37 y #34). Worker activo al 100%: `e7ab2a39-ff0c-4c2f-a36a-18772b0840aa` (deploy de GitHub, run 40754177545). Versión anterior: `24b78ebd-c81b-4c85-b694-20441c983716` (compartir enlace, 27 de octubre). Se canceló el deploy pendiente de `889e7ae` (#36): ya iba incluido en este.
- Migración remota aplicada: `0017_user_theme` (aditiva: `user_settings.theme`). Tema oscuro por defecto y la elección manual guardada en la cuenta (`GET/PATCH /api/settings/personal`).
- Header: pestañas centradas y fijas sobre el renglón; el punto se estira en trazo al cambiar de módulo (sin lente de vidrio en escritorio). El símbolo de Bardo y el chip «#canal ▾» reemplazan las iniciales del servidor; en móvil, el título del módulo con su punto. «Beta» pasa de franja a chip. Perfil siempre visible a 768–860 px.
- Editor en iOS con el teclado abierto: el header sigue al área visible y la barra se queda en su hueco hasta que el scroll la lleva bajo el header. Sin zoom (viewport, pellizco y al enfocar campos). Scroll de los diálogos bajo la X.
- Validación: CI de `main` (tests y build) y el deploy en verde; E2E locales en laptop, tablet, 390 y 320 px; navbar, teclado y zoom revisados en Safari del simulador de iOS. Producción: `/` 200, HTML y chunks idénticos al build de `9a9534c`, viewport sin zoom en el HTML; `/api/docs`, `/api/planner/sessions`, `/api/settings` y `/api/settings/personal` 401 sin sesión. Sin prueba dentro de la app de Discord: falta confirmar el header, la barra del editor con el teclado y que no haya zoom en el WebView.

Rollback a la versión anterior (la columna `theme` es aditiva y esa versión la ignora):

```sh
npx wrangler rollback 24b78ebd-c81b-4c85-b694-20441c983716 --message 'Volver a 99478f7 (compartir enlace)' --yes
```

## Compartir enlace — 27 de octubre de 2026

- Código: `99478f7` (rama `claude/bardo-mock-data-1ef960`, PR #36; aún no está en `main`). Worker activo al 100%: `24b78ebd-c81b-4c85-b694-20441c983716` (`wrangler deploy --keep-vars` local). Versión anterior: `ba7c7b29-8ffa-4e91-9574-dc05db7b1ec0`.
- «Compartir enlace» en documento, reunión y tarea: abre el diálogo de Discord (`shareLink` del SDK) con `custom_id` `bardo:open:…`. Los permisos no cambian. Quien no puede verlo llega a Inicio con «No tienes acceso a …», sin que se le diga de qué canal es: `/api/docs` responde `launchDenied` con el tipo y nunca el canal.
- Cambia el Worker (`docs-api.js`, `kanban-db.js`); sin migraciones, secretos ni comandos. Validación: check, 486 unitarias, E2E de los proyectos del CI (los fallos locales eran timeouts por carga y pasan al repetirlos), aviso revisado en 375 px. Producción: `/` 200, HTML y assets coinciden con el commit, «Compartir enlace» en los chunks publicados; `/api/docs`, `/api/planner/sessions` y `/api/settings` 401 sin sesión. Sin prueba dentro de Discord: falta confirmar que `shareLink` abre el diálogo y que el enlace lanza la Activity con su destino.
- Importante: el próximo push a `main` redespliega desde `main`; mergear el PR #36 antes.

```sh
npx wrangler rollback ba7c7b29-8ffa-4e91-9574-dc05db7b1ec0 --message 'Volver a b9c6a0c, sin compartir enlace' --yes
```

## Hub de vidrio líquido, header móvil y avatares — 27 de octubre de 2026

- Código: `b9c6a0c` (rama `claude/bardo-mock-data-1ef960`; aún no está en `main`). Worker activo al 100%: `ba7c7b29-8ffa-4e91-9574-dc05db7b1ec0` (`wrangler deploy --keep-vars` local). Versión anterior: `63b02ad7-ed14-4411-b829-09b06f41ad1f`, con el mismo build que `main` (`e6178df`).
- Pestañas del header y barra móvil con lente de vidrio deslizable; la barra móvil es vidrio líquido. La refracción solo se ve en Chromium (Discord de escritorio); en el resto, vidrio liso.
- Header móvil de 64 px: botones, avatar y símbolo de 32 px con áreas táctiles de 44 px; submenús en línea en pantallas angostas; toolbar del editor que no tapa el título con el teclado abierto; filas de grabación apiladas; avatares unificados.
- Solo frontend: sin cambios del Worker, migraciones, secretos ni comandos. Validación: check, 478 unitarias, revisión en 375 px y escritorio. No se corrieron los E2E. Producción: `/` 200, HTML y assets coinciden con el commit; `/api/docs`, `/api/planner/sessions` y `/api/settings` 401 sin sesión. Sin prueba autenticada dentro de Discord.
- Importante: el próximo push a `main` redespliega desde `main`; mergear esta rama antes para no revertir estos cambios.

```sh
npx wrangler rollback 63b02ad7-ed14-4411-b829-09b06f41ad1f --message 'Volver a e6178df (#35)' --yes
```

## Identidad «tinta, papel y punto», perfil en el header y selectores que se deslizan — 26 de octubre de 2026

- Código: `a64b251` (PR #33, en `main`). Worker activo al 100%: `ca7dddd7-e779-4168-b724-208408764895` (deploy de GitHub #36). Incluye #30 y #31, que no habían llegado a producción; su deploy pendiente (#30) se canceló porque habría publicado una versión anterior.
- Identidad: tokens de papel y tinta con una gota de violeta, noche en vez de negro puro, `--punto` para lo que concluye. Títulos en Lexend (autoalojada), Inter con tamaño óptico. Carga con el wordmark dibujado y la onda animada (reemplaza a la mascota). Reunión en vivo: punto para el tema en curso y lo cerrado, renglón de tinta para lo conversado.
- Header: ícono del servidor y `#canal`; el avatar abre un menú con nombre, rol, Ajustes por alcance y tema (reemplaza los botones sueltos de Ajustes y tema).
- Selectores de una opción con indicador que se desliza; la lista entra con un fundido al cambiar de pestaña. Respeta movimiento reducido.
- Sin migraciones ni cambios en el Worker o los comandos. Validación: lint, tipos, `npm run check`, 478 unitarias, 315/316 E2E en 7 viewports (el restante, intermitente, pasa en 5 repeticiones), revisión visual claro/oscuro y escritorio/móvil. Producción: `index.html` idéntico al build de `main`, assets y fuentes 200, APIs protegidas 401 sin sesión.
- Pendiente en Discord: avatares e ícono del servidor desde el CDN de Discord, rol real en el menú de perfil y carga de fuentes dentro de la Activity.

Rollback a #29 (sin migraciones que deshacer):

```sh
npx wrangler rollback a091ec8e-283c-4ae6-ac27-72b5bc9be2c2 --message 'Volver a #29 (antes de la nueva identidad)' --yes
```



## Reuniones: agenda compartible, facilitadores y revisión de acuerdos — 22 de octubre de 2026

- Código: `acb48ad` (rama `feat/portafolio-datos-de-ejemplo`, PR #27; aún no está en `main`). Worker activo al 100%: `733c2ec0-df72-4a6b-845d-445234586c56` (`wrangler deploy` local).
- Selectores precargados con quienes ven el canal y solo los roles con acceso (lista de miembros con el intent limitado del bot; si falla, vuelve a la búsqueda). Fotos de Discord en chips y avatares.
- Facilitan una o más personas. «Compartir agenda en el canal» publica la agenda como documento con «Abrir agenda» y «Abrir reunión».
- Resumen con duración real; «Revisar acuerdos»: Tarea, MD al responsable o Descartar. Nuevo `POST /api/planner/sessions/:id/agreements/dm`.
- Sin migraciones ni cambios de comandos. Validación: lint/tipos/build, 467 unitarias, 146 E2E (laptop, 320 y 390 px). Producción: `/` 200; APIs nuevas 401 sin sesión. Sin prueba autenticada dentro de Discord.
- Importante: el próximo push a `main` redespliega desde `main`; mergear el PR #27 antes para no revertir estos cambios.

```sh
npx wrangler rollback e9aa03ad-8d43-45f2-9e1f-b5cd114009df --message 'Volver a #26' --yes
```

## v0.6.0 (beta): Tareas, Hub, Ajustes — 15 de octubre de 2026

- Código: `390595d` (PR #24). Worker activo al 100%: `06bb29b2-db67-4609-984f-c59b6f8d50d2` (deploy de GitHub, mismo build que `2d7fc7cb-05c9-44ec-9aa7-64618cb4eb25`).
- Migraciones remotas aplicadas: `0013_kanban`, `0014_workspaces`, `0015_settings` (todas aditivas; verificadas las 9 tablas nuevas).
- Comandos del servidor registrados: 10, incluidos `/tarea` y `/tareas`, con las descripciones nuevas.
- Novedades: Tareas (Kanban por canal), Hub de módulos, Ajustes en tres niveles, repaso de copy, aviso de beta.
- Validación: 459 unitarias, 302 E2E en 7 viewports, lint/tipos/build. Producción: `/` 200; APIs nuevas responden 401 sin sesión.
- Pendiente en Discord: dar al bot «Crear hilos públicos» y «Enviar mensajes en hilos» en los canales donde se usen hilos.

Rollback del Worker (no deshace las migraciones; son aditivas y la versión anterior las ignora):

```sh
npx wrangler rollback 8043114d-f9c9-4648-84ef-335fd2fb7495 --message 'Volver a v0.5.0' --yes
```

## Recuperación fuera de Inicio — 13 de octubre de 2026, 14:02 Chile

- Código: `bbf6f0c`. Worker activo al 100%: `8e788332-f3ec-4f21-a072-3e71cd063278`.
- Retirado el aviso de copias antiguas de Inicio y sus estilos. Las indicaciones están en `/ayuda` → «Recuperar contenido anterior», dentro de la respuesta privada existente.
- Sin cambios en almacenamiento, separación entre cuentas ni sincronización: las copias se conservan; la recuperación sigue siendo asistida, no automática.
- Validación: lint/tipos/build, 396 unitarias (incluida conservación exacta de copias anteriores y aislamiento de cuentas), 12 E2E de Inicio en móvil y escritorio. HTML y ocho assets publicados verificados; APIs protegidas responden 401 sin sesión. Sin prueba autenticada dentro del cliente real de Discord.
- Checkpoint Git: `checkpoint/pre-home-recovery-2026-10-13` (`6fee178`). Registro local: `.wrangler/checkpoints/home-recovery-2026-10-13/`.
- Para probar: cerrar y reabrir `/bardo`; Inicio ya no muestra el aviso. Ejecutar `/ayuda` para consultar las indicaciones de recuperación. No fue necesario cambiar el registro de comandos.

Rollback sin modificar datos:

```sh
node node_modules/wrangler/bin/wrangler.js rollback ab1ac4f9-5351-402c-9cf6-80e770cd124f --message 'Restaurar checkpoint previo a retirar aviso de Inicio' --yes
```

## Inicio y comandos — 13 de octubre de 2026, 16:54 UTC

- Código desplegado: `a994ad7`.
- Versión activa al 100%: `ab1ac4f9-5351-402c-9cf6-80e770cd124f`.
- `/bardo` abre siempre Inicio y ya no ofrece una sección. Guarda el destino antes de lanzar la Activity; Inicio prevalece sobre un identificador de documento obsoleto de una instancia reutilizada. Los identificadores de Discord ajenos a Bardo no se interpretan como documentos.
- Ayuda y descripciones de comandos aclaradas. Ocho comandos del servidor verificados contra sus definiciones; se conserva el comando global de lanzamiento. No se enviaron mensajes al canal para probarlos.
- Inicio: Documentos y Reuniones en formato normal, sin textos de apoyo, botones alineados y aviso de copias antiguas breve/desplegable. Se conservan las copias locales y la separación entre cuentas.
- Validación: 396 pruebas unitarias, lint/tipos/build, 24 E2E de Inicio en 320/768/1024/1280 px (navegación, teclado, zoom, contraste y alineación). Revisión visual adicional con scrollbar de escritorio a 320 px. HTML y ocho assets publicados coinciden con el build; APIs protegidas devuelven 401 sin sesión. No se realizó un recorrido autenticado dentro del cliente real de Discord.
- Checkpoint: `checkpoint/pre-commands-home-2026-10-13`, commit `6e6880d98bc489de3316ef3851a4cd652a25b0b9`; Worker anterior `0d7e1d2a-d7d3-4bf3-9aca-436588c74eb3`.
- Registro y copias de las definiciones de Discord: `.wrangler/checkpoints/commands-home-2026-10-13/` (local, excluido de Git). Sin migraciones ni borrado de datos.

Para probar: cerrar la Activity y ejecutar `/bardo`. Debe abrir Inicio sin el aviso de documento eliminado. `/ayuda` describe los comandos y su botón también abre Inicio.

Rollback del Worker y, por separado, de las descripciones/opciones de los comandos (desde la raíz del repositorio, con la configuración local de Discord):

```sh
node node_modules/wrangler/bin/wrangler.js rollback 0d7e1d2a-d7d3-4bf3-9aca-436588c74eb3 --message 'Restaurar checkpoint previo a Inicio y comandos' --yes
node --env-file=.env .wrangler/checkpoints/commands-home-2026-10-13/update-commands.mjs --restore
```

## MVP sin captura nueva — 13 de octubre de 2026

- Código desplegado: `4f05b05954537c93e684edf2dbffe2a71f75aea8`.
- Versión activa al 100%: `0d7e1d2a-d7d3-4bf3-9aca-436588c74eb3`. Fecha UTC: `2026-10-13T16:40:53.17526Z`.
- Retirados Grabar, los controles de captura y su aviso; no se inicializa el capturador ni se solicita micrófono. Las reuniones sin audio omiten las estadísticas vacías. Se conservan los demás controles y estilos.
- Audios anteriores: almacenamiento, recuperación de fragmentos y descargas preservados. El resumen incluye audios de temas o bloques eliminados, usando los mismos reproductores y menús existentes.
- Validación: lint, tipos y build; 393 unitarias; 116 E2E generales aprobadas (44 omisiones condicionales por viewport); 8 pruebas adicionales de descarga exacta y recuperación, incluidas dos recargas y ausencia de solicitudes de micrófono. Revisión visual de reunión/resumen en 320 y 1440 px.
- HTML y 8 assets verificados contra el build local. APIs protegidas: HTTP 401 sin sesión. La aceptación autenticada dentro de Discord queda para el usuario.
- Checkpoint Git: `checkpoint/pre-mvp-no-capture-2026-10-13` (`9b86998786ecc5e134b10dab887e09d02104dd93`). Versión anterior: `f66be97d-232f-4d05-b840-87cfb697a05d`.
- Registro local: `.wrangler/checkpoints/mvp-no-capture-2026-10-13/`. No se borraron audios ni metadatos; no hubo migraciones ni cambios de secretos.

Para probar, cerrar la Activity y volver a abrir `/bardo`. Los audios anteriores se descargan desde el resumen → Opciones de la grabación → Descargar audio, en el dispositivo donde se guardaron.

Rollback de código y assets, conservando datos:

```sh
node node_modules/wrangler/bin/wrangler.js rollback f66be97d-232f-4d05-b840-87cfb697a05d --message 'Restaurar checkpoint previo al recorte de captura' --yes
```

## Revisión integral de interfaces — 13 de octubre, 15:51 UTC

- Código desplegado: `56ce6c658d3aca4422dbc2ff63cc4e7a646d3d75`.
- Versión activa al 100%: `f66be97d-232f-4d05-b840-87cfb697a05d`.
- Dropdowns y modales con scrollbar y fade compartidos; alineaciones de reuniones, campos y avisos; descarga de audio y navegación al resumen corregidas. Detalles y evidencia en [UI-REVIEW.md](UI-REVIEW.md).
- Validación: lint, tipos y build; 392 pruebas unitarias; recorridos E2E y captura real de audio sintético en cuatro tamaños; revisión visual en móvil, tablet y escritorio. Micrófono y autenticación del cliente real de Discord quedan para aceptación humana.
- Checkpoint Git: `checkpoint/pre-interface-review-2026-10-13` (`715bd7d`). Worker anterior: `0332284f-0f37-404a-8a3d-89e8be9cdd19`.
- Manifest, despliegues y comprobación de hashes: `.wrangler/checkpoints/interface-review-2026-10-13/`, excluido de Git. HTML y assets publicados coinciden con el build; las APIs protegidas responden 401 sin sesión.
- No hubo migraciones D1 ni cambios de secretos. El rollback conserva los datos:

```sh
node node_modules/wrangler/bin/wrangler.js rollback 0332284f-0f37-404a-8a3d-89e8be9cdd19 --message 'Restaurar checkpoint previo a revisión de interfaces' --yes
```

Para probar: cerrar la Activity y volver a abrir `/bardo` en Discord. La grabación usa el micrófono y almacenamiento del dispositivo; no captura automáticamente el audio de todos los participantes del canal.

## Actualización de UI — 13 de octubre, 14:42 UTC

- Código: `89d923893d2debc1a4982a47a6d1a21d042efe6a`.
- Versión desplegada y verificada: `0332284f-0f37-404a-8a3d-89e8be9cdd19`.
- Botón único de diálogos a todo el ancho; blur de barras corregido en el build; menú `/` con ScrollArea integrado y scroll-fade de 16 px. El fade se desactiva con movimiento reducido.
- Validación: lint, typecheck y build; teclado del menú en 320 y 1280 px; comprobación visual y geométrica en 390 y 1280 px, arrastre del scrollbar sin perder el foco, modo claro y movimiento reducido. HTML y assets publicados coinciden con el build local.
- Checkpoint anterior a estos cambios: tag `checkpoint/pre-ui-polish-2026-10-13`, versión Worker `1a25b33c-30c4-40bd-a7e4-1430dd1b80de`. Registro local: `.wrangler/checkpoints/ui-polish-2026-10-13/`. No se aplicaron migraciones.
- Para volver al estado previo a estos ajustes visuales:

```sh
node node_modules/wrangler/bin/wrangler.js rollback 1a25b33c-30c4-40bd-a7e4-1430dd1b80de --message 'Restaurar checkpoint previo a ajustes UI' --yes
```

## Despliegue UAT inicial (histórico)

Desplegado por autorización expresa del usuario en el Worker existente de Discord.

- URL: https://bardo-discord.bardo-discord.workers.dev
- Código desplegado: `4cf7ccb72876648580ee3bbf1bb93ea13e15a0da`.
- Rama: `codex/product-completion-uat`.
- Versión Cloudflare activa al verificar: `1a25b33c-30c4-40bd-a7e4-1430dd1b80de` (100%).
- Versión anterior: `2db37e37-12ec-431d-8f87-a567599b1b73`.
- Checkpoint Git local del código UAT: `checkpoint/uat-2026-10-13`.
- Hora de despliegue UTC: `2026-10-13T14:24:52.614734Z`.
- Datos de recuperación locales: `.wrangler/checkpoints/uat-2026-10-13/`, excluidos de Git.

## Cómo probar

1. Cierra completamente la Activity de Bardo que tengas abierta.
2. En el canal de Discord donde está Bardo, ejecuta `/bardo` sin elegir sección.
3. Comprueba que aparece «Tu espacio en Bardo». Desde ahí entra a Documentos o Reuniones.
4. Sigue los cinco recorridos de [UAT.md](UAT.md).

Abrir la URL en un navegador externo permite revisar la interfaz local, pero la autenticación, permisos, publicación y contexto de canal se prueban dentro de Discord. No se registraron de nuevo comandos: sus opciones existentes siguen siendo compatibles y el destino predeterminado se resuelve en el Worker.

## Verificación posterior

- Worker e índice: HTTP 200; HTML idéntico al build local.
- JavaScript de entrada, runtime, React y CSS: HTTP 200; hashes SHA-256 idénticos al build local.
- `/api/docs`, `/api/planner/sessions` y `/api/discord/channel-context`: HTTP 401 sin sesión, como corresponde.
- Cloudflare confirmó la nueva versión al 100%.
- No había migraciones D1 pendientes; no se aplicaron migraciones ni se cambiaron secretos o variables.
- La integración autenticada real dentro de Discord queda para aceptación humana.

## Volver a la versión anterior

Desde la raíz de este repositorio, el rollback del Worker es:

```sh
node node_modules/wrangler/bin/wrangler.js rollback 2db37e37-12ec-431d-8f87-a567599b1b73 --message 'Restaurar checkpoint anterior a UAT 2026-10-13' --yes
```

Este comando restaura el código y assets anteriores, **sin restaurar ni borrar los datos de D1**. No se ejecutó durante el despliegue. La versión anterior está registrada en `checkpoint.json` y `deployments-before.json`.

## Recuperación de D1, solo si fuese necesaria

Bookmark previo al despliegue: `0000044c-00000000-00005103-cb9ab2ad03751aacfcc17321e049c4de`.

El checkpoint nativo de [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) está sujeto a la retención del plan (7 días en Free o 30 en Paid). No conviene restaurarlo por un fallo meramente visual: una restauración de datos descartaría escrituras posteriores y requiere una decisión explícita.

También se descargó una copia SQL privada local de 1.26 MB con permisos 0600 y hash guardado en el manifest. El export oficial contiene bytes NUL y no pudo reproducirse directamente con SQLite; **la vía de recuperación verificada disponible es el bookmark nativo, no importar ese SQL sin tratamiento**. Los datos y el enlace temporal del export no se publicaron en Git.

Documentación del rollback: [Cloudflare Workers](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
