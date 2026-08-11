import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

/**
 * Prepares the dedicated test database before any integration test runs.
 *
 * The test Postgres is a separate container on its own port with a tmpfs
 * volume (see docker-compose.yml), so a test run can never touch dev data and
 * the database vanishes when the container stops.
 */
export default function globalSetup(): void {
  loadEnv();

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env and run ' +
        '`npm run db:up`.',
    );
  }

  // Guard against a copy-paste accident pointing the test DB at the dev DB.
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL must not equal DATABASE_URL - integration tests ' +
        'truncate every table.',
    );
  }

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testUrl;

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
