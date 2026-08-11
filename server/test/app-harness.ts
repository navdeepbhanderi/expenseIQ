import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ThrottlerStorage,
  type ThrottlerStorageService,
} from '@nestjs/throttler';
import { config as loadEnv } from 'dotenv';

import { AppModule } from '@/app.module';
import { configureApp } from '@/bootstrap';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  close: () => Promise<void>;
  /** Truncates every table and clears accumulated rate-limit counters. */
  reset: () => Promise<void>;
  /** Clears rate-limit counters only, without touching data. */
  resetThrottle: () => void;
}

/**
 * Boots the real application against the test database.
 *
 * Deliberately not a mock: the point of these tests is to exercise the guards,
 * pipes, filters and actual SQL. The HTTP pipeline comes from the same
 * `configureApp()` that main.ts uses, so the two cannot drift - which they did
 * once, when cookieParser lived only in main.ts and every cookie-based refresh
 * silently 401'd under test while working fine in the real app.
 */
export async function createHarness(): Promise<Harness> {
  loadEnv();
  process.env.NODE_ENV = 'test';
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);

  await app.init();

  const prisma = app.get(PrismaService);

  /**
   * Rate-limit counters are process state, not database state, so truncating
   * tables doesn't clear them. Without this the auth suite exhausts the
   * 10-per-minute limit partway through and every later test 429s.
   *
   * Cleared rather than raised, deliberately: the tests run against the same
   * limits production uses, so a test can still prove throttling fires.
   */
  const resetThrottle = (): void => {
    const storage = app.get<ThrottlerStorageService>(ThrottlerStorage, {
      strict: false,
    });
    storage.storage?.clear();
  };

  return {
    app,
    prisma,
    resetThrottle,
    reset: async () => {
      await prisma.truncateAll();
      resetThrottle();
    },
    close: async () => {
      await app.close();
    },
  };
}
