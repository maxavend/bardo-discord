// Bienvenida de la app de escritorio: se muestra una vez, después del primer
// inicio de sesión. Tres pasos cortos; todo se puede cambiar después.
import {useEffect, useRef, useState} from 'react';
import {Display, Moon, Sun} from '@gravity-ui/icons';
import {Button} from '@/components/ui/button';
import {useTheme} from '@/lib/theme';
import {markWelcomeSeen} from '../web/web-session.js';
import {desktopShortcuts, ShortcutKeys} from './shortcuts.jsx';

const THEMES = [
  {value: 'system', label: 'Como el sistema', Icon: Display},
  {value: 'light', label: 'Claro', Icon: Sun},
  {value: 'dark', label: 'Oscuro', Icon: Moon},
];
const STEPS = 3;

export function DesktopWelcome({user, onDone}) {
  const [step, setStep] = useState(0);
  const {theme, setTheme} = useTheme();
  const heading = useRef(null);
  const name = user?.global_name || user?.username || '';

  // Al cambiar de paso el foco va al título (lectores de pantalla); no al abrir.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus();
  }, [step]);

  const finish = () => {
    markWelcomeSeen(user.id);
    onDone();
  };

  const content = [
    {
      title: name ? `Hola, ${name}` : 'Te damos la bienvenida a Bardo',
      body: <p>Cada canal de Discord tiene su espacio en Bardo: documentos, reuniones y tareas. Aquí ves los mismos canales que en Discord y la app recuerda dónde quedaste.</p>,
    },
    {
      title: 'Elige cómo se ve',
      body: <>
        <p>Puedes cambiarlo cuando quieras desde tu menú de usuario.</p>
        <div className="desktop-theme-options" role="group" aria-label="Tema">
          {THEMES.map(({value, label, Icon}) => (
            <button key={value} type="button" aria-pressed={theme === value}
              className="desktop-theme-option" onClick={() => setTheme(value)}>
              <Icon width={20} height={20} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </>,
    },
    {
      title: 'Atajos para ir rápido',
      body: <>
        <p>Funcionan en toda la app, también mientras escribes.</p>
        <ul className="desktop-shortcut-list">
          {desktopShortcuts().slice(0, 5).map(item => (
            <li key={item.label}><span>{item.label}</span><ShortcutKeys keys={item.keys} /></li>
          ))}
        </ul>
      </>,
    },
  ][step];

  const last = step === STEPS - 1;
  return (
    <main className="web-gate web-gate--center">
      <section className="web-gate-card desktop-welcome" aria-labelledby="desktop-welcome-title">
        <span className="workspace-mark web-gate-mark" aria-hidden="true" />
        <p className="desktop-welcome-step">Paso {step + 1} de {STEPS}</p>
        <h1 id="desktop-welcome-title" ref={heading} tabIndex={-1}>{content.title}</h1>
        {content.body}
        <div className="desktop-welcome-actions">
          {step > 0
            ? <Button size="lg" variant="ghost" onClick={() => setStep(step - 1)}>Atrás</Button>
            : <Button size="lg" variant="ghost" onClick={finish}>Saltar</Button>}
          <Button size="lg" onClick={() => (last ? finish() : setStep(step + 1))}>{last ? 'Elegir un canal' : 'Siguiente'}</Button>
        </div>
      </section>
    </main>
  );
}
