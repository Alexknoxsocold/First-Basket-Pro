import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, ShieldCheck, Users } from "lucide-react";
import { getTeamLogoUrl } from "@/components/GameRow";

interface EspnPlayerStat {
  player: string;
  team: string;
  espnId: string;
  position?: string;
  gamesPlayed?: number;
  avgMinutes?: number;
  avgPoints?: number;
  firstBasketPct?: number;
  firstBasketsScored?: number;
  headshot?: string;
  injuryStatus?: string;
  isStarter?: boolean;
}

function isUnavailable(player: EspnPlayerStat) {
  const status = player.injuryStatus?.toLowerCase() ?? "";
  return status.includes("out") || status.includes("suspend") || status === "inactive";
}

function projectionScore(player: EspnPlayerStat) {
  // Official starter flags win when available. During the offseason, minutes
  // and role provide a stable fallback without hard-coding a depth chart.
  return (player.isStarter ? 10_000 : 0)
    + (player.avgMinutes ?? 0) * 100
    + (player.avgPoints ?? 0) * 2
    + (player.gamesPlayed ?? 0) / 100;
}

function TeamLogo({ team }: { team: string }) {
  const logo = getTeamLogoUrl(team);
  return (
    <div className="w-9 h-9 rounded-md bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
      {logo ? <img src={logo} alt={`${team} logo`} className="w-full h-full object-contain p-1" /> : <span className="text-[10px] font-bold">{team}</span>}
    </div>
  );
}

function PlayerRow({ player, index }: { player: EspnPlayerStat; index: number }) {
  const initials = player.player.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-t border-border/50">
      <span className="w-4 text-[10px] font-bold text-muted-foreground">{index + 1}</span>
      <Avatar className="w-9 h-9 ring-1 ring-border">
        <AvatarImage src={player.headshot} alt={player.player} className="object-cover object-top" />
        <AvatarFallback className="text-[10px] font-bold">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold truncate">{player.player}</span>
          <Badge variant="outline" className="h-4 px-1 text-[8px]">PROJECTED</Badge>
          {player.isStarter && <Badge className="h-4 px-1 text-[8px]">LAST STARTER</Badge>}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {player.position || "—"} · {(player.avgMinutes ?? 0).toFixed(0)} MIN · {(player.avgPoints ?? 0).toFixed(1)} PPG
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] text-muted-foreground">Historical FB</p>
        <p className="text-xs font-mono font-bold">{Math.round(player.firstBasketPct ?? 0)}%</p>
      </div>
    </div>
  );
}

export default function ProjectedLineups() {
  const [search, setSearch] = useState("");
  const { data: stats, isLoading, error } = useQuery<EspnPlayerStat[]>({
    queryKey: ["/api/espn-player-stats"],
    staleTime: 5 * 60_000,
  });

  const teams = useMemo(() => {
    const grouped = new Map<string, EspnPlayerStat[]>();
    for (const player of stats ?? []) {
      if (!player.team || isUnavailable(player)) continue;
      const list = grouped.get(player.team) ?? [];
      list.push(player);
      grouped.set(player.team, list);
    }

    const q = search.trim().toLowerCase();
    return Array.from(grouped.entries())
      .map(([team, players]) => ({
        team,
        players: [...players].sort((a, b) => projectionScore(b) - projectionScore(a)).slice(0, 5),
      }))
      .filter(({ team, players }) => !q || team.toLowerCase().includes(q) || players.some((p) => p.player.toLowerCase().includes(q)))
      .sort((a, b) => a.team.localeCompare(b.team));
  }, [stats, search]);

  if (isLoading) {
    return <div className="p-6 max-w-7xl mx-auto space-y-4"><Skeleton className="h-20 w-full" /><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72" />)}</div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="rounded-lg border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">2026–27 Projected NBA Lineups</h1>
            <Badge variant="outline" className="text-[9px]">OFFSEASON</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            Projected five are generated from the current player feed, prioritizing official starter flags and recent role/minutes. They automatically give way to live starter data when the season returns.
          </p>
        </div>
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team or player..." className="pl-9 w-full md:w-56" />
        </div>
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex gap-3">
        <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold">Projection mode — no First Basket locks</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Historical FB rate is shown for research only. Projected lineups cannot create a lock, Value play, or live betting recommendation. Current-season FB counts remain zero until official 2026–27 games begin.</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Could not load the NBA player feed.</div>
      ) : teams.length === 0 ? (
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">No projected lineups match this search.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map(({ team, players }) => (
            <div key={team} className="rounded-lg border bg-card overflow-hidden">
              <div className="px-3 py-3 flex items-center gap-3 bg-muted/20">
                <TeamLogo team={team} />
                <div className="flex-1">
                  <p className="font-bold text-sm">{team}</p>
                  <p className="text-[10px] text-muted-foreground">Projected starting five · {players.length}/5 available</p>
                </div>
              </div>
              {players.map((player, index) => <PlayerRow key={`${team}-${player.espnId || player.player}`} player={player} index={index} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
