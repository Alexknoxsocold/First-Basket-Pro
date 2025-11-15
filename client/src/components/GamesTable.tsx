import GameRow from "./GameRow";

interface Game {
  id: string;
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

interface GamesTableProps {
  games: Game[];
}

export default function GamesTable({ games }: GamesTableProps) {
  return (
    <div className="border rounded-md bg-card" data-testid="container-games-table">
      <div className="p-4 border-b bg-muted">
        <div className="grid grid-cols-12 gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <div className="col-span-12 md:col-span-2">Away/Home</div>
          <div className="col-span-12 md:col-span-3">Projected Jumper</div>
          <div className="col-span-4 md:col-span-2 text-center">Opening Tips</div>
          <div className="col-span-4 md:col-span-2 text-center">Player Tip %</div>
          <div className="col-span-4 md:col-span-2 text-center">First Team To Score (%)</div>
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
