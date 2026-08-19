export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function renderInline(value) {
  let text = escapeHtml(value);
  const codeTokens = [];

  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const token = `%%BARDOCODE${codeTokens.length}%%`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, label, href) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

  codeTokens.forEach((html, index) => {
    text = text.replace(`%%BARDOCODE${index}%%`, html);
  });

  return text;
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderTable(lines) {
  const headers = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow);
  const head = headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = headers.map((_, index) => `<td>${renderInline(row[index] ?? '')}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function isSpecialLine(lines, index) {
  const line = lines[index] ?? '';
  const next = lines[index + 1] ?? '';
  const trimmed = line.trim();

  return (
    !trimmed ||
    /^```/.test(trimmed) ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+[.)]\s+/.test(trimmed) ||
    /^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
    (line.includes('|') && isTableSeparator(next))
  );
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

export function renderMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const languageAttr = language ? ` data-language="${escapeHtml(language)}"` : '';
      html.push(`<pre><code${languageAttr}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.includes('|') && isTableSeparator(lines[index + 1] ?? '')) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      html.push(renderTable(tableLines));
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      html.push(`<blockquote><p>${quoteLines.map(renderInline).join('<br>')}</p></blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ''));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && !isSpecialLine(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
  }

  return html.join('\n');
}

export function generateWordDocument(document) {
  const title = document.title || 'Documento';
  const rawMarkdown = document.originalMarkdown || '';
  const bodyMarkdown = stripLeadingTitle(rawMarkdown, title);
  const bodyHtml = renderMarkdown(bodyMarkdown);

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page { margin: 2.2cm 2cm; size: letter; }
    body { font-family: Aptos, Calibri, "Segoe UI", Arial, sans-serif; color: #1f2328; font-size: 11pt; line-height: 1.6; }
    h1 { font-size: 22pt; font-weight: 700; line-height: 1.15; margin: 0 0 16pt; color: #111418; }
    h2 { font-size: 15pt; font-weight: 700; margin: 20pt 0 8pt; color: #111418; }
    h3 { font-size: 12.5pt; font-weight: 700; margin: 16pt 0 6pt; color: #111418; }
    h4 { font-size: 11pt; font-weight: 700; margin: 12pt 0 4pt; color: #111418; }
    p { margin: 0 0 8pt; }
    ul, ol { margin: 4pt 0 10pt 20pt; }
    li { margin: 2pt 0; }
    blockquote { border-left: 3pt solid #6b7280; margin: 10pt 0; padding: 6pt 10pt; color: #374151; background: #f3f4f6; }
    table { width: 100%; border-collapse: collapse; margin: 12pt 0 16pt; }
    th, td { border: 1pt solid #d1d5db; padding: 6pt 8pt; text-align: left; vertical-align: top; font-size: 10pt; }
    th { background: #f3f4f6; font-weight: 700; }
    code { font-family: Consolas, "Courier New", monospace; background: #f3f4f6; font-size: 10pt; }
    pre { font-family: Consolas, "Courier New", monospace; background: #f3f4f6; padding: 8pt; font-size: 9.5pt; white-space: pre-wrap; }
    a { color: #1a56db; text-decoration: underline; }
    hr { border: 0; border-top: 1pt solid #e5e7eb; margin: 18pt 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${bodyHtml}
</body>
</html>`;
}

export function generatePrintDocument(document) {
  const title = document.title || 'Documento';
  const rawMarkdown = document.originalMarkdown || '';
  const bodyMarkdown = stripLeadingTitle(rawMarkdown, title);
  const bodyHtml = renderMarkdown(bodyMarkdown);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} · Bardo</title>
  <style>
    @page {
      margin: 18mm 18mm 20mm;
      size: auto;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0 auto;
      max-width: 800px;
      padding: 32px 24px 64px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111418;
      background: #ffffff;
      line-height: 1.6;
      font-size: 15px;
      -webkit-font-smoothing: antialiased;
    }
    .print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      margin-bottom: 32px;
      background: #f4f5f7;
      border-radius: 10px;
      border: 1px solid #e1e4e8;
    }
    .print-btn {
      background: #111418;
      color: #ffffff;
      border: 0;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .print-btn:hover { background: #333; }
    .doc-header {
      margin-bottom: 28px;
      padding-bottom: 18px;
      border-bottom: 2px solid #111418;
    }
    .doc-eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
      margin: 0 0 6px;
    }
    h1.doc-title {
      font-size: 28px;
      line-height: 1.2;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin: 0;
      color: #0f172a;
    }
    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
      color: #0f172a;
      line-height: 1.25;
      letter-spacing: -0.02em;
      break-after: avoid;
    }
    .markdown-body h1 { font-size: 22px; margin: 28px 0 10px; }
    .markdown-body h2 { font-size: 18px; margin: 24px 0 8px; }
    .markdown-body h3 { font-size: 15px; margin: 18px 0 6px; }
    .markdown-body h4 { font-size: 14px; margin: 14px 0 4px; }
    .markdown-body p { margin: 10px 0; }
    .markdown-body strong { color: #0f172a; }
    .markdown-body a { color: #2563eb; }
    .markdown-body ul, .markdown-body ol { margin: 8px 0 14px; padding-left: 24px; }
    .markdown-body li { margin: 3px 0; }
    .markdown-body blockquote {
      margin: 16px 0;
      padding: 10px 16px;
      border-left: 3px solid #64748b;
      border-radius: 0 8px 8px 0;
      background: #f8fafc;
      color: #334155;
      break-inside: avoid;
    }
    .markdown-body blockquote p { margin: 0; }
    .markdown-body hr {
      border: 0;
      height: 1px;
      background: #e2e8f0;
      margin: 24px 0;
    }
    .markdown-body code {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 0.9em;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    .markdown-body pre {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      overflow-x: auto;
      break-inside: avoid;
    }
    .markdown-body pre code {
      background: transparent;
      padding: 0;
      border: 0;
      font-size: 13px;
      line-height: 1.5;
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      margin: 16px 0;
      break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 700;
    }
    @media print {
      body { padding: 0; max-width: 100%; }
      .print-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <span>Documento listo para imprimir o guardar como PDF</span>
    <button class="print-btn" onclick="window.print()">🖨️ Guardar como PDF / Imprimir</button>
  </div>
  <header class="doc-header">
    <p class="doc-eyebrow">Documento · Bardo</p>
    <h1 class="doc-title">${escapeHtml(title)}</h1>
  </header>
  <article class="markdown-body">
    ${bodyHtml}
  </article>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        try { window.print(); } catch(e) {}
      }, 250);
    });
  </script>
</body>
</html>`;
}
