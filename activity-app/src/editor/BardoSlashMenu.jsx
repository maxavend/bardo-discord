import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorRef } from 'platejs/react';
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

export function BardoSlashMenu() {
  const editor = useEditorRef();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);

  const filteredItems = SLASH_ITEMS.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.description.toLowerCase().includes(query.toLowerCase())
  );

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const handleSelect = useCallback((itemId) => {
    if (!editor) return;
    editor.tf.focus();

    // Eliminar el caracter '/' escrito
    editor.tf.delete({ unit: 'character', reverse: true });

    if (itemId === 'p') {
      editor.tf.setNodes({ type: 'p' });
    } else if (itemId === 'h1') {
      editor.tf.setNodes({ type: 'h1' });
    } else if (itemId === 'h2') {
      editor.tf.setNodes({ type: 'h2' });
    } else if (itemId === 'h3') {
      editor.tf.setNodes({ type: 'h3' });
    } else if (itemId === 'ul') {
      editor.tf.setNodes({ type: 'p' });
      editor.tf.wrapNodes({ type: 'ul', children: [] });
      editor.tf.wrapNodes({ type: 'li', children: [] });
      editor.tf.wrapNodes({ type: 'lic', children: [] });
    } else if (itemId === 'ol') {
      editor.tf.setNodes({ type: 'p' });
      editor.tf.wrapNodes({ type: 'ol', children: [] });
      editor.tf.wrapNodes({ type: 'li', children: [] });
      editor.tf.wrapNodes({ type: 'lic', children: [] });
    } else if (itemId === 'checklist') {
      editor.tf.setNodes({ type: 'action_item', checked: false });
    } else if (itemId === 'blockquote') {
      editor.tf.setNodes({ type: 'blockquote' });
    } else if (itemId === 'callout') {
      editor.tf.insertNodes({ type: 'callout', children: [{ text: 'Escribe una nota…' }] });
    } else if (itemId === 'code_block') {
      editor.tf.insertNodes({ type: 'code_block', children: [{ text: '' }] });
    } else if (itemId === 'table') {
      editor.tf.insertNodes({
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
      editor.tf.insertNodes([{ type: 'hr', children: [{ text: '' }] }, { type: 'p', children: [{ text: '' }] }]);
    } else if (itemId === 'spoiler') {
      editor.tf.insertNodes({
        type: 'toggle',
        summary: 'Detalles',
        children: [{ type: 'p', children: [{ text: 'Escribe contenido oculto…' }] }],
      });
    }

    closeMenu();
  }, [closeMenu, editor]);

  // Listener para detectar trigger '/' en el editor
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e) => {
      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            handleSelect(filteredItems[selectedIndex].id);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMenu();
          return;
        }
      }

      if (e.key === '/' && !isOpen) {
        const domSelection = window.getSelection();
        if (domSelection && domSelection.rangeCount > 0) {
          const range = domSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setCoords({
            top: rect.bottom + window.scrollY + 8,
            left: rect.left + window.scrollX,
          });
          setIsOpen(true);
          setQuery('');
          setSelectedIndex(0);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [closeMenu, editor, filteredItems, handleSelect, isOpen, selectedIndex]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!isOpen) return;
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
