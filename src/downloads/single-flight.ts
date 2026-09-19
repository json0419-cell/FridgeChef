/**
 * Keyed single-flight runner.
 *
 * Large pack downloads share one staging directory per pack, so two concurrent runs append to the
 * same partial files and corrupt each other. Joining the in-flight run keeps repeated taps harmless.
 */
export function createSingleFlight<T>() {
  const inFlight = new Map<string, Promise<T>>();

  function run(key: string, task: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }

    const started = (async () => task())();
    const tracked: Promise<T> = started.finally(() => {
      if (inFlight.get(key) === tracked) {
        inFlight.delete(key);
      }
    });
    inFlight.set(key, tracked);
    return tracked;
  }

  run.isRunning = (key: string) => inFlight.has(key);
  return run;
}
