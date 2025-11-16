import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { Settings, Save, RotateCw, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Game {
  id: string;
  awayTeam: string;
  homeTeam: string;
  gameTime: string;
  awayStarters: string[];
  homeStarters: string[];
}

interface PlayerStat {
  id: string;
  player: string;
  team: string;
  position: string;
}

export default function Admin() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editingGame, setEditingGame] = useState<string | null>(null);
  const [localLineups, setLocalLineups] = useState<Record<string, { away: string[], home: string[] }>>({});

  const { data: games, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
    enabled: !!user,
  });

  const { data: playerStats, isLoading: playersLoading } = useQuery<PlayerStat[]>({
    queryKey: ["/api/player-stats"],
    enabled: !!user,
  });

  const updateLineupMutation = useMutation({
    mutationFn: async ({ gameId, lineups }: { gameId: string; lineups: { awayStarters: string[], homeStarters: string[] } }) => {
      return apiRequest("PUT", `/api/games/${gameId}/lineups`, lineups);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today-starters"] });
      toast({
        title: "Lineups Updated",
        description: "Starting lineups have been saved successfully.",
      });
      setEditingGame(null);
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update lineups. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const todayGames = games?.filter(g => g.gameTime?.includes(new Date().toISOString().split('T')[0])) || [];

  const getPlayersByTeam = (team: string) => {
    return playerStats?.filter(p => p.team === team) || [];
  };

  const handleStartEdit = (gameId: string, game: Game) => {
    setEditingGame(gameId);
    // Initialize with current starters or empty slots, ensure arrays
    const currentAway = Array.isArray(game.awayStarters) 
      ? game.awayStarters 
      : ['', '', '', '', ''];
    const currentHome = Array.isArray(game.homeStarters) 
      ? game.homeStarters 
      : ['', '', '', '', ''];
    setLocalLineups({
      ...localLineups,
      [gameId]: {
        away: currentAway,
        home: currentHome,
      }
    });
  };

  const handlePlayerSelect = (gameId: string, team: 'away' | 'home', index: number, player: string) => {
    setLocalLineups({
      ...localLineups,
      [gameId]: {
        ...localLineups[gameId],
        [team]: [
          ...localLineups[gameId][team].slice(0, index),
          player,
          ...localLineups[gameId][team].slice(index + 1),
        ]
      }
    });
  };

  const handleSave = (gameId: string) => {
    const lineups = localLineups[gameId];
    if (!lineups || lineups.away.length !== 5 || lineups.home.length !== 5) {
      toast({
        title: "Invalid Lineups",
        description: "Each team must have exactly 5 starters selected.",
        variant: "destructive",
      });
      return;
    }

    // Validate all slots are filled
    const allStarters = [...lineups.away, ...lineups.home];
    if (allStarters.some(name => !name || name.trim() === '')) {
      toast({
        title: "Incomplete Lineups",
        description: "All 5 starter slots must be filled for both teams.",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicates within each team
    const awaySet = new Set(lineups.away);
    const homeSet = new Set(lineups.home);
    
    if (awaySet.size !== 5 || homeSet.size !== 5) {
      toast({
        title: "Duplicate Players",
        description: "Each player can only start once per team.",
        variant: "destructive",
      });
      return;
    }

    updateLineupMutation.mutate({
      gameId,
      lineups: {
        awayStarters: lineups.away,
        homeStarters: lineups.home,
      }
    });
  };

  const handleCancel = () => {
    setEditingGame(null);
  };

  const hasDuplicates = (gameId: string): boolean => {
    const lineups = localLineups[gameId];
    if (!lineups) return false;
    
    const awaySet = new Set(lineups.away.filter(name => name && name.trim() !== ''));
    const homeSet = new Set(lineups.home.filter(name => name && name.trim() !== ''));
    
    const awayFilledCount = lineups.away.filter(name => name && name.trim() !== '').length;
    const homeFilledCount = lineups.home.filter(name => name && name.trim() !== '').length;
    
    return awaySet.size !== awayFilledCount || homeSet.size !== homeFilledCount;
  };

  if (gamesLoading || playersLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Admin: Lineup Management</h1>
            <p className="text-muted-foreground">Loading games...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-admin-title">Admin: Lineup Management</h1>
          <p className="text-muted-foreground">Update starting lineups for today's games</p>
        </div>
      </div>

      {todayGames.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No games scheduled for today</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {todayGames.map((game) => {
            const isEditing = editingGame === game.id;
            const awayPlayers = getPlayersByTeam(game.awayTeam);
            const homePlayers = getPlayersByTeam(game.homeTeam);
            
            // Safely get current lineups, ensure string arrays (not null)
            const currentLineups = isEditing && localLineups[game.id] ? localLineups[game.id] : {
              away: Array.isArray(game.awayStarters) ? game.awayStarters : ['', '', '', '', ''],
              home: Array.isArray(game.homeStarters) ? game.homeStarters : ['', '', '', '', ''],
            };

            return (
              <Card key={game.id} data-testid={`card-game-${game.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {game.awayTeam} @ {game.homeTeam}
                      </CardTitle>
                      <CardDescription>
                        {new Date(game.gameTime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'America/New_York',
                        })} ET
                      </CardDescription>
                    </div>
                    {!isEditing && (
                      <Button
                        variant="outline"
                        onClick={() => handleStartEdit(game.id, game)}
                        data-testid={`button-edit-${game.id}`}
                      >
                        Edit Lineups
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary">{game.awayTeam}</Badge>
                        <span className="text-sm font-medium">Away Starters</span>
                      </div>
                      <div className="space-y-2">
                        {[0, 1, 2, 3, 4].map((index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-4">{index + 1}.</span>
                            {isEditing ? (
                              <Select
                                value={currentLineups.away[index] || ""}
                                onValueChange={(value) => handlePlayerSelect(game.id, 'away', index, value)}
                              >
                                <SelectTrigger className="flex-1" data-testid={`select-away-${index}-${game.id}`}>
                                  <SelectValue placeholder="Select player" />
                                </SelectTrigger>
                                <SelectContent>
                                  {awayPlayers.map((player) => (
                                    <SelectItem key={player.id} value={player.player}>
                                      {player.player} ({player.position})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm">{currentLineups.away[index] || '—'}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary">{game.homeTeam}</Badge>
                        <span className="text-sm font-medium">Home Starters</span>
                      </div>
                      <div className="space-y-2">
                        {[0, 1, 2, 3, 4].map((index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-4">{index + 1}.</span>
                            {isEditing ? (
                              <Select
                                value={currentLineups.home[index] || ""}
                                onValueChange={(value) => handlePlayerSelect(game.id, 'home', index, value)}
                              >
                                <SelectTrigger className="flex-1" data-testid={`select-home-${index}-${game.id}`}>
                                  <SelectValue placeholder="Select player" />
                                </SelectTrigger>
                                <SelectContent>
                                  {homePlayers.map((player) => (
                                    <SelectItem key={player.id} value={player.player}>
                                      {player.player} ({player.position})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm">{currentLineups.home[index] || '—'}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex gap-2 mt-4 pt-4 border-t">
                      <Button
                        onClick={() => handleSave(game.id)}
                        disabled={updateLineupMutation.isPending || hasDuplicates(game.id)}
                        data-testid={`button-save-${game.id}`}
                      >
                        {updateLineupMutation.isPending ? (
                          <>
                            <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Lineups
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleCancel}
                        disabled={updateLineupMutation.isPending}
                        data-testid={`button-cancel-${game.id}`}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
