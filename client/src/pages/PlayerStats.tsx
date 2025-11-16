import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import PlayerStatsTable from "@/components/PlayerStatsTable";
import { Input } from "@/components/ui/input";
import { Search, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlayerStat, Game } from "@shared/schema";

export default function PlayerStats() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Use today-starters endpoint to only show starting players
  const { data: stats, isLoading: statsLoading } = useQuery<PlayerStat[]>({
    queryKey: ["/api/today-starters"],
  });

  const { data: games, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const availableDates = useMemo(() => {
    if (!games) return [];
    const uniqueDates = new Set(games.map(g => g.gameDate));
    return Array.from(uniqueDates).sort();
  }, [games]);

  const filteredGames = useMemo(() => {
    if (!games) return [];
    if (dateFilter === "all") return games;
    return games.filter(game => game.gameDate === dateFilter);
  }, [games, dateFilter]);

  const matchupsWithStats = useMemo(() => {
    if (!filteredGames || !stats) return [];

    return filteredGames.map(game => {
      // Filter to only show starting players for this game
      const awayPlayers = stats.filter(s => 
        s.team === game.awayTeam && 
        game.awayStarters?.includes(s.player)
      );
      const homePlayers = stats.filter(s => 
        s.team === game.homeTeam && 
        game.homeStarters?.includes(s.player)
      );

      // Apply search filter
      const filterBySearch = (playerStats: PlayerStat[]) => {
        if (!searchQuery) return playerStats;
        return playerStats.filter(stat =>
          stat.player.toLowerCase().includes(searchQuery.toLowerCase()) ||
          stat.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
          stat.position.toLowerCase().includes(searchQuery.toLowerCase())
        );
      };

      const filteredAwayPlayers = filterBySearch(awayPlayers).sort((a, b) => b.percentage - a.percentage);
      const filteredHomePlayers = filterBySearch(homePlayers).sort((a, b) => b.percentage - a.percentage);

      return {
        game,
        awayPlayers: filteredAwayPlayers,
        homePlayers: filteredHomePlayers,
        hasResults: filteredAwayPlayers.length > 0 || filteredHomePlayers.length > 0,
      };
    }).filter(m => m.hasResults);
  }, [filteredGames, stats, searchQuery]);

  const totalPlayers = stats?.length || 0;
  const playersWithBaskets = stats?.filter(s => s.firstBaskets > 0).length || 0;

  if (statsLoading || gamesLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Today's Starting Lineups - First Basket Stats</h2>
        <p className="text-sm text-muted-foreground">
          Starting lineups automatically update with injury data hourly. Players marked OUT show replacement starters. {playersWithBaskets} of {totalPlayers} players shown have scored a first basket this season.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          ⚠️ Always verify lineups against official sources (Underdog, sportsbooks, team news) before betting.
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-48" data-testid="select-date-filter">
              <SelectValue placeholder="All Games" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Games</SelectItem>
              {availableDates.map(date => (
                <SelectItem key={date} value={date}>{date}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dateFilter !== "all" && (
            <Badge variant="secondary" className="text-xs">
              {matchupsWithStats.length} matchups
            </Badge>
          )}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search players, teams, position..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-players"
          />
        </div>
      </div>

      {matchupsWithStats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No matchups found with your search criteria.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {matchupsWithStats.map(({ game, awayPlayers, homePlayers }) => (
            <Card key={game.id} data-testid={`matchup-${game.awayTeam}-vs-${game.homeTeam}`}>
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base font-semibold">
                    {game.awayTeam} vs {game.homeTeam}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {game.gameDate}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Away Team */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{game.awayTeam}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {awayPlayers.length} players
                      </Badge>
                    </div>
                    <PlayerStatsTable stats={awayPlayers} compact />
                  </div>

                  {/* Home Team */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{game.homeTeam}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {homePlayers.length} players
                      </Badge>
                    </div>
                    <PlayerStatsTable stats={homePlayers} compact />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
