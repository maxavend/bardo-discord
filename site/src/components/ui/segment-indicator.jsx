// Fondo de la opción activa que se desliza entre opciones, como las pestañas
// del hub. Va como primer hijo de un grupo de selección única (botones con
// aria-pressed o pestañas con aria-selected) y se mide solo: cualquier cambio
// de selección o de tamaño lo reubica, sin que el grupo tenga que avisarle.
import {useLayoutEffect, useRef} from 'react';

const ACTIVE = ':scope > [aria-pressed="true"], :scope > [aria-selected="true"], :scope > [aria-current="step"]';

export function SegmentIndicator() {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const group = ref.current?.parentElement;
    if (!group) return undefined;
    let frame = 0;
    const place = (animate = true) => {
      const active = group.querySelector(ACTIVE);
      if (!active || !active.offsetWidth) {
        delete group.dataset.segmentReady;
        delete group.dataset.segmentAnimate;
        return;
      }
      const pill = ref.current;
      const first = !('segmentReady' in group.dataset);
      if (!animate || first) pill.style.transition = 'none';
      pill.style.transform = `translateX(${active.offsetLeft}px)`;
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.height = `${active.offsetHeight}px`;
      pill.style.top = `${active.offsetTop}px`;
      if (!animate || first) {
        void pill.offsetWidth;
        pill.style.removeProperty('transition');
      }
      if (!('segmentReady' in group.dataset)) {
        // La primera vez aparece en su sitio; desde ahí, se desliza.
        group.dataset.segmentReady = '';
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { group.dataset.segmentAnimate = ''; });
      }
    };
    place(false);
    const attributes = new MutationObserver(() => place(true));
    attributes.observe(group, {subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'aria-current'], childList: true});
    const size = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place(false)) : null;
    size?.observe(group);
    group.querySelectorAll('[role="tab"], a').forEach(tab => size?.observe(tab));
    return () => {
      cancelAnimationFrame(frame);
      attributes.disconnect();
      size?.disconnect();
      delete group.dataset.segmentReady;
      delete group.dataset.segmentAnimate;
    };
  }, []);

  return <span ref={ref} className="segment-indicator t-tabs-pill" aria-hidden="true" />;
}
