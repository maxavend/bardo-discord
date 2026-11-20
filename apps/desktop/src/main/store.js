// Archivos de la app en userData. El refresh token se cifra con safeStorage
// (Keychain en macOS, DPAPI en Windows); nunca se guarda en texto plano.
import {app, safeStorage} from 'electron';
import {readFile, rm, writeFile, rename} from 'node:fs/promises';
import path from 'node:path';

const file = name => path.join(app.getPath('userData'), name);

async function writeAtomic(name, data) {
  const target = file(name);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, data, {mode: 0o600});
  await rename(temporary, target);
}

export async function readJson(name, fallback = null) {
  try {
    return JSON.parse(await readFile(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(name, value) {
  return writeAtomic(name, JSON.stringify(value));
}

export async function readSecret(name) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await readFile(file(name));
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch {
    return null;
  }
}

/** Devuelve false si el sistema no ofrece cifrado: entonces la sesión dura solo mientras la app esté abierta. */
export async function writeSecret(name, value) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  await writeAtomic(name, safeStorage.encryptString(JSON.stringify(value)));
  return true;
}

export async function removeFile(name) {
  await rm(file(name), {force: true});
}
