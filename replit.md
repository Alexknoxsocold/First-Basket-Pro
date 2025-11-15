# NBA First Basket PRO

## Overview

NBA First Basket PRO is a sports analytics web application that provides predictions and statistical insights for NBA first basket scenarios. The application tracks opening tip statistics, player performance metrics, team scoring probabilities, and suggests optimal parlay combinations. It serves as a data-intensive dashboard for analyzing first basket opportunities across NBA games, with a focus on clarity and information density.

## Recent Changes

**November 15, 2025** - Initial MVP Complete
- Built complete frontend with 5 main pages: All Games, Opening Tips, Player Stats, Team Stats, and Parlays
- Implemented backend API routes serving game data, player statistics, and team statistics
- Connected frontend to backend using React Query for data fetching
- Added search functionality for player and team stats pages
- Created interactive parlay builder with real-time probability calculations
- Implemented dark/light mode theme toggle
- Seeded in-memory storage with realistic NBA game and statistics data
- All features tested and verified working end-to-end

**Current Status**: Fully functional MVP with in-memory data storage. Ready for integration with live NBA stats APIs (BALLDONTLIE or NBA Stats API recommended).

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
- GET /api/games - Retrieve all games
- GET /api/games/:date - Retrieve games by date
- GET /api/player-stats - Retrieve all player statistics
- GET /api/player-stats/:id - Retrieve specific player stat
- GET /api/team-stats - Retrieve all team statistics
- GET /api/team-stats/:team - Retrieve specific team stat

**Server Features**: Custom logging middleware for API requests, JSON request parsing with raw body preservation, Vite integration for development with HMR support.

### Data Models

**Database Schema** (defined with Drizzle ORM):

**Games Table**:
- Matchup information (away/home teams)
- Player jump ball participants
- Opening tip statistics (count, win percentage)
- First-to-score probabilities
- Head-to-head records
- Game dates

**Player Stats Table**:
- Player identification (name, team)
- Games played count
- First basket occurrences
- Success percentage
- Average tip win rate

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