# Bardo Conversational V1 — Fases 1–4

Branch: `feat/bardo-conversational-v1`

## Alcance implementado

Esta rama añade el feature conversacional sin reemplazar Bardo Home ni los flujos existentes.

### Fase 1 — Core conversacional

- Workers AI mediante binding `AI`.
- Provider desacoplado (`CloudflareWorkersAIProvider`).
- Orchestrator con prompt acotado a Bardo.
- Presupuesto de salida, máximo de tool calls, rate limit D1 y telemetry estructurada.
- `/bardo mensaje:<texto>`.
- `/bardo` sin `mensaje` conserva Bardo Home.

### Fase 2 — Consultas

Tool registry read-only para:

- tareas pendientes propias;
- próximos eventos;
- búsqueda de documentos;
- estado del proyecto;
- resumen del canal.

Las respuestas de tools se renderizan de forma determinista para evitar una segunda inferencia innecesaria.

### Fase 3 — Acciones

Tools de escritura para:

- crear/actualizar tareas;
- crear/actualizar eventos;
- crear documentos.

Las escrituras reutilizan `TaskService`, `EventService`, `saveDocument` y los grants existentes. Las acciones son idempotentes por interaction/tool call y generan audit metadata con contenido sensible redactado. Bardo no expone herramientas destructivas.

Las peticiones tentativas ("quizás", "podríamos", etc.) no ejecutan writes.

### Fase 4 — Contexto de Discord y minutas

- Context menu `Resumir con Bardo`.
- Lectura acotada del historial del canal mediante Discord REST.
- Mensajes tratados explícitamente como datos no confiables para reducir prompt injection.
- Resumen estructurado con decisiones, action items y preguntas abiertas.
- Tool `create_minutes_from_channel` para guardar una minuta como documento Bardo.
- Tool `create_tasks_from_channel` para convertir action items explícitos en un lote acotado de tareas, con idempotencia.

## Configuración

`wrangler.jsonc` añade:

- `AI` Workers AI binding.
- `AI_MODEL=@cf/qwen/qwen3-30b-a3b-fp8`.
- `AI_MAX_OUTPUT_TOKENS=700`.
- `AI_RATE_LIMIT=20` por usuario/guild cada 10 minutos.
- `BARDO_TIMEZONE=America/Santiago`.

`DISCORD_TOKEN` sigue siendo necesario para leer historial del canal.

## Migración

`0016_ai_conversation_audit.sql` crea:

- `ai_rate_limits`;
- `ai_tool_runs`;
- `ai_action_audit`.

La migración no se aplica remotamente desde esta rama.

## Registro de comandos

`scripts/register-commands.js` contiene las nuevas definiciones, pero no se ejecuta automáticamente ni desde esta implementación.

Antes de probar en Discord hay que aplicar la migración al entorno elegido, desplegar la rama y registrar los comandos de ese entorno de forma explícita.

## Seguridad

- Sin SQL generado por LLM.
- Sin ejecución de código generado.
- Sin acciones destructivas.
- Tools limitadas y con JSON Schema cerrado.
- Toda operación se restringe al `guild_id` de la interaction.
- Los mensajes de Discord no se guardan en D1.
- Audit log redacta `content`, `markdown`, transcripciones y cuerpos.
- `allowed_mentions` vacío en respuestas de IA.
- Las escrituras usan idempotency keys.
