import {copyFileSync, readFileSync, writeFileSync} from 'node:fs';
import {applyComponentAudit} from './apply-component-audit.mjs';

const root = new URL('../', import.meta.url);
const readParts = (prefix, count) => Array.from({length: count}, (_, index) => {
  const suffix = String(index).padStart(2, '0');
  return readFileSync(new URL(`src/_parts/${prefix}.part-${suffix}`, root), 'utf8');
}).join('');

const appPath = new URL('src/App.jsx', root);
writeFileSync(appPath, readParts('App.jsx', 6));
applyComponentAudit(appPath);
copyFileSync(new URL('src/styles.source.css', root), new URL('src/styles.css', root));
console.log('Assembled audited src/App.jsx and semantic src/styles.css');
