# Revisión de interfaces y grabación — 13 de octubre de 2026

Registro histórico: la captura nueva se retiró posteriormente del MVP; se conservan los audios anteriores. El alcance actual está en UAT.md y el despliegue en DEPLOYMENT.md.

Se conserva la identidad visual de Bardo: paleta, tipografía, iconos, tokens y componentes. No hay nuevas dependencias ni cambios de esquema.

## Ajustes realizados

- Dropdowns, submenús, selectores buscables y modales comparten ScrollArea, scrollbar interior y fade de 16 px cuando hay contenido para desplazar. El fade respeta movimiento reducido; las superficies, bordes y sombras quedan fuera de la máscara.
- Los modales se mantienen dentro del viewport. El título reserva espacio para cerrar; las acciones largas pueden envolver y las acciones únicas ocupan todo el ancho. La vista de texto desplaza su contenido de forma independiente.
- Las filas de reuniones mantienen icono, título, menú y flecha en una sola fila. La reunión actual muestra su estado en vivo también en la lista.
- Fecha y horas tienen el mismo tratamiento. La duración se alinea con su etiqueta, las advertencias usan el formato horario de los campos y la selección de participantes resume nombres largos con un contador.
- El aviso de grabación alinea icono, texto y cierre, y explica el alcance real del micrófono.
- Al terminar una reunión, la URL lleva al resumen: recargar conserva esa vista. El audio guardado se puede descargar desde sus opciones. El progreso de audio de la agenda responde al teclado y contempla duraciones WebM no finitas.
- Los errores de almacenamiento no se presentan como un guardado correcto y explican cómo descargar el audio mientras continúa disponible en la pestaña.

Los cambios previos de botón único a ancho completo, blur de la barra del editor y menú `/` siguen incluidos.

## Verificación

- `npm --prefix activity-app run check`: lint, TypeScript y build aprobados.
- `node --test`: 392 aprobadas, 0 fallos. Incluye continuidad de captura entre temas, pausa, errores y persistencia.
- Playwright en 320, 768, 1024 y 1280 px: 115 casos aprobados en la ejecución general. Una aserción antigua esperaba `overflow: auto`, mientras Base UI usa `scroll` con scrollbar nativo oculto; se corrigió para aceptar ambos comportamientos. La repetición enfocada terminó con 13 aprobadas, 3 omisiones condicionales y 0 fallos. La ejecución general tenía 44 omisiones condicionales por viewport; no se omitieron pruebas nuevas de audio.
- Recorrido visual adicional de 13 superficies en 320, 768 (tema claro) y 1440 px: Inicio, Documentos, editor, lector, texto en modal, edición de reunión, selector de personas, hora, agenda, reunión en curso, confirmación de término, resumen y lista de reuniones. Sin desbordamiento horizontal de página.
- Verificación adicional en 320×450: nombres largos, scrollbar, movimiento reducido, restauración de foco, cierre sin solaparse con título, estado terminado y guardado del acta en Documentos.
- Dos pruebas nuevas usan MediaRecorder real con señal sintética, sin abrir el micrófono personal: pausa/reanudación, liberación de tracks, guardado, reproducción, recarga, descarga idéntica byte a byte y recuperación tras denegar permiso. Ambas pasan en los cuatro tamaños.
- Detector Impeccable sobre los componentes de esta revisión: sin hallazgos. El aviso preexistente de chunks grandes del build continúa visible.

## Alcance de la grabación y aceptación en Discord

Grabar captura el micrófono del dispositivo. Guarda audio local en IndexedDB y asocia la grabación al tema o bloque; al avanzar continúa capturando. No captura automáticamente las voces del canal, no sube el binario a un almacenamiento compartido ni genera transcripción.

La autorización real del micrófono y los flujos autenticados en el cliente de Discord requieren aceptación en ese cliente. Las pruebas automatizadas no sustituyen esa comprobación. Cerrar y reabrir Bardo con `/bardo` carga el despliegue actualizado; el checkpoint y rollback están en DEPLOYMENT.md.
