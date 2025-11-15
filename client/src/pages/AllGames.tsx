import { useState } from "react";
import GamesTable from "@/components/GamesTable";
import StatsCard from "@/components/StatsCard";
import { Target, TrendingUp, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AllGames() {
  const [selectedDate, setSelectedDate] = useState("Today");

  const mockGames = [
    {
      id: "1",
      awayTeam: "MEM",
      awayPlayer: "J. Jackson Jr.",
      awayTipCount: 13,
      awayTipPercent: 46,
      awayScorePercent: 31,
      homeTeam: "CLE",
      homePlayer: "J. Allen",
      homeTipCount: 11,
      homeTipPercent: 64,
      homeScorePercent: 77,
      h2h: "N/A"
    },
    {
      id: "2",
      awayTeam: "LAL",
      awayPlayer: "D. Ayton",
      awayTipCount: 12,
      awayTipPercent: 58,
      awayScorePercent: 62,
      homeTeam: "MIL",
      homePlayer: "M. Turner",
      homeTipCount: 13,
      homeTipPercent: 31,
      homeScorePercent: 54,
      h2h: "N/A"
    },
    {
      id: "3",
      awayTeam: "DEN",
      awayPlayer: "N. Jokic",
      awayTipCount: 11,
      awayTipPercent: 36,
      awayScorePercent: 45,
      homeTeam: "MIN",
      homePlayer: "R. Gobert",
      homeTipCount: 12,
      homeTipPercent: 58,
      homeScorePercent: 58,
      h2h: "0 - 1"
    },
    {
      id: "4",
      awayTeam: "OKC",
      awayPlayer: "C. Holmgren",
      awayTipCount: 9,
      awayTipPercent: 67,
      awayScorePercent: 62,
      homeTeam: "CHA",
      homePlayer: "R. Kalkbrenner",
      homeTipCount: 11,
      homeTipPercent: 45,
      homeScorePercent: 25,
      h2h: "N/A"
    },
    {
      id: "5",
      awayTeam: "TOR",
      awayPlayer: "J. Poeltl",
      awayTipCount: 8,
      awayTipPercent: 63,
      awayScorePercent: 75,
      homeTeam: "IND",
      homePlayer: "I. Jackson",
      homeTipCount: 8,
      homeTipPercent: 25,
      homeScorePercent: 50,
      h2h: "N/A"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Today's Games"
          value={mockGames.length}
          subtitle="NBA games scheduled"
          icon={Target}
        />
        <StatsCard
          title="Avg Tip Win %"
          value="54.3%"
          subtitle="Season average"
          icon={TrendingUp}
        />
        <StatsCard
          title="Highest Score %"
          value="77%"
          subtitle="CLE vs MEM"
          icon={Calendar}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Opening Tips</h2>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" data-testid="button-prev-day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-4" data-testid="text-selected-date">{selectedDate}</span>
          <Button size="icon" variant="ghost" data-testid="button-next-day">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <GamesTable games={mockGames} />
    </div>
  );
}
