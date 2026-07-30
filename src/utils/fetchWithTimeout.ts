function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type FetchWithTimeoutOptions = {
  /** Per-attempt timeout in ms. Default 25s — production bootstrap can be slow on mobile networks. */
  timeoutMs?: number;
  /** Extra attempts after the first try. Default 2 (3 tries total). */
  retries?: number;
  /** Base delay before each retry; multiplied by attempt index. Default 1.5s. */
  retryDelayMs?: number;
};

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  if (error.name === 'AbortError') return true;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  );
}

/**
 * `fetch` with per-attempt timeout and optional retries for flaky mobile networks.
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  options?: FetchWithTimeoutOptions,
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 25_000;
  const retries = options?.retries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 1_500;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await delay(retryDelayMs * attempt);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= retries || !isRetryableFetchError(error)) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
