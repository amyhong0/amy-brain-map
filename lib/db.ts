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
  const migrationPath = path.join(process.cwd(), 'db', 'migrations', '001_multi_user_unconscious.sql');
  const source = await fs.readFile(migrationPath, 'utf8');
  const statements = source
    .replace(/^--.*$/gm, '')
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(statement, []);
  }
}
