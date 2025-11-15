import PlayerStatsTable from '../PlayerStatsTable'

export default function PlayerStatsTableExample() {
  const mockStats = [
    { id: "1", player: "J. Allen", team: "CLE", gamesPlayed: 42, firstBaskets: 18, percentage: 42.9, avgTipWin: 64 },
    { id: "2", player: "N. Jokic", team: "DEN", gamesPlayed: 45, firstBaskets: 16, percentage: 35.6, avgTipWin: 36 },
    { id: "3", player: "J. Jackson Jr.", team: "MEM", gamesPlayed: 40, firstBaskets: 15, percentage: 37.5, avgTipWin: 46 },
    { id: "4", player: "R. Gobert", team: "MIN", gamesPlayed: 44, firstBaskets: 14, percentage: 31.8, avgTipWin: 58 },
  ]

  return <PlayerStatsTable stats={mockStats} />
}
