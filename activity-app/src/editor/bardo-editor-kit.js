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
  BardoUlElement,
  BardoOlElement,
  BardoLiElement,
  BardoLicElement,
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

  // Listas estándar
  ListPlugin.configure({
    node: {
      component: BardoUlElement,
    },
    options: {
      ul: { component: BardoUlElement },
      ol: { component: BardoOlElement },
      li: { component: BardoLiElement },
      lic: { component: BardoLicElement },
    },
  }),

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
];

/**
 * Crea una instancia configurada de Plate Editor para Bardo.
 * @param {Array<Object>} initialValue
 */
export function createBardoEditor(initialValue = [{ type: 'p', children: [{ text: '' }] }]) {
  return createPlateEditor({
    plugins: bardoPlugins,
    value: initialValue,
  });
}
