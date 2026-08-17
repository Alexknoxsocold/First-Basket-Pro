import StatsCard from '../StatsCard'
import { Target } from 'lucide-react'

export default function StatsCardExample() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatsCard
        title="Today's Games"
        value={8}
        subtitle="NBA games scheduled"
        icon={Target}
      />
      <StatsCard
        title="Avg Tip Win %"
        value="54.3%"
        subtitle="Season average"
      />
      <StatsCard
        title="Top Scorer %"
        value="77%"
        subtitle="CLE vs MEM"
      />
    </div>
  )
}
