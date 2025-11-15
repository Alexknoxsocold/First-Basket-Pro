import GameRow from '../GameRow'

export default function GameRowExample() {
  return (
    <div className="border rounded-md">
      <GameRow
        awayTeam="MEM"
        awayPlayer="J. Jackson Jr."
        awayTipCount={13}
        awayTipPercent={46}
        awayScorePercent={31}
        homeTeam="CLE"
        homePlayer="J. Allen"
        homeTipCount={11}
        homeTipPercent={64}
        homeScorePercent={77}
        h2h="N/A"
      />
    </div>
  )
}
