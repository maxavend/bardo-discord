import React, {lazy, useState, useEffect, useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {applyDiscordTheme, collectDiscordThemeDiagnostics} from './discord-theme.js';
import {syncThemePreference} from './theme-sync.js';
import {prepareBardoProduction} from './production-bridge.js';
import {authenticateBardoDiscord, logBreadcrumb} from './production-discord-auth.js';
import '@fontsource-variable/inter/opsz.css';
import wordmarkLiveLight from './assets/brand/wordmark-vivo-claro.svg';
import wordmarkLiveDark from './assets/brand/wordmark-vivo-oscuro.svg';
import wordmarkLight from './assets/brand/wordmark-claro.svg';
import wordmarkDark from './assets/brand/wordmark-oscuro.svg';
import './styles.css';
import './editor-focus.css';
import './keyboard-sticky.css';
import './keyboard-sticky.js';

const BOOT_PERSONALITY_MESSAGES = [
  'Conectando con Discord…',
  'Cargando tu espacio…',
  'Ya casi está…',
];

const appModulePromise = import('./App.jsx');
const App = lazy(() => appModulePromise);

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
          {/* El logo completo: la onda ondula mientras Bardo abre el espacio.
              Con movimiento reducido, el logo quieto. */}
          <picture className="bardo-loader">
            <source media="(prefers-reduced-motion: reduce)" srcSet={theme === 'dark' ? wordmarkDark : wordmarkLight} />
            <img src={theme === 'dark' ? wordmarkLiveDark : wordmarkLiveLight} alt="Cargando Bardo" width="176" height="49" />
          </picture>
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
function ActivityErrorShell({message, onRetry}) {
  return (
    <main className="boot-screen" aria-live="polite">
      <section className="boot-content boot-content--error" aria-label="Error al cargar Bardo">
        <p className="boot-eyebrow">Error al abrir Bardo</p>
        <h1>No pudimos abrir tu espacio</h1>
        <p className="boot-error-message">{message}</p>
        <button className="boot-retry-button" type="button" onClick={onRetry}>
          Intentar de nuevo
        </button>
      </section>
    </main>
  );
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
  const loadingPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('bardo_loading') === '1';

  const runBootstrap = useCallback(async () => {
    applyDiscordTheme({allowSystem: false});
    setStatus('booting');
    setBootLeaving(false);
    setErrorMessage('');

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

  if (status === 'booting') {
    return <><ActivityBootShell leaving={bootLeaving} stage={stage} /><ThemeDiagnosticsOverlay /></>;
  }

  if (status === 'error') {
    return <><ActivityErrorShell message={errorMessage} onRetry={runBootstrap} /><ThemeDiagnosticsOverlay /></>;
  }

  return <><ThemedApp productionState={productionState} onRetry={runBootstrap} /><ThemeDiagnosticsOverlay /></>;
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ActivityRoot />
    </React.StrictMode>,
  );
}
