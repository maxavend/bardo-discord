import { readFile } from 'node:fs/promises';
import process from 'node:process';

const css = await readFile(new URL('../src/audit-fixes.css', import.meta.url), 'utf8');
const failures = [];
const fail = (message) => failures.push(message);

const forbiddenColorLiterals = [
  /#[0-9a-f]{3,8}\b/gi,
  /\brgba?\s*\(/gi,
  /\bhsla?\s*\(/gi,
  /\boklch\s*\(/gi,
];
for (const pattern of forbiddenColorLiterals) {
  if (pattern.test(css)) fail(`audit-fixes.css contains a literal color: ${pattern}`);
}

for (const selector of ['.modal__', '.input--', '.text-field__', '.button--', '.select__']) {
  if (css.includes(selector)) fail(`audit-fixes.css overrides HeroUI internals via ${selector}`);
}

const required = [
  '[role="dialog"]',
  '--field-background: var(--surface-secondary);',
  '.bardo-modal-header',
  'background: var(--surface);',
  '.bardo-native-select-shell',
  'background: var(--field-background);',
  '.bardo-column-setting',
  'grid-template-columns: minmax(0, 1fr) repeat(3, 2.5rem);',
  '.bardo-topbar',
  'box-shadow: 0 1px 0 var(--separator);',
];
for (const item of required) {
  if (!css.includes(item)) fail(`audit-fixes.css is missing required contract: ${item}`);
}

if (failures.length) {
  console.error(`Audit CSS lint failed (${failures.length}):`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Audited composition layer lint passed.');
