# Bardo · sitio público

Landing de Bardo y lista de espera de la versión web. Es un proyecto aparte del Worker de Discord (`../wrangler.jsonc`): no comparte base de datos, secretos ni rutas, y se desplegará en otra cuenta de Cloudflare.

## Local

```bash
cd site
npm install
npm run dev
```

Abre <http://localhost:8790>. `npm run dev` compila la landing con Astro, aplica las migraciones a la D1 local y levanta el Worker.

Para iterar en la interfaz con recarga en caliente, deja `npm run dev` corriendo y abre otra terminal con `npm run dev:ui` (Astro en el 4321, con `/api` redirigido al Worker).

Para ver los correos de la lista de espera:

```bash
npx wrangler d1 execute bardo-site-db --local --command "SELECT * FROM waitlist ORDER BY created_at DESC"
```

## Archivos

- `src/pages/` (`index`, `privacidad`, `terminos`) y `src/layouts/`: la landing en Astro. Sale como HTML estático; solo las demos, las pestañas y la lista de espera cargan JavaScript, como islas de React que se activan al aparecer en pantalla (`client:visible`).
- Estilos: Tailwind 4 + shadcn (`base-luma`, Base UI), con los mismos tokens que la Activity (`src/styles.css`).
- `src/components/ui/`: componentes shadcn copiados de `activity-app/src/components/ui/`. Si cambian en la app, se copian de nuevo.
- `src/components/demo/`: demos interactivas hechas con piezas de la app (dock de reunión en vivo, onda de la agenda, tarjetas de Tareas) y datos ficticios.
- `public/capturas/`: capturas reales de la app con los datos ficticios del escenario Lumen (`../portfolio`). Las versiones `-movil` se usan bajo 40rem.
- `worker/index.js`: sirve `dist/` y responde `POST /api/lista-de-espera`.
- `migrations/`: esquema de la D1 del sitio.

## Antes de desplegar (pendiente)

1. Crear la D1 en la cuenta nueva con `wrangler d1 create bardo-site-db` y poner su id en `wrangler.jsonc`.
2. Confirmar que la app de Discord permite instalarse en otros servidores (Developer Portal → Installation). El botón «Agregar a Discord» usa `client_id=1539704001535156254`.
3. Completar el responsable y el correo de contacto en `/privacidad` y `/terminos` (hoy son campos por llenar) y pedir revisión legal antes de recoger correos reales.
