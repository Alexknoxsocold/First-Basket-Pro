import { Pool, neonConfig } from '@neondatabase/serverless';
import type { Express } from 'express';
import ws from 'ws';
import { randomBytes } from 'crypto';
import cron from 'node-cron';
import { storage } from './storage';
import { requireAdmin } from './auth';
import { getWnbaSlate } from './wnbaFirstBasket';
import { fetchNrfiData } from './mlbNrfi';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BASE_URL = (process.env.NEWSLETTER_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://prezitools.com').replace(/\/$/, '');
const BRAND_GREEN = '#20e68a';
const BRAND_GREEN_DARK = '#0fb96a';
const BRAND_BG = '#0d1826';
const BRAND_PANEL = '#112235';
const BRAND_PANEL_2 = '#15283b';
const BRAND_TEXT = '#f4f7f6';
const BRAND_MUTED = '#8fa2b7';
let schedulerStarted = false;

function todayET() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}-${p.find(x => x.type === 'day')?.value}`;
}

function escapeHtml(v: unknown) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c));
}

function unsubscribeUrl(token: string) {
  return `${BASE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

function siteUrl(path = '/') {
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function emailShell(inner: string, token: string, preheader: string) {
  const unsubscribe = unsubscribeUrl(token);
  const previewImage = siteUrl('/PreziTools_link_preview_HD.jpg');
  const favicon = siteUrl('/favicon.png');
  return `<!doctype html>
<html style="background:${BRAND_BG};">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <meta name="theme-color" content="${BRAND_BG}" />
  <title>PreziTools</title>
</head>
<body bgcolor="${BRAND_BG}" style="margin:0;padding:0;background:${BRAND_BG} !important;font-family:Inter,Segoe UI,Arial,sans-serif;color:${BRAND_TEXT};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${BRAND_BG}" style="background:${BRAND_BG} !important;">
    <tr><td align="center" bgcolor="${BRAND_BG}" style="padding:24px 12px 34px;background:${BRAND_BG} !important;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${BRAND_BG}" style="max-width:680px;background:${BRAND_BG} !important;">
        <tr><td bgcolor="${BRAND_BG}" style="padding:8px 4px 18px;background:${BRAND_BG} !important;">
          <table role="presentation" width="100%" bgcolor="${BRAND_BG}" style="background:${BRAND_BG} !important;"><tr>
            <td bgcolor="${BRAND_BG}" style="vertical-align:middle;background:${BRAND_BG} !important;">
              <img src="${favicon}" width="34" height="34" alt="PreziTools" style="display:inline-block;border-radius:9px;vertical-align:middle;margin-right:10px;" />
              <span style="font-size:19px;font-weight:900;letter-spacing:-.4px;vertical-align:middle;color:${BRAND_TEXT};">PreziTools</span>
            </td>
            <td align="right" bgcolor="${BRAND_BG}" style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${BRAND_GREEN};background:${BRAND_BG} !important;">Daily Plays</td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="${BRAND_PANEL}" style="background:${BRAND_PANEL} !important;border:1px solid #29415a;border-radius:20px;overflow:hidden;box-shadow:0 14px 44px rgba(0,0,0,.28);">
          <img src="${previewImage}" width="680" alt="PreziTools sports analytics dashboard" style="display:block;width:100%;height:auto;border:0;" />
          ${inner}
        </td></tr>
        <tr><td bgcolor="${BRAND_BG}" style="padding:20px 12px 0;text-align:center;font-size:11px;line-height:1.6;color:#74879a;background:${BRAND_BG} !important;">
          You are receiving this because you joined PreziTools Daily Plays.<br />
          Model projections are informational and are not guarantees of outcomes.<br />
          <a href="${unsubscribe}" style="color:#91a5b8;text-decoration:underline;">Unsubscribe</a>
          &nbsp;·&nbsp;
          <a href="${siteUrl('/legal?tab=privacy')}" style="color:#91a5b8;text-decoration:underline;">Privacy</a>
          &nbsp;·&nbsp;
          <a href="${siteUrl('/')}" style="color:#91a5b8;text-decoration:underline;">PreziTools.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendResendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NEWSLETTER_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error('RESEND_API_KEY or NEWSLETTER_FROM_EMAIL is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: 'support@prezitools.com',
      subject,
      html,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrlForHeaders(to)}>` },
    }),
    signal: AbortSignal.timeout(12000),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `Resend HTTP ${response.status}`);
  return body;
}

