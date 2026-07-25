// `requestIdleCallback` is provided by the React Native runtime but isn't part
// of RN's bundled TypeScript globals, so we type it locally off of `globalThis`.
type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };

type IdleScheduler = {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadline) => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const idleScheduler = globalThis as typeof globalThis & IdleScheduler;

/**
 * Runs `callback` once the JS thread is idle — a drop-in replacement for the
 * deprecated `InteractionManager.runAfterInteractions`. Falls back to a frame
 * callback on runtimes without `requestIdleCallback`.
 *
 * @returns a cancel function that aborts the pending callback.
 */
export function runWhenIdle(callback: () => void, timeout = 500): () => void {
  if (typeof idleScheduler.requestIdleCallback === 'function') {
    const handle = idleScheduler.requestIdleCallback(() => callback(), { timeout });
    return () => idleScheduler.cancelIdleCallback?.(handle);
  }

  const frame = requestAnimationFrame(() => callback());
  return () => cancelAnimationFrame(frame);
}
