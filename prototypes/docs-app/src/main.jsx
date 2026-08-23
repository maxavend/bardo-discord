import React from 'react';
import {useTheme} from '@heroui/react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import {prepareBardoProduction} from './production-bridge.js';
import '@fontsource-variable/inter';
import './styles.css';
import './theme.css';
import './layout-audit.css';
import './editor-focus.css';
import './keyboard-sticky.css';
import './keyboard-sticky.js';

function ThemedApp() {
  useTheme('system');
  return <App />;
}

await prepareBardoProduction();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>,
);