function unsubscribeUrlForHeaders(_email: string) {
  return `${BASE_URL}/`;
}

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
    RETURNING email, subscribed, unsubscribe_token
  `, [email, token]);
  return r.rows[0];
}

export async function unsubscribeNewsletter(token: string) {
  if (!pool) return false;
  await ensureNewsletterSchema();
  const r = await pool.query(`UPDATE newsletter_subscribers SET subscribed=false, unsubscribed_at=now(), updated_at=now() WHERE unsubscribe_token=$1 RETURNING email`, [token]);
  return (r.rowCount ?? 0) > 0;
}

function welcomeHtml(token: string) {
  const inner = `
    <div style="padding:30px 28px 32px;background:${BRAND_PANEL};color:${BRAND_TEXT};">
      <div style="display:inline-block;padding:7px 10px;border-radius:999px;background:#143927;border:1px solid #24724d;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:${BRAND_GREEN};">You're officially in</div>
      <h1 style="margin:16px 0 10px;font-size:30px;line-height:1.08;letter-spacing:-.8px;color:${BRAND_TEXT};">Welcome to PreziTools Daily Plays.</h1>
      <p style="margin:0;color:${BRAND_MUTED};font-size:14px;line-height:1.7;">Your inbox is now connected to the same model-driven board you see on PreziTools. We filter the slate and surface the strongest qualified opportunities instead of flooding you with every game.</p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${BRAND_PANEL}" style="margin:24px 0 0;background:${BRAND_PANEL};"><tr>
        <td width="33.33%" bgcolor="${BRAND_PANEL}" style="padding:0 5px 0 0;"><div style="background:${BRAND_PANEL_2};border:1px solid #29415a;border-radius:14px;padding:14px 12px;"><div style="color:${BRAND_GREEN};font-size:11px;font-weight:900;">WNBA</div><div style="margin-top:5px;color:#c6d2de;font-size:11px;line-height:1.4;">Strongest player plays</div></div></td>
        <td width="33.33%" bgcolor="${BRAND_PANEL}" style="padding:0 3px;"><div style="background:${BRAND_PANEL_2};border:1px solid #29415a;border-radius:14px;padding:14px 12px;"><div style="color:${BRAND_GREEN};font-size:11px;font-weight:900;">NBA</div><div style="margin-top:5px;color:#c6d2de;font-size:11px;line-height:1.4;">First-basket signals</div></div></td>
        <td width="33.33%" bgcolor="${BRAND_PANEL}" style="padding:0 0 0 5px;"><div style="background:${BRAND_PANEL_2};border:1px solid #29415a;border-radius:14px;padding:14px 12px;"><div style="color:${BRAND_GREEN};font-size:11px;font-weight:900;">MLB</div><div style="margin-top:5px;color:#c6d2de;font-size:11px;line-height:1.4;">NRFI / YRFI value</div></div></td>
      </tr></table>

      <div style="margin-top:24px;background:#0f2031;border:1px solid #29415a;border-radius:14px;padding:16px;">
        <div style="font-size:12px;font-weight:900;color:${BRAND_TEXT};">What to expect</div>
        <div style="margin-top:8px;font-size:12px;line-height:1.75;color:${BRAND_MUTED};">• A curated daily digest of qualified plays<br />• Probability and matchup context at a glance<br />• Updates that respect confirmed lineups and available model data<br />• One-click unsubscribe in every email</div>
      </div>

      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px;"><tr><td bgcolor="${BRAND_GREEN}" style="border-radius:10px;">
        <a href="${siteUrl('/')}" style="display:inline-block;padding:13px 20px;color:#03110a;text-decoration:none;font-size:13px;font-weight:900;">Open today's board →</a>
      </td></tr></table>
      <p style="margin:18px 0 0;font-size:11px;line-height:1.6;color:#74879a;">Tip: add <strong style="color:#c2cfdb;">support@prezitools.com</strong> to your contacts so Daily Plays stays out of spam.</p>
    </div>`;
  return emailShell(inner, token, 'Welcome to PreziTools Daily Plays — your sports analytics digest is ready.');
}

async function sendWelcomeEmail(email: string, token: string) {
  const html = welcomeHtml(token);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NEWSLETTER_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error('RESEND_API_KEY or NEWSLETTER_FROM_EMAIL is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      reply_to: 'support@prezitools.com',
      subject: 'Welcome to PreziTools Daily Plays',
      html,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl(token)}>` },
    }),
    signal: AbortSignal.timeout(12000),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `Resend HTTP ${response.status}`);
  return body;
}

