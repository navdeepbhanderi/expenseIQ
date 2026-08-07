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
  DashboardService,
  addMonths,
  startOfMonth,
  type CategorySlice,
  type DashboardSummary,
} from './dashboard.service';
import { PeriodQueryDto, TrendQueryDto } from './dto/dashboard.dto';
import { MonthQueryDto } from '@/modules/budgets/dto/budget.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('profiles/:profileId/dashboard')
@UseGuards(ProfileAccessGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Everything design 2a and 4c render, in one call',
    description:
      'Month spend and income, budget status, month-over-month delta, top ' +
      'categories, upcoming dues, pending review count, accounts, net worth ' +
      'and recent transaction ids. One request so the numbers cannot ' +
      'disagree with each other mid-load.',
  })
  summary(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<DashboardSummary> {
    return this.dashboard.summary(profileId);
  }

  @Get('spend-by-category')
  @RequireAction('transaction:view')
  @ApiOperation({ summary: 'Category breakdown for a period' })
  spendByCategory(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: PeriodQueryDto,
  ): Promise<CategorySlice[]> {
    const from = query.from ? new Date(query.from) : startOfMonth(new Date());
    const to = query.to ? new Date(query.to) : new Date();
    return this.dashboard.spendByCategory(profileId, from, to);
  }

  @Get('trend')
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Income vs expense by month',
    description:
      'Months with no activity come back as zeros rather than being omitted, ' +
      'so the chart line does not jump over them.',
  })
  trend(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: TrendQueryDto,
  ) {
    return this.dashboard.trend(profileId, query.months ?? 6);
  }

  @Get('net-worth')
  @RequireAction('account:view')
  @ApiOperation({
    summary: 'Assets minus liabilities',
    description:
      'Cards and loans contribute their current outstanding, so the figure ' +
      'improves with every EMI paid. Negative early in a home loan is correct.',
  })
  async netWorth(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return (await this.dashboard.summary(profileId)).netWorth;
  }

  @Get('upcoming-dues')
  @RequireAction('account:view')
  @ApiOperation({ summary: 'Design 2a\'s "Needs your eye" strip' })
  async upcomingDues(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return (await this.dashboard.summary(profileId)).upcomingDues;
  }

  @Get('calendar')
  @RequireAction('account:view')
  @ApiOperation({
    summary: "Days in a month that carry a bill — design 6d's popover markers",
  })
  calendar(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: MonthQueryDto,
  ) {
    const month = query.month
      ? new Date(`${query.month}-01T00:00:00.000Z`)
      : addMonths(startOfMonth(new Date()), 0);
    return this.dashboard.dueDatesInMonth(profileId, month);
  }
}
