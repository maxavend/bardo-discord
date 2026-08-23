# Bardo · Kanban HeroUI QA

Implementación React + HeroUI v3 del laboratorio Kanban de Bardo. Esta app conserva el contrato funcional validado en el prototipo HTML y sirve como implementación de referencia antes de integrarse al producto.

## Stack

- React 19
- Vite 8
- TypeScript
- Tailwind CSS v4
- HeroUI v3

## Contrato funcional

- 4 columnas por defecto.
- máximo 5 columnas por tablero.
- máximo 8 tags por tablero.
- tarea: título, descripción, columna, responsable, prioridad, tags, subtareas y comentarios.
- drag & drop desktop.
- una columna visible a la vez en mobile.
- búsqueda, filtros y orden.
- CRUD de tableros y columnas.
- persistencia local.
- stress QA +250 / +1000.

## Fuente visual

La aplicación usa el theme exacto generado por HeroUI Theme Builder para:

- lightness `0.5774`
- chroma `0.2091`
- hue `273.85`
- base `0.01`
- radius `small`

`src/theme.css` contiene únicamente tokens authored por el Theme Builder. `src/styles.css` conserva la carga `tailwindcss → @heroui/styles → theme.css` y solo añade composición, geometría, responsive y layout propios del Kanban.

## Normalización visual mobile

La pasada actual fija una escala geométrica única para spacing, alturas de controles, tipografía e icon buttons. Usa los BEM oficiales de HeroUI para normalizar `Tabs`, `Modal`, `Dropdown`, `TagGroup` y `Button` sin crear una capa visual paralela al theme.

- topbar con cajas de acción equivalentes y kebab vertical.
- tabs mobile de una línea con scroll táctil nativo y sin chevrons flotantes.
- modales con header/body/footer, safe-area y paddings consistentes.
- configuración de columnas y tags sin overflow horizontal.
- herramientas QA adaptadas a mobile sin comprimir acciones.
- cards y encabezados de columna con una cadencia de spacing común.
- gate E2E específico para topbar, tabs, modal y overflow horizontal.

## Gates

`npm run audit` ejecuta lint visual, typecheck, build y E2E. El build también incluye el lint visual para impedir un deploy con reglas que compitan accidentalmente con HeroUI.

<!-- deploy-after-normalization -->
