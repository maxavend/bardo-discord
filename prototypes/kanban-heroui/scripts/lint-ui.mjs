import { readFile } from 'node:fs/promises';
import process from 'node:process';

const files = {
  app: new URL('../src/App.tsx', import.meta.url),
  mobile: new URL('../src/MobileKanban.tsx', import.meta.url),
  native: new URL('../src/NativeControls.tsx', import.meta.url),
  taskDetail: new URL('../src/TaskDetailModal.tsx', import.meta.url),
  index: new URL('../index.html', import.meta.url),
  styles: new URL('../src/styles.css', import.meta.url),
  theme: new URL('../src/theme.css', import.meta.url),
};

const [app, mobile, native, taskDetail, index, styles, theme] = await Promise.all([
  readFile(files.app, 'utf8'),
  readFile(files.mobile, 'utf8'),
  readFile(files.native, 'utf8'),
  readFile(files.taskDetail, 'utf8'),
  readFile(files.index, 'utf8'),
  readFile(files.styles, 'utf8'),
  readFile(files.theme, 'utf8'),
]);
const uiSource = `${app}\n${mobile}\n${native}\n${taskDetail}`;

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
];
for (const [pattern, label] of forbiddenCss) {
  if (pattern.test(styles)) fail(`styles.css contains ${label}; use HeroUI semantic tokens/theme instead.`);
}

for (const match of styles.matchAll(/border-radius\s*:\s*([^;]+);/gi)) {
  const value = match[1].trim();
  if (value !== 'var(--radius)' && value !== 'var(--field-radius)') {
    fail(`styles.css contains non-theme border radius: ${value}`);
  }
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
  if (pattern.test(uiSource)) fail(`UI contains forbidden style override: ${pattern}`);
}

