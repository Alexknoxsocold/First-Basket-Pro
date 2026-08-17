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
    }
  ]

  return <GamesTable games={mockGames} />
}
