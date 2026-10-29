import {useEffect, useLayoutEffect, useRef, useState} from 'react';

/** Keep server-rendered controls inert until their event handlers are ready. */
export function useHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

export function motionMs(element: Element, token: string) {
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  const number = Number.parseFloat(value) || 0;
  return value.endsWith('ms') ? number : number * 1000;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Measure the content, never the animated frame, so resizing cannot feed back. */
export function useMotionHeight() {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const outer = frame.current;
    const inner = content.current;
    if (!outer || !inner || typeof ResizeObserver === 'undefined') return;
    let height = 0;
    let timer = 0;
    const measure = () => {
      const next = Math.ceil(inner.getBoundingClientRect().height);
      if (!next || next === height) return;
      clearTimeout(timer);
      if (!height) outer.style.transition = 'none';
      else outer.dataset.resizing = '';
      outer.style.height = `${next}px`;
      if (!height) {
        void outer.offsetHeight;
        outer.style.removeProperty('transition');
      }
      height = next;
      timer = window.setTimeout(() => delete outer.dataset.resizing, motionMs(outer, '--resize-dur'));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    measure();
    return () => { observer.disconnect(); clearTimeout(timer); outer.style.removeProperty('height'); };
  }, []);
  return {frame, content};
}
