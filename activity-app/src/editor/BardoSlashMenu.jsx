import { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useEditorRef, useEditorSelector } from 'platejs/react';
import {
  insertBlock,
  setBlockType,
  toggleBardoList,
  toggleChecklist,
} from './bardo-editor-commands.js';
import {
  Heading1,
  Heading2,
  Heading3,
  Text,
  ListUl,
  ListOl,
  SquareCheck,
  QuoteOpen,
  Code,
  Minus,
  ChevronRight,
  LayoutCells,
} from '@gravity-ui/icons';

const SLASH_ITEMS = [
  { id: 'p', label: 'Texto', icon: Text, description: 'Párrafo de texto plano' },
  { id: 'h1', label: 'Título 1', icon: Heading1, description: 'Encabezado de sección grande' },
  { id: 'h2', label: 'Título 2', icon: Heading2, description: 'Encabezado de sección mediano' },
  { id: 'h3', label: 'Título 3', icon: Heading3, description: 'Encabezado de sección pequeño' },
  { id: 'ul', label: 'Lista con viñetas', icon: ListUl, description: 'Lista no ordenada simple' },
  { id: 'ol', label: 'Lista numerada', icon: ListOl, description: 'Lista ordenada con números' },
  { id: 'checklist', label: 'Lista de tareas', icon: SquareCheck, description: 'Lista de pendientes interactiva' },
  { id: 'blockquote', label: 'Cita', icon: QuoteOpen, description: 'Bloque destacado de cita' },
  { id: 'callout', label: 'Destacado', icon: QuoteOpen, description: 'Caja con fondo para notas importantes' },
  { id: 'code_block', label: 'Código', icon: Code, description: 'Bloque de código formateado' },
  { id: 'table', label: 'Tabla', icon: LayoutCells, description: 'Tabla con filas y columnas' },
  { id: 'hr', label: 'Separador', icon: Minus, description: 'Línea horizontal divisoria' },
  { id: 'spoiler', label: 'Spoiler / Desplegable', icon: ChevronRight, description: 'Contenido colapsable oculto' },
];

