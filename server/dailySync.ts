import type { IStorage } from './storage';
import { InjurySync } from './injurySync';
import { LineupSync } from './lineupSync';

interface ESPNCompetitor {
  id: string;
  team: {
    abbreviation: string;
    displayName: string;
  };
  score: string;
  homeAway: 'home' | 'away';
  winner?: boolean;
}

interface ESPNEvent {
  id: string;
  date: string;
  status: {
    type: {
      name: string;
      state: string;
      completed: boolean;
    };
  };
  competitions: Array<{
    id: string;
    competitors: ESPNCompetitor[];
  }>;
}

interface ESPNScoreboardResponse {
  events: ESPNEvent[];
}

export class DailySyncService {
  private storage: IStorage;
  private baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Main orchestration method - runs all daily sync operations
   */
  async runDailySync(): Promise<void> {
    console.log('[DailySync] Starting daily sync process...');
    const results = {
      cleanupOldGames: false,
      injuries: false,
      lineups: false,
      todayGames: false,
      completedGames: false,
      upcomingGames: false
    };
    
    // Step 0: Clean up yesterday's games (update "Today" to actual dates)
    try {
      console.log('[DailySync] Step 0: Cleaning up yesterday\'s games...');
      await this.cleanupYesterdayGames();
      results.cleanupOldGames = true;
    } catch (error) {
      console.error('[DailySync] Step 0 failed (cleanup), continuing:', error);
    }

    // Step 1: Sync injuries (resilient to failures)
    try {
      console.log('[DailySync] Step 1: Syncing injury data...');
      const injurySync = new InjurySync(this.storage);
      await injurySync.syncInjuries();
      results.injuries = true;
    } catch (error) {
      console.error('[DailySync] Step 1 failed (injuries), continuing:', error);
    }

    // Step 1.5: Sync starting lineups from API-Sports (resilient to failures)
    try {
      console.log('[DailySync] Step 1.5: Syncing starting lineups...');
      const lineupSync = new LineupSync(this.storage);
      await lineupSync.syncStartingLineups();
      results.lineups = true;
    } catch (error) {
      console.error('[DailySync] Step 1.5 failed (lineups), continuing:', error);
    }

    // Step 2: Fetch today's games from ESPN
    let scoreboard: ESPNScoreboardResponse | null = null;
    try {
      console.log('[DailySync] Step 2: Fetching today\'s ESPN scoreboard...');
      const today = new Date();
      scoreboard = await this.fetchScoreboard(today);
      results.todayGames = true;
    } catch (error) {
      console.error('[DailySync] Step 2 failed (scoreboard fetch), continuing:', error);
    }

    // Step 3: Process completed games (only if scoreboard fetched)
    if (scoreboard) {
      try {
        console.log('[DailySync] Step 3: Processing completed games...');
        await this.processCompletedGames(scoreboard.events);
        results.completedGames = true;
      } catch (error) {
        console.error('[DailySync] Step 3 failed (completed games), continuing:', error);
      }

      // Step 3.5: Process today's upcoming games (from the same scoreboard)
      try {
        console.log('[DailySync] Step 3.5: Processing today\'s upcoming games...');
        await this.updateUpcomingGames(scoreboard.events);
      } catch (error) {
        console.error('[DailySync] Step 3.5 failed (today\'s upcoming games), continuing:', error);
      }
    }

    // Step 4: Fetch upcoming games for tomorrow
    try {
      console.log('[DailySync] Step 4: Updating tomorrow\'s games...');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const upcomingScoreboard = await this.fetchScoreboard(tomorrow);
      await this.updateUpcomingGames(upcomingScoreboard.events);
      results.upcomingGames = true;
    } catch (error) {
      console.error('[DailySync] Step 4 failed (tomorrow\'s games), continuing:', error);
    }

    // Log final results
    const successCount = Object.values(results).filter(Boolean).length;
    const totalSteps = Object.keys(results).length;
    
    if (successCount === totalSteps) {
      console.log(`[DailySync] ✓ Daily sync completed successfully (${successCount}/${totalSteps} steps)`);
    } else {
      console.log(`[DailySync] ⚠ Daily sync completed with warnings (${successCount}/${totalSteps} steps succeeded)`);
      console.log('[DailySync] Results:', results);
    }
  }

