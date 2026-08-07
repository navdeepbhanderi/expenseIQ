import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';
import {
  BudgetsService,
  type CategoryNormLine,
} from '@/modules/budgets/budgets.service';

import {
  ReportsService,
  type ComparisonReport,
  type ReportSummary,
} from './reports.service';
import { PeriodKindQueryDto } from './dto/reports.dto';

/** Backs the "Reports" item in design 2a's sidebar. */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('profiles/:profileId/reports')
@UseGuards(ProfileAccessGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly budgets: BudgetsService,
  ) {}

  @Get('summary')
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Totals for a month, quarter or year',
    description:
      'The per-day average divides by days *elapsed*, not days in the ' +
      'period — dividing August by 31 on the 5th under-reports it six-fold.',
  })
  summary(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: PeriodKindQueryDto,
  ): Promise<ReportSummary> {
    return this.reports.summary(profileId, query.period ?? 'month');
  }

  @Get('comparison')
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'This period against the last — design 6f\'s "↓ 8% vs July"',
    description:
      'Includes categories that disappeared this period. A subscription that ' +
      'stopped is the most interesting row on the screen, and listing only ' +
      'what is present this month would hide exactly that.',
  })
  comparison(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: PeriodKindQueryDto,
  ): Promise<ComparisonReport> {
    return this.reports.comparison(profileId, query.period ?? 'month');
  }

  @Get('category-norms')
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Per-category "usual" spend',
    description:
      'Design 3e\'s "74% of your usual ₹25,000 on groceries". Median of the ' +
      'complete months on record — a mean would let one wedding month ' +
      'redefine normal for the rest of the year. Returns isReliable: false ' +
      'below three months so the UI can stay quiet rather than sound sure.',
  })
  norms(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<CategoryNormLine[]> {
    return this.budgets.categoryNorms(profileId);
  }
}
