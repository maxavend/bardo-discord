import {useState, useRef, useEffect} from 'react';
import {Avatar} from '@/components/ui/avatar';
import {Xmark, Plus, Check, Magnifier, ChevronDown} from '@gravity-ui/icons';

export const DEFAULT_DISCORD_MEMBERS = [
  {id: 'u-1', type: 'user', username: 'nico.g', globalName: 'Nico G', tag: '@Nico G', avatarColor: '#5865F2'},
  {id: 'u-2', type: 'user', username: 'camila.carreno', globalName: 'Camila Carreño', tag: '@Camila Carreño', avatarColor: '#EB459E'},
  {id: 'u-3', type: 'user', username: 'daniela', globalName: 'Daniela', tag: '@Daniela', avatarColor: '#57F287'},
  {id: 'u-4', type: 'user', username: 'javi.acuna', globalName: 'Javi Acuña', tag: '@Javi Acuña', avatarColor: '#FEE75C'},
  {id: 'u-5', type: 'user', username: 'max.avendano', globalName: 'Max Avendaño', tag: '@Max Avendaño', avatarColor: '#00A8FC'},
  {id: 'u-6', type: 'user', username: 'carol.t', globalName: 'Carol T', tag: '@Carol T', avatarColor: '#ED4245'},
  {id: 'u-7', type: 'user', username: 'karola', globalName: 'Karola', tag: '@Karola', avatarColor: '#9B59B6'},
  {id: 'u-8', type: 'user', username: 'paula.molina', globalName: 'Paula Molina', tag: '@Paula Molina', avatarColor: '#E67E22'},
];

export const DEFAULT_DISCORD_ROLES = [
  {id: 'r-1', type: 'role', name: 'Diseño & SD', tag: '@Diseño & SD', color: '#5865F2'},
  {id: 'r-2', type: 'role', name: 'Equipo de Desarrollo', tag: '@Devs', color: '#57F287'},
  {id: 'r-3', type: 'role', name: 'Líderes de Proyecto', tag: '@Líderes', color: '#FEE75C'},
  {id: 'r-4', type: 'role', name: 'Frontend', tag: '@Frontend', color: '#00A8FC'},
  {id: 'r-5', type: 'role', name: 'Todos en el canal', tag: '@todos', color: '#EB459E'},
];

export const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

