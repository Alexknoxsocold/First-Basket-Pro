import { useEffect, useState } from "react";
import { Check, Crown, Sparkles, X } from "lucide-react";

const CHOICE_KEY = "prezitools-plan-welcome-v2";

export default function PlanWelcome() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(CHOICE_KEY)) return;
    const show = window.setTimeout(() => {
      setOpen(true);
      requestAnimationFrame(() => setVisible(true));
    }, 850);
    return () => window.clearTimeout(show);
  }, []);

  const close = (choice: "free" | "pro-preview") => {
    window.localStorage.setItem(CHOICE_KEY, choice);
    setVisible(false);
    window.setTimeout(() => setOpen(false), 260);
  };

  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-[9998] flex items-center justify-center p-4 transition-all duration-300 ${visible ? "bg-black/32 opacity-100" : "bg-black/0 opacity-0"}`} role="dialog" aria-modal="true" aria-labelledby="plan-title">
      <div className={`relative w-full max-w-[560px] overflow-hidden rounded-[22px] border border-white/15 bg-background/80 shadow-[0_28px_90px_rgba(0,0,0,.5)] backdrop-blur-xl transition-all duration-500 ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[.98] opacity-0"}`}>
        <div className="pointer-events-none absolute -left-20 -top-20 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
        <button onClick={() => close("free")} className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-background/60 text-muted-foreground backdrop-blur hover:text-foreground" aria-label="Continue with free"><X className="h-3.5 w-3.5" /></button>

        <div className="relative p-4 sm:p-5">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl border border-primary/25 bg-primary/10"><Sparkles className="h-3.5 w-3.5 text-primary" /></div>
            <div className="text-[8px] font-black uppercase tracking-[.24em] text-primary">Welcome to PreziTools</div>
            <h2 id="plan-title" className="mt-1 text-lg font-black tracking-tight sm:text-xl">See the board. Choose your access.</h2>
            <p className="mx-auto mt-1 max-w-sm text-[10px] leading-4 text-muted-foreground">Your Best Plays are already behind this window. Continue free, or preview Pro for deeper model access.</p>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-card/55 p-3.5 backdrop-blur-md">
              <div className="flex items-start justify-between gap-2"><div><div className="text-[11px] font-black">Free</div><div className="text-xl font-black">$0<span className="text-[9px] font-medium text-muted-foreground"> / month</span></div></div><div className="rounded-full border px-1.5 py-0.5 text-[7px] font-bold text-muted-foreground">CURRENT</div></div>
              <div className="mt-2.5 space-y-1.5 text-[9px]">
                {["Core daily boards", "Public model views", "Standard research"].map(x => <div key={x} className="flex items-center gap-1.5"><Check className="h-2.5 w-2.5 text-primary" />{x}</div>)}
              </div>
              <button onClick={() => close("free")} className="mt-3 h-8 w-full rounded-lg border bg-background/60 text-[10px] font-black transition hover:bg-muted">Continue Free</button>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-b from-primary/[.13] to-card/60 p-3.5 shadow-[0_0_28px_rgba(34,197,94,.09)] backdrop-blur-md">
              <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[7px] font-black text-primary"><Crown className="h-2.5 w-2.5" /> PRO</div>
              <div><div className="text-[11px] font-black">PreziTools Pro</div><div className="text-xl font-black">$11<span className="text-[9px] font-medium text-muted-foreground"> / month</span></div></div>
              <div className="mt-2.5 space-y-1.5 text-[9px]">
                {["Pro model insights", "Strong & elite plays", "Deeper analytics"].map(x => <div key={x} className="flex items-center gap-1.5"><Check className="h-2.5 w-2.5 text-primary" />{x}</div>)}
              </div>
              <button onClick={() => close("pro-preview")} className="mt-3 h-8 w-full rounded-lg bg-primary text-[10px] font-black text-primary-foreground shadow-md shadow-primary/15 transition hover:brightness-105">Preview Pro — $11/mo</button>
            </div>
          </div>

          <div className="mt-2.5 text-center text-[7.5px] text-muted-foreground">Preview only · no payment is collected yet</div>
        </div>
      </div>
    </div>
  );
}
