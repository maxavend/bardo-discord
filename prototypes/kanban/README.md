# Bardo · Kanban QA Lab

Laboratorio estático y aislado del módulo Kanban de Bardo. La referencia visual es Bardo Docs: interfaz editorial, mínima, mobile-first y sin chrome de dashboard innecesario.

## Contrato de producto: Jira Light

El objetivo no es replicar Jira. El módulo cubre solo lo necesario para organizar trabajo rápido:

- título;
- descripción;
- columna/estado;
- responsable;
- prioridad;
- tags;
- subtareas;
- comentarios.

No existen fecha límite, estimación, origen, épicas, sprints, story points ni campos configurables.

## Límites deliberados

- 4 columnas por defecto: Backlog, Por hacer, En curso y Hecho.
- máximo 5 columnas por tablero.
- máximo 8 tags creados por tablero.
- máximo 50 subtareas por tarea para stress QA.
- máximo 150 comentarios por tarea para stress QA.

Los límites de columnas y tags son parte del producto: evitan que el módulo evolucione hacia una herramienta burocrática.

## Mock y stress

El estado inicial contiene 4 tableros y 470 tareas mock. Los datos viven únicamente en `localStorage` bajo `bardo-kanban-qa-v5`.

Dentro de `••• → Herramientas QA` se puede:

- añadir 250 tareas;
- añadir 1000 tareas;
- ejecutar autoprueba de invariantes;
- vaciar el tablero;
- restablecer todos los mocks.

El render es progresivo: muestra hasta 120 tarjetas por columna y permite cargar más sin excluir el dataset completo de búsqueda y filtros.

## UX

- header mínimo: nombre del tablero + buscar + opciones + crear;
- sin avatar de Bardo, hero, subtítulos promocionales ni estadísticas permanentes;
- búsqueda y filtros bajo demanda;
- cards sobrias con metadata progresiva;
- detalle de tarea editorial, no formulario empresarial;
- drag & drop en desktop;
- una columna visible a la vez en mobile;
- creación rápida con título y columna;
- autosave, undo y persistencia local.

## QA automatizado

La versión v5 fue recorrida en Chromium con mocks de `localStorage` y pasó los gates de:

- 4 columnas iniciales;
- 4 tableros mock;
- ausencia de campos prohibidos;
- creación y edición de tarea;
- responsable y prioridad;
- tags;
- subtareas;
- comentarios;
- quinta columna permitida y sexta bloqueada;
- 8 tags permitidos y noveno bloqueado;
- stress +1000 tareas;
- autoprueba de invariantes;
- 0 errores JavaScript durante el recorrido;
- mobile con una sola columna activa.

## Aislamiento

Todo vive en `prototypes/kanban/` más su workflow exclusivo de Pages. No modifica `src/`, `activity/`, Worker, D1, R2, migraciones ni Bardo Docs.
