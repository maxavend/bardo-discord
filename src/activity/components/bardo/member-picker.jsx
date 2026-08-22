import { useEffect, useState } from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Check, Search, UserRound } from 'lucide-react';

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function MemberPicker({ value, onValueChange, label = 'Responsable', placeholder = 'Buscar miembro de Discord…' }) {
  const [query, setQuery] = useState(value?.displayName || '');
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const normalized = query.trim().replace(/^@/, '');
    if (value?.displayName === query || normalized.length < 2) {
      setMembers([]);
      setStatus('idle');
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const response = await fetch(`/api/member-directory?query=${encodeURIComponent(normalized)}&limit=25`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        setMembers(Array.isArray(payload.members) ? payload.members : []);
        setStatus('ready');
      } catch (error) {
        if (error.name !== 'AbortError') setStatus('error');
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, value?.displayName]);

  return (
    <div className="bardo-member-picker">
      <label className="bardo-field-label" htmlFor="bardo-member-picker-input">{label}</label>
      <ComboboxPrimitive.Root
        items={members}
        filteredItems={members}
        filter={null}
        value={value}
        inputValue={query}
        itemToStringLabel={(member) => member?.displayName || ''}
        itemToStringValue={(member) => member?.userId || ''}
        isItemEqualToValue={(member, selected) => member?.userId === selected?.userId}
        onInputValueChange={(next) => { setQuery(next); if (next !== value?.displayName) onValueChange(null); }}
        onValueChange={(member) => { onValueChange(member); if (member) setQuery(member.displayName); }}
        autoComplete="none"
        autoHighlight="always"
      >
        <div className="bardo-member-picker-input-wrap">
          <Search aria-hidden="true" size={15} />
          <ComboboxPrimitive.Input id="bardo-member-picker-input" className="bardo-ui-input bardo-member-picker-input" placeholder={placeholder} />
        </div>
        {status !== 'idle' ? <ComboboxPrimitive.Portal>
          <ComboboxPrimitive.Positioner className="bardo-ui-float-positioner" sideOffset={5}>
            <ComboboxPrimitive.Popup className="bardo-member-picker-popup">
              <ComboboxPrimitive.List>
                {members.map((member) => (
                  <ComboboxPrimitive.Item className="bardo-member-picker-item" key={member.userId} value={member}>
                    <span className="bardo-member-picker-avatar">
                      {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : initials(member.displayName)}
                    </span>
                    <span className="bardo-member-picker-copy"><strong>{member.displayName}</strong>{member.username ? <small>@{member.username}</small> : null}</span>
                    <ComboboxPrimitive.ItemIndicator><Check aria-hidden="true" size={14} /></ComboboxPrimitive.ItemIndicator>
                  </ComboboxPrimitive.Item>
                ))}
                {status === 'loading' ? <ComboboxPrimitive.Status className="bardo-member-picker-status">Buscando…</ComboboxPrimitive.Status> : null}
                {status === 'ready' && !members.length ? <ComboboxPrimitive.Empty className="bardo-member-picker-status"><UserRound aria-hidden="true" size={16} /> Sin resultados</ComboboxPrimitive.Empty> : null}
                {status === 'error' ? <ComboboxPrimitive.Status className="bardo-member-picker-status">No pudimos buscar miembros. Reintenta.</ComboboxPrimitive.Status> : null}
              </ComboboxPrimitive.List>
            </ComboboxPrimitive.Popup>
          </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal> : null}
      </ComboboxPrimitive.Root>
    </div>
  );
}
