import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppLogger } from '@/common/logger/app-logger.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly logger: AppLogger) {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    this.logger.setContext('Prisma');
  }

  async onModuleInit(): Promise<void> {
    // Route Prisma's own diagnostics through the structured logger rather than
    // letting it write unstructured lines straight to stdout.
    this.$on('warn' as never, (event: { message: string }) => {
      this.logger.warn(event.message);
    });
    this.$on('error' as never, (event: { message: string }) => {
      this.logger.error(event.message);
    });

    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Truncates every table. Integration tests only — guarded so a misconfigured
   * DATABASE_URL can never wipe a real database.
   */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAll() is only available when NODE_ENV=test');
    }

    const tables = await this.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;

    if (tables.length === 0) return;

    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  }
}
