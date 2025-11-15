import { Badge } from "@/components/ui/badge";

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
}

export default function GameRow({
  awayTeam,
  awayPlayer,
  awayTipCount,
  awayTipPercent,
  awayScorePercent,
  homeTeam,
  homePlayer,
  homeTipCount,
  homeTipPercent,
  homeScorePercent,
  h2h,
}: GameRowProps) {
  const getTeamColor = (team: string) => {
    const colors: Record<string, string> = {
      MEM: "bg-blue-600",
      CLE: "bg-red-700",
      LAL: "bg-purple-600",
      MIL: "bg-green-700",
      DEN: "bg-blue-500",
      MIN: "bg-blue-600",
      OKC: "bg-blue-400",
      CHA: "bg-teal-500",
      TOR: "bg-red-600",
      IND: "bg-yellow-600",
    };
    return colors[team] || "bg-gray-600";
  };

  return (
    <div className="border-b last:border-b-0 hover-elevate" data-testid={`game-row-${awayTeam}-${homeTeam}`}>
      <div className="grid grid-cols-12 gap-2 p-4 items-center">
        <div className="col-span-12 md:col-span-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full ${getTeamColor(awayTeam)} flex items-center justify-center`}>
                <span className="text-white text-xs font-bold">{awayTeam.charAt(0)}</span>
              </div>
              <span className="font-medium text-sm" data-testid={`text-away-team-${awayTeam}`}>{awayTeam}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full ${getTeamColor(homeTeam)} flex items-center justify-center`}>
                <span className="text-white text-xs font-bold">{homeTeam.charAt(0)}</span>
              </div>
              <span className="font-medium text-sm" data-testid={`text-home-team-${homeTeam}`}>{homeTeam}</span>
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-3">
          <div className="space-y-2">
            <div className="text-sm" data-testid={`text-player-${awayPlayer.replace(/\s+/g, '-')}`}>{awayPlayer}</div>
            <div className="text-sm" data-testid={`text-player-${homePlayer.replace(/\s+/g, '-')}`}>{homePlayer}</div>
          </div>
        </div>

        <div className="col-span-4 md:col-span-2 text-center">
          <div className="space-y-2">
            <div className="font-mono text-sm" data-testid={`text-tip-count-${awayTeam}`}>{awayTipCount}</div>
            <div className="font-mono text-sm" data-testid={`text-tip-count-${homeTeam}`}>{homeTipCount}</div>
          </div>
        </div>

        <div className="col-span-4 md:col-span-2 text-center">
          <div className="space-y-2">
            <div className="font-mono text-sm font-bold" data-testid={`text-tip-percent-${awayTeam}`}>{awayTipPercent}%</div>
            <div className="font-mono text-sm font-bold" data-testid={`text-tip-percent-${homeTeam}`}>{homeTipPercent}%</div>
          </div>
        </div>

        <div className="col-span-4 md:col-span-2 text-center">
          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 rounded" style={{ width: `${awayScorePercent}%` }}></div>
              <div className="relative font-mono text-sm font-bold py-1" data-testid={`text-score-percent-${awayTeam}`}>{awayScorePercent}%</div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 rounded" style={{ width: `${homeScorePercent}%` }}></div>
              <div className="relative font-mono text-sm font-bold py-1" data-testid={`text-score-percent-${homeTeam}`}>{homeScorePercent}%</div>
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-1 flex justify-center md:justify-end">
          <Badge variant="secondary" className="text-xs" data-testid={`badge-h2h-${h2h}`}>
            {h2h}
          </Badge>
        </div>
      </div>
    </div>
  );
}
