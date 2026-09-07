import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton } from '@/components/ui/input-group';
import {
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { X, Plus, Check, Search } from 'lucide-react';

export const DEFAULT_DISCORD_MEMBERS = [
  { id: 'u-1', type: 'user', username: 'nico.g', globalName: 'Nico G', tag: '@Nico G', avatarColor: '#5865F2' },
  { id: 'u-2', type: 'user', username: 'camila.carreno', globalName: 'Camila Carreño', tag: '@Camila Carreño', avatarColor: '#EB459E' },
  { id: 'u-3', type: 'user', username: 'daniela', globalName: 'Daniela', tag: '@Daniela', avatarColor: '#57F287' },
  { id: 'u-4', type: 'user', username: 'javi.acuna', globalName: 'Javi Acuña', tag: '@Javi Acuña', avatarColor: '#FEE75C' },
  { id: 'u-5', type: 'user', username: 'max.avendano', globalName: 'Max Avendaño', tag: '@Max Avendaño', avatarColor: '#00A8FC' },
  { id: 'u-6', type: 'user', username: 'carol.t', globalName: 'Carol T', tag: '@Carol T', avatarColor: '#ED4245' },
  { id: 'u-7', type: 'user', username: 'karola', globalName: 'Karola', tag: '@Karola', avatarColor: '#9B59B6' },
  { id: 'u-8', type: 'user', username: 'paula.molina', globalName: 'Paula Molina', tag: '@Paula Molina', avatarColor: '#E67E22' },
];

export const DEFAULT_DISCORD_ROLES = [
  { id: 'r-1', type: 'role', name: 'Diseño & SD', tag: '@Diseño & SD', color: '#5865F2' },
  { id: 'r-2', type: 'role', name: 'Equipo de Desarrollo', tag: '@Devs', color: '#57F287' },
  { id: 'r-3', type: 'role', name: 'Líderes de Proyecto', tag: '@Líderes', color: '#FEE75C' },
  { id: 'r-4', type: 'role', name: 'Frontend', tag: '@Frontend', color: '#00A8FC' },
  { id: 'r-5', type: 'role', name: 'Todos en el canal', tag: '@todos', color: '#EB459E' },
];

export const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

const CUSTOM_PARTICIPANTS_KEY = 'bardo.discord.custom-participants.v1';
const LEGACY_CUSTOM_PARTICIPANTS_KEY = 'bardo_discord_custom_participants';

export function getSavedCustomParticipants() {
  try {
    const raw = localStorage.getItem(CUSTOM_PARTICIPANTS_KEY);
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem(LEGACY_CUSTOM_PARTICIPANTS_KEY);
    if (!legacy) return [];
    localStorage.setItem(CUSTOM_PARTICIPANTS_KEY, legacy);
    return JSON.parse(legacy);
  } catch {
    return [];
  }
}

export function saveCustomParticipant(item) {
  try {
    const list = getSavedCustomParticipants();
    if (!list.some((existing) => existing.tag.toLowerCase() === item.tag.toLowerCase())) {
      const next = [...list, item];
      localStorage.setItem(CUSTOM_PARTICIPANTS_KEY, JSON.stringify(next));
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

  return { members: allMembers, roles: allRoles };
}

export function resolveDiscordEntity(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!token) return null;
  const clean = token.replace(/^@/, '');
  const {members, roles} = getAllDiscordEntities();
  return [...members, ...roles].find((entity) => {
    const label = String(entity.globalName || entity.name || '').toLowerCase();
    return entity.id === value
      || String(entity.tag || '').toLowerCase() === token
      || label === clean
      || String(entity.username || '').toLowerCase() === clean;
  }) || null;
}

export function entityIdsFromSelection(keys = []) {
  return Array.from(keys)
    .map((key) => resolveDiscordEntity(key)?.id)
    .filter(Boolean);
}

export function discordColorFor(value, fallbackIndex = 0) {
  const entity = resolveDiscordEntity(value);
  if (entity?.avatarColor || entity?.color) return entity.avatarColor || entity.color;
  const source = String(value || fallbackIndex);
  const hash = source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DISCORD_PALETTES[Math.abs(hash) % DISCORD_PALETTES.length];
}

export function parseMentionsToArray(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

export function SearchableParticipantMenu({
  selectedKeys = new Set(),
  onSelectionChange,
  onAddCustomParticipant,
  singleSelect = false,
  hideRoles = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const { members, roles } = getAllDiscordEntities();

  const q = searchQuery.toLowerCase().trim().replace(/^@/, '');
  const filteredRoles = hideRoles ? [] : roles.filter(
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
    if (singleSelect) {
      onSelectionChange([tag]);
      return;
    }

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
    <div className="flex w-72 max-w-[calc(100vw-2rem)] flex-col p-1 text-xs">
      {/* 1. SEARCH INPUT (Canonical shadcn Combobox placement at the TOP) */}
      <div className="p-1 pb-1.5">
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <Search className="size-3.5 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                e.preventDefault();
                handleAddGuest(searchQuery);
              }
            }}
            placeholder="Buscar miembro o rol..."
            className="text-xs"
          />
          {searchQuery && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" variant="ghost" onClick={() => setSearchQuery('')}>
                <X className="size-3" />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>

      <DropdownMenuSeparator className="my-1" />

      {/* Guest addition option */}
      {searchQuery.trim() && !hasExactMatch && (
        <div className="px-1 py-0.5">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => handleAddGuest(searchQuery)}
            className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium text-primary hover:bg-accent flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="size-3.5 shrink-0" />
                          <span className="truncate">
              Agregar "<strong>{searchQuery.trim()}</strong>"
            </span>
          </Button>
        </div>
      )}

      {/* DropdownMenuContent owns scrolling and collision handling. */}
      <div className="w-full px-1 py-0.5">
        <div className="flex flex-col gap-1 pr-0.5">
          {/* 2. ROLES DEL SERVIDOR */}
          {filteredRoles.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1 text-xs uppercase tracking-wider text-muted-foreground/80">
                Roles del servidor
              </DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
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
                    <Button
            variant="ghost"
            size="sm"
                      key={role.tag}
                      type="button"
                      onClick={() => handleToggle(role.tag)}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground text-foreground"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="size-4 rounded-md text-xs font-bold flex items-center justify-center text-white shrink-0 shadow-2xs"
                          style={{ backgroundColor: role.color }}
                        >
                          #
                        </span>
                        <span className="text-xs font-medium text-foreground truncate">
                          {role.name}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto truncate">
                          {role.tag}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="size-3.5 text-primary shrink-0 ml-1.5" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </DropdownMenuGroup>
          )}

          {/* 3. MIEMBROS DEL SERVIDOR Y CANAL */}
          {filteredMembers.length > 0 && (
            <DropdownMenuGroup>
              {filteredRoles.length > 0 && <DropdownMenuSeparator className="my-1.5" />}
              <DropdownMenuLabel className="px-2 py-1 text-xs uppercase tracking-wider text-muted-foreground/80">
                Miembros del servidor y canal
              </DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                {filteredMembers.map((member) => {
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
                    <Button
            variant="ghost"
            size="sm"
                      key={member.tag}
                      type="button"
                      onClick={() => handleToggle(singleSelect ? member.globalName : member.tag)}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground text-foreground"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Avatar
                          size="xs"
                          className="size-5 text-xs font-bold shrink-0 shadow-2xs"
                          style={{
                            backgroundColor: `${member.avatarColor}30`,
                            color: member.avatarColor,
                          }}
                        >
                          <AvatarFallback style={{ backgroundColor: `${member.avatarColor}30`, color: member.avatarColor }}>
                            {member.globalName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-foreground truncate">
                          {member.globalName}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto truncate">
                          {member.tag}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="size-3.5 text-primary shrink-0 ml-1.5" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </DropdownMenuGroup>
          )}

          {filteredRoles.length === 0 && filteredMembers.length === 0 && !searchQuery.trim() && (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground">
              No hay miembros ni roles disponibles.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
