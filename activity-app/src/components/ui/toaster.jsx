import { Toast } from '@base-ui/react/toast';
import {
  CheckCircle2,
  CircleAlert,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toastManager } from '@/lib/toast';

const TYPE_ICONS = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
  warning: TriangleAlert,
  loading: LoaderCircle,
};

function ToastList() {
  const { toasts } = Toast.useToastManager();

  return toasts.map((item) => {
    const StatusIcon = TYPE_ICONS[item.type] || null;

    return (
      <Toast.Root
        key={item.id}
        toast={item}
        swipeDirection="right"
        className="pointer-events-auto w-full rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] data-starting-style:translate-y-2 data-starting-style:opacity-0 data-ending-style:translate-x-4 data-ending-style:opacity-0"
      >
        <Toast.Content className="flex items-start gap-2.5">
          {StatusIcon && (
            <StatusIcon
              className={`mt-0.5 size-4 shrink-0 ${
                item.type === 'error'
                  ? 'text-destructive'
                  : item.type === 'success'
                    ? 'text-primary'
                    : 'text-muted-foreground'
              } ${item.type === 'loading' ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          )}
          <div className="min-w-0 flex-1">
            <Toast.Title className="text-sm font-medium leading-snug" />
            <Toast.Description className="mt-0.5 text-xs leading-relaxed text-muted-foreground" />
          </div>
          <Toast.Close
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar notificación"
                className="-mr-1 -mt-1 shrink-0 text-muted-foreground hover:text-foreground"
              />
            }
          >
            <X className="size-3.5" />
          </Toast.Close>
        </Toast.Content>
      </Toast.Root>
    );
  });
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={3} timeout={4000}>
      <Toast.Portal>
        <Toast.Viewport
          data-slot="toast-region"
          className="pointer-events-none fixed right-4 bottom-[calc(var(--bardo-safe-bottom,0px)+1rem)] z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-none"
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
