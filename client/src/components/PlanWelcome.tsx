import { useEffect, useState } from "react";
import { Check, Crown, Sparkles, X } from "lucide-react";

const CHOICE_KEY = "prezitools-plan-welcome-v1";

export default function PlanWelcome() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(CHOICE_KEY)) return;
    const show = window.setTimeout(() => {
      setOpen(true);
      requestAnimationFrame(() => setVisible(true));
    }, 250);
    return () => window.clearTimeout(show);
  }, []);

  const close = (choice: "free" | "pro-preview") => {
    window.localStorage.setItem(CHOICE_KEY, choice);
    setVisible(false);
    window.setTimeout(() => setOpen(false), 300);
  };

  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-[9998] flex items-center justify-center p-4 transition-all duration-300 ${visible ? "bg-black/70 backdrop-blur-md opacity-100" : "bg-black/0 opacity-0"}`} role="dialog" aria-modal="true" aria-labelledby="plan-title">
      <div className={`relative w-full max-w-[650px] overflow-hidden rounded-[24px] border border-white/10 bg-background/95 shadow-2xl transition-all duration-500 ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-[.97] opacity-0"}`}>
        <div className="pointer-events-none absolute -left-24 -top-24 h-60 w-60 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <button onClick={() => close("free")} className="absolute right-3.5 top-3.5 z-20 flex h-8 w-8 items-center justify-center rounded-full border bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground" aria-label="Continue with free"><X className="h-3.5 w-3.5" /></button>

        <div className="relative p-5 sm:p-6">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 shadow-[0_0_24px_rgba(34,197,94,.12)]"><Sparkles className="h-4 w-4 text-primary" /></div>
            <div className="text-[9px] font-black uppercase tracking-[.24em] text-primary">PreziTools</div>
            <h2 id="plan-title" className="mt-1.5 text-xl font-black tracking-tight sm:text-2xl">Choose how you want to play.</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-4 text-muted-foreground">Keep using PreziTools free, or preview Pro for deeper model access. No payment is collected in this preview.</p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-card/70 p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black">Free</div><div className="mt-0.5 text-2xl font-black">$0<span className="text-[10px] font-medium text-muted-foreground"> / month</span></div></div><div className="rounded-full border px-2 py-0.5 text-[8px] font-bold text-muted-foreground">CURRENT</div></div>
              <p className="mt-3 text-[10px] leading-4 text-muted-foreground">Core PreziTools access while you explore the models and daily boards.</p>
              <div className="mt-3.5 space-y-2 text-[10px]">
                {["Core daily boards", "Public model views", "Standard stats & research"].map(x => <div key={x} className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" />{x}</div>)}
              </div>
              <button onClick={() => close("free")} className="mt-4 h-9 w-full rounded-lg border bg-background text-[11px] font-black transition hover:bg-muted">Continue Free</button>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-primary/35 bg-gradient-to-b from-primary/[.10] to-card/80 p-4 shadow-[0_0_32px_rgba(34,197,94,.08)] backdrop-blur">
              <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[8px] font-black text-primary"><Crown className="h-2.5 w-2.5" /> PRO</div>
              <div><div className="text-xs font-black">PreziTools Pro</div><div className="mt-0.5 text-2xl font-black">$11<span className="text-[10px] font-medium text-muted-foreground"> / month</span></div></div>
              <p className="mt-3 text-[10px] leading-4 text-muted-foreground">Built for users who want the strongest PreziTools signals and deeper model context.</p>
              <div className="mt-3.5 space-y-2 text-[10px]">
                {["Pro model insights", "Strong & elite qualified plays", "Deeper analytics & research"].map(x => <div key={x} className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" />{x}</div>)}
              </div>
              <button onClick={() => close("pro-preview")} className="mt-4 h-9 w-full rounded-lg bg-primary text-[11px] font-black text-primary-foreground shadow-lg shadow-primary/15 transition hover:brightness-105">Preview Pro — $11/month</button>
              <div className="mt-1.5 text-center text-[8px] text-muted-foreground">Preview only · checkout is not connected yet</div>
            </div>
          </div>

          <p className="mt-3.5 text-center text-[8px] text-muted-foreground">You can keep using the free version. Pro billing will only activate after secure checkout is connected.</p>
        </div>
      </div>
    </div>
  );
}
