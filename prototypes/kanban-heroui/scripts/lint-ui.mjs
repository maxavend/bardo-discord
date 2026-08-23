import { readFile } from 'node:fs/promises';
import process from 'node:process';

const files = {
  app: new URL('../src/App.tsx', import.meta.url),
  styles: new URL('../src/styles.css', import.meta.url),
  theme: new URL('../src/theme.css', import.meta.url),
};

const [app, styles, theme] = await Promise.all([
  readFile(files.app, 'utf8'),
  readFile(files.styles, 'utf8'),
  readFile(files.theme, 'utf8'),
]);

const failures = [];
const fail = (message) => failures.push(message);

const importOrder = [
  '@import "tailwindcss";',
  '@import "@heroui/styles";',
  '@import "./theme.css";',
];
const firstLines = styles.split(/\r?\n/).slice(0, 3);
if (JSON.stringify(firstLines) !== JSON.stringify(importOrder)) {
  fail('styles.css must load Tailwind → @heroui/styles → theme.css in that exact order.');
}

const forbiddenCss = [
  [/#[0-9a-f]{3,8}\b/gi, 'hex colors'],
  [/\brgba?\s*\(/gi, 'rgb/rgba colors'],
  [/\bhsla?\s*\(/gi, 'hsl/hsla colors'],
  [/\boklch\s*\(/gi, 'OKLCH colors outside theme.css'],
  [/\blinear-gradient\s*\(/gi, 'arbitrary gradients'],
  [/\bradial-gradient\s*\(/gi, 'arbitrary gradients'],
  [/border-radius\s*:\s*(?!var\(--radius\))/gi, 'non-theme border radius'],
];
for (const [pattern, label] of forbiddenCss) {
  if (pattern.test(styles)) fail(`styles.css contains ${label}; use HeroUI semantic tokens/theme instead.`);
}

const forbiddenUtilityPatterns = [
  /\bborder-0\b/g,
  /\bborder-transparent\b/g,
  /\bbg-transparent\b/g,
  /\bshadow-none\b/g,
  /\bring-0\b/g,
  /\boutline-none\b/g,
  /\bappearance-none\b/g,
  /!border-0/g,
  /!bg-transparent/g,
];
for (const pattern of forbiddenUtilityPatterns) {
  if (pattern.test(app)) fail(`App.tsx contains forbidden style override: ${pattern}`);
}

if (/<input\b/i.test(app)) fail('App.tsx contains a native <input>; use HeroUI Input/SearchField composition.');
if (/<textarea\b/i.test(app)) fail('App.tsx contains a native <textarea>; use HeroUI TextArea.');
if (/<select\b/i.test(app)) fail('App.tsx contains a native <select>; use HeroUI Select.');

const requiredHeroUi = [
  'SearchField',
  'Select',
  'Modal',
  'Tabs',
  'Dropdown',
  'TagGroup',
  'ToggleButtonGroup',
];
for (const name of requiredHeroUi) {
  if (!app.includes(name)) fail(`Expected HeroUI primitive ${name} is missing from App.tsx.`);
}

const requiredThemeTokens = [
  '--background:',
  '--foreground:',
  '--surface:',
  '--accent:',
  '--border:',
  '--field-background:',
  '--field-border:',
  '--focus:',
  '--radius:',
];
for (const token of requiredThemeTokens) {
  if (!theme.includes(token)) fail(`theme.css is missing ${token}`);
}

if (!theme.includes('--field-border: transparent;')) {
  fail('Exact HeroUI theme contract requires transparent --field-border; do not patch fields with manual borders.');
}

if (!styles.includes('.tabs__list-container__scroll-prev') || !styles.includes('.tabs__list-container__scroll-next')) {
  fail('Mobile tabs must explicitly normalize HeroUI overflow controls.');
}
if (!styles.includes('.modal__header') || !styles.includes('.modal__body') || !styles.includes('.modal__footer')) {
  fail('Modal geometry must be normalized through HeroUI official BEM slots.');
}
if (!styles.includes('.menu-item')) {
  fail('Dropdown menu item geometry must be normalized consistently.');
}
if (!styles.includes('content: "⋮"')) {
  fail('Board actions menu must render a vertical kebab icon.');
}

if (failures.length) {
  console.error(`Visual system lint failed (${failures.length}):`);
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Visual system lint passed.');
