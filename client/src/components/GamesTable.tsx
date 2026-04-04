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
  headshotMap?: Record<string, string>;
}

export default function GamesTable({ games, headshotMap = {} }: GamesTableProps) {
  if (games.length === 0) {
    return (
      <div className="border rounded-md bg-card flex items-center justify-center h-40 text-muted-foreground text-sm" data-testid="container-games-table">
        No games scheduled for today.
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card overflow-hidden" data-testid="container-games-table">
      <div>
        {games.map((game) => (
          <GameRow
            key={game.id}
            {...game}
            awayPlayerHeadshot={headshotMap[game.awayPlayer]}
            homePlayerHeadshot={headshotMap[game.homePlayer]}
          />
        ))}
      </div>
    </div>
  );
}
