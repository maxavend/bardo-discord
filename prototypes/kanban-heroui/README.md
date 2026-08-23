# Bardo Kanban · HeroUI QA

Implementación React del contrato UX validado en `../kanban/`.

## Stack

- React 19.2.8
- Vite 8.2.1
- TypeScript 7.0.2
- Tailwind CSS 4.3.3
- HeroUI 3.2.4
- HeroUI built-in dark theme (`data-theme="dark"`), sin custom theme

## Contrato Jira Light

- 4 columnas por defecto.
- Máximo 5 columnas por tablero.
- Máximo 8 tags en el catálogo de cada tablero.
- Una tarea solo expone: título, descripción, columna, responsable, prioridad, tags, subtareas y comentarios.
- Creación rápida: título + columna.
- Mobile: una columna visible a la vez.
- Desktop: todas las columnas + drag and drop.
- localStorage, undo, búsqueda, filtros progresivos, CRUD de tableros, stress mock y autoprueba.

## Datos QA

El seed inicial genera 4 tableros y 470 tareas mock determinísticas. Desde `•••` o Configurar tablero se pueden añadir +250 o +1000 tareas.

## Desarrollo

```bash
npm install
npm run typecheck
npm run dev
```

## Build

```bash
npm run build
```

Cloudflare Pages publica `dist/` desde la branch `module/kanban`.

## Referencia

`../kanban/` queda congelado como laboratorio HTML aprobado. La migración HeroUI no debe rediseñar el contrato, solo llevarlo a la implementación definitiva del módulo.
