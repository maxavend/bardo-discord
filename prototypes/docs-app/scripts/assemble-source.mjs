import {readFileSync, writeFileSync} from 'node:fs';
import {applyComponentAudit} from './apply-component-audit.mjs';

const root = new URL('../', import.meta.url);
const readParts = (prefix, count) => Array.from({length: count}, (_, index) => {
  const suffix = String(index).padStart(2, '0');
  return readFileSync(new URL(`src/_parts/${prefix}.part-${suffix}`, root), 'utf8');
}).join('');

const appPath = new URL('src/App.jsx', root);
writeFileSync(appPath, readParts('App.jsx', 6));
applyComponentAudit(appPath);

let styles = readFileSync(new URL('src/styles.source.css', root), 'utf8');
const replacements = [
  ['.new-button { min-height: 44px; }\n', ''],
  ['.docs-search .search-field__group { width: 100%; min-height: 48px; }', '.docs-search .search-field__group { width: 100%; }'],
  ['.docs-search .search-field__input { min-width: 0; font-size: 16px; }', '.docs-search .search-field__input { min-width: 0; }'],
  ['.back-button { min-height: 44px; margin-left: -4px; }', '.back-button { margin-left: -4px; }'],
  ['.doc-body:focus-visible { outline: 2px solid var(--focus); outline-offset: 8px; border-radius: var(--radius-lg); }\n', ''],
  ['.editor-toolbar { pointer-events: auto; width: min(100%, 590px); min-height: 52px; gap: 4px; padding: 4px; }', '.editor-toolbar { pointer-events: auto; width: min(100%, 590px); }'],
  ['.block-select-trigger { min-height: 44px; }\n', ''],
  ['.toolbar-button { min-width: 44px; min-height: 44px; }\n', ''],
];
for (const [before, after] of replacements) {
  if (!styles.includes(before)) throw new Error(`CSS audit transform missing pattern: ${before}`);
  styles = styles.replace(before, after);
}
writeFileSync(new URL('src/styles.css', root), styles);

console.log('Assembled audited App.jsx and HeroUI-owned runtime styles');
