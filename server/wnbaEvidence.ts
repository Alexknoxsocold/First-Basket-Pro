import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

export type WnbaStarter = { name: string; team: string };
export type WnbaOpeningEvidence = {
  gameId: string;
  gameDate: string;
  tipWinnerTeam: string | null;
  tipPlayerA: string | null;
  tipPlayerB: string | null;
  firstShotPlayer: string;
  firstShotTeam: string;
  firstShotMade: boolean;
  firstMadePlayer: string;
  firstMadeTeam: string;
  confidence: 'verified';
};

const normName = (v:string) => v.toLowerCase().replace(/[.'’\-]/g,'').replace(/\s+/g,' ').trim();
const normTeam = (v:string) => v.toUpperCase().trim();

function periodNumber(play:any): number {
  return Number(play?.period?.number ?? play?.period ?? 99);
}
function clockSeconds(play:any): number {
  const raw = String(play?.clock?.displayValue ?? play?.clock ?? '0:00');
  const parts = raw.split(':').map(Number);
  if (parts.some(Number.isNaN)) return -1;
  return parts.length === 2 ? parts[0] * 60 + parts[1] : -1;
}
function seq(play:any): number {
  const n = Number(play?.sequenceNumber ?? play?.id ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** ESPN play arrays are not trusted to arrive oldest-first. */
export function chronologicalPlays(summary:any): any[] {
  return [...(summary?.plays || [])].sort((a,b) => {
    const p = periodNumber(a) - periodNumber(b);
    if (p) return p;
    const c = clockSeconds(b) - clockSeconds(a); // basketball clocks count down
    if (c) return c;
    return seq(a) - seq(b);
  });
}

function participantName(play:any): string {
  const part = (play?.participants || []).find((p:any) => !['assist','block'].includes(String(p?.type || '').toLowerCase())) || play?.participants?.[0];
  return String(part?.athlete?.displayName || play?.athlete?.displayName || '').trim();
}
function playTeam(play:any): string {
  return normTeam(String(play?.team?.abbreviation || play?.team?.shortDisplayName || ''));
}
function isFieldGoalAttempt(play:any): boolean {
  const text = String(play?.text || '').toLowerCase();
  if (text.includes('free throw')) return false;
  if (!/( makes | misses )/.test(` ${text} `)) return false;
  return /(layup|dunk|jumper|jump shot|three point|3-point|hook shot|shot)/i.test(text) || [2,3].includes(Number(play?.scoreValue ?? 0));
}
function isMadeFieldGoal(play:any): boolean {
  const text = String(play?.text || '').toLowerCase();
  return isFieldGoalAttempt(play) && (play?.scoringPlay === true || text.includes(' makes '));
}
function starterFor(name:string, team:string, starters:WnbaStarter[]): WnbaStarter | null {
  const n = normName(name); const t = normTeam(team);
  return starters.find(s => normName(s.name) === n && (!t || normTeam(s.team) === t)) || null;
}
function inferNameFromText(play:any): string {
  const text = String(play?.text || '');
  const m = text.match(/^(.+?)\s+(?:makes|misses)\s+/i);
  return m?.[1]?.trim() || '';
}
function shotIdentity(play:any, starters:WnbaStarter[]): WnbaStarter | null {
  const rawName = participantName(play) || inferNameFromText(play);
  const team = playTeam(play);
  if (!rawName) return null;
  return starterFor(rawName, team, starters);
}

function parseJump(play:any): { winnerTeam:string|null; a:string|null; b:string|null } | null {
  const text = String(play?.text || '');
  if (!/jump ball/i.test(text)) return null;
  const names = (play?.participants || []).map((p:any)=>String(p?.athlete?.displayName || '').trim()).filter(Boolean);
  const vs = text.match(/jump ball\s+(.+?)\s+vs\.?\s+(.+?)(?:\s*\(|$)/i);
  return {
    winnerTeam: playTeam(play) || null,
    a: names[0] || vs?.[1]?.trim() || null,
    b: names[1] || vs?.[2]?.trim() || null,
  };
}

export function verifyOpeningEvidence(gameId:string, gameDate:string, summary:any, starters:WnbaStarter[]): WnbaOpeningEvidence | null {
  if (starters.length !== 10) return null;
  const teams = new Set(starters.map(s=>normTeam(s.team)));
  if (teams.size !== 2) return null;
  const plays = chronologicalPlays(summary).filter(p => periodNumber(p) === 1);
  if (!plays.length) return null;

  const shotPlays = plays.filter(isFieldGoalAttempt);
  const firstShot = shotPlays[0];
  const firstMade = shotPlays.find(isMadeFieldGoal);
  if (!firstShot || !firstMade) return null;
  const firstShotStarter = shotIdentity(firstShot, starters);
  const firstMadeStarter = shotIdentity(firstMade, starters);
  if (!firstShotStarter || !firstMadeStarter) return null;
  if (!teams.has(normTeam(firstShotStarter.team)) || !teams.has(normTeam(firstMadeStarter.team))) return null;

  // Sanity: the first made FG cannot chronologically precede the first FGA.
  const firstShotIndex = plays.indexOf(firstShot);
  const firstMadeIndex = plays.indexOf(firstMade);
  if (firstShotIndex < 0 || firstMadeIndex < firstShotIndex) return null;

  const jump = plays.map(parseJump).find(Boolean) as {winnerTeam:string|null;a:string|null;b:string|null}|undefined;
  const winner = jump?.winnerTeam && teams.has(normTeam(jump.winnerTeam)) ? normTeam(jump.winnerTeam) : null;

  return {
    gameId,
    gameDate,
    tipWinnerTeam: winner,
    tipPlayerA: jump?.a || null,
    tipPlayerB: jump?.b || null,
    firstShotPlayer: firstShotStarter.name,
    firstShotTeam: normTeam(firstShotStarter.team),
    firstShotMade: isMadeFieldGoal(firstShot),
    firstMadePlayer: firstMadeStarter.name,
    firstMadeTeam: normTeam(firstMadeStarter.team),
    confidence: 'verified',
  };
}

export async function ensureWnbaEvidenceSchema(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wnba_opening_evidence (
      espn_game_id text PRIMARY KEY,
      game_date date NOT NULL,
      tip_winner_team text,
      tip_player_a text,
      tip_player_b text,
      first_shot_player text NOT NULL,
      first_shot_team text NOT NULL,
      first_shot_made boolean NOT NULL,
      first_made_player text NOT NULL,
      first_made_team text NOT NULL,
      confidence text NOT NULL DEFAULT 'verified',
      verified_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS wnba_opening_evidence_date_idx ON wnba_opening_evidence (game_date DESC);
  `);
}

export async function saveOpeningEvidence(e:WnbaOpeningEvidence): Promise<void> {
  if (!pool) return;
  await ensureWnbaEvidenceSchema();
  await pool.query(`INSERT INTO wnba_opening_evidence
    (espn_game_id,game_date,tip_winner_team,tip_player_a,tip_player_b,first_shot_player,first_shot_team,first_shot_made,first_made_player,first_made_team,confidence,verified_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'verified',now())
    ON CONFLICT (espn_game_id) DO UPDATE SET game_date=EXCLUDED.game_date,tip_winner_team=EXCLUDED.tip_winner_team,
      tip_player_a=EXCLUDED.tip_player_a,tip_player_b=EXCLUDED.tip_player_b,first_shot_player=EXCLUDED.first_shot_player,
      first_shot_team=EXCLUDED.first_shot_team,first_shot_made=EXCLUDED.first_shot_made,first_made_player=EXCLUDED.first_made_player,
      first_made_team=EXCLUDED.first_made_team,confidence='verified',verified_at=now()`,
    [e.gameId,e.gameDate,e.tipWinnerTeam,e.tipPlayerA,e.tipPlayerB,e.firstShotPlayer,e.firstShotTeam,e.firstShotMade,e.firstMadePlayer,e.firstMadeTeam]);
}

export async function getOpeningPlayerStats(season:number): Promise<Map<string,{firstShots:number;firstMakes:number;firstBaskets:number;tipWins:number;tipEvents:number}>> {
  const out = new Map<string,{firstShots:number;firstMakes:number;firstBaskets:number;tipWins:number;tipEvents:number}>();
  if (!pool) return out;
  await ensureWnbaEvidenceSchema();
  const rows = await pool.query(`SELECT * FROM wnba_opening_evidence WHERE extract(year from game_date)=$1 AND confidence='verified'`,[season]);
  const add=(name:string,field:'firstShots'|'firstMakes'|'firstBaskets'|'tipWins'|'tipEvents')=>{
    if(!name)return; const k=normName(name); const v=out.get(k)||{firstShots:0,firstMakes:0,firstBaskets:0,tipWins:0,tipEvents:0}; v[field]++; out.set(k,v);
  };
  for(const r of rows.rows){
    add(r.first_shot_player,'firstShots'); if(r.first_shot_made)add(r.first_shot_player,'firstMakes'); add(r.first_made_player,'firstBaskets');
    if(r.tip_player_a){add(r.tip_player_a,'tipEvents'); if(r.tip_winner_team && normTeam(r.tip_winner_team)===normTeam(r.first_shot_team)) add(r.tip_player_a,'tipWins');}
    if(r.tip_player_b)add(r.tip_player_b,'tipEvents');
  }
  return out;
}
