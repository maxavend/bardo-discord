import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function sanitizeExportFileName(value) {
  const normalized = String(value || 'documento')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return (normalized || 'documento').slice(0, 96);
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

function cleanMarkdownInline(text) {
  return String(text || '')
    .replace(/<\/?u>/gi, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * Genera un archivo binario PDF real a partir del documento y su markdown.
 */
export async function generatePdfDocument(document) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const marginX = 50;
  const marginTop = 50;
  const marginBottom = 50;
  const contentWidth = pageWidth - marginX * 2;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - marginTop;

  function ensureSpace(heightNeeded) {
    if (currentY - heightNeeded < marginBottom) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - marginTop;
    }
  }

  function wrapText(text, font, size, maxWidth) {
    const words = String(text || '').split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      let width = 0;
      try {
        width = font.widthOfTextAtSize(testLine, size);
      } catch {
        // En caso de caracteres especiales fuera de WinAnsi, limpiamos a ascii
        const safe = testLine.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
        width = font.widthOfTextAtSize(safe, size);
      }

      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
  }

  function drawTextLine(text, font, size, color, xOffset = 0) {
    ensureSpace(size * 1.35);
    const safeText = String(text).replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
    try {
      currentPage.drawText(safeText, {
        x: marginX + xOffset,
        y: currentY,
        size,
        font,
        color,
      });
    } catch (err) {
      console.warn('Error dibujando texto en PDF:', err);
    }
    currentY -= size * 1.35;
  }

  const title = document.title || 'Documento';
  const rawMarkdown = document.originalMarkdown || '';
  const bodyMarkdown = stripLeadingTitle(rawMarkdown, title);

  // 1. Encabezado / Título del documento
  ensureSpace(40);
  const titleLines = wrapText(title, fontBold, 18, contentWidth);
  for (const line of titleLines) {
    drawTextLine(line, fontBold, 18, rgb(0.08, 0.09, 0.12));
  }
  currentY -= 6;

  // Línea separadora sutil
  currentPage.drawLine({
    start: { x: marginX, y: currentY },
    end: { x: pageWidth - marginX, y: currentY },
    thickness: 1,
    color: rgb(0.85, 0.87, 0.9),
  });
  currentY -= 16;

  // 2. Renderizar contenido Markdown línea por línea
  const rawLines = bodyMarkdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let index = 0;

  while (index < rawLines.length) {
    const line = rawLines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      currentY -= 6;
      index += 1;
      continue;
    }

    // Bloques de código ```
    if (trimmed.startsWith('```')) {
      index += 1;
      const codeLines = [];
      while (index < rawLines.length && !rawLines[index].trim().startsWith('```')) {
        codeLines.push(rawLines[index]);
        index += 1;
      }
      if (index < rawLines.length) index += 1;

      currentY -= 4;
      for (const cLine of codeLines) {
        const wrapped = wrapText(cLine, fontMono, 9, contentWidth - 16);
        for (const w of wrapped) {
          drawTextLine(w, fontMono, 9, rgb(0.2, 0.22, 0.25), 10);
        }
      }
      currentY -= 8;
      continue;
    }

    // Encabezados (#, ##, ###)
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      currentY -= 10;
      const hLines = wrapText(cleanMarkdownInline(h1Match[1]), fontBold, 15, contentWidth);
      for (const h of hLines) drawTextLine(h, fontBold, 15, rgb(0.1, 0.12, 0.15));
      currentY -= 4;
      index += 1;
      continue;
    }

    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      currentY -= 8;
      const hLines = wrapText(cleanMarkdownInline(h2Match[1]), fontBold, 13, contentWidth);
      for (const h of hLines) drawTextLine(h, fontBold, 13, rgb(0.12, 0.14, 0.18));
      currentY -= 3;
      index += 1;
      continue;
    }

    const h3Match = trimmed.match(/^###+\s+(.+)$/);
    if (h3Match) {
      currentY -= 6;
      const hLines = wrapText(cleanMarkdownInline(h3Match[1]), fontBold, 11, contentWidth);
      for (const h of hLines) drawTextLine(h, fontBold, 11, rgb(0.15, 0.17, 0.2));
      currentY -= 2;
      index += 1;
      continue;
    }

    // Separadores ---
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      currentY -= 6;
      ensureSpace(8);
      currentPage.drawLine({
        start: { x: marginX, y: currentY },
        end: { x: pageWidth - marginX, y: currentY },
        thickness: 0.5,
        color: rgb(0.88, 0.9, 0.92),
      });
      currentY -= 10;
      index += 1;
      continue;
    }

    // Citas >
    if (trimmed.startsWith('>')) {
      const quoteText = cleanMarkdownInline(trimmed.replace(/^>\s?/, ''));
      const qLines = wrapText(quoteText, fontOblique, 10, contentWidth - 20);
      for (const q of qLines) {
        drawTextLine(q, fontOblique, 10, rgb(0.3, 0.33, 0.38), 12);
      }
      currentY -= 4;
      index += 1;
      continue;
    }

    // Listas con viñetas o numeradas
    const listMatch = trimmed.match(/^([-*+]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const isNumbered = /^\d/.test(listMatch[1]);
      const bullet = isNumbered ? `${listMatch[1]} ` : '• ';
      const itemText = cleanMarkdownInline(listMatch[2]);
      const itemLines = wrapText(itemText, fontRegular, 10, contentWidth - 20);
      
      for (let i = 0; i < itemLines.length; i += 1) {
        const prefix = i === 0 ? bullet : '  ';
        drawTextLine(`${prefix}${itemLines[i]}`, fontRegular, 10, rgb(0.18, 0.2, 0.24), 8);
      }
      index += 1;
      continue;
    }

    // Párrafos regulares
    const cleanText = cleanMarkdownInline(trimmed);
    const pLines = wrapText(cleanText, fontRegular, 10, contentWidth);
    for (const p of pLines) {
      drawTextLine(p, fontRegular, 10, rgb(0.18, 0.2, 0.24));
    }
    currentY -= 3;
    index += 1;
  }

  return pdfDoc.save();
}

