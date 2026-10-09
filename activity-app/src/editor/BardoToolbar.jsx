import { useMemo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useEditorRef, useEditorSelector } from 'platejs/react';
import {
  BLOCK_LABELS,
  currentBlockKind,
  insertBlock,
  insertDefaultTable,
  isInTable,
  runTableAction,
  setBlockType,
  toggleBardoList,
  toggleBlockquote,
  toggleChecklist,
} from './bardo-editor-commands.js';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/separator';
import {
  ArrowRotateLeft,
  ArrowUturnCcwLeft,
  ArrowUturnCwRight,
  Bold,
  ChevronDown,
  ChevronRight,
  CircleInfo,
  Code,
  Copy,
  EllipsisVertical,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  LayoutCells,
  Link,
  ListOl,
  ListUl,
  Minus,
  QuoteOpen,
  SquareCheck,
  Strikethrough,
  Text,
  Underline,
} from '@gravity-ui/icons';

const BLOCK_TYPES = [
  { id: 'p', label: BLOCK_LABELS.p, icon: Text, shortcut: '' },
  { id: 'h1', label: BLOCK_LABELS.h1, icon: Heading1, shortcut: '#' },
  { id: 'h2', label: BLOCK_LABELS.h2, icon: Heading2, shortcut: '##' },
  { id: 'h3', label: BLOCK_LABELS.h3, icon: Heading3, shortcut: '###' },
  { id: 'blockquote', label: BLOCK_LABELS.blockquote, icon: QuoteOpen, shortcut: '' },
  { id: 'code_block', label: BLOCK_LABELS.code_block, icon: Code, shortcut: '' },
];

// Orden de prioridad: en pantallas angostas las listas quedan a la vista
// antes que "Rehacer" o los formatos menos usados (que pasan a "Ver más").
const TOOLBAR_OPTIONAL_ACTIONS = [
  'insertUnorderedList',
  'insertOrderedList',
  'checklist',
  'italic',
  'createLink',
  'redo',
  'underline',
  'strikeThrough',
  'code',
  'blockquote',
];

const MARK_KEYS = ['bold', 'italic', 'underline', 'strikethrough', 'code'];
// Margen para redondeos de subpíxeles al medir.
const TOOLBAR_FIT_SAFETY_PX = 2;

/**
 * Ancho natural (sin estirar) de la barra con lo que hay a la vista: suma real
 * de cada grupo/control (offsetWidth no se ve afectado por la animación de
 * entrada con scale) más los huecos entre grupos.
 */
function measureNaturalToolbarWidth(toolbar) {
  // El selector de tipo de texto se estira (flex 1) para llenar la barra: se
  // mide sin estirar. Sin transición, o el cambio de flex se animaría (el botón
  // tiene transition-all) y la medida saldría con el ancho anterior.
  const leading = toolbar.querySelector('.mobile-toolbar-leading');
  const previousFlex = leading ? leading.style.flex : '';
  const previousTransition = leading ? leading.style.transition : '';
  if (leading) {
    leading.style.transition = 'none';
    leading.style.flex = '0 0 auto';
  }
  const style = getComputedStyle(toolbar);
  const gap = parseFloat(style.columnGap) || 0;
  const items = [...toolbar.children].filter(el => getComputedStyle(el).display !== 'none' && el.offsetWidth > 0);
  const total = items.reduce((sum, el) => {
    const itemStyle = getComputedStyle(el);
    return sum + el.offsetWidth + (parseFloat(itemStyle.marginLeft) || 0) + (parseFloat(itemStyle.marginRight) || 0);
  }, 0) + gap * Math.max(0, items.length - 1);
  if (leading) {
    leading.style.flex = previousFlex;
    void leading.offsetWidth;
    leading.style.transition = previousTransition;
  }
  return {total, gap};
}

/** Ancho disponible para la barra: el del contenedor sticky menos bordes y padding del contenedor. */
function measureAvailableToolbarWidth(container) {
  const host = container.parentElement;
  const style = getComputedStyle(container);
  const chrome = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
    + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
  return Math.floor((host?.clientWidth || container.clientWidth) - chrome);
}

/**
 * Barra adaptable medida de verdad: muestra el mayor prefijo de acciones
 * opcionales que cabe. Tras cada render compara el ancho natural real (con
 * huecos entre grupos, grupos que aparecen, menú de tabla, fuentes) con el
 * disponible: si desborda quita una; si sobra al menos un control más su hueco,
 * prueba con una más y, si desbordó, la recuerda como tope para ese ancho.
 */
