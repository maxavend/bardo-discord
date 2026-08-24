import React, {useState, useEffect, useCallback} from 'react';
import {useTheme, Button, Spinner} from '@heroui/react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import {prepareBardoProduction} from './production-bridge.js';
import {authenticateBardoDiscord, logBreadcrumb} from './production-discord-auth.js';
import {activateBardoDocumentOnlyMode} from './production-document-only.js';
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
  activity_boot_started: 'Iniciando Bardo Docs...',
  sdk_ready: 'Conectando con Discord...',
  guild_context_ready: 'Identificando servidor...',
  authorize_started: 'Autorizando acceso...',
  authorize_success: 'Autorizado con éxito...',
  token_exchange_success: 'Verificando sesión en Bardo...',
  authenticate_success: 'Identidad confirmada...',
  docs_hydrated: 'Cargando biblioteca de documentos...',
  document_resolved: 'Abriendo documento...',
  render_ready: 'Listo.',
};

function ActivityBootShell({stage}) {
  const label = STAGE_LABELS[stage] || 'Cargando documento...';
  return (
    <main className="app-root min-h-screen flex items-center justify-center p-6 bg-background text-foreground select-none">
      <div className="flex flex-col items-center gap-5 max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-2xl shadow-sm">
          📖
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Bardo Docs</h1>
          <p className="text-sm text-default-500 transition-all duration-200">{label}</p>
        </div>
        <Spinner size="md" color="primary" className="mt-1" />
      </div>
    </main>
  );
}

function ActivityErrorShell({message, onRetry}) {
  return (
    <main className="app-root min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="flex flex-col items-center gap-5 max-w-md text-center p-6 rounded-2xl bg-content1 border border-default-200 shadow-md">
        <div className="w-14 h-14 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger text-2xl">
          ⚠️
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-bold text-foreground">No pudimos abrir el documento</h2>
          <p className="text-sm text-default-600 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 mt-2 w-full justify-center">
          <Button variant="primary" size="md" onPress={onRetry} className="min-w-[130px]">
            Reintentar
          </Button>
        </div>
      </div>
    </main>
  );
}

function DocumentOnlyUnavailable({message, onRetry}) {
  return (
    <main className="app-root min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="flex flex-col items-center gap-4 max-w-md text-center p-6 rounded-2xl bg-content1 border border-default-200">
        <div className="w-12 h-12 rounded-2xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning text-xl">
          📄
        </div>
        <p className="text-sm text-default-600">{message}</p>
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
  useTheme('system');
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
    setStatus('booting');
    setErrorMessage('');

    try {
      const auth = await authenticateBardoDiscord({
        onStageChange: (nextStage) => setStage(nextStage),
      });

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
        const prodState = await activateBardoDocumentOnlyMode();

        setStage('render_ready');
        logBreadcrumb('render_ready');
        setProductionState(prodState);
      } else {
        setProductionState({active: false, ready: true, documentId: null});
      }

      setStatus('ready');
    } catch (error) {
      console.error('Bardo Activity bootstrap failed:', error);
      const msg = error instanceof Error ? error.message : 'Error desconocido al inicializar la aplicación.';
      logBreadcrumb('bootstrap_error', {error: msg});
      setErrorMessage(msg);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    runBootstrap();
  }, [runBootstrap]);

  if (status === 'booting') {
    return <ActivityBootShell stage={stage} />;
  }

  if (status === 'error') {
    return <ActivityErrorShell message={errorMessage} onRetry={runBootstrap} />;
  }

  return <ThemedApp productionState={productionState} onRetry={runBootstrap} />;
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ActivityRoot />
    </React.StrictMode>,
  );
}
