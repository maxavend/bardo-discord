import {readFileSync, writeFileSync} from 'node:fs';

export function applyComponentAudit(filePath) {
  let source = readFileSync(filePath, 'utf8');
  const replace = (before, after, label) => {
    if (!source.includes(before)) throw new Error(`HeroUI audit transform missing pattern: ${label}`);
    source = source.replace(before, after);
  };
  const replaceRegex = (pattern, after, label) => {
    if (!pattern.test(source)) throw new Error(`HeroUI audit transform missing pattern: ${label}`);
    source = source.replace(pattern, after);
  };

  replace(
`import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';`,
`import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';`,
'remove unused React namespace',
  );

  replace(
`import {\n  Button,\n  Dropdown,\n  Input,\n  Label,\n  ListBox,\n  Modal,\n  Select,\n} from '@heroui/react';`,
`import {\n  Button,\n  Input,\n  Label,\n  Modal,\n  SearchField,\n  TextField,\n  ToastProvider,\n  Toolbar,\n  toast,\n} from '@heroui/react';`,
'HeroUI imports without web dropdown primitives',
  );

  replace(`  const [toast, setToast] = useState('');\n`, '', 'remove local toast state');
  replace(`  const toastTimer = useRef(null);\n`, '', 'remove local toast timer');
  replace(
`  const showToast = useCallback(message => {\n    setToast(message);\n    clearTimeout(toastTimer.current);\n    toastTimer.current = setTimeout(() => setToast(''), 1800);\n  }, []);`,
`  const showToast = useCallback(message => {\n    toast(message);\n  }, []);`,
'HeroUI toast queue',
  );

  replace(
`        <div className="search-wrap">\n          <span className="search-leading"><Icon name="search" size={19}/></span>\n          <Input aria-label="Buscar documentos" variant="secondary" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar" className="search-input" />\n        </div>`,
`        <SearchField\n          aria-label="Buscar documentos"\n          fullWidth\n          value={query}\n          onChange={setQuery}\n          onClear={() => setQuery('')}\n          className="docs-search"\n        >\n          <SearchField.Group>\n            <SearchField.SearchIcon/>\n            <SearchField.Input placeholder="Buscar"/>\n            <SearchField.ClearButton/>\n          </SearchField.Group>\n        </SearchField>`,
'HeroUI SearchField',
  );

  replace(
`      <span className="native-menu-visual" aria-hidden="true">•••</span>`,
`      <span className="native-menu-visual" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><circle cx="9" cy="4" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="9" cy="14" r="1.6"/></svg></span>`,
'vertical kebab visual',
  );

  replace(
`          <div className="editor-toolbar" role="toolbar" aria-label="Formato del documento">`,
`          <Toolbar isAttached className="editor-toolbar" aria-label="Formato del documento">`,
'HeroUI Toolbar open',
  );

  replaceRegex(
/            <Select aria-label="Tipo de texto"[\s\S]*?<\/Select>/,
`            <select\n              aria-label="Tipo de texto"\n              className="block-select native-option-select"\n              value={blockValue}\n              onChange={e => {\n                const value = e.target.value;\n                setBlockValue(value);\n                applyBlock(value);\n              }}\n            >\n              {BLOCK_OPTIONS.map(([id,label]) => <option key={id} value={id}>{label}</option>)}\n            </select>`,
'native block format select',
  );

  replace(
`            <InsertDropdown onAction={runFormat}/>`,
`            <NativeInsertMenu onAction={runFormat}/>`,
'native insert menu usage',
  );

  replace(
`              onAction={runFormat}\n            />\n          </div>\n        </div>`,
`              onAction={runFormat}\n            />\n          </Toolbar>\n        </div>`,
'HeroUI Toolbar close',
  );

  replace(
`return <Button aria-label={label} aria-pressed={active} isIconOnly size="sm" variant={active ? 'secondary' : 'ghost'} onPress={onPress} className={\`toolbar-button \${className}\`}>{children}</Button>;`,
`return <Button aria-label={label} aria-pressed={active} isIconOnly size="md" variant={active ? 'secondary' : 'ghost'} onPress={onPress} className={\`toolbar-button \${className}\`}>{children}</Button>;`,
'toolbar target size',
  );

  replaceRegex(
/function InsertDropdown\(\{onAction\}\) \{[\s\S]*?\n\}\n\nfunction AppModal/,
`function NativeInsertMenu({onAction}) {\n  return (\n    <span className="native-menu native-insert-menu">\n      <span className="native-menu-visual" aria-hidden="true"><Icon name="plus" size={18}/></span>\n      <select\n        aria-label="Insertar bloque"\n        value=""\n        onChange={e => {\n          const value = e.target.value;\n          if (value) onAction(value);\n        }}\n      >\n        <option value="" disabled>Insertar</option>\n        <option value="checklist">☑︎  Checklist</option>\n        <option value="callout">▣  Nota</option>\n        <option value="spoiler">▸  Desplegable</option>\n        <option value="hr">—  Separador</option>\n      </select>\n    </span>\n  );\n}\n\nfunction AppModal`,
'native insert menu component',
  );

  replace(
`              {isLink && <Input autoFocus aria-label="URL" placeholder="https://…" value={linkValue} onChange={e => setLinkValue(e.target.value)} />}`,
`              {isLink && (\n                <TextField className="modal-field">\n                  <Label>URL</Label>\n                  <Input autoFocus variant="primary" placeholder="https://…" value={linkValue} onChange={e => setLinkValue(e.target.value)} />\n                </TextField>\n              )}`,
'link TextField composition',
  );

  replace(
`      <div className={\`toast \${toast ? 'is-visible' : ''}\`} role="status" aria-live="polite">{toast}</div>`,
`      <ToastProvider placement="bottom"/>`,
'HeroUI ToastProvider',
  );

  const forbidden = [
    'search-wrap',
    'search-input',
    'role="toolbar"',
    'className={`toast ',
    '<Dropdown',
    '<Select',
    '<ListBox',
    'function InsertDropdown',
    '>•••<',
  ];
  for (const token of forbidden) {
    if (source.includes(token)) throw new Error(`HeroUI audit left legacy implementation: ${token}`);
  }

  writeFileSync(filePath, source);
}

if (process.argv[1]?.endsWith('apply-component-audit.mjs')) {
  const filePath = process.argv[2];
  if (!filePath) throw new Error('Usage: apply-component-audit.mjs <App.jsx>');
  applyComponentAudit(filePath);
  console.log(`Applied HeroUI component audit to ${filePath}`);
}
