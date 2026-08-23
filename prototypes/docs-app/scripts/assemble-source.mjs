import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const readParts = (prefix, count) => Array.from({length: count}, (_, index) => {
  const suffix = String(index).padStart(2, '0');
  return readFileSync(new URL(`src/_parts/${prefix}.part-${suffix}`, root), 'utf8');
}).join('');

writeFileSync(new URL('src/App.jsx', root), readParts('App.jsx', 6));
writeFileSync(new URL('src/styles.css', root), readParts('styles.css', 2));
console.log('Assembled src/App.jsx and src/styles.css');
