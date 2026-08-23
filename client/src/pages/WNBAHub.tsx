import { useState } from 'react';
import { TrendingUp, Trophy } from 'lucide-react';
import WNBAProps from './WNBAProps';
import WNBA from './WNBA';

type WnbaView = 'props' | 'first-baskets';

export default function WNBAHub() {
  const [view, setView] = useState<WnbaView>('props');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card/95 p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="WNBA sections">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'props'}
            onClick={() => setView('props')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors ${
              view === 'props'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            WNBA Props
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'first-baskets'}
            onClick={() => setView('first-baskets')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors ${
              view === 'first-baskets'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Trophy className="h-4 w-4" />
            First Baskets
          </button>
        </div>
      </div>

      <div role="tabpanel">
        {view === 'props' ? <WNBAProps /> : <WNBA />}
      </div>
    </div>
  );
}
