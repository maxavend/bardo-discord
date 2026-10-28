import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ENDPOINT = '/api/lista-de-espera';
type Status = { state: 'idle' | 'sending' | 'done' | 'error'; message: string };

export function WaitlistForm() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ state: 'idle', message: '' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('email') as HTMLInputElement;
    if (!input.checkValidity()) {
      setStatus({ state: 'error', message: 'Ese correo parece incompleto. Escríbelo como nombre@ejemplo.com.' });
      input.focus();
      return;
    }
    setStatus({ state: 'sending', message: 'Enviando…' });
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({ state: 'error', message: data.message || 'No se pudo guardar tu correo. Inténtalo de nuevo en un minuto.' });
        return;
      }
      setStatus({ state: 'done', message: `Listo. Te escribiremos a ${email.trim()} cuando abra la versión web.` });
      setEmail('');
    } catch {
      setStatus({ state: 'error', message: 'No se pudo guardar tu correo. Revisa tu conexión e inténtalo de nuevo.' });
    }
  }

  const invalid = status.state === 'error';
  return (
    <form onSubmit={submit} noValidate className="grid gap-2">
      <label htmlFor={`${id}-email`} className="font-semibold">Te avisamos cuando abra la versión web</label>
      <div className="flex gap-2 max-sm:flex-col">
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={event => setEmail(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-help`}
          className="h-12 flex-1 rounded-full border-muted-foreground bg-card px-5 text-base"
        />
        <Button type="submit" size="lg" className="h-12 rounded-full px-6 text-base font-semibold" disabled={status.state === 'sending'}>
          Avisarme
        </Button>
      </div>
      <p id={`${id}-help`} aria-live="polite" className={cn('min-h-5 text-sm', invalid ? 'text-destructive' : 'text-muted-foreground')}>
        {status.message}
      </p>
      <p className="text-sm text-muted-foreground">
        Solo usamos tu correo para este aviso. <a href="/privacidad" className="text-primary underline underline-offset-4">Privacidad</a>
      </p>
    </form>
  );
}
