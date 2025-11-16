# NBA First Basket PRO

## Overview

NBA First Basket PRO is a sports analytics web application that provides predictions and statistical insights for NBA first basket scenarios. The application tracks opening tip statistics, player performance metrics, team scoring probabilities, and suggests optimal parlay combinations. It serves as a data-intensive dashboard for analyzing first basket opportunities across NBA games, with a focus on clarity and information density.

## Recent Changes

**November 16, 2025** - Starting Lineup Filtering + Chronological Game Sorting
- **Starting Lineup Filtering**: Player Stats page now displays only starting players from today's games
  - Added `awayStarters` and `homeStarters` arrays to game schema (5 players per team)
  - Created GET /api/today-starters endpoint that filters playerStats by starting lineups
  - Player Stats page shows exactly 50 starters (5 games × 2 teams × 5 players)
  - Updated page title to "Today's Starting Lineups - First Basket Stats"
  - Each matchup displays only the 5 starters per team (no bench players)
  - All 50 starters have complete playerStats entries with realistic statistics
- **Chronological Game Sorting**: Games now display in order by start time
  - Added `gameTime` field to game schema (ISO 8601 timestamp)
  - GET /api/games endpoint sorts by gameTime in ascending order
  - Games display earliest to latest (7:00 PM → 7:30 PM → 8:00 PM → 10:00 PM → 11:00 PM ET)
  - All Games page automatically shows games chronologically
- **Daily Sync System**: Implemented comprehensive DailySyncService that orchestrates all daily data updates
  - Fetches daily game schedules/scores from ESPN Scoreboard API (free, no auth required)
  - Processes completed games and identifies final scores
  - Updates upcoming games for next day's slate
  - Runs automatically at 12:30 AM ET every night via node-cron scheduler
  - Manual trigger endpoint: POST /api/sync/daily
  - Integrates with existing injury sync system for complete daily refresh
  - Note: ESPN free API does not provide starting lineups; lineups must be manually seeded or obtained from third-party APIs
- **Q1 FGA% Color Grading**: Added color-coded visual feedback to Q1 FGA Rate column
  - Green (≥20%): High first quarter shot attempts
  - Yellow (12-19%): Medium first quarter shot attempts
  - Red (<12%): Low first quarter shot attempts
  - Fixed zero-value handling across all percentage columns (Q1 FGA%, L10 FB%)
- **Automatic Injury Tracking**: Implemented using ESPN NBA Injury API (free, no auth required)
  - Added three new player stat fields: injuryStatus, injuryNote, lastUpdated
  - Created InjurySync service that fetches and updates injury data every hour
  - Visual injury badges on Player Stats page (red=OUT, yellow=QUESTIONABLE, gray=DAY-TO-DAY)
  - Robust error handling: preserves existing data if ESPN API fails
  - Canonical status mapping with raw ESPN status fallback for unmapped injury types
  - Manual sync endpoint: POST /api/sync-injuries
  - Currently tracking 13 injured players from 98 total ESPN injury reports
- **Advanced Analytics**: Added Q1 FGA Rate and Last 10 Games FB% statistics
- **Sportsbook Integration**: Integrated logos (FanDuel, DraftKings, BetMGM, Bet365, ESPN Bet) for odds display

**November 15, 2025** - Initial MVP Complete
- Built complete frontend with 5 main pages: All Games, Opening Tips, Player Stats, Team Stats, and Parlays
- Implemented backend API routes serving game data, player statistics, and team statistics
- Connected frontend to backend using React Query for data fetching
- Added search functionality for player and team stats pages
- Created interactive parlay builder with real-time probability calculations
- Implemented dark/light mode theme toggle
- Seeded in-memory storage with realistic NBA game and statistics data
- All features tested and verified working end-to-end

**Current Status**: Fully functional with comprehensive daily automation system. Features automatic injury tracking (hourly updates), daily game schedule/score sync (12:30 AM ET), data persistence for completed games, and ESPN API integration. All sync operations resilient with robust error handling.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query (React Query) for server state
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system

**Design Philosophy**: The application follows a Linear/Vercel-inspired modern data dashboard approach prioritizing maximum information density with minimal visual noise. Typography uses Inter for primary content and JetBrains Mono for numerical data to ensure proper alignment. The layout system utilizes Tailwind's spacing primitives (2, 4, 6, 8, 12, 16) with a max-width container strategy (max-w-7xl).

**Key Pages**:
- All Games: Overview dashboard with statistics cards and games table
- Opening Tips: Focused view on jump ball predictions
- Player Stats: Searchable player performance metrics
- Team Stats: Searchable team-level statistics
- Parlays: Interactive parlay builder with percentage-based recommendations

**Component Structure**: Components are organized into reusable UI primitives (ui/), domain-specific components (GameRow, GamesTable, PlayerStatsTable, TeamStatsTable), and layout components (Header, Navigation). All data tables feature sticky headers, alternating row backgrounds for scannability, and responsive design with horizontal scroll on mobile.

### Backend Architecture

**Framework**: Express.js with TypeScript
- **Module System**: ES Modules (type: "module")
- **Build Tool**: esbuild for production bundling
- **Development**: tsx for TypeScript execution
- **API Structure**: RESTful endpoints under /api prefix

**Data Layer**: Currently implemented with in-memory storage (MemStorage class) with seeded mock data. The storage interface (IStorage) abstracts data access, allowing easy migration to a database implementation.

