import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { randomBytes } from 'crypto';
import { storage } from './storage';
import { getWnbaSlate } from './wnbaFirstBasket';
import { fetchNrfiData } from './mlbNrfi';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BASE_URL = process.env.NEWSLETTER_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://first-basket-pro.onrender.com';

function todayET() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}-${p.find(x => x.type === 'day')?.value}`;
}
function escapeHtml(v: unknown) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c] || c)); }

export async function ensureNewsletterSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers(
      email text PRIMARY KEY,
      subscribed boolean NOT NULL DEFAULT true,
      unsubscribe_token text NOT NULL UNIQUE,
      subscribed_at timestamptz NOT NULL DEFAULT now(),
      unsubscribed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS newsletter_dispatches(
      email text NOT NULL,
      digest_date date NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT now(),
      provider_id text,
      status text NOT NULL DEFAULT 'sent',
      error text,
      PRIMARY KEY(email, digest_date)
    );
  `);
}

export async function subscribeNewsletter(emailInput: string) {
  if (!pool) throw new Error('Newsletter database unavailable');
  const email = String(emailInput || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new Error('Please enter a valid email address');
  await ensureNewsletterSchema();
  const token = randomBytes(24).toString('hex');
  const r = await pool.query(`
    INSERT INTO newsletter_subscribers(email, subscribed, unsubscribe_token)
    VALUES($1, true, $2)
    ON CONFLICT(email) DO UPDATE SET subscribed=true, unsubscribed_at=null, updated_at=now()
    RETURNING email, subscribed
  `, [email, token]);
  return r.rows[0];
}

export async function unsubscribeNewsletter(token: string) {
  if (!pool) return false;
  await ensureNewsletterSchema();
  const r = await pool.query(`UPDATE newsletter_subscribers SET subscribed=false, unsubscribed_at=now(), updated_at=now() WHERE unsubscribe_token=$1 RETURNING email`, [token]);
  return r.rowCount > 0;
}

type DigestPlay = { sport: 'MLB'|'WNBA'|'NBA'; label: string; matchup: string; pick: string; probability: number; note: string };

async function buildMlbPlays(): Promise<DigestPlay[]> {
  try {
    const raw: any = await fetchNrfiData();
    const games: any[] = Array.isArray(raw) ? raw : (raw?.games || []);
    const out: DigestPlay[] = [];
    for (const g of games) {
      const status = String(g.playStatus || '').toUpperCase();
      const rec = String(g.recommendation || g.pick || '').toUpperCase();
      if (!['BEST_PLAY','PLAY','LEAN'].includes(status) || rec.includes('NO PLAY')) continue;
      const isNrfi = rec.includes('NRFI');
      const nrfi = Number(g.nrfiProbability), yrfi = Number(g.yrfiProbability), fallback = Number(g.probability);
      const probability = isNrfi ? (Number.isFinite(nrfi) ? nrfi : fallback) : (Number.isFinite(yrfi) ? yrfi : Number.isFinite(nrfi) ? 100 - nrfi : fallback);
      if (!Number.isFinite(probability) || probability < 53.5) continue;
      const away = typeof g.away === 'string' ? g.away : (g.away?.abbreviation || g.away?.name || 'TBD');
      const home = typeof g.home === 'string' ? g.home : (g.home?.abbreviation || g.home?.name || 'TBD');
      out.push({ sport:'MLB', label: status === 'BEST_PLAY' ? 'BEST PLAY' : status === 'PLAY' ? 'STRONG PLAY' : 'VALUE PLAY', matchup:g.shortName || `${away} @ ${home}`, pick:isNrfi ? 'No Run 1st Inning' : 'Yes Run 1st Inning', probability, note: status === 'LEAN' ? 'Model value lean' : 'Model-qualified play' });
    }
    return out;
  } catch (err) {
    console.warn('[Newsletter] MLB digest build failed:', err);
    return [];
  }
}

async function buildWnbaPlays(): Promise<DigestPlay[]> {
  try {
    const slate = await getWnbaSlate(true);
    const out: DigestPlay[] = [];
    for (const g of slate.games || []) {
      for (const p of (g.candidates || []).filter(x => x.rank <= 2)) {
        out.push({ sport:'WNBA', label:p.rank === 1 ? 'BEST PLAY' : 'STRONG PLAY', matchup:`${g.awayTeam} @ ${g.homeTeam}`, pick:p.name, probability:p.probability, note:g.lineupStatus === 'confirmed' ? 'Confirmed starters' : 'Projected lineup' });
      }
    }
    return out;
  } catch (err) {
    console.warn('[Newsletter] WNBA digest build failed:', err);
    return [];
  }
}

async function buildNbaPlays(): Promise<DigestPlay[]> {
  try {
    const date = todayET();
    const games = (await storage.getGames()).filter((g:any) => g.gameDate === date || g.gameDate === 'Today');
    if (!games.length) return [];
    const starterMap: Record<string,string[]> = {};
    const teams = new Set<string>();
    for (const g of games as any[]) {
      if (!Array.isArray(g.awayStarters) || !Array.isArray(g.homeStarters) || g.awayStarters.length !== 5 || g.homeStarters.length !== 5) continue;
      starterMap[g.awayTeam] = g.awayStarters; starterMap[g.homeTeam] = g.homeStarters; teams.add(g.awayTeam); teams.add(g.homeTeam);
    }
    if (!teams.size) return [];
    const { fetchEspnTeamStats } = await import('./espnPlayerStats.js');
    const stats: any[] = await fetchEspnTeamStats([...teams], starterMap, {});
    const out: DigestPlay[] = [];
    for (const g of games as any[]) {
      if (!starterMap[g.awayTeam] || !starterMap[g.homeTeam]) continue;
      const starters = stats.filter((p:any) => (p.team === g.awayTeam || p.team === g.homeTeam) && p.isStarter).sort((a:any,b:any) => Number(b.firstBasketPct||0)-Number(a.firstBasketPct||0)).slice(0,2);
      starters.forEach((p:any, i:number) => out.push({ sport:'NBA', label:i === 0 ? 'BEST PLAY' : 'STRONG PLAY', matchup:`${g.awayTeam} @ ${g.homeTeam}`, pick:p.player, probability:Number(p.firstBasketPct||0), note:'Confirmed starter model' }));
    }
    return out;
  } catch (err) {
    console.warn('[Newsletter] NBA digest build failed:', err);
    return [];
  }
}

async function buildDigest() {
  const [mlb, wnba, nba] = await Promise.all([buildMlbPlays(), buildWnbaPlays(), buildNbaPlays()]);
  return [...wnba, ...nba, ...mlb].sort((a,b) => b.probability - a.probability);
}

function sectionHtml(title: string, rows: DigestPlay[]) {
  if (!rows.length) return '';
  return `<h2 style="margin:28px 0 12px;font-size:18px">${escapeHtml(title)}</h2>${rows.map(p => `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:10px 0"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#6b7280">${escapeHtml(p.label)} · ${escapeHtml(p.matchup)}</div><div style="font-size:17px;font-weight:800;margin-top:5px">${escapeHtml(p.pick)} <span style="float:right">${p.probability.toFixed(1)}%</span></div><div style="font-size:12px;color:#6b7280;margin-top:5px">${escapeHtml(p.note)}</div></div>`).join('')}`;
}

function digestHtml(plays: DigestPlay[], token: string) {
  const wnba = plays.filter(p => p.sport === 'WNBA');
  const nba = plays.filter(p => p.sport === 'NBA');
  const mlb = plays.filter(p => p.sport === 'MLB');
  const unsubscribe = `${BASE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  return `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827"><div style="max-width:660px;margin:0 auto;padding:28px 18px"><div style="background:white;border-radius:16px;padding:26px;border:1px solid #e5e7eb"><h1 style="margin:0;font-size:25px">PreziTools Daily Plays</h1><p style="margin:8px 0 0;color:#6b7280;font-size:13px">Strongest model-qualified plays for ${escapeHtml(todayET())}. Picks can update as lineups are confirmed.</p>${sectionHtml('WNBA Strongest Plays', wnba)}${sectionHtml('NBA Strongest Plays', nba)}${sectionHtml('MLB Best & Value Plays', mlb)}${plays.length ? '' : '<p style="padding:28px 0;color:#6b7280">No qualifying plays are posted yet today.</p>'}<div style="margin-top:30px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280">Model projections are informational and not guarantees. <a href="${unsubscribe}" style="color:#6b7280">Unsubscribe</a></div></div></div></body></html>`;
}

export async function sendNewsletterDigest(force=false) {
  if (!pool) return { enabled:false, reason:'database unavailable', sent:0, failed:0 };
  await ensureNewsletterSchema();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM_EMAIL;
  if (!apiKey || !from) return { enabled:false, reason:'RESEND_API_KEY or NEWSLETTER_FROM_EMAIL is not configured', sent:0, failed:0 };
  const plays = await buildDigest();
  const date = todayET();
  const subs = await pool.query('SELECT email, unsubscribe_token FROM newsletter_subscribers WHERE subscribed=true ORDER BY subscribed_at');
  let sent = 0, failed = 0, skipped = 0;
  for (const sub of subs.rows) {
    if (!force) {
      const already = await pool.query('SELECT 1 FROM newsletter_dispatches WHERE email=$1 AND digest_date=$2 AND status=$3', [sub.email, date, 'sent']);
      if (already.rows.length) { skipped++; continue; }
    }
    try {
      const r = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' }, body:JSON.stringify({ from, to:[sub.email], subject:`PreziTools — Today's strongest plays`, html:digestHtml(plays, sub.unsubscribe_token) }), signal:AbortSignal.timeout(12000) });
      const body:any = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message || `Resend HTTP ${r.status}`);
      await pool.query(`INSERT INTO newsletter_dispatches(email,digest_date,provider_id,status,error) VALUES($1,$2,$3,'sent',null) ON CONFLICT(email,digest_date) DO UPDATE SET sent_at=now(),provider_id=EXCLUDED.provider_id,status='sent',error=null`, [sub.email, date, body?.id || null]);
      sent++;
    } catch (err:any) {
      failed++;
      await pool.query(`INSERT INTO newsletter_dispatches(email,digest_date,status,error) VALUES($1,$2,'failed',$3) ON CONFLICT(email,digest_date) DO UPDATE SET sent_at=now(),status='failed',error=EXCLUDED.error`, [sub.email, date, String(err?.message || err).slice(0,500)]);
      console.warn(`[Newsletter] Send failed for ${sub.email}:`, err?.message || err);
    }
  }
  return { enabled:true, date, plays:plays.length, subscribers:subs.rows.length, sent, failed, skipped };
}
