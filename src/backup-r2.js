import { saveDocument } from './db.js';

export const BACKUP_VERSION = '1';

/**
 * Obtiene la extensión limpia a partir del tipo de fuente o nombre de archivo.
 */
export function getExtensionFromSource(sourceType, sourceName = '') {
  if (sourceType === 'pdf') return 'pdf';
  if (sourceType === 'docx') return 'docx';
  if (sourceType === 'md' || sourceType === 'markdown') return 'md';
  if (sourceType === 'txt') return 'txt';

  const extMatch = String(sourceName).match(/\.([a-z0-9]+)$/i);
  if (extMatch) return extMatch[1].toLowerCase();

  return 'bin';
}

/**
 * Guarda el archivo original permanente en R2.
 */
export async function saveOriginalToR2(env, documentId, {
  bytes,
  text,
  mime,
  type,
  name,
  createdBy,
  createdAt,
}) {
  if (!env?.BACKUPS) {
    console.warn('R2 binding BACKUPS no configurado. Se omite guardado de original en R2.');
    return null;
  }

  const ext = getExtensionFromSource(type, name);
  const key = `documents/${documentId}/original.${ext}`;
  const body = bytes || text;
  if (!body) return null;

  const nowIso = new Date().toISOString();
  const createdIso = createdAt || nowIso;
  const contentType = mime || (type === 'pdf'
    ? 'application/pdf'
    : type === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/plain; charset=utf-8');

  try {
    await env.BACKUPS.put(key, body, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        documentId: String(documentId),
        sourceName: String(name || ''),
        sourceType: String(type || ''),
        sourceMime: String(mime || ''),
        createdBy: String(createdBy || 'unknown'),
        createdAt: createdIso,
        backupVersion: BACKUP_VERSION,
      },
    });

    return { key, ok: true };
  } catch (error) {
    console.error(`Error guardando original en R2 para ${documentId}:`, error);
    return null;
  }
}

/**
 * Guarda o actualiza el respaldo normalizado (document.md y metadata.json) en R2.
 */
export async function saveNormalizedBackupToR2(env, documentId, documentData) {
  if (!env?.BACKUPS) {
    console.warn('R2 binding BACKUPS no configurado. Se omite respaldo normalizado en R2.');
    return null;
  }

  const nowIso = new Date().toISOString();
  const mdKey = `documents/${documentId}/document.md`;
  const metaKey = `documents/${documentId}/metadata.json`;

  const metadata = {
    id: String(documentId),
    title: documentData.title || '',
    sourceName: documentData.sourceName || null,
    sourceType: documentData.sourceType || 'markdown',
    sourceMime: documentData.sourceMime || null,
    importStatus: documentData.importStatus || 'ready',
    hasSource: Boolean(documentData.hasSource),
    pages: Array.isArray(documentData.pages) ? documentData.pages : [],
    createdAt: documentData.createdAt || nowIso,
    createdBy: documentData.createdBy || 'unknown',
    updatedAt: nowIso,
    backupVersion: Number(BACKUP_VERSION),
  };

  const markdownContent = String(documentData.originalMarkdown || documentData.markdown || '');

  try {
    await Promise.all([
      env.BACKUPS.put(mdKey, markdownContent, {
        httpMetadata: {
          contentType: 'text/markdown; charset=utf-8',
        },
        customMetadata: {
          documentId: String(documentId),
          updatedAt: nowIso,
          backupVersion: BACKUP_VERSION,
        },
      }),
      env.BACKUPS.put(metaKey, JSON.stringify(metadata, null, 2), {
        httpMetadata: {
          contentType: 'application/json; charset=utf-8',
        },
        customMetadata: {
          documentId: String(documentId),
          updatedAt: nowIso,
          backupVersion: BACKUP_VERSION,
        },
      }),
    ]);

    return { ok: true, mdKey, metaKey };
  } catch (error) {
    console.error(`Error guardando respaldo normalizado en R2 para ${documentId}:`, error);
    return null;
  }
}

