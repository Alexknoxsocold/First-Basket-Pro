import { Link, useLocation } from 'wouter';
import NRFIPro from './NRFIPro';
import MLBHomeRuns from './MLBHomeRuns';

export default function MLB() {
  const [location] = useLocation();
  const homeRuns = location.startsWith('/mlb/home-runs');

  return <div className="mx-0 md:-mx-6 lg:-mx-8 -mt-8">
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
      ? <div className="max-w-7xl mx-auto px-0 md:px-6 lg:px-8 py-8"><MLBHomeRuns /></div>
      : <div className="px-4 pt-8 md:px-0"><NRFIPro /></div>}
  </div>;
}