if (/appearance\s*:\s*none/i.test(styles)) {
  fail('Native OS controls must keep browser appearance; appearance:none is forbidden.');
}
if (/<textarea(?:\s|>)/.test(uiSource)) fail('UI contains a native <textarea>; text areas should remain HeroUI unless OS-native behavior is required.');
if (/<input(?![^>]*type=["'](?:date|time|datetime-local)["'])[^>]*>/i.test(uiSource)) {
  fail('Native <input> is only allowed for date/time controls that intentionally invoke the OS picker.');
}

const forbiddenHeroUiOverrides = [
  '.button--',
  '.modal__',
  '.menu-item',
  '.dropdown__',
  '.input--',
  '.select__',
  '.text-field__',
  '.tag-group__',
  '.tabs__',
];
for (const selector of forbiddenHeroUiOverrides) {
  if (styles.includes(selector)) {
    fail(`styles.css overrides HeroUI internal selector ${selector}; primitive geometry must remain owned by HeroUI.`);
  }
}

const requiredHeroUi = ['SearchField', 'Modal', 'TagGroup', 'ToggleButtonGroup', 'Button'];
for (const name of requiredHeroUi) {
  if (!uiSource.includes(name)) fail(`Expected HeroUI primitive ${name} is missing from the UI.`);
}

const forbiddenCustomPickers = ['Dropdown', '<Select', 'Select.Trigger', 'DatePicker', '<Calendar', '<TimeField', '<DateField'];
for (const name of forbiddenCustomPickers) {
  if (uiSource.includes(name)) fail(`UI still contains ${name}; option/date/time pickers should delegate to native OS controls.`);
}

if (!native.includes('<select') || !native.includes('NativeSelect') || !native.includes('NativeActionSelect')) {
  fail('NativeControls.tsx must provide real HTML select controls for OS-native pickers.');
}
if (!styles.includes('.bardo-native-select') || !styles.includes('accent-color: var(--accent);')) {
  fail('Native select styling contract is missing.');
}
if (!styles.includes('background: var(--field-background);')) {
  fail('Native fields must use the HeroUI semantic field background token.');
}

if (app.includes('<Tabs') || app.includes('Tabs.ListContainer') || app.includes('Tabs.Indicator')) {
  fail('Mobile Kanban must not use HeroUI Tabs/ListContainer for the column carousel.');
}
if (!app.includes('<MobileKanban')) fail('App.tsx must render the dedicated MobileKanban carousel.');

const mobileContracts = [
  ['LONG_PRESS_MS = 420', '420ms long-press activation'],
  ['data-drop-column-id', 'column drop targets'],
  ['data-mobile-column-id', 'carousel slide identifiers'],
  ['onPointerDownCapture', 'delegated pointer down handling'],
  ['onPointerMoveCapture', 'delegated pointer move handling'],
  ['onMoveTask', 'mobile task movement callback'],
  ['scrollIntoView', 'active pill auto-scrolling'],
];
for (const [needle, label] of mobileContracts) {
  if (!mobile.includes(needle)) fail(`MobileKanban.tsx is missing ${label}.`);
}

const carouselCssContracts = [
  ['.bardo-column-pill-rail', 'pill rail'],
  ['overflow-y: hidden;', 'vertical scrollbar suppression'],
  ['.bardo-mobile-carousel', 'mobile carousel'],
  ['scroll-snap-type: x mandatory;', 'horizontal scroll snapping'],
  ['.bardo-mobile-column-slide', 'carousel slides'],
  ['flex: 0 0 calc(100% - 2.75rem);', 'next-column peek width'],
  ['.bardo-mobile-drag-ghost', 'long-press drag preview'],
];
for (const [needle, label] of carouselCssContracts) {
  if (!styles.includes(needle)) fail(`styles.css is missing ${label}.`);
}

const detailContracts = [
  ['data-testid="task-read-view"', 'read-first task view'],
  ['data-testid="task-edit-view"', 'explicit task edit view'],
  ['startEditing', 'edit transition'],
  ['saveEditing', 'explicit save transition'],
  ['Intl.DateTimeFormat(undefined', 'OS/browser locale date formatting'],
  ['<NativeSelect label="Columna"', 'native column selector'],
  ['<NativeSelect label="Responsable"', 'native assignee selector'],
  ['<NativeSelect label="Prioridad"', 'native priority selector'],
];
for (const [needle, label] of detailContracts) {
  if (!taskDetail.includes(needle)) fail(`TaskDetailModal.tsx is missing ${label}.`);
}

if (!app.includes("from '@gravity-ui/icons'")) {
  fail('App.tsx must use the normalized SVG icon set used by HeroUI examples.');
}
for (const glyph of ['•••', '⌕', '>×<', '>←<', '>→<']) {
  if (uiSource.includes(glyph)) fail(`UI still contains typography-as-icon glyph ${glyph}.`);
}
if (!app.includes('EllipsisVertical')) fail('Board actions must use a real vertical kebab SVG icon.');
if (!app.includes("const ICON_CLASS = 'size-4 shrink-0'")) fail('Interactive SVG icons must share one normalized 16px size contract.');

const requiredThemeTokens = [
  '--background:',
  '--foreground:',
  '--surface:',
  '--overlay:',
  '--accent:',
  '--border:',
  '--field-background:',
  '--field-border:',
  '--field-radius:',
  '--focus:',
  '--radius:',
];
for (const token of requiredThemeTokens) {
  if (!theme.includes(token)) fail(`theme.css is missing ${token}`);
}

if (!theme.includes('--field-border: transparent;')) {
  fail('Exact HeroUI Theme Builder contract requires transparent --field-border; do not patch fields with manual borders.');
}

if (!index.includes('data-theme="default"')) {
  fail('The QA app must use the HeroUI default theme instead of forcing dark mode.');
}
if (index.includes('data-theme="dark"') || index.includes('content="dark"')) {
  fail('index.html still forces dark mode.');
}

if (failures.length) {
  console.error(`Visual system lint failed (${failures.length}):`);
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log('HeroUI shell + native OS picker + mobile carousel lint passed.');
