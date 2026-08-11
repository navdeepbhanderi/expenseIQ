import path from 'node:path';
// Prisma config files are loaded outside the app, so nothing has populated
// process.env yet - without this, DATABASE_URL is undefined and every
// migrate/seed command fails with a confusing "environment variable not found".
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Replaces the deprecated `package.json#prisma` block, which Prisma 7 removes.
 *
 * Only the seed command lives here. Datasource configuration stays in
 * `schema.prisma`, which reads DATABASE_URL directly - keeping the connection
 * string in one place rather than two.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'ts-node -r tsconfig-paths/register prisma/seed.ts',
  },
});
