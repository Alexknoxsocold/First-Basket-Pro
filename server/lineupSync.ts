import type { IStorage } from './storage';

interface LineupsAPIPlayer {
  name: string;
  position: string;
  team?: string;
  injury_status?: string;
}

interface LineupsAPIGame {
  home_route: string;
  away_route: string;
  home_players: LineupsAPIPlayer[];
  away_players: LineupsAPIPlayer[];
  home_team?: string;
  away_team?: string;
}

interface LineupsAPIResponse {
  data: LineupsAPIGame[];
}

const NBA_TEAM_MAPPING: Record<string, string> = {
  'cavaliers': 'CLE',
  'lakers': 'LAL',
  'thunder': 'OKC',
  'raptors': 'TOR',
  'pacers': 'IND',
  'bucks': 'MIL',
  'timberwolves': 'MIN',
  'nuggets': 'DEN',
  'grizzlies': 'MEM',
  'hornets': 'CHA',
  'celtics': 'BOS',
  'warriors': 'GSW',
  'heat': 'MIA',
  'suns': 'PHX',
  'mavericks': 'DAL',
  'clippers': 'LAC',
  'kings': 'SAC',
  '76ers': 'PHI',
  'sixers': 'PHI',
  'knicks': 'NYK',
  'nets': 'BKN',
  'bulls': 'CHI',
  'hawks': 'ATL',
  'wizards': 'WAS',
  'magic': 'ORL',
  'pistons': 'DET',
  'rockets': 'HOU',
  'spurs': 'SAS',
  'jazz': 'UTA',
  'pelicans': 'NOP',
  'blazers': 'POR',
  'trail-blazers': 'POR',
};

export class LineupSync {
  private storage: IStorage;
  private apiUrl = 'https://api.lineups.com/nba/fetch/lineups/gateway';

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  private teamRouteToAbbrev(route: string): string {
    const normalized = route.toLowerCase().trim();
    return NBA_TEAM_MAPPING[normalized] || route.toUpperCase().slice(0, 3);
  }

  async syncStartingLineups(): Promise<void> {
    try {
      console.log('[LineupSync] Fetching starting lineups from lineups.com API...');
      
      const response = await fetch(this.apiUrl);
      
      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      const data: LineupsAPIResponse = await response.json();
      
      if (!data.data || data.data.length === 0) {
        console.log('[LineupSync] No games found in API response');
        return;
      }

      console.log(`[LineupSync] Found ${data.data.length} games with lineups`);

      const todayGames = await this.storage.getGamesByDate('Today');
      const playerStats = await this.storage.getPlayerStats();

      for (const apiGame of data.data) {
        const awayTeam = this.teamRouteToAbbrev(apiGame.away_route);
        const homeTeam = this.teamRouteToAbbrev(apiGame.home_route);

        console.log(`[LineupSync] Processing ${awayTeam} @ ${homeTeam}`);

        const matchingGame = todayGames.find(
          g => g.awayTeam === awayTeam && g.homeTeam === homeTeam
        );

        if (!matchingGame) {
          console.log(`[LineupSync] No matching game found for ${awayTeam} @ ${homeTeam}`);
          continue;
        }

        const awayStarters = apiGame.away_players
          .slice(0, 5)
          .map(p => p.name.trim());
        
        const homeStarters = apiGame.home_players
          .slice(0, 5)
          .map(p => p.name.trim());

        await this.storage.updateGame(matchingGame.id, {
          awayStarters,
          homeStarters
        });

        console.log(`[LineupSync] Updated ${awayTeam} starters:`, awayStarters);
        console.log(`[LineupSync] Updated ${homeTeam} starters:`, homeStarters);

        const allStarters = [...awayStarters, ...homeStarters];
        for (const starterName of allStarters) {
          const playerStat = playerStats.find(ps => 
            ps.player.toLowerCase() === starterName.toLowerCase()
          );

          if (!playerStat) {
            console.log(`[LineupSync] Warning: No stats found for starter ${starterName}`);
          }
        }
      }

      console.log('[LineupSync] Starting lineup sync completed successfully');
    } catch (error) {
      console.error('[LineupSync] Error syncing starting lineups:', error);
      throw error;
    }
  }
}
