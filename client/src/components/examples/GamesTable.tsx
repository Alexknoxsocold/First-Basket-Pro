import GamesTable from '../GamesTable'

export default function GamesTableExample() {
  const mockGames = [
    {
      id: "1",
      awayTeam: "MEM",
      awayPlayer: "J. Jackson Jr.",
      awayTipCount: 13,
      awayTipPercent: 46,
      awayScorePercent: 31,
      awayStarters: ["J. Jackson Jr.", "C. Aldama", "J. Morant", "D. Bane", "Z. Edey"],
      homeTeam: "CLE",
      homePlayer: "J. Allen",
      homeTipCount: 11,
      homeTipPercent: 64,
      homeScorePercent: 77,
      homeStarters: ["J. Allen", "E. Mobley", "D. Mitchell", "M. Strus", "D. Garland"],
      h2h: "N/A",
      gameDate: "2025-01-01",
      gameTime: null,
      status: "scheduled",
      awayScore: null,
      homeScore: null,
      espnGameId: null,
      lastSynced: null,
    },
    {
      id: "2",
      awayTeam: "LAL",
      awayPlayer: "D. Ayton",
      awayTipCount: 12,
      awayTipPercent: 58,
      awayScorePercent: 62,
      awayStarters: ["D. Ayton", "L. James", "A. Reaves", "R. Hachimura", "M. Smart"],
      homeTeam: "MIL",
      homePlayer: "M. Turner",
      homeTipCount: 13,
      homeTipPercent: 31,
      homeScorePercent: 54,
      homeStarters: ["M. Turner", "G. Antetokounmpo", "D. Lillard", "K. Middleton", "T. Trent Jr."],
      h2h: "N/A",
      gameDate: "2025-01-02",
      gameTime: null,
      status: "scheduled",
      awayScore: null,
      homeScore: null,
      espnGameId: null,
      lastSynced: null,
    },
  ]

  return <GamesTable games={mockGames} />
}
