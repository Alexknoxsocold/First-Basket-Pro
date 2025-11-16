import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, Activity } from "lucide-react";
import type { PlayerStat } from "@shared/schema";
import fanduelLogo from "@assets/fanduel-sportsbook-icon-filled-256_1763251312090.png";
import draftkingsLogo from "@assets/unnamed_1763251320186.png";
import betmgmLogo from "@assets/cgen-partner-icon-betmgm_1763251287741.png";
import bet365Logo from "@assets/stock_images/bet365_official_logo_4393739a.jpg";
import espnbetLogo from "@assets/6554e066511e1_1763251305883.webp";

interface PlayerStatsTableProps {
  stats: PlayerStat[];
  compact?: boolean;
}

const getPercentageColor = (percentage: number) => {
  if (percentage >= 40) return "text-green-600 dark:text-green-400";
  if (percentage >= 20) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
};

const getSportsbookLogo = (sportsbook: string | null) => {
  switch (sportsbook?.toLowerCase()) {
    case "fanduel":
      return fanduelLogo;
    case "draftkings":
      return draftkingsLogo;
    case "betmgm":
      return betmgmLogo;
    case "bet365":
      return bet365Logo;
    case "espnbet":
    case "espn bet":
      return espnbetLogo;
    default:
      return null;
  }
};

const getInjuryBadge = (status: string | null, note: string | null) => {
  if (!status) return null;

  switch (status) {
    case "OUT":
      return (
        <Badge variant="destructive" className="text-xs gap-1" data-testid="badge-injury-out">
          <AlertCircle className="h-3 w-3" />
          OUT
        </Badge>
      );
    case "QUESTIONABLE":
      return (
        <Badge variant="secondary" className="text-xs gap-1 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" data-testid="badge-injury-questionable">
          <AlertTriangle className="h-3 w-3" />
          QUESTIONABLE
        </Badge>
      );
    case "DAY-TO-DAY":
      return (
        <Badge variant="outline" className="text-xs gap-1" data-testid="badge-injury-dtd">
          <Activity className="h-3 w-3" />
          DAY-TO-DAY
        </Badge>
      );
    default:
      return null;
  }
};

export default function PlayerStatsTable({ stats, compact = false }: PlayerStatsTableProps) {
  const colSpan = compact ? 9 : 10;
  
  return (
    <div className="border rounded-md bg-card" data-testid="container-player-stats-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wide">Player</TableHead>
            {!compact && <TableHead className="text-xs uppercase tracking-wide">Team</TableHead>}
            <TableHead className="text-xs uppercase tracking-wide">Pos</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">GP</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">1st Baskets</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">FB Rate %</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">Avg Tip %</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">Q1 FGA %</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">L10 FB %</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">Odds</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                No players found
              </TableCell>
            </TableRow>
          ) : (
            stats.map((stat) => (
              <TableRow key={stat.id} className="hover-elevate" data-testid={`row-player-${stat.id}`}>
                <TableCell className="font-medium" data-testid={`text-player-name-${stat.id}`}>
                  <div className="flex items-center gap-2">
                    <span>{stat.player}</span>
                    {getInjuryBadge(stat.injuryStatus ?? null, stat.injuryNote ?? null)}
                  </div>
                </TableCell>
                {!compact && (
                  <TableCell>
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-team-${stat.id}`}>{stat.team}</Badge>
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant="outline" className="text-xs">{stat.position}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono" data-testid={`text-games-${stat.id}`}>{stat.gamesPlayed}</TableCell>
                <TableCell className="text-right font-mono font-bold" data-testid={`text-first-baskets-${stat.id}`}>{stat.firstBaskets}</TableCell>
                <TableCell className={`text-right font-mono font-bold ${getPercentageColor(stat.percentage)}`} data-testid={`text-percentage-${stat.id}`}>{stat.percentage.toFixed(1)}%</TableCell>
                <TableCell className={`text-right font-mono ${getPercentageColor(stat.avgTipWin)}`} data-testid={`text-avg-tip-${stat.id}`}>{stat.avgTipWin}%</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground" data-testid={`text-q1-fga-${stat.id}`}>
                  {stat.q1FgaRate ? `${stat.q1FgaRate.toFixed(1)}%` : '-'}
                </TableCell>
                <TableCell className={`text-right font-mono ${stat.last10GamesPercent ? getPercentageColor(stat.last10GamesPercent) : ''}`} data-testid={`text-l10-${stat.id}`}>
                  {stat.last10GamesPercent !== null && stat.last10GamesPercent !== undefined ? `${stat.last10GamesPercent.toFixed(1)}%` : '-'}
                </TableCell>
                <TableCell className="text-right" data-testid={`text-odds-${stat.id}`}>
                  {stat.odds && stat.sportsbook ? (
                    <div className="flex items-center justify-end gap-2">
                      <img 
                        src={getSportsbookLogo(stat.sportsbook) || ''} 
                        alt={stat.sportsbook}
                        className="h-5 w-auto object-contain rounded"
                      />
                      <span className="font-mono text-muted-foreground">{stat.odds}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
