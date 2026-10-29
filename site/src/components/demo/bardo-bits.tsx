// Small pieces of the Activity, rebuilt without its runtime (Discord SDK,
// directory, stores): same markup and classes as planner/PlannerMemberPicker.jsx
// and kanban/kanban-ui.jsx, fed with the landing’s fictional multiverse data.
import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import demo from '@/lib/demo-data.json';

export type Member = { name: string; color: MemberColor };
type MemberColor = 'blurple' | 'green' | 'yellow' | 'pink' | 'sky' | 'red' | 'purple' | 'orange';

export const MEMBERS = demo.members as Record<keyof typeof demo.members, Member>;

const AVATAR_SIZES = {
  sm: { box: 'size-5', text: 'text-[8.5px]' },
  md: { box: 'size-6', text: 'text-[10px]' },
};

export function MemberAvatar({ member, size = 'sm', className }: { member: Member; size?: keyof typeof AVATAR_SIZES; className?: string }) {
  const tint = { backgroundColor: `color-mix(in oklab, var(--member-${member.color}) 19%, transparent)`, color: `var(--member-${member.color})` };
  const { box, text } = AVATAR_SIZES[size];
  return (
    <Avatar className={cn(box, 'shrink-0 after:hidden', className)} style={tint}>
      <AvatarFallback className={cn(text, 'font-bold leading-none tracking-tight')} style={tint}>
        {member.name.split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export type Tag = { name: string; color: 'gray' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'pink' };
const TAG_COLOR_VAR: Record<Tag['color'], string> = {
  gray: 'var(--muted-foreground)', blue: 'var(--member-blurple)', green: 'var(--member-green)', yellow: 'var(--member-yellow)',
  orange: 'var(--member-orange)', red: 'var(--member-red)', purple: 'var(--member-purple)', pink: 'var(--member-pink)',
};

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 px-1.5 py-px text-[10.5px] font-medium text-foreground">
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: TAG_COLOR_VAR[tag.color] }} />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

export function PriorityBadge({ priority }: { priority?: 'high' | 'urgent' }) {
  if (!priority) return null;
  return (
    <Badge variant={priority === 'urgent' ? 'destructive' : 'secondary'} className="text-[10.5px] font-semibold">
      {priority === 'urgent' ? 'Urgente' : 'Alta'}
    </Badge>
  );
}

/** True while the element is on screen and the reader has not asked for less motion. */
export function useLiveMotion<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    let intersecting = false;
    const updateVisibility = () => setVisible(intersecting && !document.hidden);
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      updateVisibility();
    }, { threshold: 0.2 }) : null;
    if (ref.current && observer) observer.observe(ref.current);
    if (!observer) { intersecting = true; updateVisibility(); }
    document.addEventListener('visibilitychange', updateVisibility);
    return () => { query.removeEventListener('change', sync); observer?.disconnect(); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);
  return { ref, visible, reduced };
}