function useAdaptiveToolbar(containerRef, contentKey = '') {
  const [count, setCount] = useState(0);
  const [, setMeasureTick] = useState(0);
  // Tope aprendido: {count, width, key} = con `count` acciones no cabe en
  // `width` px mientras los controles fijos (`key`: tabla, tipo de texto) no cambien.
  const ceilingRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const toolbar = container?.querySelector('[role="toolbar"]');
    if (!container || !toolbar) return;
    const available = measureAvailableToolbarWidth(container);
    const {total, gap} = measureNaturalToolbarWidth(toolbar);

    if (total + TOOLBAR_FIT_SAFETY_PX > available) {
      if (count > 0) {
        ceilingRef.current = {count, width: available, key: contentKey};
        setCount(count - 1);
      }
      return;
    }
    if (count >= TOOLBAR_OPTIONAL_ACTIONS.length) return;
    const ceiling = ceilingRef.current;
    if (ceiling && ceiling.key === contentKey && ceiling.count <= count + 1 && available <= ceiling.width) return;
    const bold = toolbar.querySelector('[aria-label="Negrita"]');
    const step = (bold?.offsetWidth || 36) + gap;
    if (total + step + TOOLBAR_FIT_SAFETY_PX <= available) setCount(count + 1);
  });

  // Cambios de ancho (rotación, panel lateral, fuentes que terminan de cargar).
  useLayoutEffect(() => {
    const container = containerRef.current;
    const host = container?.parentElement;
    if (!container || !host) return undefined;
    let lastWidth = host.clientWidth;
    const remeasure = () => {
      if (host.clientWidth > lastWidth) ceilingRef.current = null;
      lastWidth = host.clientWidth;
      setMeasureTick(tick => tick + 1);
    };
    const observer = new ResizeObserver(remeasure);
    observer.observe(host);
    const toolbar = container.querySelector('[role="toolbar"]');
    if (toolbar) [...toolbar.children].forEach(child => observer.observe(child));
    window.addEventListener('resize', remeasure);
    document.fonts?.ready?.then?.(remeasure).catch?.(() => {});
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', remeasure);
    };
  }, [containerRef]);

  return useMemo(() => new Set(TOOLBAR_OPTIONAL_ACTIONS.slice(0, count)), [count]);
}

/**
 * Al elegir una opción de un menú de la barra, el foco vuelve al texto (o al
 * diálogo que la opción abre, p. ej. "Enlace"), no al botón del menú: Radix lo
 * devolvía al disparador y competía con el foco del editor o del diálogo.
 * Cerrar con Escape sigue devolviendo el foco al botón.
 */
function useMenuSelectionFocus() {
  const editor = useEditorRef();
  const selectionRef = useRef(null);
  const markSelected = useCallback((target = 'editor') => {
    selectionRef.current = target;
  }, []);
  const onCloseAutoFocus = useCallback((event) => {
    const target = selectionRef.current;
    selectionRef.current = null;
    if (!target) return;
    event.preventDefault();
    if (target !== 'editor') return;
    const active = document.activeElement;
    if (!active || active === document.body || active.closest?.('[role="menu"]')) {
      try { editor?.tf.focus(); } catch { /* el editor ya no está montado */ }
    }
  }, [editor]);
  return { markSelected, onCloseAutoFocus };
}

