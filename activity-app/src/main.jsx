import React, {lazy, Suspense, useState, useEffect, useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {applyDiscordTheme, collectDiscordThemeDiagnostics, resolveDiscordTheme, useThemeMode} from './discord-theme.js';
import {prepareBardoProduction} from './production-bridge.js';
import {authenticateBardoDiscord, logBreadcrumb} from './production-discord-auth.js';
import {installProductionImportNormalizer} from './production-import-normalizer.js';
import '@fontsource-variable/inter';
import './styles.css';
import './theme.css';
import './layout-audit.css';
import './editor-focus.css';
import './keyboard-sticky.css';
import './production-document-only.css';
import './keyboard-sticky.js';

const BOOT_PERSONALITY_MESSAGES = [
  'Ponemos tus ideas en su sitio…',
  'Bardo está preparando la mesa…',
  'Ya casi: abrimos tu espacio…',
];

const App = lazy(() => import('./App.jsx'));

// ── Detect Discord theme before React mounts ─────────────────────────────────
function resolveBootTheme() {
  return resolveDiscordTheme() || 'light';
}

// ── Boot loading screen — HeroUI themed and reassuring ───────────────────────
function ActivityBootShell() {
  const theme = resolveBootTheme();
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex(index => (index + 1) % BOOT_PERSONALITY_MESSAGES.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="boot-screen" data-theme={theme} aria-live="polite">
      <section className="boot-content" aria-label="Cargando Bardo">
        <div className="boot-loader" role="status">
          <div className="bardo-loader" role="img" aria-label="Cargando Bardo">
            <div className="bardo-loader__eyes" aria-hidden="true">
              <span className="bardo-loader__eye" />
              <span className="bardo-loader__eye" />
            </div>
          </div>
          <div className="boot-copy">
            <span key={messageIndex} className="boot-stage">{BOOT_PERSONALITY_MESSAGES[messageIndex]}</span>
            <p className="boot-hint boot-hint-reveal">Estamos preparando todo para que puedas continuar</p>
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
        <p className="boot-eyebrow">No pudimos abrir tu espacio</p>
        <h1>Algo se interrumpió</h1>
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
      <div className="flex flex-col items-center gap-4 max-w-md text-center p-6 rounded-2xl bg-surface border border-border">
        <div className="w-12 h-12 rounded-2xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning text-xl">
          📄
        </div>
        <p className="text-sm text-muted">{message}</p>
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
  useThemeMode();
  if (productionState?.active && !productionState?.ready) {
    return <DocumentOnlyUnavailable message={productionState.message || 'No se pudo cargar el documento.'} onRetry={onRetry} />;
  }
  return <Suspense fallback={<ActivityBootShell stage="render_ready" />}><App /></Suspense>;
}

function ActivityRoot() {
  const [status, setStatus] = useState('booting');
  const [stage, setStage] = useState('activity_boot_started');
  const [errorMessage, setErrorMessage] = useState('');
  const [productionState, setProductionState] = useState({active: false, ready: true, documentId: null});
  const loadingPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('bardo_loading') === '1';

  const runBootstrap = useCallback(async () => {
    applyDiscordTheme({allowSystem: false});
    setStatus('booting');
    setErrorMessage('');

    try {
      const auth = await authenticateBardoDiscord({
        onStageChange: (nextStage) => setStage(nextStage),
      });
      // Wait one frame for Discord mobile to finish applying its host color
      // scheme, then resolve the Activity theme before rendering the app.
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      applyDiscordTheme();

      if (auth.embedded && !auth.ready) {
        window.__BARDO_PRODUCTION__ = true;
        setProductionState({
          active: true,
          ready: false,
          documentId: null,
          message: auth.message || 'No pudimos autenticar tu sesión de Discord.',
        });
        setStatus('error');
        setErrorMessage(auth.message || 'No pudimos autenticar tu sesión de Discord.');
        return;
      }

      if (auth.embedded) {
        installProductionImportNormalizer();
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
    return <><ActivityBootShell stage={stage} /><ThemeDiagnosticsOverlay /></>;
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
