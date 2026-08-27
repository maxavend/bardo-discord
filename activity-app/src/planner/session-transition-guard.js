/**
 * Small concurrency guard for live-session transitions.
 * A second invocation while one transition is in flight is ignored instead of
 * queueing, which prevents double-clicks from advancing two Points.
 */
export function createSessionTransitionGuard() {
  let active = false;

  return {
    get isActive() {
      return active;
    },

    async run(operation) {
      if (active) return {executed: false, value: undefined};
      active = true;
      try {
        return {executed: true, value: await operation()};
      } finally {
        active = false;
      }
    },
  };
}
