# Bardo Desktop (macOS y Windows)

App de Electron que muestra la web de Bardo (`WEB_ORIGIN`) con un armazón nativo:

- inicio de sesión con Discord desde el navegador del sistema;
- sesión guardada de forma segura;
- menú en español y atajos;
- selector rápido de canales;
- enlaces `bardo://`;
- actualizaciones automáticas.

La identidad sigue siendo solo Discord: no hay cuentas propias.

## Cómo funciona

| Pieza | Dónde | Qué hace |
|---|---|---|
| Proceso main | `src/main/` | Ventana, sesión, OAuth por loopback, menú, IPC y actualizaciones |
| Preload | `src/preload/preload.cjs` | Expone `window.bardoDesktop`, una API mínima sin tokens |
| Interfaz | `activity-app/src/desktop/` y `activity-app/src/web/` | Inicio de sesión, bienvenida, selector, atajos. Es la misma app web |
| Servidor | `src/app-api.js`, `src/mcp-oauth.js` | Cliente de primera parte `bardo_desktop`, `/api/app/*` y `/oauth/revoke` |

**Inicio de sesión:**
1. La app abre `/oauth/authorize` en el navegador con PKCE y vuelta a `http://127.0.0.1:<puerto>/oauth/callback` (RFC 8252).
2. Si no hay sesión en la web, Discord pide entrar.
3. La persona confirma con un clic («Continuar en Bardo Desktop»).
4. La app canjea el código.

**Tokens:**
- El refresh token se cifra con `safeStorage`: Keychain en macOS, DPAPI en Windows.
- El token de acceso vive solo en memoria del proceso main.
- La página recibe únicamente tokens por canal, que duran como máximo un día.
- La sesión se renueva con el uso y caduca tras 90 días sin abrir la app.

**Cerrar sesión** (menú Bardo o Archivo → «Cerrar sesión…», o el menú de usuario) revoca la autorización en el servidor y borra los tokens de canal que abrió. También se puede revocar desde la web, en «Conexiones de IA».

**Seguridad de la ventana:**
- `contextIsolation`, `sandbox` y sin Node en la página.
- Navegación solo dentro de `WEB_ORIGIN`; lo demás se abre en el navegador.
- Micrófono (solo audio) únicamente para Bardo.
- El IPC solo atiende al marco principal de una página de Bardo.
- Los fusibles de Electron se cierran al empaquetar (`build/after-pack.cjs`).

## Desarrollo

```bash
npm install
```

Contra producción:

```bash
npm start
```

Contra el Worker local (`npm run dev` en la raíz, con `WEB_ORIGIN=http://localhost:8787` en `.dev.vars`):

```bash
npm run dev
```

Para usar otro origen, pasa `BARDO_ORIGIN=https://…`; solo se admite https o loopback.

Pruebas sin Electron (config, enlaces y OAuth por loopback):

```bash
npm test
```

## Atajos

En Windows, `⌘` es `Ctrl`.

| Atajo | Acción |
|---|---|
| `⌘P` | Ir a un canal (selector rápido) |
| `⌘N` | Nuevo documento |
| `⌘1` … `⌘4` | Inicio, Documentos, Reuniones, Tareas |
| `⌘⇧O` | Mis servidores |
| `⌘/` | Ver los atajos |

## Enlaces `bardo://`

`bardo://open?guild=<id>&channel=<id>&document=<id>` abre la app en ese canal y documento. Se validan los ids; cualquier otro enlace abre el inicio.

## Instaladores y publicación

```bash
npm run dist:mac    # DMG + ZIP universales (Apple Silicon e Intel)
npm run dist:win    # Instalador NSIS x64 y arm64
npm run dist:store  # Paquete .appx para Microsoft Store
```

Sin certificados, los instaladores salen sin firmar. Sirven para probar:
- en macOS hay que abrirlos con clic derecho → Abrir;
- en Windows, SmartScreen avisa.

El workflow `.github/workflows/desktop.yml` construye en runners de macOS y Windows:
- **A mano** (Actions → «Bardo Desktop» → Run workflow): deja los instaladores como artefactos.
- **Con una etiqueta `desktop-vX.Y.Z`:** además los publica en GitHub Releases, si hay secretos de firma. De ahí se actualizan solas las apps instaladas (`electron-updater`).

### Secretos de firma (GitHub → Settings → Secrets)

| Secreto | Para |
|---|---|
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | Certificado «Developer ID Application» (.p12 en base64). Apple Developer Program: 99 USD/año |
| `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | Notarización con una API key de App Store Connect (.p8 en base64) |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Certificado de firma de código para Windows (.pfx en base64) |

En Windows hay dos caminos:
- **Microsoft Store:** el registro individual es gratis y la Store firma y actualiza el paquete `.appx`. Para publicar ahí, completa la identidad de `appx` en `electron-builder.yml` con los datos del Partner Center.
- **Instalador propio:** necesita un certificado de firma. Azure Artifact Signing solo admite personas de EE. UU. y Canadá; fuera de ahí, un certificado OV.

### Versión mínima

`GET /api/app/version` devuelve `minDesktopVersion`. Por defecto es `0.1.0`; se configura con la variable `DESKTOP_MIN_VERSION` del Worker.

Si la app instalada es más antigua, pide actualizarla. Sube ese número solo si cambia el contrato de `/api/app/*` o del puente.

## Activar en producción

1. Aplica la migración `0021_desktop_app.sql`. El deploy de `main` lo hace; a mano: `npx wrangler d1 migrations apply bardo-db --remote`.
2. Revisa que `WEB_ORIGIN` siga configurado: la app usa el mismo origen que la web.
3. No hace falta registrar nada nuevo en Discord. El login pasa por el callback https que ya existe.
