import {h2, lead} from '@/lib/site';
import {Facts, Shot} from '@/components/Shot';
import type {ComponentProps} from 'react';

const SPACES = [
  {
    value: 'docs', label: 'Docs', title: 'Escribe o importa, y compártelo en el canal',
    facts: ['Editor por bloques con tablas, listas de tareas y menú con /', 'Importa Markdown, TXT, PDF y DOCX', 'Exporta a Markdown, HTML, PDF o Word'],
    shot: { name: '03-lector', alt: 'Un plan de aventura en Bardo, con la navegación completa de Inicio, Documentos, Reuniones y Tareas' },
  },
  {
    value: 'reuniones', label: 'Reuniones', title: 'Agenda con tiempos, conducida en vivo',
    facts: ['Cada tema con su duración y quien lo facilita', 'El reloj avisa cuando un tema se pasa', 'Al cerrar, un recap con los acuerdos'],
    shot: { name: '05-agenda', alt: 'La agenda de una reunión semanal en Bardo, con temas, duraciones y responsables' },
  },
  {
    value: 'tareas', label: 'Tareas', title: 'Un tablero por canal',
    facts: ['Asignas una tarea y la persona recibe un aviso en Discord', 'Cada tarjeta puede abrir su propio hilo', 'Etiquetas, fechas, prioridad y subtareas'],
    shot: { name: '09-tablero', alt: 'El tablero de tareas de Bardo con cuatro columnas: por hacer, en curso, en revisión y hecho' },
  },
] satisfies Array<{value: string; label: string; title: string; facts: string[]; shot: ComponentProps<typeof Shot>}>;

/** Three complete product stories in ordinary document flow. No scroll state. */
export function SpacesShowcase() {
  return <div className="spaces-showcase">
    <header className="spaces-intro">
      <h2 data-motion-reveal id="spaces-title" className={h2}>Un canal, tres espacios<span className="heading-stop">.</span></h2>
      <p data-motion-reveal className={`${lead} mt-4`}>Cada canal guarda sus documentos, sus reuniones y su tablero.</p>
    </header>
    <div className="spaces-features">
      {SPACES.map(space => <article key={space.value} id={space.value} className="space-feature" aria-labelledby={`${space.value}-title`}>
        <div className="space-feature-copy">
          <h3 data-motion-reveal id={`${space.value}-title`}>{space.title}<span className="heading-stop">.</span></h3>
          <Facts items={space.facts} reveal />
        </div>
        <div data-motion-reveal className="space-feature-image">
          <Shot {...space.shot} frame="none" className="space-product-shot" />
        </div>
      </article>)}
    </div>
  </div>;
}
