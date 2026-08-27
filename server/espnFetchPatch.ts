const PATCH_KEY = Symbol.for('prezitools.espn-fetch-fallback-installed');
const state = globalThis as typeof globalThis & { [PATCH_KEY]?: boolean };

if (!state[PATCH_KEY] && typeof globalThis.fetch === 'function') {
  state[PATCH_KEY] = true;
  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await nativeFetch(input, init);

    let originalUrl = '';
    try {
      originalUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const parsed = new URL(originalUrl);
      const shouldRetry = parsed.hostname === 'site.api.espn.com'
        && !response.ok
        && (response.status === 403 || response.status === 429 || response.status >= 500);
      if (!shouldRetry) return response;

      parsed.hostname = 'site.web.api.espn.com';
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36');
      headers.set('Accept', 'application/json,text/plain,*/*');
      if (!headers.has('Referer')) headers.set('Referer', 'https://www.espn.com/');

      const fallback = await nativeFetch(parsed.toString(), { ...init, headers });
      if (fallback.ok) {
        console.warn(`[ESPN Fetch] ${response.status} from site.api; mirror recovered ${parsed.pathname}`);
        return fallback;
      }
      console.warn(`[ESPN Fetch] primary ${response.status}, mirror ${fallback.status}: ${parsed.pathname}`);
      return fallback;
    } catch (error) {
      console.warn('[ESPN Fetch] fallback wrapper error:', originalUrl, error);
      return response;
    }
  }) as typeof globalThis.fetch;
}

export {};
