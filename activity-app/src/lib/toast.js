import { Toast } from '@base-ui/react/toast';

export const toastManager = Toast.createToastManager();

function normalizeToast(message, options = {}) {
  if (typeof message === 'string') {
    return {
      title: message,
      type: options.type,
      timeout: options.timeout,
    };
  }

  if (message && typeof message === 'object') {
    return {
      ...message,
      type: options.type || message.type,
      timeout: options.timeout ?? message.timeout,
    };
  }

  return {
    title: String(message ?? ''),
    type: options.type,
    timeout: options.timeout,
  };
}

export function toast(message, options = {}) {
  return toastManager.add(normalizeToast(message, options));
}

toast.success = (message, options = {}) => toast(message, {...options, type: 'success'});
toast.error = (message, options = {}) => toast(message, {...options, type: 'error'});
toast.info = (message, options = {}) => toast(message, {...options, type: 'info'});
toast.warning = (message, options = {}) => toast(message, {...options, type: 'warning'});
toast.close = (id) => toastManager.close(id);
toast.promise = (...args) => toastManager.promise(...args);