/**
 * Recupera el archivo original desde R2.
 */
export async function getOriginalFromR2(env, documentId) {
  if (!env?.BACKUPS) return null;

  const prefix = `documents/${documentId}/original.`;
  const listResult = await env.BACKUPS.list({ prefix, limit: 5 });
  const objectMatch = listResult?.objects?.[0];
  if (!objectMatch) return null;

  const obj = await env.BACKUPS.get(objectMatch.key);
  if (!obj) return null;

  const bytes = new Uint8Array(await obj.arrayBuffer());
  const contentType = obj.httpMetadata?.contentType || obj.customMetadata?.sourceMime || 'application/octet-stream';

  return {
    key: objectMatch.key,
    bytes,
    contentType,
    metadata: obj.customMetadata || {},
  };
}

/**
 * Recupera el respaldo normalizado (markdown y metadatos) desde R2.
 */
export async function getNormalizedBackupFromR2(env, documentId) {
  if (!env?.BACKUPS) return null;

  const mdKey = `documents/${documentId}/document.md`;
  const metaKey = `documents/${documentId}/metadata.json`;

  const [mdObj, metaObj] = await Promise.all([
    env.BACKUPS.get(mdKey),
    env.BACKUPS.get(metaKey),
  ]);

  if (!mdObj && !metaObj) return null;

  const markdown = mdObj ? await mdObj.text() : '';
  let metadata = null;
  if (metaObj) {
    try {
      metadata = JSON.parse(await metaObj.text());
    } catch {
      metadata = null;
    }
  }

  return {
    markdown,
    metadata,
  };
}

/**
 * Reconstruye un documento perdido en D1 a partir de su respaldo en R2.
 */
export async function restoreDocumentToD1(env, documentId) {
  if (!env?.DB || !env?.BACKUPS) {
    throw new Error('Database (DB) o Storage (BACKUPS) no disponible.');
  }

  const backup = await getNormalizedBackupFromR2(env, documentId);
  if (!backup || (!backup.markdown && !backup.metadata)) {
    throw new Error(`No se encontró respaldo en R2 para el documento ${documentId}`);
  }

  const meta = backup.metadata || {};
  const markdown = backup.markdown || meta.originalMarkdown || '';
  const title = meta.title || 'Documento Restaurado';
  const pages = Array.isArray(meta.pages) && meta.pages.length > 0 ? meta.pages : [markdown.slice(0, 500)];

  const docRecord = {
    id: documentId,
    title,
    originalMarkdown: markdown,
    pages,
    sourceName: meta.sourceName || null,
    createdAt: meta.createdAt || new Date().toISOString(),
    createdBy: meta.createdBy || 'unknown',
  };

  await saveDocument(env.DB, documentId, docRecord);

  if (meta.sourceMime || meta.sourceType || meta.importStatus) {
    await env.DB
      .prepare(
        `UPDATE documents
         SET source_mime = ?, source_type = ?, import_status = ?
         WHERE id = ?`,
      )
      .bind(
        meta.sourceMime || null,
        meta.sourceType || 'markdown',
        meta.importStatus || 'ready',
        documentId,
      )
      .run();
  }

  return { ok: true, document: { ...docRecord, ...meta, originalMarkdown: markdown } };
}

/**
 * Realiza un snapshot lógico completo de las tablas de D1 hacia R2.
 */
