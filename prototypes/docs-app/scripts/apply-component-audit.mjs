import {readFileSync, writeFileSync} from 'node:fs';

export function applyComponentAudit(filePath) {
  let source = readFileSync(filePath, 'utf8');
  const replace = (before, after, label) => {
    if (!source.includes(before)) throw new Error(`HeroUI audit transform missing pattern: ${label}`);
    source = source.replace(before, after);
  };

  replace(
`  Modal,\n  Select,\n} from '@heroui/react';`,
`  Modal,\n  SearchField,\n  Select,\n  TextField,\n  ToastProvider,\n  Toolbar,\n  toast,\n} from '@heroui/react';`,
'import compounds',
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
`          <div className="editor-toolbar" role="toolbar" aria-label="Formato del documento">`,
`          <Toolbar isAttached className="editor-toolbar" aria-label="Formato del documento">`,
'HeroUI Toolbar open',
  );
  replace(
`            <Select aria-label="Tipo de texto" value={blockValue} onChange={value => {setBlockValue(String(value || 'p')); applyBlock(value);}} className="block-select">`,
`            <Select aria-label="Tipo de texto" variant="secondary" value={blockValue} onChange={value => {setBlockValue(String(value || 'p')); applyBlock(value);}} className="block-select">`,
'Select surface hierarchy',
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
  replace(
`        <Button aria-label="Insertar bloque" isIconOnly size="sm" variant="ghost" className="toolbar-button"><Icon name="plus" size={18}/></Button>`,
`        <Button aria-label="Insertar bloque" isIconOnly size="md" variant="ghost" className="toolbar-button"><Icon name="plus" size={18}/></Button>`,
'insert target size',
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

  writeFileSync(filePath, source);
}

if (process.argv[1]?.endsWith('apply-component-audit.mjs')) {
  const filePath = process.argv[2];
  if (!filePath) throw new Error('Usage: apply-component-audit.mjs <App.jsx>');
  applyComponentAudit(filePath);
  console.log(`Applied HeroUI component audit to ${filePath}`);
}
