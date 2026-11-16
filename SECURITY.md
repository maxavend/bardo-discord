# Seguridad de Bardo

Revisión y despliegue del 16 de noviembre de 2026. Se corrigieron fallos confirmados de permisos, autenticación y consumo de recursos. Las correcciones están publicadas en la app y el sitio; no constituyen una garantía de ausencia de vulnerabilidades. Versiones y recuperación en `DEPLOYMENT.md`.

## Correcciones verificadas

| Superficie | Problema | Protección añadida |
| --- | --- | --- |
| HTTP, OAuth, MCP y adjuntos | El cuerpo se almacenaba completo antes de comprobar el tamaño. | Lectura incremental acotada por bytes reales, incluso sin `Content-Length` o con un valor falso; cancelación al superar el límite. |
| OAuth MCP | Una petición con cliente, redirect o PKCE incorrectos podía consumir el código y revocar una autorización legítima. | Consumo atómico condicionado a cliente, redirect y PKCE. |
| Refresh y consentimiento MCP | Un cliente o sesión ajenos podían gastar credenciales de otra autorización. | Rotación vinculada al cliente, validación del recurso y consentimiento vinculado a su sesión antes del consumo. |
| Hilos de tareas | Los permisos del bot sustituían a los de la persona para crear hilos. | Verificación fresca de ver, escribir, crear hilos públicos y escribir en hilos para la persona. |
| Avisos por mensaje directo | Un reintento podía enviar información del canal a un responsable que ya perdió acceso. | Revalidación fresca antes del reintento y antes de entregar el mensaje, también en avisos agrupados. |
| Interacciones de Discord | Una firma válida podía reutilizarse indefinidamente. | Rechazo de timestamps con más de cinco minutos de antigüedad o más de un minuto en el futuro. No equivale a uso único dentro de esa ventana. |
| DOCX | Recuentos y tamaños ZIP falsificados eludían el control de descompresión. | Coherencia entre directorio y cabeceras, rechazo de estructuras no soportadas y presupuesto sobre bytes realmente descomprimidos antes de Mammoth. |
| Markdown y PDF | Tablas irregulares, anidación, expresiones inline y líneas vacías podían amplificar el trabajo o la memoria. | Presupuestos de formato y límite de páginas PDF; se conserva el texto o se devuelve un error recuperable, sin archivos truncados. |
| Puente Discord SDK | El SDK aceptaba ciertos mensajes de ventanas ajenas y validaba colecciones sin un presupuesto previo. | Comprobación de `event.source` y límites estructurales antes del parser; se mantienen mensajes nativos con `source: null`, sujetos al mismo presupuesto y al control de origen del SDK. |

Las regresiones reproducen solicitudes sin longitud o con longitud falsa, credenciales de cliente/sesión ajenos, revocación de permisos, ZIP falsificado, contenido extremo y mensajes al SDK. La prueba del puente usa el SDK instalado y comprueba handshake, READY, autorización y actualizaciones de participantes.

## Límites de entrada y trabajo

| Entrada | Presupuesto |
| --- | --- |
| OAuth, autenticación, ajustes, API web, informes CSP | 8 KiB por cuerpo HTTP |
| Reuniones | 512 KiB por cuerpo HTTP |
| Tareas | 64 KiB por cuerpo HTTP |
| Documentos y MCP | 4 MiB por cuerpo HTTP; sigue vigente el límite de 1.800.000 bytes de contenido de documento |
| Interacciones de Discord y otras rutas | 256 KiB por cuerpo HTTP |
| Adjuntos de Discord | 1.800.000 bytes descargados |
| DOCX expandido | 30 MiB y 3.000 entradas |
| Tablas Markdown | 128 columnas y 10.000 celdas |
| Markdown inline y detalles anidados | 16.384 caracteres inline y 12 niveles; el exceso se muestra como texto escapado |
| Exportación PDF | 300 páginas; superar el límite devuelve HTTP 413 con alternativa de descarga |
| Mensajes RPC de Discord | 2.048 elementos por colección, 30.000 valores, 1.048.576 caracteres y 32 niveles |

Los límites de formato pueden convertir fragmentos extremos en texto literal. No eliminan el texto original. El guard del SDK evita la amplificación del parser, pero no el coste de copiar inicialmente un `postMessage` en el navegador.

## Protección contra repetición de solicitudes

`wrangler.jsonc` declara tres bindings:

- `AUTH_RATE_LIMITER`: 120 solicitudes por minuto por dirección de Cloudflare y grupo de rutas públicas. Solo usa `CF-Connecting-IP`, nunca `X-Forwarded-For`.
- `API_RATE_LIMITER`: 300 solicitudes por minuto por usuario autenticado, compartidas entre sus sesiones de canal, web, MCP y enlaces de descarga firmados.
- `INTERACTION_RATE_LIMITER`: 60 interacciones por minuto por usuario identificado por la firma de Discord.

