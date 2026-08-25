import { Link, useLocation } from 'wouter';
import NRFIPro from './NRFIPro';
import MLBHomeRuns from './MLBHomeRuns';

export default function MLB() {
  const [location] = useLocation();
  const homeRuns = location.startsWith('/mlb/home-runs');

  return <div className="mx-0 md:-mx-6 lg:-mx-8 -mt-8">
    <style>{`
      @media (max-width: 640px) {
        .mlb-first-inning-shell > div { margin-left: 0 !important; margin-right: 0 !important; }
        .mlb-first-inning-shell > div > nav > div { padding-left: 0 !important; padding-right: 0 !important; }
        .mlb-first-inning-shell > div > nav button { padding: 9px 10px !important; font-size: 10px !important; }
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

      .mlb-first-inning-shell article[data-testid^="card-nrfi-"] .mt-4.space-y-1 {
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
      : <div className="mlb-first-inning-shell px-4 pt-8 md:px-0"><NRFIPro /></div>}
  </div>;
}