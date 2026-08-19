import { useState } from "react";
import { BarChart2, History, LayoutGrid } from "lucide-react";
import AllGames from "@/pages/AllGames";
import PlayerStats from "@/pages/PlayerStats";
import FirstBasketHistory from "@/pages/FirstBasketHistory";

type NbaSection = "games" | "player-stats" | "fb-history";

export default function NBA() {
  const [section, setSection] = useState<NbaSection>("games");

  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-8">
      <nav className="border-b bg-card" aria-label="NBA sections">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSection("games")}
              className={`min-h-11 flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                section === "games"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              aria-current={section === "games" ? "page" : undefined}
              data-testid="tab-nba-games"
            >
              <LayoutGrid className={`w-3.5 h-3.5 ${section === "games" ? "text-primary" : ""}`} aria-hidden="true" />
              NBA
            </button>
            <button
              type="button"
              onClick={() => setSection("player-stats")}
              className={`min-h-11 flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                section === "player-stats"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              aria-current={section === "player-stats" ? "page" : undefined}
              data-testid="tab-nba-player-fb-stats"
            >
              <BarChart2 className={`w-3.5 h-3.5 ${section === "player-stats" ? "text-primary" : ""}`} aria-hidden="true" />
              Player FB Stats
            </button>
            <button
              type="button"
              onClick={() => setSection("fb-history")}
              className={`min-h-11 flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                section === "fb-history"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              aria-current={section === "fb-history" ? "page" : undefined}
              data-testid="tab-nba-fb-history"
            >
              <History className={`w-3.5 h-3.5 ${section === "fb-history" ? "text-primary" : ""}`} aria-hidden="true" />
              FB History
            </button>
          </div>
        </div>
      </nav>

      <div className="pt-8">
        {section === "games" ? <AllGames /> : section === "player-stats" ? <PlayerStats /> : <FirstBasketHistory />}
      </div>
    </div>
  );
}