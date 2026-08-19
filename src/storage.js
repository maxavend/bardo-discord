import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function getDocumentPath(messageId) {
  if (!/^\d+$/.test(messageId)) {
    throw new Error('messageId inválido.');
  }

  return path.join(DATA_DIR, `${messageId}.json`);
}

export async function saveDocument(messageId, document) {
  await ensureDataDir();
  await writeFile(
    getDocumentPath(messageId),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );
}

export async function loadDocument(messageId) {
  try {
    const raw = await readFile(getDocumentPath(messageId), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
