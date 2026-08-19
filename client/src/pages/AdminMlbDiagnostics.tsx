import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, CheckCircle2, Database, Lock, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ADMIN_AUTH_KEY = "adminAuthenticated";

type LockFunnel = {
  generatedAt: string;
  slateDate: string;
  lockWindowMinutes: number;
  counts: { slate: number; upcoming: number; eligibleToLock: number; locked: number; graded: number; learningEligible: number; contextCaptured: number };
  health: "healthy" | "watch" | "blocked";
  alerts: Array<{ severity: "info" | "warning" | "error"; code: string; message: string; gameIds?: string[] }>;
};

type Diagnostics = {
  generatedAt: string;
  modelVersion: string;
  environment: string;
  configuration: { database: boolean; sessionSecret: boolean; adminPassword: boolean; oddsApiKey: boolean };
  autoGrade: { running: boolean; inFlightKeys: string[]; lastRunAt: string | null; lastSuccessAt: string | null; lastError: string | null; lastResult: { date: string; games: number } | null; intervalMs: number };
  market: { quoteCount: number; newestQuoteAt: string | null; status: string };
  ledger: { windowDays: number; snapshots: number; locked: number; graded: number };
  lockFunnel: LockFunnel;
  performance: { sampleSize: number; gradedPredictions: number; brierScore: number | null; logLoss: number | null; expectedCalibrationError: number | null };
  closingLine: { eligible: number; captured: number; averageClvProbability: number | null; beatClosingLineRate: number | null; averageOpeningToClosingOdds: number | null };
  integrity: any;
};

function when(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;
}

function AdminGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return <div className="min-h-[55vh] flex items-center justify-center px-2"><Card className="w-full max-w-sm"><CardHeader className="text-center"><Lock className="w-8 h-8 mx-auto text-muted-foreground" /><CardTitle>Admin Diagnostics</CardTitle><CardDescription>Enter the admin password to view production health.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={async e => { e.preventDefault(); setLoading(true); setError(""); try { const r = await fetch("/api/admin/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); if (!r.ok) throw new Error("Incorrect password"); sessionStorage.setItem(ADMIN_AUTH_KEY, "true"); onAuthenticated(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to verify"); } finally { setLoading(false); } }}><div className="space-y-2"><Label htmlFor="diagnostics-password">Password</Label><Input id="diagnostics-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<Button type="submit" className="w-full" disabled={loading || !password}>{loading ? "Verifying…" : "Open diagnostics"}</Button></form></CardContent></Card></div>;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-md border bg-background/50 p-3 min-w-0"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold break-words">{value}</p>{note && <p className="mt-1 text-[10px] text-muted-foreground">{note}</p>}</div>;
}

