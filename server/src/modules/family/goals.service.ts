import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SavingsGoal } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { Money } from '@/common/money/money';

import type {
  ContributeDto,
  CreateGoalDto,
  UpdateGoalDto,
} from './dto/family.dto';

export interface GoalView {
  goal: SavingsGoal;
  saved: Money;
  target: Money;
  remaining: Money;
  percentComplete: number;
  isAchieved: boolean;
  /** Null when no target date is set, or the goal is already met. */
  perMonthToHitTarget: Money | null;
  contributions: {
    amountMinor: number;
    byUserId: string;
    note: string | null;
    createdAt: Date;
  }[];
}

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(profileId: string): Promise<GoalView[]> {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { profileId },
      include: { contributions: { orderBy: { createdAt: 'desc' }, take: 20 } },
      orderBy: [{ achievedAt: 'asc' }, { createdAt: 'desc' }],
    });

    return goals.map((goal) => this.toView(goal, goal.contributions));
  }

  async create(profileId: string, dto: CreateGoalDto): Promise<GoalView> {
    const goal = await this.prisma.savingsGoal.create({
      data: {
        profileId,
        name: dto.name.trim(),
        targetMinor: BigInt(dto.targetMinor),
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      },
    });

    return this.toView(goal, []);
  }

  async update(
    profileId: string,
    goalId: string,
    dto: UpdateGoalDto,
  ): Promise<GoalView> {
    await this.findOwned(profileId, goalId);

    const goal = await this.prisma.savingsGoal.update({
      where: { id: goalId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.targetMinor !== undefined
          ? { targetMinor: BigInt(dto.targetMinor) }
          : {}),
        ...(dto.targetDate !== undefined
          ? { targetDate: dto.targetDate ? new Date(dto.targetDate) : null }
          : {}),
      },
      include: { contributions: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });

    return this.toView(goal, goal.contributions);
  }

  /**
   * Adds to a goal, recording who.
   *
   * Design 6.5 lets an OWNER contribute to a CHILD's goal, so "who put this
   * in" is part of the record rather than something a running total can
   * express. Both the ledger row and the cached total are written together —
   * a total that disagrees with its own contributions is worse than either.
   */
  async contribute(
    profileId: string,
    goalId: string,
    byUserId: string,
    dto: ContributeDto,
  ): Promise<GoalView> {
    const existing = await this.findOwned(profileId, goalId);

    if (existing.achievedAt) {
      throw new BadRequestException('This goal has already been reached');
    }

    const goal = await this.prisma.$transaction(async (tx) => {
      await tx.goalContribution.create({
        data: {
          goalId,
          amountMinor: BigInt(dto.amountMinor),
          byUserId,
          note: dto.note ?? null,
        },
      });

      const saved = existing.savedMinor + BigInt(dto.amountMinor);

      return tx.savingsGoal.update({
        where: { id: goalId },
        data: {
          savedMinor: saved,
          // Stamped once, at the moment it is reached, so "achieved on" is a
          // real date rather than something recomputed on every read.
          ...(saved >= existing.targetMinor ? { achievedAt: new Date() } : {}),
        },
        include: {
          contributions: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });
    });

    return this.toView(goal, goal.contributions);
  }

  async remove(profileId: string, goalId: string): Promise<void> {
    await this.findOwned(profileId, goalId);
    await this.prisma.savingsGoal.delete({ where: { id: goalId } });
  }

  private toView(
    goal: SavingsGoal,
    contributions: {
      amountMinor: bigint;
      byUserId: string;
      note: string | null;
      createdAt: Date;
    }[],
  ): GoalView {
    const saved = Money.fromBigInt(goal.savedMinor);
    const target = Money.fromBigInt(goal.targetMinor);
    const shortfall = target.subtract(saved);
    const remaining = shortfall.isNegative ? Money.zero() : shortfall;

    return {
      goal,
      saved,
      target,
      remaining,
      percentComplete: Math.min(100, saved.ratioOf(target)),
      isAchieved: goal.achievedAt !== null,
      perMonthToHitTarget: this.monthlyRate(goal, remaining),
      contributions: contributions.map((c) => ({
        amountMinor: Number(c.amountMinor),
        byUserId: c.byUserId,
        note: c.note,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * What it takes per month to arrive on time.
   *
   * The number that turns a goal from a wish into a plan — and the reason a
   * savings goal belongs in a finance app rather than a notes app. Null when
   * there is no deadline or the target date has passed, because "₹Infinity a
   * month" helps nobody.
   */
  private monthlyRate(goal: SavingsGoal, remaining: Money): Money | null {
    if (!goal.targetDate || remaining.isZero) return null;

    const months =
      (goal.targetDate.getUTCFullYear() - new Date().getUTCFullYear()) * 12 +
      (goal.targetDate.getUTCMonth() - new Date().getUTCMonth());

    if (months <= 0) return null;

    return remaining.multiply(1 / months, 'ceil');
  }

  private async findOwned(
    profileId: string,
    goalId: string,
  ): Promise<SavingsGoal> {
    const goal = await this.prisma.savingsGoal.findUnique({
      where: { id: goalId },
    });

    if (goal?.profileId !== profileId) {
      throw new NotFoundException('Goal not found');
    }

    return goal;
  }
}
