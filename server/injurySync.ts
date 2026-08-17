import type { IStorage } from './storage';

interface EspnInjury {
  id: string;
  uid: string;
  guid: string;
  athlete: {
    id: string;
    fullName: string;
    displayName: string;
    shortName: string;
    links: any[];
  };
  date: string;
  status: string;
  type: {
    id: string;
    name: string;
    description: string;
    abbreviation: string;
  };
  details: {
    type: string;
    detail: string;
    side: string | null;
    returnDate: string | null;
    fantasyStatus: string | null;
  };
}

interface EspnTeamInjuries {
  team: {
    id: string;
    abbreviation: string;
    displayName: string;
    shortDisplayName: string;
  };
  injuries: EspnInjury[];
}

export class InjurySync {
  private storage: IStorage;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly ESPN_INJURIES_API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
  private readonly SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  async fetchInjuries(): Promise<EspnInjury[] | null> {
    try {
      const response = await fetch(this.ESPN_INJURIES_API);
      
      if (!response.ok) {
        console.error(`ESPN API error: ${response.status} ${response.statusText}`);
        return null; // Return null to signal API failure
      }

      const data: { injuries: EspnTeamInjuries[] } = await response.json();
      
      // Flatten all injuries from all teams
      const allInjuries: EspnInjury[] = [];
      if (data.injuries) {
        for (const teamInjury of data.injuries) {
          allInjuries.push(...teamInjury.injuries);
        }
      }
      
      return allInjuries; // Return empty array if legitimately no injuries
    } catch (error) {
      console.error('Error fetching injuries from ESPN:', error);
      return null; // Return null to signal network/parsing failure
    }
  }

  mapInjuryStatus(status: string): string | null {
    const statusLower = status.toLowerCase();
    
    if (statusLower.includes('out') || statusLower.includes('injury_status_out')) {
      return 'OUT';
    } else if (statusLower.includes('questionable') || statusLower.includes('doubtful')) {
      return 'QUESTIONABLE';
    } else if (statusLower.includes('day-to-day') || statusLower.includes('day to day') || statusLower.includes('daytoday')) {
      return 'DAY-TO-DAY';
    }
    
    // For unknown statuses, return null to skip the update (preserve existing status)
    console.log(`[InjurySync] Unknown injury status: ${status} - skipping update`);
    return null;
  }

  async syncInjuries(): Promise<void> {
    console.log('[InjurySync] Starting injury sync from ESPN...');
    
    try {
      const injuries = await this.fetchInjuries();
      
      // Distinguish between API failure (null) and valid empty response ([])
      if (injuries === null) {
        console.log('[InjurySync] ESPN API failed. Skipping sync to preserve existing injury data.');
        return;
      }

      const allPlayers = await this.storage.getPlayerStats();
      
      // Build map of players currently on injury report
      const injuredPlayerMap = new Map<string, { status: string | null; note: string }>();
      
      for (const injury of injuries) {
        const injuredPlayerName = injury.athlete.displayName || injury.athlete.fullName;
        const status = this.mapInjuryStatus(injury.status);
        const rawStatus = injury.status; // Store raw status for unmapped cases
        const note = injury.details?.detail || injury.type?.name || injury.status;
        
        // If we can't map the status, store the raw ESPN status instead of skipping
        injuredPlayerMap.set(injuredPlayerName.toLowerCase(), {
          status: status ?? rawStatus, // Use mapped status if available, otherwise raw ESPN status
          note
        });
      }

      if (injuries.length === 0) {
        console.log('[InjurySync] ESPN reports no active injuries.');
      }

      let updatedCount = 0;
      let clearedCount = 0;
      
      // Update all players: set injury status if on ESPN report, clear if not
      for (const player of allPlayers) {
        const playerNameLower = player.player.toLowerCase();
        const injuryData = injuredPlayerMap.get(playerNameLower);
        
        if (injuryData) {
          // Player is injured - update with status and note
          await this.storage.updatePlayerInjuryStatus(
            player.id,
            injuryData.status,
            injuryData.note
          );
          updatedCount++;
          console.log(`[InjurySync] Updated ${player.player}: ${injuryData.status} (${injuryData.note})`);
        } else if (player.injuryStatus) {
          // Player not on injury report but has old injury status - clear it
          await this.storage.updatePlayerInjuryStatus(player.id, null, null);
          clearedCount++;
        }
      }
      
      console.log(`[InjurySync] Sync complete. Updated ${updatedCount} players, cleared ${clearedCount} recovered players.`);
      console.log(`[InjurySync] Total injuries from ESPN: ${injuries.length}`);
    } catch (error) {
      console.error('[InjurySync] Error during sync - preserving existing injury data:', error);
    }
  }

  start(): void {
    console.log('[InjurySync] Starting automatic injury sync (every 1 hour)...');
    
    // Run immediately on start
    this.syncInjuries();
    
    // Then run every hour
    this.intervalId = setInterval(() => {
      this.syncInjuries();
    }, this.SYNC_INTERVAL);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[InjurySync] Stopped automatic injury sync.');
    }
  }
}
