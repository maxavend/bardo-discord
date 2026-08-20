export const SOURCE_TYPES = Object.freeze({
  MARKDOWN: 'markdown',
  TEXT: 'text',
  PDF: 'pdf',
  DOCX: 'docx',
});

export function getSourceType(fileName = '') {
  const name = String(fileName).trim().toLowerCase();

  if (name.endsWith('.md') || name.endsWith('.markdown')) return SOURCE_TYPES.MARKDOWN;
  if (name.endsWith('.txt')) return SOURCE_TYPES.TEXT;
  if (name.endsWith('.pdf')) return SOURCE_TYPES.PDF;
  if (name.endsWith('.docx')) return SOURCE_TYPES.DOCX;

  return null;
}

export function isTextSourceType(sourceType) {
  return sourceType === SOURCE_TYPES.MARKDOWN || sourceType === SOURCE_TYPES.TEXT;
}

export function sourceLabel(sourceType) {
  switch (sourceType) {
    case SOURCE_TYPES.PDF:
      return 'PDF';
    case SOURCE_TYPES.DOCX:
      return 'Word';
    case SOURCE_TYPES.TEXT:
      return 'TXT';
    case SOURCE_TYPES.MARKDOWN:
      return 'Markdown';
    default:
      return 'documento';
  }
}

export function fileStem(fileName = '') {
  const value = String(fileName).trim().replace(/^.*[\\/]/, '');
  return value.replace(/\.(?:md|markdown|txt|pdf|docx)$/i, '').trim() || 'Documento';
}

export const DOCX_STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Título'] => h1:fresh",
  "p[style-name='Subtítulo'] => h2:fresh",
  "p[style-name='Título 1'] => h1:fresh",
  "p[style-name='Título 2'] => h2:fresh",
  "p[style-name='Título 3'] => h3:fresh",
  "p[style-name='Título 4'] => h4:fresh",
  "p[style-name='Encabezado 1'] => h1:fresh",
  "p[style-name='Encabezado 2'] => h2:fresh",
  "p[style-name='Encabezado 3'] => h3:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "p[style-name='Cita'] => blockquote:fresh",
  "p[style-name='Cita destacada'] => blockquote:fresh",
  "p[style-name='Code'] => pre > code:fresh",
  "p[style-name='Código'] => pre > code:fresh",
  "r[style-name='Code'] => code",
  "r[style-name='Código'] => code",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
  "r[style-name='Subtle Emphasis'] => em",
  "r[style-name='Highlight'] => mark",
  "p[style-name='List Bullet'] => ul > li:fresh",
  "p[style-name='List Number'] => ol > li:fresh",
  "p[style-name='List'] => ul > li:fresh",
  "p[style-name='Lista con viñetas'] => ul > li:fresh",
  "p[style-name='Lista con números'] => ol > li:fresh",
];

