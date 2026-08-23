import {readFileSync, writeFileSync} from 'node:fs';

const filePath = process.argv[2] || 'src/worker.js';
let source = readFileSync(filePath, 'utf8');

const importLine = "import { handleDocsApi } from './docs-api.js';\n";
if (!source.includes(importLine)) {
  const anchor = "import { normalizeDocumentId } from './document-id.js';\n";
  if (!source.includes(anchor)) throw new Error('No encontré el ancla de imports de worker.js');
  source = source.replace(anchor, `${anchor}${importLine}`);
}

const routeBlock = `\n    const docsApiResponse = await handleDocsApi(request, url, env);\n    if (docsApiResponse) return docsApiResponse;\n`;
if (!source.includes('const docsApiResponse = await handleDocsApi')) {
  const anchor = '    const url = new URL(request.url);\n';
  if (!source.includes(anchor)) throw new Error('No encontré el ancla de routing de worker.js');
  source = source.replace(anchor, `${anchor}${routeBlock}`);
}

writeFileSync(filePath, source);
console.log(`Production Docs API wired into ${filePath}`);
