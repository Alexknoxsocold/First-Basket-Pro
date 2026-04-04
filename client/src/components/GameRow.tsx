import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, Clock, Zap } from "lucide-react";

interface GameRowProps {
  awayTeam: string;
  awayPlayer: string;
  awayTipCount: number;
  awayTipPercent: number;
  awayScorePercent: number;
  homeTeam: string;
  homePlayer: string;
  homeTipCount: number;
  homeTipPercent: number;
  homeScorePercent: number;
  h2h: string;
  gameTime?: string;
  status?: string;
  awayStarters?: string[];
  homeStarters?: string[];
  awayPlayerHeadshot?: string;
  homePlayerHeadshot?: string;
}

const TEAM_COLORS: Record<string, { bg: string; text: string }> = {
  ATL: { bg: "bg-red-600", text: "text-white" },
  BOS: { bg: "bg-green-700", text: "text-white" },
  BKN: { bg: "bg-gray-900", text: "text-white" },
  CHA: { bg: "bg-teal-600", text: "text-white" },
  CHI: { bg: "bg-red-700", text: "text-white" },
  CLE: { bg: "bg-red-800", text: "text-white" },
  DAL: { bg: "bg-blue-700", text: "text-white" },
  DEN: { bg: "bg-blue-800", text: "text-yellow-400" },
  DET: { bg: "bg-blue-600", text: "text-white" },
  GS: { bg: "bg-yellow-500", text: "text-blue-900" },
  HOU: { bg: "bg-red-600", text: "text-white" },
  IND: { bg: "bg-yellow-600", text: "text-blue-900" },
  LAC: { bg: "bg-blue-700", text: "text-white" },
  LAL: { bg: "bg-purple-700", text: "text-yellow-400" },
  MEM: { bg: "bg-blue-800", text: "text-yellow-400" },
  MIA: { bg: "bg-red-700", text: "text-white" },
  MIL: { bg: "bg-green-800", text: "text-white" },
  MIN: { bg: "bg-blue-900", text: "text-green-400" },
  NO: { bg: "bg-blue-900", text: "text-yellow-400" },
  NYK: { bg: "bg-orange-600", text: "text-white" },
  OKC: { bg: "bg-blue-500", text: "text-white" },
  ORL: { bg: "bg-blue-600", text: "text-white" },
  PHI: { bg: "bg-blue-600", text: "text-white" },
  PHX: { bg: "bg-purple-700", text: "text-orange-400" },
  POR: { bg: "bg-red-700", text: "text-white" },
  SAC: { bg: "bg-purple-600", text: "text-white" },
  SA: { bg: "bg-gray-700", text: "text-white" },
  TOR: { bg: "bg-red-600", text: "text-white" },
  UTAH: { bg: "bg-blue-900", text: "text-yellow-400" },
  WSH: { bg: "bg-blue-900", text: "text-red-400" },
};

function TeamBadge({ team }: { team: string }) {
  const colors = TEAM_COLORS[team] || { bg: "bg-gray-600", text: "text-white" };
  return (
    <div className={`w-9 h-9 rounded-md ${colors.bg} flex items-center justify-center shrink-0`}>
      <span className={`text-xs font-bold tracking-tight ${colors.text}`}>{team.length > 3 ? team.slice(0, 3) : team}</span>
    </div>
  );
}

function ScoreBar({ percent, isFavorite, isTie }: { percent: number; isFavorite: boolean; isTie: boolean }) {
  const barColor = isTie
    ? "bg-muted-foreground/30"
    : isFavorite
      ? percent >= 65 ? "bg-green-500" : percent >= 55 ? "bg-primary" : "bg-primary/60"
      : "bg-muted-foreground/15";
  const textColor = isTie
    ? "text-muted-foreground"
    : isFavorite ? "text-foreground" : "text-muted-foreground";
  return (
    <div className="relative w-full h-7 rounded-md overflow-hidden bg-muted">
      <div
        className={`absolute inset-y-0 left-0 transition-all ${barColor}`}
        style={{ width: `${percent}%` }}
      />
      <div className="relative flex items-center h-full px-2 justify-between">
        <span className={`font-mono text-xs font-bold ${textColor}`}>
          {percent}%
        </span>
        {!isTie && isFavorite && percent >= 55 && (
          <Zap className="w-3 h-3 text-foreground opacity-60" />
        )}
      </div>
    </div>
  );
}

