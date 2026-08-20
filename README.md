# PreziPicks / First Basket Pro

A full-stack sports analytics application focused on first-basket prediction for basketball and NRFI/YRFI prediction for MLB.

This project was built as a real working product rather than a static demo. It combines live sports data, model scoring, historical outcomes, calibration, admin tooling, background sync services, and a responsive web interface.

## Live product

- Production app: https://first-basket-pro.onrender.com
- Main sports coverage: WNBA / NBA first-basket analytics and MLB NRFI/YRFI analytics

## What this project demonstrates

This repository is a portfolio project in full-stack development, data engineering, model evaluation, and production operations.

Key areas covered:

- React + TypeScript frontend
- Express + TypeScript backend
- PostgreSQL / Neon data storage
- Drizzle ORM
- External sports API integrations
- Prediction pipelines and confidence scoring
- Historical grading and model calibration
- Research-vs-production isolation
- Authentication and admin-only workflows
- Background data synchronization
- CI checks with GitHub Actions
- Production deployment on Render
- Responsive mobile UI

## Product architecture

```text
Sports APIs
   |
   v
Data ingestion / sync services
   |
   v
PostgreSQL / Neon
   |
   +--> historical outcomes / model grading
   |
   v
Prediction services
   |
   +--> WNBA / NBA first-basket analytics
   +--> MLB NRFI / YRFI analytics
   |
   v
Express API
   |
   v
React frontend
   |
   v
User-facing predictions, confidence, factors, and results
```

## Frontend

The client is built with React, TypeScript, Vite, Tailwind CSS, Radix UI components, TanStack Query, and Recharts.

The UI includes league pages, prediction cards, best-play views, results, model context, responsive mobile layouts, and admin tooling.

## Backend

The server is built with Express and TypeScript.

Responsibilities include:

- sports data ingestion
- prediction generation
- historical outcome tracking
- model calibration
- admin authentication
- API endpoints
- background synchronization
- database access

The app uses session-based authentication and PostgreSQL-backed persistence.

## MLB NRFI / YRFI modeling

The MLB pipeline is designed around first-inning run probability rather than simple win/loss prediction.

The model combines signals such as:

- recent first-inning team performance
- league NRFI baseline
- starting pitcher ERA and WHIP
- first-inning run tendencies
- recency weighting
- Bayesian shrinkage for small samples
- Poisson-based run modeling
- confidence and data-quality checks
- calibration against graded outcomes

A separate V4-style research layer is used to test stronger modeling ideas before production changes are considered.

### Research discipline

A major design principle in this project is that model changes should not be promoted just because they look better on recent winners.

The research workflow uses:

- historical backfills
- walk-forward testing
- holdout evaluation
- calibration checks
- confidence-bucket analysis
- research database branches isolated from production

Some candidate model improvements were intentionally rejected after failing to hold up on unseen historical data. That is part of the project: the goal is not to maximize the number of predictions, but to improve decision quality without overfitting.

## Basketball first-basket analytics

The basketball side of the product tracks player and team context used to estimate first-basket probabilities and rank candidates.

The application also records completed outcomes so future model changes can be evaluated against real historical evidence rather than anecdotal results.

## Best Plays philosophy

The league pages can show broader model coverage, while the Best Plays experience is intended to surface only stronger independently qualified recommendations.

The system is designed so qualification comes from model rules and evidence, not from manually forcing a fixed number of picks onto the page.

## Competitor benchmark research

A separate research effort is being developed to compare PreziPicks predictions against publicly posted competitor projections.

The purpose is not to copy outside predictions into the production model. Instead, competitor predictions can be timestamped, graded, and compared over a meaningful sample size to answer questions such as:

- how well are outside confidence percentages calibrated?
- where do competitors outperform or underperform?
- when two independent models agree, does performance improve?
- are there underlying variables worth researching in the internal model?

This benchmark is intentionally kept separate from production model training unless future evidence justifies further testing.

## Database and research isolation

Neon PostgreSQL is used for persistent application data.

Research work is performed on isolated database branches when possible so experiments do not contaminate production data. This has been especially important for historical MLB backtesting and model-validation work.

## CI and deployment

The project uses GitHub Actions to validate changes with dependency installation, TypeScript checks, and production builds.

Production is deployed through Render.

A typical validation path is:

```bash
npm ci
npm run check
npm run build
```

## Local development

### Requirements

- Node.js 22
- PostgreSQL-compatible database

### Install

```bash
npm ci
```

### Environment

Copy the example environment file and provide the required values:

```bash
cp .env.example .env
```

Never commit production secrets or database credentials.

### Run locally

```bash
npm run dev
```

### Type check

```bash
npm run check
```

### Production build

```bash
npm run build
```

## Tech stack

**Frontend**

React, TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Query, Recharts, Framer Motion

**Backend**

Node.js, Express, TypeScript, Zod, session authentication

**Data**

PostgreSQL, Neon, Drizzle ORM

**Tooling / Infrastructure**

GitHub, GitHub Actions, Render, npm, esbuild

## Engineering lessons from the project

This project has required work beyond writing individual features. Examples include:

- resolving Git conflicts and rebases
- protecting production while testing research changes
- designing fallback behavior for external APIs
- separating model confidence from model accuracy
- avoiding historical data leakage
- testing thresholds on holdout samples
- deciding not to ship changes when evidence was weak
- maintaining mobile and desktop usability
- working with production environment variables and secrets

## AI-assisted development

AI-assisted development is part of the engineering workflow used on this project.

I use AI to accelerate implementation, debugging, code review, research, and iteration while remaining responsible for product requirements, architecture decisions, testing, model evaluation, deployment decisions, and final verification.

The goal is not to treat generated code as automatically correct. Changes are reviewed against the application behavior, tested, and evaluated before they are accepted.

## Current direction

The project is continuing to accumulate real prediction outcomes so future improvements can be based on larger samples rather than short-term results.

Current priorities include:

- collecting more graded WNBA and MLB outcomes
- improving probability calibration only when evidence supports it
- expanding historical research safely
- benchmarking outside models without contaminating production
- improving mobile usability
- building a stronger long-term evidence base for model decisions

## Project status

Active development.

This repository represents an evolving production analytics product and an ongoing data/modeling learning project.