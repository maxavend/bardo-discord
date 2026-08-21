import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, toast } from 'sonner';
import { AppChrome } from '../components/bardo/app-chrome.jsx';

const HomePage = lazy(() => import('../features/home/home-page.jsx'));
const DocumentTrigger = lazy(() => import('../features/documents/document-trigger.jsx'));
let chromeRoot;
let surfaceRoot;

function RouteSurface({ mode }) {
  if (mode === 'document') {
    return <Suspense fallback={null}><DocumentTrigger /></Suspense>;
  }
  if (mode !== 'home') return null;
  return (
    <Suspense fallback={<div className="bardo-route-loading" role="status">Preparando tu espacio…</div>}>
      <HomePage />
    </Suspense>
  );
}

export function mountBardoChrome({ mode }) {
  const host = document.querySelector('#bardo-app-chrome');
  if (!host) return;
  const skipLink = document.querySelector('.bardo-skip-link');
  if (skipLink) skipLink.setAttribute('href', { home: '#bardo-main-content', document: '#document', board: '#kanban-content', event: '#ev-content' }[mode] || '#document');
  chromeRoot ||= createRoot(host);
  chromeRoot.render(
    <>
      <AppChrome initialMode={mode} avatarSrc={host.dataset.avatarSrc} />
      <Toaster
        theme="dark"
        position="bottom-center"
        visibleToasts={3}
        toastOptions={{ className: 'bardo-sonner-toast' }}
      />
    </>,
  );
  const surface = document.querySelector('#bardo-react-surface');
  if (surface) {
    surfaceRoot ||= createRoot(surface);
    surfaceRoot.render(<RouteSurface mode={mode} />);
  }
  globalThis.__bardoToast = toast;
}
