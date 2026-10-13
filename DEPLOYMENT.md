# Despliegue de Bardo para aceptación — 13 de octubre de 2026



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
