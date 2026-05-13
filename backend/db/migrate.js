/**
 * ============================================================================
 * Database Migration System
 * Manages schema versioning and upgrades for cloud database
 *
 * Usage:
 *   node backend/db/migrate.js up    -- Run all pending migrations
 *   node backend/db/migrate.js down  -- Rollback last migration
 *   node backend/db/migrate.js status -- Show migration status
 * ============================================================================
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "lab_guard_cloud",
});

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Color codes
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

const log = {
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[✓]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[✗]${colors.reset} ${msg}`),
};

/**
 * Initialize migrations table if it doesn't exist
 */
async function initMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

/**
 * Get list of migration files
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".js"))
    .sort();
}

/**
 * Get executed migrations
 */
async function getExecutedMigrations() {
  const result = await pool.query(
    "SELECT name FROM migrations ORDER BY executed_at",
  );
  return result.rows.map((r) => r.name);
}

/**
 * Run all pending migrations
 */
async function runMigrationsUp() {
  try {
    await initMigrationsTable();

    const files = getMigrationFiles();
    const executed = await getExecutedMigrations();

    const pending = files.filter((f) => !executed.includes(f));

    if (pending.length === 0) {
      log.success("No pending migrations");
      return;
    }

    for (const file of pending) {
      log.info(`Running migration: ${file}`);

      const migrationPath = path.join(MIGRATIONS_DIR, file);
      const migration = require(migrationPath);

      // Run up migration
      await pool.query("BEGIN");
      try {
        await migration.up(pool);
        await pool.query("INSERT INTO migrations (name) VALUES ($1)", [file]);
        await pool.query("COMMIT");
        log.success(`Migration completed: ${file}`);
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
    }

    log.success("All migrations completed successfully");
  } catch (err) {
    log.error(`Migration failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Rollback last migration
 */
async function rollbackLastMigration() {
  try {
    await initMigrationsTable();

    const executed = await getExecutedMigrations();

    if (executed.length === 0) {
      log.warn("No migrations to rollback");
      return;
    }

    const lastMigration = executed[executed.length - 1];
    log.info(`Rolling back migration: ${lastMigration}`);

    const migrationPath = path.join(MIGRATIONS_DIR, lastMigration);
    const migration = require(migrationPath);

    await pool.query("BEGIN");
    try {
      if (migration.down) {
        await migration.down(pool);
      }
      await pool.query("DELETE FROM migrations WHERE name = $1", [
        lastMigration,
      ]);
      await pool.query("COMMIT");
      log.success(`Rollback completed: ${lastMigration}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    log.error(`Rollback failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Show migration status
 */
async function showStatus() {
  try {
    await initMigrationsTable();

    const files = getMigrationFiles();
    const executed = await getExecutedMigrations();

    console.log("\nMigration Status:\n");
    console.log("Executed Migrations:");
    if (executed.length === 0) {
      console.log("  (none)");
    } else {
      executed.forEach((m) => {
        console.log(`  ${colors.green}✓${colors.reset} ${m}`);
      });
    }

    console.log("\nPending Migrations:");
    const pending = files.filter((f) => !executed.includes(f));
    if (pending.length === 0) {
      console.log("  (none)");
    } else {
      pending.forEach((m) => {
        console.log(`  ${colors.yellow}○${colors.reset} ${m}`);
      });
    }
    console.log("");
  } catch (err) {
    log.error(`Status check failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// CLI
const command = process.argv[2];

switch (command) {
  case "up":
    runMigrationsUp();
    break;
  case "down":
    rollbackLastMigration();
    break;
  case "status":
    showStatus();
    break;
  default:
    console.log(`
Usage:
  node backend/db/migrate.js up     -- Run all pending migrations
  node backend/db/migrate.js down   -- Rollback last migration
  node backend/db/migrate.js status -- Show migration status
    `);
    process.exit(0);
}