export function cleanEscapedMarkdown(text) {
  return String(text || '')
    .replace(/\\+(\.)/g, '$1')
    .replace(/\\+(\|)/g, '$1')
    .replace(/\\+(\*)/g, '$1')
    .replace(/\\+(_)/g, '$1')
    .replace(/\\+(-)/g, '$1')
    .replace(/\\+(#)/g, '$1')
    .replace(/\\+(\[)/g, '$1')
    .replace(/\\+(\])/g, '$1')
    .replace(/\\+(\()/g, '$1')
    .replace(/\\+(\))/g, '$1')
    .replace(/\\+(~)/g, '$1')
    .replace(/\\+(`)/g, '$1')
    .replace(/\\+(>)/g, '$1')
    .replace(/\\{2,}/g, '');
}

export function ensureDocumentTitle(markdown, title) {
  const normalized = cleanEscapedMarkdown(String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim());
  if (!normalized) return `# ${title}`;
  const firstLine = normalized.split('\n').find((line) => line.trim()) || '';
  return /^#\s+/.test(firstLine.trim()) ? normalized : `# ${title}\n\n${normalized}`;
}

const PAGE_ARTIFACT_REGEX = /^(?:p[áa]gina\s+\d+(?:\s*(?:de|\/)\s*\d+)?|page\s+\d+(?:\s*(?:of|\/)\s*\d+)?|-+\s*\d+\s*-+|\[\s*\d+\s*\]|\d{1,4})$/i;
const CALLOUT_REGEX = /^(nota|importante|atenci[oó]n|advertencia|aviso|consejo|tip|note|important|warning|caution):\s*(.+)$/i;
const KEY_VALUE_REGEX = /^([A-ZÁÉÍÓÚÜÑ][\w\sáéíóúüñ/().-]{1,35}):\s+(.+)$/;

export function pdfTextToMarkdown(text, title) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (normalized.replace(/\s/g, '').length < 30) {
    return `# ${title}\n\n> Bardo no encontró suficiente texto seleccionable en este PDF. Los documentos escaneados todavía necesitan OCR para poder convertirse.`;
  }

  const rawLines = normalized.split('\n');
  const output = [];
  if (title) {
    output.push(`# ${title}`);
  }

  let currentParagraph = [];
  let currentList = null; // { type: 'bullet' | 'number', items: [] }
  let currentTable = null; // string[][]

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      const textBlock = currentParagraph.join(' ').replace(/\s+/g, ' ').trim();
      if (textBlock) {
        output.push(textBlock);
      }
      currentParagraph = [];
    }
  }

  function flushList() {
    if (currentList && currentList.items.length > 0) {
      const formatted = currentList.items.map((item, i) => {
        const marker = currentList.type === 'number' ? `${i + 1}.` : '-';
        return `${marker} ${item.trim()}`;
      }).join('\n');
      output.push(formatted);
      currentList = null;
    }
  }

  function flushTable() {
    if (currentTable && currentTable.length > 0) {
      const validRows = currentTable.filter((r) => r.length > 1);
      if (validRows.length >= 1) {
        const colCount = Math.max(...validRows.map((r) => r.length));
        const normalizedRows = validRows.map((r) => {
          const row = [...r];
          while (row.length < colCount) row.push('');
          return row;
        });

        const header = normalizedRows[0];
        const body = normalizedRows.slice(1);
        const headerLine = `| ${header.map((c) => c.trim() || '-').join(' | ')} |`;
        const separatorLine = `| ${header.map(() => '---').join(' | ')} |`;
        const bodyLines = body.map((r) => `| ${r.map((c) => c.trim()).join(' | ')} |`);

        output.push([headerLine, separatorLine, ...bodyLines].join('\n'));
      }
      currentTable = null;
    }
  }

  function flushAll() {
    flushParagraph();
    flushList();
    flushTable();
  }

  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i].trim();

    // Línea vacía: separador de bloques
    if (!line) {
      flushAll();
      continue;
    }

    // Filtrar números de página y encabezados/pies de página aislados
    if (PAGE_ARTIFACT_REGEX.test(line)) {
      continue;
    }

    // Separadores horizontales (---, ***, ___ o 5+ guiones)
    if (/^(?:-{3,}|\*{3,}|_{3,}|={3,})$/.test(line)) {
      flushAll();
      output.push('---');
      continue;
    }

    // Tablas con pipes explícitos (| Col 1 | Col 2 |)
    if (line.includes('|') && line.split('|').filter(Boolean).length >= 2) {
      flushParagraph();
      flushList();
      const cells = line.split('|').map((c) => c.trim()).filter((c, idx, arr) => (idx > 0 && idx < arr.length - 1) || c);
      if (!currentTable) currentTable = [];
      currentTable.push(cells);
      continue;
    } else if (currentTable) {
      flushTable();
    }

    // Encabezados con numeración jerárquica (ej: "1. Introducción", "1.1 Alcance", "1.1.1 Requisitos")
    const subSubHeading = /^(\d+\.\d+\.\d+)\s+([A-ZÁÉÍÓÚÜÑ].+)$/i.exec(line);
    if (subSubHeading && line.length <= 100) {
      flushAll();
      output.push(`### ${line}`);
      continue;
    }

    const subHeading = /^(\d+\.\d+|[A-Z]\.\d+)\s+([A-ZÁÉÍÓÚÜÑ].+)$/i.exec(line);
    if (subHeading && line.length <= 100) {
      flushAll();
      output.push(`### ${line}`);
      continue;
    }

    const mainNumberedHeading = /^(\d+|[I|V|X]+)\.\s+([A-ZÁÉÍÓÚÜÑ].+)$/i.exec(line);
    if (mainNumberedHeading && line.length <= 100) {
      flushAll();
      output.push(`## ${line}`);
      continue;
    }

    // Encabezados en MAYÚSCULAS o Capítulos / Secciones (ej: "RESUMEN EJECUTIVO", "Capítulo 1: ...")
    const isChapter = /^(?:cap[íi]tulo|secci[óo]n|m[óo]dulo|anexo|ap[ée]ndice)\s+[\w\d]+[:.]?\s*.+$/i.test(line);
    const isAllUpperHeading = line.length >= 4 && line.length <= 80 && /[A-ZÁÉÍÓÚÜÑ]/.test(line) && line === line.toLocaleUpperCase('es') && !line.endsWith('.') && !line.includes(':');

    if ((isChapter || isAllUpperHeading) && !line.startsWith('-') && !line.startsWith('•')) {
      flushAll();
      output.push(`## ${line}`);
      continue;
    }

    // Listas con viñetas (•, ●, ▪, ▫, ◦, –, —, *, +, ⁃, ➢, ➔, ✔, ✓, o guión)
    const bulletMatch = /^[•●▪▫◦–—*+⁃➢➔✔✓-]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      flushParagraph();
      flushTable();
      if (!currentList || currentList.type !== 'bullet') {
        flushList();
        currentList = { type: 'bullet', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Listas numeradas (ej: "1. ", "1) ", "a. ", "a) ")
    const numberListMatch = /^(?:\d+|[a-zA-Z])[.)]\s+(.+)$/.exec(line);
    if (numberListMatch && !mainNumberedHeading) {
      flushParagraph();
      flushTable();
      if (!currentList || currentList.type !== 'number') {
        flushList();
        currentList = { type: 'number', items: [] };
      }
      currentList.items.push(numberListMatch[1]);
      continue;
    }

    // Si estamos dentro de una lista y la línea actual parece continuación (comienza con minúscula o sin puntuación previa)
    if (currentList && currentList.items.length > 0 && /^[a-záéíóúüñ0-9,;]/.test(line)) {
      const lastIdx = currentList.items.length - 1;
      currentList.items[lastIdx] = `${currentList.items[lastIdx]} ${line}`;
      continue;
    } else if (currentList) {
      flushList();
    }

    // Callouts / Notas (ej: "Nota: ...", "Importante: ...")
    const calloutMatch = CALLOUT_REGEX.exec(line);
    if (calloutMatch) {
      flushAll();
      const prefix = calloutMatch[1].charAt(0).toUpperCase() + calloutMatch[1].slice(1).toLowerCase();
      output.push(`> **${prefix}:** ${calloutMatch[2]}`);
      continue;
    }

    // Metadatos Clave: Valor (ej: "Fecha: 20 de Agosto", "Autor: Max")
    const kvMatch = KEY_VALUE_REGEX.exec(line);
    if (kvMatch && line.length <= 120 && !line.includes('http') && !line.endsWith('.')) {
      flushAll();
      output.push(`**${kvMatch[1]}:** ${kvMatch[2]}`);
      continue;
    }

    // Manejo de párrafos y de-hiphenación
    if (currentParagraph.length > 0) {
      const prev = currentParagraph[currentParagraph.length - 1];
      if (prev.endsWith('-') && /^[a-záéíóúüñ]/.test(line)) {
        currentParagraph[currentParagraph.length - 1] = `${prev.slice(0, -1)}${line}`;
      } else {
        currentParagraph.push(line);
      }
    } else {
      currentParagraph.push(line);
    }
  }

  flushAll();

  // Si el documento tiene título en primera línea que coincide exactamente con title, no duplicar
  const result = output.filter(Boolean).join('\n\n').trim();
  return result;
}
