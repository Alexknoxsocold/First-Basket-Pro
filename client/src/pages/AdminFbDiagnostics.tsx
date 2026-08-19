import { useQuery } from '@tanstack/react-query';
import { Activity, Database, History, ShieldCheck, Target, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Diagnostics {
  generatedAt: string;
  modelVersion: string;
  seasons: {
    current: string;
    previous: string;
    currentPlayers: number;
    previousPlayers: number;
  };
  tracking: {
    processedGames: number;
    verifiedProcessed: number;
    unresolvedProcessed: number;
    currentFirstBaskets: number;
    currentStarterGames: number;
  };
  ledger: {
    modelVersion: string;
    lockedGames: number;
    gradedGames: number;
    topPickWins: number;
    topPickAccuracy: number | null;
    candidateBrier: number | null;
  };
  readiness: Record<string, boolean>;
}

function StatCard({ label, value, note, icon: Icon }: { label: string; value: string | number; note?: string; icon: typeof Activity }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <p className="text-2xl font-bold mt-2">{value}</p>
      {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
    </div>
  );
}

export default function AdminFbDiagnostics() {
  const { data, isLoading, error } = useQuery<Diagnostics>({
    queryKey: ['/api/admin/fb/diagnostics'],
    staleTime: 30_000,
    retry: false,
  });

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-72" /><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (error || !data) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">First Basket diagnostics are unavailable or your admin session has expired.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">First Basket Diagnostics</h1>
          <p className="text-sm text-muted-foreground mt-1">Operational health for season tracking, verified results, and the immutable pregame prediction ledger.</p>
        </div>
        <Badge variant="secondary">{data.modelVersion}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Current season players" value={data.seasons.currentPlayers} note={data.seasons.current} icon={Database} />
        <StatCard label="Verified games" value={data.tracking.verifiedProcessed} note={`${data.tracking.unresolvedProcessed} unresolved legacy rows`} icon={ShieldCheck} />
        <StatCard label="Locked games" value={data.ledger.lockedGames} note="Pregame model snapshots" icon={Target} />
        <StatCard label="Graded games" value={data.ledger.gradedGames} note="Resolved against first made FG" icon={Trophy} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md border bg-card p-5">
          <div className="flex items-center gap-2 mb-4"><History className="w-4 h-4 text-primary" /><h2 className="font-semibold">Season evidence</h2></div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Current season</span><span className="font-mono">{data.seasons.current}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Previous-season prior</span><span className="font-mono">{data.seasons.previous}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Current first baskets</span><span className="font-mono">{data.tracking.currentFirstBaskets}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Starter game observations</span><span className="font-mono">{data.tracking.currentStarterGames}</span></div>
          </div>
        </div>

        <div className="rounded-md border bg-card p-5">
          <div className="flex items-center gap-2 mb-4"><Activity className="w-4 h-4 text-primary" /><h2 className="font-semibold">Prediction ledger</h2></div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Top-pick wins</span><span className="font-mono">{data.ledger.topPickWins}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Top-pick accuracy</span><span className="font-mono">{data.ledger.topPickAccuracy === null ? '—' : `${data.ledger.topPickAccuracy.toFixed(1)}%`}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Candidate Brier score</span><span className="font-mono">{data.ledger.candidateBrier === null ? '—' : data.ledger.candidateBrier.toFixed(4)}</span></div>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card p-5">
        <h2 className="font-semibold mb-3">Readiness checks</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.readiness).map(([key, ok]) => (
            <Badge key={key} variant={ok ? 'secondary' : 'destructive'} className="gap-1">
              {ok ? '✓' : '!' } {key.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase())}
            </Badge>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">Updated {new Date(data.generatedAt).toLocaleString()} · Diagnostics are observational and do not alter First Basket model weights.</p>
    </div>
  );
}
