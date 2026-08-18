import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import fs from 'fs/promises';
import path from 'path';

let client: NeonQueryFunction<false, false> | null = null;

export function database() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured. Connect the managed PostgreSQL database before using Amy Brain Map.');
  }
  if (!client) client = neon(connectionString);
  return client;
}

export async function runInitialMigration() {
  const sql = database();
  const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
  const migrationFiles = (await fs.readdir(migrationsDir))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right));

  for (const migrationFile of migrationFiles) {
    const source = await fs.readFile(path.join(migrationsDir, migrationFile), 'utf8');
    const statements = source
      .replace(/^--.*$/gm, '')
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.query(statement, []);
    }
  }
}
