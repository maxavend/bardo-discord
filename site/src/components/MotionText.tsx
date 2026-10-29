import {useLayoutEffect, useRef} from 'react';
import {motionMs, useReducedMotion} from '@/lib/motion';
import {cn} from '@/lib/utils';

/** Isolated text slot: React owns the wrapper; the soft-swap owns its contents. */
export function MotionText({text, className}: {text: string; className?: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  const initial = useRef(text);
  const previous = useRef(text);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = previous.current;
    previous.current = text;
    if (prev === text || reduced || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = text;
      el.classList.remove('is-swapping');
      el.style.removeProperty('width');
      return;
    }
    const out = document.createElement('span');
    out.className = 't-text-soft-old';
    out.setAttribute('aria-hidden', 'true');
    out.textContent = prev;
    const incoming = document.createElement('span');
    incoming.className = 't-text-soft-new';
    incoming.textContent = text;
    const width = el.getBoundingClientRect().width;
    el.classList.remove('is-swapping');
    el.replaceChildren(out, incoming);
    const nextWidth = incoming.getBoundingClientRect().width;
    el.style.width = `${width}px`;
    void el.offsetWidth;
    el.classList.add('is-swapping');
    el.style.width = `${nextWidth}px`;
    const timer = window.setTimeout(() => {
      el.textContent = text;
      el.style.removeProperty('width');
      el.classList.remove('is-swapping');
    }, Math.max(motionMs(el, '--text-soft-dur'), motionMs(el, '--text-soft-resize-dur')) + 40);
    return () => clearTimeout(timer);
  }, [text, reduced]);
  return <span ref={ref} className={cn('t-text-soft', className)}>{initial.current}</span>;
}
