import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PlayerStat {
  id: string;
  player: string;
  team: string;
  gamesPlayed: number;
  firstBaskets: number;
  percentage: number;
  avgTipWin: number;
}

interface PlayerStatsTableProps {
  stats: PlayerStat[];
}

export default function PlayerStatsTable({ stats }: PlayerStatsTableProps) {
  return (
    <div className="border rounded-md bg-card" data-testid="container-player-stats-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wide">Player</TableHead>
            <TableHead className="text-xs uppercase tracking-wide">Team</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">Games</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">First Baskets</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">FB %</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">Avg Tip Win</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.map((stat) => (
            <TableRow key={stat.id} className="hover-elevate" data-testid={`row-player-${stat.id}`}>
              <TableCell className="font-medium" data-testid={`text-player-name-${stat.id}`}>{stat.player}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs" data-testid={`badge-team-${stat.id}`}>{stat.team}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono" data-testid={`text-games-${stat.id}`}>{stat.gamesPlayed}</TableCell>
              <TableCell className="text-right font-mono" data-testid={`text-first-baskets-${stat.id}`}>{stat.firstBaskets}</TableCell>
              <TableCell className="text-right font-mono font-bold" data-testid={`text-percentage-${stat.id}`}>{stat.percentage}%</TableCell>
              <TableCell className="text-right font-mono" data-testid={`text-avg-tip-${stat.id}`}>{stat.avgTipWin}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
