# Bardo — aceptación de producto

**READY_FOR_UAT — implementación terminada y lista para aceptación humana.**

Actualización del 13 de octubre de 2026: desplegada por autorización del usuario en el Worker habitual de Discord. Consulta [DEPLOYMENT.md](DEPLOYMENT.md) para abrirla y recuperar el checkpoint.

Rama: `codex/product-completion-uat`. Base: `03a9a79`, con los cuatro commits del PR #22 sobre `main` (`8a02ebd`). El PR #22 estaba abierto y con un fallo de CI al consultarlo el 13 de octubre de 2026. No se hizo merge ni se publicó la rama.

## Recorte MVP — captura de audio retirada

La captura nueva está deshabilitada en código y no aparece en la interfaz. Se conservan documentos, agenda, participantes, reloj, acuerdos y actas. Las grabaciones anteriores siguen disponibles en el resumen para descargar desde sus opciones, en el dispositivo donde se guardaron. También se recuperan fragmentos de una captura interrumpida anterior y se muestran audios cuyo tema o bloque ya no está en la agenda.

No se borraron audios, metadatos ni bases locales. No hubo migraciones D1. El resto del diseño mantiene sus componentes y estilos; solo se cierran los espacios de los controles retirados y se omiten estadísticas vacías de audio.

Validación de este recorte: 393 pruebas unitarias aprobadas; 116 E2E generales aprobadas con 44 omisiones condicionales por viewport; 8 E2E adicionales de descarga y recuperación de audio anterior aprobadas en cuatro tamaños. Descargas verificadas byte a byte, sin solicitar micrófono. Lint, tipos, build y revisión visual de reunión/resumen en 320 y 1440 px aprobados. La aceptación autenticada en Discord sigue siendo humana.

## Qué cambia (implementación anterior)

- Inicio reúne Documentos, borradores y Reuniones con datos disponibles del canal. `/bardo` y la apertura nativa llegan a Inicio; Docs y Reuniones conservan sus destinos directos. El historial no repite acciones de creación.
- Docs conserva líneas vacías dentro de código, permite reabrir `/` tras Escape y mantiene visible la opción seleccionada con teclado. Un fallo de almacenamiento conserva el editor y permite reintentar; también protege Atrás y el cierre del navegador.
- Discord valida la cuenta actual antes de hidratar contenido. Las credenciales solo se adjuntan al origen de Bardo. Hilos privados requieren pertenencia o permiso administrativo correspondiente; los canales no sincronizados no heredan incorrectamente los overrides de su categoría.
- El selector consulta miembros por nombre o apodo y diferencia el directorio del servidor de los participantes conectados. No depende de un listado inicial de 100 personas.
- Las copias locales se separan por servidor, canal y usuario. Los datos antiguos sin propietario verificable se conservan, sin asignarlos automáticamente a una cuenta.
- No se puede abandonar Reuniones con una grabación activa o pendiente de guardar. Primero hay que detenerla y guardarla o descartarla deliberadamente.

Se conservan React 19, Vite, Plate 53, el formato canónico HTML/Markdown, los tokens, Inter y los componentes existentes. No se agregaron dependencias ni migraciones D1.

## Preparación para probar

La rama ya está desplegada en el Worker habitual. Los tests automatizados de navegador usaron modo standalone y mocks donde corresponde: **no certifican funcionamiento dentro de Discord**.

Para revisar localmente, usa Node >=22.12 y las dependencias existentes:

```sh
npm run build
npm --prefix activity-app run preview -- --host 127.0.0.1 --port 4173
```

Abre `http://127.0.0.1:4173/#home`. En este modo se puede probar Home, edición, borradores, reuniones e importación; publicar en el canal y exportar PDF/Word requieren Discord y backend.

Para UAT real se necesita una aplicación de Discord de prueba que apunte a una instancia de esta rama, con Worker y D1 de prueba, secretos configurados por su administrador y el bot presente en el servidor. Para esta aceptación el usuario autorizó desplegar en el Worker habitual; ya se realizó y quedó un checkpoint. No se ejecutaron migraciones remotas. El 13 de octubre se actualizaron y verificaron las descripciones/opciones de los comandos del servidor, con copia previa para rollback. **No uses las ramas `main` o `module/bardo-docs` para preparar una prueba: su workflow despliega automáticamente a producción.**

El cliente solicita OAuth `identify`. El servidor consulta permisos mediante el bot. La búsqueda oficial de miembros por nombre/apodo no necesita el intent de listado masivo `GUILD_MEMBERS`; solicita al menos dos caracteres y devuelve hasta 100 coincidencias, pidiendo acotar si alcanza el límite. Si Discord la rechaza o limita, el selector explica el fallo y conserva participantes conectados, la cuenta actual e invitados. Los invitados son etiquetas, no una prueba de pertenencia ni de autorización.

