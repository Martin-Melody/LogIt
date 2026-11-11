/**
 * Wrap an async job so only one run happens at a time. A call while a run is in progress
 * joins it and asks for one more run afterwards (something may have changed since that run
 * started); every caller gets the result of the last run. Several calls during one run still
 * add only one extra run.
 */
export function singleFlight<T>(job: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  let runAgain = false;

  return () => {
    if (running) {
      runAgain = true;
      return running;
    }
    running = (async () => {
      let result: T;
      do {
        runAgain = false;
        result = await job();
      } while (runAgain);
      return result;
    })().finally(() => {
      running = null;
    });
    return running;
  };
}