type DigestPlay = { sport: 'MLB' | 'WNBA' | 'NBA'; label: string; matchup: string; pick: string; probability: number; note: string };

async function buildMlbPlays(): Promise<DigestPlay[]> {
  try {
    const raw: any = await fetchNrfiData();
    const games: any[] = Array.isArray(raw) ? raw : (raw?.games || []);
    const out: DigestPlay[] = [];
    for (const g of games) {
      const status = String(g.playStatus || '').toUpperCase();
      const rec = String(g.recommendation || g.pick || '').toUpperCase();
      if (!['BEST_PLAY', 'PLAY', 'LEAN'].includes(status) || rec.includes('NO PLAY')) continue;
      const isNrfi = rec.includes('NRFI');
      const nrfi = Number(g.nrfiProbability), yrfi = Number(g.yrfiProbability), fallback = Number(g.probability);
      const probability = isNrfi ? (Number.isFinite(nrfi) ? nrfi : fallback) : (Number.isFinite(yrfi) ? yrfi : Number.isFinite(nrfi) ? 100 - nrfi : fallback);
      if (!Number.isFinite(probability) || probability < 53.5) continue;
      const away = typeof g.away === 'string' ? g.away : (g.away?.abbreviation || g.away?.name || 'TBD');
      const home = typeof g.home === 'string' ? g.home : (g.home?.abbreviation || g.home?.name || 'TBD');
      out.push({ sport: 'MLB', label: status === 'BEST_PLAY' ? 'BEST PLAY' : status === 'PLAY' ? 'STRONG PLAY' : 'VALUE PLAY', matchup: g.shortName || `${away} @ ${home}`, pick: isNrfi ? 'No Run 1st Inning' : 'Yes Run 1st Inning', probability, note: status === 'LEAN' ? 'Model value lean' : 'Model-qualified play' });
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
        out.push({ sport: 'WNBA', label: p.rank === 1 ? 'BEST PLAY' : 'STRONG PLAY', matchup: `${g.awayTeam} @ ${g.homeTeam}`, pick: p.name, probability: p.probability, note: g.lineupStatus === 'confirmed' ? 'Confirmed starters' : 'Projected lineup' });
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
    const games = (await storage.getGames()).filter((g: any) => g.gameDate === date || g.gameDate === 'Today');
    if (!games.length) return [];
    const starterMap: Record<string, string[]> = {};
    const teams = new Set<string>();
    for (const g of games as any[]) {
      if (!Array.isArray(g.awayStarters) || !Array.isArray(g.homeStarters) || g.awayStarters.length !== 5 || g.homeStarters.length !== 5) continue;
      starterMap[g.awayTeam] = g.awayStarters;
      starterMap[g.homeTeam] = g.homeStarters;
      teams.add(g.awayTeam);
      teams.add(g.homeTeam);
    }
    if (!teams.size) return [];
    const { fetchEspnTeamStats } = await import('./espnPlayerStats.js');
    const stats: any[] = await fetchEspnTeamStats([...teams], starterMap, {});
    const out: DigestPlay[] = [];
    for (const g of games as any[]) {
      if (!starterMap[g.awayTeam] || !starterMap[g.homeTeam]) continue;
      const starters = stats.filter((p: any) => (p.team === g.awayTeam || p.team === g.homeTeam) && p.isStarter).sort((a: any, b: any) => Number(b.firstBasketPct || 0) - Number(a.firstBasketPct || 0)).slice(0, 2);
      starters.forEach((p: any, i: number) => out.push({ sport: 'NBA', label: i === 0 ? 'BEST PLAY' : 'STRONG PLAY', matchup: `${g.awayTeam} @ ${g.homeTeam}`, pick: p.player, probability: Number(p.firstBasketPct || 0), note: 'Confirmed starter model' }));
    }
    return out;
  } catch (err) {
    console.warn('[Newsletter] NBA digest build failed:', err);
    return [];
  }
}

async function buildDigest() {
  const [mlb, wnba, nba] = await Promise.all([buildMlbPlays(), buildWnbaPlays(), buildNbaPlays()]);
  return [...wnba, ...nba, ...mlb].sort((a, b) => b.probability - a.probability);
}

function playCardHtml(p: DigestPlay) {
  return `<div style="margin:10px 0;background:${BRAND_PANEL_2};border:1px solid #29415a;border-radius:14px;padding:15px 16px;color:${BRAND_TEXT};">
    <div style="font-size:10px;font-weight:900;letter-spacing:.1em;color:${BRAND_GREEN};">${escapeHtml(p.label)} · ${escapeHtml(p.matchup)}</div>
    <table role="presentation" width="100%" bgcolor="${BRAND_PANEL_2}" style="margin-top:7px;background:${BRAND_PANEL_2};"><tr>
      <td style="font-size:16px;font-weight:900;color:${BRAND_TEXT};">${escapeHtml(p.pick)}</td>
      <td align="right" style="font-size:17px;font-weight:900;color:${BRAND_GREEN};">${p.probability.toFixed(1)}%</td>
    </tr></table>
    <div style="font-size:11px;color:${BRAND_MUTED};margin-top:5px;">${escapeHtml(p.note)}</div>
  </div>`;
}

function sectionHtml(title: string, rows: DigestPlay[]) {
  if (!rows.length) return '';
  return `<div style="margin-top:26px;"><div style="font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#d7e2ec;">${escapeHtml(title)}</div>${rows.map(playCardHtml).join('')}</div>`;
}

function digestHtml(plays: DigestPlay[], token: string) {
  const wnba = plays.filter(p => p.sport === 'WNBA');
  const nba = plays.filter(p => p.sport === 'NBA');
  const mlb = plays.filter(p => p.sport === 'MLB');
  const top = plays[0];
  const inner = `
    <div style="padding:28px;background:${BRAND_PANEL};color:${BRAND_TEXT};">
      <div style="display:inline-block;padding:7px 10px;border-radius:999px;background:#143927;border:1px solid #24724d;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:${BRAND_GREEN};">${escapeHtml(todayET())} slate</div>
      <h1 style="margin:15px 0 8px;font-size:28px;line-height:1.1;letter-spacing:-.7px;color:${BRAND_TEXT};">Today's strongest model-qualified plays.</h1>
      <p style="margin:0;color:${BRAND_MUTED};font-size:13px;line-height:1.65;">A clean, ranked view of the opportunities that cleared the PreziTools model filters. Data can update as lineups and markets change.</p>
      ${top ? `<div style="margin-top:22px;padding:18px;background:#102a22;border:1px solid #26764f;border-radius:16px;color:${BRAND_TEXT};"><div style="font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:${BRAND_GREEN};">Top signal</div><div style="margin-top:7px;font-size:18px;font-weight:900;color:${BRAND_TEXT};">${escapeHtml(top.pick)}</div><div style="margin-top:5px;font-size:12px;color:${BRAND_MUTED};">${escapeHtml(top.sport)} · ${escapeHtml(top.matchup)} · ${top.probability.toFixed(1)}%</div></div>` : ''}
      ${sectionHtml('WNBA strongest plays', wnba)}
      ${sectionHtml('NBA strongest plays', nba)}
      ${sectionHtml('MLB best & value plays', mlb)}
      ${plays.length ? '' : `<div style="margin-top:24px;padding:24px;border-radius:14px;border:1px solid #29415a;background:${BRAND_PANEL_2};text-align:center;color:${BRAND_MUTED};font-size:13px;">No plays currently clear the model thresholds. We'll keep the board selective rather than force action.</div>`}
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px;"><tr><td bgcolor="${BRAND_GREEN}" style="border-radius:10px;"><a href="${siteUrl('/')}" style="display:inline-block;padding:13px 20px;color:#03110a;text-decoration:none;font-size:13px;font-weight:900;">View live board →</a></td></tr></table>
    </div>`;
  return emailShell(inner, token, `PreziTools Daily Plays for ${todayET()} — strongest model-qualified opportunities.`);
}

export async function sendNewsletterDigest(force = false) {
  if (!pool) return { enabled: false, reason: 'database unavailable', sent: 0, failed: 0 };
  await ensureNewsletterSchema();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM_EMAIL;
  if (!apiKey || !from) return { enabled: false, reason: 'RESEND_API_KEY or NEWSLETTER_FROM_EMAIL is not configured', sent: 0, failed: 0 };
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
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [sub.email],
          reply_to: 'support@prezitools.com',
          subject: `PreziTools — Today's strongest plays`,
          html: digestHtml(plays, sub.unsubscribe_token),
          headers: { 'List-Unsubscribe': `<${unsubscribeUrl(sub.unsubscribe_token)}>` },
        }),
        signal: AbortSignal.timeout(12000),
      });
      const body: any = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || `Resend HTTP ${response.status}`);
      await pool.query(`INSERT INTO newsletter_dispatches(email,digest_date,provider_id,status,error) VALUES($1,$2,$3,'sent',null) ON CONFLICT(email,digest_date) DO UPDATE SET sent_at=now(),provider_id=EXCLUDED.provider_id,status='sent',error=null`, [sub.email, date, body?.id || null]);
      sent++;
    } catch (err: any) {
      failed++;
      await pool.query(`INSERT INTO newsletter_dispatches(email,digest_date,status,error) VALUES($1,$2,'failed',$3) ON CONFLICT(email,digest_date) DO UPDATE SET sent_at=now(),status='failed',error=EXCLUDED.error`, [sub.email, date, String(err?.message || err).slice(0, 500)]);
      console.warn(`[Newsletter] Send failed for ${sub.email}:`, err?.message || err);
    }
  }
  return { enabled: true, date, plays: plays.length, subscribers: subs.rows.length, sent, failed, skipped };
}

