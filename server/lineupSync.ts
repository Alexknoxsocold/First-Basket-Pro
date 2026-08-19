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

function nbaSeasonFor(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export class LineupSync {
  private storage: IStorage;
  private apiUrl = 'https://v1.basketball.api-sports.io';
  private apiKey: string | undefined;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.apiKey = process.env.APISPORTS_KEY?.trim() || undefined;
  }

  async syncStartingLineups(): Promise<void> {
    if (!this.apiKey) {
      console.warn('[LineupSync] APISPORTS_KEY not configured. Skipping optional API-Sports lineup sync.');
      console.warn('[LineupSync] To enable it, add APISPORTS_KEY to the production environment variables.');
      return;
    }

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const season = nbaSeasonFor(now);

      console.log(`[LineupSync] Fetching NBA games from API-Sports.io for ${today} (${season})...`);

      const response = await fetch(`${this.apiUrl}/games?date=${today}&league=12&season=${encodeURIComponent(season)}`, {
        headers: { 'x-apisports-key': this.apiKey },
        signal: AbortSignal.timeout(8000),
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
        if (!apiGame.lineups?.away?.startingLineups || !apiGame.lineups?.home?.startingLineups) {
          console.log(`[LineupSync] No lineups available yet for ${apiGame.teams.away.code} @ ${apiGame.teams.home.code}`);
          continue;
        }

        const awayTeam = apiGame.teams.away.code;
        const homeTeam = apiGame.teams.home.code;
        const matchingGame = todayGames.find(game => game.awayTeam === awayTeam && game.homeTeam === homeTeam);

        if (!matchingGame) {
          console.log(`[LineupSync] No matching game found in storage for ${awayTeam} @ ${homeTeam}`);
          continue;
        }

        const awayStarters = apiGame.lineups.away.startingLineups.slice(0, 5).map(player => player.name.trim());
        const homeStarters = apiGame.lineups.home.startingLineups.slice(0, 5).map(player => player.name.trim());

        if (awayStarters.length !== 5 || homeStarters.length !== 5) {
          console.log(`[LineupSync] Incomplete starting lineup for ${awayTeam} @ ${homeTeam}; keeping existing lineup.`);
          continue;
        }

        await this.storage.updateGame(matchingGame.id, { awayStarters, homeStarters });
        console.log(`[LineupSync] Updated ${awayTeam} @ ${homeTeam} starting lineups.`);

        for (const starterName of [...awayStarters, ...homeStarters]) {
          const playerStat = playerStats.find(stat => stat.player.toLowerCase() === starterName.toLowerCase());
          if (!playerStat) console.log(`[LineupSync] No local stats found for starter ${starterName}.`);
        }
      }

      console.log('[LineupSync] Starting lineup sync completed successfully');
    } catch (error) {
      console.error('[LineupSync] Error syncing starting lineups:', error);
      throw error;
    }
  }
}
