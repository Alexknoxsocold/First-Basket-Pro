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

  return <div className="mlb-market-watchlist max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pb-8">
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
          return <div key={game.id} className="mlb-market-row rounded-md border bg-card/55 px-3 py-2.5">
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

  return <div className="mlb-page mx-0 md:-mx-6 lg:-mx-8 -mt-8">
    <style>{`
      .mlb-page { overflow-x: clip; }

      @media (max-width: 640px) {
        .mlb-page { width: 100%; }
        nav[aria-label="MLB sections"] { padding-top: 2px !important; position: sticky; top: 0; z-index: 30; background: hsl(var(--card) / .96); backdrop-filter: blur(12px); }
        nav[aria-label="MLB sections"] > div > div { scrollbar-width: none; }
        nav[aria-label="MLB sections"] > div > div::-webkit-scrollbar { display: none; }
        nav[aria-label="MLB sections"] span {
          min-height: 44px !important;
          display: flex !important;
          align-items: center !important;
          padding: 12px 14px 10px !important;
          font-size: 11px !important;
        }

        .mlb-first-inning-shell { padding-left: 12px !important; padding-right: 12px !important; padding-top: 24px !important; }
        .mlb-first-inning-shell > div { margin-left: 0 !important; margin-right: 0 !important; }
        .mlb-first-inning-shell > div > nav { padding-top: 0 !important; margin-left: -12px !important; margin-right: -12px !important; }
        .mlb-first-inning-shell > div > nav > div { padding-left: 8px !important; padding-right: 8px !important; }
        .mlb-first-inning-shell > div > nav > div > div { gap: 2px !important; scrollbar-width: none; }
        .mlb-first-inning-shell > div > nav > div > div::-webkit-scrollbar { display: none; }
        .mlb-first-inning-shell > div > nav button {
          min-height: 42px !important;
          padding: 11px 9px 9px !important;
          font-size: 9px !important;
          display: inline-flex !important;
          align-items: center !important;
          border-radius: 0 !important;
        }
        .mlb-first-inning-shell > div > nav + div { padding: 16px 0 22px !important; }
        .mlb-first-inning-shell > div > nav + div > div:first-child { margin-bottom: 12px !important; flex-wrap: nowrap !important; align-items: center !important; gap: 8px !important; }
        .mlb-first-inning-shell > div > nav + div > div:first-child > div { min-width: 0 !important; }
        .mlb-first-inning-shell > div > nav + div > div:first-child h1 { font-size: 16px !important; line-height: 1.15 !important; }
        .mlb-first-inning-shell > div > nav + div > div:first-child p { font-size: 9px !important; line-height: 1.35 !important; overflow-wrap: anywhere; }
        .mlb-first-inning-shell > div > nav + div > div:first-child button { min-height: 30px !important; padding: 5px 8px !important; font-size: 9px !important; flex-shrink: 0 !important; border-radius: 8px !important; }

        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 6px !important;
          margin-bottom: 14px !important;
        }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] > div { padding: 9px 8px !important; min-width: 0 !important; border-radius: 10px !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] > div > div:first-child { margin-bottom: 5px !important; gap: 3px !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] svg { width: 13px !important; height: 13px !important; flex-shrink: 0; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] .text-3xl { font-size: 18px !important; line-height: 1 !important; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] .text-xs { font-size: 7.5px !important; line-height: 1.25 !important; overflow-wrap: anywhere; }
        .mlb-first-inning-shell [class*="md:grid-cols-3"][class*="mb-8"] span.text-xs { font-size: 7px !important; line-height: 1.15 !important; }

        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] { max-width: 100% !important; border-radius: 12px !important; box-shadow: 0 4px 18px rgb(0 0 0 / .08); }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] > div:first-of-type { padding: 10px 12px !important; gap: 6px !important; }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] > div:first-of-type > div:first-child { gap: 6px !important; min-width: 0 !important; }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] > div:first-of-type > div:last-child { gap: 4px !important; flex-wrap: wrap !important; justify-content: flex-end !important; }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] > div:first-of-type span { font-size: 9px !important; }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] > div:last-child { padding: 12px !important; }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] .text-3xl { font-size: 26px !important; line-height: 1 !important; }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] [class*="grid-cols-[1fr_auto_1fr]"] { gap: 8px !important; }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] [class*="grid-cols-[1fr_auto_1fr]"] img { width: 28px !important; height: 28px !important; }
        .mlb-first-inning-shell article[data-testid^="card-nrfi-"] [class*="grid-cols-3"] { gap: 8px !important; }

        .mlb-market-watchlist { padding-left: 12px !important; padding-right: 12px !important; padding-bottom: 24px !important; }
        .mlb-market-watchlist > div { padding-top: 18px !important; }
        .mlb-market-watchlist > div > div:first-child { align-items: flex-start !important; margin-bottom: 10px !important; }
        .mlb-market-watchlist > div > div:first-child > div:first-child { min-width: 0; }
        .mlb-market-watchlist .mlb-market-row { border-radius: 10px !important; padding: 11px 12px !important; }
        .mlb-market-row > div:first-child { align-items: center !important; }
        .mlb-market-row > div:last-child { margin-top: 8px !important; padding-top: 8px; border-top: 1px solid hsl(var(--border) / .6); }

        /* Home Runs: compact, touch-first, and free of nested-scroll glitches. */
        .mlb-home-runs-shell { padding: 18px 12px 30px !important; width: 100% !important; }
        .mlb-home-runs-shell * { min-width: 0; }
        .mlb-home-runs-shell > div { gap: 18px !important; }
        .mlb-home-runs-shell [class*="overflow-x-auto"] { -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .mlb-home-runs-shell [class*="overflow-x-auto"]::-webkit-scrollbar { display: none; }
        .mlb-home-runs-shell [class*="grid"] { max-width: 100%; }
        .mlb-home-runs-shell button { touch-action: manipulation; }

        /* Keep the top of the HR page simple and useful. */
        .mlb-home-runs-shell > div > div.flex.flex-wrap.items-start.justify-between { margin-bottom: 0 !important; align-items: center !important; }
        .mlb-home-runs-shell > div > .grid.grid-cols-3.gap-3 {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }
        .mlb-home-runs-shell > div > .grid.grid-cols-3.gap-3 > div {
          padding: 12px !important;
          border-radius: 14px !important;
        }
        .mlb-home-runs-shell > div > .grid.grid-cols-3.gap-3 > div:first-child {
          grid-column: 1 / -1 !important;
          display: grid !important;
          grid-template-columns: 1fr auto !important;
          align-items: center !important;
          column-gap: 10px !important;
        }
        .mlb-home-runs-shell > div > .grid.grid-cols-3.gap-3 > div:first-child > div:nth-child(2) {
          grid-row: 1 / span 2 !important;
          grid-column: 2 !important;
          font-size: 27px !important;
          margin-top: 0 !important;
        }
        .mlb-home-runs-shell > div > .grid.grid-cols-3.gap-3 .text-2xl { font-size: 22px !important; }

        /* Reimagine weather as compact game cards instead of giant narrow diamonds. */
        .mlb-home-runs-shell section > div.flex.gap-3.overflow-x-auto {
          gap: 10px !important;
          margin-left: -2px;
          margin-right: -12px;
          padding-right: 12px;
          padding-bottom: 5px !important;
          scroll-snap-type: x mandatory;
        }
        .mlb-home-runs-shell button[aria-label^="Show home run hitters"] {
          min-width: min(82vw, 315px) !important;
          width: min(82vw, 315px) !important;
          max-width: 315px !important;
          flex: 0 0 auto !important;
          border-radius: 16px !important;
          scroll-snap-align: start;
          box-shadow: none !important;
        }
        .mlb-home-runs-shell button[aria-label^="Show home run hitters"] > div:first-child {
          padding: 12px 12px 9px !important;
        }
        .mlb-home-runs-shell button[aria-label^="Show home run hitters"] > div.px-4 {
          display: none !important;
        }
        .mlb-home-runs-shell button[aria-label^="Show home run hitters"] > .grid.grid-cols-4 {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 7px !important;
          padding: 8px 12px 12px !important;
        }
        .mlb-home-runs-shell button[aria-label^="Show home run hitters"] > .grid.grid-cols-4 > div {
          padding: 8px !important;
          border-radius: 11px !important;
          display: grid !important;
          grid-template-columns: auto 1fr !important;
          align-items: center !important;
          column-gap: 6px !important;
          text-align: left !important;
        }
        .mlb-home-runs-shell button[aria-label^="Show home run hitters"] > .grid.grid-cols-4 > div svg {
          margin: 0 !important;
          grid-row: 1 / span 2;
        }
        .mlb-home-runs-shell button[aria-label^="Show home run hitters"] > .grid.grid-cols-4 > div > div {
          margin-top: 0 !important;
          line-height: 1.1 !important;
        }
        .mlb-home-runs-shell button[aria-label^="Show home run hitters"] > div:last-child {
          padding: 9px 12px !important;
        }

        /* Let the page itself scroll; no awkward scroll box inside the board/watchlist. */
        .mlb-home-runs-shell section > div[class*="max-h-"] {
          max-height: none !important;
          overflow-y: visible !important;
          border-radius: 14px !important;
        }
        .mlb-home-runs-shell section button.w-full.border-b,
        .mlb-home-runs-shell section button.grid.w-full {
          padding-left: 12px !important;
          padding-right: 12px !important;
        }
        .mlb-home-runs-shell section button.w-full.border-b > div:first-child {
          grid-template-columns: auto minmax(0,1fr) 76px !important;
          gap: 9px !important;
        }
        .mlb-home-runs-shell section button.w-full.border-b [class*="h-14"][class*="w-14"] {
          height: 46px !important;
          width: 46px !important;
        }
        .mlb-home-runs-shell section button.w-full.border-b .text-2xl { font-size: 20px !important; }
        .mlb-home-runs-shell section button.grid.w-full {
          grid-template-columns: 38px minmax(0,1fr) 68px !important;
          gap: 9px !important;
        }
        .mlb-home-runs-shell section button.grid.w-full .text-xl { font-size: 17px !important; }
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

      .mlb-first-inning-shell [class*="bg-primary/5"][class*="mb-6"] { display: none !important; }
      .mlb-home-runs-shell > div > div.flex.flex-wrap.items-start.justify-between h1 { font-size: 0 !important; }
      .mlb-home-runs-shell > div > div.flex.flex-wrap.items-start.justify-between h1::after {
        content: "Homeruns";
        font-size: 1.25rem;
        line-height: 1.75rem;
        font-weight: 700;
      }
      .mlb-home-runs-shell > div > div.flex.flex-wrap.items-start.justify-between > div.text-right > button { display: none !important; }
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
