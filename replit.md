# NBA First Basket PRO

## Overview
NBA First Basket PRO is a sports analytics web application providing predictions and statistical insights for NBA first basket scenarios. It tracks opening tip statistics, player performance, team scoring probabilities, and suggests optimal parlay combinations. The application functions as a data-intensive dashboard for analyzing first basket opportunities, focusing on clarity and information density. It is fully functional with a comprehensive daily automation system, including automatic injury tracking, real-time lineup updates via API-Sports.io, daily game schedule/score synchronization, and data persistence for completed games, integrating with the ESPN API.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Bug Fixes (November 2025)
**Date Sync Bug Fix (11/16/2025)**: Fixed critical bug where daily sync was not explicitly fetching TODAY's date, causing ESPN API to return default (yesterday's) games instead of today's schedule. Now explicitly passes today's date to ESPN API. Also fixed gameDate persistence issue where games marked "Today" would never update to actual dates - added cleanup step that runs daily to convert old "Today" values to canonical ISO format (YYYY-MM-DD). Fixed game matching to use ESPN game ID as primary key with date+team fallback, preventing duplicate games on back-to-back matchups. Added automatic lineup sync every 30 minutes during game hours (9 AM-11 PM ET) to ensure lineups update throughout the day as they become available.

## System Architecture

### UI/UX Decisions
The application employs a Linear/Vercel-inspired modern data dashboard design, prioritizing maximum information density and minimal visual noise. Typography uses Inter for primary content and JetBrains Mono for numerical data. The layout utilizes Tailwind's spacing primitives with a max-width container strategy. All data tables feature sticky headers, alternating row backgrounds, and responsive design with horizontal scroll on mobile. The UI is built with `shadcn/ui` components on `Radix UI` primitives, styled with `Tailwind CSS`.

### Technical Implementations
**Frontend**: Developed with React 18 and TypeScript, using Wouter for routing and TanStack Query for server state management. Key pages include All Games, Opening Tips, Player Stats, Team Stats, Parlays, Admin, Login, and Signup.
**Backend**: Implemented with Express.js and TypeScript, using ES Modules and esbuild for production bundling. Data is currently stored in-memory via a `MemStorage` class, abstracting data access for future database migration. Express configured with `trust proxy` for correct HTTPS detection behind reverse proxies.
**Authentication System**: Custom email/password authentication with bcrypt password hashing and secure cookie-based sessions. All pages require authentication - users must sign up or log in to access any content. Sessions expire after 30 days. Cookie security adapts to deployment environment (httpOnly, sameSite: 'lax', secure flag based on HTTPS detection via req.secure or x-forwarded-proto header). AuthContext provides login/signup/logout functions and manages session state with AbortController to prevent memory leaks. ProtectedRoute component wraps all pages except /signup and /login, redirecting unauthenticated users to signup.
**API Endpoints**: RESTful endpoints under `/api` provide game data, player statistics (including injury status and today's starters), team statistics, and lineup updates. Authentication endpoints at `/api/auth` handle signup, login, logout, and session verification. Manual trigger endpoints exist for syncing injuries, lineups, and a comprehensive daily sync. The `PUT /api/games/:id/lineups` endpoint is protected with authentication middleware and supports manual lineup management with comprehensive validation (type checking, duplicate detection, whitespace trimming).
**Daily Sync System**: A `DailySyncService` orchestrates nightly data updates (12:30 AM ET) using `node-cron`. The sync runs in 6 steps: (0) Cleanup yesterday's games by updating "Today" dates to actual dates, (1) Sync injury data from ESPN API, (2) Sync starting lineups from API-Sports.io, (3) Fetch TODAY's game schedule from ESPN with explicit date parameter, (4) Process completed games and update scores, (5) Process today's upcoming games and create new ones if needed, (6) Fetch and process tomorrow's games. This ensures games are always created on time and dates stay accurate. Additionally, lineup sync runs automatically every 30 minutes from 9 AM to 11 PM ET to capture lineups as they're released throughout the day.
**Lineup Tracking System**: The `LineupSync` service fetches NBA starting lineups from API-Sports.io, updating game records with `awayStarters` and `homeStarters`. Lineups are typically available 30-60 minutes before tipoff. **Admin Lineup Manager**: A manual UI at `/admin` enables click-based lineup management for today's games when API data is unavailable or needs correction. Features team-filtered player selection, duplicate prevention, and real-time validation.
**Injury Tracking System**: The `InjurySync` service fetches NBA injury data hourly from ESPN's public API, mapping statuses to canonical values and displaying them with color-coded badges in the frontend.
**Data Models**: Uses Drizzle ORM for PostgreSQL (though currently in-memory), with Zod for validation. Schemas include Users (id, email, passwordHash, role, createdAt), Sessions (sessionToken, userId, expiresAt), Games (matchup info, jump ball, tips, start times, starting lineups), Player Stats (player ID, team, position, games played, first basket occurrences, Q1 FGA Rate, Last 10 FB%, injury status, betting odds), and Team Stats (team ID, games played, first-to-score occurrences).

### Feature Specifications
- **Custom Authentication**: Email/password authentication with secure session management. All pages require authentication - users must sign up or log in before accessing any content.
- **Starting Lineup Filtering**: Player Stats page displays only starting players from today's games, dynamically updated.
- **Chronological Game Sorting**: Games are displayed in order of start time.
- **Automatic Lineup Updates**: Integrates with API-Sports.io for real-time starting lineup data, including identifying replacement starters.
- **Manual Lineup Management**: Admin UI at `/admin` provides click-based lineup editing with team-filtered player dropdowns, client-side duplicate prevention, and backend validation (type checking, duplicate detection, trimming).
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

### Authentication and Security
- **bcrypt**: Password hashing (10 rounds).
- **cookie-parser**: Cookie parsing middleware for Express.
- **Custom session management**: Cookie-based sessions with 30-day expiration.

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