Para probar permisos, prepara dos cuentas y dos canales: uno compartido y otro restringido. Incluye un hilo privado al que solo una cuenta pertenezca. La caché normal de permisos dura hasta 60 segundos; el inicio de sesión vuelve a comprobar acceso. En un entorno de prueba puede usarse `DISCORD_PERMISSION_CACHE_TTL_MS=0` para verificar cambios inmediatos.

## Cinco recorridos de aceptación

### 1. Inicio y navegación

**Acción:** desde un canal ejecuta `/bardo`. Comprueba servidor y canal. Abre Documentos, vuelve mediante «Bardo · Inicio», abre Reuniones y una agenda. Usa Atrás. Crea una reunión desde Inicio y usa Atrás otra vez. Repite en móvil.

**Esperado:** Inicio muestra contenido real del mismo canal, permite llegar a ambos módulos y conserva el borrador. Atrás vuelve al destino anterior sin volver a crear la reunión. No hay desborde horizontal en 320, 390, 768, 1024 y 1440 px.

**Error reconocible:** aparece otro canal, contenido ficticio, un destino vacío, una reunión duplicada por Atrás o controles fuera de pantalla. Si una carga falla, debe existir aviso y «Reintentar conexión».

### 2. Documentos

**Acción:** crea un documento con título, encabezado, párrafos, lista numerada, tareas, tabla, cita, destacado, desplegable y código con líneas vacías finales. Abre `/`, filtra y elige usando flechas y Enter; pulsa Escape y vuelve a abrirlo. Usa undo/redo. Pulsa «Listo», cierra la Activity y reabre el documento.

**Esperado:** el contenido, las tareas y la estructura siguen presentes. El guardado indica estado real. Un borrador sin publicar puede continuarse desde Inicio. Teclado y toolbar móvil siguen operables.

**Error reconocible:** desaparecen bloques o líneas del código, queda un menú inaccesible, se anuncia guardado después de fallar o Atrás pierde un cambio. Ante «No se guardó», mantén la página abierta, copia el contenido, libera espacio y reintenta «Listo».

### 3. Importación y exportación

**Acción:** importa un Markdown con listas, tabla y código; repite con TXT, DOCX y un PDF con texto seleccionable. Edita el resultado, guarda y exporta Markdown; dentro de Discord prueba PDF y Word.

**Esperado:** contenido esencial legible y editable, título correcto y descarga válida. La estructura compatible sobrevive al circuito importar → editar → guardar → reabrir → exportar. El original de una importación fallida permanece descargable cuando el backend lo conserva.

**Error reconocible:** archivo vacío, texto perdido, enlace sin permiso o importación eternamente en progreso. PDF se convierte por extracción de texto; no promete fidelidad de maquetación ni OCR de documentos escaneados.

### 4. Reuniones

**Acción:** crea agenda, cambia fecha/hora, elige facilitador y participantes, añade temas y responsables. Inicia la reunión, pausa/reanuda, registra acuerdos y termina. Guarda el acta en Documentos y reábrela. Si tienes audios anteriores, abre el resumen y usa «Opciones de la grabación → Descargar audio» desde el dispositivo donde se guardaron. Repite tras recargar.

**Esperado:** agenda y acuerdos sobreviven a recargar. El reloj respeta pausa, el cierre pide confirmación y el acta corresponde a esa reunión. No aparece Grabar ni se solicita permiso de micrófono. Las reuniones sin audio no muestran estadísticas vacías de grabación; los audios anteriores conservan su descarga.

**Error reconocible:** cambios aplicados a otra reunión, reloj que avanza pausado, acta incorrecta, audio perdido o duplicación por Atrás. Los audios anteriores dependen del almacenamiento del dispositivo original; no hay captura nueva en el MVP.

### 5. Discord: comandos, miembros y permisos

**Acción:** prueba `/bardo`, `/docs`, `/doc-new`, `/doc-upload`, `/reu-new`, `/reus` y `/ayuda`, junto con los alias que tenga registrada la aplicación de prueba. Abre sus tarjetas desde el canal original. Busca una persona fuera de los primeros 100 miembros del servidor. Cambia de canal y de cuenta. Intenta abrir contenido restringido y un hilo privado sin ser miembro. Repite el acceso principal en Discord móvil.

**Esperado:** `/bardo` abre siempre Inicio, incluso tras abrir un documento eliminado; no ofrece opciones de sección. `/ayuda` explica los comandos y su botón abre Inicio. Cada comando conserva su contexto; búsqueda por prefijo encuentra miembros pertinentes; participantes conectados se distinguen del directorio. No aparecen borradores de otra cuenta ni datos de canales prohibidos. Acceso denegado no se resuelve mostrando una copia privada anterior. Errores temporales y rate limits se comunican y permiten reintentar.

**Error reconocible:** token de una cuenta anterior, contenido de otro ámbito, permiso concedido solo por datos del cliente, directorio presentado como completo o comando que abre un módulo incorrecto. El registro de comandos del servidor se verificó contra esta rama el 13 de octubre; el comando global de lanzamiento se conservó.

### Función de cada comando