function normalizeSearch(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Detecta un disparador "/consulta" justo antes del cursor, al inicio del bloque
 * o tras un espacio (así "y/o", fechas 07/10 o URLs no abren el menú).
 */
function findTrigger(editor) {
  const { selection } = editor;
  if (!selection || !editor.api.isCollapsed()) return null;
  const entry = editor.api.block();
  if (!entry || entry[0].type === 'code_block') return null;
  const { path, offset } = selection.anchor;
  let leaf;
  try {
    leaf = editor.api.node(path)?.[0];
  } catch {
    return null;
  }
  if (typeof leaf?.text !== 'string') return null;
  const before = leaf.text.slice(0, offset);
  const match = before.match(/(^|\s)\/([\p{L}\p{N}]{0,24})$/u);
  if (!match) return null;
  const start = offset - match[2].length - 1;
  return { path, start, end: offset, query: match[2], key: `${path.join('.')}:${start}` };
}

function getEditable(editor) {
  try {
    return editor.api.toDOMNode(editor) || null;
  } catch {
    return null;
  }
}

export function BardoSlashMenu() {
  const editor = useEditorRef();
  const [, setFocusVersion] = useState(0);
  const triggerKey = useEditorSelector(ed => {
    const trigger = findTrigger(ed);
    return trigger ? `${trigger.key}|${trigger.query}` : '';
  }, []);
  const [dismissedKey, setDismissedKey] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);

  // Foco real del editable (no depende de eventos de foco del documento, que
  // no siempre llegan dentro del iframe de Discord).
  const editable = getEditable(editor);
  const focused = Boolean(editable && typeof document !== 'undefined' && editable.contains(document.activeElement));

  useEffect(() => {
    if (!editable) return undefined;
    const bump = () => setFocusVersion(version => version + 1);
    editable.addEventListener('focusin', bump);
    editable.addEventListener('focusout', bump);
    return () => {
      editable.removeEventListener('focusin', bump);
      editable.removeEventListener('focusout', bump);
    };
  }, [editable]);

  const trigger = triggerKey ? findTrigger(editor) : null;
  const query = trigger?.query || '';
  const isOpen = Boolean(trigger) && focused && dismissedKey !== trigger.key;

  const filteredItems = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return SLASH_ITEMS;
    return SLASH_ITEMS.filter(item =>
      normalizeSearch(item.label).includes(q) || normalizeSearch(item.description).includes(q) || item.id.includes(q)
    );
  }, [query]);

  // Reiniciar la selección cuando cambia la consulta.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, triggerKey]);

  const closeMenu = useCallback(() => {
    const current = findTrigger(editor);
    setDismissedKey(current?.key || '');
  }, [editor]);

  const handleSelect = useCallback((itemId) => {
    if (!editor) return;
    const current = findTrigger(editor);
    editor.tf.focus();
    if (current) {
      // Borrar solo "/consulta" del disparador, nunca otro texto.
      const range = {
        anchor: { path: current.path, offset: current.start },
        focus: { path: current.path, offset: current.end },
      };
      if (editor.api.string(range) === `/${current.query}`) {
        editor.tf.delete({ at: range });
      }
    }

    if (itemId === 'p' || itemId === 'h1' || itemId === 'h2' || itemId === 'h3') {
      setBlockType(editor, itemId);
    } else if (itemId === 'ul') {
      toggleBardoList(editor, 'disc');
    } else if (itemId === 'ol') {
      toggleBardoList(editor, 'decimal');
    } else if (itemId === 'checklist') {
      toggleChecklist(editor);
    } else if (itemId === 'blockquote') {
      setBlockType(editor, 'blockquote');
    } else if (itemId === 'callout') {
      insertBlock(editor, { type: 'callout', children: [{ text: 'Escribe una nota…' }] });
    } else if (itemId === 'code_block') {
      setBlockType(editor, 'code_block');
    } else if (itemId === 'table') {
      insertBlock(editor, {
        type: 'table',
        children: [
          {
            type: 'tr',
            children: [
              { type: 'th', children: [{ type: 'p', children: [{ text: 'Encabezado 1' }] }] },
              { type: 'th', children: [{ type: 'p', children: [{ text: 'Encabezado 2' }] }] },
            ],
          },
          {
            type: 'tr',
            children: [
              { type: 'td', children: [{ type: 'p', children: [{ text: 'Celda 1' }] }] },
              { type: 'td', children: [{ type: 'p', children: [{ text: 'Celda 2' }] }] },
            ],
          },
        ],
      });
    } else if (itemId === 'hr') {
      editor.tf.insertNodes([{ type: 'hr', children: [{ text: '' }] }, { type: 'p', children: [{ text: '' }] }], { select: true });
    } else if (itemId === 'spoiler') {
      insertBlock(editor, {
        type: 'toggle',
        summary: 'Detalles',
        children: [{ type: 'p', children: [{ text: 'Escribe contenido oculto…' }] }],
      });
    }
    setDismissedKey('');
  }, [editor]);

  // Posicionar el menú bajo el cursor (position: fixed → coordenadas de viewport).
  useLayoutEffect(() => {
    if (!isOpen) return;
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    const top = Math.min(rect.bottom + 8, window.innerHeight - 120);
    setCoords({ top: Math.max(8, top), left: Math.max(8, rect.left) });
  }, [isOpen, triggerKey]);

  // Teclado: solo mientras el menú está abierto y solo dentro del editable.
  useEffect(() => {
    if (!isOpen || !editor || !editable) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (!filteredItems[selectedIndex]) return;
        e.preventDefault();
        e.stopPropagation();
        handleSelect(filteredItems[selectedIndex].id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    };

    editable.addEventListener('keydown', handleKeyDown, true);
    return () => editable.removeEventListener('keydown', handleKeyDown, true);
  }, [closeMenu, editable, editor, filteredItems, handleSelect, isOpen, selectedIndex]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        closeMenu();
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [closeMenu, isOpen]);

  if (!isOpen || filteredItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Insertar bloque"
      className="fixed z-50 w-72 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-lg p-1.5 backdrop-blur-md"
      style={{
        top: `${coords.top}px`,
        left: `${Math.min(coords.left, window.innerWidth - 300)}px`,
      }}
    >
      <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 mb-1">
        Bloques básicos
      </div>
      <div className="flex flex-col gap-0.5">
        {filteredItems.map((item, index) => {
          const Icon = item.icon;
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
                isSelected ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-muted text-foreground'
              }`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(item.id)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-muted text-muted-foreground">
                <Icon width={14} height={14} />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="truncate leading-tight text-xs font-semibold">{item.label}</span>
                <span className="truncate text-[11px] text-muted-foreground">{item.description}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
