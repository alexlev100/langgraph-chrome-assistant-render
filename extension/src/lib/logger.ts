const DEBUG_ENABLED =
  import.meta.env.VITE_DEBUG_LOGS === 'true' ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_AI_ASSISTANT') === '1');

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => {
      if (DEBUG_ENABLED) {
        console.debug(`[${scope}]`, ...args);
      }
    },
    error: (...args: unknown[]) => {
      console.error(`[${scope}]`, ...args);
    },
  };
}
