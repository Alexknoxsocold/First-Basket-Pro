import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CheckCircle2, ChevronDown, Clock3, Mail, Sparkles, Trophy, XCircle } from 'lucide-react';
import BestPlays from './BestPlays';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type Outcome = {
  id: string;
  sport: 'MLB' | 'WNBA' | 'NBA' | string;
  market: string;
  matchup: string;
  pick: string;
  probability: number;
  result: 'won' | 'lost';
  actual: string;
  gradedAt: string | null;
  href: string;
};

type OutcomePayload = {
  date: string;
  resetTimeZone: string;
  resetAt: string;
  total: number;
  wins: number;
  losses: number;
  outcomes: Outcome[];
};

type WnbaCandidate = {
  name: string;
  team: string;
  probability: number;
  rank: number;
  headshot?: string | null;
};

type WnbaGame = {
  id: string;
  date: string;
  awayTeam: string;
  homeTeam: string;
  lineupStatus: 'confirmed' | 'projected' | 'waiting' | string;
  candidates: WnbaCandidate[];
};

type WnbaSlate = { games: WnbaGame[] };
type View = 'games' | 'outcomes' | 'wins';

function gameTime(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? 'Time pending'
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}

function OutcomeCard({ row }: { row: Outcome }) {
  const won = row.result === 'won';
  return <Link href={row.href} className={`block rounded-lg border p-4 transition-colors ${won ? 'border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/15' : 'border-red-500/30 bg-red-500/8 hover:bg-red-500/12'}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[9px]">{row.sport}</Badge>
          <Badge variant="outline" className="text-[9px]">{row.market}</Badge>
          <span className="text-[10px] text-muted-foreground truncate">{row.matchup}</span>
        </div>
        <div className="mt-2 font-bold text-sm">{row.pick}</div>
        <div className="mt-1 text-[10px] text-muted-foreground">Verified result: {row.actual}</div>
      </div>
      <div className="text-right shrink-0">
        <div className={`inline-flex items-center gap-1 text-xs font-black ${won ? 'text-emerald-500' : 'text-red-500'}`}>
          {won ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {won ? 'HIT' : 'MISS'}
        </div>
        <div className="mt-1 font-mono text-xs font-semibold">{Number(row.probability).toFixed(1)}%</div>
      </div>
    </div>
  </Link>;
}

function WnbaStrongest({ slate, loading }: { slate?: WnbaSlate; loading: boolean }) {
  const strongest = (slate?.games || [])
    .flatMap(game => (game.candidates || []).slice(0, 2).map(player => ({ game, player })))
    .filter(({ player }) => player.probability >= 10)
    .sort((a, b) => a.player.rank - b.player.rank || b.player.probability - a.player.probability)
    .slice(0, 2);

  if (loading && !strongest.length) {
    return <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-24 w-full rounded-xl" /></div>;
  }
  if (!strongest.length) return null;

  return <div className="rounded-xl border bg-card/85 p-3 sm:p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" />WNBA Strongest Plays</div>
        <div className="mt-1 text-[10px] text-muted-foreground">Pinned here so today's strongest WNBA first-basket plays do not get pushed off the homepage by other sports.</div>
      </div>
      <Link href="/wnba" className="shrink-0 text-[10px] font-semibold text-primary hover:underline">View WNBA</Link>
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {strongest.map(({ game, player }) => <Link href="/wnba" key={`${game.id}-${player.rank}-${player.name}`} className="block rounded-xl border bg-background/60 p-3 transition-colors hover:bg-muted/40">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-muted">
            {player.headshot ? <img src={player.headshot} alt={player.name} className="h-full w-full object-cover object-[50%_24%]" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-black">{player.team}</div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-black">{player.name}</span>
              <Badge variant="outline" className={player.rank === 1 ? 'border-emerald-500/30 bg-emerald-500/10 text-[8px] text-emerald-600' : 'border-primary/25 bg-primary/10 text-[8px] text-primary'}>{player.rank === 1 ? 'BEST PLAY' : 'STRONG PLAY'}</Badge>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">{game.awayTeam} @ {game.homeTeam} · {game.lineupStatus === 'confirmed' ? 'Confirmed starters' : 'Projected lineup'}</div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">{gameTime(game.date)}</span>
              <span className="font-mono text-sm font-black">{player.probability.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </Link>)}
    </div>
  </div>;
}

export default function BestPlaysHub() {
  const [view, setView] = useState<View>('games');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const results = useQuery<OutcomePayload>({
    queryKey: ['/api/best-plays/outcomes'],
    staleTime: 30000,
    refetchInterval: 60000,
    retry: 1,
  });
  const wnba = useQuery<WnbaSlate>({
    queryKey: ['/api/wnba/first-basket'],
    staleTime: 60000,
    refetchInterval: 120000,
    retry: 1,
  });

  const filtered = (results.data?.outcomes || []).filter(row => view !== 'wins' || row.result === 'won');

  async function subscribeNewsletter(e: React.FormEvent) {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setSubscribing(true);
    setNewsletterStatus('');
    try {
      const r = await fetch('/api/newsletter/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:newsletterEmail.trim() }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || 'Unable to subscribe');
      setNewsletterStatus('Subscribed — daily strongest plays will be sent to this email.');
      setNewsletterEmail('');
    } catch (err:any) {
      setNewsletterStatus(err?.message || 'Unable to subscribe right now.');
    } finally {
      setSubscribing(false);
    }
  }

  return <div className="space-y-4">
    <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/95 p-3 shadow-sm backdrop-blur">
      <div>
        <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /><span className="text-sm font-bold">Best Plays</span></div>
        <div className="mt-1 text-[10px] text-muted-foreground">Daily results reset at midnight ET.</div>
      </div>
      <div className="relative">
        <select value={view} onChange={e => setView(e.target.value as View)} className="appearance-none rounded-md border bg-background pl-3 pr-9 py-2 text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" aria-label="Best Plays view">
          <option value="games">Today's Games</option>
          <option value="outcomes">Today's Outcomes</option>
          <option value="wins">Today's Winning Outcomes</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>

    <div className="rounded-lg border bg-card/80 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold"><Mail className="h-4 w-4 text-primary" />PreziTools Daily Plays</div>
          <div className="mt-1 text-[10px] text-muted-foreground">Get WNBA strongest plays, NBA strongest plays when active, and MLB best/value plays by email. Unsubscribe anytime.</div>
        </div>
        <form onSubmit={subscribeNewsletter} className="flex w-full gap-2 sm:w-auto">
          <input type="email" required value={newsletterEmail} onChange={e => setNewsletterEmail(e.target.value)} placeholder="you@email.com" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring sm:w-56" aria-label="Newsletter email" />
          <button type="submit" disabled={subscribing} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">{subscribing ? 'Joining…' : 'Join'}</button>
        </form>
      </div>
      {newsletterStatus ? <div className="mt-2 text-[10px] text-muted-foreground">{newsletterStatus}</div> : null}
    </div>

    {view === 'games' ? <><WnbaStrongest slate={wnba.data} loading={wnba.isLoading} /><BestPlays /></> : <div className="space-y-4">
      {results.isLoading ? <><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></> : results.isError ? <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Today's verified outcomes are temporarily unavailable.</div> : <>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-3"><div className="text-xl font-bold">{results.data?.total ?? 0}</div><div className="text-[10px] text-muted-foreground">Graded today</div></div>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3"><div className="text-xl font-bold text-emerald-500">{results.data?.wins ?? 0}</div><div className="text-[10px] text-muted-foreground">Winning plays</div></div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"><div className="text-xl font-bold text-red-500">{results.data?.losses ?? 0}</div><div className="text-[10px] text-muted-foreground">Misses</div></div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Clock3 className="w-3.5 h-3.5" />Only verified, graded plays from the current Eastern Time calendar day appear here.</div>
        {filtered.length ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{filtered.map(row => <OutcomeCard key={row.id} row={row} />)}</div> : <div className="rounded-lg border bg-card p-8 text-center"><div className="font-semibold text-sm">{view === 'wins' ? 'No winning outcomes posted yet.' : 'No graded outcomes yet.'}</div><div className="mt-1 text-[10px] text-muted-foreground">Results will appear automatically as today's Best Plays finish and are verified.</div></div>}
      </>}
    </div>}
  </div>;
}
