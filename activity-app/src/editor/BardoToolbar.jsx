import { useMemo, useCallback, useLayoutEffect, useState } from 'react';
import { useEditorSelection, useEditorRef } from 'platejs/react';
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
  Code,
  Copy,
  EllipsisVertical,
  Heading1,
  Heading2,
  Heading3,
  Italic,
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
  { id: 'p', label: 'Texto', icon: Text, shortcut: '', hint: 'Empieza a escribir texto plano' },
  { id: 'h1', label: 'Encabezado 1', icon: Heading1, shortcut: '#', hint: 'Título de sección principal' },
  { id: 'h2', label: 'Encabezado 2', icon: Heading2, shortcut: '##', hint: 'Subtítulo mediano' },
  { id: 'h3', label: 'Encabezado 3', icon: Heading3, shortcut: '###', hint: 'Subtítulo pequeño' },
  { id: 'blockquote', label: 'Cita', icon: QuoteOpen, shortcut: '', hint: 'Destaca una cita o referencia' },
  { id: 'code_block', label: 'Bloque de código', icon: Code, shortcut: '', hint: 'Escribe código con formato monoespaciado' },
];

const TOOLBAR_OPTIONAL_ACTIONS = [
  ['redo', 36, 40],
  ['italic', 36, 40],
  ['underline', 36, 40],
  ['createLink', 36, 40],
  ['strikeThrough', 36, 40],
  ['code', 36, 40],
  ['insertUnorderedList', 36, 40],
  ['insertOrderedList', 36, 40],
  ['checklist', 36, 40],
  ['blockquote', 36, 40],
];

const TOOLBAR_ACTION_KEYS = TOOLBAR_OPTIONAL_ACTIONS.map(([action]) => action);