export function BlockTypeDropdown({ value, onSelect }) {
  const current = BLOCK_TYPES.find(b => b.id === value) || BLOCK_TYPES[0];
  const CurrentIcon = current.icon;
  const { markSelected, onCloseAutoFocus } = useMenuSelectionFocus();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Tipo de texto: ${current.label}`}
            variant="ghost"
            size="sm"
            className="mobile-toolbar-leading mobile-toolbar-leading-trigger gap-1.5 font-medium rounded-full px-2.5 inline-flex items-center justify-between shrink-0"
          >
            <CurrentIcon width={15} height={15} className="mobile-toolbar-icon shrink-0" aria-hidden="true" />
            <span className="mobile-toolbar-label truncate text-xs">{current.label}</span>
            <ChevronDown width={13} height={13} className="opacity-70 shrink-0" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="toolbar-dropdown-popover w-52 p-1" onCloseAutoFocus={onCloseAutoFocus}>
        <div className="max-h-60 overflow-y-auto overscroll-contain pr-0.5">
          <DropdownMenuGroup>
            {BLOCK_TYPES.map(item => {
              const ItemIcon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => {
                    markSelected();
                    onSelect(item.id);
                  }}
                >
                  <ItemIcon width={16} height={16} />
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <Kbd className="ml-auto">{item.shortcut}</Kbd>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const TABLE_ACTIONS = [
  { id: 'row-below', label: 'Agregar fila abajo' },
  { id: 'row-above', label: 'Agregar fila arriba' },
  { id: 'column-right', label: 'Agregar columna a la derecha' },
  { id: 'column-left', label: 'Agregar columna a la izquierda' },
  { id: 'delete-row', label: 'Eliminar fila', destructive: true },
  { id: 'delete-column', label: 'Eliminar columna', destructive: true },
  { id: 'delete-table', label: 'Eliminar tabla', destructive: true },
];

/** Menú de tabla: aparece en la barra solo cuando el cursor está en una tabla. */
export function TableActionsMenu({ onAction }) {
  const { markSelected, onCloseAutoFocus } = useMenuSelectionFocus();
  const select = id => {
    markSelected();
    onAction(id);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            aria-label="Opciones de tabla"
            title="Opciones de tabla"
            variant="ghost"
            className="rounded-full relative shrink-0"
          >
            <LayoutCells width={15} height={15} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="toolbar-dropdown-popover w-60" onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuGroup>
          {TABLE_ACTIONS.filter(action => !action.destructive).map(action => (
            <DropdownMenuItem key={action.id} onClick={() => select(action.id)}>
              <span>{action.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {TABLE_ACTIONS.filter(action => action.destructive).map(action => (
            <DropdownMenuItem key={action.id} variant="destructive" onClick={() => select(action.id)}>
              <span>{action.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Acciones de "Ver más" que abren un diálogo (el foco va a él, no al editor).
const DIALOG_ACTIONS = new Set(['createLink']);

export function MoreActionsMenu({ onAction, visibleActions }) {
  const { markSelected, onCloseAutoFocus } = useMenuSelectionFocus();
  const handleAction = key => {
    markSelected(DIALOG_ACTIONS.has(key) ? 'dialog' : 'editor');
    onAction(key);
  };
  const isHidden = action => !visibleActions.has(action);
  const showInline = ['strikeThrough', 'code', 'italic', 'underline', 'createLink'].some(isHidden);
  const showLists = ['insertUnorderedList', 'insertOrderedList', 'checklist', 'blockquote'].some(isHidden);
  const showRedo = isHidden('redo');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            aria-label="Ver más"
            variant="ghost"
            className="mobile-more-trigger rounded-full relative shrink-0"
          >
            <EllipsisVertical width={15} height={15} />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        className="toolbar-dropdown-popover scrollbar overflow-y-auto overscroll-contain w-56"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {showInline && (
          <DropdownMenuGroup>
            {isHidden('strikeThrough') && (
              <DropdownMenuItem onClick={() => handleAction('strikeThrough')}>
                <Strikethrough width={16} height={16} />
                <span>Tachado</span>
              </DropdownMenuItem>
            )}
            {isHidden('code') && (
              <DropdownMenuItem onClick={() => handleAction('code')}>
                <Code width={16} height={16} />
                <span>Código en línea</span>
              </DropdownMenuItem>
            )}
            {isHidden('italic') && (
              <DropdownMenuItem onClick={() => handleAction('italic')}>
                <Italic width={16} height={16} />
                <span>Cursiva</span>
              </DropdownMenuItem>
            )}
            {isHidden('underline') && (
              <DropdownMenuItem onClick={() => handleAction('underline')}>
                <Underline width={16} height={16} />
                <span>Subrayado</span>
              </DropdownMenuItem>
            )}
            {isHidden('createLink') && (
              <DropdownMenuItem onClick={() => handleAction('createLink')}>
                <Link width={16} height={16} />
                <span>Enlace</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        )}
        {showInline && showLists && <DropdownMenuSeparator />}
        {showLists && (
          <DropdownMenuGroup>
            {isHidden('insertUnorderedList') && (
              <DropdownMenuItem onClick={() => handleAction('insertUnorderedList')}>
                <ListUl width={16} height={16} />
                <span>{BLOCK_LABELS.ul}</span>
              </DropdownMenuItem>
            )}
            {isHidden('insertOrderedList') && (
              <DropdownMenuItem onClick={() => handleAction('insertOrderedList')}>
                <ListOl width={16} height={16} />
                <span>{BLOCK_LABELS.ol}</span>
              </DropdownMenuItem>
            )}
            {isHidden('checklist') && (
              <DropdownMenuItem onClick={() => handleAction('checklist')}>
                <SquareCheck width={16} height={16} />
                <span>{BLOCK_LABELS.checklist}</span>
              </DropdownMenuItem>
            )}
            {isHidden('blockquote') && (
              <DropdownMenuItem onClick={() => handleAction('blockquote')}>
                <QuoteOpen width={16} height={16} />
                <span>{BLOCK_LABELS.blockquote}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        )}
        {(showInline || showLists) && <DropdownMenuSeparator />}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => handleAction('table')}>
            <LayoutCells width={16} height={16} />
            <span>{BLOCK_LABELS.table}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction('callout')}>
            <CircleInfo width={16} height={16} />
            <span>{BLOCK_LABELS.callout}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction('spoiler')}>
            <ChevronRight width={16} height={16} />
            <span>{BLOCK_LABELS.spoiler}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction('hr')}>
            <Minus width={16} height={16} />
            <span>{BLOCK_LABELS.hr}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {showRedo && (
            <DropdownMenuItem onClick={() => handleAction('redo')}>
              <ArrowUturnCwRight width={16} height={16} />
              <span>Rehacer</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => handleAction('copyAll')}>
            <Copy width={16} height={16} />
            <span>Copiar texto</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction('removeFormat')}>
            <ArrowRotateLeft width={16} height={16} />
            <span>Limpiar formato</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BardoToolbar({ toolbarContainerRef, onOpenLink, onCopyAll, onRemoveFormat }) {
  const editor = useEditorRef();
  // Estado del editor derivado del valor Y de la selección (useEditorSelector se
  // recalcula con cada cambio): p. ej. cambiar a "Título 2" sin mover el cursor
  // actualiza el selector de tipo de texto al instante.
  const inTable = useEditorSelector(ed => isInTable(ed), []);
  const blockType = useEditorSelector(ed => currentBlockKind(ed), []);
  const marksKey = useEditorSelector(ed => {
    if (!ed.selection) return '';
    const active = ed.api.marks() || {};
    return MARK_KEYS.filter(key => active[key]).join('|');
  }, []);
  const visibleToolbarActions = useAdaptiveToolbar(toolbarContainerRef, `${inTable ? 'table' : ''}|${blockType}`);

  const isToolbarActionVisible = useCallback(
    action => visibleToolbarActions.has(action),
    [visibleToolbarActions]
  );

  const visibleStyleActions = useMemo(
    () => ['italic', 'underline', 'strikeThrough', 'code'].filter(isToolbarActionVisible),
    [isToolbarActionVisible]
  );
  const visibleListActions = useMemo(
    () => ['insertUnorderedList', 'insertOrderedList', 'checklist', 'blockquote'].filter(isToolbarActionVisible),
    [isToolbarActionVisible]
  );
  const showRedo = isToolbarActionVisible('redo');
  const showLink = isToolbarActionVisible('createLink');
  const lastVisibleStyleAction = visibleStyleActions.at(-1);
  const lastVisibleListAction = visibleListActions.at(-1);
  const isFullToolbar = visibleToolbarActions.size === TOOLBAR_OPTIONAL_ACTIONS.length;

  const marks = useMemo(
    () => Object.fromEntries(marksKey.split('|').filter(Boolean).map(key => [key, true])),
    [marksKey]
  );

  // Manejo de comandos del editor Plate
  const runFormat = useCallback(
    (format) => {
      if (!editor) return;
      editor.tf.focus();

      if (format === 'bold') {
        editor.tf.toggleMark('bold');
      } else if (format === 'italic') {
        editor.tf.toggleMark('italic');
      } else if (format === 'underline') {
        editor.tf.toggleMark('underline');
      } else if (format === 'strikeThrough') {
        editor.tf.toggleMark('strikethrough');
      } else if (format === 'code') {
        editor.tf.toggleMark('code');
      } else if (format === 'createLink') {
        onOpenLink?.();
      } else if (format === 'insertUnorderedList') {
        toggleBardoList(editor, 'disc');
      } else if (format === 'insertOrderedList') {
        toggleBardoList(editor, 'decimal');
      } else if (format === 'checklist') {
        toggleChecklist(editor);
      } else if (format === 'blockquote') {
        toggleBlockquote(editor);
      } else if (format === 'table') {
        insertDefaultTable(editor);
      } else if (format === 'callout') {
        insertBlock(editor, { type: 'callout', children: [{ text: 'Escribe una nota…' }] });
      } else if (format === 'spoiler') {
        insertBlock(editor, {
          type: 'toggle',
          summary: 'Detalles',
          children: [{ type: 'p', children: [{ text: 'Escribe contenido oculto…' }] }],
        });
      } else if (format === 'hr') {
        editor.tf.insertNodes([{ type: 'hr', children: [{ text: '' }] }, { type: 'p', children: [{ text: '' }] }], { select: true });
      } else if (format === 'insertPre' || format === 'code_block') {
        setBlockType(editor, 'code_block');
      }
    },
    [editor, onOpenLink]
  );

  const handleBlockSelect = useCallback(
    (key) => {
      if (!editor) return;
      editor.tf.focus();

      if (['p', 'h1', 'h2', 'h3', 'blockquote', 'code_block'].includes(key)) {
        setBlockType(editor, key);
      } else {
        runFormat(key);
      }
    },
    [editor, runFormat]
  );

  const handleMoreAction = useCallback(
    (action) => {
      if (action === 'copyAll') {
        onCopyAll?.();
      } else if (action === 'removeFormat') {
        onRemoveFormat?.();
      } else if (action === 'redo') {
        editor?.redo();
      } else {
        runFormat(action);
      }
    },
    [editor, onCopyAll, onRemoveFormat, runFormat]
  );

  const handleTableAction = useCallback(
    (action) => {
      if (!editor) return;
      editor.tf.focus();
      runTableAction(editor, action);
    },
    [editor]
  );

  const handleUndo = useCallback(() => {
    editor?.undo();
  }, [editor]);

  const handleRedo = useCallback(() => {
    editor?.redo();
  }, [editor]);

  const selectedInlineKeys = useMemo(() => {
    const keys = new Set();
    if (marks.bold) keys.add('bold');
    if (marks.italic) keys.add('italic');
    if (marks.underline) keys.add('underline');
    if (marks.strikethrough) keys.add('strikeThrough');
    if (marks.code) keys.add('code');
    return keys;
  }, [marks]);

  const selectedListKeys = useMemo(() => {
    const keys = new Set();
    if (blockType === 'insertUnorderedList') keys.add('insertUnorderedList');
    if (blockType === 'insertOrderedList') keys.add('insertOrderedList');
    if (blockType === 'checklist') keys.add('checklist');
    if (blockType === 'blockquote') keys.add('blockquote');
    return keys;
  }, [blockType]);

  const canUndo = Boolean(editor?.history?.undos?.length);
  const canRedo = Boolean(editor?.history?.redos?.length);

  return (
    <div
      ref={toolbarContainerRef}
      className={`editor-toolbar-container ${isFullToolbar ? 'editor-toolbar-container-full' : ''}`}
    >
      <div
        role="toolbar"
        aria-label="Barra de herramientas del editor"
        className="toolbar flex items-center justify-between gap-1 sm:gap-1.5 flex-nowrap w-full min-w-0"
      >
        <BlockTypeDropdown value={blockType} onSelect={handleBlockSelect} />

        <ButtonGroup
          aria-label="Historial de edición"
          className={`mobile-history-group shrink-0 ${showRedo ? '' : 'toolbar-group-standalone'}`}
        >
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Deshacer"
            title="Deshacer (⌘/Ctrl+Z)"
            onClick={handleUndo}
            disabled={!canUndo}
            className="rounded-full"
          >
            <ArrowUturnCcwLeft width={15} height={15} />
          </Button>
          {/* Solo se renderiza si cabe: un control oculto dentro del grupo
              rompería el redondeado del que queda a la vista. */}
          {showRedo && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Rehacer"
              title="Rehacer (⌘/Ctrl+Y)"
              onClick={handleRedo}
              disabled={!canRedo}
              className="rounded-full"
            >
              <ArrowUturnCwRight width={15} height={15} />
            </Button>
          )}
        </ButtonGroup>

        <ToggleGroup
          type="multiple"
          aria-label="Estilos de texto"
          value={Array.from(selectedInlineKeys)}
          className={`shrink-0 ${visibleStyleActions.length ? '' : 'toolbar-group-standalone'}`}
        >
          <ToggleGroupItem
            value="bold"
            aria-label="Negrita"
            title="Negrita (⌘/Ctrl+B)"
            onClick={() => runFormat('bold')}
            data-state={marks.bold ? 'on' : 'off'}
          >
            <Bold width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="italic"
            aria-label="Cursiva"
            title="Cursiva (⌘/Ctrl+I)"
            onClick={() => runFormat('italic')}
            data-state={marks.italic ? 'on' : 'off'}
            className={`${isToolbarActionVisible('italic') ? '' : 'toolbar-control-overflowed'} ${lastVisibleStyleAction === 'italic' ? 'toolbar-last-visible' : ''}`}
          >
            <Italic width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="underline"
            aria-label="Subrayado"
            title="Subrayado (⌘/Ctrl+U)"
            onClick={() => runFormat('underline')}
            data-state={marks.underline ? 'on' : 'off'}
            className={`${isToolbarActionVisible('underline') ? '' : 'toolbar-control-overflowed'} ${lastVisibleStyleAction === 'underline' ? 'toolbar-last-visible' : ''}`}
          >
            <Underline width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="strikeThrough"
            aria-label="Tachado"
            title="Tachado"
            onClick={() => runFormat('strikeThrough')}
            data-state={marks.strikethrough ? 'on' : 'off'}
            className={`${isToolbarActionVisible('strikeThrough') ? '' : 'toolbar-control-overflowed'} ${lastVisibleStyleAction === 'strikeThrough' ? 'toolbar-last-visible' : ''}`}
          >
            <Strikethrough width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="code"
            aria-label="Código en línea"
            title="Código en línea (⌘/Ctrl+E)"
            onClick={() => runFormat('code')}
            data-state={marks.code ? 'on' : 'off'}
            className={`${isToolbarActionVisible('code') ? '' : 'toolbar-control-overflowed'} ${lastVisibleStyleAction === 'code' ? 'toolbar-last-visible' : ''}`}
          >
            <Code width={15} height={15} />
          </ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup
          type="single"
          aria-label="Listas y bloques"
          value={Array.from(selectedListKeys)[0] || ''}
          className={`toolbar-list-group shrink-0 ${visibleListActions.length ? '' : 'toolbar-control-overflowed'} ${visibleListActions.length === 1 ? 'toolbar-group-standalone' : ''}`}
        >
          <ToggleGroupItem
            value="insertUnorderedList"
            aria-label={BLOCK_LABELS.ul}
            title={BLOCK_LABELS.ul}
            onClick={() => runFormat('insertUnorderedList')}
            data-state={blockType === 'insertUnorderedList' ? 'on' : 'off'}
            className={`${isToolbarActionVisible('insertUnorderedList') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'insertUnorderedList' ? 'toolbar-last-visible' : ''}`}
          >
            <ListUl width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="insertOrderedList"
            aria-label={BLOCK_LABELS.ol}
            title={BLOCK_LABELS.ol}
            onClick={() => runFormat('insertOrderedList')}
            data-state={blockType === 'insertOrderedList' ? 'on' : 'off'}
            className={`${isToolbarActionVisible('insertOrderedList') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'insertOrderedList' ? 'toolbar-last-visible' : ''}`}
          >
            <ListOl width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="checklist"
            aria-label={BLOCK_LABELS.checklist}
            title={BLOCK_LABELS.checklist}
            onClick={() => runFormat('checklist')}
            data-state={blockType === 'checklist' ? 'on' : 'off'}
            className={`${isToolbarActionVisible('checklist') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'checklist' ? 'toolbar-last-visible' : ''}`}
          >
            <SquareCheck width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="blockquote"
            aria-label={BLOCK_LABELS.blockquote}
            title={BLOCK_LABELS.blockquote}
            onClick={() => runFormat('blockquote')}
            data-state={blockType === 'blockquote' ? 'on' : 'off'}
            className={`${isToolbarActionVisible('blockquote') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'blockquote' ? 'toolbar-last-visible' : ''}`}
          >
            <QuoteOpen width={15} height={15} />
          </ToggleGroupItem>
        </ToggleGroup>

        <ButtonGroup
          className={`mobile-actions-group shrink-0 ${!showLink && !inTable ? 'toolbar-group-standalone' : ''}`}
        >
          {showLink && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Enlace"
              title="Enlace (⌘/Ctrl+K)"
              onClick={() => runFormat('createLink')}
              className="rounded-full"
            >
              <Link width={15} height={15} />
            </Button>
          )}
          {inTable && <TableActionsMenu onAction={handleTableAction} />}
          <MoreActionsMenu
            onAction={handleMoreAction}
            visibleActions={visibleToolbarActions}
          />
        </ButtonGroup>
      </div>
    </div>
  );
}
