import { readFile } from 'node:fs/promises';
import process from 'node:process';

const files = {
  app: new URL('../src/App.tsx', import.meta.url),
  mobile: new URL('../src/MobileKanban.tsx', import.meta.url),
  native: new URL('../src/NativeControls.tsx', import.meta.url),
  taskDetail: new URL('../src/TaskDetailModal.tsx', import.meta.url),
  main: new URL('../src/main.tsx', import.meta.url),
  index: new URL('../index.html', import.meta.url),
  styles: new URL('../src/styles.css', import.meta.url),
  theme: new URL('../src/theme.css', import.meta.url),
};

const [app, mobile, native, taskDetail, main, index, styles, theme] = await Promise.all(
  Object.values(files).map((url) => readFile(url, 'utf8')),
);
const uiSource = `${app}\n${mobile}\n${native}\n${taskDetail}`;
const failures = [];
const fail = (message) => failures.push(message);

const importOrder = ['@import "tailwindcss";', '@import "@heroui/styles";', '@import "./theme.css";'];
if (JSON.stringify(styles.split(/\r?\n/).slice(0, 3)) !== JSON.stringify(importOrder)) {
  fail('styles.css must load Tailwind → @heroui/styles → theme.css in that exact order.');
}

if (main.includes('interaction.css') || main.includes('audit-fixes.css')) {
  fail('Runtime must use one canonical layout/composition stylesheet only.');
}

const forbiddenCss = [
  [/#[0-9a-f]{3,8}\b/gi, 'hex colors'],
  [/\brgba?\s*\(/gi, 'rgb/rgba colors'],
  [/\bhsla?\s*\(/gi, 'hsl/hsla colors'],
  [/\boklch\s*\(/gi, 'OKLCH colors outside theme.css'],
  [/\blinear-gradient\s*\(/gi, 'arbitrary gradients'],
  [/\bradial-gradient\s*\(/gi, 'arbitrary gradients'],
];
for (const [pattern, label] of forbiddenCss) if (pattern.test(styles)) fail(`styles.css contains ${label}.`);

for (const selector of ['.button--', '.modal__', '.menu-item', '.dropdown__', '.input--', '.select__', '.text-field__', '.tag-group__', '.tabs__']) {
  if (styles.includes(selector)) fail(`styles.css overrides HeroUI internal selector ${selector}.`);
}

if (/appearance\s*:\s*none/i.test(styles)) fail('Native OS controls must keep browser appearance.');
if (/<textarea(?:\s|>)/.test(uiSource)) fail('Native textarea is forbidden; keep HeroUI TextArea.');
if (/<input(?![^>]*type=["'](?:date|time|datetime-local)["'])[^>]*>/.test(uiSource)) {
  fail('Native input is only allowed for intentional OS date/time pickers.');
}

for (const required of ['SearchField', 'Modal', 'TagGroup', 'ToggleButtonGroup', 'Button']) {
  if (!uiSource.includes(required)) fail(`Expected HeroUI primitive ${required} is missing.`);
}
for (const forbidden of ['Dropdown', '<Select', 'Select.Trigger', 'DatePicker', '<Calendar', '<TimeField', '<DateField']) {
  if (uiSource.includes(forbidden)) fail(`UI still contains custom picker ${forbidden}.`);
}

if (!native.includes('<select') || !native.includes('NativeSelect') || !native.includes('NativeActionSelect')) {
  fail('NativeControls.tsx must provide real HTML select controls.');
}
if (!styles.includes('-webkit-appearance: auto;') || !styles.includes('appearance: auto;')) {
  fail('Native selects must explicitly preserve OS/browser appearance.');
}

if (uiSource.includes('Modal.Backdrop variant="blur"')) {
  fail('Editing/configuration dialogs must use HeroUI opaque backdrops so background controls never show through.');
}
const opaqueBackdropCount = (uiSource.match(/Modal\.Backdrop variant="opaque"/g) ?? []).length;
if (opaqueBackdropCount < 3) {
  fail(`Expected all three app dialogs to use opaque HeroUI backdrops; found ${opaqueBackdropCount}.`);
}

const layoutContracts = [
  ['--bardo-gutter:', 'single page gutter variable'],
  ['.bardo-mobile-carousel-bleed', 'mobile full-bleed wrapper'],
  ['margin-inline: calc(var(--bardo-gutter) * -1);', 'symmetric negative gutter'],
  ['padding: 0.25rem var(--bardo-gutter) 1rem;', 'internal carousel gutter'],
  ['scroll-padding-inline: var(--bardo-gutter);', 'carousel snap gutter'],
  ['scroll-snap-type: x mandatory;', 'horizontal snapping'],
  ['flex: 0 0 calc(100% - 2.75rem);', 'next-column peek'],
  ['grid-template-columns: minmax(0, 1fr) repeat(3, 2.5rem);', 'non-collapsing settings grid'],
  ['.bardo-task-list[data-over="true"]::after', 'rounded drag target'],
  ['border-radius: var(--field-radius);', 'semantic field/drop radius'],
  ['.toolbar[aria-label="Herramientas QA"] > *', 'QA action containment'],
  ['max-width: 100%;', 'intrinsic width containment'],
];
for (const [needle, label] of layoutContracts) if (!styles.includes(needle)) fail(`styles.css is missing ${label}.`);

for (const required of ['carouselInlineStart', 'snapLeft', 'programmaticColumnRef', 'LONG_PRESS_MS = 420', 'data-mobile-column-id', 'onPointerDownCapture', 'onMoveTask']) {
  if (!mobile.includes(required)) fail(`MobileKanban.tsx is missing ${required}.`);
}

for (const required of ['data-testid="task-read-view"', 'data-testid="task-edit-view"', 'startEditing', 'saveEditing', '<NativeSelect label="Columna"', '<NativeSelect label="Responsable"', '<NativeSelect label="Prioridad"']) {
  if (!taskDetail.includes(required)) fail(`Task detail contract is missing ${required}.`);
}

if (!app.includes('autoFocus={allowProgrammaticInputFocus}')) fail('Quick create must use touch-safe autofocus.');
if (!app.includes('EllipsisVertical')) fail('Board actions must use the vertical kebab SVG.');
if (!app.includes("const ICON_CLASS = 'size-4 shrink-0'")) fail('Interactive icons must use the normalized 16px contract.');

for (const token of ['--background:', '--foreground:', '--surface:', '--surface-secondary:', '--overlay:', '--accent:', '--border:', '--field-background:', '--field-border:', '--field-radius:', '--focus:', '--radius:']) {
  if (!theme.includes(token)) fail(`theme.css is missing ${token}`);
}
if (!theme.includes('--field-border: transparent;')) fail('Theme Builder field border contract changed unexpectedly.');
if (!index.includes('data-theme="default"')) fail('The app must use HeroUI default theme.');
if (index.includes('data-theme="dark"') || index.includes('content="dark"')) fail('Dark mode must not be forced.');

if (failures.length) {
  console.error(`Visual system lint failed (${failures.length}):`);
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Single-layer HeroUI layout + native OS picker contract passed.');
