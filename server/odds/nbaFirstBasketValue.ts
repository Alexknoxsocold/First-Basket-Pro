import {
  expectedValuePerDollar,
  modelEdgePoints,
  parseAmericanOdds,
  qualifiesAsMarketValue,
} from './normalized';

export interface NbaFirstBasketValueInput {
  modelProbabilityPct: number;
  liveOdds?: string | number | null;
  isStarter?: boolean;
  injuryStatus?: string;
  teamRank?: number;
}

export interface NbaFirstBasketValueResult {
  hasLiveMarket: boolean;
  qualifies: boolean;
  americanOdds: number | null;
  edgePoints: number | null;
  expectedValue: number | null;
  reason: 'qualified' | 'no-live-market' | 'injury' | 'not-starter' | 'outside-shortlist' | 'below-threshold';
}

/**
 * NBA first-basket VALUE must be earned against a real market price.
 * Model-estimated odds are deliberately not accepted here.
 *
 * Default thresholds match the shared normalized odds policy:
 *   edge >= 2.5 percentage points and EV >= +5% per $1 risked.
 */
export function evaluateNbaFirstBasketValue(input: NbaFirstBasketValueInput): NbaFirstBasketValueResult {
  const americanOdds = parseAmericanOdds(input.liveOdds);
  if (americanOdds === null) {
    return {
      hasLiveMarket: false,
      qualifies: false,
      americanOdds: null,
      edgePoints: null,
      expectedValue: null,
      reason: 'no-live-market',
    };
  }

  const injury = (input.injuryStatus || '').toLowerCase();
  if (injury.includes('out') || injury.includes('suspend') || injury === 'inactive') {
    return {
      hasLiveMarket: true,
      qualifies: false,
      americanOdds,
      edgePoints: modelEdgePoints(input.modelProbabilityPct, americanOdds),
      expectedValue: expectedValuePerDollar(input.modelProbabilityPct, americanOdds),
      reason: 'injury',
    };
  }

  if (input.isStarter === false) {
    return {
      hasLiveMarket: true,
      qualifies: false,
      americanOdds,
      edgePoints: modelEdgePoints(input.modelProbabilityPct, americanOdds),
      expectedValue: expectedValuePerDollar(input.modelProbabilityPct, americanOdds),
      reason: 'not-starter',
    };
  }

  // Keep homepage/player-page VALUE callouts selective. Top two players are
  // already represented as primary picks; VALUE is reserved for the next
  // realistic candidate, not every longshot on the board.
  if (input.teamRank !== undefined && (input.teamRank < 3 || input.teamRank > 3)) {
    return {
      hasLiveMarket: true,
      qualifies: false,
      americanOdds,
      edgePoints: modelEdgePoints(input.modelProbabilityPct, americanOdds),
      expectedValue: expectedValuePerDollar(input.modelProbabilityPct, americanOdds),
      reason: 'outside-shortlist',
    };
  }

  const edgePoints = modelEdgePoints(input.modelProbabilityPct, americanOdds);
  const expectedValue = expectedValuePerDollar(input.modelProbabilityPct, americanOdds);
  const qualifies = qualifiesAsMarketValue(input.modelProbabilityPct, americanOdds);

  return {
    hasLiveMarket: true,
    qualifies,
    americanOdds,
    edgePoints,
    expectedValue,
    reason: qualifies ? 'qualified' : 'below-threshold',
  };
}
