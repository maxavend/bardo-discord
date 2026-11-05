// Conexiones de IA: quién tiene acceso a Bardo en tu nombre (Claude Code, Codex
// u otro cliente MCP), con la opción de revocarlo, y la dirección para conectar.
import {useCallback, useEffect, useState} from 'react';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {copyTextToClipboard} from '../docs-clipboard.js';

const SCOPE_LABELS = {
  'bardo:read': 'Leer',
  'bardo:write': 'Crear y editar',
  'bardo:share': 'Publicar y borrar',
};

const dateFormat = new Intl.DateTimeFormat('es', {dateStyle: 'medium'});
const formatDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
};

function ConnectionRow({connection, revoking, onRevoke}) {
  const lastUsed = connection.lastUsedAt ? formatDate(connection.lastUsedAt) : null;
  return (
    <li className="web-connection">
      <span className="web-connection-text">
        <span className="web-connection-name">{connection.clientName}</span>
        <span className="web-connection-meta">{connection.scopes.map(scope => SCOPE_LABELS[scope] || scope).join(' · ')}</span>
        <span className="web-connection-meta">{lastUsed ? `Último uso: ${lastUsed}` : 'Sin usar todavía'}</span>
      </span>
      <Button variant="outline" size="sm" disabled={revoking} onClick={() => onRevoke(connection)} aria-label={`Revocar ${connection.clientName}`}>
        {revoking ? 'Revocando…' : 'Revocar'}
      </Button>
    </li>
  );
}

export function WebConnectionsDialog({open, onOpenChange}) {
  const [state, setState] = useState({status: 'loading', connections: []});
  const [revoking, setRevoking] = useState(null);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  const mcpUrl = `${window.location.origin}/mcp`;

  const load = useCallback(async () => {
    setState({status: 'loading', connections: []});
    try {
      const response = await fetch('/api/web/connections', {headers: {Accept: 'application/json'}, cache: 'no-store'});
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.connections)) throw new Error('load_failed');
      setState({status: 'ready', connections: payload.connections});
    } catch {
      setState({status: 'error', connections: []});
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setNotice(null);
    setCopied(false);
    void load();
  }, [open, load]);

  const revoke = async connection => {
    setRevoking(connection.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/web/connections/${encodeURIComponent(connection.id)}`, {method: 'DELETE', headers: {Accept: 'application/json'}});
      if (!response.ok && response.status !== 404) throw new Error('revoke_failed');
      setState(current => ({...current, connections: current.connections.filter(item => item.id !== connection.id)}));
      setNotice(`${connection.clientName} ya no puede usar Bardo.`);
    } catch {
      setNotice(`No pudimos revocar ${connection.clientName}. Inténtalo de nuevo.`);
    } finally {
      setRevoking(null);
    }
  };

  const copy = async () => {
    const ok = await copyTextToClipboard(mcpUrl).then(result => result !== false).catch(() => false);
    setCopied(ok);
    setNotice(ok ? null : 'No se pudo copiar. Selecciona la dirección y cópiala a mano.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conexiones de IA</DialogTitle>
          <DialogDescription>Las herramientas que autorices actúan con tu nombre, solo donde tienes acceso en Discord.</DialogDescription>
        </DialogHeader>

        <div className="web-connection-url">
          <code>{mcpUrl}</code>
          <Button variant="outline" size="sm" onClick={() => void copy()}>{copied ? 'Copiada' : 'Copiar'}</Button>
        </div>
        <p className="web-connection-hint">Agrega esta dirección como servidor MCP en Claude Code, Codex u otra herramienta. Te pedirá autorizarla aquí.</p>

        {notice && <p className="web-connection-hint" role="status">{notice}</p>}

        {state.status === 'loading' && <p className="web-connection-hint" role="status">Cargando conexiones…</p>}
        {state.status === 'error' && (
          <div className="web-connection-error" role="alert">
            <p>No pudimos cargar tus conexiones.</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>Intentar de nuevo</Button>
          </div>
        )}
        {state.status === 'ready' && !state.connections.length && <p className="web-connection-hint">Todavía no has conectado ninguna herramienta.</p>}
        {state.status === 'ready' && state.connections.length > 0 && (
          <ul className="web-connection-list">
            {state.connections.map(connection => (
              <ConnectionRow key={connection.id} connection={connection} revoking={revoking === connection.id} onRevoke={revoke} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
