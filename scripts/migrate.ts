import { loadEnvConfig } from '@next/env';
import { runInitialMigration } from '../lib/db';

// `ts-node`로 실행되는 마이그레이션은 Next.js 개발 서버를 거치지 않으므로,
// 프로젝트 루트의 .env.local 값을 명시적으로 읽는다.
loadEnvConfig(process.cwd());

async function main() {
  await runInitialMigration();
  console.log('Amy Brain Map PostgreSQL schema is ready.');
}

main().catch((error) => {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
});
