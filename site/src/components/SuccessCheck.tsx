import {useLayoutEffect, useRef} from 'react';
import {Check} from 'lucide-react';
import {cn} from '@/lib/utils';

export function SuccessCheck({className}: {className?: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll<SVGGeometryElement>('svg path, svg polyline').forEach(path => {
      const length = Math.ceil(path.getTotalLength()) + 1;
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
    });
    el.dataset.state = 'out';
    void el.offsetWidth;
    el.dataset.state = 'in';
  }, []);
  return <span ref={ref} className={cn('t-success-check', className)} data-state="in" aria-hidden="true"><Check className="size-4" /></span>;
}
