# Bardo · sitio público

Landing de Bardo. Es un proyecto aparte del Worker de Discord (`../wrangler.jsonc`): no comparte base de datos, secretos ni rutas, y se desplegará en otra cuenta de Cloudflare. La lista de espera está retirada: su antigua API devuelve 410 sin leer el cuerpo ni acceder a almacenamiento. El sitio no tiene binding de base de datos; la migración histórica se conserva sin ejecutarse ni eliminar datos existentes.

## Local

```bash
cd site
npm install
npm run dev
```

Abre <http://localhost:8790>. `npm run dev` compila la landing con Astro y levanta el Worker local, sin migraciones ni conexión a D1.

Para iterar en la interfaz con recarga en caliente, deja `npm run dev` corriendo y abre otra terminal con `npm run dev:ui` (Astro en el 4321). La CSP y las cabeceras se comprueban con el build servido por Wrangler en 8790.

## Archivos

- `src/pages/` (`index`, `privacidad`, `terminos`) y `src/layouts/`: la landing en Astro. Sale como HTML estático; la reunión se activa al cargar y las otras demos se preparan en tiempo libre (`client:idle`). El recorrido de espacios es estático.
- Estilos: Tailwind 4 + componentes shadcn (`base-luma`, Base UI), con los mismos tokens que la Activity. Comfortaa se sirve localmente para títulos; Inter para lectura y controles. Las variantes CSS de shadcn 4.23.0 están en `src/styles/shadcn-variants.css`, con licencia MIT en `vendor/`: no hace falta instalar la CLI para ejecutar o compilar el sitio.
- `src/components/ui/`: componentes shadcn copiados de `activity-app/src/components/ui/`. Si cambian en la app, se copian de nuevo.
- `src/components/demo/`: demos interactivas hechas con piezas de la app (dock de reunión en vivo, onda de la agenda, tarjetas de Tareas) y datos ficticios.
- `public/capturas/<commit>/`: capturas reales de la app con datos gamer ficticios (`scripts/gamer-fixture.mjs`), derivados de la estructura de `../portfolio`, en WebP sin pérdida. `src/lib/captures.json` fija el commit y el árbol de `activity/`, con variantes escritorio/móvil y claro/oscuro. `Shot` consume este manifiesto: no usa nombres antiguos ni capturas de otra versión.
- `Shot` conserva la proporción original y muestra todo el encuadre, sin zoom ni recortes. Documentos usa el lector para incluir la navegación general de la app.
- `SpacesShowcase` presenta Docs, Reuniones y Tareas en tres filas alternadas: imagen/texto, texto/imagen, imagen/texto. Todo usa scroll normal, sin pestañas, estado de scroll ni hidratación. En móvil el texto precede a la captura móvil completa. Las capturas de esta sección no llevan marcos de dispositivo y descansan sobre un fondo lavanda de mayor contraste. El teléfono y el monitor de las otras secciones mantienen biseles mates y un reflejo estático tenue solo sobre el cristal. Títulos, párrafos, detalles y capturas se revelan individualmente con IntersectionObserver, incluidos los que ya están visibles al entrar. La preferencia de movimiento reducido conserva el contenido visible.
- `src/lib/shot-loading.ts`: añade el skeleton de transitions.dev a capturas aún no cargadas y hace el reveal tras `decode()`, con proporciones reservadas para evitar saltos, estado de error y fallback sin JavaScript.
- `worker/index.js`: sirve `dist/`, rechaza métodos de escritura y devuelve 410 en la API retirada. `public/_headers` protege los assets y `worker/security.js` las respuestas del Worker.
- `migrations/`: esquema histórico de la lista de espera, sin uso por el sitio actual.

## Actualizar las capturas

```bash
git fetch origin
npm ci --prefix ../activity-app
npm run refresh:captures -- --ref=origin/main
npm run build
```

El generador extrae el artefacto `activity/` del commit indicado y lo captura con el escenario ficticio del portafolio, sin acceder a datos de producción. Requiere Chrome/Chromium, las dependencias de `activity-app` y `cwebp`. El manifiesto se publica solo cuando terminan las 16 capturas. El build comprueba que estén todas y falla si el árbol de la referencia local cambió; hay que regenerarlas después de actualizar esa referencia. En una exportación sin Git se comprueba la integridad de rutas y archivos.

## Tema

La landing usa los tokens claro y Noche de la Activity. Sigue el sistema hasta que se usa el botón de tema; la elección se guarda en `bardo-site-theme`, se conserva al recargar y se comparte con las páginas legales. Las capturas y el logo cambian con el tema. La preferencia se aplica antes del primer render para evitar un destello claro.

## Antes de desplegar (pendiente)

1. Verificar HTTPS, redirecciones y cabeceras en el dominio definitivo después del despliegue. La landing no necesita D1.
2. Confirmar que la app de Discord permite instalarse en otros servidores (Developer Portal → Installation). El botón «Agregar a Discord» usa `client_id=1539704001535156254`.
3. Revisar `/privacidad` y `/terminos` y definir un canal para solicitudes sobre datos antes de recoger correos reales. Los textos públicos usan una redacción neutral, sin campos de identidad o contacto pendientes.

Los personajes, misiones y acuerdos de las demos se comparten desde `src/lib/demo-data.json`. Las capturas conservan la UI exacta de `main`; solo cambian los datos locales de ejemplo.

## Seguridad

- Astro genera una CSP con hashes para los scripts inline y restringe cargas al propio origen. No se permite `unsafe-inline` ni `unsafe-eval` para scripts. Los estilos inline se permiten porque las demos React y el movimiento usan atributos de estilo.
- Las cabeceras HTTP bloquean iframes y detección de MIME, omiten el referrer, restringen permisos del navegador y anuncian HSTS para HTTPS.
- No quedan rutas que guarden correos ni acceso a D1. La migración antigua y cualquier base existente no se borran.
- Ejecutar `npm run test:security`, `npm run typecheck`, `npm run build` y `npm audit` antes de publicar. La CSP requiere verificar el build, no el servidor de desarrollo de Astro.
- Esta configuración reduce riesgos conocidos; la seguridad también depende del dominio, la cuenta de Cloudflare y las actualizaciones.