Las respuestas incluyen `Retry-After`: HTTP 429 al superar el límite y HTTP 503 si falla el binding. Los entornos sin estos bindings no tienen este control; la configuración de producción debe conservarlos. Los IDs de namespace elegidos para Bardo deben mantenerse distintos de otros limitadores de la cuenta.

Estos contadores son aproximados y locales a cada ubicación de Cloudflare, no cuotas globales estrictas. Los endpoints públicos todavía no disponen de identidad verificada; su límite por dirección puede afectar a usuarios que comparten una red o proxy. El tráfico autenticado se limita por usuario para evitar agrupar a todos los usuarios del proxy de Discord. [Documentación de Rate Limiting de Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Dependencias

La consulta inicial de npm informó tres paquetes afectados en el backend y diez en la app, incluyendo propagación por dependencias transitivas. Tras autorizar las consultas de los tres componentes se detectaron también dos avisos en Astro. Se aplicaron actualizaciones compatibles:

- Backend: Wrangler 4.163.0 y `undici` 7.30.1 dentro de Miniflare.
- App: `@hono/node-server` 2.1.8 y `hono` 4.13.19.
- Sitio: Astro 7.4.12, con mínimo `^7.4.12` en el manifest y lockfile.

Resultado de `npm audit --json` del 16 de noviembre de 2026, con dependencias de desarrollo incluidas:

| Componente | Paquetes señalados | Resultado |
| --- | --- | --- |
| Backend | 0 | Sin avisos conocidos en la consulta final. |
| Sitio | 0 | Los avisos de Astro desaparecen después de actualizar. |
| App | 8 | Dos avisos vigentes y uno retirado, propagados a sus dependencias consumidoras; no son ocho fallos independientes. |

Avisos vigentes en la app:

- **Zod 3.25.76**, transitivo de Discord SDK: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), severidad alta informada por npm. El guard del puente reduce la exposición confirmada. El SDK incluye además su propia copia de Zod; forzar Zod 4 en el lockfile no sustituye esa copia ni demuestra compatibilidad. Requiere una actualización del SDK corregida y validada.
- **minimatch 10.2.6**, transitivo de las herramientas de shadcn/ts-morph: [GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249), severidad moderada informada por npm. El aviso requiere `optimizationLevel >= 2`; las llamadas observadas en `@ts-morph/common` no pasan opciones y usan el valor predeterminado 1. Esa condición no se activa en el recorrido revisado, aunque la versión sigue marcada. La corrección empieza en 11.0.1; incluso `@ts-morph/common` 0.29.0 mantiene `minimatch ^10.0.1`, por lo que no hay actualización compatible de esa cadena que elimine el aviso.

**Aviso retirado:** [GHSA-gcqx-w48m-w2h4 de deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) fue retirado el 16 de noviembre de 2026 porque no describe una vulnerabilidad de seguridad. npm todavía lo incluye en el resultado de ocho paquetes. No se aplicó el downgrade de shadcn a 1.0.0 sugerido automáticamente ni se ocultó el resultado de la auditoría.

`minimatch` y `deepmerge` pertenecen a herramientas de desarrollo; no se identificó un import de esas herramientas en el código de la app. La consulta de metadatos actuales confirma que Discord SDK 2.5.0 sigue siendo la última versión y depende de Zod 3; shadcn 4.23.0 mantiene las cadenas de ts-morph y deepmerge. No se forzaron versiones mayores incompatibles.

## Validación y siguientes pasos

### Revisión de secretos

Se analizaron 1.020 archivos actuales, incluidos los archivos versionados, los nuevos archivos no ignorados y los builds públicos de Activity y del sitio. No se detectaron claves privadas ni tokens con los patrones revisados, ni coincidencias con el secreto actual del archivo local `.env`. Este archivo está excluido de Git y no está versionado; el build no configura una inyección general de sus variables en el frontend.

La revisión del historial local alcanzable abarcó 867 commits y 3.975 blobs únicos (aproximadamente 302 MB). No se detectaron tokens estructurados, claves privadas ni coincidencias con el secreto local actual. Solo `.env.example` aparece versionado entre los archivos de configuración de credenciales revisados.

