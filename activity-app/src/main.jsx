import React, {useState, useEffect, useCallback} from 'react';
import {Button, Spinner} from '@heroui/react';
import {createRoot} from 'react-dom/client';
import App, {applyDiscordTheme, collectDiscordThemeDiagnostics, resolveDiscordTheme, useThemeMode} from './App.jsx';
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

const STAGE_LABELS = {
  activity_boot_started: 'Afinando los instrumentos…',
  sdk_ready: 'Conectando con Discord...',
  guild_context_ready: 'Abriendo el espacio de tu servidor…',
  authorize_started: 'Confirmando tu acceso…',
  authorize_success: 'Acceso confirmado',
  token_exchange_success: 'Validando tu sesión…',
  authenticate_success: 'Sesión lista',
  docs_hydrated: 'Cargando tus documentos…',
  document_resolved: 'Abriendo tu documento…',
  render_ready: 'Casi listo…',
  session_cache_restored: 'Recuperando tu sesión…',
};

// ── Detect Discord theme before React mounts ─────────────────────────────────
function resolveBootTheme() {
  return resolveDiscordTheme() || 'light';
}

// ── Boot loading screen — HeroUI themed and reassuring ───────────────────────
function ActivityBootShell({stage}) {
  const theme = resolveBootTheme();
  const label = STAGE_LABELS[stage] || 'Afinando los instrumentos…';

  return (
    <main className="boot-screen" data-theme={theme} aria-live="polite">
      <section className="boot-content" aria-label="Cargando Bardo">
        <div className="boot-loader" role="status">
          <Spinner size="lg" color="current" aria-label="Cargando Bardo" />
          <div className="boot-copy">
            <span key={stage} className="boot-stage">{label}</span>
            <p className="boot-hint">Estamos preparando todo para que puedas continuar</p>
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
        <Button variant="primary" size="sm" onPress={onRetry}>
          Intentar de nuevo
        </Button>
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
          <Button variant="secondary" size="sm" onPress={onRetry}>
            Reintentar
          </Button>
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
  return <App />;
}

function ActivityRoot() {
  const [status, setStatus] = useState('booting');
  const [stage, setStage] = useState('activity_boot_started');
  const [errorMessage, setErrorMessage] = useState('');
  const [productionState, setProductionState] = useState({active: false, ready: true, documentId: null});

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
