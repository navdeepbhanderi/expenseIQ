import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import {
  BudgetsService,
  type BudgetOverview,
  type CategoryNormLine,
} from './budgets.service';
import { MonthQueryDto, SetBudgetsDto } from './dto/budget.dto';

@ApiTags('budgets')
@ApiBearerAuth()
@Controller('profiles/:profileId/budgets')
@UseGuards(ProfileAccessGuard)
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Budgets and how much of each is used',
    description:
      'Overspend reports a percentage above 100 with zero remaining, rather ' +
      'than a negative "left" figure, which design 2a would render as a ' +
      'contradiction.',
  })
  overview(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: MonthQueryDto,
  ): Promise<BudgetOverview> {
    return this.budgets.overview(profileId, monthFrom(query.month));
  }

  @Put()
  @RequireAction('budget:manage')
  @ApiOperation({
    summary: 'Replace the month`s budgets',
    description:
      'PUT rather than PATCH because the design edits budgets as a set — a ' +
      'partial update would leave a category the user just cleared still ' +
      'budgeted. An amount of 0 removes a budget rather than storing a zero.',
  })
  set(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: MonthQueryDto,
    @Body() dto: SetBudgetsDto,
  ): Promise<BudgetOverview> {
    return this.budgets.setForMonth(profileId, monthFrom(query.month), dto);
  }

  @Get('norms')
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Per-category "usual" spend',
    description:
      'Design 3e\'s "74% of your usual ₹25,000 on groceries". Median of the ' +
      'last six complete months — a mean would let one wedding month redefine ' +
      'normal for the rest of the year. Returns isReliable: false below three ' +
      'months so the UI can stay quiet rather than sound confident.',
  })
  norms(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<CategoryNormLine[]> {
    return this.budgets.categoryNorms(profileId);
  }
}

function monthFrom(month: string | undefined): Date {
  return month ? new Date(`${month}-01T00:00:00.000Z`) : new Date();
}
