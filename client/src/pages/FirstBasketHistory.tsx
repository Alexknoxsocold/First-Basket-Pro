import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, History, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface FbTrackingRow {
  id: string;
  playerName: string;
  team: string;
  fbScored: number;
  gamesTracked: number;
  season: string;
  lastUpdated?: string | null;
}

function seasonForNow(date = new Date()): { current: string; previous: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find(p => p.type === 'year')?.value);
  const month = Number(parts.find(p => p.type === 'month')?.value);
  const start = month >= 7 ? year : year - 1;
  const label = (s: number) => `${s}/${String(s + 1).slice(-2)}`;
  return { current: label(start), previous: label(start - 1) };
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[.'’\-]/g, '').replace(/\s+/g, ' ').trim();
}

function rate(row?: FbTrackingRow): number | null {
  if (!row || row.gamesTracked <= 0) return null;
  return (row.fbScored / row.gamesTracked) * 100;
}

export default function FirstBasketHistory() {
  const [search, setSearch] = useState('');
  const labels = useMemo(() => seasonForNow(), []);
  const { data = [], isLoading, error } = useQuery<FbTrackingRow[]>({
    queryKey: ['/api/fb-tracking'],
    staleTime: 5 * 60 * 1000,
  });

  const comparisons = useMemo(() => {
    const current = new Map<string, FbTrackingRow>();
    const previous = new Map<string, FbTrackingRow>();
    for (const row of data) {
      if (!row.team?.trim()) continue;
      const key = `${normalizedName(row.playerName)}|${row.team.toUpperCase()}`;
      if (row.season === labels.current) current.set(key, row);
      if (row.season === labels.previous) previous.set(key, row);
    }

    const keys = new Set([...current.keys(), ...previous.keys()]);
    return [...keys].map(key => {
      const c = current.get(key);
      const p = previous.get(key);
      const source = c ?? p!;
      return {
        key,
        playerName: source.playerName,
        team: source.team,
        current: c,
        previous: p,
        currentRate: rate(c),
        previousRate: rate(p),
      };
    }).filter(row => {
      const q = search.trim().toLowerCase();
      return !q || row.playerName.toLowerCase().includes(q) || row.team.toLowerCase().includes(q);
    }).sort((a, b) => {
      const aRate = a.currentRate ?? a.previousRate ?? -1;
      const bRate = b.currentRate ?? b.previousRate ?? -1;
      return bRate - aRate || a.playerName.localeCompare(b.playerName);
    });
  }, [data, labels.current, labels.previous, search]);

  const currentRows = data.filter(row => row.season === labels.current && row.team?.trim()).length;
  const previousRows = data.filter(row => row.season === labels.previous && row.team?.trim()).length;

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-72" /><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">First Basket History</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Compare verified first-basket history by season. New seasons start at zero; last season stays available as prior context.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search player or team" className="pl-9" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-md border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Current season</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-bold">{labels.current}</p>
            <Badge variant="secondary">{currentRows} tracked</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Starts at zero and grows only from verified games this season.</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Previous-season prior</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-bold">{labels.previous}</p>
            <Badge variant="secondary">{previousRows} tracked</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Preserved historical context; it is not counted as current-season production.</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">First Basket history could not be loaded.</div>
      ) : comparisons.length === 0 ? (
        <div className="rounded-md border bg-card p-10 text-center text-sm text-muted-foreground">No season-comparison records are available yet.</div>
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Player</th>
                  <th className="text-left px-3 py-3 font-medium">Team</th>
                  <th className="text-right px-3 py-3 font-medium">{labels.previous} FB</th>
                  <th className="text-right px-3 py-3 font-medium">{labels.previous} Rate</th>
                  <th className="text-right px-3 py-3 font-medium">{labels.current} FB</th>
                  <th className="text-right px-3 py-3 font-medium">{labels.current} Rate</th>
                  <th className="text-right px-4 py-3 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {comparisons.map(row => {
                  const delta = row.currentRate !== null && row.previousRate !== null ? row.currentRate - row.previousRate : null;
                  return (
                    <tr key={row.key} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{row.playerName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{row.team}</td>
                      <td className="px-3 py-3 text-right font-mono">{row.previous?.fbScored ?? 0}/{row.previous?.gamesTracked ?? 0}</td>
                      <td className="px-3 py-3 text-right font-mono">{row.previousRate === null ? '—' : `${row.previousRate.toFixed(1)}%`}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">{row.current?.fbScored ?? 0}/{row.current?.gamesTracked ?? 0}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">{row.currentRate === null ? '—' : `${row.currentRate.toFixed(1)}%`}</td>
                      <td className="px-4 py-3 text-right">
                        {delta === null ? <span className="text-muted-foreground">—</span> : (
                          <span className={`inline-flex items-center gap-1 font-mono ${delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                            <TrendingUp className={`w-3 h-3 ${delta < 0 ? 'rotate-180' : ''}`} />
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)} pts
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
