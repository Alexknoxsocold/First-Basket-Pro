import type { IStorage } from './storage';

interface APISportsTeam {
  id: number;
  name: string;
  code: string;
}

interface APISportsPlayer {
  id: number;
  name: string;
  pos: string;
}

interface APISportsLineup {
  team: APISportsTeam;
  formation: string;
  startingLineups: APISportsPlayer[];
}

interface APISportsGame {
  id: number;
  league: {
    name: string;
  };
  teams: {
    away: APISportsTeam;
    home: APISportsTeam;
  };
  lineups?: {
    away: APISportsLineup;
    home: APISportsLineup;
  };
}

interface APISportsResponse {
  response: APISportsGame[];
}

export class LineupSync {
  private storage: IStorage;
  private apiUrl = 'https://v1.basketball.api-sports.io';
  private apiKey: string | undefined;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.apiKey = process.env.APISPORTS_KEY;
  }

  async syncStartingLineups(): Promise<void> {
    if (!this.apiKey) {
      console.warn('[LineupSync] APISPORTS_KEY not configured. Skipping lineup sync.');
      console.warn('[LineupSync] To enable automatic lineup updates, add your API-Sports.io key to Replit Secrets.');
      return;
    }

    try {
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      console.log('[LineupSync] Fetching NBA games from API-Sports.io...');
      
      const response = await fetch(`${this.apiUrl}/games?date=${today}&league=12&season=2024-2025`, {
        headers: {
          'x-apisports-key': this.apiKey
        }
      });
      
      if (!response.ok) {
        throw new Error(`API-Sports.io responded with status ${response.status}`);
      }

      const data: APISportsResponse = await response.json();
      
      if (!data.response || data.response.length === 0) {
        console.log('[LineupSync] No NBA games found for today');
        return;
      }

      console.log(`[LineupSync] Found ${data.response.length} NBA games`);

      const todayGames = await this.storage.getGamesByDate('Today');
      const playerStats = await this.storage.getPlayerStats();

      for (const apiGame of data.response) {
        if (!apiGame.lineups || !apiGame.lineups.away.startingLineups || !apiGame.lineups.home.startingLineups) {
          console.log(`[LineupSync] No lineups available yet for ${apiGame.teams.away.code} @ ${apiGame.teams.home.code}`);
          continue;
        }

        const awayTeam = apiGame.teams.away.code;
        const homeTeam = apiGame.teams.home.code;

        console.log(`[LineupSync] Processing ${awayTeam} @ ${homeTeam}`);

        const matchingGame = todayGames.find(
          g => g.awayTeam === awayTeam && g.homeTeam === homeTeam
        );

        if (!matchingGame) {
          console.log(`[LineupSync] No matching game found in storage for ${awayTeam} @ ${homeTeam}`);
          continue;
        }

        const awayStarters = apiGame.lineups.away.startingLineups
          .slice(0, 5)
          .map(p => p.name.trim());
        
        const homeStarters = apiGame.lineups.home.startingLineups
          .slice(0, 5)
          .map(p => p.name.trim());

        await this.storage.updateGame(matchingGame.id, {
          awayStarters,
          homeStarters
        });

        console.log(`[LineupSync] Updated ${awayTeam} starters:`, awayStarters);
        console.log(`[LineupSync] Updated ${homeTeam} starters:`, homeStarters);

        // Check if all starters have player stats
        const allStarters = [...awayStarters, ...homeStarters];
        for (const starterName of allStarters) {
          const playerStat = playerStats.find(ps => 
            ps.player.toLowerCase() === starterName.toLowerCase()
          );

          if (!playerStat) {
            console.log(`[LineupSync] Warning: No stats found for starter ${starterName} - may need to add to playerStats`);
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
