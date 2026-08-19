import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  // Only let Drizzle manage tables declared in shared/schema.ts. The production
  // database also contains runtime-managed tables such as connect-pg-simple's
  // singular `session` table and the immutable MLB prediction/audit tables.
  // Without this filter, `drizzle-kit push` treats those valid tables as extra
  // schema and offers to delete them during every Render deploy.
  tablesFilter: [
    "games",
    "player_stats",
    "team_stats",
    "users",
    "sessions",
    "fb_tracking",
    "fb_processed_games",
    "mlb_prediction_history",
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
