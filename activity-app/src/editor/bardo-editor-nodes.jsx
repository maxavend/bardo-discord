import { useCallback, useState } from 'react';
import { PlateElement, PlateLeaf } from 'platejs/react';
import { ChevronRight } from '@gravity-ui/icons';

/**
 * Renderizado de marcas de texto (hojas de Slate)
 */
export function BardoLeaf(props) {
  const { attributes, children, leaf } = props;
  let formatted = children;

  if (leaf.bold) {
    formatted = <strong>{formatted}</strong>;
  }
  if (leaf.italic) {
    formatted = <em>{formatted}</em>;
  }
  if (leaf.underline) {
    formatted = <u>{formatted}</u>;
  }
  if (leaf.strikethrough) {
    formatted = <s>{formatted}</s>;
  }
  if (leaf.code) {
    formatted = <code>{formatted}</code>;
  }
  if (leaf.kbd) {
    formatted = <kbd>{formatted}</kbd>;
  }

  return (
    <PlateLeaf {...props}>
      <span {...attributes}>{formatted}</span>
    </PlateLeaf>
  );
}

/**
 * Renderizado de Bloques Básicos
 */
const LIST_INDENT_PX = 24;

/**
 * Párrafo. Los ítems de lista planos (listStyleType + indent) se renderizan como
 * div: ListPlugin envuelve su contenido en <ul>/<ol><li>, que no puede ir dentro de <p>.
 */
export function BardoParagraphElement(props) {
  const { element } = props;
  if (element.listStyleType) {
    const indent = Math.max(1, Number(element.indent) || 1);
    return (
      <PlateElement
        as="div"
        {...props}
        className="bardo-list-item"
        style={{ marginLeft: `${indent * LIST_INDENT_PX}px` }}
      >
        {props.children}
      </PlateElement>
    );
  }
  return (
    <PlateElement as="p" {...props}>
      {props.children}
    </PlateElement>
  );
}

export function BardoH1Element(props) {
  return (
    <PlateElement as="h1" {...props}>
      {props.children}
    </PlateElement>
  );
}

export function BardoH2Element(props) {
  return (
    <PlateElement as="h2" {...props}>
      {props.children}
    </PlateElement>
  );
}

export function BardoH3Element(props) {
  return (
    <PlateElement as="h3" {...props}>
      {props.children}
    </PlateElement>
  );
}

export function BardoBlockquoteElement(props) {
  return (
    <PlateElement as="blockquote" {...props}>
      {props.children}
    </PlateElement>
  );
}

export function BardoHrElement(props) {
  return (
    <PlateElement as="div" {...props} className="my-6">
      <hr className="border-0 h-[1px] bg-border my-6" contentEditable={false} />
      {props.children}
    </PlateElement>
  );
}

export function BardoCodeBlockElement(props) {
  return (
    <PlateElement as="pre" {...props}>
      <code>{props.children}</code>
    </PlateElement>
  );
}

export function BardoCalloutElement(props) {
  return (
    <PlateElement as="div" {...props} className="doc-callout">
      {props.children}
    </PlateElement>
  );
}

/**
 * Checklist item con botón interactivo de check sin manipulación directa del DOM
 */
export function BardoChecklistElement(props) {
  const { element, editor, children } = props;
  const checked = Boolean(element.checked);
  const nestedIndent = Math.max(0, (Number(element.indent) || 1) - 1);

  const handleToggle = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!editor) return;

      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.setNodes({ checked: !checked }, { at: path });
      }
    },
    [checked, editor, element]
  );

  return (
    <PlateElement
      as="div"
      {...props}
      className={`relative min-h-[40px] py-2 pl-10 pr-0 my-0 checklist-item ${checked ? 'done text-muted-foreground line-through' : ''}`}
      style={nestedIndent ? { marginLeft: `${nestedIndent * LIST_INDENT_PX}px` } : undefined}
    >
      <button
        type="button"
        contentEditable={false}
        className="check-control"
        aria-pressed={checked}
        aria-label={checked ? 'Marcar como pendiente' : 'Marcar como completado'}
        onClick={handleToggle}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span aria-hidden="true">✓</span>
      </button>
      <div className="checklist-content">{children}</div>
    </PlateElement>
  );
}

/**
 * Spoiler / Desplegable con summary interactivo
 */
export function BardoSpoilerElement(props) {
  const { element, editor, children } = props;
  const [isOpen, setIsOpen] = useState(true);
  const summary = element.summary || 'Detalles';

  const handleSummaryChange = useCallback(
    (e) => {
      const nextSummary = e.target.value;
      if (!editor) return;
      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.setNodes({ summary: nextSummary }, { at: path });
      }
    },
    [editor, element]
  );

  return (
    <PlateElement as="div" {...props} className="spoiler my-6 border border-border rounded-xl bg-muted overflow-clip">
      <div
        contentEditable={false}
        className="flex items-center gap-2 px-4 py-3 font-bold text-sm text-foreground cursor-pointer select-none border-b border-border"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronRight
          width={16}
          height={16}
          className={`transition-transform duration-200 text-muted-foreground ${isOpen ? 'rotate-90' : ''}`}
        />
        <input
          type="text"
          className="bg-transparent border-0 font-bold text-sm text-foreground focus:outline-none flex-1"
          value={summary}
          onChange={handleSummaryChange}
          onClick={(e) => e.stopPropagation()}
          placeholder="Detalles"
        />
      </div>
      {isOpen && <div className="p-4">{children}</div>}
    </PlateElement>
  );
}

/**
 * Enlaces
 */
export function BardoLinkElement(props) {
  const { element, children } = props;
  return (
    <PlateElement
      as="a"
      {...props}
      href={element.url || '#'}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-4"
    >
      {children}
    </PlateElement>
  );
}

/**
 * Tablas
 */
export function BardoTableElement(props) {
  return (
    <PlateElement as="table" {...props} className="w-full table-fixed border-collapse my-6 text-sm">
      <tbody>{props.children}</tbody>
    </PlateElement>
  );
}

export function BardoTableRowElement(props) {
  return (
    <PlateElement as="tr" {...props}>
      {props.children}
    </PlateElement>
  );
}

export function BardoTableCellElement(props) {
  return (
    <PlateElement as="td" {...props} className="p-3 border border-border text-left align-top">
      {props.children}
    </PlateElement>
  );
}

export function BardoTableCellHeaderElement(props) {
  return (
    <PlateElement as="th" {...props} className="p-3 border border-border text-left align-top bg-muted font-bold">
      {props.children}
    </PlateElement>
  );
}
