import GameRow from "./GameRow";

interface Game {
  id: string;
  awayTeam: string;
  awayPlayer: string;
  awayTipCount: number;
  awayTipPercent: number;
  awayScorePercent: number;
  awayStarters?: string[];
  homeTeam: string;
  homePlayer: string;
  homeTipCount: number;
  homeTipPercent: number;
  homeScorePercent: number;
  homeStarters?: string[];
  h2h: string;
  gameTime?: string;
  status?: string;
}

interface GamesTableProps {
  games: Game[];
}

export default function GamesTable({ games }: GamesTableProps) {
  if (games.length === 0) {
    return (
      <div className="border rounded-md bg-card flex items-center justify-center h-40 text-muted-foreground text-sm" data-testid="container-games-table">
        No games scheduled for today.
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card overflow-hidden" data-testid="container-games-table">
      <div className="px-4 py-3 border-b bg-muted/50">
        <div className="grid grid-cols-12 gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="col-span-12 md:col-span-3">Matchup</div>
          <div className="col-span-12 md:col-span-3">First Basket Pick</div>
          <div className="col-span-4 md:col-span-1 text-center">Tips</div>
          <div className="col-span-4 md:col-span-2 text-center">Tip Win %</div>
          <div className="col-span-4 md:col-span-2 text-center">1st To Score</div>
          <div className="col-span-12 md:col-span-1 text-center md:text-right">H2H</div>
        </div>
      </div>
      <div>
        {games.map((game) => (
          <GameRow key={game.id} {...game} />
        ))}
      </div>
    </div>
  );
}