export function registerNewsletterRoutes(app: Express) {
  ensureNewsletterSchema().catch(err => console.warn('[Newsletter] Schema init failed:', err));

  app.post('/api/newsletter/subscribe', async (req, res) => {
    try {
      const row = await subscribeNewsletter(req.body?.email);
      let welcomeSent = false;
      try {
        await sendWelcomeEmail(row.email, row.unsubscribe_token);
        welcomeSent = true;
        console.log(`[Newsletter] Welcome email sent to ${row.email}`);
      } catch (welcomeError: any) {
        console.warn(`[Newsletter] Welcome email failed for ${row.email}:`, welcomeError?.message || welcomeError);
      }
      return res.json({
        success: true,
        email: row.email,
        welcomeSent,
        message: welcomeSent
          ? 'You are subscribed. Check your inbox for your PreziTools welcome email.'
          : 'You are subscribed to PreziTools Daily Plays.',
      });
    } catch (err: any) {
      const message = String(err?.message || 'Unable to subscribe');
      return res.status(message.includes('valid email') ? 400 : 500).json({ error: message });
    }
  });

  app.get('/api/newsletter/unsubscribe', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const ok = token ? await unsubscribeNewsletter(token) : false;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(ok ? 200 : 400).send(`<!doctype html><html><body style="margin:0;background:${BRAND_BG};color:${BRAND_TEXT};font-family:Arial,sans-serif;padding:40px;"><div style="max-width:560px;margin:60px auto;background:${BRAND_PANEL};border:1px solid #29415a;border-radius:18px;padding:30px;"><h2 style="margin-top:0;">${ok ? 'You’re unsubscribed.' : 'Unable to unsubscribe'}</h2><p style="color:${BRAND_MUTED};line-height:1.6;">${ok ? 'You will no longer receive PreziTools Daily Plays. You can rejoin any time from prezitools.com.' : 'This unsubscribe link is invalid or expired.'}</p><a href="${siteUrl('/')}" style="color:${BRAND_GREEN};font-weight:bold;">Return to PreziTools</a></div></body></html>`);
  });

  app.post('/api/admin/newsletter/send-now', requireAdmin, async (req, res) => {
    try { return res.json(await sendNewsletterDigest(Boolean(req.body?.force))); }
    catch (err: any) { console.error('[Newsletter] Manual send failed:', err); return res.status(500).json({ error: 'Newsletter send failed', detail: String(err?.message || err) }); }
  });

  if (!schedulerStarted) {
    schedulerStarted = true;
    cron.schedule('0 12 * * *', async () => {
      try { const result = await sendNewsletterDigest(false); console.log('[Newsletter] Noon ET digest:', result); }
      catch (err) { console.error('[Newsletter] Scheduled send failed:', err); }
    }, { timezone: 'America/New_York' });
    console.log('[Newsletter] Daily digest scheduled for 12:00 PM ET.');
  }
}