Este resultado describe los archivos y referencias Git disponibles localmente. En Cloudflare se verificó que `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, `DISCORD_PUBLIC_KEY` y `WEB_ORIGIN` están guardados como bindings secretos y se conservaron al desplegar. No se recuperaron sus valores. Las credenciales existentes se usaron únicamente para autenticar solicitudes a su proveedor; no se imprimieron ni se enviaron a servicios de análisis. No se verificaron posibles filtraciones externas, secretos de GitHub, registros de producción ni commits ausentes del historial local alcanzable.

### Comprobaciones y pendientes

Comprobaciones locales: lint, build de la Activity, TypeScript, 634 pruebas de Node aprobadas (incluyen el Worker del sitio, el verificador de capturas y las regresiones de seguridad), `git diff --check` y empaquetado con `wrangler deploy --dry-run`. Los tipos de los bindings se generaron con `wrangler types --include-runtime=false`; las definiciones actuales del runtime se consultaron por separado.

Después de actualizar Astro pasaron el typecheck del sitio, sus nueve pruebas de seguridad y el pipeline completo con `BARDO_CAPTURE_SOURCE=pinned npm --prefix site run build`. Este modo explícito verifica el commit y árbol históricos del manifiesto, además del hash Git de cada captura; conserva las 16 imágenes existentes sin presentarlas como capturas del código actual. Tiene seis pruebas de regresión. El modo predeterminado sigue exigiendo la coincidencia con `origin/main:activity` y requerirá renovar las capturas al actualizar su contenido.

### Configuración y verificación en producción

- App `e0991d4e-1764-4924-a406-dc260005408b` y sitio `93b80a1c-19ba-46ec-9b02-803afca2f101` activos al 100 %. Los tres rate limiters están presentes en la app. D1 está al día, conserva su ID y no requirió migraciones. El sitio solo tiene ASSETS, sin acceso a D1 ni a los secretos del bot.
- `preview_urls: false` en ambos Workers, verificado por API: impide acceder públicamente a versiones antiguas por sus URLs de preview. La app conserva su endpoint oficial de `workers.dev`; el sitio usa únicamente `bardo.maxavend.com`.
- Rol instalado de Discord reducido a ver canales, enviar mensajes, enviar mensajes en hilos y crear hilos públicos (`309237648384`). Administrador desactivado, sin otro rol del bot que lo conceda. Los permisos de `@everyone` y sobrescrituras por canal siguen participando en los permisos efectivos.
- Los nueve canales visibles para el bot conservan ver y enviar; los seis de texto/anuncios conservan permisos de hilos. Los dos canales privados revisados mantienen una autorización explícita a Bardo. Sin inventario anterior no se puede contar cuántos canales privados dejaron de ser visibles al retirar Administrador; donde no esté autorizado, el bot ya no puede entrar por ese privilegio.
- Endpoint de interacciones y callback OAuth apuntan a la app HTTPS correcta. Presencia y contenido de mensajes están deshabilitados; se conserva el intent limitado de miembros que usa el directorio del producto.
- Dieciocho comprobaciones HTTP aprobaron en producción: HTML y assets de entrada coincidentes con el build, tres páginas del sitio, APIs y MCP rechazando acceso sin sesión, PKCE S256, CORS, cuerpo de autenticación de 8.193 bytes rechazado con 413, código ausente rechazado con 400 e interacción sin firma rechazada con 401. No se hicieron pruebas de carga ni se enviaron mensajes a canales.
- El sitio entrega CSP restrictiva y HSTS de un año. La consulta de los ajustes TLS de la zona devolvió 403 por los permisos del OAuth disponible: el mínimo TLS y la configuración global de WAF no quedaron verificados.
- La API de ambos Workers devuelve `observability: null`, `logpush: false` y `tail_consumers: null`. No se habilitaron logs de invocaciones que podrían registrar códigos OAuth en URLs; no hay alertas de seguridad verificadas por esta revisión.

Con autorización explícita adicional, las futuras instalaciones en servidores solicitan también crear hilos públicos: permisos `309237648384`, verificados por API el 16 de noviembre de 2026. Se conservaron los scopes `applications.commands` y `bot`; la instalación de usuario mantiene solo `applications.commands` y cero permisos de bot. No se solicita Administrador. Respaldo y resultado sanitizados en `.wrangler/checkpoints/security-2026-11-16/discord-install-permissions-*.json`.

Pendientes: comprobar el recorrido autenticado dentro de los clientes reales de Discord, actualizar el SDK cuando exista una corrección compatible de Zod y reevaluar minimatch.

Otros límites del alcance actual:

- La caché ordinaria de permisos de Discord puede conservar decisiones durante 60 segundos. Los nuevos controles de hilos y entrega de mensajes directos consultan permisos frescos.
- El comportamiento existente permite colaborar en documentos, reuniones y tareas a quienes pueden ver el canal. Un modo de solo lectura exige una política de producto explícita; no se cambió esa regla durante esta corrección.
- La política `frame-ancestors` de la Activity sigue en modo reporte salvo que `CSP_FRAME_MODE=enforce` esté configurado. Su activación debe comprobarse en los clientes admitidos de Discord.
- No hay deduplicación persistente de cada interacción firmada dentro de su ventana de cinco minutos, ni cuotas globales estrictas de almacenamiento/coste por usuario. Los límites añadidos reducen abuso, pero no cubren por sí solos ataques distribuidos o con múltiples cuentas.

Se desplegaron ambos Workers y se redujeron los permisos del bot con autorización explícita. No se modificaron documentos, tareas, reuniones ni otras filas de contenido de D1. La revisión no rotó credenciales.