function useAdaptiveToolbar(containerRef) {
  const [visibleActions, setVisibleActions] = useState(() => new Set());

  useLayoutEffect(() => {
    const container = containerRef.current;
    const host = container?.parentElement;
    if (!container || !host) return undefined;

    const update = () => {
      const availableWidth = host.getBoundingClientRect().width;
      const usableWidth = Math.floor(availableWidth) - 24;
      const usesTouchSizedControls = window.matchMedia('(max-width: 759px)').matches;
      const next = new Set();

      let usedWidth = usesTouchSizedControls ? 220 : 196;
      TOOLBAR_OPTIONAL_ACTIONS.forEach(([action, regularWidth, touchWidth]) => {
        const incrementalWidth = usesTouchSizedControls ? touchWidth : regularWidth;
        if (usedWidth + incrementalWidth <= usableWidth) {
          next.add(action);
          usedWidth += incrementalWidth;
        }
      });

      setVisibleActions(previous => {
        const previousKey = TOOLBAR_ACTION_KEYS.filter(action => previous.has(action)).join('|');
        const nextKey = TOOLBAR_ACTION_KEYS.filter(action => next.has(action)).join('|');
        return previousKey === nextKey ? previous : next;
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [containerRef]);

  return visibleActions;
}

export function BlockTypeDropdown({ value, onSelect }) {
  const current = BLOCK_TYPES.find(b => b.id === value) || BLOCK_TYPES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Tipo de texto"
            variant="ghost"
            size="sm"
            className="mobile-toolbar-leading mobile-toolbar-leading-trigger gap-1.5 font-medium rounded-full px-2.5 inline-flex items-center justify-between shrink-0"
          >
            <span className="mobile-toolbar-label truncate text-xs">{current.label}</span>
            <ChevronDown width={13} height={13} className="opacity-70 shrink-0" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="toolbar-dropdown-popover w-52 p-1">
        <div className="max-h-60 overflow-y-auto overscroll-contain pr-0.5">
          <DropdownMenuGroup>
            {BLOCK_TYPES.map(item => {
              const ItemIcon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onSelect(item.id)}
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

export function MoreActionsMenu({ onAction, visibleActions }) {
  const handleAction = key => onAction(key);
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
                <span>Lista con viñetas</span>
              </DropdownMenuItem>
            )}
            {isHidden('insertOrderedList') && (
              <DropdownMenuItem onClick={() => handleAction('insertOrderedList')}>
                <ListOl width={16} height={16} />
                <span>Lista numerada</span>
              </DropdownMenuItem>
            )}
            {isHidden('checklist') && (
              <DropdownMenuItem onClick={() => handleAction('checklist')}>
                <SquareCheck width={16} height={16} />
                <span>Lista de tareas</span>
              </DropdownMenuItem>
            )}
            {isHidden('blockquote') && (
              <DropdownMenuItem onClick={() => handleAction('blockquote')}>
                <QuoteOpen width={16} height={16} />
                <span>Cita</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        )}
        {(showInline || showLists) && <DropdownMenuSeparator />}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => handleAction('callout')}>
            <QuoteOpen width={16} height={16} />
            <span>Destacado</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction('spoiler')}>
            <ChevronRight width={16} height={16} />
            <span>Lista desplegable</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction('hr')}>
            <Minus width={16} height={16} />
            <span>Separador</span>
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
  const selection = useEditorSelection();
  const visibleToolbarActions = useAdaptiveToolbar(toolbarContainerRef);

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
  const lastVisibleStyleAction = visibleStyleActions.at(-1);
  const lastVisibleListAction = visibleListActions.at(-1);
  const isFullToolbar = visibleToolbarActions.size === TOOLBAR_OPTIONAL_ACTIONS.length;

  // Inspección del estado actual del editor para marks y bloques
  const marks = useMemo(() => {
    if (!editor || !editor.selection) return {};
    return editor.api.marks() || {};
  }, [editor, selection]);

  const blockType = useMemo(() => {
    if (!editor || !editor.selection) return 'p';
    try {
      const entry = editor.api.block();
      if (!entry) return 'p';
      const [node] = entry;
      const type = node?.type || 'p';
      if (['p', 'h1', 'h2', 'h3', 'blockquote', 'code_block', 'action_item', 'callout', 'toggle', 'ul', 'ol', 'li'].includes(type)) {
        if (type === 'action_item') return 'checklist';
        if (type === 'li') {
          const parent = editor.api.parent(entry[1]);
          return parent?.[0]?.type === 'ol' ? 'insertOrderedList' : 'insertUnorderedList';
        }
        return type;
      }
      return 'p';
    } catch {
      return 'p';
    }
  }, [editor, selection]);

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
        if (blockType === 'insertUnorderedList') {
          editor.tf.setNodes({ type: 'p' });
        } else {
          editor.tf.setNodes({ type: 'p' });
          editor.tf.wrapNodes({ type: 'ul', children: [] });
          editor.tf.wrapNodes({ type: 'li', children: [] });
          editor.tf.wrapNodes({ type: 'lic', children: [] });
        }
      } else if (format === 'insertOrderedList') {
        if (blockType === 'insertOrderedList') {
          editor.tf.setNodes({ type: 'p' });
        } else {
          editor.tf.setNodes({ type: 'p' });
          editor.tf.wrapNodes({ type: 'ol', children: [] });
          editor.tf.wrapNodes({ type: 'li', children: [] });
          editor.tf.wrapNodes({ type: 'lic', children: [] });
        }
      } else if (format === 'checklist') {
        if (blockType === 'checklist') {
          editor.tf.setNodes({ type: 'p', checked: undefined });
        } else {
          editor.tf.setNodes({ type: 'action_item', checked: false });
        }
      } else if (format === 'blockquote') {
        if (blockType === 'blockquote') {
          editor.tf.setNodes({ type: 'p' });
        } else {
          editor.tf.setNodes({ type: 'blockquote' });
        }
      } else if (format === 'callout') {
        editor.tf.insertNodes({ type: 'callout', children: [{ text: 'Escribe una nota…' }] });
      } else if (format === 'spoiler') {
        editor.tf.insertNodes({
          type: 'toggle',
          summary: 'Detalles',
          children: [{ type: 'p', children: [{ text: 'Escribe contenido oculto…' }] }],
        });
      } else if (format === 'hr') {
        editor.tf.insertNodes([{ type: 'hr', children: [{ text: '' }] }, { type: 'p', children: [{ text: '' }] }]);
      } else if (format === 'insertPre' || format === 'code_block') {
        editor.tf.insertNodes({ type: 'code_block', children: [{ text: '' }] });
      }
    },
    [blockType, editor, onOpenLink]
  );

  const handleBlockSelect = useCallback(
    (key) => {
      if (!editor) return;
      editor.tf.focus();

      if (['p', 'h1', 'h2', 'h3', 'blockquote', 'code_block'].includes(key)) {
        editor.tf.setNodes({ type: key });
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
        aria-label="Editor toolbar"
        className="toolbar flex items-center justify-between gap-1 sm:gap-1.5 flex-nowrap w-full min-w-0"
      >
        <BlockTypeDropdown value={blockType} onSelect={handleBlockSelect} />

        <ButtonGroup
          aria-label="Historial de edición"
          className={`mobile-history-group shrink-0 ${isToolbarActionVisible('redo') ? '' : 'toolbar-group-standalone'}`}
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
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Rehacer"
            title="Rehacer (⌘/Ctrl+Y)"
            onClick={handleRedo}
            disabled={!canRedo}
            className={`rounded-full ${isToolbarActionVisible('redo') ? '' : 'toolbar-control-overflowed'}`}
          >
            <ArrowUturnCwRight width={15} height={15} />
          </Button>
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
            aria-label="Lista con viñetas"
            title="Lista con viñetas"
            onClick={() => runFormat('insertUnorderedList')}
            data-state={blockType === 'insertUnorderedList' ? 'on' : 'off'}
            className={`${isToolbarActionVisible('insertUnorderedList') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'insertUnorderedList' ? 'toolbar-last-visible' : ''}`}
          >
            <ListUl width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="insertOrderedList"
            aria-label="Lista numerada"
            title="Lista numerada"
            onClick={() => runFormat('insertOrderedList')}
            data-state={blockType === 'insertOrderedList' ? 'on' : 'off'}
            className={`${isToolbarActionVisible('insertOrderedList') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'insertOrderedList' ? 'toolbar-last-visible' : ''}`}
          >
            <ListOl width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="checklist"
            aria-label="Lista de tareas"
            title="Lista de tareas"
            onClick={() => runFormat('checklist')}
            data-state={blockType === 'checklist' ? 'on' : 'off'}
            className={`${isToolbarActionVisible('checklist') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'checklist' ? 'toolbar-last-visible' : ''}`}
          >
            <SquareCheck width={15} height={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="blockquote"
            aria-label="Cita"
            title="Cita"
            onClick={() => runFormat('blockquote')}
            data-state={blockType === 'blockquote' ? 'on' : 'off'}
            className={`${isToolbarActionVisible('blockquote') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'blockquote' ? 'toolbar-last-visible' : ''}`}
          >
            <QuoteOpen width={15} height={15} />
          </ToggleGroupItem>
        </ToggleGroup>

        <ButtonGroup
          className={`mobile-actions-group shrink-0 ${isToolbarActionVisible('createLink') ? '' : 'toolbar-group-standalone'}`}
        >
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Enlace"
            title="Enlace (⌘/Ctrl+K)"
            onClick={() => runFormat('createLink')}
            className={`rounded-full ${isToolbarActionVisible('createLink') ? '' : 'toolbar-control-overflowed'}`}
          >
            <Link width={15} height={15} />
          </Button>
          <MoreActionsMenu
            onAction={handleMoreAction}
            visibleActions={visibleToolbarActions}
          />
        </ButtonGroup>
      </div>
    </div>
  );
}
