import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Allowance, ProfileInvite, ProfileMember } from '@prisma/client';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/common/types/express';
import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import { FamilyService, type MemberView } from './family.service';
import {
  SpendLimitsService,
  type SpendLimitOverview,
} from './spend-limits.service';
import { AllowancesService, type AllowanceStatus } from './allowances.service';
import { GoalsService, type GoalView } from './goals.service';
import {
  FamilyDashboardService,
  type FamilyDashboard,
} from './family-dashboard.service';
import {
  AcceptInviteDto,
  ChangeRoleDto,
  ContributeDto,
  CreateGoalDto,
  InviteMemberDto,
  SetAllowanceDto,
  SetSpendLimitsDto,
  UpdateGoalDto,
} from './dto/family.dto';

/** Accepting an invite is not profile-scoped — you aren't a member yet. */
@ApiTags('family')
@ApiBearerAuth()
@Controller('family')
export class FamilyInviteController {
  constructor(
    private readonly family: FamilyService,
    private readonly dashboard: FamilyDashboardService,
  ) {}

  @Post('invites/accept')
  @ApiOperation({
    summary: 'Join a profile you were invited to',
    description:
      'The invited address must match the accepting account. A token alone ' +
      "cannot be the only credential for access to a family's finances — an " +
      'intercepted link would otherwise be enough.',
  })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptInviteDto,
  ): Promise<ProfileMember> {
    return this.family.acceptInvite(dto.token, user);
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Every profile you belong to, aggregated — design 6.6',
    description:
      'Household totals, per-member breakdown, and commitments across the ' +
      'whole family sorted by urgency regardless of whose profile they sit ' +
      'on. Each row carries canSeeDetail, because an ADULT may see another ' +
      "member's totals but not the transactions behind them.",
  })
  familyDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FamilyDashboard> {
    return this.dashboard.forUser(user.id);
  }
}

@ApiTags('family')
@ApiBearerAuth()
@Controller('profiles/:profileId')
@UseGuards(ProfileAccessGuard)
export class FamilyController {
  constructor(
    private readonly family: FamilyService,
    private readonly limits: SpendLimitsService,
    private readonly allowances: AllowancesService,
    private readonly goals: GoalsService,
  ) {}

  // ─── Members ───────────────────────────────────────────────────────────────

  @Get('members')
  @RequireAction('profile:viewMembers')
  @ApiOperation({ summary: 'Who has access to this profile' })
  members(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MemberView[]> {
    return this.family.members(profileId, user.id);
  }

  @Post('members/invite')
  @RequireAction('member:invite')
  @ApiOperation({ summary: 'Invite someone by email' })
  invite(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteMemberDto,
  ): Promise<{ message: string }> {
    return this.family.invite(profileId, user.id, dto);
  }

  @Get('members/invites')
  @RequireAction('member:invite')
  @ApiOperation({ summary: 'Invitations still outstanding' })
  invites(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<ProfileInvite[]> {
    return this.family.listInvites(profileId);
  }

  @Delete('members/invites/:inviteId')
  @RequireAction('member:invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraw an invitation' })
  revokeInvite(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ): Promise<void> {
    return this.family.revokeInvite(profileId, inviteId);
  }

  @Patch('members/:memberId')
  @RequireAction('member:changeRole')
  @ApiOperation({
    summary: 'Change a member`s role',
    description:
      'Refuses to demote the last owner, and refuses to change your own ' +
      'role — either would leave a profile holding live financial data that ' +
      'nobody can administer.',
  })
  changeRole(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeRoleDto,
  ): Promise<ProfileMember> {
    return this.family.changeRole(profileId, memberId, user.id, dto);
  }

  @Delete('members/:memberId')
  @RequireAction('member:remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member' })
  removeMember(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.family.removeMember(profileId, memberId, user.id);
  }

  // ─── Spend limits ──────────────────────────────────────────────────────────

