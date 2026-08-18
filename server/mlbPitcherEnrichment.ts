export type MlbPitcherEnrichment = {
  era: number | null;
  whip: number | null;
  strikeoutPct: number | null;
  walkPct: number | null;
  inningsPitched: number | null;
  source: "MLB" | "pending";
};

const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const CACHE_TTL = 6 * 60 * 60 * 1000;
const cache = new Map<string, { value: MlbPitcherEnrichment; expiresAt: number }>();

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "First-Basket-Pro/1.0" } });
    if (!response.ok) throw new Error(`MLB API ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

const empty = (): MlbPitcherEnrichment => ({ era: null, whip: null, strikeoutPct: null, walkPct: null, inningsPitched: null, source: "pending" });

export async function fetchMlbPitcherEnrichment(name: string | null): Promise<MlbPitcherEnrichment> {
  if (!name?.trim()) return empty();
  const key = name.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const search = await fetchJson<{ people?: { id?: number; fullName?: string }[] }>(`${MLB_BASE}/people/search?names=${encodeURIComponent(name)}&active=true&sportIds=1`);
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const candidates = search.people ?? [];
    const person = candidates.find(p => (p.fullName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === normalized) ?? candidates[0];
    if (!person?.id) return empty();

    const season = new Date().getUTCFullYear();
    const stats = await fetchJson<{ stats?: { splits?: { stat?: { era?: string | number; whip?: string | number; strikePercentage?: string | number; baseOnBalls?: number; strikeOuts?: number; battersFaced?: number; inningsPitched?: string | number } }[] }[] }>(`${MLB_BASE}/people/${person.id}/stats?stats=season&group=pitching&season=${season}`);
    const stat = stats.stats?.[0]?.splits?.[0]?.stat;
    if (!stat) return empty();

    const faced = Number(stat.battersFaced);
    const strikeOuts = Number(stat.strikeOuts);
    const walks = Number(stat.baseOnBalls);
    const value: MlbPitcherEnrichment = {
      era: Number.isFinite(Number(stat.era)) ? Number(stat.era) : null,
      whip: Number.isFinite(Number(stat.whip)) ? Number(stat.whip) : null,
      strikeoutPct: Number.isFinite(faced) && faced > 0 && Number.isFinite(strikeOuts) ? strikeOuts / faced : null,
      walkPct: Number.isFinite(faced) && faced > 0 && Number.isFinite(walks) ? walks / faced : null,
      inningsPitched: Number.isFinite(Number(stat.inningsPitched)) ? Number(stat.inningsPitched) : null,
      source: "MLB",
    };
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
    return value;
  } catch {
    const value = empty();
    cache.set(key, { value, expiresAt: Date.now() + 15 * 60 * 1000 });
    return value;
  }
}
