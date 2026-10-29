import { cn } from '@/lib/utils';
import captureManifest from '@/lib/captures.json';
import type {CSSProperties} from 'react';

type CaptureName = keyof typeof captureManifest.captures;

/** Show the complete Activity screen; use its phone capture under 40rem. */
export function Shot({ name, alt, phone = true, device = 'desktop', frame = 'plain', className }: {
  name: CaptureName; alt: string; phone?: boolean; device?: 'desktop' | 'mobile'; frame?: 'plain' | 'phone' | 'monitor' | 'none'; className?: string;
}) {
  const capture = captureManifest.captures[name];
  const pictures = (['light', 'dark'] as const).map(theme => <div key={theme} data-shot-theme={theme} className="shot-loader" style={{
    '--shot-aspect': `${capture[theme][device].width} / ${capture[theme][device].height}`,
    '--shot-mobile-aspect': `${capture[theme][phone && frame !== 'monitor' ? 'mobile' : device].width} / ${capture[theme][phone && frame !== 'monitor' ? 'mobile' : device].height}`,
  } as CSSProperties}>
    <div className="t-skel-skeleton is-pulsing shot-skeleton" aria-hidden="true"><div className="shot-skeleton-nav" /><div className="shot-skeleton-title" /><div className="shot-skeleton-line" /><div className="shot-skeleton-body" /></div>
    <picture data-shot-theme={theme} className={cn('t-skel-content block', frame === 'plain' && 'overflow-hidden rounded-lg', frame === 'plain' && device === 'mobile' && 'rounded-3xl')}>
    {phone && frame !== 'monitor' && <source media="(width < 40rem)" srcSet={capture[theme].mobile.src} width={capture[theme].mobile.width} height={capture[theme].mobile.height} />}
    <img
      src={capture[theme][device].src}
      width={capture[theme][device].width}
      height={capture[theme][device].height}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="block h-auto w-full"
    />
    </picture>
    <p data-shot-error hidden role="status">La captura no se pudo cargar.</p>
  </div>);
  return (
    <figure data-slot="shot" data-kind="product" data-frame={frame} data-capture-revision={captureManifest.source.sha} className={cn('motion-shot relative m-0', frame === 'plain' ? 'overflow-hidden rounded-2xl bg-card p-3 shadow-paper outline-1 -outline-offset-1 outline-foreground/8 sm:p-4' : frame !== 'none' && 'device-mockup', className)}>
      {frame === 'plain' || frame === 'none' ? pictures : <div className="device-shell"><div className="device-screen">{pictures}</div></div>}
    </figure>
  );
}

export function Facts({ items, reveal = false }: { items: string[]; reveal?: boolean }) {
  return (
    <ul className="grid border-b border-border">
      {items.map(item => <li data-motion-reveal={reveal || undefined} key={item} className="border-t border-border py-3 text-secondary-foreground">{item}</li>)}
    </ul>
  );
}
