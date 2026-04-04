import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, RefreshCw, TrendingUp,
  AlertCircle, AlertTriangle, Activity, Shield,
  Star, Zap, ArrowLeftRight, Clock, ChevronDown, ChevronUp
} from "lucide-react";

import type { Game } from "@shared/schema";
import { getTeamLogoUrl } from "@/components/GameRow";
import dkLogoImg from "@assets/fyz4mydi8ceuovtoaooy_1775294282507.avif";
import fdLogoImg from "@assets/Daniel+Frumhoff_FanDuel+9_1775294382033.jpg";

function TeamLogo({ team, size = "sm" }: { team: string; size?: "sm" | "md" }) {
  const logoUrl = getTeamLogoUrl(team);
  const sizeClass = size === "md" ? "w-8 h-8" : "w-6 h-6";
  return (
    <div className={`${sizeClass} rounded-md bg-muted/40 overflow-hidden flex items-center justify-center shrink-0`}>
      {logoUrl ? (
        <img src={logoUrl} alt={`${team} logo`} className="w-full h-full object-contain p-0.5"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <span className="text-[9px] font-bold text-muted-foreground">{team.slice(0, 3)}</span>
      )}
    </div>
  );
}

// DraftKings logo badge
function DkLogo({ className = "w-5 h-5", dimmed = false }: { className?: string; dimmed?: boolean }) {
  return (
    <img
      src={dkLogoImg}
      alt="DraftKings"
      className={`${className} rounded object-contain`}
      style={{ opacity: dimmed ? 0.45 : 1 }}
    />
  );
}

// FanDuel logo badge
function FdLogo({ className = "w-5 h-5", dimmed = false }: { className?: string; dimmed?: boolean }) {
  return (
    <img
      src={fdLogoImg}
      alt="FanDuel"
      className={`${className} rounded object-contain`}
      style={{ opacity: dimmed ? 0.4 : 1 }}
    />
  );
}

interface EspnPlayerStat {
  player: string;
  team: string;
  espnId: string;
  position: string;
  gamesPlayed: number;
  avgPoints: number;
  avgFGA: number;
  fgPct: number;
  avgMinutes: number;
  avgAssists: number;
  avgRebounds: number;
  firstBasketPct: number;
  q1FgaRate: number;
  odds: string;
  liveOdds?: string;
  headshot?: string;
  injuryStatus?: string;
  isStarter?: boolean;
}

// Parse American odds string → implied probability (0–100)
function parseOddsToImplied(odds: string): number {
  const match = odds?.match(/^([+-]?\d+)/);
  if (!match) return 0;
  const num = parseInt(match[1]);
  if (num > 0) return (100 / (num + 100)) * 100;
  if (num < 0) return (Math.abs(num) / (Math.abs(num) + 100)) * 100;
  return 0;
}

// Sneaky Value: player is NOT the top pick on their team but has compelling
// first-basket indicators. Uses 5 independent signals; needs ≥ 2 to qualify.
function checkSneakyValue(stat: EspnPlayerStat, teamRank: number): boolean {
  if (teamRank === 1) return false;          // already highlighted as top pick
  if (teamRank > 5) return false;            // too deep in the rotation
  if (stat.firstBasketPct < 5) return false; // negligible probability
  const inj = stat.injuryStatus?.toLowerCase() || "";
  if (inj.includes("out")) return false;

  const displayOdds = stat.liveOdds || stat.odds;
  const impliedPct = parseOddsToImplied(displayOdds);

  let score = 0;
  // Signal 1: starter who gets into rhythm early
  if (stat.isStarter) score++;
  // Signal 2: high shot volume — shoots a lot, likely to attempt first basket
  if (stat.avgFGA >= 10) score++;
  // Signal 3: long floor time — more possessions = more shots
  if (stat.avgMinutes >= 28) score++;
  // Signal 4: model sees more value than DK's odds imply
  if (impliedPct > 0 && stat.firstBasketPct > impliedPct + 1.5) score++;
  // Signal 5: efficient high-volume shooter — goes for shots confidently
  if (stat.avgFGA >= 8 && stat.fgPct >= 44) score++;

  return score >= 2;
}