export default function AdminMlbDiagnostics() {
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem(ADMIN_AUTH_KEY) === "true");
  const query = useQuery<Diagnostics>({ queryKey: ["/api/admin/mlb/diagnostics"], queryFn: async () => { const r = await fetch("/api/admin/mlb/diagnostics", { cache: "no-store" }); if (r.status === 403) { sessionStorage.removeItem(ADMIN_AUTH_KEY); setAuthenticated(false); throw new Error("Admin session expired"); } if (!r.ok) throw new Error("Diagnostics unavailable"); return r.json(); }, enabled: authenticated, refetchInterval: 60_000, staleTime: 15_000 });
  if (!authenticated) return <AdminGate onAuthenticated={() => setAuthenticated(true)} />;
  const d = query.data;
  const configReady = d ? Object.values(d.configuration).every(Boolean) : false;
  const funnelBadge = d?.lockFunnel.health === "healthy" ? "HEALTHY" : d?.lockFunnel.health === "watch" ? "WATCH" : "ACTION NEEDED";
  return <div className="space-y-5 pb-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Activity className="w-5 h-5" /><h1 className="text-xl sm:text-2xl font-bold">MLB Production Diagnostics</h1></div><p className="mt-1 text-sm text-muted-foreground">Live operational checks for V4, official locking, grading, learning eligibility, market data and CLV.</p></div><Button variant="outline" className="w-full sm:w-auto min-h-10" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh MLB diagnostics"><RefreshCw className={`w-4 h-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button></div>
    {query.error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Unable to load diagnostics. Check server logs and deployment configuration.</div>}
    {d && <>
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="text-base">Launch status</CardTitle><CardDescription>Configuration and model provenance</CardDescription></div><Badge variant={configReady ? "default" : "destructive"}>{configReady ? "CONFIG READY" : "CONFIG INCOMPLETE"}</Badge></div></CardHeader><CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Stat label="Model" value={d.modelVersion} /><Stat label="Environment" value={d.environment} /><Stat label="Database" value={d.configuration.database ? "Connected" : "Missing"} /><Stat label="Odds API" value={d.configuration.oddsApiKey ? "Configured" : "Missing"} /></CardContent></Card>

      <Card className={d.lockFunnel.health === "blocked" ? "border-destructive/40" : d.lockFunnel.health === "watch" ? "border-yellow-500/40" : ""}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="text-base flex items-center gap-2"><Lock className="w-4 h-4" />Official prediction lifecycle</CardTitle><CardDescription>{d.lockFunnel.slateDate} slate · official lock window opens {d.lockFunnel.lockWindowMinutes} minutes before first pitch</CardDescription></div><Badge variant={d.lockFunnel.health === "blocked" ? "destructive" : "secondary"}>{funnelBadge}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"><Stat label="Slate" value={String(d.lockFunnel.counts.slate)} note="Games detected" /><Stat label="Upcoming" value={String(d.lockFunnel.counts.upcoming)} note="Not started" /><Stat label="Eligible" value={String(d.lockFunnel.counts.eligibleToLock)} note="Inside 2-hour window" /><Stat label="Locked" value={String(d.lockFunnel.counts.locked)} note="Immutable V4 record" /><Stat label="Graded" value={String(d.lockFunnel.counts.graded)} note="1st inning verified" /><Stat label="Learning eligible" value={String(d.lockFunnel.counts.learningEligible)} note="Lock + grade + context" /></div><div className="text-xs text-muted-foreground">Decision context captured for {d.lockFunnel.counts.contextCaptured} game(s). Adaptive NO PLAY learning uses only graded official locks that also have immutable context.</div>{d.lockFunnel.alerts.length > 0 && <div className="space-y-2">{d.lockFunnel.alerts.map(alert => <div key={`${alert.code}-${alert.message}`} role={alert.severity === "error" ? "alert" : undefined} className={`flex gap-2 rounded-md p-3 text-xs ${alert.severity === "error" ? "bg-destructive/10 text-destructive" : alert.severity === "warning" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" : "bg-muted/50 text-muted-foreground"}`}><TriangleAlert className="w-4 h-4 shrink-0" /><span>{alert.message}{alert.gameIds?.length ? ` Game IDs: ${alert.gameIds.join(", ")}` : ""}</span></div>)}</div>}</CardContent></Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Database className="w-4 h-4" />Prediction ledger</CardTitle><CardDescription>30-day immutable verification record</CardDescription></CardHeader><CardContent className="grid grid-cols-3 gap-3"><Stat label="Snapshots" value={String(d.ledger.snapshots)} /><Stat label="Locked" value={String(d.ledger.locked)} /><Stat label="Graded" value={String(d.ledger.graded)} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><RefreshCw className="w-4 h-4" />Auto grader</CardTitle><CardDescription>Five-minute V4 grading scheduler</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-3"><Stat label="Last success" value={when(d.autoGrade.lastSuccessAt)} /><Stat label="Last slate" value={d.autoGrade.lastResult ? `${d.autoGrade.lastResult.date} · ${d.autoGrade.lastResult.games} games` : "None yet"} /></div>{d.autoGrade.lastError ? <div role="alert" className="flex gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive"><TriangleAlert className="w-4 h-4 shrink-0" />{d.autoGrade.lastError}</div> : <div className="flex gap-2 rounded-md bg-emerald-500/10 p-3 text-xs text-emerald-600"><CheckCircle2 className="w-4 h-4 shrink-0" />No current grader error.</div>}</CardContent></Card></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><Card><CardHeader><CardTitle className="text-base">Market freshness</CardTitle><CardDescription>Verified NRFI/YRFI quotes only</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3"><Stat label="Quotes cached" value={String(d.market.quoteCount)} /><Stat label="Newest quote" value={when(d.market.newestQuoteAt)} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Closing-line tracking</CardTitle><CardDescription>Verified lock-to-close evidence</CardDescription></CardHeader><CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3"><Stat label="Eligible" value={String(d.closingLine.eligible)} /><Stat label="Captured" value={String(d.closingLine.captured)} /><Stat label="Beat close" value={pct(d.closingLine.beatClosingLineRate)} /><Stat label="Avg CLV" value={pct(d.closingLine.averageClvProbability)} /></CardContent></Card></div>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Calibration evidence</CardTitle><CardDescription>Do not change V4 weights from isolated wins or losses. Let the verified sample accumulate.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Stat label="Sample" value={String(d.performance.sampleSize ?? 0)} /><Stat label="Graded" value={String(d.performance.gradedPredictions ?? 0)} /><Stat label="Brier" value={d.performance.brierScore?.toFixed(4) ?? "—"} /><Stat label="Log loss" value={d.performance.logLoss?.toFixed(4) ?? "—"} /><Stat label="ECE" value={pct(d.performance.expectedCalibrationError)} /></CardContent></Card>
      <p className="text-[10px] text-muted-foreground">Generated {when(d.generatedAt)}. This page shows operational evidence; it does not fabricate missing market prices or retroactively lock predictions.</p>
    </>}
  </div>;
}
