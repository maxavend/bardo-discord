import {useEffect, useRef, useState} from 'react';
import {MaterialMorphShape} from './demo/MaterialMorphShape.jsx';
import {useLiveMotion} from './demo/bardo-bits';

const CYCLE_MS = 2800;
const FILL_MS = 1800;
function drawWave(line: SVGPathElement | null, width: number, elapsed: number) {
  const progress = Math.min(1, elapsed / FILL_MS);
  const length = Math.max(0, width - 30) * progress * progress * (3 - 2 * progress);
  const flatten = Math.min(1, Math.max(0, (progress - 0.8) / 0.2));
  const amplitude = 3.5 * (1 - flatten * flatten * (3 - 2 * flatten));
  // Same wavelength, phase speed and endpoint envelope as Bardo's live timeline.
  const phase = elapsed * 72 / CYCLE_MS;
  const dampZone = Math.min(28, length * 0.35);
  let path = 'M2 24';
  for (let offset = 3; offset < length; offset += 3) {
    const start = Math.min(1, offset / dampZone);
    const end = Math.min(1, (length - offset) / dampZone);
    const envelope = start * start * (3 - 2 * start) * end * end * (3 - 2 * end);
    const y = 24 + amplitude * envelope * Math.sin(2 * Math.PI * (offset - phase) / 72);
    path += ` L${(offset + 2).toFixed(2)} ${y.toFixed(2)}`;
  }
  line?.setAttribute('d', `${path} L${(length + 2).toFixed(2)} 24`);
}

/** Fill once, settle the line, then keep only the morph ball moving. */
export function FooterSignature() {
  const {ref, visible, reduced} = useLiveMotion<HTMLDivElement>();
  const track = useRef<SVGSVGElement>(null);
  const pulse = useRef<SVGPathElement>(null);
  const width = useRef(0);
  const elapsed = useRef(0);
  const [phase, setPhase] = useState<'static' | 'ready' | 'wave' | 'morph'>('ready');

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = (nextWidth: number) => {
      width.current = nextWidth;
      element.setAttribute('viewBox', `0 0 ${nextWidth} 48`);
      drawWave(pulse.current, nextWidth, elapsed.current);
    };
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const filled = phase === 'morph';
  useEffect(() => {
    if (reduced) { setPhase('static'); return; }
    if (!visible) return;
    if (elapsed.current >= FILL_MS) { setPhase('morph'); return; }
    setPhase('wave');
    let frame = 0;
    let previous = 0;
    const tick = (now: number) => {
      elapsed.current = Math.min(FILL_MS, elapsed.current + (previous ? Math.min(now - previous, 64) : 0));
      previous = now;
      drawWave(pulse.current, width.current, elapsed.current);
      if (elapsed.current >= FILL_MS) { setPhase('morph'); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, reduced, filled]);

  return <div ref={ref} className="footer-signature mt-14" data-phase={phase} aria-hidden="true">
    <div className="footer-signature-mark" data-visible={phase === 'static'}>
      <span />
    </div>
    <svg ref={track} className="footer-signature-pulse" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path ref={pulse} stroke="currentColor" />
    </svg>
    <div className="footer-signature-dot" data-visible={phase === 'static' || filled}>
      <MaterialMorphShape size={20} color="text-punto-night" isActive={filled && !reduced} isPaused={!visible} />
    </div>
  </div>;
}
