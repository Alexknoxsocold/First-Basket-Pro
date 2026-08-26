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
  espnId?: string;
  id?: string;
  position?: string;
  gamesPlayed?: number;
  avgMinutes?: number;
  avgPoints?: number;
  firstBasketPct?: number;
  firstBasketsScored?: number;
  previousSeasonFirstBaskets?: number;
  previousSeasonGamesTracked?: number;
  headshot?: string;
  injuryStatus?: string;
  isStarter?: boolean;
  depthRank?: number;
  projectionSource?: "live" | "offseason-depth-chart" | "offseason-role-fallback";
}

interface ProjectedLineupResponse {
  season: string;
  previousSeason: string;
  generatedAt: string;
  teamCount: number;
  players: EspnPlayerStat[];
}

type FormTier = "HOT" | "STRONG" | "WATCH" | "COLD" | "INSUFFICIENT";

function activeNbaSeasonLabel(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  return `${start}–${String(start + 1).slice(-2)}`;
}

function isUnavailable(player: EspnPlayerStat) {
  const status = player.injuryStatus?.toLowerCase() ?? "";
  return status.includes("out") || status.includes("suspend") || status === "inactive";
}

function projectionScore(player: EspnPlayerStat) {
  if (player.projectionSource === "live") {
    return (player.isStarter ? 100_000 : 0)
      + (player.avgMinutes ?? 0) * 100
      + (player.avgPoints ?? 0) * 2
      + (player.gamesPlayed ?? 0) / 100;
  }
  return Math.max(0, 8 - (player.depthRank ?? 8)) * 10_000
    + (player.avgMinutes ?? 0) * 100
    + (player.avgPoints ?? 0) * 2
    + (player.gamesPlayed ?? 0) / 100;
}

function selectProjectedFive(players: EspnPlayerStat[]) {
  return [...players]
    .filter((player) => !isUnavailable(player))
    .sort((a, b) => projectionScore(b) - projectionScore(a))
    .slice(0, 5);
}

function historicalFormTier(player: EspnPlayerStat): FormTier {
  const sample = player.previousSeasonGamesTracked ?? player.gamesPlayed ?? 0;
  const rate = player.firstBasketPct ?? 0;
  if (sample < 10) return "INSUFFICIENT";
  if (rate >= 15) return "HOT";
  if (rate >= 10) return "STRONG";
  if (rate >= 6) return "WATCH";
  return "COLD";
}

function formPresentation(tier: FormTier) {
  switch (tier) {
    case "HOT":
      return {
        label: "HOT",
        dot: "bg-red-500",
        text: "text-red-300",
        badge: "border-red-500/40 bg-red-500/15 text-red-300",
        row: "bg-red-500/[0.035]",
      };
    case "STRONG":
      return {
        label: "STRONG",
        dot: "bg-emerald-500",
        text: "text-emerald-300",
        badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
        row: "bg-emerald-500/[0.025]",
      };
    case "WATCH":
      return {
        label: "WATCH",
        dot: "bg-amber-400",
        text: "text-amber-300",
        badge: "border-amber-400/40 bg-amber-400/15 text-amber-300",
        row: "bg-amber-400/[0.02]",
      };
    case "COLD":
      return {
        label: "COLD",
        dot: "bg-slate-400",
        text: "text-slate-300",
        badge: "border-slate-400/30 bg-slate-400/10 text-slate-300",
        row: "",
      };
    default:
      return {
        label: "SMALL SAMPLE",
        dot: "bg-muted-foreground/50",
        text: "text-muted-foreground",
        badge: "border-border bg-muted/20 text-muted-foreground",
        row: "",
      };
  }
}

function TeamLogo({ team }: { team: string }) {
  const logo = getTeamLogoUrl(team);
  return (
    <div className="w-9 h-9 rounded-md bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
      {logo ? <img src={logo} alt={`${team} logo`} className="w-full h-full object-contain p-1" /> : <span className="text-[10px] font-bold">{team}</span>}
    </div>
  );
}

