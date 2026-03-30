import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

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
}

const TEAM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ATL: { bg: "bg-red-600", text: "text-white", border: "border-red-500" },
  BOS: { bg: "bg-green-700", text: "text-white", border: "border-green-600" },
  BKN: { bg: "bg-gray-900", text: "text-white", border: "border-gray-700" },
  CHA: { bg: "bg-teal-600", text: "text-white", border: "border-teal-500" },
  CHI: { bg: "bg-red-700", text: "text-white", border: "border-red-600" },
  CLE: { bg: "bg-red-800", text: "text-white", border: "border-red-700" },
  DAL: { bg: "bg-blue-700", text: "text-white", border: "border-blue-600" },
  DEN: { bg: "bg-blue-800", text: "text-yellow-400", border: "border-blue-700" },
  DET: { bg: "bg-blue-600", text: "text-white", border: "border-blue-500" },
  GS: { bg: "bg-yellow-500", text: "text-blue-900", border: "border-yellow-400" },
  HOU: { bg: "bg-red-600", text: "text-white", border: "border-red-500" },
  IND: { bg: "bg-yellow-600", text: "text-blue-900", border: "border-yellow-500" },
  LAC: { bg: "bg-blue-700", text: "text-white", border: "border-blue-600" },
  LAL: { bg: "bg-purple-700", text: "text-yellow-400", border: "border-purple-600" },
  MEM: { bg: "bg-blue-800", text: "text-yellow-400", border: "border-blue-700" },
  MIA: { bg: "bg-red-700", text: "text-white", border: "border-red-600" },
  MIL: { bg: "bg-green-800", text: "text-white", border: "border-green-700" },
  MIN: { bg: "bg-blue-900", text: "text-green-400", border: "border-blue-800" },
  NO: { bg: "bg-blue-900", text: "text-yellow-400", border: "border-blue-800" },
  NYK: { bg: "bg-orange-600", text: "text-white", border: "border-orange-500" },
  OKC: { bg: "bg-blue-500", text: "text-white", border: "border-blue-400" },
  ORL: { bg: "bg-blue-600", text: "text-white", border: "border-blue-500" },
  PHI: { bg: "bg-blue-600", text: "text-white", border: "border-blue-500" },
  PHX: { bg: "bg-purple-700", text: "text-orange-400", border: "border-purple-600" },
  POR: { bg: "bg-red-700", text: "text-white", border: "border-red-600" },
  SAC: { bg: "bg-purple-600", text: "text-white", border: "border-purple-500" },
  SA: { bg: "bg-gray-700", text: "text-white", border: "border-gray-600" },
  TOR: { bg: "bg-red-600", text: "text-white", border: "border-red-500" },
  UTAH: { bg: "bg-blue-900", text: "text-yellow-400", border: "border-blue-800" },
  WSH: { bg: "bg-blue-900", text: "text-red-400", border: "border-blue-800" },
};

function TeamBadge({ team }: { team: string }) {
  const colors = TEAM_COLORS[team] || { bg: "bg-gray-600", text: "text-white", border: "border-gray-500" };
  return (
    <div className={`w-8 h-8 rounded-md ${colors.bg} flex items-center justify-center shrink-0`}>
      <span className={`text-xs font-bold ${colors.text}`}>{team.length > 3 ? team.slice(0, 3) : team}</span>
    </div>
  );
}

function ScoreBar({ percent, isFavorite }: { percent: number; isFavorite: boolean }) {
  return (
    <div className="relative w-full h-6 rounded overflow-hidden bg-muted">
      <div
        className={`absolute inset-y-0 left-0 rounded transition-all ${isFavorite ? "bg-primary/30" : "bg-muted-foreground/10"}`}
        style={{ width: `${percent}%` }}
      />
      <div className={`relative flex items-center justify-end pr-2 h-full font-mono text-xs font-bold ${isFavorite ? "text-primary" : "text-muted-foreground"}`}>
        {percent}%
      </div>
    </div>
  );
}