/**
 * Genera un archivo binario DOCX (Word moderno) real a partir del documento.
 */
export async function generateDocxDocument(document) {
  const zip = new JSZip();

  const title = escapeXml(document.title || 'Documento');
  const rawMarkdown = document.originalMarkdown || '';
  const bodyMarkdown = stripLeadingTitle(rawMarkdown, document.title || '');

  // 1. [Content_Types].xml
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

  // 2. _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  // 3. word/_rels/document.xml.rels
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );

  // 4. word/styles.xml
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
    <w:pPr><w:spacing w:before="360" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
</w:styles>`,
  );

  // 5. word/document.xml
  const xmlParagraphs = [];

  // Título principal
  xmlParagraphs.push(`
    <w:p>
      <w:pPr>
        <w:spacing w:before="100" w:after="240"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="0F172A"/></w:rPr>
        <w:t>${title}</w:t>
      </w:r>
    </w:p>`);

  const lines = bodyMarkdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      index += 1;
      const code = [];
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      xmlParagraphs.push(`
        <w:p>
          <w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr>
          <w:r>
            <w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/><w:color w:val="334155"/></w:rPr>
            <w:t xml:space="preserve">${escapeXml(code.join('\n'))}</w:t>
          </w:r>
        </w:p>`);
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      xmlParagraphs.push(`
        <w:p>
          <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
          <w:r><w:t>${escapeXml(cleanMarkdownInline(h1[1]))}</w:t></w:r>
        </w:p>`);
      index += 1;
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      xmlParagraphs.push(`
        <w:p>
          <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
          <w:r><w:t>${escapeXml(cleanMarkdownInline(h2[1]))}</w:t></w:r>
        </w:p>`);
      index += 1;
      continue;
    }

    const h3 = trimmed.match(/^###+\s+(.+)$/);
    if (h3) {
      xmlParagraphs.push(`
        <w:p>
          <w:pPr><w:pStyle w:val="Heading3"/></w:pPr>
          <w:r><w:t>${escapeXml(cleanMarkdownInline(h3[1]))}</w:t></w:r>
        </w:p>`);
      index += 1;
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      xmlParagraphs.push(`
        <w:p>
          <w:pPr><w:ind w:left="400"/><w:spacing w:before="100" w:after="100"/></w:pPr>
          <w:r><w:rPr><w:i/><w:color w:val="475569"/></w:rPr><w:t>${escapeXml(cleanMarkdownInline(quote[1]))}</w:t></w:r>
        </w:p>`);
      index += 1;
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      xmlParagraphs.push(`
        <w:p>
          <w:pPr><w:ind w:left="400"/><w:spacing w:before="40" w:after="40"/></w:pPr>
          <w:r><w:t>• ${escapeXml(cleanMarkdownInline(bullet[1]))}</w:t></w:r>
        </w:p>`);
      index += 1;
      continue;
    }

    const numbered = trimmed.match(/^(\d+[.)])\s+(.+)$/);
    if (numbered) {
      xmlParagraphs.push(`
        <w:p>
          <w:pPr><w:ind w:left="400"/><w:spacing w:before="40" w:after="40"/></w:pPr>
          <w:r><w:t>${escapeXml(numbered[1])} ${escapeXml(cleanMarkdownInline(numbered[2]))}</w:t></w:r>
        </w:p>`);
      index += 1;
      continue;
    }

    xmlParagraphs.push(`
      <w:p>
        <w:pPr><w:spacing w:before="60" w:after="120"/></w:pPr>
        <w:r><w:t>${escapeXml(cleanMarkdownInline(trimmed))}</w:t></w:r>
      </w:p>`);
    index += 1;
  }

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${xmlParagraphs.join('\n')}
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
