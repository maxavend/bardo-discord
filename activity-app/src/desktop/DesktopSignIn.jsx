// Inicio de sesión de Bardo para escritorio. Discord se abre en el navegador
// del sistema (donde ya tienes tu sesión) y la app espera la confirmación.
import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {DiscordMark} from '../web/DiscordMark.jsx';
import {desktopBridge} from './desktop-bridge.js';

export function DesktopSignIn({message, onSignedIn}) {
  const [phase, setPhase] = useState('idle');
  const [notice, setNotice] = useState(message || null);
  const heading = useRef(null);
  const bridge = desktopBridge();

  useEffect(() => bridge?.onSignInProgress(step => {
    if (step === 'authorized') setPhase('finishing');
  }), [bridge]);

  // Al cambiar de paso el foco va al título (lectores de pantalla); no al abrir.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus();
  }, [phase]);

  const signIn = async () => {
    setNotice(null);
    setPhase('waiting');
    try {
      await bridge.signIn();
      setPhase('finishing');
      onSignedIn?.();
    } catch (error) {
      setPhase('idle');
      // Cancelar es una decisión, no un error: se avisa sin alarma.
      setNotice(error?.code === 'cancelled' ? null : error?.message || 'No pudimos iniciar tu sesión. Vuelve a intentarlo.');
    }
  };

  if (phase === 'waiting' || phase === 'finishing') {
    const finishing = phase === 'finishing';
    return (
      <main className="web-gate web-gate--center">
        <section className="web-gate-card desktop-signin" aria-labelledby="desktop-signin-title" aria-live="polite">
          <div className="bardo-loader desktop-signin-loader" role="img" aria-label={finishing ? 'Entrando a Bardo' : 'Esperando a tu navegador'}>
            <div className="bardo-loader__eyes" aria-hidden="true">
              <span className="bardo-loader__eye" />
              <span className="bardo-loader__eye" />
            </div>
          </div>
          <h1 id="desktop-signin-title" ref={heading} tabIndex={-1}>{finishing ? 'Entrando a Bardo…' : 'Continúa en tu navegador'}</h1>
          <p>{finishing
            ? 'Listo. Estamos abriendo tu espacio.'
            : 'Abrimos Discord en tu navegador. Confirma ahí y vuelve: la app sigue sola.'}</p>
          {!finishing && <div className="desktop-signin-actions">
            <Button variant="outline" onClick={() => void bridge.reopenSignIn()}>Abrir el navegador de nuevo</Button>
            <Button variant="ghost" onClick={() => void bridge.cancelSignIn()}>Cancelar</Button>
          </div>}
        </section>
      </main>
    );
  }

  return (
    <main className="web-gate web-gate--center">
      <section className="web-gate-card" aria-labelledby="desktop-signin-title">
        <span className="workspace-mark web-gate-mark" aria-hidden="true" />
        <h1 id="desktop-signin-title" ref={heading} tabIndex={-1}>Entra a Bardo</h1>
        <p>Tus documentos, reuniones y tareas de cada canal de Discord, en una app para tu escritorio.</p>
        {notice && <p className="web-gate-alert" role="alert">{notice}</p>}
        <Button size="lg" className="web-gate-primary" onClick={() => void signIn()}>
          <DiscordMark /> Continuar con Discord
        </Button>
        <p className="web-gate-note">Se abre tu navegador para confirmar con Discord. Bardo no crea una cuenta aparte: solo usa tu nombre y avatar, y verás lo mismo que puedes ver allí.</p>
      </section>
    </main>
  );
}
