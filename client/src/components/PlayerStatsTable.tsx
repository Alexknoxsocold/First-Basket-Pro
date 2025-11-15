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

interface PlayerStatsTableProps {
  stats: PlayerStat[];
  compact?: boolean;
}

export default function PlayerStatsTable({ stats, compact = false }: PlayerStatsTableProps) {
  const colSpan = compact ? 6 : 7;
  
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
                <TableCell className="text-right font-mono font-bold" data-testid={`text-percentage-${stat.id}`}>{stat.percentage.toFixed(1)}%</TableCell>
                <TableCell className="text-right font-mono" data-testid={`text-avg-tip-${stat.id}`}>{stat.avgTipWin}%</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
