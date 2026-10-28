// Fondo de la opción activa que se desliza entre opciones, como las pestañas
// del hub. Va como primer hijo de un grupo de selección única (botones con
// aria-pressed, pestañas con aria-selected o enlaces con aria-current) y se mide solo: cualquier cambio
// de selección o de tamaño lo reubica, sin que el grupo tenga que avisarle.
import {useLayoutEffect, useRef} from 'react';

const ACTIVE = ':scope > [aria-pressed="true"], :scope > [aria-selected="true"], :scope > [aria-current="page"]';

export function SegmentIndicator() {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const group = ref.current?.parentElement;
    if (!group) return undefined;
    let frame = 0;
    const place = () => {
      const active = group.querySelector(ACTIVE);
      if (!active || !active.offsetWidth) {
        delete group.dataset.segmentReady;
        delete group.dataset.segmentAnimate;
        return;
      }
      group.style.setProperty('--segment-left', `${active.offsetLeft}px`);
      group.style.setProperty('--segment-top', `${active.offsetTop}px`);
      group.style.setProperty('--segment-width', `${active.offsetWidth}px`);
      group.style.setProperty('--segment-height', `${active.offsetHeight}px`);
      group.style.setProperty('--segment-radius', getComputedStyle(active).borderTopLeftRadius);
      if (!('segmentReady' in group.dataset)) {
        // La primera vez aparece en su sitio; desde ahí, se desliza.
        group.dataset.segmentReady = '';
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { group.dataset.segmentAnimate = ''; });
      }
    };
    place();
    const attributes = new MutationObserver(place);
    attributes.observe(group, {subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'aria-current'], childList: true});
    const size = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    size?.observe(group);
    return () => {
      cancelAnimationFrame(frame);
      attributes.disconnect();
      size?.disconnect();
      delete group.dataset.segmentReady;
      delete group.dataset.segmentAnimate;
    };
  }, []);

  return <span ref={ref} className="segment-indicator" aria-hidden="true" />;
}
