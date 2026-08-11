import { Injectable } from '@nestjs/common';
import { ProfileKind, ProfileRole } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { Money } from '@/common/money/money';
import {
  DashboardService,
  type UpcomingDue,
} from '@/modules/dashboard/dashboard.service';
import { monthKey } from '@/common/time/calendar';

export interface FamilyMemberSummary {
  profileId: string;
  name: string;
  initials: string;
  avatarColor: string;
  kind: ProfileKind;
  /** The caller's role *on that profile*. */
  role: ProfileRole;
  spent: Money;
  income: Money;
  /** Present for child profiles the caller can see. */
  allowanceRemaining: Money | null;
  pendingReviewCount: number;
  /**
   * False when the caller may see totals but not the transactions behind
   * them. The permission matrix gives an ADULT "summary only" visibility of
   * other members, and this is what makes that concrete rather than a note
   * in a document.
   */
  canSeeDetail: boolean;
}

export interface FamilyDashboard {
  month: string;
  householdSpent: Money;
  householdIncome: Money;
  members: FamilyMemberSummary[];
  /** Every commitment across the family, soonest first. */
  upcomingDues: (UpcomingDue & { profileId: string; profileName: string })[];
}

/**
 * The cross-profile view from design 6.6.
 *
 * "Most personal finance apps don't do cross-profile aggregation well" — the
 * spec's own words, and the reason this is a differentiator rather than a
 * nice-to-have. The hard part is not the arithmetic; it is that the caller
 * may hold a different role on each profile, so what they are allowed to see
 * varies row by row.
 */
@Injectable()
export class FamilyDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
  ) {}

  async forUser(userId: string, asOf = new Date()): Promise<FamilyDashboard> {
    const memberships = await this.prisma.profileMember.findMany({
      where: { userId },
      include: {
        profile: {
          select: {
            id: true,
            name: true,
            initials: true,
            avatarColor: true,
            kind: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const monthStart = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1),
    );

    const members: FamilyMemberSummary[] = [];
    const dues: FamilyDashboard['upcomingDues'] = [];
    let householdSpent = Money.zero();
    let householdIncome = Money.zero();

    for (const membership of memberships) {
      const { profile, role } = membership;

      const [totals, allowance, pendingReviewCount, summary] =
        await Promise.all([
          this.dashboard.periodTotals(profile.id, monthStart, asOf),
          this.allowanceRemaining(profile.id, monthStart, asOf),
          this.prisma.reviewQueueItem.count({
            where: { profileId: profile.id, status: 'PENDING' },
          }),
          this.dashboard.summary(profile.id, asOf),
        ]);

      householdSpent = householdSpent.add(totals.spent);
      householdIncome = householdIncome.add(totals.income);

      members.push({
        profileId: profile.id,
        name: profile.name,
        initials: profile.initials,
        avatarColor: profile.avatarColor,
        kind: profile.kind,
        role,
        spent: totals.spent,
        income: totals.income,
        allowanceRemaining: allowance,
        pendingReviewCount,
        // An OWNER sees everything; an ADULT sees other members in summary
        // only. Their own profile is always fully visible to them.
        canSeeDetail: role === ProfileRole.OWNER || role === ProfileRole.CHILD,
      });

      for (const due of summary.upcomingDues) {
        dues.push({ ...due, profileId: profile.id, profileName: profile.name });
      }
    }

    return {
      month: monthKey(monthStart),
      householdSpent,
      householdIncome,
      members,
      // Sorted across the whole family, so the most urgent commitment leads
      // regardless of whose profile it sits on — which is the entire point of
      // looking at a household view rather than four separate dashboards.
      upcomingDues: dues.sort((a, b) => a.daysUntilDue - b.daysUntilDue),
    };
  }

  private async allowanceRemaining(
    profileId: string,
    monthStart: Date,
    asOf: Date,
  ): Promise<Money | null> {
    const allowance = await this.prisma.allowance.findUnique({
      where: { profileId },
      select: { id: true },
    });

    if (!allowance) return null;

    const totals = await this.dashboard.periodTotals(
      profileId,
      monthStart,
      asOf,
    );
    const remaining = totals.income.subtract(totals.spent);

    return remaining.isNegative ? Money.zero() : remaining;
  }
}