| Comando | Resultado |
| --- | --- |
| `/bardo` | Abre Inicio del canal. |
| `/docs` | Lista documentos del canal con botones para abrirlos. |
| `/doc-new` | Crea un documento y muestra el botón para editarlo. |
| `/doc-upload` | Importa un archivo Markdown, TXT, PDF o Word (.docx). |
| `/upload-docs` | Alias compatible de `/doc-upload`. |
| `/reus` | Lista reuniones del canal. |
| `/reu-new` | Crea una reunión con título y opciones de fecha, hora y duración. |
| `/ayuda` | Muestra una guía privada de los comandos y un botón para Inicio. |

## Datos antiguos y recuperación

Los documentos y reuniones confirmados en D1 vuelven a descargarse con los permisos actuales. Borradores, diarios y colas locales anteriores no incluyen propietario verificable: no se importan automáticamente al nuevo ámbito y no se eliminan. Inicio no muestra un aviso por estas copias. Las indicaciones están en `/ayuda` → «Recuperar contenido anterior»: conserva ese navegador/dispositivo y solicita recuperación al administrador del entorno. No hay importación automática ni se han borrado datos.

La recuperación requiere identificar al dueño legítimo antes de exportar o trasladar esos datos. No se debe copiar indiscriminadamente todo el localStorage entre cuentas ni borrar el almacenamiento para quitar el aviso. Conserva una copia local de las claves anteriores y recupera únicamente contenido cuya propiedad se haya verificado. Es una limitación deliberada de compatibilidad frente a datos antiguos sin dueño, no una migración destructiva.

## Decisión de editor y referencias

Se conserva [Plate (MIT)](https://github.com/udecode/plate/blob/main/LICENSE): sus patrones oficiales de [slash menu](https://platejs.org/docs/slash-command) y [Markdown](https://platejs.org/docs/markdown) son compatibles con el stack. El adaptador actual mantiene las convenciones de Bardo; no hay impedimento crítico que justifique cambiarlo.

Los patrones de [teclado de Notion](https://www.notion.com/help/keyboard-shortcuts) orientan la interacción, sin copiar su identidad. [BlockNote](https://www.blocknotejs.org/docs/getting-started) es una alternativa React basada en otro modelo; su [licencia](https://www.blocknotejs.org/legal/terms-and-conditions) distingue núcleo MPL-2.0 de extensiones XL GPL/comercial. [Novel](https://github.com/steven-tey/novel) usa Tiptap y Apache-2.0. Adoptarlos exigiría migrar y demostrar compatibilidad del contenido existente.

La revisión técnica siguió [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), los componentes [shadcn Base UI](https://ui.shadcn.com/docs/components/base/button) instalados y las reglas locales de refinamiento de Impeccable. Los hooks responden correctamente a un fixture Codex; no se detectó ejecución automática en esta sesión y se aplicó el detector manual a los archivos cambiados.

## Verificación de ingeniería

- Versiones instaladas: React 19.2.8, Vite 8.2.2, Plate 53.3.11, Base UI 1.7.0 y Tailwind 4.3.3; Node local 24.15.0.
- `npm run check`: lint, build y validaciones de sintaxis aprobados. `npm --prefix activity-app run typecheck`: aprobado; añadido también al workflow de CI.
- `node --test`: **392 pruebas aprobadas**, sin omisiones. Incluye cuatro pruebas de esquema: replay de todas las migraciones en SQLite vacío, secuencia de migraciones, compilación de SQL y ejecución de exports de base de datos.
- Baseline E2E: 67 aprobadas y 20 omisiones condicionales existentes. El fallo del CI remoto de PR #22 era `31.999998092651367` frente a `32 px`; la tolerancia quedó en **0.001 px**, sin redondear ni reducir tamaños reales.
- Corrección de Home y Reuniones: 22 pruebas enfocadas aprobadas. El audio de la prueba de protección usa un micrófono simulado, sin acceso al micrófono real.
- Impeccable: fixture del hook Codex aprobado; detector manual con tres advertencias preexistentes sobre borde de cita y curvas de animación. No se añadieron supresiones ni se cambiaron esos rasgos visuales.
- El build conserva el aviso de tamaño de chunks; no es un fallo de compilación ni se modificó el límite para ocultarlo. No se afirma una mejora de rendimiento no medida.

- Integración E2E final: **172 aprobadas, 56 omisiones condicionales preexistentes, 0 fallos** en 320, 390, 768, 1024, 1280 y 1440 px. Se ejecutó `npm --prefix activity-app run test:e2e -- --project=mobile-narrow --project=mobile-standard --project=tablet --project=desktop-compact --project=laptop --project=desktop --workers=4 --forbid-only`. Ninguna prueba nueva se omite. Capturas de Home inspeccionadas en móvil y escritorio; cobertura automatizada adicional de texto largo, contraste, foco, reduced motion y aumento de texto.

**Próxima acción:** cerrar y volver a abrir Bardo con `/bardo` en Discord para ejecutar los cinco recorridos sobre la versión desplegada.
