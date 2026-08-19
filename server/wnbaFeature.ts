import type { Express } from 'express';
import cron from 'node-cron';
import { requireAdmin } from './auth';
import { ensureWnbaSchema, getWnbaDiagnostics, getWnbaSlate, lockWnbaPredictions } from './wnbaFirstBasket';
import { getWnbaHistory } from './wnbaHistory';
import { backfillWnbaHistory } from './wnbaBackfill';
import { ensureWnbaEvidenceSchema } from './wnbaEvidence';

let started=false;
export function registerWnbaFeature(app:Express):void{
  void Promise.all([ensureWnbaSchema(),ensureWnbaEvidenceSchema()]).catch(e=>console.error('[WNBA] Schema initialization failed:',e));

  app.get('/api/wnba/first-basket',async(_req,res)=>{try{res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=180');res.json(await getWnbaSlate())}catch(e){console.error('[WNBA] Slate error:',e);res.status(502).json({error:'Unable to load WNBA First Basket data'})}});
  app.get('/api/wnba/history',async(_req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await getWnbaHistory())}catch(e){console.error('[WNBA] History error:',e);res.status(500).json({error:'Unable to load WNBA First Basket history'})}});
  app.post('/api/admin/wnba/run',requireAdmin,async(_req,res)=>{try{const locks=await lockWnbaPredictions();res.json({locks,tracking:{paused:true,reason:'Live WNBA result grading remains paused while the strict historical verifier rebuilds coverage.'}})}catch(e){console.error('[WNBA] Manual lock run failed:',e);res.status(500).json({error:'WNBA lock pass failed'})}});
  app.post('/api/admin/wnba/backfill',requireAdmin,async(req,res)=>{try{const days=Math.max(1,Math.min(5,Number(req.body?.days??2))),maxGames=Math.max(1,Math.min(12,Number(req.body?.maxGames??6)));res.json(await backfillWnbaHistory(days,maxGames))}catch(e){console.error('[WNBA] Strict backfill failed:',e);res.status(500).json({error:'WNBA strict history rebuild failed'})}});
  app.get('/api/admin/wnba/diagnostics',requireAdmin,async(req,res)=>{try{const days=typeof req.query.days==='string'?Number(req.query.days):30;const d=await getWnbaDiagnostics(Number.isFinite(days)?days:30);res.json({...d,historyStatus:'rebuilding-strict',trackerStatus:'paused-until-history-verifier-proven'})}catch(e){console.error('[WNBA] Diagnostics failed:',e);res.status(500).json({error:'Unable to load WNBA diagnostics'})}});

  if(started)return;started=true;
  cron.schedule('*/15 10-23 * * *',async()=>{try{const r=await lockWnbaPredictions();if(r.eligible||r.locked)console.log(`[WNBA] Lock pass: ${r.locked} locked, ${r.waiting} waiting.`)}catch(e){console.warn('[WNBA] Lock pass failed:',e)}},{timezone:'America/New_York'});
  // Strict historical rebuild only. Small chunks limit source load and make bad
  // data easy to contain. Live result grading is intentionally still paused.
  cron.schedule('23 */6 * * *',async()=>{try{const r=await backfillWnbaHistory(3,8);console.log(`[WNBA] Strict history rebuild: ${r.gamesAdded} verified games, ${r.unresolved} rejected.`)}catch(e){console.warn('[WNBA] Strict history rebuild failed:',e)}},{timezone:'America/New_York'});
  void getWnbaSlate(true).then(s=>console.log(`[WNBA] Warmed ${s.games.length} games across ${s.teams.length} teams.`)).catch(e=>console.warn('[WNBA] Warm failed:',e));
  void backfillWnbaHistory(2,4).then(r=>console.log(`[WNBA] Startup strict rebuild added ${r.gamesAdded} verified games; ${r.unresolved} rejected.`)).catch(e=>console.warn('[WNBA] Startup strict rebuild failed:',e));
  console.log('[WNBA] First Basket initialized: projections/locks active; strict history rebuild active; live grading paused.');
}
