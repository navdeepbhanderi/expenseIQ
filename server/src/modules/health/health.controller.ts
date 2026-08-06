import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@/infra/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ description: 'The process is up' })
  liveness(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /**
   * Readiness actually touches the database. A liveness check that only
   * proves the event loop is turning will happily report "healthy" while
   * every request 500s on a dead connection pool.
   */
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe — verifies datastore reachability',
  })
  async readiness(): Promise<{
    status: 'ok' | 'degraded';
    checks: Record<string, 'up' | 'down'>;
  }> {
    const database = await this.probeDatabase();

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      checks: { database },
    };
  }

  private async probeDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
