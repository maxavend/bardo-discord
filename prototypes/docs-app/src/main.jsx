import React from 'react';
import {useTheme} from '@heroui/react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import {prepareBardoProduction} from './production-bridge.js';
import {authenticateBardoDiscord} from './production-discord-auth.js';
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

const discordAuth = await authenticateBardoDiscord();
let productionState;

if (discordAuth.embedded && !discordAuth.ready) {
  window.__BARDO_PRODUCTION__ = true;
  productionState = {
    active:true,
    ready:false,
    documentId:null,
    message:discordAuth.message || 'No pudimos autenticar tu sesión de Discord.',
  };
} else {
  if (discordAuth.embedded) installProductionImportNormalizer();
  await prepareBardoProduction();
  productionState = await activateBardoDocumentOnlyMode();
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemedApp productionState={productionState}/>
  </React.StrictMode>,
);