export default function GameRow({
  awayTeam, awayPlayer, awayTipCount, awayTipPercent, awayScorePercent,
  homeTeam, homePlayer, homeTipCount, homeTipPercent, homeScorePercent,
  h2h, gameTime, status, awayStarters, homeStarters,
}: GameRowProps) {
  const topPick = awayScorePercent > homeScorePercent ? awayTeam : homeTeam;
  const topPickPercent = Math.max(awayScorePercent, homeScorePercent);
  const isFeatured = topPickPercent >= 60;

  return (
    <div
      className={`border-b last:border-b-0 hover-elevate transition-colors ${isFeatured ? "bg-primary/5" : ""}`}
      data-testid={`game-row-${awayTeam}-${homeTeam}`}
    >
      <div className="grid grid-cols-12 gap-3 p-4 items-center">

        {/* Teams + Time */}
        <div className="col-span-12 md:col-span-3">
          <div className="flex flex-col gap-2">
            {gameTime && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground font-mono">{gameTime}</span>
                {isFeatured && (
                  <Badge className="text-xs px-1.5 py-0 h-4 bg-primary/20 text-primary border-primary/30 gap-1">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    TOP PICK
                  </Badge>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <TeamBadge team={awayTeam} />
              <div>
                <div className="font-semibold text-sm leading-tight" data-testid={`text-away-team-${awayTeam}`}>{awayTeam}</div>
                <div className="text-xs text-muted-foreground">Away</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TeamBadge team={homeTeam} />
              <div>
                <div className="font-semibold text-sm leading-tight" data-testid={`text-home-team-${homeTeam}`}>{homeTeam}</div>
                <div className="text-xs text-muted-foreground">Home</div>
              </div>
            </div>
          </div>
        </div>

        {/* Projected Jumper */}
        <div className="col-span-12 md:col-span-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col">
              <div className="text-sm font-medium" data-testid={`text-player-${awayPlayer.replace(/\s+/g, '-')}`}>{awayPlayer}</div>
              {awayStarters && awayStarters.length > 0 && (
                <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                  {awayStarters.slice(0, 3).join(", ")}
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <div className="text-sm font-medium" data-testid={`text-player-${homePlayer.replace(/\s+/g, '-')}`}>{homePlayer}</div>
              {homeStarters && homeStarters.length > 0 && (
                <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                  {homeStarters.slice(0, 3).join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Opening Tips Count */}
        <div className="col-span-4 md:col-span-1 text-center">
          <div className="flex flex-col gap-2">
            <div className="font-mono text-sm font-semibold" data-testid={`text-tip-count-${awayTeam}`}>{awayTipCount}</div>
            <div className="font-mono text-sm font-semibold" data-testid={`text-tip-count-${homeTeam}`}>{homeTipCount}</div>
          </div>
        </div>

        {/* Tip % */}
        <div className="col-span-4 md:col-span-2 text-center">
          <div className="flex flex-col gap-2">
            <div className={`font-mono text-sm font-bold ${awayTipPercent > homeTipPercent ? "text-primary" : "text-muted-foreground"}`} data-testid={`text-tip-percent-${awayTeam}`}>
              {awayTipPercent}%
            </div>
            <div className={`font-mono text-sm font-bold ${homeTipPercent > awayTipPercent ? "text-primary" : "text-muted-foreground"}`} data-testid={`text-tip-percent-${homeTeam}`}>
              {homeTipPercent}%
            </div>
          </div>
        </div>

        {/* First To Score bars */}
        <div className="col-span-4 md:col-span-2">
          <div className="flex flex-col gap-2">
            <ScoreBar percent={awayScorePercent} isFavorite={awayScorePercent > homeScorePercent} />
            <ScoreBar percent={homeScorePercent} isFavorite={homeScorePercent > awayScorePercent} />
          </div>
        </div>

        {/* H2H */}
        <div className="col-span-12 md:col-span-1 flex justify-center md:justify-end">
          <Badge variant="secondary" className="text-xs whitespace-nowrap" data-testid={`badge-h2h-${h2h}`}>
            {h2h}
          </Badge>
        </div>
      </div>
    </div>
  );
}