function InjuryBadge({ status }: { status?: string }) {
  if (!status) return null;
  const upper = status.toUpperCase();
  if (upper.includes("OUT")) return (
    <Badge className="text-[9px] h-4 px-1 gap-0.5 bg-red-500/15 text-red-500 border border-red-500/30 font-semibold no-default-active-elevate">
      <AlertCircle className="h-2.5 w-2.5" />OUT
    </Badge>
  );
  if (upper.includes("DAY") || upper.includes("DTD")) return (
    <Badge className="text-[9px] h-4 px-1 gap-0.5 bg-yellow-500/15 text-yellow-500 border border-yellow-500/30 font-semibold no-default-active-elevate">
      <Activity className="h-2.5 w-2.5" />DTD
    </Badge>
  );
  if (upper.includes("QUESTION")) return (
    <Badge className="text-[9px] h-4 px-1 gap-0.5 bg-orange-500/15 text-orange-500 border border-orange-500/30 font-semibold no-default-active-elevate">
      <AlertTriangle className="h-2.5 w-2.5" />Q
    </Badge>
  );
  if (upper.includes("PROB")) return (
    <Badge className="text-[9px] h-4 px-1 gap-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/20 font-medium no-default-active-elevate">
      <Shield className="h-2.5 w-2.5" />P
    </Badge>
  );
  return null;
}

function FbBar({ pct, isTopPick = false, isSneakyValue = false }: { pct: number; isTopPick?: boolean; isSneakyValue?: boolean }) {
  const maxPct = 35;
  const barWidth = Math.min(pct / maxPct * 100, 100);
  const isElite = pct >= 28;
  const isGood = pct >= 20;
  const barColor = isElite
    ? "bg-green-500"
    : isGood
      ? "bg-yellow-500"
      : isTopPick
        ? "bg-emerald-700"
        : isSneakyValue
          ? "bg-teal-700"
          : "bg-red-500/70";
  const textColor = isElite
    ? "text-green-400"
    : isGood
      ? "text-yellow-400"
      : isTopPick
        ? "text-emerald-500"
        : isSneakyValue
          ? "text-teal-400"
          : "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
      </div>
      <span className={`font-mono text-xs font-bold w-12 text-right ${textColor}`}>{pct.toFixed(1)}%</span>
    </div>
  );
}

