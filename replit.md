# NBA First Basket PRO

## Overview
NBA First Basket PRO is a sports analytics web application providing predictions and statistical insights for NBA first basket scenarios. It tracks opening tip statistics, player performance, team scoring probabilities, and suggests optimal parlay combinations. The application functions as a data-intensive dashboard for analyzing first basket opportunities, focusing on clarity and information density. It is fully functional with a comprehensive daily automation system, including automatic injury tracking, real-time lineup updates via API-Sports.io, daily game schedule/score synchronization, and data persistence for completed games, integrating with the ESPN API.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application employs a Linear/Vercel-inspired modern data dashboard design, prioritizing maximum information density and minimal visual noise. Typography uses Inter for primary content and JetBrains Mono for numerical data. The layout utilizes Tailwind's spacing primitives with a max-width container strategy. All data tables feature sticky headers, alternating row backgrounds, and responsive design with horizontal scroll on mobile. The UI is built with `shadcn/ui` components on `Radix UI` primitives, styled with `Tailwind CSS`.

### Technical Implementations
**Frontend**: Developed with React 18 and TypeScript, using Wouter for routing and TanStack Query for server state management. Key pages include All Games, Opening Tips, Player Stats, Team Stats, and Parlays.
**Backend**: Implemented with Express.js and TypeScript, using ES Modules and esbuild for production bundling. Data is currently stored in-memory via a `MemStorage` class, abstracting data access for future database migration.
**API Endpoints**: RESTful endpoints under `/api` provide game data, player statistics (including injury status and today's starters), and team statistics. Manual trigger endpoints exist for syncing injuries, lineups, and a comprehensive daily sync.
**Daily Sync System**: A `DailySyncService` orchestrates nightly data updates (12:30 AM ET) using `node-cron`. It syncs injury data (ESPN API), starting lineups (API-Sports.io), fetches game schedules/scores (ESPN Scoreboard API), and processes completed games.
**Lineup Tracking System**: The `LineupSync` service fetches NBA starting lineups from API-Sports.io, updating game records with `awayStarters` and `homeStarters`. Lineups are typically available 30-60 minutes before tipoff.
**Injury Tracking System**: The `InjurySync` service fetches NBA injury data hourly from ESPN's public API, mapping statuses to canonical values and displaying them with color-coded badges in the frontend.
**Data Models**: Uses Drizzle ORM for PostgreSQL (though currently in-memory), with Zod for validation. Schemas include Games (matchup info, jump ball, tips, start times, starting lineups), Player Stats (player ID, team, position, games played, first basket occurrences, Q1 FGA Rate, Last 10 FB%, injury status, betting odds), and Team Stats (team ID, games played, first-to-score occurrences).

### Feature Specifications
- **Starting Lineup Filtering**: Player Stats page displays only starting players from today's games, dynamically updated.
- **Chronological Game Sorting**: Games are displayed in order of start time.
- **Automatic Lineup Updates**: Integrates with API-Sports.io for real-time starting lineup data, including identifying replacement starters.
- **Automatic Injury Tracking**: Hourly updates from ESPN NBA Injury API, with visual injury badges.
- **Advanced Analytics**: Includes Q1 FGA Rate and Last 10 Games FB% statistics.
- **Sportsbook Integration**: Displays sportsbook logos (FanDuel, DraftKings, BetMGM, Bet365, ESPN Bet) for odds.
- **Interactive Parlay Builder**: Calculates real-time probabilities for parlay combinations.

## External Dependencies

### UI Component Libraries
- **Radix UI**: Unstyled, accessible UI primitives.
- **shadcn/ui**: Pre-styled component system built on Radix UI.
- **Lucide React**: Icon library.

### Data Fetching and State Management
- **TanStack Query v5**: Server state management.
- **React Hook Form**: Form state management with Zod resolver.

### Styling and Design
- **Tailwind CSS**: Utility-first CSS framework.
- **class-variance-authority**: Type-safe variant styling.
- **clsx & tailwind-merge**: Conditional className utilities.

### Database and ORM
- **Drizzle ORM**: TypeScript ORM for PostgreSQL dialect.
- **Drizzle Zod**: Schema validation integration.
- **@neondatabase/serverless**: PostgreSQL driver (configured).
- **connect-pg-simple**: PostgreSQL session store for Express.

### Date Handling
- **date-fns**: Date manipulation and formatting.

### Development Tools
- **Vite**: Build tool and development server.
- **tsx**: TypeScript execution for development.
- **esbuild**: Production bundling for backend.

### Navigation
- **wouter**: Lightweight client-side routing library.

### Additional UI Utilities
- **cmdk**: Command menu.
- **embla-carousel-react**: Carousel component.
- **react-day-picker**: Calendar/date picker.
- **vaul**: Drawer component primitive.

### External APIs
- **API-Sports.io Basketball API**: For real-time starting lineup data. Requires `APISPORTS_KEY`.
- **ESPN NBA Injury API**: For NBA injury data.
- **ESPN Scoreboard API**: For daily game schedules and scores.