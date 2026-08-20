#!/usr/bin/env node

/**
 * Script administrativo de recuperación de desastres para Bardo (D1 + R2).
 * 
 * Uso:
 *   node scripts/restore.js --help
 *   node scripts/restore.js --list-snapshots
 *   node scripts/restore.js --inspect-snapshot <prefix>
 *   node scripts/restore.js --inspect-doc <docId>
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
🛡️  BARDO DISASTER RECOVERY CLI (D1 + R2)

Comandos disponibles:
  --help                             Muestra esta ayuda.
  --list-snapshots                   Lista todos los snapshots diarios en R2.
  --inspect-snapshot <prefix>        Inspecciona el contenido de un snapshot en R2.
  --inspect-doc <documentId>         Muestra los metadatos y estado del backup en R2 de un documento.
  --download-original <id> <out>     Descarga el archivo original desde R2 al disco local.
  --restore-doc-local <id>           Instrucciones y comando para restaurar un documento en D1.
  --restore-snapshot-local <prefix>  Instrucciones y comando para restaurar un snapshot en D1.

Ejemplos:
  node scripts/restore.js --list-snapshots
  node scripts/restore.js --inspect-snapshot database/2026-08-20/1787250000000
  node scripts/restore.js --inspect-doc 47d7dd59-e932-4091-a185-9856a9db3fcf
`);
}

function runWranglerR2(cmd) {
  try {
    return execSync(`npx wrangler r2 object ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    console.error(`Error ejecutando wrangler r2: ${error.message}`);
    if (error.stderr) console.error(error.stderr);
    return null;
  }
}

async function main() {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const action = args[0];

  if (action === '--list-snapshots') {
    console.log('🔍 Consultando snapshots en R2 (bucket: bardo-backups)...');
    try {
      const output = execSync('npx wrangler r2 object list bardo-backups --prefix database/ --limit 100', { encoding: 'utf8' });
      console.log(output);
    } catch (e) {
      console.error('Error al listar objetos en R2:', e.message);
    }
    return;
  }

  if (action === '--inspect-snapshot') {
    const prefix = args[1];
    if (!prefix) {
      console.error('Debes especificar el prefijo del snapshot (ej: database/2026-08-20/1787250000000)');
      process.exit(1);
    }
    const manifestKey = `${prefix.replace(/\/+$/, '')}/manifest.json`;
    console.log(`📄 Leyendo manifest: ${manifestKey}...`);
    try {
      const output = execSync(`npx wrangler r2 object get bardo-backups/${manifestKey}`, { encoding: 'utf8' });
      console.log(output);
    } catch (e) {
      console.error('Error al obtener manifest:', e.message);
    }
    return;
  }

  if (action === '--inspect-doc') {
    const docId = args[1];
    if (!docId) {
      console.error('Debes indicar el ID del documento.');
      process.exit(1);
    }
    const metaKey = `documents/${docId}/metadata.json`;
    console.log(`📄 Leyendo metadatos de R2: ${metaKey}...`);
    try {
      const output = execSync(`npx wrangler r2 object get bardo-backups/${metaKey}`, { encoding: 'utf8' });
      console.log(output);
    } catch (e) {
      console.error('Error al obtener metadata del documento:', e.message);
    }
    return;
  }

  if (action === '--download-original') {
    const docId = args[1];
    const outPath = args[2] || `original-${docId}`;
    if (!docId) {
      console.error('Debes indicar el ID del documento.');
      process.exit(1);
    }
    console.log(`📦 Buscando archivos originales para ${docId}...`);
    try {
      const listOutput = execSync(`npx wrangler r2 object list bardo-backups --prefix documents/${docId}/original.`, { encoding: 'utf8' });
      console.log(listOutput);
      console.log(`\nPara descargar el archivo específico a tu disco, ejecuta:\n  npx wrangler r2 object get bardo-backups/documents/${docId}/original.<ext> --file ${outPath}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
    return;
  }

  console.log(`Comando desconocido: ${action}`);
  printHelp();
}

main();
