import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Discord-native foundation uses React 19, Tailwind v4 and Base UI without changing the Worker entry', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const build = await read('scripts/build-activity.js');
  const wrangler = JSON.parse(await read('wrangler.jsonc'));
  assert.match(pkg.dependencies.react, /^\^19/);
  assert.match(pkg.devDependencies.tailwindcss, /^\^4/);
  assert.ok(pkg.dependencies['@base-ui/react']);
  assert.match(build, /jsx: 'automatic'/);
  assert.match(build, /features\/home\/home-page\.jsx/);
  assert.match(build, /features\/documents\/document-trigger\.jsx/);
  assert.equal(wrangler.main, 'src/p6-entry.js');
});

test('semantic theme exposes the complete Bardo surface, content, interaction and state vocabulary', async () => {
  const theme = await read('src/activity/styles/theme.css');
  for (const token of [
    '--bardo-background', '--bardo-surface-raised', '--bardo-surface-hover', '--bardo-surface-active', '--bardo-surface-selected',
    '--bardo-text-primary', '--bardo-text-secondary', '--bardo-text-muted', '--bardo-text-disabled',
    '--bardo-border-subtle', '--bardo-border-default', '--bardo-border-strong',
    '--bardo-interactive-primary', '--bardo-interactive-danger', '--bardo-focus-ring',
    '--bardo-status-success', '--bardo-status-warning', '--bardo-status-danger', '--bardo-status-info',
  ]) assert.match(theme, new RegExp(token));
  assert.match(theme, /prefers-reduced-motion: reduce/);
});

test('Home is an authoritative lazy React surface with explicit loading, empty, error and ready states', async () => {
  const bootstrap = await read('src/activity/app/bootstrap.jsx');
  const home = await read('src/activity/features/home/home-page.jsx');
  const integration = await read('src/activity/product-integration.js');
  assert.match(bootstrap, /lazy\(\(\) => import\('\.\.\/features\/home\/home-page\.jsx'\)\)/);
  assert.match(home, /status: 'loading'/);
  assert.match(home, /status: 'error'/);
  assert.match(home, /Nada por aquí todavía/);
  assert.match(home, /\/api\/home\/\$\{section\.key\}\?limit=5/);
  assert.doesNotMatch(integration, /createAppShell|loadHomeSection|bardo-home-hero/);
});

test('document task flow uses Base UI Dialog and a remote accessible MemberPicker', async () => {
  const documentFlow = await read('src/activity/features/documents/document-enhancements.jsx');
  const trigger = await read('src/activity/features/documents/document-trigger.jsx');
  const picker = await read('src/activity/components/bardo/member-picker.jsx');
  const integration = await read('src/activity/product-integration.js');
  assert.match(documentFlow, /<Dialog open=\{open\}/);
  assert.match(trigger, /lazy\(\(\) => import\('\.\/document-enhancements\.jsx'\)\)/);
  assert.match(documentFlow, /window\.confirm\('¿Descartar los cambios/);
  assert.match(documentFlow, /bardo:document-task-changed/);
  assert.match(picker, /ComboboxPrimitive\.Root/);
  assert.match(picker, /member-directory\?query=/);
  assert.match(picker, /limit=25/);
  assert.doesNotMatch(integration, /openDocumentTaskModal|bardo-picker-option/);
});

test('open-code UI primitives cover dialogs, menus, popovers, selects, tabs and form controls', async () => {
  for (const path of [
    'src/activity/components/ui/button.jsx',
    'src/activity/components/ui/dialog.jsx',
    'src/activity/components/ui/dropdown-menu.jsx',
    'src/activity/components/ui/input.jsx',
    'src/activity/components/ui/popover.jsx',
    'src/activity/components/ui/select.jsx',
    'src/activity/components/ui/tabs.jsx',
    'src/activity/components/ui/tooltip.jsx',
    'src/activity/components/ui/checkbox.jsx',
    'src/activity/components/ui/switch.jsx',
    'src/activity/components/ui/scroll-area.jsx',
  ]) assert.ok((await read(path)).length > 40, `${path} must be implemented`);
});

test('Discord authentication resolves instance and document targets from the SDK without query parameters', async () => {
  const security = await read('src/activity/security-bootstrap.js');
  const reader = await read('src/activity/app.js');
  assert.match(security, /const instanceId = sdk\.instanceId \|\| queryInstanceId/);
  assert.doesNotMatch(security, /!isEmbeddedActivity\(\) \|\| !instanceId/);
  assert.match(reader, /window\.location\.hostname\.endsWith\('\.discordsays\.com'\)/);
  assert.match(reader, /globalThis\.__bardoActivityAuth\?\.ready/);
  assert.match(reader, /return sharedAuth\.sdk/);
});
