/**
 * Comandos de bloque compartidos por la barra de herramientas y el menú "/".
 * Producen exactamente la estructura que entiende `bardo-editor-serialization.js`:
 * listas planas (p + listStyleType + indent) y tareas `action_item`.
 */
import { toggleList } from '@platejs/list';
import { deleteColumn, deleteRow, deleteTable, insertTableColumn, insertTableRow } from '@platejs/table';
import { isOrderedListStyle } from './bardo-markdown.js';

/**
 * Nombres de bloques: la barra de herramientas y el menú "/" usan esta misma
 * constante, así un bloque se llama igual en todas partes.
 */
export const BLOCK_LABELS = Object.freeze({
  p: 'Texto',
  h1: 'Título 1',
  h2: 'Título 2',
  h3: 'Título 3',
  ul: 'Lista',
  ol: 'Lista numerada',
  checklist: 'Lista de tareas',
  blockquote: 'Cita',
  code_block: 'Bloque de código',
  callout: 'Nota destacada',
  spoiler: 'Desplegable',
  table: 'Tabla',
  hr: 'Separador',
});

const LIST_PROPS = ['listStyleType', 'indent', 'listStart', 'listRestart', 'listRestartPolite'];

function currentBlock(editor) {
  if (!editor?.selection) return null;
  try {
    return editor.api.block() || null;
  } catch {
    return null;
  }
}

/** Tipo lógico del bloque bajo el cursor, en el vocabulario de la barra. */
export function currentBlockKind(editor) {
  const entry = currentBlock(editor);
  if (!entry) return 'p';
  const [node] = entry;
  if (node.type === 'action_item') return 'checklist';
  if (node.listStyleType) return isOrderedListStyle(node.listStyleType) ? 'insertOrderedList' : 'insertUnorderedList';
  return node.type || 'p';
}

/** Cambia el tipo de los bloques seleccionados, quitando propiedades de lista/tarea. */
export function setBlockType(editor, type) {
  editor.tf.withoutNormalizing(() => {
    editor.tf.unsetNodes([...LIST_PROPS, 'checked']);
    editor.tf.setNodes({ type });
  });
}

/** Activa/desactiva una lista con viñetas ('disc') o numerada ('decimal'). */
export function toggleBardoList(editor, listStyleType) {
  const entry = currentBlock(editor);
  if (!entry) return;
  const [node] = entry;
  const ordered = isOrderedListStyle(listStyleType);

  if (node.listStyleType && isOrderedListStyle(node.listStyleType) === ordered) {
    // Misma lista: desactivar.
    setBlockType(editor, 'p');
    return;
  }
  if (node.listStyleType) {
    // Otro tipo de lista: cambiar el estilo manteniendo la indentación.
    editor.tf.setNodes({ listStyleType });
    return;
  }
  if (node.type !== 'p') setBlockType(editor, 'p');
  toggleList(editor, { listStyleType });
}

/** Activa/desactiva la lista de tareas. */
export function toggleChecklist(editor) {
  const entry = currentBlock(editor);
  if (!entry) return;
  const [node] = entry;
  if (node.type === 'action_item') {
    setBlockType(editor, 'p');
    return;
  }
  editor.tf.withoutNormalizing(() => {
    editor.tf.unsetNodes(LIST_PROPS);
    editor.tf.setNodes({ type: 'action_item', checked: false });
  });
}

export function toggleBlockquote(editor) {
  const entry = currentBlock(editor);
  if (!entry) return;
  setBlockType(editor, entry[0].type === 'blockquote' ? 'p' : 'blockquote');
}

export function insertBlock(editor, block) {
  editor.tf.insertNodes(block, { select: true });
}

const tableCell = (type, text) => ({ type, children: [{ type: 'p', children: [{ text }] }] });

/** Tabla inicial de 2×2 con fila de encabezado. */
export function createDefaultTable() {
  return {
    type: 'table',
    children: [
      { type: 'tr', children: [tableCell('th', 'Encabezado 1'), tableCell('th', 'Encabezado 2')] },
      { type: 'tr', children: [tableCell('td', ''), tableCell('td', '')] },
    ],
  };
}

export function insertDefaultTable(editor) {
  insertBlock(editor, createDefaultTable());
}

/** ¿El cursor está dentro de una tabla? */
export function isInTable(editor) {
  if (!editor?.selection) return false;
  try {
    return Boolean(editor.api.above({ match: { type: 'table' } }));
  } catch {
    return false;
  }
}

/**
 * Acciones de tabla en el vocabulario de la barra: agregar/quitar filas y
 * columnas en la posición del cursor, o quitar la tabla completa.
 */
export function runTableAction(editor, action) {
  if (!isInTable(editor)) return false;
  if (action === 'row-below') insertTableRow(editor);
  else if (action === 'row-above') insertTableRow(editor, { before: true });
  else if (action === 'column-right') insertTableColumn(editor);
  else if (action === 'column-left') insertTableColumn(editor, { before: true });
  else if (action === 'delete-row') deleteRow(editor);
  else if (action === 'delete-column') deleteColumn(editor);
  else if (action === 'delete-table') deleteTable(editor);
  else return false;
  return true;
}
