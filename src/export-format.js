import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { parseBlocks, runsToText } from './export-markdown.js';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Characters XML 1.0 forbids (C0 controls except tab/LF/CR, lone surrogates,
// U+FFFE/U+FFFF). Text extracted from PDFs often contains e.g. form feeds;
// a single one makes Word reject the whole .docx.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripInvalidXmlChars(value) {
  return String(value).replace(INVALID_XML_CHARS, '');
}

export function escapeXml(value) {
  return stripInvalidXmlChars(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function sanitizeExportFileName(value) {
  const normalized = String(value || 'documento')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return (normalized || 'documento').slice(0, 96);
}

/**
 * File name for downloads that keeps tildes and ñ (sent as `filename*=UTF-8`);
 * only characters that file systems reject are removed.
 */
export function exportFileName(value) {
  const normalized = String(value || 'documento')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return Array.from(normalized || 'documento').slice(0, 96).join('');
}

export function stripLeadingTitle(markdown, title) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const index = lines.findIndex((line) => line.trim());
  if (index < 0) return markdown || '';

  const match = lines[index].match(/^#\s+(.+?)\s*$/);
  if (match && match[1].trim().toLocaleLowerCase() === String(title || '').trim().toLocaleLowerCase()) {
    lines.splice(index, 1);
  }

  return lines.join('\n').trim();
}

// ASCII equivalents for common typographic characters outside Latin-1, so
// the PDF (standard WinAnsi fonts) never silently drops them.
const PDF_ASCII_EQUIVALENTS = new Map([
  ['“', '"'], ['”', '"'], ['„', '"'], ['‟', '"'], ['″', '"'],
  ['‘', "'"], ['’', "'"], ['‚', "'"], ['‛', "'"], ['′', "'"],
  ['—', '-'], ['–', '-'], ['‒', '-'], ['‐', '-'], ['‑', '-'], ['−', '-'],
  ['…', '...'],
  ['•', '-'], ['●', '-'], ['◦', '-'], ['‣', '-'], ['⁃', '-'], ['▪', '-'],
  ['€', 'EUR'], ['™', 'TM'], ['‰', 'o/oo'],
  ['←', '<-'], ['→', '->'], ['↔', '<->'], ['⇒', '=>'],
  ['≤', '<='], ['≥', '>='], ['≠', '!='], ['≈', '~'],
  ['✓', 'v'], ['✔', 'v'], ['✗', 'x'], ['✘', 'x'],
  ['☐', '[ ]'], ['☑', '[x]'], ['☒', '[x]'],
  ['‹', '<'], ['›', '>'],
  [' ', ' '], [' ', ' '], [' ', ' '], [' ', ' '], [' ', ' '], [' ', ' '],
  ['\t', '    '],
]);
const ZERO_WIDTH = new Set(['​', '‌', '‍', '⁠', '﻿', '­']);

/**
 * Makes text drawable with the standard PDF fonts: Latin-1 is kept as is
 * (so Spanish accents survive), common typography is mapped to ASCII and any
 * other glyph becomes '?' instead of vanishing. Line breaks are preserved.
 */
export function toPdfSafeText(value) {
  let output = '';
  for (const char of String(value ?? '')) {
    if (ZERO_WIDTH.has(char)) continue;
    const mapped = PDF_ASCII_EQUIVALENTS.get(char);
    if (mapped !== undefined) {
      output += mapped;
      continue;
    }
    const code = char.codePointAt(0);
    if (char === '\n' || (code >= 0x20 && code <= 0x7E) || (code >= 0xA0 && code <= 0xFF)) {
      output += char;
    } else if (code < 0x20 || (code >= 0x7F && code < 0xA0)) {
      output += ' ';
    } else {
      output += '?';
    }
  }
  return output;
}

function documentParts(document) {
  const title = String(document?.title || 'Documento').replace(/\s+/g, ' ').trim() || 'Documento';
  const description = String(document?.description || '').trim();
  const body = stripLeadingTitle(document?.originalMarkdown || '', title);
  return { title, description, blocks: parseBlocks(body) };
}

function hasCells(cells) {
  return cells.some(cell => runsToText(cell).trim());
}

// ---------------------------------------------------------------------------
// PDF

const PDF = {
  pageWidth: 595.28, // A4
  pageHeight: 841.89,
  marginX: 50,
  marginTop: 50,
  marginBottom: 50,
  bodySize: 10.5,
  indentStep: 14,
};

const COLORS = {
  text: rgb(0.13, 0.15, 0.19),
  heading: rgb(0.06, 0.09, 0.16),
  muted: rgb(0.33, 0.37, 0.43),
  code: rgb(0.2, 0.22, 0.25),
  rule: rgb(0.85, 0.87, 0.9),
  bar: rgb(0.8, 0.84, 0.88),
  tableHeader: rgb(0.95, 0.96, 0.97),
  codeBackground: rgb(0.96, 0.97, 0.98),
};

const HEADING_SIZES = { 1: 16, 2: 14, 3: 12 };

/**
 * Genera un PDF real a partir del documento: títulos, párrafos con negrita y
 * cursiva, listas (con número inicial y casillas de tareas), tablas alineadas,
 * citas, notas destacadas, desplegables y bloques de código.
 */
export async function generatePdfDocument(document) {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await pdfDoc.embedFont(StandardFonts.Courier),
  };
  const contentWidth = PDF.pageWidth - PDF.marginX * 2;
  let page = pdfDoc.addPage([PDF.pageWidth, PDF.pageHeight]);
  let y = PDF.pageHeight - PDF.marginTop;

  const ensureSpace = (height) => {
    if (y - height < PDF.marginBottom) {
      page = pdfDoc.addPage([PDF.pageWidth, PDF.pageHeight]);
      y = PDF.pageHeight - PDF.marginTop;
    }
  };

  const measure = (text, font, size) => {
    try {
      return font.widthOfTextAtSize(text, size);
    } catch {
      return font.widthOfTextAtSize(text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'), size);
    }
  };

  const fontFor = (run, base = {}) => {
    if (run.code) return fonts.mono;
    const bold = run.bold || base.bold;
    const italic = run.italic || base.italic;
    if (bold && italic) return fonts.boldItalic;
    if (bold) return fonts.bold;
    if (italic) return fonts.italic;
    return fonts.regular;
  };

  /** Greedy word wrap of styled runs into lines of segments. */
  const layoutRuns = (runs, { size, maxWidth, base = {} }) => {
    const lines = [];
    let line = [];
    let width = 0;
    let pendingSpace = null;
    const finish = () => { lines.push({ segments: line, width }); line = []; width = 0; pendingSpace = null; };
    const pushWord = (text, style) => {
      const wordWidth = measure(text, style.font, size);
      const spaceWidth = line.length && pendingSpace ? measure(' ', pendingSpace.font, size) : 0;
      if (line.length && width + spaceWidth + wordWidth > maxWidth) finish();
      if (line.length && pendingSpace) {
        line.push({ ...pendingSpace, text: ' ' });
        width += spaceWidth;
      }
      pendingSpace = null;
      if (!line.length && wordWidth > maxWidth) {
        // A single word wider than the column: split it by characters.
        let chunk = '';
        for (const char of text) {
          if (chunk && measure(chunk + char, style.font, size) > maxWidth) {
            line.push({ ...style, text: chunk });
            width = measure(chunk, style.font, size);
            finish();
            chunk = '';
          }
          chunk += char;
        }
        if (chunk) { line.push({ ...style, text: chunk }); width = measure(chunk, style.font, size); }
        return;
      }
      line.push({ ...style, text });
      width += wordWidth;
    };

    for (const run of runs || []) {
      const style = { font: fontFor(run, base), strike: run.strike, underline: run.underline };
      const text = toPdfSafeText(run.text);
      for (const token of text.split(/(\n| +)/)) {
        if (!token) continue;
        if (token === '\n') { finish(); continue; }
        if (/^ +$/.test(token)) { if (line.length) pendingSpace = style; continue; }
        pushWord(token, style);
      }
    }
    if (line.length || !lines.length) finish();
    return lines;
  };

  const mergeSegments = (segments) => {
    const merged = [];
    for (const segment of segments) {
      const last = merged.at(-1);
      if (last && last.font === segment.font && !!last.strike === !!segment.strike && !!last.underline === !!segment.underline) {
        last.text += segment.text;
      } else {
        merged.push({ ...segment });
      }
    }
    return merged;
  };

  const drawLine = (lineInfo, { x, size, color, lineHeight, bar = 0 }) => {
    ensureSpace(lineHeight);
    let cursor = x;
    for (const segment of mergeSegments(lineInfo.segments)) {
      const width = measure(segment.text, segment.font, size);
      try {
        page.drawText(segment.text, { x: cursor, y, size, font: segment.font, color });
      } catch (error) {
        console.warn('Error dibujando texto en PDF:', error);
      }
      if (segment.strike) {
        page.drawLine({ start: { x: cursor, y: y + size * 0.32 }, end: { x: cursor + width, y: y + size * 0.32 }, thickness: 0.6, color });
      }
      if (segment.underline) {
        page.drawLine({ start: { x: cursor, y: y - 1.5 }, end: { x: cursor + width, y: y - 1.5 }, thickness: 0.6, color });
      }
      cursor += width;
    }
    for (let level = 0; level < bar; level += 1) {
      const barX = x - 9 - level * PDF.indentStep;
      page.drawLine({ start: { x: barX, y: y - 3 }, end: { x: barX, y: y + size }, thickness: 1.5, color: COLORS.bar });
    }
    y -= lineHeight;
  };

  const drawRuns = (runs, { indent = 0, size = PDF.bodySize, color = COLORS.text, base = {}, bar = 0 }) => {
    const lineHeight = size * 1.4;
    const x = PDF.marginX + indent;
    for (const lineInfo of layoutRuns(runs, { size, maxWidth: contentWidth - indent, base })) {
      drawLine(lineInfo, { x, size, color, lineHeight, bar });
    }
  };

  const drawTable = (block, ctx) => {
    const size = 9;
    const lineHeight = size * 1.35;
    const padding = 4;
    const left = PDF.marginX + ctx.indent;
    const available = contentWidth - ctx.indent;
    const withHeader = hasCells(block.header);
    const rows = withHeader ? [block.header, ...block.rows] : block.rows;
    const columns = rows.reduce((max, row) => Math.max(max, row.length), 1);

    // Column widths proportional to content, with a sensible minimum.
    const natural = Array.from({ length: columns }, (_, column) => rows.reduce((max, row) => Math.max(
      max,
      Math.min(220, measure(toPdfSafeText(runsToText(row[column] || [])).replace(/\n/g, ' '), fonts.regular, size) + padding * 2),
    ), 30));
    const total = natural.reduce((sum, value) => sum + value, 0);
    const widths = natural.map(value => (value / total) * available);

    rows.forEach((row, rowIndex) => {
      const isHeader = withHeader && rowIndex === 0;
      const cells = Array.from({ length: columns }, (_, column) => layoutRuns(row[column] || [], {
        size,
        maxWidth: Math.max(10, widths[column] - padding * 2),
        base: isHeader ? { bold: true } : {},
      }));
      const totalLines = cells.reduce((max, lines) => Math.max(max, lines.length), 1);

      // A row taller than the rest of the page continues on the next one, so
      // no line of a long cell is ever drawn below the margin.
      let firstLine = 0;
      while (firstLine < totalLines) {
        ensureSpace(lineHeight + padding * 2 + 2);
        const top = y + size;
        const fit = Math.max(1, Math.floor((top - PDF.marginBottom - padding * 2) / lineHeight));
        const count = Math.min(fit, totalLines - firstLine);
        const height = count * lineHeight + padding * 2;

        if (isHeader) {
          page.drawRectangle({ x: left, y: top - height, width: available, height, color: COLORS.tableHeader });
        }
        let cellX = left;
        cells.forEach((lines, column) => {
          const align = block.align?.[column] || 'left';
          let lineY = top - padding - size;
          for (const lineInfo of lines.slice(firstLine, firstLine + count)) {
            const lineWidth = lineInfo.segments.reduce((sum, segment) => sum + measure(segment.text, segment.font, size), 0);
            const offset = align === 'right'
              ? widths[column] - padding - lineWidth
              : align === 'center' ? (widths[column] - lineWidth) / 2 : padding;
            const savedY = y;
            y = lineY;
            drawLineRaw(lineInfo, cellX + offset, size);
            y = savedY;
            lineY -= lineHeight;
          }
          cellX += widths[column];
        });

        // Grid lines (a continued row gets its own top border on the new page).
        page.drawLine({ start: { x: left, y: top - height }, end: { x: left + available, y: top - height }, thickness: 0.5, color: COLORS.rule });
        if (rowIndex === 0 || firstLine > 0) {
          page.drawLine({ start: { x: left, y: top }, end: { x: left + available, y: top }, thickness: 0.5, color: COLORS.rule });
        }
        let lineX = left;
        for (let column = 0; column <= columns; column += 1) {
          page.drawLine({ start: { x: lineX, y: top }, end: { x: lineX, y: top - height }, thickness: 0.5, color: COLORS.rule });
          lineX += widths[column] || 0;
        }
        y = top - height - size;
        firstLine += count;
        if (firstLine < totalLines) {
          page = pdfDoc.addPage([PDF.pageWidth, PDF.pageHeight]);
          y = PDF.pageHeight - PDF.marginTop;
        }
      }
    });
    y -= 6;
  };

  function drawLineRaw(lineInfo, x, size) {
    let cursor = x;
    for (const segment of mergeSegments(lineInfo.segments)) {
      try {
        page.drawText(segment.text, { x: cursor, y, size, font: segment.font, color: COLORS.text });
      } catch (error) {
        console.warn('Error dibujando texto en PDF:', error);
      }
      cursor += measure(segment.text, segment.font, size);
    }
  }

  const drawBlocks = (blocks, ctx) => {
    for (const block of blocks) {
      switch (block.type) {
        case 'heading': {
          const size = HEADING_SIZES[block.level] || 11;
          y -= block.level === 1 ? 10 : 7;
          drawRuns(block.runs, { ...ctx, size, color: COLORS.heading, base: { ...ctx.base, bold: true } });
          y -= 3;
          break;
        }
        case 'paragraph':
          drawRuns(block.runs, ctx);
          y -= 5;
          break;
        case 'list': {
          for (const item of block.items) {
            const indent = ctx.indent + item.depth * PDF.indentStep;
            const prefix = item.checked !== null
              ? (item.checked ? '[x] ' : '[ ] ')
              : item.ordered ? `${item.number}. ` : '- ';
            const prefixWidth = measure(prefix, fonts.regular, PDF.bodySize);
            const lines = layoutRuns(item.runs, {
              size: PDF.bodySize,
              maxWidth: contentWidth - indent - prefixWidth,
              base: ctx.base,
            });
            const color = item.checked ? COLORS.muted : ctx.color;
            lines.forEach((lineInfo, index) => {
              if (index === 0) {
                ensureSpace(PDF.bodySize * 1.4);
                page.drawText(prefix, { x: PDF.marginX + indent, y, size: PDF.bodySize, font: fonts.regular, color });
              }
              drawLine(lineInfo, {
                x: PDF.marginX + indent + prefixWidth,
                size: PDF.bodySize,
                color,
                lineHeight: PDF.bodySize * 1.4,
                bar: ctx.bar,
              });
            });
          }
          y -= 5;
          break;
        }
        case 'quote':
          drawBlocks(block.blocks, {
            ...ctx,
            indent: ctx.indent + PDF.indentStep,
            bar: ctx.bar + 1,
            color: COLORS.muted,
            base: { ...ctx.base, italic: true },
          });
          break;
        case 'callout':
          drawRuns([{ text: block.label, bold: true }], { ...ctx, indent: ctx.indent + PDF.indentStep, bar: ctx.bar + 1 });
          drawBlocks(block.blocks, { ...ctx, indent: ctx.indent + PDF.indentStep, bar: ctx.bar + 1 });
          y -= 3;
          break;
        case 'details':
          drawRuns([{ text: block.summary, bold: true }], ctx);
          drawBlocks(block.blocks, { ...ctx, indent: ctx.indent + PDF.indentStep });
          y -= 3;
          break;
        case 'code': {
          const size = 9;
          const lineHeight = size * 1.35;
          const indent = ctx.indent + 8;
          const charWidth = measure('M', fonts.mono, size);
          const maxChars = Math.max(10, Math.floor((contentWidth - indent - 8) / charWidth));
          y -= 3;
          for (const rawLine of toPdfSafeText(block.text).split('\n')) {
            const chunks = rawLine.length ? rawLine.match(new RegExp(`.{1,${maxChars}}`, 'g')) : [''];
            for (const chunk of chunks) {
              ensureSpace(lineHeight);
              page.drawRectangle({
                x: PDF.marginX + indent - 4,
                y: y - 3,
                width: contentWidth - indent + 4,
                height: lineHeight,
                color: COLORS.codeBackground,
              });
              if (chunk) page.drawText(chunk, { x: PDF.marginX + indent, y, size, font: fonts.mono, color: COLORS.code });
              y -= lineHeight;
            }
          }
          y -= 6;
          break;
        }
        case 'table':
          y -= 2;
          drawTable(block, ctx);
          break;
        case 'hr':
          y -= 4;
          ensureSpace(10);
          page.drawLine({
            start: { x: PDF.marginX + ctx.indent, y },
            end: { x: PDF.pageWidth - PDF.marginX, y },
            thickness: 0.5,
            color: COLORS.rule,
          });
          y -= 12;
          break;
        default:
          break;
      }
    }
  };

  const { title, description, blocks } = documentParts(document);

  drawRuns([{ text: title }], { size: 20, color: COLORS.heading, base: { bold: true } });
  if (description) {
    y -= 2;
    drawRuns([{ text: description }], { size: 11, color: COLORS.muted, base: { italic: true } });
  }
  y -= 4;
  ensureSpace(10);
  page.drawLine({
    start: { x: PDF.marginX, y },
    end: { x: PDF.pageWidth - PDF.marginX, y },
    thickness: 1,
    color: COLORS.rule,
  });
  y -= 18;

  drawBlocks(blocks, { indent: 0, bar: 0, color: COLORS.text, base: {} });

  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// DOCX

const DOCX_CONTENT_WIDTH = 9026; // A4 width minus 2 × 1440 twips margins.
const INDENT_TWIPS = 360;

function docxText(text) {
  return String(text).split('\n')
    .map(part => `<w:t xml:space="preserve">${escapeXml(part)}</w:t>`)
    .join('<w:br/>');
}

function docxRun(run, extraRPr = '') {
  const rPr = [
    run.bold ? '<w:b/>' : '',
    run.italic ? '<w:i/>' : '',
    run.strike ? '<w:strike/>' : '',
    run.underline ? '<w:u w:val="single"/>' : '',
    run.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : '',
    extraRPr,
  ].join('');
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${docxText(run.text)}</w:r>`;
}

function docxRuns(runs, extraRPr = '') {
  return (runs || []).map(run => docxRun(run, extraRPr)).join('');
}

function docxParagraph(content, ctx, { style = '', spacing = '<w:spacing w:before="60" w:after="120"/>', ind = null, extraPPr = '' } = {}) {
  const left = ind?.left ?? ctx.indent;
  const hanging = ind?.hanging ? ` w:hanging="${ind.hanging}"` : '';
  const border = ctx.bar ? `<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="${ctx.barColor || 'CBD5E1'}"/></w:pBdr>` : '';
  const shading = ctx.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${ctx.shade}"/>` : '';
  const pPr = [
    style ? `<w:pStyle w:val="${style}"/>` : '',
    border,
    shading,
    spacing,
    left || hanging ? `<w:ind w:left="${left}"${hanging}/>` : '',
    extraPPr,
  ].join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`;
}

function docxTable(block, ctx) {
  const withHeader = hasCells(block.header);
  const rows = withHeader ? [block.header, ...block.rows] : block.rows;
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 1);
  const width = Math.max(2000, DOCX_CONTENT_WIDTH - ctx.indent);
  const columnWidth = Math.floor(width / columns);
  const justify = { left: 'left', center: 'center', right: 'right' };

  const xmlRows = rows.map((row, rowIndex) => {
    const isHeader = withHeader && rowIndex === 0;
    const cells = Array.from({ length: columns }, (_, column) => {
      const align = justify[block.align?.[column]] || 'left';
      const shading = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : '';
      return `<w:tc><w:tcPr><w:tcW w:w="${columnWidth}" w:type="dxa"/>${shading}</w:tcPr>`
        + `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:jc w:val="${align}"/></w:pPr>`
        + `${docxRuns(row[column] || [], isHeader ? '<w:b/>' : '')}</w:p></w:tc>`;
    }).join('');
    return `<w:tr>${isHeader ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`;
  }).join('');

  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>`).join('');
  const grid = Array.from({ length: columns }, () => `<w:gridCol w:w="${columnWidth}"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${columnWidth * columns}" w:type="dxa"/>`
    + `${ctx.indent ? `<w:tblInd w:w="${ctx.indent}" w:type="dxa"/>` : ''}`
    + `<w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${grid}</w:tblGrid>${xmlRows}</w:tbl>`
    // Word needs a paragraph between consecutive tables.
    + '<w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr></w:p>';
}

function docxBlocks(blocks, ctx) {
  const out = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        out.push(docxParagraph(docxRuns(block.runs, ctx.rPr), ctx, { style: `Heading${Math.min(block.level, 3)}`, spacing: '' }));
        break;
      case 'paragraph':
        out.push(docxParagraph(docxRuns(block.runs, ctx.rPr), ctx));
        break;
      case 'list':
        for (const item of block.items) {
          const isTask = item.checked !== null;
          const prefix = isTask ? (item.checked ? '☑' : '☐') : item.ordered ? `${item.number}.` : '•';
          const prefixRun = `<w:r><w:rPr>${isTask ? '<w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol"/>' : ''}${ctx.rPr || ''}</w:rPr>`
            + `<w:t xml:space="preserve">${escapeXml(prefix)}</w:t><w:tab/></w:r>`;
          const muted = isTask && item.checked ? '<w:color w:val="6B7280"/>' : '';
          out.push(docxParagraph(
            prefixRun + docxRuns(item.runs, `${ctx.rPr || ''}${muted}`),
            ctx,
            {
              spacing: '<w:spacing w:before="20" w:after="40"/>',
              ind: { left: ctx.indent + INDENT_TWIPS * (item.depth + 1), hanging: INDENT_TWIPS },
            },
          ));
        }
        break;
      case 'quote':
        out.push(...docxBlocks(block.blocks, {
          ...ctx,
          indent: ctx.indent + INDENT_TWIPS,
          bar: true,
          rPr: `${ctx.rPr || ''}<w:i/><w:color w:val="475569"/>`,
        }));
        break;
      case 'callout': {
        const calloutCtx = { ...ctx, indent: ctx.indent + 120, bar: true, barColor: '3B82F6', shade: 'F1F5F9' };
        out.push(docxParagraph(docxRun({ text: block.label, bold: true }, ctx.rPr), calloutCtx, { spacing: '<w:spacing w:before="120" w:after="40"/>' }));
        out.push(...docxBlocks(block.blocks, calloutCtx));
        break;
      }
      case 'details':
        out.push(docxParagraph(docxRun({ text: block.summary, bold: true }, ctx.rPr), ctx, { spacing: '<w:spacing w:before="120" w:after="60"/>' }));
        out.push(...docxBlocks(block.blocks, { ...ctx, indent: ctx.indent + INDENT_TWIPS }));
        break;
      case 'code':
        out.push(`
        <w:p>
          <w:pPr><w:spacing w:before="120" w:after="120"/>${ctx.indent ? `<w:ind w:left="${ctx.indent}"/>` : ''}<w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/></w:pPr>
          <w:r>
            <w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/><w:color w:val="334155"/></w:rPr>
            ${block.text.split('\n').map(codeLine => `<w:t xml:space="preserve">${escapeXml(codeLine.replace(/\t/g, '    '))}</w:t>`).join('<w:br/>')}
          </w:r>
        </w:p>`);
        break;
      case 'table':
        out.push(docxTable(block, ctx));
        break;
      case 'hr':
        out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D0D7DE"/></w:pBdr><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>');
        break;
      default:
        break;
    }
  }
  return out;
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Aptos"/>
        <w:sz w:val="22"/>
        <w:color w:val="1F2328"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
</w:styles>`;

/**
 * Genera un archivo DOCX real (Word moderno) con el mismo modelo del PDF:
 * negrita/cursiva, listas con número inicial y casillas ☐/☑, tablas reales,
 * citas, notas destacadas y desplegables como secciones.
 */
export async function generateDocxDocument(document) {
  const zip = new JSZip();
  const { title, description, blocks } = documentParts(document);

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );

  zip.file('word/styles.xml', DOCX_STYLES);

  const ctx = { indent: 0, bar: false, rPr: '' };
  const parts = [
    `<w:p><w:pPr><w:spacing w:before="100" w:after="${description ? 80 : 240}"/></w:pPr>`
      + `<w:r><w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="0F172A"/></w:rPr>${docxText(title)}</w:r></w:p>`,
  ];
  if (description) {
    parts.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="240"/></w:pPr>`
      + `<w:r><w:rPr><w:i/><w:color w:val="475569"/></w:rPr>${docxText(description)}</w:r></w:p>`);
  }
  parts.push(...docxBlocks(blocks, ctx));

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${parts.join('\n')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`,
  );

  return zip.generateAsync({
    type: 'uint8array',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}
