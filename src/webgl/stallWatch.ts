/**
 * Detects a task that has gone quiet, without mistaking a busy page for a stuck task.
 *
 * `onStall` fires once, after `budgetMs` of *responsive* quiet time. A tick that arrives late means the main thread
 * was busy (shader compiles, scene construction): whatever the task is waiting for is queued behind that work, not
 * lost, so such a tick counts at most twice its nominal length. `progress()` (bytes arrived, a message answered) resets
 * the budget. Wall-clock timeouts get both cases wrong on slow phones and in software-rendered browsers.
 */
export interface StallWatch {
  /** The task made progress: restart the quiet budget. */
  progress(): void;
  /** The task is finished (or abandoned): stop watching. Safe to call more than once. */
  stop(): void;
}

export function watchStall(onStall: () => void, budgetMs: number, tickMs = 250, now: () => number = () => performance.now()): StallWatch {
  let quiet = 0;
  let last = now();
  const timer = setInterval(() => {
    const at = now();
    quiet += Math.min(at - last, tickMs * 2);
    last = at;
    if (quiet < budgetMs) return;
    clearInterval(timer);
    onStall();
  }, tickMs);
  return {
    progress: () => {
      quiet = 0;
    },
    stop: () => clearInterval(timer),
  };
}
