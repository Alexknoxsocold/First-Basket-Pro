export type SportKey = 'NBA' | 'WNBA' | 'MLB' | 'NFL' | string;

export type OddsSource = 'espn-core' | 'authorized-provider' | 'model-estimate' | string;

export interface NormalizedMarketPrice {
  sport: SportKey;
  eventId: string;
  market: string;
  athleteId?: string;
  athleteName?: string;
  sportsbook?: string;
  americanOdds: number;
  impliedProbability: number;
  fetchedAt: string;
  source: OddsSource;
}

export function americanOddsToImpliedProbability(americanOdds: number): number {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return 0;
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  const abs = Math.abs(americanOdds);
  return abs / (abs + 100);
}

export function parseAmericanOdds(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0 ? value : null;
  if (!value) return null;
  const match = String(value).trim().match(/^([+-]?\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

export function formatAmericanOdds(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '—';
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

export function modelEdgePoints(modelProbabilityPct: number, americanOdds: number): number {
  const marketPct = americanOddsToImpliedProbability(americanOdds) * 100;
  return modelProbabilityPct - marketPct;
}

export function expectedValuePerDollar(modelProbabilityPct: number, americanOdds: number): number {
  const p = Math.max(0, Math.min(1, modelProbabilityPct / 100));
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return 0;
  const profit = americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds);
  return p * profit - (1 - p);
}

export function qualifiesAsMarketValue(
  modelProbabilityPct: number,
  americanOdds: number,
  minimumEdgePoints = 2.5,
  minimumEv = 0.05,
): boolean {
  return modelEdgePoints(modelProbabilityPct, americanOdds) >= minimumEdgePoints &&
    expectedValuePerDollar(modelProbabilityPct, americanOdds) >= minimumEv;
}