**API Endpoints**:
- GET /api/games - Retrieve all games (sorted by gameTime chronologically)
- GET /api/games/:date - Retrieve games by date
- GET /api/player-stats - Retrieve all player statistics (includes injury status)
- GET /api/today-starters - Retrieve only starting players from today's games
- GET /api/player-stats/:id - Retrieve specific player stat
- GET /api/team-stats - Retrieve all team statistics
- GET /api/team-stats/:team - Retrieve specific team stat
- POST /api/sync-injuries - Manually trigger injury data sync from ESPN
- POST /api/sync/daily - Manually trigger comprehensive daily sync (games + injuries)

**Server Features**: Custom logging middleware for API requests, JSON request parsing with raw body preservation, Vite integration for development with HMR support, automatic injury sync service running hourly, daily sync system running at 12:30 AM ET.

**Daily Sync System**: DailySyncService orchestrates comprehensive nightly data updates using node-cron scheduler. The system runs automatically at 12:30 AM ET (America/New_York timezone) and performs the following operations:
1. Syncs injury data via InjurySync service
2. Fetches current day's games from ESPN Scoreboard API
3. Processes completed games and updates final scores
4. Fetches next day's upcoming games
5. Updates game schedules and predictions

The service uses ESPN's free public Scoreboard API endpoint (`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`) with optional date parameters. Robust error handling ensures individual failures don't crash the entire sync process. Manual sync available via POST /api/sync/daily endpoint.

**Injury Tracking System**: InjurySync service fetches NBA injury data from ESPN's public API every hour. The system uses canonical status mapping (OUT, QUESTIONABLE, DAY-TO-DAY) with fallback to raw ESPN statuses for unmapped injury types. Robust error handling preserves existing injury data if the ESPN API fails, and distinguishes between API failures vs. legitimate zero-injury responses. The frontend displays color-coded injury badges on the Player Stats page.

### Data Models

**Database Schema** (defined with Drizzle ORM):

**Games Table**:
- Matchup information (away/home teams)
- Player jump ball participants
- Opening tip statistics (count, win percentage)
- First-to-score probabilities
- Head-to-head records
- Game dates and start times
- Starting lineups (awayStarters, homeStarters arrays with 5 players each)

**Player Stats Table**:
- Player identification (name, team, position)
- Games played count
- First basket occurrences
- Success percentage
- Average tip win rate
- Q1 FGA Rate (first quarter field goal attempt percentage)
- Last 10 Games First Basket % (recent form indicator)
- Injury tracking (status: OUT/QUESTIONABLE/DAY-TO-DAY/HEALTHY, note, lastUpdated)
- Betting odds with sportsbook logos (FanDuel, DraftKings, BetMGM, Bet365, ESPN Bet)

**Team Stats Table**:
- Team identification
- Games played count
- First-to-score occurrences
- Success percentage
- Average opening points

**Schema Philosophy**: The schema uses Drizzle Zod for validation, providing type-safe insert schemas. Primary keys use UUID generation. All percentage fields store integer or real values for precise calculations.

### Build and Development Configuration

**Vite Configuration**: Custom setup with React plugin, path aliases (@, @shared, @assets), runtime error overlay for development, and Replit-specific plugins (cartographer, dev-banner) in development mode. Build output targets dist/public with strict file system security.

**TypeScript Configuration**: Strict mode enabled, ES modules, bundler module resolution, path mapping for clean imports. Includes client, shared, and server directories with comprehensive type checking.

**Development Workflow**: npm run dev starts development server with Vite middleware. npm run build creates production bundle with Vite frontend build and esbuild backend bundle. npm run start runs production build.

## External Dependencies

### UI Component Libraries
- **Radix UI**: Comprehensive set of unstyled, accessible UI primitives (accordion, dialog, dropdown-menu, select, tabs, toast, tooltip, etc.)
- **shadcn/ui**: Pre-styled component system built on Radix UI with "new-york" style variant
- **Lucide React**: Icon library for consistent iconography

### Data Fetching and State Management
- **TanStack Query v5**: Server state management with automatic caching, background refetching disabled, infinite stale time for static sports data
- **React Hook Form**: Form state management with Zod resolver integration

### Styling and Design
- **Tailwind CSS**: Utility-first CSS framework with custom theme extension
- **class-variance-authority**: Type-safe variant styling for component APIs
- **clsx & tailwind-merge**: Conditional className utilities

### Database and ORM
- **Drizzle ORM**: TypeScript ORM configured for PostgreSQL dialect
- **Drizzle Zod**: Schema validation integration
- **@neondatabase/serverless**: PostgreSQL driver for Neon database (configured but not yet active)
- **connect-pg-simple**: PostgreSQL session store for Express

### Date Handling
- **date-fns**: Date manipulation and formatting library

### Development Tools
- **Vite**: Build tool and development server
- **@vitejs/plugin-react**: React integration for Vite
- **@replit/vite-plugin-runtime-error-modal**: Development error overlay
- **@replit/vite-plugin-cartographer**: Replit-specific development tooling
- **tsx**: TypeScript execution for development
- **esbuild**: Production bundling for backend code

### Navigation
- **wouter**: Lightweight routing library (~1.2KB) for client-side navigation

### Additional UI Utilities
- **cmdk**: Command menu component
- **embla-carousel-react**: Carousel component
- **react-day-picker**: Calendar/date picker component
- **vaul**: Drawer component primitive

### Development Configuration
Database connection expects DATABASE_URL environment variable for PostgreSQL connection. Drizzle migrations stored in ./migrations directory with schema defined in shared/schema.ts.