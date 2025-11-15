import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { PlayerStat } from "@shared/schema";
import fanduelLogo from "@assets/stock_images/fanduel_official_log_98a9f9e7.jpg";
import draftkingsLogo from "@assets/stock_images/draftkings_official__a889a444.jpg";
import betmgmLogo from "@assets/stock_images/betmgm_official_logo_f6868395.jpg";
import bet365Logo from "@assets/stock_images/bet365_official_logo_4393739a.jpg";
import espnbetLogo from "@assets/stock_images/espn_bet_official_lo_d6faee7d.jpg";

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

export default function PlayerStatsTable({ stats, compact = false }: PlayerStatsTableProps) {
  const colSpan = compact ? 7 : 8;
  
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
                <TableCell className="font-medium" data-testid={`text-player-name-${stat.id}`}>{stat.player}</TableCell>
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
