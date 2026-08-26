const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

export type HrWeatherSnapshot = {
  tempF: number | null;
  windMph: number | null;
  windDirection: string | null;
  windDegrees: number | null;
  precipitationProbability: number | null;
  condition: string | null;
  source: 'MLB' | 'Open-Meteo' | 'unavailable';
};

type NativeWeather = { temp?: number; wind?: string; condition?: string } | null | undefined;

type VenueCoord = { lat: number; lon: number };

const VENUES: Array<[string, VenueCoord]> = [
  ['angel stadium', { lat: 33.8003, lon: -117.8827 }],
  ['camden yards', { lat: 39.2838, lon: -76.6217 }],
  ['fenway park', { lat: 42.3467, lon: -71.0972 }],
  ['rate field', { lat: 41.8300, lon: -87.6338 }],
  ['wrigley field', { lat: 41.9484, lon: -87.6553 }],
  ['great american ball park', { lat: 39.0979, lon: -84.5082 }],
  ['progressive field', { lat: 41.4962, lon: -81.6852 }],
  ['coors field', { lat: 39.7559, lon: -104.9942 }],
  ['comerica park', { lat: 42.3390, lon: -83.0485 }],
  ['daikin park', { lat: 29.7573, lon: -95.3555 }],
  ['minute maid park', { lat: 29.7573, lon: -95.3555 }],
  ['kauffman stadium', { lat: 39.0517, lon: -94.4803 }],
  ['dodger stadium', { lat: 34.0739, lon: -118.2400 }],
  ['loandepot park', { lat: 25.7781, lon: -80.2196 }],
  ['american family field', { lat: 43.0280, lon: -87.9712 }],
  ['target field', { lat: 44.9817, lon: -93.2776 }],
  ['citi field', { lat: 40.7571, lon: -73.8458 }],
  ['yankee stadium', { lat: 40.8296, lon: -73.9262 }],
  ['sutter health park', { lat: 38.5802, lon: -121.5139 }],
  ['citizens bank park', { lat: 39.9061, lon: -75.1665 }],
  ['pnc park', { lat: 40.4469, lon: -80.0057 }],
  ['petco park', { lat: 32.7076, lon: -117.1570 }],
  ['oracle park', { lat: 37.7786, lon: -122.3893 }],
  ['t-mobile park', { lat: 47.5914, lon: -122.3325 }],
  ['busch stadium', { lat: 38.6226, lon: -90.1928 }],
  ['tropicana field', { lat: 27.7683, lon: -82.6534 }],
  ['george m. steinbrenner field', { lat: 27.9800, lon: -82.5064 }],
  ['globe life field', { lat: 32.7473, lon: -97.0847 }],
  ['rogers centre', { lat: 43.6414, lon: -79.3894 }],
  ['nationals park', { lat: 38.8730, lon: -77.0074 }],
  ['truist park', { lat: 33.8908, lon: -84.4677 }],
  ['chase field', { lat: 33.4453, lon: -112.0667 }],
];

const weatherCache = new Map<string, { expiresAt: number; value: HrWeatherSnapshot }>();

function coordsForVenue(venueName: string | null | undefined): VenueCoord | null {
  const normalized = (venueName ?? '').toLowerCase();
  for (const [needle, coords] of VENUES) if (normalized.includes(needle)) return coords;
  return null;
}

function compass(degrees: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

function parseNativeWind(wind?: string): { mph: number | null; direction: string | null } {
  if (!wind) return { mph: null, direction: null };
  const match = wind.match(/(\d+(?:\.\d+)?)\s*mph/i);
  return { mph: match ? Number(match[1]) : null, direction: wind };
}

function nativeSnapshot(native: NativeWeather): HrWeatherSnapshot | null {
  if (!native) return null;
  const wind = parseNativeWind(native.wind);
  const hasAnything = Number.isFinite(native.temp) || wind.mph !== null || !!native.wind || !!native.condition;
  if (!hasAnything) return null;
  return {
    tempF: Number.isFinite(native.temp) ? Number(native.temp) : null,
    windMph: wind.mph,
    windDirection: wind.direction,
    windDegrees: null,
    precipitationProbability: null,
    condition: native.condition ?? null,
    source: 'MLB',
  };
}

function codeLabel(code: number | null): string | null {
  if (code === null) return null;
  if (code === 0) return 'Clear';
  if ([1,2].includes(code)) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45,48].includes(code)) return 'Fog';
  if ([51,53,55,56,57].includes(code)) return 'Drizzle';
  if ([61,63,65,66,67,80,81,82].includes(code)) return 'Rain';
  if ([71,73,75,77,85,86].includes(code)) return 'Snow';
  if ([95,96,99].includes(code)) return 'Thunderstorms';
  return 'Forecast';
}

