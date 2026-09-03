import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import NRFIPro from './NRFIPro';
import MLBHomeRuns from './MLBHomeRuns';

type MarketValue = {
  available?: boolean;
  book?: string | null;
  selection?: 'NRFI' | 'YRFI' | null;
  price?: number | null;
  edge?: number | null;
  ev?: number | null;
};

type MlbValueGame = {
  id: string;
  shortName: string;
  recommendation: 'NRFI' | 'YRFI';
  playStatus: 'BEST_PLAY' | 'PLAY' | 'LEAN' | 'NO_PLAY';
  nrfiProbability: number;
  marketValue?: MarketValue | null;
};

type MlbValueResponse = { games?: MlbValueGame[] };

function priceLabel(price: number | null | undefined) {
  if (price === null || price === undefined || !Number.isFinite(price)) return '—';
  return price > 0 ? `+${price}` : `${price}`;
}

function MarketValueStrip() {
  const { data } = useQuery<MlbValueResponse>({
    queryKey: ['/api/mlb/nrfi'],
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const valueGames = (data?.games ?? [])
    .filter(game => {
      const market = game.marketValue;
      return !!market?.available && (market.edge ?? 0) > 0 && (market.ev ?? 0) > 0;
    })
    .sort((a, b) => (b.marketValue?.ev ?? 0) - (a.marketValue?.ev ?? 0));

  if (!valueGames.length) return null;

  return <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pb-8">
    <div className="border-t pt-6">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-bold">Market Value Watchlist</div>
          <div className="text-[11px] text-muted-foreground mt-1">Secondary pricing signal only · it never overrides the model's PLAY / LEAN / NO PLAY decision.</div>
        </div>
        <div className="text-[10px] font-medium text-muted-foreground">{valueGames.length} positive price edge{valueGames.length === 1 ? '' : 's'}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {valueGames.map(game => {
          const market = game.marketValue!;
          const sideProbability = game.recommendation === 'NRFI' ? game.nrfiProbability : 100 - game.nrfiProbability;
          const isModelPlay = game.playStatus === 'BEST_PLAY' || game.playStatus === 'PLAY';
          return <div key={game.id} className="rounded-md border bg-card/55 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">{game.shortName}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {game.recommendation} {sideProbability.toFixed(1)}% · Model <span className={isModelPlay ? 'font-semibold text-foreground' : 'font-semibold'}>{game.playStatus.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="shrink-0 rounded border border-emerald-500/25 bg-emerald-500/8 px-2 py-1 text-[9px] font-semibold text-emerald-500">PRICE EDGE</div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
              <span className="truncate text-muted-foreground">{market.book ?? 'Market'} {priceLabel(market.price)}</span>
              <span className="shrink-0 font-mono text-emerald-500">+{(market.edge ?? 0).toFixed(1)} pts · +{(market.ev ?? 0).toFixed(1)}% EV</span>
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

export default function MLB() {
  const [location] = useLocation();
  const homeRuns = location.startsWith('/mlb/home-runs');

  return <div className="mx-0 md:-mx-6 lg:-mx-8 -mt-8">
    <style>{`
      @media (max-width: 640px) {
        nav[aria-label="MLB sections"] { padding-top: 4px !important; }
        nav[aria-label="MLB sections"] span {
          min-height: 48px !important;
          display: flex !important;
          align-items: center !important;
          padding-top: 14px !important;
          padding-bottom: 12px !important;
        }
        .mlb-first-inning-shell > div { margin-left: 0 !important; margin-right: 0 !important; }
        .mlb-first-inning-shell > div > nav { padding-top: 4px !important; }
        .mlb-first-inning-shell > div > nav > div { padding-left: 0 !important; padding-right: 0 !important; }
        .mlb-first-inning-shell > div > nav button { min-height: 48px !important; padding: 14px 10px 12px !important; font-size: 10px !important; display: inline-flex !important; align-items: center !important; }
        .mlb-first-inning-shell > div > nav + div { padding: 18px 0 24px !important; }
        .mlb-first-inning-shell > div > nav + div > div:first-child { margin-bottom: 14px !important; flex-wrap: nowrap !important; align-items: center !important; }
        .mlb-first-inning-shell > div > nav + div > div:first-child h1 { font-size: 16px !important; line-height: 1.2 !important; }
        .mlb-first-inning-shell > div > nav + div > div:first-child p { font-size: 9px !important; line-height: 1.35 !important; }
        .mlb-first-inning-shell > div > nav + div > div:first-child button { min-height: 32px !important; padding: 6px 9px !important; font-size: 10px !important; flex-shrink: 0 !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 6px !important; margin-bottom: 16px !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] > div { padding: 9px !important; min-width: 0 !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] > div > div:first-child { margin-bottom: 6px !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] svg { width: 14px !important; height: 14px !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] .text-3xl { font-size: 19px !important; line-height: 1 !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] .text-xs { font-size: 8px !important; line-height: 1.2 !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] span.text-xs { font-size: 7px !important; line-height: 1.15 !important; }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] { max-width: 100% !important; }
      }

      @media (min-width: 641px) {
        nav[aria-label="MLB sections"] {
          width: 100vw !important;
          max-width: none !important;
          margin-left: calc(50% - 50vw) !important;
          margin-right: calc(50% - 50vw) !important;
          box-sizing: border-box !important;
        }
        nav[aria-label="MLB sections"] > div {
          width: 100% !important;
          max-width: 80rem !important;
          margin-left: auto !important;
          margin-right: auto !important;
          box-sizing: border-box !important;
        }
        .mlb-first-inning-shell > div > nav {
          width: 100vw !important;
          max-width: none !important;
          margin-left: calc(50% - 50vw) !important;
          margin-right: calc(50% - 50vw) !important;
          box-sizing: border-box !important;
        }
        .mlb-first-inning-shell > div > nav > div {
          width: 100% !important;
          max-width: 80rem !important;
          margin-left: auto !important;
          margin-right: auto !important;
          box-sizing: border-box !important;
        }
      }

      .mlb-first-inning-shell [class*="bg-primary/5"][class*="mb-6"] {
        display: none !important;
      }

      .mlb-home-runs-shell > div > div.flex.flex-wrap.items-start.justify-between h1 {
        font-size: 0 !important;
      }
      .mlb-home-runs-shell > div > div.flex.flex-wrap.items-start.justify-between h1::after {
        content: "Homeruns";
        font-size: 1.25rem;
        line-height: 1.75rem;
        font-weight: 700;
      }
      .mlb-home-runs-shell > div > div.flex.flex-wrap.items-start.justify-between > div.text-right > button {
        display: none !important;
      }
    `}</style>
    <nav className="border-b bg-card" aria-label="MLB sections">
      <div className="max-w-7xl mx-auto px-0 md:px-6 lg:px-8">
        <div className="flex items-center overflow-x-auto px-1 md:px-0">
          <Link href="/mlb">
            <span className={`block cursor-pointer whitespace-nowrap border-b-2 px-3 py-3 text-xs font-medium transition-colors md:px-4 ${!homeRuns ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>First-Inning Value</span>
          </Link>
          <Link href="/mlb/home-runs">
            <span className={`block cursor-pointer whitespace-nowrap border-b-2 px-3 py-3 text-xs font-medium transition-colors md:px-4 ${homeRuns ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Home Runs</span>
          </Link>
        </div>
      </div>
    </nav>

    {homeRuns
      ? <div className="mlb-home-runs-shell max-w-7xl mx-auto px-0 md:px-6 lg:px-8 py-8"><MLBHomeRuns /></div>
      : <><div className="mlb-first-inning-shell px-4 pt-8 md:px-0"><NRFIPro /></div><MarketValueStrip /></>}
  </div>;
}