function PlayerCard({
  stat,
  rank,
  showLiveOdds = false,
  isTopPick = false,
  isSneakyValue = false,
}: {
  stat: EspnPlayerStat;
  rank: number;
  showLiveOdds?: boolean;
  isTopPick?: boolean;
  isSneakyValue?: boolean;
}) {
  const isElite = stat.firstBasketPct >= 28;
  const isGood = stat.firstBasketPct >= 20;
  // isLow only applies if not highlighted by another flag
  const isLow = stat.firstBasketPct < 20 && !isTopPick && !isSneakyValue;
  const initials = stat.player.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const displayOdds = stat.liveOdds || stat.odds;
  const isLive = !!stat.liveOdds;

  // Card tint
  const cardBg = isElite
    ? "bg-green-500/5"
    : isTopPick
      ? "bg-emerald-900/30"
      : isSneakyValue
        ? "bg-teal-900/25"
        : isLow
          ? "bg-red-500/5"
          : "";

  // Avatar ring
  const avatarRing = isElite
    ? "ring-green-500/60"
    : isTopPick
      ? "ring-emerald-600/50"
      : isSneakyValue
        ? "ring-teal-600/50"
        : "ring-border";

  // Odds color
  const oddsColor = isElite || isGood
    ? "text-green-400"
    : isTopPick
      ? "text-emerald-500"
      : isSneakyValue
        ? "text-teal-400"
        : "text-red-400";

  return (
    <div
      className={`flex gap-3 p-3 rounded-md transition-colors hover-elevate ${cardBg}`}
      data-testid={`card-player-${stat.player.replace(/\s/g, '-')}`}
    >
      {/* Rank + Avatar */}
      <div className="flex items-start gap-2 shrink-0">
        <span className={`text-[10px] font-bold w-4 text-center pt-1 ${rank <= 3 ? "text-primary" : "text-muted-foreground/50"}`}>
          {rank}
        </span>
        <div className="relative">
          <Avatar className={`w-11 h-11 ring-1 ${avatarRing}`}>
            <AvatarImage src={stat.headshot} alt={stat.player} className="object-cover object-top" />
            <AvatarFallback className="text-xs font-bold bg-muted text-muted-foreground">{initials}</AvatarFallback>
          </Avatar>
          {(isElite || isTopPick || isSneakyValue) && (
            <span className={`absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full ${isElite ? "bg-green-500" : isTopPick ? "bg-emerald-700" : "bg-teal-700"}`}>
              {isSneakyValue && !isTopPick && !isElite
                ? <Zap className="w-2.5 h-2.5 text-white" />
                : <Star className="w-2.5 h-2.5 text-white fill-white" />
              }
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Name row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold leading-tight">{stat.player}</span>
          <InjuryBadge status={stat.injuryStatus} />
          {stat.isStarter && (
            <Badge className="text-[9px] h-4 px-1 bg-primary/15 text-primary border border-primary/20 font-medium no-default-active-elevate">S</Badge>
          )}
          {isTopPick && !isElite && (
            <Badge className="text-[9px] h-4 px-1.5 bg-emerald-900/60 text-emerald-400 border border-emerald-700/40 font-semibold no-default-active-elevate">
              Top Pick
            </Badge>
          )}
          {isSneakyValue && !isTopPick && !isElite && (
            <Badge className="text-[9px] h-4 px-1.5 bg-teal-900/60 text-teal-300 border border-teal-700/40 font-semibold no-default-active-elevate">
              Value
            </Badge>
          )}
        </div>

        {/* Position + GP */}
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {stat.position} &bull; {stat.avgMinutes.toFixed(0)} MIN &bull; {stat.gamesPlayed} GP
        </p>

        {/* FB% bar */}
        <div className="mt-2">
          <FbBar pct={stat.firstBasketPct} isTopPick={isTopPick} isSneakyValue={isSneakyValue} />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {/* Odds — always show DK logo, dimmed if estimated */}
          <div className="flex items-center gap-1.5">
            <DkLogo className="w-4 h-4 shrink-0" dimmed={!isLive} />
            <span className={`font-mono text-xs font-bold ${oddsColor}`}>
              {displayOdds}
            </span>
            {!isLive && (
              <span className="text-[9px] text-muted-foreground/40 font-medium">Est</span>
            )}
          </div>

          <span className="text-[10px] text-muted-foreground/30">|</span>

          {/* Key stats */}
          <span className="text-[10px] text-muted-foreground">
            <span className={stat.avgPoints >= 25 ? "text-green-400 font-semibold" : stat.avgPoints < 10 ? "text-red-400 font-semibold" : ""}>{stat.avgPoints.toFixed(1)}</span>
            {" PPG"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            <span className={stat.avgFGA >= 15 ? "text-green-400 font-semibold" : stat.avgFGA < 6 ? "text-red-400 font-semibold" : ""}>{stat.avgFGA.toFixed(1)}</span>
            {" FGA"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            <span className={stat.fgPct >= 50 ? "text-green-400 font-semibold" : stat.fgPct < 38 ? "text-red-400 font-semibold" : ""}>{stat.fgPct.toFixed(1)}%</span>
            {" FG"}
          </span>
        </div>
      </div>
    </div>
  );
}

function MatchupH2H({
  game,
  awayPlayers,
  homePlayers,
  showLiveOdds,
}: {
  game: Game;
  awayPlayers: EspnPlayerStat[];
  homePlayers: EspnPlayerStat[];
  showLiveOdds: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const formatTime = (t?: string | null) => {
    if (!t) return null;
    try {
      const d = new Date(t);
      if (isNaN(d.getTime())) return t;
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
    } catch { return t; }
  };

  const time = formatTime(game.gameTime);
  const hasLive = awayPlayers.some(p => !!p.liveOdds) || homePlayers.some(p => !!p.liveOdds);

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      {/* Matchup header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 border-b hover-elevate"
        onClick={() => setExpanded(e => !e)}
        data-testid={`button-matchup-${game.awayTeam}-${game.homeTeam}`}
      >
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="w-4 h-4 text-primary shrink-0" />
          <span className="font-bold text-sm">
            {game.awayTeam} <span className="text-muted-foreground font-normal">@</span> {game.homeTeam}
          </span>
          {time && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {time}
            </span>
          )}
          {hasLive && (
            <Badge className="text-[9px] h-4 px-1.5 bg-green-500/15 text-green-400 border border-green-500/20 font-semibold no-default-active-elevate">
              DK LIVE ODDS
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {awayPlayers.length + homePlayers.length} players
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Away team */}
          <div>
            <div className="px-4 py-2 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TeamLogo team={game.awayTeam} size="sm" />
                <span className="text-xs text-muted-foreground font-medium">AWAY</span>
                <span className="font-bold text-sm">{game.awayTeam}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{awayPlayers.length} players</span>
            </div>
            <div className="divide-y divide-border/40">
              {awayPlayers.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">No players found</p>
              ) : (
                awayPlayers.map((p, i) => (
                  <PlayerCard
                    key={`${p.team}-${p.player}`}
                    stat={p}
                    rank={i + 1}
                    showLiveOdds={showLiveOdds}
                    isTopPick={i === 0}
                    isSneakyValue={checkSneakyValue(p, i + 1)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Home team */}
          <div>
            <div className="px-4 py-2 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TeamLogo team={game.homeTeam} size="sm" />
                <span className="text-xs text-muted-foreground font-medium">HOME</span>
                <span className="font-bold text-sm">{game.homeTeam}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{homePlayers.length} players</span>
            </div>
            <div className="divide-y divide-border/40">
              {homePlayers.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">No players found</p>
              ) : (
                homePlayers.map((p, i) => (
                  <PlayerCard
                    key={`${p.team}-${p.player}`}
                    stat={p}
                    rank={i + 1}
                    showLiveOdds={showLiveOdds}
                    isTopPick={i === 0}
                    isSneakyValue={checkSneakyValue(p, i + 1)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlayerStats() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStarters, setFilterStarters] = useState(false);
  const [viewMode, setViewMode] = useState<"h2h" | "list">("h2h");

  const { data: espnStats, isLoading: espnLoading, error: espnError, refetch, isFetching } = useQuery<EspnPlayerStat[]>({
    queryKey: ["/api/espn-player-stats"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: games } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const todayGames = useMemo(() => {
    if (!games) return [];
    const todayISO = new Date().toISOString().split("T")[0];
    return games.filter((g) => {
      if (g.gameDate === "Today") return true;
      if (g.gameTime) return new Date(g.gameTime).toISOString().split("T")[0] === todayISO;
      return g.gameDate === todayISO;
    });
  }, [games]);

  // Get all active (non-out) players sorted by FB%
  const allActivePlayers = useMemo(() => {
    if (!espnStats) return [];
    let result = [...espnStats].filter((p) => {
      const inj = p.injuryStatus?.toLowerCase() || "";
      return !inj.includes("out") && !inj.includes("suspend");
    });
    if (filterStarters) result = result.filter((p) => p.isStarter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => b.firstBasketPct - a.firstBasketPct);
  }, [espnStats, filterStarters, searchQuery]);

  // Group players by game matchup
  const matchupGroups = useMemo(() => {
    return todayGames.map((game) => {
      const away = allActivePlayers
        .filter((p) => p.team === game.awayTeam)
        .sort((a, b) => b.firstBasketPct - a.firstBasketPct);
      const home = allActivePlayers
        .filter((p) => p.team === game.homeTeam)
        .sort((a, b) => b.firstBasketPct - a.firstBasketPct);
      return { game, away, home };
    });
  }, [todayGames, allActivePlayers]);

  const hasLiveOdds = useMemo(() => espnStats?.some((p) => !!p.liveOdds) ?? false, [espnStats]);

  // Map each player to their rank within their own team (for sneaky value detection in list view)
  const teamRankMap = useMemo<Record<string, number>>(() => {
    if (!espnStats) return {};
    const byTeam: Record<string, EspnPlayerStat[]> = {};
    espnStats.forEach(s => {
      if (!byTeam[s.team]) byTeam[s.team] = [];
      byTeam[s.team].push(s);
    });
    const map: Record<string, number> = {};
    Object.values(byTeam).forEach(players => {
      [...players].sort((a, b) => b.firstBasketPct - a.firstBasketPct)
        .forEach((p, i) => { map[`${p.team}-${p.player}`] = i + 1; });
    });
    return map;
  }, [espnStats]);

  const topPicks = useMemo(() => {
    if (!espnStats) return [];
    return [...espnStats]
      .filter((p) => {
        const inj = p.injuryStatus?.toLowerCase() || "";
        return !inj.includes("out");
      })
      .sort((a, b) => b.firstBasketPct - a.firstBasketPct)
      .slice(0, 5);
  }, [espnStats]);

  if (espnLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const hasStats = espnStats && espnStats.length > 0;

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Player FB Stats
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            ESPN 2025-26 season data &bull; {allActivePlayers.length} confirmed players
            {hasLiveOdds && (
              <span className="ml-2 text-green-400 font-semibold">
                &bull; DraftKings Live Odds
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode toggle */}
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setViewMode("h2h")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "h2h" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-h2h"
            >
              H2H View
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-list"
            >
              List View
            </button>
          </div>

          <Button
            variant={filterStarters ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStarters(!filterStarters)}
            className="text-xs"
            data-testid="button-filter-starters"
          >
            Starters Only
          </Button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              className="pl-9 w-44 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-players"
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-espn-stats"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {espnError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load player stats. ESPN API may be temporarily unavailable.
        </div>
      )}

      {/* Top 5 Picks banner */}
      {topPicks.length > 0 && (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-primary/10 flex items-center gap-2 flex-wrap">
            <Star className="w-3.5 h-3.5 text-primary fill-current" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Top 5 First Basket Picks</span>
            <div className="ml-auto flex items-center gap-2">
              {hasLiveOdds && (
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <DkLogo className="w-4 h-4" />
                  <span className="text-green-400 font-semibold">Live DK Odds</span>
                </span>
              )}
              <span className="text-muted-foreground/40 text-xs">|</span>
              <a
                href="https://www.fanduel.com/sports/nba"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <FdLogo className="w-4 h-4" />
                <span>FanDuel</span>
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-border">
            {topPicks.map((p, i) => {
              const initials = p.player.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
              const displayOdds = p.liveOdds || p.odds;
              const isLive = !!p.liveOdds;
              return (
                <div key={p.player} className="flex items-center gap-2.5 p-3" data-testid={`pick-top-${i + 1}`}>
                  <div className="relative shrink-0">
                    <Avatar className="w-10 h-10 ring-1 ring-green-500/40">
                      <AvatarImage src={p.headshot} alt={p.player} className="object-cover object-top" />
                      <AvatarFallback className="text-xs font-bold bg-muted">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -top-1 -left-1 flex items-center justify-center w-4 h-4 bg-primary rounded-full text-[9px] font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{p.player}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.team} &bull; {p.position}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs font-bold text-green-400">{p.firstBasketPct.toFixed(1)}%</span>
                      {isLive && <DkLogo className="w-3.5 h-3.5 shrink-0" />}
                      <span className={`text-[10px] font-semibold ${isLive ? "text-green-400" : "text-muted-foreground"}`}>
                        {displayOdds}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">FB% key:</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Elite 28%+</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Good 20–27%</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-700 inline-block" />Top Pick</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-700 inline-block" />Sneaky Value</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500/70 inline-block" />Low &lt;20%</span>
        <span className="ml-auto flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5"><DkLogo className="w-3.5 h-3.5" /> = DraftKings live odds</span>
          <span className="text-muted-foreground/40">|</span>
          <span className="flex items-center gap-1"><span className="text-muted-foreground/60 font-bold text-[10px]">Est</span> = model estimate</span>
          <span className="text-muted-foreground/40">|</span>
          <a
            href="https://www.fanduel.com/sports/nba"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <FdLogo className="w-3.5 h-3.5" />
            <span>Compare on FanDuel</span>
          </a>
        </span>
      </div>

      {/* Main content */}
      {!hasStats ? (
        <div className="rounded-md border bg-card px-6 py-12 text-center">
          <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Loading player data from ESPN...</p>
          <p className="text-xs text-muted-foreground mt-1">
            Fetching stats + DraftKings first basket odds for all players on today's rosters.
          </p>
          <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Button>
        </div>
      ) : viewMode === "h2h" ? (
        /* H2H MATCHUP VIEW */
        <div className="space-y-4">
          {matchupGroups.length === 0 ? (
            <div className="rounded-md border bg-card px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">No games found for today. Check back later.</p>
            </div>
          ) : (
            matchupGroups.map(({ game, away, home }) => (
              <MatchupH2H
                key={game.id}
                game={game}
                awayPlayers={away}
                homePlayers={home}
                showLiveOdds={hasLiveOdds}
              />
            ))
          )}
        </div>
      ) : (
        /* LIST VIEW — all players sorted by FB% */
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="divide-y divide-border/40">
            {allActivePlayers.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">No players match your filter.</p>
            ) : (
              allActivePlayers.map((stat, i) => {
                const teamRank = teamRankMap[`${stat.team}-${stat.player}`] ?? 999;
                return (
                  <PlayerCard
                    key={`${stat.team}-${stat.player}`}
                    stat={stat}
                    rank={i + 1}
                    showLiveOdds={hasLiveOdds}
                    isTopPick={i === 0}
                    isSneakyValue={checkSneakyValue(stat, teamRank)}
                  />
                );
              })
            )}
          </div>
          <div className="px-4 py-2 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground">
              {allActivePlayers.length} players shown &bull; Sorted by First Basket Probability
              {hasLiveOdds && " &bull; DraftKings live odds included"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
