import { useState } from "react";
import { BarChart2, LayoutGrid } from "lucide-react";
import AllGames from "@/pages/AllGames";
import PlayerStats from "@/pages/PlayerStats";

type NbaSection = "games" | "player-stats";

export default function NBA() {
  const [section, setSection] = useState<NbaSection>("games");

  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-8">
      <nav className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSection("games")}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                section === "games"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              data-testid="tab-nba-games"
            >
              <LayoutGrid className={`w-3.5 h-3.5 ${section === "games" ? "text-primary" : ""}`} />
              NBA
            </button>
            <button
              type="button"
              onClick={() => setSection("player-stats")}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                section === "player-stats"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              data-testid="tab-nba-player-fb-stats"
            >
              <BarChart2 className={`w-3.5 h-3.5 ${section === "player-stats" ? "text-primary" : ""}`} />
              Player FB Stats
            </button>
          </div>
        </div>
      </nav>

      <div className="pt-8">
        {section === "games" ? <AllGames /> : <PlayerStats />}
      </div>
    </div>
  );
}