  /**
   * Clean up old games - delete games from previous dates and keep only today's games
   */
  private async cleanupYesterdayGames(): Promise<void> {
    const allGames = await this.storage.getGames();
    const today = new Date();
    const todayDateOnly = today.toISOString().split('T')[0];
    
    let deletedCount = 0;
    
    for (const game of allGames) {
      try {
        let shouldDelete = false;
        
        // Case 1: Game has ISO date that's before today
        if (game.gameDate !== 'Today' && game.gameDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          shouldDelete = game.gameDate < todayDateOnly;
        }
        // Case 2: Game is marked "Today" but has a gameTime from a previous date
        else if (game.gameDate === 'Today' && game.gameTime) {
          const gameDateTime = new Date(game.gameTime);
          const gameDateOnly = gameDateTime.toISOString().split('T')[0];
          shouldDelete = gameDateOnly < todayDateOnly;
        }
        // Case 3: Game is marked "Today" but has no gameTime (stale data)
        else if (game.gameDate === 'Today' && !game.gameTime) {
          // Keep it - it might be valid seed data
          shouldDelete = false;
        }
        // Case 4: Game has non-ISO, non-"Today" date (legacy format)
        else if (game.gameDate !== 'Today' && !game.gameDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Delete non-standard dates that aren't "Today"
          shouldDelete = true;
        }
        
        if (shouldDelete) {
          await this.storage.deleteGame(game.id);
          deletedCount++;
          console.log(`[DailySync] Deleted old game: ${game.awayTeam} @ ${game.homeTeam} (${game.gameDate})`);
        }
      } catch (error) {
        console.error(`[DailySync] Error deleting old game ${game.awayTeam} @ ${game.homeTeam}:`, error);
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[DailySync] Deleted ${deletedCount} old game(s)`);
    } else {
      console.log('[DailySync] No old games to delete');
    }
  }

  /**
   * Fetch scoreboard data from ESPN API
   */
  private async fetchScoreboard(date?: Date): Promise<ESPNScoreboardResponse> {
    try {
      let url = this.baseUrl;
      
      // Add date parameter if provided (format: YYYYMMDD)
      if (date) {
        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
        url += `?dates=${dateStr}`;
      }

      console.log(`[DailySync] Fetching scoreboard from: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`ESPN API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as ESPNScoreboardResponse;
      console.log(`[DailySync] Fetched ${data.events?.length || 0} games from ESPN`);
      
      return data;
    } catch (error) {
      console.error('[DailySync] Failed to fetch ESPN scoreboard:', error);
      throw error;
    }
  }

  /**
   * Process completed games and update stats
   */
  private async processCompletedGames(events: ESPNEvent[]): Promise<void> {
    const completedGames = events.filter(event => event.status.type.completed);
    
    console.log(`[DailySync] Found ${completedGames.length} completed games`);

    for (const event of completedGames) {
      try {
        await this.processCompletedGame(event);
      } catch (error) {
        console.error(`[DailySync] Error processing game ${event.id}:`, error);
        // Continue processing other games even if one fails
      }
    }
  }

  /**
   * Process a single completed game
   */
  private async processCompletedGame(event: ESPNEvent): Promise<void> {
    const competition = event.competitions[0];
    if (!competition?.competitors || competition.competitors.length < 2) {
      console.warn(`[DailySync] Invalid competition data for event ${event.id}`);
      return;
    }

    const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

    if (!homeTeam || !awayTeam) {
      console.warn(`[DailySync] Missing home/away team for event ${event.id}`);
      return;
    }

    console.log(`[DailySync] Processing: ${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation}`);
    
    // Find matching game in storage by ESPN ID first, then fall back to team matchup + date
    const allGames = await this.storage.getGames();
    let matchingGame = allGames.find(game => game.espnGameId === event.id);
    
    // If no ESPN ID match, try team matchup + date (for games created before ESPN ID was added)
    if (!matchingGame) {
      const eventDateOnly = new Date(event.date).toISOString().split('T')[0];
      matchingGame = allGames.find(game => {
        if (game.awayTeam !== awayTeam.team.abbreviation || game.homeTeam !== homeTeam.team.abbreviation) {
          return false;
        }
        // Match by date if available
        if (game.gameTime) {
          const gameDateOnly = new Date(game.gameTime).toISOString().split('T')[0];
          return gameDateOnly === eventDateOnly;
        }
        // Fallback: match if gameDate is "Today" or matches the event date
        return game.gameDate === 'Today' || game.gameDate === eventDateOnly;
      });
    }

    if (matchingGame) {
      // Update game with completion status and final scores
      await this.storage.updateGame(matchingGame.id, {
        status: 'completed',
        awayScore: parseInt(awayTeam.score) || 0,
        homeScore: parseInt(homeTeam.score) || 0,
        espnGameId: event.id,
        lastSynced: new Date().toISOString()
      });
      
      console.log(`[DailySync] ✓ Updated game: ${awayTeam.team.displayName} ${awayTeam.score} @ ${homeTeam.team.displayName} ${homeTeam.score}`);
      
      // TODO: In a full implementation, we would also:
      // 1. Fetch play-by-play data to determine first basket scorer and opening tip winner
      // 2. Recalculate player stats (firstBaskets, percentage) based on actual game data
      // 3. Recalculate team stats (firstToScore, percentage) based on actual game data
    } else {
      console.log(`[DailySync] No matching game found in storage for ${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation}`);
    }
  }

  /**
   * Update upcoming games for tomorrow
   */
  private async updateUpcomingGames(events: ESPNEvent[]): Promise<void> {
    const upcomingGames = events.filter(event => !event.status.type.completed);
    
    console.log(`[DailySync] Found ${upcomingGames.length} upcoming games`);

    for (const event of upcomingGames) {
      try {
        await this.updateUpcomingGame(event);
      } catch (error) {
        console.error(`[DailySync] Error updating upcoming game ${event.id}:`, error);
      }
    }
  }

  /**
   * Update a single upcoming game
   */
  private async updateUpcomingGame(event: ESPNEvent): Promise<void> {
    const competition = event.competitions[0];
    if (!competition?.competitors || competition.competitors.length < 2) {
      return;
    }

    const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

    if (!homeTeam || !awayTeam) {
      return;
    }

    console.log(`[DailySync] Upcoming: ${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation} (${new Date(event.date).toLocaleString()})`);

    // Find matching game in storage by ESPN ID first, then fall back to team matchup + date + status
    const allGames = await this.storage.getGames();
    let matchingGame = allGames.find(game => game.espnGameId === event.id);
    
    // If no ESPN ID match, try team matchup + date + status (for games created before ESPN ID was added)
    if (!matchingGame) {
      const eventDateOnly = new Date(event.date).toISOString().split('T')[0];
      matchingGame = allGames.find(game => {
        if (game.awayTeam !== awayTeam.team.abbreviation || 
            game.homeTeam !== homeTeam.team.abbreviation || 
            game.status !== 'scheduled') {
          return false;
        }
        // Match by date if available
        if (game.gameTime) {
          const gameDateOnly = new Date(game.gameTime).toISOString().split('T')[0];
          return gameDateOnly === eventDateOnly;
        }
        // Fallback: match if gameDate is "Today" or matches the event date
        return game.gameDate === 'Today' || game.gameDate === eventDateOnly;
      });
    }

    if (matchingGame) {
      // Update existing game with ESPN ID and sync timestamp (backfill ESPN ID if missing)
      await this.storage.updateGame(matchingGame.id, {
        espnGameId: event.id,
        lastSynced: new Date().toISOString()
      });
      const action = matchingGame.espnGameId ? 'Updated' : 'Backfilled ESPN ID for';
      console.log(`[DailySync] ✓ ${action} upcoming game: ${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation} (${event.id})`);
    } else {
      // Create new game with default values (lineup and tip data will be updated later)
      const gameDateTime = new Date(event.date);
      const today = new Date();
      
      // Use ISO date format (YYYY-MM-DD) for consistency
      const gameDateOnly = gameDateTime.toISOString().split('T')[0];
      const todayDateOnly = today.toISOString().split('T')[0];
      const isToday = gameDateOnly === todayDateOnly;
      
      await this.storage.createGame({
        awayTeam: awayTeam.team.abbreviation,
        awayPlayer: 'TBD', // Will be updated when lineups sync
        awayTipCount: 0,
        awayTipPercent: 50,
        awayScorePercent: 50,
        awayStarters: [],
        homeTeam: homeTeam.team.abbreviation,
        homePlayer: 'TBD', // Will be updated when lineups sync
        homeTipCount: 0,
        homeTipPercent: 50,
        homeScorePercent: 50,
        homeStarters: [],
        h2h: 'N/A',
        gameDate: isToday ? 'Today' : gameDateOnly, // ISO format (YYYY-MM-DD)
        gameTime: event.date,
        status: 'scheduled',
        espnGameId: event.id,
        lastSynced: new Date().toISOString()
      });
      console.log(`[DailySync] ✓ Created new game: ${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation}`);
    }
  }
}

// Export singleton instance creator
export function createDailySyncService(storage: IStorage): DailySyncService {
  return new DailySyncService(storage);
}
