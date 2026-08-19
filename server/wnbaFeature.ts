import type { Express } from 'express';
import cron from 'node-cron';
import { requireAdmin } from './auth';
import { ensureWnbaSchema, getWnbaDiagnostics, getWnbaSlate, lockWnbaPredictions, runWnbaTracker } from './wnbaFirstBasket';
import { getWnbaHistory } from './wnbaHistory';
import { backfillWnbaHistory, refreshRecentWnbaEvidence } from './wnbaBackfill';
import { ensureWnbaEvidenceSchema } from './wnbaEvidence';

let started=false;
export function registerWnbaFeature(app:Express):void{
  void Promise.all([ensureWnbaSchema(),ensureWnbaEvidenceSchema()]).catch(e=>console.error('[WNBA] Schema initialization failed:',e));
  app.get('/api/wnba/first-basket',async(_req,res)=>{try{res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=180');res.json(await getWnbaSlate())}catch(e){console.error('[WNBA] Slate error:',e);res.status(502).json({error:'Unable to load WNBA First Basket data'})}});
  app.get('/api/wnba/history',async(_req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await getWnbaHistory())}catch(e){console.error('[WNBA] History error:',e);res.status(500).json({error:'Unable to load WNBA First Basket history'})}});
  app.post('/api/admin/wnba/run',requireAdmin,async(_req,res)=>{try{const [locks,tracking,evidence]=await Promise.all([lockWnbaPredictions(),runWnbaTracker(),refreshRecentWnbaEvidence(10)]);res.json({locks,tracking,evidence})}catch(e){console.error('[WNBA] Manual WNBA run failed:',e);res.status(500).json({error:'WNBA maintenance pass failed'})}});
  app.post('/api/admin/wnba/backfill',requireAdmin,async(req,res)=>{try{const days=Math.max(1,Math.min(14,Number(req.body?.days??7))),maxGames=Math.max(1,Math.min(40,Number(req.body?.maxGames??24)));res.json(await backfillWnbaHistory(days,maxGames))}catch(e){console.error('[WNBA] Strict backfill failed:',e);res.status(500).json({error:'WNBA strict history rebuild failed'})}});
  app.get('/api/admin/wnba/diagnostics',requireAdmin,async(req,res)=>{try{const days=typeof req.query.days==='string'?Number(req.query.days):30;const d=await getWnbaDiagnostics(Number.isFinite(days)?days:30);res.json({...d,historyStatus:'rebuilding-strict',trackerStatus:'active-strict'})}catch(e){console.error('[WNBA] Diagnostics failed:',e);res.status(500).json({error:'Unable to load WNBA diagnostics'})}});
  if(started)return;started=true;
  cron.schedule('*/15 10-23 * * *',async()=>{try{const r=await lockWnbaPredictions();if(r.eligible||r.locked)console.log(`[WNBA] Lock pass: ${r.locked} locked, ${r.waiting} waiting.`)}catch(e){console.warn('[WNBA] Lock pass failed:',e)}},{timezone:'America/New_York'});
  cron.schedule('*/30 12-23 * * *',async()=>{try{const r=await runWnbaTracker();if(r.processed||r.unresolved)console.log(`[WNBA] Strict tracker: ${r.processed} processed, ${r.unresolved} unresolved.`)}catch(e){console.warn('[WNBA] Strict tracker failed:',e)}},{timezone:'America/New_York'});
  cron.schedule('*/30 0-3 * * *',async()=>{try{const r=await runWnbaTracker();if(r.processed||r.unresolved)console.log(`[WNBA] Late strict tracker: ${r.processed} processed, ${r.unresolved} unresolved.`)}catch(e){console.warn('[WNBA] Late strict tracker failed:',e)}},{timezone:'America/New_York'});
  // While 2026 history is being rebuilt, advance one conservative chunk each hour.
  // The backfill is idempotent and every accepted game must pass strict chronology.
  cron.schedule('23 * * * *',async()=>{try{const [r,v]=await Promise.all([backfillWnbaHistory(7,24),refreshRecentWnbaEvidence(10)]);console.log(`[WNBA] Strict rebuild: ${r.gamesAdded} verified, ${r.unresolved} rejected; evidence refreshed ${v.updated}/${v.checked}${r.done?' (season complete)':''}.`)}catch(e){console.warn('[WNBA] Strict rebuild failed:',e)}},{timezone:'America/New_York'});
  void getWnbaSlate(true).then(s=>console.log(`[WNBA] Warmed ${s.games.length} games across ${s.teams.length} teams.`)).catch(e=>console.warn('[WNBA] Warm failed:',e));
  void Promise.all([runWnbaTracker(),backfillWnbaHistory(7,24),refreshRecentWnbaEvidence(10)]).then(([t,r,v])=>console.log(`[WNBA] Startup strict tracker ${t.processed} processed/${t.unresolved} unresolved; rebuild added ${r.gamesAdded}; evidence ${v.updated}/${v.checked}.`)).catch(e=>console.warn('[WNBA] Startup strict maintenance failed:',e));
  console.log('[WNBA] First Basket initialized: projections, locks, strict grading and hourly strict history rebuild active.');
}
