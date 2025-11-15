import GamesTable from "@/components/GamesTable";

export default function OpeningTips() {
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
      <div>
        <h2 className="text-lg font-semibold mb-2">Opening Tip Statistics</h2>
        <p className="text-sm text-muted-foreground">
          Projected jump ball winners and first team to score probabilities
        </p>
      </div>

      <GamesTable games={mockGames} />
    </div>
  );
}
