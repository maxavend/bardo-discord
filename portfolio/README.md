# Bardo · Material de portafolio

Capturas en alta resolución de Bardo con datos ficticios, realistas y coherentes, tomadas recorriendo la app de verdad (no son maquetas): cada pantalla es el resultado de interacciones reales sobre el build de producción.

## Escenario ficticio

**Lumen**, una fintech chilena para trabajadores independientes (boletas de honorarios, cobros y ahorro para impuestos). Su **Squad Onboarding** usa Bardo en el canal `#producto` para documentar, conducir reuniones y seguir tareas mientras rediseña el registro de la app.

- **Personas (8):** Sofía Herrera (Product Designer, quien usa la app en las capturas), Tomás Fuentes (PM), Camila Rivas (UX Research), Diego Morales (Frontend), Josefina Lagos (UX Writing), Andrés Muñoz (Tech Lead), Ignacia Vera (Datos) y Benjamín Soto (QA).
- **Fecha simulada:** lunes 19 de octubre de 2026, 09:40 (America/Santiago). Las reuniones en vivo avanzan el reloj para que los tiempos sean realistas.
- **Documentos (9):** brief, hallazgos de entrevistas, especificación de KYC, plan de usabilidad, guía de voz y tono, roadmap Q4, checklist de accesibilidad, acta de retro y un benchmark archivado.
- **Reuniones (5):** Weekly de producto (hoy, se conduce completa), crítica de diseño, sprint planning y dos reuniones terminadas.
- **Tareas (16):** 4 columnas, 7 etiquetas, responsables, prioridades, fechas (incluidas vencidas), subtareas y documentos enlazados.

Personas, empresa y cifras son inventadas.

## Estructura

```
capturas/
  <NN-flujo>/
    <NN-pantalla>/
      escritorio-oscuro.png   1440×900 @2x → 2880×1800
      escritorio-claro.png
      movil-oscuro.png        390×844 @3x → 1170×2532
      movil-claro.png
  reporte.json                resultado de cada recorrido (capturas, errores de consola)
```

| Flujo | Qué muestra |
| --- | --- |
| `00-carga` | Pantalla de carga de la Activity |
| `01-inicio` | Resumen del espacio: documentos, reuniones y tareas asignadas |
| `02-documentos` | Biblioteca, búsqueda, archivados, acciones, lector, editor, menú «/», documento nuevo e importación de un archivo |
| `03-reuniones` | Próximas reuniones, agenda, edición, reunión en vivo (temas, acuerdos, pausa, tiempo excedido), término, resumen, acuerdos → tareas, acta en Documentos y nueva reunión |
| `04-tareas` | Tablero, filtros, detalle, alta rápida, mover y arrastrar, etiquetas |
| `05-ajustes` | Ajustes personales, del espacio y del servidor |

Algunas pantallas existen solo en un formato (por ejemplo, arrastrar una tarea es de escritorio y el carrusel de columnas es de móvil).

## Regenerar

```bash
cd activity-app && node scripts/assemble-source.mjs && npx vite build --outDir /tmp/bardo-dist --emptyOutDir
cd .. && node portfolio/capture.mjs --dist=/tmp/bardo-dist
```

Opciones: `--only=03,04` (flujos), `--devices=desktop,mobile`, `--themes=dark,light`, `--preview` (escala 1 para revisar rápido), `--verbose`.

- `mock/data.mjs`: el dataset.
- `mock/build-seed.mjs`: lo convierte a lo que la app lee en modo local (localStorage y contexto del canal), con el mismo conversor Markdown → HTML de la app.
- `capture.mjs`: los recorridos y las capturas (Playwright, reloj y zona horaria fijos).

Los datos se inyectan solo en el navegador de captura; el código de la app no incluye este dataset.

El script usa el Google Chrome instalado (en modo headless): el headless-shell de Playwright se cierra solo a los ~30 s en este Mac. Escribe a ritmo humano (30 ms por tecla), y cada flujo corre en un navegador nuevo con datos recién sembrados.
