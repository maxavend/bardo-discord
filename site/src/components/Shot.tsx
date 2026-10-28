import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** A real screen of the Activity, cropped to the part that tells; the phone capture under 40rem. */
export function Shot({ name, alt, zoom = 1, origin = '50% 0', ratio = 'aspect-[16/10]', phone = true, className }: {
  name: string; alt: string; zoom?: number; origin?: string; ratio?: string; phone?: boolean; className?: string;
}) {
  return (
    <figure data-slot="shot" data-kind="product" className={cn('relative m-0 overflow-hidden rounded-2xl bg-card shadow-paper outline-1 -outline-offset-1 outline-foreground/8', ratio, phone && 'max-sm:aspect-[4/5]', className)}>
      <picture>
        {phone && <source media="(max-width: 40rem)" srcSet={`/capturas/${name}-movil.png`} width={1170} height={2532} />}
        <img
          src={`/capturas/${name}.png`}
          width={2880}
          height={1800}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover object-top [transform:scale(var(--zoom))] [transform-origin:var(--origin)] max-sm:[transform:none]"
          style={{ '--zoom': zoom, '--origin': origin } as CSSProperties}
        />
      </picture>
    </figure>
  );
}

export function Facts({ items }: { items: string[] }) {
  return (
    <ul className="grid border-b border-border">
      {items.map(item => <li key={item} className="border-t border-border py-3 text-secondary-foreground">{item}</li>)}
    </ul>
  );
}
