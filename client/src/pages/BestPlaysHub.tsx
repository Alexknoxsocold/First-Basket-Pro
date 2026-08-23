import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CheckCircle2, ChevronDown, Clock3, Mail, Trophy, XCircle, Sparkles } from 'lucide-react';
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

type WnbaPropPlay = {
  player: string;
  team: string;
  opponent: string;
  gameTime: string;
  headshot: string | null;
  marketLabel: string;
  projection: number;
  line: number | null;
  side: 'OVER' | 'UNDER' | null;
  edge: number | null;
  confidence: number;
  confidenceLabel: 'STRONG' | 'GOOD' | 'WATCH';
  isBettable: boolean;
  book: string | null;
  odds: number | null;
};

type WnbaPropsPayload = {
  plays: WnbaPropPlay[];
  verifiedLines: number;
  note: string;
};

type View = 'games' | 'outcomes' | 'wins';

function american(v: number | null) {
  if (v === null) return '';
  return v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
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

function WnbaPropCard({ play }: { play: WnbaPropPlay }) {
  return <Link href="/wnba/props" className="block rounded-lg border border-violet-500/25 bg-violet-500/5 p-4 transition-colors hover:bg-violet-500/10">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
          {play.headshot ? <img src={play.headshot} alt="" className="h-full w-full object-cover object-top" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-bold">{play.team}</div>}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[9px]">WNBA PROP</Badge>
            <Badge variant="outline" className="text-[9px] border-violet-500/30 text-violet-600 dark:text-violet-300">{play.confidenceLabel}</Badge>
          </div>
          <div className="mt-1.5 truncate text-sm font-bold">{play.player}</div>
          <div className="text-[10px] text-muted-foreground">{play.team} vs {play.opponent} · {play.marketLabel}</div>
          <div className="mt-2 text-xs font-bold">{play.side} {play.line?.toFixed(1)}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Model {play.projection.toFixed(1)} · Edge {play.edge?.toFixed(1)}{play.book ? ` · ${play.book}` : ''}{play.odds !== null ? ` ${american(play.odds)}` : ''}</div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-lg font-black">{play.confidence}%</div>
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">confidence</div>
      </div>
    </div>
  </Link>;
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
  const props = useQuery<WnbaPropsPayload>({
    queryKey: ['/api/wnba/props'],
    enabled: view === 'games',
    staleTime: 120000,
    refetchInterval: 300000,
    retry: 1,
  });

  const filtered = (results.data?.outcomes || []).filter(row => view !== 'wins' || row.result === 'won');
  const strongestProps = (props.data?.plays || []).filter(play => play.isBettable && play.side && play.line !== null).slice(0, 3);

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
        <select
          value={view}
          onChange={e => setView(e.target.value as View)}
          className="appearance-none rounded-md border bg-background pl-3 pr-9 py-2 text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Best Plays view"
        >
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

    {view === 'games' ? <>
      {strongestProps.length ? <section className="rounded-lg border border-violet-500/20 bg-card/80 p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-violet-500" />Strongest WNBA Props</div>
            <div className="mt-1 text-[10px] text-muted-foreground">Only verified sportsbook lines that clear the prop model's edge threshold appear here.</div>
          </div>
          <Link href="/wnba/props" className="shrink-0 text-[10px] font-semibold text-primary hover:underline">View all props</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{strongestProps.map(play => <WnbaPropCard key={`${play.player}-${play.marketLabel}`} play={play} />)}</div>
      </section> : null}
      <BestPlays />
    </> : <div className="space-y-4">
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
