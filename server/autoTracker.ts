/** Automatically records verified first made field goals from completed NBA games. */
import {
  isVerifiedFirstBasketGameProcessed,
  markVerifiedFirstBasketGame,
  recordCurrentSeasonFirstBasketGame,
  type FirstBasketStarter,
} from './fbSeasonStore';

function etDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  return `${p.find(x=>x.type==='year')?.value}${p.find(x=>x.type==='month')?.value}${p.find(x=>x.type==='day')?.value}`;
}

type ESPNGame = { id: string; status: { type: { completed: boolean } } };
async function completedGames(date: string): Promise<ESPNGame[]> {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.events || []).filter((e: ESPNGame) => e.status?.type?.completed === true);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[.'’\-]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeTeam(raw: string): string {
  const value = raw.toUpperCase();
  const map: Record<string,string> = {
    GSW:'GS', GS:'GS', NOP:'NO', NO:'NO', NYK:'NY', NY:'NY', SAS:'SA', SA:'SA',
    PHO:'PHX', PHX:'PHX', UTA:'UTAH', UTAH:'UTAH', WAS:'WAS', WSH:'WAS',
  };
  return map[value] || value;
}

function isMadeFieldGoal(p: any): boolean {
  if (!p?.scoringPlay) return false;
  const text = String(p.text || '').toLowerCase();
  if (!text.includes(' makes ') || text.includes('free throw')) return false;
  const v = Number(p.scoreValue ?? 0);
  return v === 2 || v === 3 || text.includes('layup') || text.includes('dunk') || text.includes('jumper') || text.includes('shot');
}

function extractStarters(data: any): FirstBasketStarter[] {
  const starters: FirstBasketStarter[] = [];
  for (const teamBlock of data?.boxscore?.players || []) {
    const team = normalizeTeam(String(teamBlock?.team?.abbreviation || ''));
    if (!team) continue;
    for (const group of teamBlock?.statistics || []) {
      for (const row of group?.athletes || []) {
        if (row?.starter !== true || row?.didNotPlay === true) continue;
        const playerName = String(row?.athlete?.displayName || '').trim();
        if (playerName) starters.push({ playerName, team });
      }
    }
  }
  return [...new Map(starters.map(s => [`${normalizeName(s.playerName)}|${s.team}`, s])).values()];
}

async function getGameEvidence(gameId: string): Promise<{ scorer: FirstBasketStarter; starters: FirstBasketStarter[] } | null> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const starters = extractStarters(data);
    if (starters.length < 10) return null;

    const play = (data.plays || []).find(isMadeFieldGoal);
    if (!play) return null;
    const participant = (play.participants || []).find((p:any) => p.type !== 'assist' && p.type !== 'block') || play.participants?.[0];
    let playerName = participant?.athlete?.displayName || play.athlete?.displayName;
    if (!playerName) {
      const text = String(play.text || '');
      const idx = text.indexOf(' makes ');
      playerName = idx > 0 ? text.slice(0, idx).trim() : null;
    }
    if (!playerName) return null;

    let team = normalizeTeam(String(play.team?.abbreviation || ''));
    if (!team) {
      team = starters.find(s => normalizeName(s.playerName) === normalizeName(playerName))?.team || '';
    }
    if (!team) return null;

    return { scorer: { playerName, team }, starters };
  } catch {
    return null;
  }
}

export async function runFirstBasketTracker(): Promise<{processed:number;skipped:number;errors:string[]}> {
  const result = { processed: 0, skipped: 0, errors: [] as string[] };
  try {
    const games = [...await completedGames(etDate()), ...await completedGames(etDate(-1))];
    const unique = [...new Map(games.map(g => [g.id, g])).values()];
    for (const game of unique) {
      if (await isVerifiedFirstBasketGameProcessed(game.id)) { result.skipped++; continue; }
      const evidence = await getGameEvidence(game.id);
      if (!evidence) {
        result.errors.push(`Game ${game.id}: scorer/starters unresolved; will retry`);
        continue;
      }
      await recordCurrentSeasonFirstBasketGame(evidence.starters, evidence.scorer);
      await markVerifiedFirstBasketGame(game.id, evidence.scorer.playerName, evidence.scorer.team);
      result.processed++;
    }
  } catch (err:any) {
    result.errors.push(err?.message || String(err));
  }
  return result;
}
