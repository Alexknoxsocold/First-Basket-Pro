# Odds source audit

## Current NBA pipeline

The NBA page does **not** scrape DraftKings or FanDuel HTML pages directly.

Current flow:

1. `client/src/pages/NBA.tsx` renders the NBA experience.
2. `client/src/pages/AllGames.tsx` loads `/api/games` and `/api/espn-player-stats`.
3. `server/routes.ts` handles `/api/espn-player-stats` and calls the ESPN player-stats service.
4. `server/espnPlayerStats.ts` loads NBA rosters/stats from ESPN and requests first-basket prop data from ESPN's Core API `.../odds/100/propBets` endpoint.
5. The frontend currently labels returned live odds as DraftKings in `PlayerStats.tsx`, but the backend does not carry an explicit sportsbook/provider identity with each price. That label should therefore not be treated as verified provider metadata.

## Risk assessment

- There is no direct FanDuel/DraftKings web-page scraper in the current NBA path.
- The NBA odds dependency is still an undocumented ESPN Core API endpoint, so it is not a strong long-term contract for a production odds product.
- Provider identity is hard-coded in the UI instead of being supplied by the data source.
- The generated model `odds` field is an implied-price conversion from the model probability and must remain clearly separate from real market odds.

## Recommended architecture

Create a shared odds-provider layer for NBA and WNBA with normalized fields:

- sport
- event id
- athlete id/name
- market
- sportsbook
- american odds
- implied probability
- fetched at
- source

Keep the existing ESPN feed as a fallback while a licensed/authorized odds API is tested. Do not remove the working ESPN path until the replacement has been compared against it.

For WNBA first-basket value, only label a play `VALUE` when an actual market price is available and the model probability exceeds the sportsbook implied probability by a defined edge threshold. Until then, WNBA rank #3 should remain off the homepage and should not be presented as market value.

## Migration order

1. Stop assuming live NBA prices are DraftKings unless provider metadata confirms it.
2. Add normalized odds-provider types/service.
3. Integrate an authorized provider in parallel with ESPN.
4. Compare NBA first-basket prices and player matching before switching production reads.
5. Reuse the same provider layer for WNBA first-basket odds.
6. Add model edge / expected-value fields and promotion thresholds.
7. Keep ESPN as a resilience fallback where appropriate.

## Candidate provider

The Odds API currently advertises sportsbook filtering and first-basket player markets, but current plan/market availability should be verified before adopting it. The provider should not be wired into production until credentials and the required NBA/WNBA first-basket coverage are confirmed.