function PlayerRow({ player, index, offseason }: { player: EspnPlayerStat; index: number; offseason: boolean }) {
  const initials = player.player.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const roleParts = [player.position || "—"];
  if (player.gamesPlayed !== undefined) roleParts.push(`${Math.round(player.gamesPlayed)} GP`);
  if ((player.avgMinutes ?? 0) > 0) roleParts.push(`${(player.avgMinutes ?? 0).toFixed(0)} MIN`);
  if ((player.avgPoints ?? 0) > 0) roleParts.push(`${(player.avgPoints ?? 0).toFixed(1)} PPG`);
  const tier = historicalFormTier(player);
  const form = formPresentation(tier);

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 border-t border-border/50 ${offseason ? form.row : ""}`}>
      <span className="w-4 text-[10px] font-bold text-muted-foreground">{index + 1}</span>
      <Avatar className="w-9 h-9 ring-1 ring-border">
        <AvatarImage src={player.headshot} alt={player.player} className="object-cover object-top" />
        <AvatarFallback className="text-[10px] font-bold">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold truncate">{player.player}</span>
          <Badge variant="outline" className="h-4 px-1 text-[8px]">{offseason ? "PROJECTED" : player.isStarter ? "STARTER" : "PROJECTED"}</Badge>
          {offseason && <Badge variant="outline" className={`h-4 px-1 text-[8px] ${form.badge}`}>{form.label}</Badge>}
          {!offseason && player.isStarter && <Badge className="h-4 px-1 text-[8px]">CONFIRMED</Badge>}
        </div>
        <p className="text-[10px] text-muted-foreground">{roleParts.join(" · ")}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] text-muted-foreground">{offseason ? "25/26 FB" : "FB rate"}</p>
        <p className={`text-xs font-mono font-bold ${offseason ? form.text : ""}`}>{(player.firstBasketPct ?? 0).toFixed(1)}%</p>
        {offseason && (player.previousSeasonGamesTracked ?? 0) > 0 && (
          <p className="text-[9px] text-muted-foreground">{player.previousSeasonFirstBaskets ?? 0}/{player.previousSeasonGamesTracked}</p>
        )}
      </div>
    </div>
  );
}

function FormLegend() {
  const entries: Array<{ tier: FormTier; copy: string }> = [
    { tier: "HOT", copy: "15%+" },
    { tier: "STRONG", copy: "10–14.9%" },
    { tier: "WATCH", copy: "6–9.9%" },
    { tier: "COLD", copy: "under 6%" },
    { tier: "INSUFFICIENT", copy: "under 10 tracked games" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
      <span className="font-semibold text-foreground/80">Entering season form</span>
      {entries.map(({ tier, copy }) => {
        const form = formPresentation(tier);
        return (
          <span key={tier} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${form.dot}`} />
            <span className={form.text}>{form.label}</span>
            <span>{copy}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function ProjectedLineups() {
  const [search, setSearch] = useState("");

  const liveQuery = useQuery<EspnPlayerStat[]>({
    queryKey: ["/api/espn-player-stats"],
    staleTime: 5 * 60_000,
  });

  const projectedQuery = useQuery<ProjectedLineupResponse>({
    queryKey: ["/api/nba/projected-lineups"],
    queryFn: async () => {
      const response = await fetch("/api/nba/projected-lineups");
      if (!response.ok) throw new Error("Projected NBA lineup feed unavailable");
      return response.json() as Promise<ProjectedLineupResponse>;
    },
    staleTime: 30 * 60_000,
  });

  const liveStats = useMemo(
    () => (liveQuery.data ?? []).map((player) => ({ ...player, projectionSource: "live" as const })),
    [liveQuery.data],
  );
  const offseasonStats = projectedQuery.data?.players ?? [];
  const usingLiveFeed = liveStats.length > 0;
  const stats = usingLiveFeed ? liveStats : offseasonStats;
  const offseason = !usingLiveFeed;

  const teams = useMemo(() => {
    const grouped = new Map<string, EspnPlayerStat[]>();
    for (const player of stats) {
      if (!player.team || isUnavailable(player)) continue;
      const team = player.team.toUpperCase();
      const list = grouped.get(team) ?? [];
      list.push(player);
      grouped.set(team, list);
    }

    const q = search.trim().toLowerCase();
    return Array.from(grouped.entries())
      .map(([team, players]) => ({ team, players: selectProjectedFive(players) }))
      .filter(({ team, players }) => !q || team.toLowerCase().includes(q) || players.some((player) => player.player.toLowerCase().includes(q)))
      .sort((a, b) => a.team.localeCompare(b.team));
  }, [stats, search]);

  const isLoading = liveQuery.isLoading || (!usingLiveFeed && projectedQuery.isLoading);
  const hardError = !usingLiveFeed && offseasonStats.length === 0 && liveQuery.isError && projectedQuery.isError;
  const season = activeNbaSeasonLabel();
  const previousSeason = projectedQuery.data?.previousSeason?.replace("/", "–") ?? "2025–26";

  if (isLoading) {
    return <div className="p-6 max-w-7xl mx-auto space-y-4"><Skeleton className="h-20 w-full" /><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72" />)}</div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="rounded-lg border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">{season} Projected NBA Lineups</h1>
            {offseason && <Badge variant="outline" className="text-[9px]">OFFSEASON</Badge>}
            <Badge variant="secondary" className="text-[9px]">{usingLiveFeed ? "LIVE GAME FEED" : "CURRENT ROSTERS + PRIOR ROLE"}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            {usingLiveFeed
              ? "Live game teams use current starter and role data, with confirmed starters taking priority."
              : `All 30 teams are projected from current ESPN roster/depth-chart data, using ${previousSeason} games, minutes, scoring role, and historical First Basket context.`}
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
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {offseason
              ? `Historical ${previousSeason} First Basket numbers are research context only. ${season} counts stay at zero until official games begin.`
              : "Confirmed starters and current-season evidence can now replace offseason projections automatically."}
          </p>
        </div>
      </div>

      {offseason && <FormLegend />}

      {hardError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Could not load the NBA lineup feed.</div>
      ) : teams.length === 0 ? (
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {search ? "No projected lineups match this search." : "NBA projection data is refreshing. Try Refresh shortly."}
        </div>
      ) : (
        <>
          {offseason && (
            <p className="text-[11px] text-muted-foreground">Showing {teams.length} of {projectedQuery.data?.teamCount ?? 30} NBA teams.</p>
          )}
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
                {players.map((player, index) => <PlayerRow key={`${team}-${player.espnId || player.id || player.player}`} player={player} index={index} offseason={offseason} />)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
