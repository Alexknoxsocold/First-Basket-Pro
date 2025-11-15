import TeamStatsTable from '../TeamStatsTable'

export default function TeamStatsTableExample() {
  const mockStats = [
    { id: "1", team: "CLE", gamesPlayed: 48, firstToScore: 37, percentage: 77.1, avgPoints: 2.3 },
    { id: "2", team: "DEN", gamesPlayed: 46, firstToScore: 21, percentage: 45.7, avgPoints: 2.1 },
    { id: "3", team: "MIN", gamesPlayed: 47, firstToScore: 27, percentage: 57.4, avgPoints: 2.2 },
    { id: "4", team: "MEM", gamesPlayed: 45, firstToScore: 14, percentage: 31.1, avgPoints: 1.9 },
  ]

  return <TeamStatsTable stats={mockStats} />
}
