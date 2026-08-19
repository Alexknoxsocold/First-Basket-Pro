export type NbaSeason = {
  label: string;
  espnSeason: number;
  startYear: number;
  endYear: number;
};

/** ESPN labels an NBA season by the calendar year in which it ends. */
export function nbaSeasonForDate(date = new Date()): NbaSeason {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find(p => p.type === 'year')?.value);
  const month = Number(parts.find(p => p.type === 'month')?.value);
  const startYear = month >= 7 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    startYear,
    endYear,
    espnSeason: endYear,
    label: `${startYear}/${String(endYear).slice(-2)}`,
  };
}

export function previousNbaSeason(date = new Date()): NbaSeason {
  const current = nbaSeasonForDate(date);
  const startYear = current.startYear - 1;
  const endYear = current.endYear - 1;
  return { startYear, endYear, espnSeason: endYear, label: `${startYear}/${String(endYear).slice(-2)}` };
}
