import React from 'react';
import {useTheme} from '@heroui/react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import {prepareBardoProduction} from './production-bridge.js';
import {activateBardoDocumentOnlyMode} from './production-document-only.js';
import '@fontsource-variable/inter';
import './styles.css';
import './theme.css';
import './layout-audit.css';
import './editor-focus.css';
import './keyboard-sticky.css';
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

await prepareBardoProduction();
const productionState = await activateBardoDocumentOnlyMode();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemedApp productionState={productionState}/>
  </React.StrictMode>,
);
