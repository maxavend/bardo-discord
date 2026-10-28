// Docs / Reuniones / Tareas behind the Activity's own sliding tabs. Rendered to
// HTML at build time (the Docs panel), hydrated when it scrolls into view.
import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Facts, Shot } from '@/components/Shot';

const SPACES = [
  {
    value: 'docs', label: 'Docs', title: 'Escribe o importa, y compártelo en el canal',
    facts: ['Editor por bloques con tablas, listas de tareas y menú con /', 'Importa Markdown, TXT, PDF y DOCX', 'Exporta a Markdown, HTML, PDF o Word'],
    shot: { name: '04-editor', zoom: 1.7, alt: 'El editor de Bardo con un documento de especificación, su barra de formato y una lista numerada' },
  },
  {
    value: 'reuniones', label: 'Reuniones', title: 'Agenda con tiempos, conducida en vivo',
    facts: ['Cada tema con su duración y quien lo facilita', 'El reloj avisa cuando un tema se pasa', 'Al cerrar, un recap con los acuerdos'],
    shot: { name: '05-agenda', zoom: 1.45, alt: 'La agenda de una reunión semanal en Bardo, con temas, duraciones y responsables' },
  },
  {
    value: 'tareas', label: 'Tareas', title: 'Un tablero por canal',
    facts: ['Asignas una tarea y la persona recibe un aviso en Discord', 'Cada tarjeta puede abrir su propio hilo', 'Etiquetas, fechas, prioridad y subtareas'],
    shot: { name: '09-tablero', zoom: 1.25, origin: '0 0', alt: 'El tablero de tareas de Bardo con cuatro columnas: por hacer, en curso, en revisión y hecho' },
  },
];

const fromHash = () => {
  const value = typeof location === 'undefined' ? '' : location.hash.slice(1);
  return SPACES.some(space => space.value === value) ? value : null;
};

export function SpacesTabs() {
  // #docs, #reuniones and #tareas (the footer's links) open their tab.
  const [value, setValue] = useState('docs');
  useEffect(() => {
    const sync = () => { const hashed = fromHash(); if (hashed) setValue(hashed); };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return (
    <Tabs value={value} onValueChange={next => setValue(String(next))} className="gap-10">
      <TabsList className="h-11! w-full sm:w-fit">
        {SPACES.map(space => <TabsTrigger key={space.value} value={space.value} className="px-5">{space.label}</TabsTrigger>)}
      </TabsList>
      {SPACES.map(space => (
        <TabsContent key={space.value} value={space.value} className="grid items-center gap-x-16 gap-y-10 text-base lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div className="grid gap-6">
            <h3 className="max-w-[24ch] text-[clamp(1.25rem,0.75vw+0.875rem,1.625rem)] leading-tight">{space.title}</h3>
            <Facts items={space.facts} />
          </div>
          <Shot {...space.shot} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
