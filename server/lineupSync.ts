import type { IStorage } from './storage';

interface APISportsTeam { id: number; name: string; code: string }
interface APISportsPlayer { id: number; name: string; pos: string }
interface APISportsLineup { team: APISportsTeam; formation: string; startingLineups: APISportsPlayer[] }
interface APISportsGame {
  id: number;
  league: { name: string };
  teams: { away: APISportsTeam; home: APISportsTeam };
  lineups?: { away: APISportsLineup; home: APISportsLineup };
}
interface APISportsResponse { response: APISportsGame[] }

type ConfirmedLineup = { away: string[]; home: string[]; source: 'espn' | 'api-sports' };

function nbaSeasonFor(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function normalizeTeam(raw: string): string {
  const value = raw.toUpperCase().trim();
  const map: Record<string, string> = { GSW:'GS', GS:'GS', NOP:'NO', NO:'NO', NYK:'NY', NY:'NY', SAS:'SA', SA:'SA', PHO:'PHX', PHX:'PHX', UTA:'UTAH', UTAH:'UTAH', WSH:'WAS', WAS:'WAS' };
  return map[value] || value;
}

function cleanFive(names: string[]): string[] | null {
  const unique = [...new Map(names.map(name => [name.toLowerCase().replace(/[^a-z0-9]/g, ''), name.trim()])).values()].filter(Boolean);
  return unique.length === 5 ? unique : null;
}

async function fetchEspnConfirmedLineup(espnGameId: string, awayTeam: string, homeTeam: string): Promise<ConfirmedLineup | null> {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${espnGameId}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data: any = await response.json();
    const byTeam = new Map<string, string[]>();
    for (const teamBlock of data?.boxscore?.players || []) {
      const team = normalizeTeam(String(teamBlock?.team?.abbreviation || ''));
      if (!team) continue;
      const names: string[] = [];
      for (const group of teamBlock?.statistics || []) {
        for (const row of group?.athletes || []) {
          if (row?.starter !== true || row?.didNotPlay === true) continue;
          const name = String(row?.athlete?.displayName || '').trim();
          if (name) names.push(name);
        }
      }
      const five = cleanFive(names);
      if (five) byTeam.set(team, five);
    }
    const away = byTeam.get(normalizeTeam(awayTeam));
    const home = byTeam.get(normalizeTeam(homeTeam));
    return away && home ? { away, home, source: 'espn' } : null;
  } catch {
    return null;
  }
}

export class LineupSync {
  private storage: IStorage;
  private apiUrl = 'https://v1.basketball.api-sports.io';
  private apiKey: string | undefined;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.apiKey = process.env.APISPORTS_KEY?.trim() || undefined;
  }

  private async runFirstBasketLockPass(): Promise<void> {
    try {
      const { lockUpcomingFirstBasketPredictions } = await import('./fbPredictionLedger.js');
      const result = await lockUpcomingFirstBasketPredictions();
      if (result.locked > 0 || result.eligible > 0) console.log(`[FB Ledger] Daytime lock pass: ${result.locked} locked, ${result.eligible} eligible, ${result.skipped} skipped.`);
    } catch (error) {
      console.warn('[FB Ledger] Daytime lock pass failed:', error);
    }
  }

  private async saveConfirmedLineup(game: any, lineup: ConfirmedLineup): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.storage.updateGame(game.id, {
      awayStarters: lineup.away,
      homeStarters: lineup.home,
      lineupStatus: 'confirmed',
      lineupSource: lineup.source,
      lineupUpdatedAt: updatedAt,
    });
    console.log(`[LineupSync] Confirmed ${game.awayTeam} @ ${game.homeTeam} starters via ${lineup.source}.`);
  }

  async syncStartingLineups(): Promise<void> {
    // Never lock before refreshing starters. A stale projected five must not
    // become an official First Basket prediction simply because the clock
    // entered the lock window.
    const todayGames = await this.storage.getGamesByDate('Today');

    // ESPN is the no-key fallback and is checked first on every cycle. It is
    // only accepted when its game summary explicitly marks exactly five
    // starters for each team.
    for (const game of todayGames) {
      if (!game.espnGameId || game.status === 'completed') continue;
      const lineup = await fetchEspnConfirmedLineup(game.espnGameId, game.awayTeam, game.homeTeam);
      if (lineup) await this.saveConfirmedLineup(game, lineup);
    }

    // API-Sports remains a second source when configured. This is especially
    // useful before ESPN exposes starter flags. New rookies/traded players are
    // accepted by name directly from the current game lineup; no static roster
    // allow-list is used.
    if (this.apiKey) {
      try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const season = nbaSeasonFor(now);
        const response = await fetch(`${this.apiUrl}/games?date=${today}&league=12&season=${encodeURIComponent(season)}`, {
          headers: { 'x-apisports-key': this.apiKey },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`API-Sports.io responded with status ${response.status}`);
        const data: APISportsResponse = await response.json();
        for (const apiGame of data.response || []) {
          const awayTeam = normalizeTeam(apiGame.teams.away.code);
          const homeTeam = normalizeTeam(apiGame.teams.home.code);
          const game = todayGames.find(g => normalizeTeam(g.awayTeam) === awayTeam && normalizeTeam(g.homeTeam) === homeTeam);
          if (!game || !apiGame.lineups?.away?.startingLineups || !apiGame.lineups?.home?.startingLineups) continue;
          const away = cleanFive(apiGame.lineups.away.startingLineups.map(p => p.name));
          const home = cleanFive(apiGame.lineups.home.startingLineups.map(p => p.name));
          if (away && home) await this.saveConfirmedLineup(game, { away, home, source: 'api-sports' });
        }
      } catch (error) {
        console.warn('[LineupSync] API-Sports lineup refresh failed; ESPN-confirmed data, if any, is retained:', error);
      }
    } else {
      console.log('[LineupSync] APISPORTS_KEY not configured; using ESPN confirmed-starter fallback.');
    }

    // Lock only after all available lineup sources have refreshed.
    await this.runFirstBasketLockPass();
  }
}
