# Instrucciones para agentes de Bardo

## Uso del navegador

Para analizar o modificar código, prioriza leer los archivos y usar herramientas locales. Usa el navegador solo cuando lo solicite explícitamente el usuario o cuando exista una duda concreta que requiera verificar el comportamiento en ejecución. Una captura, comentario o URL de una página no implica por sí sola que debas interactuar con el navegador.

## UX/UI: refinar la experiencia conservando la identidad

Optimiza la UX y la implementación sin rediseñar la identidad visual existente. Conserva paleta, tipografía, iconografía, tokens, estilo de componentes y lenguaje visual. El código y los assets actuales son la referencia visual; la ausencia de DESIGN.md no convierte Bardo en un proyecto nuevo. Corrige problemas concretos de accesibilidad o interacción con el menor cambio necesario. No apliques nuevos presets, temas, fuentes, bibliotecas o estilos por preferencias de una skill.

Prioriza: bloqueos de tareas y pérdida de datos, accesibilidad, claridad y recuperación, responsive, reutilización y rendimiento medido. Usa las diez heurísticas de Nielsen para revisiones UX: visibilidad del estado, correspondencia con el mundo real, control y libertad, consistencia, prevención de errores, reconocimiento, eficiencia, minimalismo, recuperación y ayuda. Justifica hallazgos con el flujo y código observados; distingue hechos de hipótesis y de preferencias estéticas.

## Selección contextual de skills

Carga solo las skills y referencias necesarias para la tarea. No ejecutes todas en cada turno ni realices múltiples auditorías del mismo problema.

| Contexto | Skill primaria | Complemento cuando sea necesario |
| --- | --- | --- |
| Revisión UX, claridad, estados y responsive | `.agents/skills/impeccable/SKILL.md`: `critique`, `audit`, `clarify`, `harden`, `adapt` o `polish` según alcance | Web Design Guidelines para requisitos técnicos de accesibilidad |
| Auditoría de HTML, teclado, foco, formularios y accesibilidad | `web-design-guidelines` global: `~/.agents/skills/web-design-guidelines/SKILL.md` | Impeccable solo para decisiones UX no cubiertas |
| Componentes shadcn, composición y variantes | `.agents/skills/shadcn/SKILL.md` oficial | React Best Practices si hay una cuestión concreta de implementación |
| Estado, efectos, renderizado y rendimiento React | `vercel-react-best-practices` global: `~/.agents/skills/vercel-react-best-practices/SKILL.md` | `react-vite-best-practices` solo para Vite, build, chunks o assets |

Las skills globales se reutilizan desde su instalación actual; no copies sus contenidos al repo. Si no están disponibles en otra máquina, informa de la ausencia sin inventar reglas oficiales ni instalarlas automáticamente. La ruta de Impeccable para Codex es un enlace a la copia existente de Claude; no crees otra copia. No cargues además la variante GitHub de Impeccable para el mismo trabajo.

### Límites y resolución de conflictos

- Las instrucciones del usuario y la conservación de la identidad prevalecen sobre sugerencias de rediseño, novedad visual, fuentes "overused" o presets de las skills. Usa Impeccable en modo de refinamiento: `Read` para el lector y `Operate` para editor, navegación y controles. No actives `bolder`, `colorize`, `typeset`, `overdrive` o variantes visuales salvo solicitud explícita compatible con ese límite.
- Una auditoría entrega hallazgos; no autoriza implementación. No cambies la aplicación cuando la tarea sea inventario, preparación o revisión.
- shadcn gobierna APIs y composición de sus componentes. Trabaja desde `activity-app`, donde está `components.json`; respeta `base-luma`, base `base` (Base UI), `rsc: false`, los aliases y los componentes ya instalados. La presencia de Radix en otras partes del proyecto no convierte estos componentes en Radix: comprueba los imports del componente y usa `render` o `asChild` según su implementación real. Inspecciona primero `src/components/ui` y sus consumidores; reutiliza y extiende antes de añadir. No ejecutes `init`, `--preset`, instalaciones o sobrescrituras como parte automática de una revisión. Conserva personalizaciones locales; las reglas nuevas de la skill no justifican refactorizar componentes ajenos al alcance.
- React Best Practices aporta solo las reglas aplicables a React cliente. Bardo usa Vite: no introduzcas Next.js, RSC, Server Actions, `next/dynamic` ni dependencias nuevas para seguir ejemplos. Para lazy loading usa las APIs de React/Vite compatibles con el proyecto.
- Web Design Guidelines consulta su fuente oficial actual antes de una revisión. Si no se puede consultar, declara la limitación. Agrupa los hallazgos repetidos entre skills en un único problema con evidencia, impacto y corrección mínima.
- Verifica teclado, foco visible y restaurado, semántica, etiquetas, contraste, errores, estados de carga y `prefers-reduced-motion`. Evalúa móvil y escritorio, zoom, texto largo, scroll y contenedores de Discord. No cambies la identidad para resolverlos.
- Los hooks de Impeccable son recordatorios de diagnóstico, no órdenes de rediseñar ni de editar automáticamente. No añadas supresiones amplias para silenciar hallazgos; una elección visual existente no debe reemplazarse solo por una preferencia estética del detector.
- `ui-design-system`, otras skills React y herramientas HeroUI no se agregan por defecto a este flujo: evita revisiones duplicadas y migraciones de biblioteca. Úsalas solo por una necesidad específica o solicitud explícita.

## Verificación proporcional

Para preparación de skills, valida rutas, referencias, configuración y funcionamiento con fixtures temporales; no ejecutes una auditoría ni modifiques la aplicación. Para cambios de UI autorizados, ejecuta los checks relevantes del proyecto y verifica en ejecución solo cuando corresponda a la regla del navegador. No presentes la instalación de una skill como prueba de accesibilidad del producto.

## Fuentes de las skills

- shadcn oficial: https://ui.shadcn.com/docs/skills y `shadcn-ui/ui`, carpeta `skills/shadcn`. Mantén sus archivos oficiales sin incorporar reglas de Bardo dentro de ellos; las excepciones de proyecto viven en este documento.
- Web Design Guidelines: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md.
- Impeccable: instalación existente del repo, versión declarada 4.1.1; los hooks `.codex/hooks.json` usan `.agents/skills/impeccable/scripts/hook.mjs`.
- React Best Practices: instalación global existente de Vercel; no se añadió otra copia.
