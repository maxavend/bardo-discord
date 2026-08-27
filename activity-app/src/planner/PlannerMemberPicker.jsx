import {useState, useRef, useEffect} from 'react';
import {Xmark, Plus, Check} from '@gravity-ui/icons';

export const DEFAULT_DISCORD_MEMBERS = [
  {id: 'u-1', username: 'nico.g', globalName: 'Nico G', tag: '@Nico G', avatarColor: '#5865F2'},
  {id: 'u-2', username: 'camila.carreno', globalName: 'Camila Carreño', tag: '@Camila Carreño', avatarColor: '#EB459E'},
  {id: 'u-3', username: 'daniela', globalName: 'Daniela', tag: '@Daniela', avatarColor: '#57F287'},
  {id: 'u-4', username: 'javi.acuna', globalName: 'Javi Acuña', tag: '@Javi Acuña', avatarColor: '#FEE75C'},
  {id: 'u-5', username: 'max.avendano', globalName: 'Max Avendaño', tag: '@Max Avendaño', avatarColor: '#00A8FC'},
  {id: 'u-6', username: 'carol.t', globalName: 'Carol T', tag: '@Carol T', avatarColor: '#ED4245'},
  {id: 'u-7', username: 'karola', globalName: 'Karola', tag: '@Karola', avatarColor: '#9B59B6'},
  {id: 'u-8', username: 'paula.molina', globalName: 'Paula Molina', tag: '@Paula Molina', avatarColor: '#E67E22'},
];

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function getInitials(name = '') {
  const clean = name.replace(/^@/, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function parseMentionsToArray(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

export function PlannerMemberPicker({value = '', onChange}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedTags = parseMentionsToArray(value);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const addTag = (tag) => {
    let cleanTag = tag.trim();
    if (!cleanTag.startsWith('@')) cleanTag = `@${cleanTag}`;
    if (!selectedTags.includes(cleanTag)) {
      const next = [...selectedTags, cleanTag].join(' ');
      onChange(next);
    }
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (tagToRemove) => {
    const next = selectedTags.filter((t) => t !== tagToRemove).join(' ');
    onChange(next);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim()) {
        addTag(query);
      }
    } else if (e.key === 'Backspace' && !query && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Filter available Discord guild members
  const availableMembers = DEFAULT_DISCORD_MEMBERS.filter((m) => {
    if (!query) return true;
    const q = query.toLowerCase().replace(/^@/, '');
    return (
      m.globalName.toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q) ||
      m.tag.toLowerCase().includes(q)
    );
  });

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5 w-full">
      {/* Container de Chips y Campo de búsqueda dinámico — Mismo radius (rounded-lg) y altura base (min-h-10) que los inputs */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="min-h-10 px-2.5 py-1.5 rounded-lg bg-field-background border border-field-border focus-within:ring-1 focus-within:ring-focus flex flex-wrap items-center gap-1.5 cursor-text transition-all"
      >
        {selectedTags.map((tag, i) => {
          const matchedMember = DEFAULT_DISCORD_MEMBERS.find(
            (m) => m.tag.toLowerCase() === tag.toLowerCase() || `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
          );
          const color = matchedMember?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
          const initials = getInitials(matchedMember?.globalName || tag);

          return (
            <div
              key={tag}
              className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-full bg-surface-secondary/80 hover:bg-surface-secondary text-xs font-medium text-foreground border border-border/30 select-none h-6"
            >
              <div
                style={{backgroundColor: `${color}25`, color}}
                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                aria-hidden="true"
              >
                {initials}
              </div>
              <span className="max-w-[130px] truncate text-xs">{matchedMember?.globalName || tag}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="w-3.5 h-3.5 rounded-full hover:bg-surface flex items-center justify-center text-muted hover:text-danger cursor-pointer ml-0.5"
                aria-label={`Quitar ${tag}`}
              >
                <Xmark width={10} height={10} />
              </button>
            </div>
          );
        })}

        {/* Input inline */}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? 'Buscar miembros de Discord (@usuario o nombre)...' : 'Añadir otro...'}
          className="flex-1 min-w-[140px] bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted/60 px-1 py-0.5"
        />
      </div>

      {/* Popover / Dropdown de Sugerencias de Discord */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg bg-surface border border-border/60 shadow-lg p-1.5 flex flex-col gap-0.5">
          <div className="px-2.5 py-1 text-[11px] font-semibold text-muted">
            Miembros del servidor Discord
          </div>

          {availableMembers.length > 0 ? (
            availableMembers.map((member) => {
              const isSelected = selectedTags.includes(member.tag);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => addTag(member.tag)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                    isSelected
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'hover:bg-surface-secondary text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      style={{backgroundColor: `${member.avatarColor}25`, color: member.avatarColor}}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    >
                      {getInitials(member.globalName)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{member.globalName}</span>
                      <span className="text-[10px] text-muted truncate">@{member.username}</span>
                    </div>
                  </div>

                  {isSelected ? (
                    <Check width={14} height={14} className="text-accent shrink-0" />
                  ) : (
                    <Plus width={13} height={13} className="text-muted/60 shrink-0" />
                  )}
                </button>
              );
            })
          ) : (
            <div className="p-3 text-center text-xs text-muted">
              No se encontraron usuarios con ese nombre.
            </div>
          )}

          {/* Opción para agregar texto libre como mención */}
          {query.trim() && !availableMembers.some((m) => m.globalName.toLowerCase() === query.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => addTag(query)}
              className="w-full flex items-center gap-2 px-2.5 py-2 mt-1 border-t border-border/40 rounded-lg text-xs text-accent hover:bg-accent/10 transition-colors text-left cursor-pointer font-medium"
            >
              <Plus width={14} height={14} />
              <span>Añadir &ldquo;{query.startsWith('@') ? query : `@${query}`}&rdquo; como convocado</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