export function getSavedCustomParticipants() {
  try {
    const raw = localStorage.getItem('bardo_discord_custom_participants');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomParticipant(item) {
  try {
    const list = getSavedCustomParticipants();
    if (!list.some((existing) => existing.tag.toLowerCase() === item.tag.toLowerCase())) {
      const next = [...list, item];
      localStorage.setItem('bardo_discord_custom_participants', JSON.stringify(next));
    }
  } catch {}
}

export function getAllDiscordEntities() {
  const liveParticipants = (typeof window !== 'undefined' && window.__bardoLiveParticipants) || [];
  const custom = getSavedCustomParticipants();

  const allMembers = [...DEFAULT_DISCORD_MEMBERS];
  const allRoles = [...DEFAULT_DISCORD_ROLES];

  for (const item of [...liveParticipants, ...custom]) {
    if (item.type === 'role') {
      if (!allRoles.some((r) => r.tag.toLowerCase() === item.tag.toLowerCase())) {
        allRoles.push(item);
      }
    } else {
      if (!allMembers.some((m) => m.tag.toLowerCase() === item.tag.toLowerCase())) {
        allMembers.push(item);
      }
    }
  }

  return {members: allMembers, roles: allRoles};
}

export function parseMentionsToArray(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

export function PlannerMemberPicker({value = '', onChange, _variant = 'secondary'}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);

  const selectedTags = parseMentionsToArray(value);
  const selectedSet = new Set(selectedTags.map((t) => (t.startsWith('@') ? t : `@${t}`)));
  const {members, roles} = getAllDiscordEntities();

  const q = searchQuery.toLowerCase().trim().replace(/^@/, '');
  const filteredRoles = roles.filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q)
  );
  const filteredMembers = members.filter(
    (m) => !q || m.globalName.toLowerCase().includes(q) || m.tag.toLowerCase().includes(q)
  );

  const hasExactMatch = [...roles, ...members].some(
    (e) =>
      e.tag.toLowerCase() === `@${q}`.toLowerCase() ||
      e.tag.toLowerCase() === searchQuery.toLowerCase() ||
      (e.globalName || e.name || '').toLowerCase() === q
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleTag = (tag) => {
    let cleanTag = tag.trim();
    if (!cleanTag.startsWith('@')) cleanTag = `@${cleanTag}`;

    const nextKeys = new Set(Array.from(selectedSet));
    if (nextKeys.has(cleanTag)) {
      nextKeys.delete(cleanTag);
    } else {
      nextKeys.add(cleanTag);
    }
    onChange(Array.from(nextKeys).join(' '));
  };

  const handleRemoveTag = (tagToRemove, e) => {
    e?.stopPropagation();
    const nextKeys = new Set(Array.from(selectedSet));
    nextKeys.delete(tagToRemove);
    onChange(Array.from(nextKeys).join(' '));
  };

  const handleAddGuest = (name) => {
    const rawName = name.trim().replace(/^@/, '');
    if (!rawName) return;
    const cleanTag = `@${rawName}`;

    saveCustomParticipant({
      id: `custom-${Date.now().toString(36)}`,
      type: 'user',
      globalName: rawName,
      username: rawName.toLowerCase().replace(/\s+/g, '.'),
      tag: cleanTag,
      avatarColor:
        DISCORD_PALETTES[
          Math.abs(
            rawName
              .split('')
              .reduce((acc, c) => acc + c.charCodeAt(0), 0)
          ) % DISCORD_PALETTES.length
        ],
    });

    const nextKeys = new Set(Array.from(selectedSet));
    nextKeys.add(cleanTag);
    onChange(Array.from(nextKeys).join(' '));
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Contenedor input donde se escribe directamente */}
      <div
        onClick={() => setIsOpen(true)}
        className="min-h-10 w-full px-3 py-2 rounded-2xl bg-surface-secondary/50 border border-border/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all flex items-center justify-between gap-2 flex-wrap cursor-text"
      >
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {Array.from(selectedSet).map((tag) => {
            const matchedRole = roles.find((r) => r.tag.toLowerCase() === tag.toLowerCase());
            const matchedMember = members.find((m) => m.tag.toLowerCase() === tag.toLowerCase());
            const label = matchedRole?.name || matchedMember?.globalName || tag;
            const color = matchedRole?.color || matchedMember?.avatarColor || '#5865F2';

            return (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold bg-surface border border-border/50 shadow-2xs text-foreground shrink-0"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{backgroundColor: color}}
                />
                <span>{label}</span>
                <button
                  type="button"
                  onClick={(e) => handleRemoveTag(tag, e)}
                  className="text-muted hover:text-foreground p-0.5 rounded-sm cursor-pointer"
                  aria-label={`Eliminar ${label}`}
                >
                  <Xmark width={11} height={11} />
                </button>
              </span>
            );
          })}

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                e.preventDefault();
                handleAddGuest(searchQuery);
              } else if (e.key === 'Backspace' && !searchQuery && selectedSet.size > 0) {
                const lastTag = Array.from(selectedSet).pop();
                if (lastTag) handleRemoveTag(lastTag);
              }
            }}
            placeholder={selectedSet.size === 0 ? 'Buscar personas o roles...' : 'Agregar...'}
            className="text-xs bg-transparent border-0 outline-none p-0 flex-1 min-w-[120px] text-foreground placeholder:text-muted focus:ring-0"
          />
        </div>

        <ChevronDown width={14} height={14} className={`text-muted transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Popover que aparece HACIA ABAJO con ALTO MÁXIMO */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-full min-w-[280px] max-h-64 overflow-y-auto rounded-2xl border border-border/60 bg-surface/98 backdrop-blur-md shadow-xl z-50 p-2 flex flex-col gap-2 transition-all animate-in fade-in slide-in-from-top-1 duration-150">
          {searchQuery.trim() && !hasExactMatch && (
            <div className="pb-1.5 border-b border-border/40">
              <button
                type="button"
                onClick={() => handleAddGuest(searchQuery)}
                className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold text-primary hover:bg-primary/10 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Plus width={13} height={13} className="shrink-0" />
                <span className="truncate">
                  Agregar invitado "<strong>{searchQuery.trim()}</strong>"
                </span>
              </button>
            </div>
          )}

          {filteredRoles.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-muted/70 px-2 py-1 uppercase tracking-wider">
                Roles del servidor
              </div>
              <div className="flex flex-col gap-0.5">
                {filteredRoles.map((role) => {
                  const isSelected = selectedSet.has(role.tag);
                  return (
                    <button
                      key={role.tag}
                      type="button"
                      onClick={() => handleToggleTag(role.tag)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-primary/10 text-foreground font-semibold'
                          : 'hover:bg-surface-secondary/70 text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="w-4.5 h-4.5 rounded-md text-[10px] font-bold flex items-center justify-center text-white shrink-0 shadow-2xs"
                          style={{backgroundColor: role.color}}
                        >
                          #
                        </span>
                        <span className="text-xs font-medium text-foreground truncate">{role.name}</span>
                        <span className="text-[10.5px] text-muted ml-auto truncate">{role.tag}</span>
                      </div>
                      {isSelected && <Check width={14} height={14} className="text-primary shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredMembers.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-muted/70 px-2 py-1 uppercase tracking-wider">
                Miembros del servidor y canal
              </div>
              <div className="flex flex-col gap-0.5">
                {filteredMembers.map((member) => {
                  const isSelected = selectedSet.has(member.tag);
                  return (
                    <button
                      key={member.tag}
                      type="button"
                      onClick={() => handleToggleTag(member.tag)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-primary/10 text-foreground font-semibold'
                          : 'hover:bg-surface-secondary/70 text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Avatar
                          name={member.globalName}
                          size="sm"
                          className="w-5 h-5 text-[9px] font-bold shrink-0 shadow-2xs"
                          style={{
                            backgroundColor: `${member.avatarColor}30`,
                            color: member.avatarColor,
                          }}
                        />
                        <span className="text-xs font-medium text-foreground truncate">{member.globalName}</span>
                        <span className="text-[10.5px] text-muted ml-auto truncate">{member.tag}</span>
                      </div>
                      {isSelected && <Check width={14} height={14} className="text-primary shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredRoles.length === 0 && filteredMembers.length === 0 && !searchQuery.trim() && (
            <div className="px-3 py-3 text-center text-xs text-muted">
              No hay miembros ni roles disponibles.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SearchableParticipantMenu({
  selectedKeys = new Set(),
  onSelectionChange,
  onAddCustomParticipant,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const {members, roles} = getAllDiscordEntities();

  const q = searchQuery.toLowerCase().trim().replace(/^@/, '');
  const filteredRoles = roles.filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q)
  );
  const filteredMembers = members.filter(
    (m) => !q || m.globalName.toLowerCase().includes(q) || m.tag.toLowerCase().includes(q)
  );

  const hasExactMatch = [...roles, ...members].some(
    (e) =>
      e.tag.toLowerCase() === `@${q}`.toLowerCase() ||
      e.tag.toLowerCase() === searchQuery.toLowerCase() ||
      (e.globalName || e.name || '').toLowerCase() === q
  );

  const handleToggle = (tag) => {
    let cleanTag = tag.trim();
    if (!cleanTag.startsWith('@')) cleanTag = `@${cleanTag}`;

    const isCurrentlySelected =
      selectedKeys.has(cleanTag) ||
      selectedKeys.has(cleanTag.replace(/^@/, '')) ||
      Array.from(selectedKeys).some(
        (k) =>
          k.toLowerCase() === cleanTag.toLowerCase() ||
          `@${k.toLowerCase()}` === cleanTag.toLowerCase()
      );

    const nextKeys = new Set(
      Array.from(selectedKeys).map((k) => (k.startsWith('@') ? k : `@${k}`))
    );

    if (isCurrentlySelected) {
      nextKeys.delete(cleanTag);
      nextKeys.delete(cleanTag.replace(/^@/, ''));
      for (const k of Array.from(nextKeys)) {
        if (
          k.toLowerCase() === cleanTag.toLowerCase() ||
          `@${k.toLowerCase()}` === cleanTag.toLowerCase()
        ) {
          nextKeys.delete(k);
        }
      }
    } else {
      nextKeys.add(cleanTag);
    }
    onSelectionChange(Array.from(nextKeys));
  };

  const handleAddGuest = (name) => {
    const rawName = name.trim().replace(/^@/, '');
    if (!rawName) return;
    const cleanTag = `@${rawName}`;

    saveCustomParticipant({
      id: `custom-${Date.now().toString(36)}`,
      type: 'user',
      globalName: rawName,
      username: rawName.toLowerCase().replace(/\s+/g, '.'),
      tag: cleanTag,
      avatarColor:
        DISCORD_PALETTES[
          Math.abs(
            rawName
              .split('')
              .reduce((acc, c) => acc + c.charCodeAt(0), 0)
          ) % DISCORD_PALETTES.length
        ],
    });

    const nextKeys = new Set(selectedKeys);
    nextKeys.add(cleanTag);
    onSelectionChange(Array.from(nextKeys));
    onAddCustomParticipant?.(cleanTag);
    setSearchQuery('');
  };

  return (
    <div className="flex flex-col min-w-[285px] max-w-xs text-xs">
      {/* 1. ROLES DEL SERVIDOR (Superior) */}
      <div className="p-2 pb-1.5 border-b border-border/40">
        <div className="text-[10px] font-bold text-muted/70 px-1.5 pb-1.5 uppercase tracking-wider">
          Roles del servidor
        </div>
        <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
          {filteredRoles.map((role) => {
            const isSelected =
              selectedKeys.has(role.tag) ||
              selectedKeys.has(role.name) ||
              selectedKeys.has(`@${role.name}`) ||
              Array.from(selectedKeys).some(
                (k) =>
                  k.toLowerCase() === role.tag.toLowerCase() ||
                  k.toLowerCase() === `@${role.name.toLowerCase()}`
              );

            return (
              <button
                key={role.tag}
                type="button"
                onClick={() => handleToggle(role.tag)}
                className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-accent/10 text-foreground font-semibold'
                    : 'hover:bg-surface-secondary/70 text-foreground'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    className="w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center text-white shrink-0 shadow-2xs"
                    style={{backgroundColor: role.color}}
                  >
                    #
                  </span>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium text-foreground leading-tight truncate">
                      {role.name}
                    </span>
                    <span className="text-[10.5px] text-muted leading-tight truncate">
                      {role.tag}
                    </span>
                  </div>
                </div>
                <div className="w-5 h-5 flex items-center justify-center shrink-0 ml-auto">
                  {isSelected && (
                    <Check width={14} height={14} className="text-accent" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. SEARCH INPUT (Medio) */}
      <div className="p-2 border-b border-border/40 bg-surface-secondary/20">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-field-background border border-border/50 focus-within:border-accent/80 transition-colors shadow-2xs">
          <Magnifier width={13} height={13} className="text-muted shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                e.preventDefault();
                handleAddGuest(searchQuery);
              }
            }}
            placeholder="Buscar miembro o agregar invitado..."
            className="text-xs bg-transparent border-0 outline-none p-0 w-full text-foreground placeholder:text-muted focus:ring-0"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-muted hover:text-foreground cursor-pointer"
            >
              <Xmark width={12} height={12} />
            </button>
          )}
        </div>
      </div>

      {/* 3. LISTA DE MIEMBROS Y CANAL (Inferior con gap entre elementos) */}
      <div className="max-h-56 overflow-y-auto p-2 flex flex-col gap-1">
        {/* Opción para agregar invitado cuando escribe un nombre */}
        {searchQuery.trim() && !hasExactMatch && (
          <div className="mb-1 pb-1 border-b border-border/40">
            <button
              type="button"
              onClick={() => handleAddGuest(searchQuery)}
              className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold text-accent hover:bg-accent/10 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Plus width={13} height={13} className="shrink-0" />
              <span className="truncate">
                Agregar invitado "<strong>{searchQuery.trim()}</strong>"
              </span>
            </button>
          </div>
        )}

        <div className="text-[10px] font-bold text-muted/70 px-1.5 pt-0.5 pb-1 uppercase tracking-wider">
          Miembros del servidor y canal
        </div>

        {filteredMembers.length > 0 ? (
          filteredMembers.map((member) => {
            const isSelected =
              selectedKeys.has(member.tag) ||
              selectedKeys.has(member.globalName) ||
              selectedKeys.has(`@${member.globalName}`) ||
              Array.from(selectedKeys).some(
                (k) =>
                  k.toLowerCase() === member.tag.toLowerCase() ||
                  k.toLowerCase() === `@${member.globalName.toLowerCase()}` ||
                  k.toLowerCase() === member.globalName.toLowerCase()
              );

            return (
              <button
                key={member.tag}
                type="button"
                onClick={() => handleToggle(member.tag)}
                className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-accent/10 text-foreground font-semibold'
                    : 'hover:bg-surface-secondary/70 text-foreground'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Avatar
                    name={member.globalName}
                    size="sm"
                    className="w-5 h-5 text-[9px] font-bold shrink-0 shadow-2xs"
                    style={{
                      backgroundColor: `${member.avatarColor}30`,
                      color: member.avatarColor,
                    }}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium text-foreground leading-tight truncate">
                      {member.globalName}
                    </span>
                    <span className="text-[10.5px] text-muted leading-tight truncate">
                      {member.tag}
                    </span>
                  </div>
                </div>
                <div className="w-5 h-5 flex items-center justify-center shrink-0 ml-auto">
                  {isSelected && (
                    <Check width={14} height={14} className="text-accent" />
                  )}
                </div>
              </button>
            );
          })
        ) : (
          <div className="px-3 py-3 text-center text-xs text-muted">
            No se encontraron miembros con ese nombre.
          </div>
        )}
      </div>
    </div>
  );
}