async function fetchForecast(gameTime: string, venueName: string | null | undefined): Promise<HrWeatherSnapshot | null> {
  const coords = coordsForVenue(venueName);
  if (!coords) return null;
  const gameMs = new Date(gameTime).getTime();
  if (!Number.isFinite(gameMs)) return null;
  const utcDate = new Date(gameMs).toISOString().slice(0, 10);
  const cacheKey = `${venueName}:${utcDate}:${new Date(gameMs).getUTCHours()}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'UTC',
    start_date: utcDate,
    end_date: utcDate,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${OPEN_METEO_BASE}?${params.toString()}`, { signal: controller.signal, headers: { 'User-Agent': 'PreziTools/1.0' } });
    if (!response.ok) return null;
    const payload = await response.json() as { hourly?: { time?: string[]; temperature_2m?: number[]; wind_speed_10m?: number[]; wind_direction_10m?: number[]; precipitation_probability?: number[]; weather_code?: number[] } };
    const times = payload.hourly?.time ?? [];
    if (!times.length) return null;
    let bestIndex = 0, bestDiff = Infinity;
    times.forEach((value, index) => {
      const t = new Date(`${value}Z`).getTime();
      const diff = Math.abs(t - gameMs);
      if (Number.isFinite(t) && diff < bestDiff) { bestDiff = diff; bestIndex = index; }
    });
    const temp = Number(payload.hourly?.temperature_2m?.[bestIndex]);
    const windMph = Number(payload.hourly?.wind_speed_10m?.[bestIndex]);
    const windDegrees = Number(payload.hourly?.wind_direction_10m?.[bestIndex]);
    const precip = Number(payload.hourly?.precipitation_probability?.[bestIndex]);
    const code = Number(payload.hourly?.weather_code?.[bestIndex]);
    const direction = Number.isFinite(windDegrees) ? compass(windDegrees) : null;
    const value: HrWeatherSnapshot = {
      tempF: Number.isFinite(temp) ? Math.round(temp * 10) / 10 : null,
      windMph: Number.isFinite(windMph) ? Math.round(windMph * 10) / 10 : null,
      windDirection: Number.isFinite(windMph) && direction ? `${Math.round(windMph)} mph ${direction}` : direction,
      windDegrees: Number.isFinite(windDegrees) ? Math.round(windDegrees) : null,
      precipitationProbability: Number.isFinite(precip) ? Math.round(precip) : null,
      condition: codeLabel(Number.isFinite(code) ? code : null),
      source: 'Open-Meteo',
    };
    weatherCache.set(cacheKey, { expiresAt: Date.now() + 15 * 60_000, value });
    return value;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGameHrWeather(gameTime: string, venueName: string | null | undefined, native: NativeWeather): Promise<HrWeatherSnapshot> {
  const mlb = nativeSnapshot(native);
  const forecast = await fetchForecast(gameTime, venueName);
  if (mlb) {
    return {
      tempF: mlb.tempF ?? forecast?.tempF ?? null,
      windMph: mlb.windMph ?? forecast?.windMph ?? null,
      windDirection: mlb.windDirection ?? forecast?.windDirection ?? null,
      windDegrees: forecast?.windDegrees ?? null,
      precipitationProbability: forecast?.precipitationProbability ?? null,
      condition: mlb.condition ?? forecast?.condition ?? null,
      source: 'MLB',
    };
  }
  return forecast ?? { tempF: null, windMph: null, windDirection: null, windDegrees: null, precipitationProbability: null, condition: null, source: 'unavailable' };
}
