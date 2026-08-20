import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['src', 'scripts'];
const files = [];

function collect(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
}

for (const root of roots) collect(root);

const asyncNames = new Set();
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\basync\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g)) asyncNames.add(match[1]);
  for (const match of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*async\b/g)) asyncNames.add(match[1]);
}

// Phase 0 is a characterization phase: it must not silently rewrite product behavior.
// These exact, pre-existing call sites are recorded as baseline debt. The quota means
// any new occurrence fails CI immediately, while later phases can remove entries as
// ownership is made explicit with await/void/catch semantics appropriate to the flow.
const baselineDebt = new Map([
  ['src/activity/app.js::saveDocumentChanges(true);', 2],
  ['src/activity/app.js::saveDocumentChanges(false);', 1],
  ['src/activity/app.js::start();', 1],
  ['src/activity/board.js::openBoardSettingsModal(currentBoardData);', 1],
  ['src/activity/board.js::refreshBoard(false);', 2],
  ['src/activity/board.js::startBoard();', 1],
  ['scripts/restore.js::main();', 1],
]);

const usedDebt = new Map();
const failures = [];
const warnings = [];
const directPromise = /^\s*new\s+Promise\s*\(/;
const asyncIife = /^\s*\(?\s*async\s*\([^)]*\)\s*=>/;

function consumeBaselineDebt(file, text) {
  const key = `${file.replaceAll('\\', '/')}::${text}`;
  const limit = baselineDebt.get(key) || 0;
  const used = usedDebt.get(key) || 0;
  if (used >= limit) return false;
  usedDebt.set(key, used + 1);
  return true;
}

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    if (directPromise.test(line) || asyncIife.test(line)) {
      if (!/\b(?:await|return|void)\b/.test(line) && !/\.(?:catch|then|finally)\s*\(/.test(line)) {
        failures.push({ file, line: index + 1, text: trimmed, reason: 'discarded Promise expression' });
      }
    }

    // A chained handler explicitly owns the Promise, even when the handler itself may
    // deserve a separate error-observability improvement.
    const hasPromiseHandler = /\.(?:catch|then|finally)\s*\(/.test(line);

    if (!hasPromiseHandler) {
      for (const name of asyncNames) {
        const pattern = new RegExp(`^\\s*${name}\\s*\\([^;]*\\);\\s*(?://.*)?$`);
        if (!pattern.test(line)) continue;

        if (consumeBaselineDebt(file, trimmed)) {
          warnings.push({
            file,
            line: index + 1,
            text: trimmed,
            reason: `baseline async ownership debt: ${name}()`,
          });
        } else {
          failures.push({ file, line: index + 1, text: trimmed, reason: `unowned call to async function ${name}()` });
        }
      }
    }

    if (/\.catch\s*\(\s*\(?.*=>\s*\{?\s*\}?\s*\)/.test(trimmed)) {
      warnings.push({
        file,
        line: index + 1,
        text: trimmed,
        reason: 'empty catch handler; Promise is owned but the error is intentionally discarded',
      });
    }
  }
}

for (const [key, limit] of baselineDebt) {
  const used = usedDebt.get(key) || 0;
  if (used !== limit) {
    failures.push({
      file: key.split('::')[0],
      line: 0,
      text: key.split('::')[1],
      reason: `baseline debt changed unexpectedly (expected ${limit}, found ${used}); update ownership and then shrink the allowlist`,
    });
  }
}

for (const warning of warnings) {
  console.warn(`[promises] warning ${relative(process.cwd(), warning.file)}:${warning.line} — ${warning.reason}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[promises] ${relative(process.cwd(), failure.file)}:${failure.line || '?'} — ${failure.reason}`);
    console.error(`  ${failure.text}`);
  }
  console.error(`[promises] ${failures.length} floating-promise regression(s) found.`);
  process.exit(1);
}

console.log(`[promises] no new floating promises across ${files.length} JavaScript files; ${warnings.length} characterized warning(s).`);
