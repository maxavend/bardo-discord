import React, {lazy, Suspense, useState, useEffect, useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {applyDiscordTheme, collectDiscordThemeDiagnostics} from './discord-theme.js';
import {syncThemePreference} from './theme-sync.js';
import {prepareBardoProduction} from './production-bridge.js';
import {authenticateBardoDiscord, logBreadcrumb} from './production-discord-auth.js';
import {isDesktopApp} from './desktop/desktop-bridge.js';
import '@fontsource-variable/inter/opsz.css';
import './styles.css';
import './editor-focus.css';
import './keyboard-sticky.css';
import './keyboard-sticky.js';
import './no-zoom.js';

const BOOT_PERSONALITY_MESSAGES = [
  'Conectando con Discord…',
  'Cargando tu espacio…',
  'Ya casi está…',
];

const appModulePromise = import('./App.jsx');
const App = lazy(() => appModulePromise);
// Pantallas previas al canal en la web: Discord nunca las descarga.
const WebGate = lazy(() => import('./web/WebGate.jsx').then(module => ({default: module.WebGate})));
// Bardo para escritorio: menú nativo, selector rápido y atajos. La web no lo descarga.
const DesktopShell = lazy(() => import('./desktop/DesktopShell.jsx').then(module => ({default: module.DesktopShell})));
if (isDesktopApp()) document.documentElement.dataset.bardoDesktop = 'true';

// Si el enlace abre una vista pesada (editor, Reuniones, Tareas), su módulo
// se descarga junto con App y no después: sin cascada al entrar directo.
const ROUTE_MODULES = [
  [/^#(new|edit-)/, () => import('./editor/BardoEditor.jsx')],
  [/^#planner/, () => import('./planner/PlannerModule.jsx')],
  [/^#kanban/, () => import('./kanban/KanbanModule.jsx')],
];
ROUTE_MODULES.find(([pattern]) => pattern.test(location.hash))?.[1]().catch(() => {});

// ── Theme before React mounts: the one discord-theme.js already applied ──────
function resolveBootTheme() {
  return document.documentElement.dataset.bardoTheme || 'dark';
}

// ── Boot loading screen — HeroUI themed and reassuring ───────────────────────
function ActivityBootShell({leaving = false}) {
  const theme = resolveBootTheme();
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex(index => (index + 1) % BOOT_PERSONALITY_MESSAGES.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className={`boot-screen${leaving ? ' boot-screen--leaving' : ''}`} data-theme={theme} aria-live="polite">
      <section className="boot-content" aria-label="Cargando Bardo">
        <div className="boot-loader" role="status">
          {/* Los ojitos miran y parpadean mientras Bardo abre el espacio.
              Con movimiento reducido, se quedan quietos. */}
          <div className="bardo-loader" role="img" aria-label="Cargando Bardo">
            <div className="bardo-loader__eyes" aria-hidden="true">
              <span className="bardo-loader__eye" />
              <span className="bardo-loader__eye" />
            </div>
          </div>
          <div className="boot-copy">
            <span key={messageIndex} className="boot-stage">{BOOT_PERSONALITY_MESSAGES[messageIndex]}</span>
            <p className="boot-hint">Documentos, reuniones y tareas de tu canal</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function ThemeDiagnosticsOverlay() {
  const [diagnostics, setDiagnostics] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('bardo_theme_debug') !== '1') return undefined;
    const refresh = () => setDiagnostics(collectDiscordThemeDiagnostics());
    refresh();
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
  }, []);

  if (!diagnostics) return null;
  return (
    <pre className="theme-diagnostics" aria-label="Diagnóstico temporal del tema">
      {JSON.stringify(diagnostics, null, 2)}
    </pre>
  );
}

// ── Error screen — same visual language, clear recovery ─────────────────────
function ActivityErrorShell({message, onRetry, retryLabel = 'Intentar de nuevo'}) {
  return (
    <main className="boot-screen" aria-live="polite">
      <section className="boot-content boot-content--error" aria-label="Error al cargar Bardo">
        <p className="boot-eyebrow">Error al abrir Bardo</p>
        <h1>No pudimos abrir tu espacio</h1>
        <p className="boot-error-message">{message}</p>
        <button className="boot-retry-button" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      </section>
    </main>
  );
}

// ── Recuperación ante fallos fuera del arranque ─────────────────────────────
// Sin esto, un error al dibujar desmonta toda la app y queda la pantalla vacía.
const STALE_RELOAD_KEY = 'bardo.stale-chunk-reload';
const STALE_RELOAD_WINDOW_MS = 30_000;
const isStaleChunkError = error => /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS/i
  .test(String(error?.message || error || ''));

/** Tras un despliegue, una pestaña abierta pide archivos que ya no existen:
 * recarga una sola vez para tomar la versión nueva. */
function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(STALE_RELOAD_KEY)) || 0;
    if (Date.now() - last < STALE_RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Avisa al servidor qué falló (sin datos del canal) y, si fue una descarga,
 * qué responde ese archivo al pedirlo de nuevo: red bloqueada, 404 o cuerpo raro. */
async function reportClientError(kind, error) {
  try {
    const message = String(error?.message || error || '').replace(window.location.origin, '').slice(0, 300);
    let probe = '';
    const failedUrl = String(error?.message || '').match(/(https?:\/\/\S+?\.(?:js|css))\b/)?.[1];
    if (failedUrl) {
      try {
        const response = await fetch(failedUrl, {cache: 'no-store'});
        const body = await response.text();
        probe = `${response.status} ${response.headers.get('content-type') || '-'} ${body.length}b ${body.slice(0, 40).replace(/\s+/g, ' ')}`;
      } catch (probeError) {
        probe = `fetch: ${probeError?.message || probeError}`;
      }
    }
    const build = document.querySelector('script[type="module"][src*="/assets/index"]')?.getAttribute('src') || '';
    const payload = JSON.stringify({kind, message, probe, path: window.location.pathname, build});
    if (!navigator.sendBeacon?.('/api/client-error', new Blob([payload], {type: 'application/json'}))) {
      fetch('/api/client-error', {method: 'POST', body: payload, keepalive: true, headers: {'Content-Type': 'application/json'}}).catch(() => {});
    }
  } catch {
    // El aviso es solo diagnóstico.
  }
}

window.addEventListener('vite:preloadError', (event) => {
  reportClientError('preload', event.payload);
  if (reloadForNewVersion()) event.preventDefault();
});

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {error: null};
  }

  static getDerivedStateFromError(error) {
    return {error};
  }

  componentDidCatch(error, info) {
    console.error('Bardo render failed:', error, info?.componentStack);
    logBreadcrumb('render_error', {error: error instanceof Error ? error.message : String(error)});
    const stale = isStaleChunkError(error);
    reportClientError(stale ? 'chunk' : 'render', error);
    if (stale) reloadForNewVersion();
  }

  render() {
    if (!this.state.error) return this.props.children;
    const stale = isStaleChunkError(this.state.error);
    const detail = String(this.state.error?.message || this.state.error)
      .replace(window.location.origin, '').slice(0, 160);
    return (
      <ActivityErrorShell
        message={stale
          ? `No pudimos descargar una parte de Bardo. Vuelve a cargar; si se repite, desactiva bloqueadores de anuncios para este sitio. Detalle: ${detail}`
          : `Algo falló al mostrar esta pantalla. Vuelve a cargar; lo que ya guardaste sigue ahí. Detalle: ${detail}`}
        retryLabel="Volver a cargar"
        onRetry={() => window.location.reload()}
      />
    );
  }
}

function DocumentOnlyUnavailable({message, onRetry}) {
  return (
    <main className="app-root min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="container-surface flex flex-col items-center gap-4 max-w-md text-center p-6 rounded-2xl bg-surface border border-border">
        <div className="w-12 h-12 rounded-2xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning text-xl">
          📄
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        {onRetry && (
          <button className="boot-retry-button" type="button" onClick={onRetry}>
            Reintentar
          </button>
        )}
      </div>
    </main>
  );
}

function ThemedApp({productionState, onRetry}) {
  if (productionState?.active && !productionState?.ready) {
    return <DocumentOnlyUnavailable message={productionState.message || 'No se pudo cargar Bardo. Inténtalo de nuevo.'} onRetry={onRetry} />;
  }
  return <App />;
}

function ActivityRoot() {
  const [status, setStatus] = useState('booting');
  const [bootLeaving, setBootLeaving] = useState(false);
  const [stage, setStage] = useState('activity_boot_started');
  const [errorMessage, setErrorMessage] = useState('');
  const [productionState, setProductionState] = useState({active: false, ready: true, documentId: null});
  const [webGate, setWebGate] = useState(null);
  const loadingPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('bardo_loading') === '1';

  const runBootstrap = useCallback(async () => {
    applyDiscordTheme({allowSystem: false});
    setStatus('booting');
    setBootLeaving(false);
    setErrorMessage('');
    setWebGate(null);

    try {
      const auth = await authenticateBardoDiscord({
        onStageChange: (nextStage) => setStage(nextStage),
      });
      // Wait one frame for Discord mobile to finish applying its host color
      // scheme, then resolve the Activity theme before rendering the app.
      // rAF never fires while the page is hidden (Activity opened in the
      // background), so cap the wait instead of stalling on the boot screen.
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
        window.setTimeout(resolve, 100);
      });
      applyDiscordTheme();

      // Web sin canal abierto: entrar con Discord o elegir dónde trabajar.
      if (auth.gate) {
        setWebGate(auth);
        setStatus('gate');
        return;
      }

      if (auth.embedded && !auth.ready) {
        window.__BARDO_PRODUCTION__ = true;
        setProductionState({
          active: true,
          ready: false,
          documentId: null,
          message: auth.message || 'No pudimos verificar tu sesión de Discord. Inténtalo de nuevo.',
        });
        setStatus('error');
        setErrorMessage(auth.message || 'No pudimos verificar tu sesión de Discord. Inténtalo de nuevo.');
        return;
      }

      if (auth.embedded) {
        // El tema guardado en la cuenta llega junto con el resto del arranque.
        const themeSync = syncThemePreference();
        setStage('docs_hydrated');
        logBreadcrumb('docs_hydrated');
        await prepareBardoProduction({
          sessionToken: auth.sessionToken,
          customId: auth.customId,
          sdk: auth.sdk,
          guildId: auth.guildId,
          instanceId: auth.instanceId,
          initialDocsPayload: auth.initialDocsPayload,
        });

        await Promise.race([themeSync, new Promise(resolve => window.setTimeout(resolve, 1500))]);
        setStage('document_resolved');
        logBreadcrumb('document_resolved');
        setStage('render_ready');
        logBreadcrumb('render_ready');
        setProductionState({
          active: true,
          ready: true,
          documentId: window.__BARDO_DOCUMENT_ID__ || null,
        });
      } else {
        setProductionState({active: false, ready: true, documentId: null});
      }

      // Keep the boot shell mounted until the app chunk is ready too. This
      // avoids a second visible loading pass from Suspense after bootstrap.
      await appModulePromise;
      setBootLeaving(true);
      const exitDuration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : 280;
      await new Promise((resolve) => window.setTimeout(resolve, exitDuration));
      setStatus('ready');
    } catch (error) {
      console.error('Bardo Activity bootstrap failed:', error);
      const msg = error instanceof Error ? error.message : 'Error desconocido al inicializar Bardo.';
      logBreadcrumb('bootstrap_error', {error: msg});
      setErrorMessage(msg);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    runBootstrap();
  }, [runBootstrap]);

  if (loadingPreview) {
    return <><ActivityBootShell stage="activity_boot_started" /><ThemeDiagnosticsOverlay /></>;
  }

  if (status === 'gate') {
    return <Suspense fallback={<ActivityBootShell />}><WebGate gate={webGate} onRetry={runBootstrap} /></Suspense>;
  }

  if (status === 'booting') {
    return <><ActivityBootShell leaving={bootLeaving} stage={stage} /><ThemeDiagnosticsOverlay /></>;
  }

  if (status === 'error') {
    return <><ActivityErrorShell message={errorMessage} onRetry={runBootstrap} /><ThemeDiagnosticsOverlay /></>;
  }

  return <><ThemedApp productionState={productionState} onRetry={runBootstrap} /><ThemeDiagnosticsOverlay /></>;
}

// Un fallo en la capa de escritorio (selector, atajos) nunca tumba la app.
class DesktopShellBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {failed: false};
  }
  static getDerivedStateFromError() {
    return {failed: true};
  }
  componentDidCatch(error) {
    console.error('Bardo: la capa de escritorio falló', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <ActivityRoot />
      </RootErrorBoundary>
      {isDesktopApp() && <DesktopShellBoundary><Suspense fallback={null}><DesktopShell /></Suspense></DesktopShellBoundary>}
    </React.StrictMode>,
  );
}
