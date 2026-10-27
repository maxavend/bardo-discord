# Despliegue de Bardo para aceptación — 13 de octubre de 2026

## Hub de vidrio líquido, header móvil y avatares — 27 de octubre de 2026

- Código: `b9c6a0c` (rama `claude/bardo-mock-data-1ef960`; aún no está en `main`). Worker activo al 100%: `ba7c7b29-8ffa-4e91-9574-dc05db7b1ec0` (`wrangler deploy --keep-vars` local). Versión anterior: `63b02ad7-ed14-4411-b829-09b06f41ad1f`, con el mismo build que `main` (`e6178df`).
- Pestañas del header y barra móvil con lente de vidrio deslizable; la barra móvil es vidrio líquido. La refracción solo se ve en Chromium (Discord de escritorio); en el resto, vidrio liso.
- Header móvil de 64 px: botones, avatar y símbolo de 32 px con áreas táctiles de 44 px; submenús en línea en pantallas angostas; toolbar del editor que no tapa el título con el teclado abierto; filas de grabación apiladas; avatares unificados.
- Solo frontend: sin cambios del Worker, migraciones, secretos ni comandos. Validación: check, 478 unitarias, revisión en 375 px y escritorio. No se corrieron los E2E. Producción: `/` 200, HTML y assets coinciden con el commit; `/api/docs`, `/api/planner/sessions` y `/api/settings` 401 sin sesión. Sin prueba autenticada dentro de Discord.
- Importante: el próximo push a `main` redespliega desde `main`; mergear esta rama antes para no revertir estos cambios.

```sh
npx wrangler rollback 63b02ad7-ed14-4411-b829-09b06f41ad1f --message 'Volver a e6178df (#35)' --yes
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
