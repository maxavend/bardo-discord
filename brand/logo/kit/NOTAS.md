# Bardo — Notas de entrega del logo

## Por qué esta forma

- **Concepto:** «Transcribo y punto». Bardo convierte lo que se habla en un canal en documentos, acuerdos y tareas. La onda (voz) se calma, se vuelve renglón (texto) y cierra con punto final (acuerdo).
- **Evita los clichés de la categoría:** no hay documento con esquina doblada, globo de chat ni checks.
- **Color con intención:** el violeta de la app cae solo sobre el punto final, que es justo la idea.
- **Wordmark propio:** «bardo» en minúsculas monolínea, con el mismo trazo (19 de 256) y los mismos remates redondos que el símbolo.

## Construcción

- La onda es una línea central de curvas cúbicas con **curvatura continua**. Los radios están garantizados en la cresta (R 28), el valle (R 26) y el asentamiento (R 40). La condición `a + b < Δx` asegura que los tiradores nunca se crucen; si se cruzaran, los huecos se cerrarían en punta.
- El contorno se calcula de forma exacta a partir de la línea central: cada tramo se divide en tres y se ajusta por mínimos cuadrados, con un error máximo de 0,06 sobre 256.
- **Correcciones ópticas:**
  - los tramos horizontales son un 6 % más finos;
  - la versión invertida tiene el trazo un 4 % más fino (el blanco sobre negro se ve más grueso);
  - las curvas del wordmark sobrepasan 1 unidad la línea base y la altura de las minúsculas.
- **Proporciones:** el punto mide dos trazos de diámetro. La separación entre el renglón y el punto mide un trazo.
- **Versión horizontal:** el símbolo está a 1,25× la altura de las minúsculas, con el punto apoyado en la línea base y una separación de 64 para que no se lea «.bardo».
- **Símbolo pequeño:** trazo 30, punto de radio 27 y onda más baja.
- Las láminas en `construccion/` muestran los tiradores, los círculos de curvatura y las guías.

## Pruebas hechas

| Prueba | Resultado |
|---|---|
| Auditoría SVG (14 maestros) | 99–100/100: sin texto vivo, imágenes, filtros ni trazos sin expandir |
| Escalera de tamaños de 16 a 256 px | El maestro se lee desde 24 px; el pequeño, desde 16 px |
| Una tinta, invertido, sobre foto y sobre patrón | OK |
| Desenfoque (silueta) | Se reconocen la onda, el renglón y el punto |
| Espejo y rotación 180° | Sin lecturas no deseadas |
| Contexto Discord (ícono de 64 px sobre `#313338`) | OK con la placa violeta |
| Comparación con marcas de la biblioteca (Vercel, Framer, Medium, Rocky Linux) | Igual de resuelto a la misma escala |

## Pendientes y riesgos

- **Marca registrada:** no se hizo búsqueda. Antes de publicar conviene una búsqueda profesional (bases de marcas y búsqueda inversa de imágenes).
- **Asociación posible:** una onda sobre una línea recuerda al ícono de «firma aquí» y al signo ≃. El punto final y el wordmark lo diferencian.
- **Pantone:** está sin confirmar; el violeta de pantalla queda fuera de la gama de impresión. Hay que elegirlo con una guía física.
- **Corte o vinilo:** en el wordmark, los fustes se superponen a los anillos (son formas separadas del mismo color). Para corte o bordado, unirlas en un editor vectorial.
- **Discord:** falta subir el ícono de 1024 px al Developer Portal y revisarlo en la lista de Activities.
- **App:** el favicon y los íconos todavía no se aplicaron en `activity-app/public`. `web/head-snippet.html` tiene las etiquetas listas.
- **Ícono Apple:** los renders de `apple/renders/` salen de `ictool` (Icon Composer 27.1, Xcode). Muestran el Liquid Glass real, pero el sistema puede variar levemente entre versiones. Falta comprobar en Xcode cómo se ve en sistemas anteriores a la generación 26 y revisarlo en un dispositivo real. visionOS y tvOS quedan fuera: `ictool` no los renderiza y en Xcode se arman como pila de imágenes.
