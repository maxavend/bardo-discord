import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function main() {
  console.log('Fetching production data from DB --env production...');
  const tables = ['documents', 'boards', 'tasks', 'events', 'event_blocks', 'event_items'];
  const data = {};

  for (const table of tables) {
    const out = execSync(`npx wrangler d1 execute DB --env production --remote --json --command="SELECT * FROM ${table};"`, { encoding: 'utf8' });
    const json = JSON.parse(out);
    data[table] = json[0]?.results || [];
    console.log(`Fetched ${data[table].length} rows for ${table}`);
  }

  const sqlStatements = ['PRAGMA foreign_keys = OFF;'];

  // Documents
  for (const doc of data.documents) {
    const pages = typeof doc.pages === 'string' ? doc.pages : JSON.stringify(doc.pages || []);
    sqlStatements.push(`INSERT OR REPLACE INTO documents (id, title, original_markdown, pages, source_name, created_at, created_by, updated_at, version) VALUES (${sqlVal(doc.id)}, ${sqlVal(doc.title)}, ${sqlVal(doc.original_markdown || '')}, ${sqlVal(pages)}, ${sqlVal(doc.source_name || '')}, ${sqlVal(doc.created_at)}, ${sqlVal(doc.created_by)}, ${sqlVal(doc.updated_at || doc.created_at)}, ${Number(doc.version) || 1});`);
    sqlStatements.push(`INSERT OR REPLACE INTO document_guild_access (document_id, guild_id, granted_by, created_at) VALUES (${sqlVal(doc.id)}, '1458156309420572865', ${sqlVal(doc.created_by || 'system')}, ${sqlVal(doc.created_at)});`);
  }

  // Boards
  for (const b of data.boards) {
    const columns = typeof b.columns === 'string' ? b.columns : JSON.stringify(b.columns || []);
    const members = typeof b.members === 'string' ? b.members : JSON.stringify(b.members || []);
    sqlStatements.push(`INSERT OR REPLACE INTO boards (id, guild_id, name, description, created_by, created_at, updated_at, columns, members) VALUES (${sqlVal(b.id)}, ${sqlVal(b.guild_id)}, ${sqlVal(b.name)}, ${sqlVal(b.description || '')}, ${sqlVal(b.created_by)}, ${sqlVal(b.created_at)}, ${sqlVal(b.updated_at || b.created_at)}, ${sqlVal(columns)}, ${sqlVal(members)});`);
  }

  // Tasks
  for (const t of data.tasks) {
    const labels = typeof t.labels === 'string' ? t.labels : JSON.stringify(t.labels || []);
    sqlStatements.push(`INSERT OR REPLACE INTO tasks (id, board_id, title, description, status, priority, labels, assignee_id, assignee_name, position, due_at, column_id, created_by, created_at, updated_at) VALUES (${sqlVal(t.id)}, ${sqlVal(t.board_id)}, ${sqlVal(t.title)}, ${sqlVal(t.description || '')}, ${sqlVal(t.status || 'todo')}, ${sqlVal(t.priority || 'medium')}, ${sqlVal(labels)}, ${sqlVal(t.assignee_id || null)}, ${sqlVal(t.assignee_name || null)}, ${Number(t.position) || 0}, ${sqlVal(t.due_at || null)}, ${sqlVal(t.column_id || t.status || 'todo')}, ${sqlVal(t.created_by || 'unknown')}, ${sqlVal(t.created_at)}, ${sqlVal(t.updated_at || t.created_at)});`);
  }

  // Events
  for (const ev of data.events) {
    sqlStatements.push(`INSERT OR REPLACE INTO events (id, guild_id, title, description, event_date, start_time, timezone, expected_duration, starts_at, status, minute_document_id, created_by, created_at, updated_at) VALUES (${sqlVal(ev.id)}, ${sqlVal(ev.guild_id)}, ${sqlVal(ev.title)}, ${sqlVal(ev.description || '')}, ${sqlVal(ev.event_date || '2026-08-21')}, ${sqlVal(ev.start_time || '10:00')}, ${sqlVal(ev.timezone || 'UTC')}, ${Number(ev.expected_duration) || 60}, ${sqlVal(ev.starts_at || null)}, ${sqlVal(ev.status || 'scheduled')}, ${sqlVal(ev.minute_document_id || null)}, ${sqlVal(ev.created_by || 'unknown')}, ${sqlVal(ev.created_at)}, ${sqlVal(ev.updated_at || ev.created_at)});`);
  }

  // Event Blocks
  for (const eb of data.event_blocks) {
    sqlStatements.push(`INSERT OR REPLACE INTO event_blocks (id, event_id, title, duration_minutes, type, position, created_at) VALUES (${sqlVal(eb.id)}, ${sqlVal(eb.event_id)}, ${sqlVal(eb.title)}, ${Number(eb.duration_minutes) || 15}, ${sqlVal(eb.type || 'topic')}, ${Number(eb.position) || 0}, ${sqlVal(eb.created_at)});`);
  }

  // Event Items
  for (const ei of data.event_items) {
    sqlStatements.push(`INSERT OR REPLACE INTO event_items (id, block_id, title, position, completed, created_at) VALUES (${sqlVal(ei.id)}, ${sqlVal(ei.block_id)}, ${sqlVal(ei.title)}, ${Number(ei.position) || 0}, ${Number(ei.completed) || 0}, ${sqlVal(ei.created_at)});`);
  }

  sqlStatements.push('PRAGMA foreign_keys = ON;');

  const sqlFile = 'temp_seed_staging.sql';
  writeFileSync(sqlFile, sqlStatements.join('\n'));
  console.log(`Generated ${sqlStatements.length} SQL statements. Executing on DB --env staging...`);

  execSync(`npx wrangler d1 execute DB --env staging --remote --file=${sqlFile}`, { stdio: 'inherit' });
  unlinkSync(sqlFile);
  console.log('✅ Todos los datos de producción fueron restaurados e importados en bardo-db-staging con éxito!');
}

main().catch(err => {
  console.error('Error importing data:', err);
  process.exit(1);
});
