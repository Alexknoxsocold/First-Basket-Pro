/** Automatically records verified first made field goals from completed NBA games. */
import { storage } from './storage';

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

function isMadeFieldGoal(p: any): boolean {
  if (!p?.scoringPlay) return false;
  const text = String(p.text || '').toLowerCase();
  if (!text.includes(' makes ') || text.includes('free throw')) return false;
  const v = Number(p.scoreValue ?? 0);
  return v === 2 || v === 3 || text.includes('layup') || text.includes('dunk') || text.includes('jumper') || text.includes('shot');
}

async function getFirstScorer(gameId: string): Promise<{playerName:string;team:string}|null> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const play = (data.plays || []).find(isMadeFieldGoal);
    if (!play) return null;
    const participant = (play.participants || []).find((p:any) => p.type !== 'assist' && p.type !== 'block') || play.participants?.[0];
    let playerName = participant?.athlete?.displayName || play.athlete?.displayName;
    if (!playerName) {
      const text = String(play.text || ''); const idx = text.indexOf(' makes ');
      playerName = idx > 0 ? text.slice(0, idx).trim() : null;
    }
    if (!playerName) return null;
    const raw = String(play.team?.abbreviation || '').toUpperCase();
    const map: Record<string,string> = { GSW:'GS',GS:'GS',NOP:'NO',NO:'NO',NYK:'NY',NY:'NY',SAS:'SA',SA:'SA',PHO:'PHX',PHX:'PHX',UTA:'UTAH',UTAH:'UTAH',WAS:'WAS' };
    const team = map[raw] || raw;
    if (!team) return null;
    return { playerName, team };
  } catch { return null; }
}

export async function runFirstBasketTracker(): Promise<{processed:number;skipped:number;errors:string[]}> {
  const result = { processed: 0, skipped: 0, errors: [] as string[] };
  try {
    const games = [...await completedGames(etDate()), ...await completedGames(etDate(-1))];
    const unique = [...new Map(games.map(g => [g.id, g])).values()];
    for (const game of unique) {
      if (await storage.isGameProcessed(game.id)) { result.skipped++; continue; }
      const scorer = await getFirstScorer(game.id);
      if (!scorer) {
        // Do NOT mark unresolved games processed. ESPN/stat corrections or a
        // temporary feed failure can then be retried on the next tracker run.
        result.errors.push(`Game ${game.id}: first made field goal unresolved; will retry`);
        continue;
      }
      await storage.incrementFbScored(scorer.playerName, scorer.team);
      await storage.markGameProcessed(game.id, scorer.playerName, scorer.team);
      result.processed++;
    }
  } catch (err:any) { result.errors.push(err?.message || String(err)); }
  return result;
}