  @Get('spend-limits')
  @RequireAction('spendLimit:view')
  @ApiOperation({ summary: 'Limits and how much of each is used' })
  spendLimits(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<SpendLimitOverview> {
    return this.limits.overview(profileId);
  }

  @Put('spend-limits')
  @RequireAction('spendLimit:set')
  @ApiOperation({
    summary: 'Set monthly limits — OWNER only',
    description:
      'Limits nudge, they never block. The spec is explicit: refusing a ' +
      'transaction outright pushes kids to stop logging, which destroys the ' +
      'data the feature exists to produce. Exceeding a limit flags it and ' +
      'tells the owner; the spend is still recorded.',
  })
  setSpendLimits(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetSpendLimitsDto,
  ): Promise<SpendLimitOverview> {
    return this.limits.set(profileId, user.id, dto);
  }

  @Post('spend-limits/evaluate')
  @RequireAction('spendLimit:view')
  @ApiOperation({
    summary: 'Re-check limits and raise any nudges',
    description:
      'Nudges the child at 80% and tells the owners when a limit is passed — ' +
      'two audiences, because "you are getting close" is guidance and "they ' +
      'have gone over" is oversight.',
  })
  evaluate(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<{ approaching: string[]; exceeded: string[] }> {
    return this.limits.evaluate(profileId);
  }

  // ─── Allowance ─────────────────────────────────────────────────────────────

  @Get('allowance')
  @RequireAction('profile:view')
  @ApiOperation({ summary: 'Design 2c\'s "₹1,200 allowance · ₹740 left"' })
  allowance(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<AllowanceStatus> {
    return this.allowances.status(profileId);
  }

  @Put('allowance')
  @RequireAction('allowance:set')
  @ApiOperation({ summary: 'Grant a monthly allowance — OWNER only' })
  setAllowance(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetAllowanceDto,
  ): Promise<Allowance> {
    return this.allowances.set(profileId, user.id, dto);
  }

  @Delete('allowance')
  @RequireAction('allowance:set')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop the allowance' })
  removeAllowance(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<void> {
    return this.allowances.remove(profileId);
  }

  @Post('allowance/credit-due')
  @RequireAction('allowance:set')
  @ApiOperation({
    summary: 'Credit this month`s allowance',
    description:
      'Goes straight into the ledger, unlike a generated recurring payment: ' +
      'an allowance is a fixed figure an owner set, not a prediction, so ' +
      'there is nothing for the child to verify. Once per month, guarded.',
  })
  creditAllowance(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<{ credited: boolean; reason?: string }> {
    return this.allowances.creditDue(profileId);
  }

  // ─── Savings goals ─────────────────────────────────────────────────────────

  @Get('goals')
  @RequireAction('goal:manage')
  @ApiOperation({
    summary: 'Savings goals with progress',
    description:
      'Each goal reports what it takes per month to arrive on time — the ' +
      'number that turns a goal from a wish into a plan.',
  })
  listGoals(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<GoalView[]> {
    return this.goals.list(profileId);
  }

  @Post('goals')
  @RequireAction('goal:manage')
  @ApiOperation({ summary: 'Start saving for something' })
  createGoal(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: CreateGoalDto,
  ): Promise<GoalView> {
    return this.goals.create(profileId, dto);
  }

  @Patch('goals/:goalId')
  @RequireAction('goal:manage')
  @ApiOperation({ summary: 'Adjust a goal' })
  updateGoal(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: UpdateGoalDto,
  ): Promise<GoalView> {
    return this.goals.update(profileId, goalId, dto);
  }

  @Post('goals/:goalId/contribute')
  @RequireAction('goal:manage')
  @ApiOperation({
    summary: 'Put money towards a goal',
    description:
      'Records who contributed, because design 6.5 lets an owner add to a ' +
      'child\'s goal and "who put this in" is not something a running total ' +
      'can express.',
  })
  contribute(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ContributeDto,
  ): Promise<GoalView> {
    return this.goals.contribute(profileId, goalId, user.id, dto);
  }

  @Delete('goals/:goalId')
  @RequireAction('goal:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Abandon a goal' })
  removeGoal(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
  ): Promise<void> {
    return this.goals.remove(profileId, goalId);
  }
}