export async function createDatabaseSnapshot(env) {
  if (!env?.DB || !env?.BACKUPS) {
    console.warn('DB o BACKUPS no disponibles para ejecutar snapshot.');
    return null;
  }

  const now = new Date();
  const dateFolder = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timestamp = now.getTime();
  const snapshotPrefix = `database/${dateFolder}/${timestamp}`;

  try {
    // 1. Obtener documentos (sin source_blob para mantener snapshots ligeros)
    const docsResult = await env.DB
      .prepare(
        `SELECT id, title, original_markdown, pages, source_name, created_at, created_by,
                source_mime, source_type, import_status
         FROM documents ORDER BY created_at ASC`,
      )
      .all();
    const documents = docsResult?.results || [];

    // 2. Obtener tableros Kanban
    let boards = [];
    try {
      const boardsResult = await env.DB
        .prepare('SELECT id, guild_id, name, description, columns, members, created_by, created_at, updated_at FROM boards ORDER BY created_at ASC')
        .all();
      boards = boardsResult?.results || [];
    } catch (e) {
      console.warn('Tabla boards no disponible en snapshot:', e.message);
    }

    // 3. Obtener tareas Kanban
    let tasks = [];
    try {
      const tasksResult = await env.DB
        .prepare('SELECT id, board_id, title, description, status, priority, assignee_id, assignee_name, labels, position, created_by, created_at, updated_at FROM tasks ORDER BY created_at ASC')
        .all();
      tasks = tasksResult?.results || [];
    } catch (e) {
      console.warn('Tabla tasks no disponible en snapshot:', e.message);
    }

    // 4. Armar manifest
    const manifest = {
      snapshotVersion: 1,
      createdAt: now.toISOString(),
      timestamp,
      counts: {
        documents: documents.length,
        boards: boards.length,
        tasks: tasks.length,
      },
      files: {
        documents: `${snapshotPrefix}/documents.json`,
        boards: `${snapshotPrefix}/boards.json`,
        tasks: `${snapshotPrefix}/tasks.json`,
      },
      notes: 'activity_contexts omitida por tratarse de contexto efímero de sesión de Discord.',
    };

    // 5. Guardar archivos en R2
    await Promise.all([
      env.BACKUPS.put(`${snapshotPrefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
      }),
      env.BACKUPS.put(`${snapshotPrefix}/documents.json`, JSON.stringify(documents), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
      }),
      env.BACKUPS.put(`${snapshotPrefix}/boards.json`, JSON.stringify(boards), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
      }),
      env.BACKUPS.put(`${snapshotPrefix}/tasks.json`, JSON.stringify(tasks), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
      }),
    ]);

    console.log(`Snapshot creado con éxito en R2: ${snapshotPrefix} (${documents.length} docs, ${boards.length} boards, ${tasks.length} tasks)`);
    return { ok: true, snapshotPrefix, counts: manifest.counts };
  } catch (error) {
    console.error('Error creando snapshot de base de datos en R2:', error);
    return null;
  }
}

/**
 * Lista los snapshots de base de datos disponibles en R2.
 */
export async function listDatabaseSnapshots(env) {
  if (!env?.BACKUPS) return [];

  const listResult = await env.BACKUPS.list({ prefix: 'database/', limit: 100 });
  const manifestObjects = (listResult?.objects || []).filter((obj) => obj.key.endsWith('/manifest.json'));

  const snapshots = [];
  for (const item of manifestObjects) {
    try {
      const obj = await env.BACKUPS.get(item.key);
      if (obj) {
        const manifest = JSON.parse(await obj.text());
        snapshots.push({
          key: item.key,
          prefix: item.key.replace(/\/manifest\.json$/, ''),
          manifest,
          uploaded: item.uploaded,
        });
      }
    } catch {
      snapshots.push({
        key: item.key,
        prefix: item.key.replace(/\/manifest\.json$/, ''),
        uploaded: item.uploaded,
      });
    }
  }

  return snapshots.sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime());
}

/**
 * Restaura el estado de la base de datos D1 a partir de un snapshot en R2.
 */
export async function restoreDatabaseFromSnapshot(env, snapshotPrefix) {
  if (!env?.DB || !env?.BACKUPS) {
    throw new Error('Database (DB) o Storage (BACKUPS) no disponible.');
  }

  const cleanPrefix = snapshotPrefix.replace(/\/+$/, '');
  const manifestObj = await env.BACKUPS.get(`${cleanPrefix}/manifest.json`);
  if (!manifestObj) {
    throw new Error(`Snapshot no encontrado: ${cleanPrefix}/manifest.json`);
  }

  const manifest = JSON.parse(await manifestObj.text());
  const docsObj = await env.BACKUPS.get(`${cleanPrefix}/documents.json`);
  const boardsObj = await env.BACKUPS.get(`${cleanPrefix}/boards.json`);
  const tasksObj = await env.BACKUPS.get(`${cleanPrefix}/tasks.json`);

  const documents = docsObj ? JSON.parse(await docsObj.text()) : [];
  const boards = boardsObj ? JSON.parse(await boardsObj.text()) : [];
  const tasks = tasksObj ? JSON.parse(await tasksObj.text()) : [];

  // Restaurar documentos
  for (const doc of documents) {
    const pages = typeof doc.pages === 'string' ? JSON.parse(doc.pages) : (doc.pages || []);
    await env.DB
      .prepare(
        `INSERT INTO documents (id, title, original_markdown, pages, source_name, created_at, created_by, source_mime, source_type, import_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           original_markdown = excluded.original_markdown,
           pages = excluded.pages,
           source_name = excluded.source_name,
           created_at = excluded.created_at,
           created_by = excluded.created_by,
           source_mime = excluded.source_mime,
           source_type = excluded.source_type,
           import_status = excluded.import_status`,
      )
      .bind(
        doc.id,
        doc.title,
        doc.original_markdown || doc.originalMarkdown || '',
        JSON.stringify(pages),
        doc.source_name || doc.sourceName || null,
        doc.created_at || doc.createdAt,
        doc.created_by || doc.createdBy,
        doc.source_mime || doc.sourceMime || null,
        doc.source_type || doc.sourceType || 'markdown',
        doc.import_status || doc.importStatus || 'ready',
      )
      .run();
  }

  // Restaurar tableros
  for (const b of boards) {
    await env.DB
      .prepare(
        `INSERT INTO boards (id, guild_id, name, description, columns, members, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           guild_id = excluded.guild_id,
           name = excluded.name,
           description = excluded.description,
           columns = excluded.columns,
           members = excluded.members,
           created_by = excluded.created_by,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
      )
      .bind(
        b.id,
        b.guild_id || b.guildId || null,
        b.name,
        b.description || null,
        typeof b.columns === 'string' ? b.columns : JSON.stringify(b.columns || []),
        typeof b.members === 'string' ? b.members : JSON.stringify(b.members || []),
        b.created_by || b.createdBy,
        b.created_at || b.createdAt,
        b.updated_at || b.updatedAt,
      )
      .run();
  }

  // Restaurar tareas
  for (const t of tasks) {
    await env.DB
      .prepare(
        `INSERT INTO tasks (id, board_id, title, description, status, priority, assignee_id, assignee_name, labels, position, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           board_id = excluded.board_id,
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           priority = excluded.priority,
           assignee_id = excluded.assignee_id,
           assignee_name = excluded.assignee_name,
           labels = excluded.labels,
           position = excluded.position,
           created_by = excluded.created_by,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
      )
      .bind(
        t.id,
        t.board_id || t.boardId,
        t.title,
        t.description || null,
        t.status || 'backlog',
        t.priority || 'medium',
        t.assignee_id || t.assigneeId || null,
        t.assignee_name || t.assigneeName || null,
        typeof t.labels === 'string' ? t.labels : JSON.stringify(t.labels || []),
        t.position || 0,
        t.created_by || t.createdBy,
        t.created_at || t.createdAt,
        t.updated_at || t.updatedAt,
      )
      .run();
  }

  return {
    ok: true,
    snapshotPrefix: cleanPrefix,
    restoredCounts: {
      documents: documents.length,
      boards: boards.length,
      tasks: tasks.length,
    },
    manifest,
  };
}
