# Bardo · Kanban QA Lab

Prototipo estático y aislado del módulo Kanban de Bardo. Está diseñado para validar comportamiento, UX, responsive y estrés antes de migrar el contrato aprobado a React + HeroUI.

## Aislamiento

Todo este laboratorio vive dentro de `prototypes/kanban/`. No usa ni modifica `src/`, `activity/`, migraciones, Worker, D1, R2 ni ningún otro módulo de Bardo.

Los datos son 100% mock y se guardan únicamente en `localStorage` del navegador bajo la clave `bardo-kanban-qa-v4`.

## Dataset inicial

- 4 tableros.
- 470 tareas mock.
- 8 responsables simulados.
- prioridades, fechas, etiquetas, estimaciones y fuentes variadas.
- subtareas y comentarios distribuidos en parte del dataset.
- escenarios vencidos, próximos, sin responsable y de alta prioridad.

## Flujos funcionales

- crear, editar, mover, duplicar y eliminar tareas.
- autosave local y persistencia tras recarga.
- búsqueda sobre título, descripción, etiquetas, subtareas y comentarios.
- filtros combinables y varios órdenes.
- drag & drop en escritorio y cambio de estado desde el detalle como alternativa no-drag.
- crear, duplicar y eliminar tableros.
- crear, renombrar, reordenar y eliminar columnas con protecciones.
- subtareas y comentarios editables.
- undo para operaciones destructivas principales.
- atajos `N` y `/`.
- navegación mobile por columna.

## Stress QA

Desde `⚙ → Herramientas QA`:

- `+250 tareas`
- `+1000 tareas`
- `Autoprueba`
- `Vaciar tablero`
- `Restablecer mocks`

El render limita inicialmente a 100 tarjetas por columna y permite cargar más progresivamente. La búsqueda y los filtros siguen evaluando el dataset completo.

## Cloudflare Pages

Configuración recomendada para una Pages project conectada al repo:

- Branch de preview: `module/kanban`
- Framework preset: `None`
- Build command: vacío
- Build output directory: `prototypes/kanban`

Esto sirve el laboratorio directamente por HTTPS en un navegador real sin incorporar todavía React ni dependencias de producción.

## Gate de aprobación

Este módulo no se considera aprobado por verse bien. El gate es: todos los controles utilizables, flujos críticos recorridos, stress data validado en desktop y Safari iOS, persistencia/recuperación comprobadas y aprobación explícita de UX antes de migrar a la implementación definitiva.

<!-- deploy-trigger: 2026-08-23T01:53:00-04:00 -->
