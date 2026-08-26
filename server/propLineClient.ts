const PROPLINE_BASE = 'https://api.prop-line.com/v1';

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
let blockedUntil = 0;
let remaining: number | null = null;
let resetAt: string | null = null;

export type PropLineQuotaStatus = {
  remaining: number | null;
  resetAt: string | null;
  blockedUntil: string | null;
};

function readNumberHeader(headers: Headers, names: string[]): number | null {
  for (const name of names) {
    const raw = headers.get(name);
    if (raw === null) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function updateQuota(headers: Headers) {
  const nextRemaining = readNumberHeader(headers, [
    'x-ratelimit-remaining',
    'x-rate-limit-remaining',
    'ratelimit-remaining',
  ]);
  if (nextRemaining !== null) remaining = nextRemaining;
  resetAt = headers.get('x-ratelimit-reset') ?? headers.get('x-rate-limit-reset') ?? resetAt;
}

function retryDelayMs(headers: Headers): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 24 * 60 * 60 * 1000);
    const date = new Date(retryAfter).getTime();
    if (Number.isFinite(date)) return Math.max(60_000, Math.min(date - Date.now(), 24 * 60 * 60 * 1000));
  }
  return 15 * 60 * 1000;
}

export function getPropLineQuotaStatus(): PropLineQuotaStatus {
  return {
    remaining,
    resetAt,
    blockedUntil: blockedUntil > Date.now() ? new Date(blockedUntil).toISOString() : null,
  };
}

export async function propLineGet<T>(
  path: string,
  options: { cacheMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const apiKey = process.env.PROPLINE_API_KEY?.trim();
  if (!apiKey) throw new Error('PropLine disabled: PROPLINE_API_KEY is not configured');

  const cacheMs = Math.max(0, options.cacheMs ?? 5 * 60 * 1000);
  const timeoutMs = Math.max(1000, options.timeoutMs ?? 9000);
  const cacheKey = path;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  if (blockedUntil > Date.now()) {
    if (cached) return cached.value as T;
    throw new Error(`PropLine temporarily paused until ${new Date(blockedUntil).toISOString()}`);
  }

  const existing = inflight.get(cacheKey);
  if (existing) return await existing as T;

  const request: Promise<T> = (async (): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${PROPLINE_BASE}${path}`, {
        signal: controller.signal,
        headers: {
          'X-API-Key': apiKey,
          'User-Agent': 'PreziTools/1.0',
        },
      });
      updateQuota(response.headers);

      if (response.status === 429) {
        blockedUntil = Date.now() + retryDelayMs(response.headers);
        const detail = await response.text().catch(() => '');
        if (cached) return cached.value as T;
        throw new Error(`PropLine 429${detail ? `: ${detail.slice(0, 220)}` : ''}`);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        if (cached) return cached.value as T;
        throw new Error(`PropLine ${response.status}${detail ? `: ${detail.slice(0, 220)}` : ''}`);
      }

      const value = await response.json() as T;
      responseCache.set(cacheKey, { value, expiresAt: Date.now() + cacheMs });
      return value;
    } finally {
      clearTimeout(timer);
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, request as Promise<unknown>);
  return await request;
}
