import { useState, useEffect } from 'react';
import { subscribeToast } from '@/lib/toast';

export function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribeToast((message) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center justify-between rounded-lg border bg-popover text-popover-foreground px-4 py-3 shadow-lg text-sm transition-all duration-200 animate-in slide-in-from-bottom-2"
        >
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
