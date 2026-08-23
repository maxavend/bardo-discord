import React from 'react';
import {useTheme} from '@heroui/react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import {prepareBardoProduction} from './production-bridge.js';
import {waitForBardoActivityContext} from './production-context-ready.js';
import {installBardoLaunchAuth} from './production-launch-auth.js';
import {activateBardoDocumentOnlyMode} from './production-document-only.js';
import '@fontsource-variable/inter';
import './styles.css';
import './theme.css';
import './layout-audit.css';
import './editor-focus.css';
import './keyboard-sticky.css';
import './production-document-only.css';
import './keyboard-sticky.js';

function DocumentOnlyUnavailable({message}) {
  return (
    <main className="app-root">
      <div className="missing-state"><p>{message}</p></div>
    </main>
  );
}

function ThemedApp({productionState}) {
  useTheme('system');
  if (productionState.active && !productionState.ready) {
    return <DocumentOnlyUnavailable message={productionState.message}/>;
  }
  return <App />;
}

const activityContext = await waitForBardoActivityContext();
let productionState;

if (activityContext.embedded && !activityContext.ready) {
  window.__BARDO_PRODUCTION__ = true;
  window.__BARDO_INSTANCE_ID__ = activityContext.instanceId;
  productionState = {
    active:true,
    ready:false,
    documentId:null,
    message:'No pudimos identificar el documento de este mensaje. Cierra esta vista y vuelve a abrirlo desde Discord.',
  };
} else {
  if (activityContext.embedded) {
    window.__BARDO_INSTANCE_ID__ = activityContext.instanceId;
    window.__BARDO_DOCUMENT_ID__ = activityContext.documentId;
    installBardoLaunchAuth(activityContext.customId);
  }

  await prepareBardoProduction();
  productionState = await activateBardoDocumentOnlyMode();
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemedApp productionState={productionState}/>
  </React.StrictMode>,
);
