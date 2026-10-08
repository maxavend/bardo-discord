import { PathApi } from 'platejs';
import {
  createPlateEditor,
  createPlatePlugin,
  ParagraphPlugin,
} from 'platejs/react';
import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  BlockquotePlugin,
  HorizontalRulePlugin,
} from '@platejs/basic-nodes/react';
import { LinkPlugin } from '@platejs/link/react';
import { ListPlugin } from '@platejs/list/react';
import { indentList, outdentList } from '@platejs/list';
import {
  TablePlugin,
  TableRowPlugin,
  TableCellPlugin,
  TableCellHeaderPlugin,
} from '@platejs/table/react';

import {
  BardoLeaf,
  BardoParagraphElement,
  BardoH1Element,
  BardoH2Element,
  BardoH3Element,
  BardoBlockquoteElement,
  BardoHrElement,
  BardoCodeBlockElement,
  BardoCalloutElement,
  BardoChecklistElement,
  BardoSpoilerElement,
  BardoLinkElement,
  BardoTableElement,
  BardoTableRowElement,
  BardoTableCellElement,
  BardoTableCellHeaderElement,
} from './bardo-editor-nodes.jsx';

/**
 * Plugin para bloques de código pre > code
 */
export const BardoCodeBlockPlugin = createPlatePlugin({
  key: 'code_block',
  node: { isElement: true },
  component: BardoCodeBlockElement,
});

/**
 * Plugin para callouts (.doc-callout)
 */
export const BardoCalloutPlugin = createPlatePlugin({
  key: 'callout',
  node: { isElement: true },
  component: BardoCalloutElement,
});

/**
 * Plugin para items de lista de tareas (checklists)
 */
export const BardoActionItemPlugin = createPlatePlugin({
  key: 'action_item',
  node: { isElement: true },
  component: BardoChecklistElement,
});

/**
 * Plugin para spoilers / acordeones
 */
export const BardoTogglePlugin = createPlatePlugin({
  key: 'toggle',
  node: { isElement: true },
  component: BardoSpoilerElement,
});

const MAX_LIST_INDENT = 6;

function blockText(editor, path) {
  try {
    return editor.api.string(path);
  } catch {
    return '';
  }
}

/** Inserta un salto suave; un Enter sobre una última línea vacía sale del bloque. */
function softBreakOrExit(editor, path) {
  const text = blockText(editor, path);
  const atEnd = editor.api.isEnd(editor.selection?.focus, path);
  if (atEnd && (text === '' || text.endsWith('\n'))) {
    if (text.endsWith('\n')) editor.tf.deleteBackward('character');
    editor.tf.insertNodes({ type: 'p', children: [{ text: '' }] }, { at: PathApi.next(path), select: true });
    return;
  }
  editor.tf.insertText('\n');
}

/**
 * Atajos de teclado propios de Bardo:
 * - Tab / Shift+Tab indentan ítems de lista.
 * - Enter en bloques de código y destacados inserta un salto de línea (doble Enter sale).
 * - Enter en una tarea crea una tarea nueva sin marcar; en una tarea vacía, vuelve a párrafo.
 */
export const BardoKeyboardPlugin = createPlatePlugin({
  key: 'bardo_keyboard',
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.defaultPrevented || event.nativeEvent?.isComposing) return false;
      if (event.key !== 'Tab' && event.key !== 'Enter') return false;
      if (!editor.selection) return false;
      const entry = editor.api.block();
      if (!entry) return false;
      const [node, path] = entry;

      if (event.key === 'Tab') {
        if (!node.listStyleType && node.type !== 'action_item') return false;
        event.preventDefault();
        if (node.type === 'action_item') {
          const indent = Math.max(1, Number(node.indent) || 1);
          const next = event.shiftKey ? indent - 1 : Math.min(MAX_LIST_INDENT, indent + 1);
          if (next <= 1) editor.tf.unsetNodes('indent', { at: path });
          else editor.tf.setNodes({ indent: next }, { at: path });
        } else if (event.shiftKey) {
          outdentList(editor);
        } else if ((Number(node.indent) || 1) < MAX_LIST_INDENT) {
          indentList(editor, { listStyleType: node.listStyleType });
        }
        return true;
      }

      if (event.shiftKey || editor.api.isExpanded()) return false;

      if (node.type === 'code_block' || node.type === 'callout') {
        event.preventDefault();
        softBreakOrExit(editor, path);
        return true;
      }

      if (node.type === 'action_item') {
        event.preventDefault();
        if (blockText(editor, path) === '') {
          editor.tf.unsetNodes(['checked', 'indent'], { at: path });
          editor.tf.setNodes({ type: 'p' }, { at: path });
        } else {
          editor.tf.insertBreak();
          editor.tf.setNodes({ checked: false });
        }
        return true;
      }

      return false;
    },
  },
});

/**
 * Plugins configurados para el Editor de Bardo
 */
export const bardoPlugins = [
  // Párrafo
  ParagraphPlugin.configure({
    node: { component: BardoParagraphElement },
  }),

  // Encabezados
  H1Plugin.configure({
    node: { component: BardoH1Element },
  }),
  H2Plugin.configure({
    node: { component: BardoH2Element },
  }),
  H3Plugin.configure({
    node: { component: BardoH3Element },
  }),

  // Cita
  BlockquotePlugin.configure({
    node: { component: BardoBlockquoteElement },
  }),

  // Separador
  HorizontalRulePlugin.configure({
    node: { component: BardoHrElement },
  }),

  // Marcas de texto
  BoldPlugin.configure({
    node: { component: BardoLeaf },
  }),
  ItalicPlugin.configure({
    node: { component: BardoLeaf },
  }),
  UnderlinePlugin.configure({
    node: { component: BardoLeaf },
  }),
  StrikethroughPlugin.configure({
    node: { component: BardoLeaf },
  }),
  CodePlugin.configure({
    node: { component: BardoLeaf },
  }),

  // Enlaces
  LinkPlugin.configure({
    node: { component: BardoLinkElement },
  }),

  // Listas planas (indent list): cada ítem es un párrafo con listStyleType + indent.
  ListPlugin,

  // Tablas
  TablePlugin.configure({
    node: { component: BardoTableElement },
  }),
  TableRowPlugin.configure({
    node: { component: BardoTableRowElement },
  }),
  TableCellPlugin.configure({
    node: { component: BardoTableCellElement },
  }),
  TableCellHeaderPlugin.configure({
    node: { component: BardoTableCellHeaderElement },
  }),

  // Nodos específicos de Bardo
  BardoCodeBlockPlugin,
  BardoCalloutPlugin,
  BardoActionItemPlugin,
  BardoTogglePlugin,
  BardoKeyboardPlugin,
];

/**
 * Crea una instancia configurada de Plate Editor para Bardo.
 * @param {Array<Object>} initialValue
 */
export function createBardoEditor(initialValue = [{ type: 'p', children: [{ text: '' }] }]) {
  return createPlateEditor({
    plugins: bardoPlugins,
    value: initialValue,
    // Sin normalizar, los ítems numerados no tienen `listStart` y todos se ven
    // como "1."; además `listRestart` (lista que empieza en 3) no se aplicaría.
    shouldNormalizeEditor: true,
  });
}
