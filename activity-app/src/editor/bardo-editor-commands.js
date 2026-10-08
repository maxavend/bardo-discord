/**
 * Comandos de bloque compartidos por la barra de herramientas y el menú "/".
 * Producen exactamente la estructura que entiende `bardo-editor-serialization.js`:
 * listas planas (p + listStyleType + indent) y tareas `action_item`.
 */
import { toggleList } from '@platejs/list';
import { isOrderedListStyle } from './bardo-markdown.js';

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
