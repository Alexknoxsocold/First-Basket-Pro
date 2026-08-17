import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TeamStat {
  id: string;
  team: string;
  gamesPlayed: number;
  firstToScore: number;
  percentage: number;
  avgPoints: number;
}

interface TeamStatsTableProps {
  stats: TeamStat[];
}

export default function TeamStatsTable({ stats }: TeamStatsTableProps) {
  const getTeamColor = (team: string) => {
    const colors: Record<string, string> = {
      CLE: "bg-red-700",
      DEN: "bg-blue-500",
      MEM: "bg-blue-600",
      MIN: "bg-blue-600",
      MIL: "bg-green-700",
      LAL: "bg-purple-600",
      OKC: "bg-blue-400",
      CHA: "bg-teal-500",
    };
    return colors[team] || "bg-gray-600";
  };

  return (
    <div className="border rounded-md bg-card" data-testid="container-team-stats-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wide">Team</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">Games</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">First To Score</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">Score First %</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-right">Avg Opening Pts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.map((stat) => (
            <TableRow key={stat.id} className="hover-elevate" data-testid={`row-team-${stat.id}`}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full ${getTeamColor(stat.team)} flex items-center justify-center`}>
                    <span className="text-white text-xs font-bold">{stat.team.charAt(0)}</span>
                  </div>
                  <span className="font-medium" data-testid={`text-team-name-${stat.id}`}>{stat.team}</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono" data-testid={`text-games-${stat.id}`}>{stat.gamesPlayed}</TableCell>
              <TableCell className="text-right font-mono" data-testid={`text-first-score-${stat.id}`}>{stat.firstToScore}</TableCell>
              <TableCell className="text-right font-mono font-bold" data-testid={`text-percentage-${stat.id}`}>{stat.percentage}%</TableCell>
              <TableCell className="text-right font-mono" data-testid={`text-avg-points-${stat.id}`}>{stat.avgPoints}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
