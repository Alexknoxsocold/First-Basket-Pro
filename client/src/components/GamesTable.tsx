import GameRow from "./GameRow";
import type { Game } from "@shared/schema";

interface EspnPick {
  player: string;
  team: string;
  headshot?: string;
  firstBasketPct: number;
  avgPoints: number;
  odds: string;
  isStarter?: boolean;
}

interface GamesTableProps {
  games: Game[];
  headshotMap?: Record<string, string>;
  espnAwayPicks?: Record<string, EspnPick | null>;
  espnHomePicks?: Record<string, EspnPick | null>;
}

export default function GamesTable({
  games,
  headshotMap = {},
  espnAwayPicks = {},
  espnHomePicks = {},
}: GamesTableProps) {
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
        {games.map((game) => {
          const awayEspn = espnAwayPicks[game.id];
          const homeEspn = espnHomePicks[game.id];

          return (
            <GameRow
              key={game.id}
              {...game}
              awayPlayerHeadshot={awayEspn?.headshot || headshotMap[game.awayPlayer]}
              homePlayerHeadshot={homeEspn?.headshot || headshotMap[game.homePlayer]}
              awayEspnPick={awayEspn}
              homeEspnPick={homeEspn}
            />
          );
        })}
      </div>
    </div>
  );
}
