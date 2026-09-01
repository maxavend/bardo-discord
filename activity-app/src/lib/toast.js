// Lightweight accessible toast manager for shadcn/ui integration
let toastListeners = [];

export function toast(message, options = {}) {
  const text = typeof message === 'string' ? message : message?.description || String(message);
  toastListeners.forEach(listener => listener(text, options));
  
  // Console fallback if no visual toaster mounted
  if (toastListeners.length === 0) {
    console.log(`[Toast Notification]: ${text}`);
  }
}

toast.success = (msg) => toast(msg, { type: 'success' });
toast.error = (msg) => toast(msg, { type: 'error' });

export function subscribeToast(listener) {
  toastListeners.push(listener);
  return () => {
    toastListeners = toastListeners.filter(l => l !== listener);
  };
}
