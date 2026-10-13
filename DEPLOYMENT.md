# Despliegue de Bardo para aceptación — 13 de octubre de 2026

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
