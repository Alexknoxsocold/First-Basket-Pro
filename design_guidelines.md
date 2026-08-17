# Design Guidelines: NBA First Basket PRO

## Design Approach

**Design System**: Linear/Vercel-inspired modern data dashboard approach
- Rationale: This is a utility-focused, information-dense application where data clarity and scannability are paramount
- Reference inspiration: Linear's clean tables, Vercel's dashboard hierarchy, sports betting platforms' data density
- Core principle: Maximum information density with minimal visual noise

## Typography System

**Font Stack**: 
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for numerical data, percentages, records)

**Hierarchy**:
- Page Title: text-2xl font-bold (First Basket PRO)
- Section Headers: text-lg font-semibold (Opening Tips, Player Stats, etc.)
- Table Headers: text-xs font-medium uppercase tracking-wide
- Data Cells: text-sm font-normal
- Percentage/Stats: text-sm font-mono (for alignment)
- Small Labels: text-xs

## Layout System

**Spacing Primitives**: Tailwind units 2, 4, 6, 8, 12, 16
- Table padding: p-4
- Section spacing: space-y-8
- Card gaps: gap-6
- Table cell padding: px-4 py-3

**Container Strategy**:
- Max width: max-w-7xl mx-auto
- Page padding: px-4 md:px-6 lg:px-8
- Tables: Full container width with horizontal scroll on mobile

## Component Library

### Navigation
Top navigation bar with dark background:
- Logo/Title (left): "First Basket PRO"
- Main nav items (center): All Games, Opening Tips, Player Stats, Team Stats, Parlays
- Season selector (right): Dropdown "2024/2025"
- Height: h-16 with centered content

### Data Tables (Core Component)
**Structure**:
- Sticky header row with dark background
- Alternating row backgrounds for scannability
- Border-bottom separators between rows
- Compact cell spacing for density
- Right-aligned numerical columns

**Column Types**:
- Team logos/names: Left-aligned with small team logo icon
- Player names: Left-aligned, font-medium
- Statistics/Percentages: Right-aligned, font-mono
- Win probabilities: Bold for emphasis
- H2H records: Small badge-style display

**Interactive States**:
- Row hover: Subtle background lift
- Clickable rows: Cursor pointer with slight scale
- Sort indicators: Small arrow icons in headers

### Game Cards (Alternative to table on mobile)
Compact card showing:
- Team matchup (away vs home)
- Projected jumpers with tip percentages
- First team to score probabilities
- H2H record badge
- Card padding: p-4, rounded-lg borders

### Filters & Controls
**Season Selector**: 
- Dropdown with current season highlighted
- Positioned in top-right of nav or page header

**Game Date Filter**:
- Horizontal date selector with today highlighted
- Previous/next day arrows
- Format: "Mon, Jan 20"

**View Toggle**:
- Table/Card view switch for mobile optimization
- Icon-based toggle buttons

### Stats Display Patterns

**Percentage Displays**:
- Large percentage (tip %, scoring %): text-lg font-mono font-bold
- Small percentage context: text-sm text-muted

**Win Probability Indicators**:
- Display as: "46%" with visual weight
- Higher percentages: Emphasized styling
- Add subtle progress bar background for quick scanning

**Player/Team Badges**:
- Small circular team logo: w-6 h-6
- Player initials for compact display
- Team abbreviations: text-xs font-bold uppercase

### Status Indicators
- H2H Record: Small pill badge (e.g., "0-1", "N/A")
- Live game indicator: Pulsing dot animation
- Data freshness: "Updated 2 min ago" small text

## Icons

**Library**: Heroicons (via CDN)
- Navigation: Menu, User, Settings
- Table actions: Sort arrows, Filter funnel
- Stats: Trophy, Target, TrendingUp
- UI: ChevronDown, Calendar, RefreshCw

## Responsive Strategy

**Desktop (lg+)**:
- Full data table with all columns visible
- Multi-column layout for stats summaries
- Horizontal navigation

**Tablet (md)**:
- Table with horizontal scroll
- Condensed columns (hide less critical data)
- Stacked navigation

**Mobile (base)**:
- Card-based game display
- Vertical stack of all elements
- Full-width components
- Hamburger menu navigation

## Data Visualization

**Probability Bars**:
- Thin horizontal bars behind percentage text
- Width represents probability value
- Subtle, low-opacity background fill

**Trend Indicators**:
- Small up/down arrows next to changing stats
- Use sparingly for key metrics only

## Critical Patterns

**Table Scannability**:
- Use zebra striping (alternate row backgrounds)
- Keep row height compact: h-12
- Use monospace for number columns to align decimals
- Bold the winning/higher probability values

**Information Density**:
- Maximize data per viewport
- Use abbreviations where clear (MEM, CLE, etc.)
- Compact spacing without feeling cramped
- Multi-line cells only when necessary

**Loading States**:
- Skeleton screens for table rows
- Shimmer animation on loading
- "Loading games..." text with spinner

## Images

**Minimal Image Usage** - This is a data-first application:
- Team logos: Small icons (20x20px) from NBA official sources
- Player headshots: Optional circular avatars in player stats view
- No hero images - lead with data table immediately
- Background: Clean, minimal patterns if any

## Special Considerations

**Real-Time Updates**:
- Auto-refresh indicator in header
- Highlight changed values briefly after update
- WebSocket connection status indicator

**Performance**:
- Virtualized tables for long lists (100+ games)
- Lazy load secondary stats
- Cache team logos and static assets

**Accessibility**:
- High contrast ratios for all text
- Sortable tables with keyboard navigation
- Screen reader labels for all data cells
- Focus indicators on interactive elements