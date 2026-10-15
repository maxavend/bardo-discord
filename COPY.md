# Voz y glosario de Bardo

Guía corta para escribir textos de interfaz, avisos de Discord y errores. Sirve tanto para personas como para agentes.

## Voz

- **Cercana y clara, sin exagerar.** Habla como una persona del equipo que explica algo con calma. No vende ni celebra de más: nada de «¡Genial!», «¡Ups!», «¡Increíble!» ni signos de exclamación en la interfaz.
- **Tú, en español neutro.** «Crea», «Abre», «Puedes». Sin chilenismos ni voseo, y sin «usted».
- **Primero lo que importa.** Qué pasó, qué significa para la persona y qué puede hacer ahora. Cada idea se dice una vez.
- **Concreta.** Verbo + objeto: «Archivar tarea», no «Confirmar». Nombra la cosa real: «Esta reunión», no «Este elemento».
- **Corta, pero completa.** Se quita lo que sobra, nunca la salida: un error siempre dice cómo seguir.
- **Mayúscula solo al inicio** de títulos, botones y etiquetas, salvo nombres propios (Discord, Bardo).
- **Sin jerga interna.** Nada de «sync», «payload», «409», «ID», «local storage». Si hace falta, se dice «en este dispositivo».

## Tono según el momento

| Momento | Cómo suena | Ejemplo |
| --- | --- | --- |
| Vacío por primera vez | Invita y dice el siguiente paso | «Todavía no hay tareas. Crea la primera aquí o con /tarea en Discord.» |
| Sin resultados | Distingue de «vacío» y ofrece salir | «Ninguna tarea coincide con el filtro.» + «Quitar filtros» |
| Cargando | Nombra lo que carga | «Cargando tareas…» |
| Éxito rutinario | Breve, o nada si se ve el cambio | «Movida a «En curso».» |
| Error recuperable | Qué falló + cómo seguir, sin culpar | «No se pudo guardar el nombre. Revisa tu conexión e inténtalo de nuevo.» |
| Sin permiso | Serio, claro y sin rodeos | «No tienes acceso a este canal en Discord.» |
| Acción destructiva | Nombra el objeto y la consecuencia | «¿Eliminar la columna «QA»? Sus 3 tareas se moverán a la columna que elijas.» |

## Glosario

Usa siempre la misma palabra para lo mismo.

| Concepto | Palabra | Evitar |
| --- | --- | --- |
| Lo que agrupa un canal en Bardo | **espacio** | workspace, entorno |
| Módulos | **Inicio**, **Documentos**, **Reuniones**, **Tareas** | Docs (salvo en la barra móvil por espacio), Planner, Kanban |
| Pieza de Documentos | **documento** | doc, archivo (salvo el que se sube) |
| Traer un archivo | **subir archivo** / **importar** | cargar |
| Publicar en Discord | **compartir en el canal** | enviar, postear |
| Partes de una reunión | **agenda**, **bloque**, **tema**, **acuerdo**, **acta**, **resumen** | recap, punto, minuta (salvo «acta») |
| Quien guía la reunión | **quien facilita** | host, moderador |
| Pieza de Tareas | **tarea** (en el tablero también «tarjeta» solo para lo visual) | ticket, issue, card |
| Partes de una tarea | **responsable**, **fecha límite**, **prioridad**, **etiqueta**, **subtarea** | asignado, deadline, label, tag |
| Columnas | **columna**; la final es **«Hecho»** | lista, estado |
| Sacar de la vista sin borrar | **archivar** / **restaurar** | ocultar, papelera |
| Borrar para siempre | **eliminar** (y decir que no se puede deshacer) | borrar definitivamente |
| Crear algo | **Nuevo/Nueva + objeto** en botones: «Nueva tarea», «Nuevo documento», «Nueva reunión» | Crear (en botones de alta) |
| Volver atrás | **Volver** o «Volver a + lugar» | Atrás, Regresar |

## Formato

- Puntos suspensivos con el carácter `…`.
- Números con cifras: «3 tareas», «1 h 15 min». Plural correcto: «1 tarea», «2 tareas».
- Comillas latinas para nombres citados: «En curso».
- Fechas cortas en español: «15 oct», «Hoy», «Mañana».
- Mensajes completos, sin pegar fragmentos: así se pueden traducir y reordenar.
- El nombre accesible (`aria-label`) dice lo mismo que se ve, más el objeto si el botón es solo un ícono: «Más acciones de la tarea #12».

## Alturas de controles

Un botón al lado de un campo (o de otro control en la misma fila) tiene el mismo alto. `Input` y `Button` por defecto miden `h-9`; si el campo usa `h-8`, el botón usa `size="sm"`. El e2e `activity-app/tests/geometry.spec.js` lo verifica.
