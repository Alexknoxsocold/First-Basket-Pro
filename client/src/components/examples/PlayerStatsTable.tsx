import PlayerStatsTable from '../PlayerStatsTable'

export default function PlayerStatsTableExample() {
  const mockStats = [
    { id: "1", player: "Jarrett Allen", team: "CLE", position: "C", gamesPlayed: 15, firstBaskets: 8, percentage: 53.3, avgTipWin: 64, season: "2024/2025" },
    { id: "2", player: "Nikola Jokic", team: "DEN", position: "C", gamesPlayed: 14, firstBaskets: 6, percentage: 42.9, avgTipWin: 36, season: "2024/2025" },
    { id: "3", player: "Jaren Jackson Jr.", team: "MEM", position: "PF", gamesPlayed: 13, firstBaskets: 5, percentage: 38.5, avgTipWin: 46, season: "2024/2025" },
    { id: "4", player: "Rudy Gobert", team: "MIN", position: "C", gamesPlayed: 15, firstBaskets: 7, percentage: 46.7, avgTipWin: 58, season: "2024/2025" },
  ]

  return <PlayerStatsTable stats={mockStats} />
}
