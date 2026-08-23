import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import '@fontsource-variable/inter';
import './styles.css';
import './theme.css';

const rootElement = document.documentElement;
rootElement.classList.add('dark');
rootElement.dataset.theme = 'dark';
rootElement.dataset.scrollbar = 'default';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
