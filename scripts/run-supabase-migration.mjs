#!/usr/bin/env node
/**
 * Runs the school_adjustment_submissions migration against your Supabase DB.
 * Loads .env from project root. Uses SUPABASE_DB_URL or DATABASE_URL.
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL or DATABASE_URL. Use your Supabase database URL (Settings → Database → Connection string).');
  process.exit(1);
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.error('No migration files found in supabase/migrations.');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  for (const file of migrationFiles) {
    const fullPath = join(migrationsDir, file);
    const sql = readFileSync(fullPath, 'utf8');
    await client.query(sql);
    console.log(`Applied migration: ${file}`);
  }
  console.log('Supabase migrations complete.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