function PlayerPick({
  player,
  team,
  headshot,
  starters,
  tipPercent,
  isTopTip,
}: {
  player: string;
  team: string;
  headshot?: string;
  starters?: string[];
  tipPercent: number;
  isTopTip: boolean;
}) {
  const initials = player.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar className="w-9 h-9 shrink-0 ring-2 ring-border">
        <AvatarImage src={headshot} alt={player} className="object-cover object-top" />
        <AvatarFallback className="text-xs font-bold bg-muted">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs font-semibold truncate ${isTopTip ? "text-foreground" : "text-muted-foreground"}`} data-testid={`text-player-${player.replace(/\s+/g, '-')}`}>
            {player}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {team} &bull; Tip {tipPercent}%
        </div>
        {starters && starters.length > 0 && (
          <div className="text-[10px] text-muted-foreground/60 truncate max-w-[150px] hidden md:block">
            {starters.slice(0, 2).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GameRow({
  awayTeam, awayPlayer, awayTipCount, awayTipPercent, awayScorePercent,
  homeTeam, homePlayer, homeTipCount, homeTipPercent, homeScorePercent,
  h2h, gameTime, status, awayStarters, homeStarters,
  awayPlayerHeadshot, homePlayerHeadshot,
}: GameRowProps) {
  const topPickPercent = Math.max(awayScorePercent, homeScorePercent);
  const isFeatured = topPickPercent >= 60;
  const isTie = awayScorePercent === homeScorePercent;
  const awayIsTop = awayScorePercent > homeScorePercent;

  const formatGameTime = (time?: string) => {
    if (!time) return null;
    try {
      const d = new Date(time);
      if (isNaN(d.getTime())) return time;
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
    } catch {
      return time;
    }
  };

  return (
    <div
      className={`border-b last:border-b-0 hover-elevate transition-colors ${isFeatured ? "bg-primary/5" : ""}`}
      data-testid={`game-row-${awayTeam}-${homeTeam}`}
    >
      <div className="p-4">
        {/* Top row: time + badge */}
        {(gameTime || isFeatured) && (
          <div className="flex items-center gap-2 mb-3">
            {gameTime && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="font-mono">{formatGameTime(gameTime)}</span>
              </div>
            )}
            {isFeatured && (
              <Badge className="text-[10px] px-1.5 h-4 bg-primary/20 text-primary border-primary/30 gap-1 ml-auto">
                <Star className="w-2.5 h-2.5 fill-current" />
                TOP PICK
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] whitespace-nowrap ml-auto" data-testid={`badge-h2h-${h2h}`}>
              H2H {h2h}
            </Badge>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_1fr] gap-4 items-center">

          {/* Teams column */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <TeamBadge team={awayTeam} />
              <div>
                <div className="font-semibold text-sm leading-tight" data-testid={`text-away-team-${awayTeam}`}>{awayTeam}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Away &bull; {awayTipCount} tips</div>
              </div>
              <div className={`ml-auto font-mono text-sm font-bold ${awayTipPercent > homeTipPercent ? "text-primary" : "text-muted-foreground"}`} data-testid={`text-tip-percent-${awayTeam}`}>
                {awayTipPercent}%
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TeamBadge team={homeTeam} />
              <div>
                <div className="font-semibold text-sm leading-tight" data-testid={`text-home-team-${homeTeam}`}>{homeTeam}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Home &bull; {homeTipCount} tips</div>
              </div>
              <div className={`ml-auto font-mono text-sm font-bold ${homeTipPercent > awayTipPercent ? "text-primary" : "text-muted-foreground"}`} data-testid={`text-tip-percent-${homeTeam}`}>
                {homeTipPercent}%
              </div>
            </div>
          </div>

          {/* First basket picks column */}
          <div className="flex flex-col gap-2.5 border rounded-md p-2.5 bg-background/50">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold mb-0.5">First Basket Pick</div>
            <PlayerPick
              player={awayPlayer}
              team={awayTeam}
              headshot={awayPlayerHeadshot}
              starters={awayStarters}
              tipPercent={awayTipPercent}
              isTopTip={awayIsTop}
            />
            <div className="border-t border-dashed" />
            <PlayerPick
              player={homePlayer}
              team={homeTeam}
              headshot={homePlayerHeadshot}
              starters={homeStarters}
              tipPercent={homeTipPercent}
              isTopTip={!awayIsTop}
            />
          </div>

          {/* Score bars column */}
          <div className="flex flex-col gap-2">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">1st to Score</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-8 shrink-0">{awayTeam}</span>
                <div className="flex-1">
                  <ScoreBar percent={awayScorePercent} isFavorite={awayIsTop} isTie={isTie} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-8 shrink-0">{homeTeam}</span>
                <div className="flex-1">
                  <ScoreBar percent={homeScorePercent} isFavorite={!awayIsTop} isTie={isTie} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
