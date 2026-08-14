import { runInitialMigration } from '../lib/db';

async function main() {
  await runInitialMigration();
  console.log('Amy Brain Map PostgreSQL schema is ready.');
}

main().catch((error) => {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
});
