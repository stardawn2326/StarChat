export type RuntimeCommandFlightFailure = 'timeout' | 'error';

export interface RuntimeCommandFlight<T> {
  run(requestId: string, operation: () => Promise<T>, fallback: (reason: RuntimeCommandFlightFailure) => T): void;
  cancel(): void;
}

/**
 * Keeps one renderer-side preview request authoritative. A rejected or hung
 * Cubism call cannot retain the command slot or deliver a stale result after
 * a newer preview has started.
 */
export function createRuntimeCommandFlight<T>(
  onResult: (requestId: string, result: T) => void,
  timeoutMs = 7000
): RuntimeCommandFlight<T> {
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const invalidate = (): void => {
    generation += 1;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    run(requestId, operation, fallback) {
      invalidate();
      const currentGeneration = generation;
      let settled = false;
      const settle = (result: T): void => {
        if (settled || currentGeneration !== generation) return;
        settled = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        onResult(requestId, result);
      };

      timer = setTimeout(() => settle(fallback('timeout')), timeoutMs);
      void Promise.resolve()
        .then(operation)
        .then(settle, () => settle(fallback('error')));
    },
    cancel() {
      invalidate();
    }
  };
}
