import { CircleDot, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const nrfiNavItems = [{ label: "NRFI", active: true }];

export default function NRFIPro() {
  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-8">

      {/* NRFI sub-navigation */}
      <nav className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-0 overflow-x-auto">
            {nrfiNavItems.map((item) => (
              <span
                key={item.label}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer",
                  item.active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground"
                )}
              >
                <CircleDot className={cn("w-3.5 h-3.5", item.active ? "text-primary" : "")} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">

        {/* Stats cards row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-md border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's Games</span>
              <CircleDot className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-bold">—</div>
            <div className="text-xs text-muted-foreground mt-1">MLB games scheduled</div>
          </div>

          <div className="rounded-md border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg NRFI %</span>
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-bold">—</div>
            <div className="text-xs text-muted-foreground mt-1">Across today's matchups</div>
          </div>

          <div className="rounded-md border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top NRFI Pick</span>
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-bold">—</div>
            <div className="text-xs text-muted-foreground mt-1">Best probability today</div>
          </div>
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">NRFI Pro — Today's Picks</h2>
        </div>

        {/* Coming soon card */}
        <div className="rounded-md border bg-card p-12 flex flex-col items-center justify-center text-center gap-4">
          <CircleDot className="w-14 h-14 text-muted-foreground/30" />
          <div>
            <p className="text-base font-semibold text-foreground">MLB NRFI Coming Soon</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              No Run First Inning predictions, pitcher stats, and live odds are on the way.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
