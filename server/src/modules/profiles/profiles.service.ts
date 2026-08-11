import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProfileKind, ProfileRole, type Profile } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { deriveInitials, pickAvatarColor } from './domain/avatar';
import type { CreateProfileDto, UpdateProfileDto } from './dto/profile.dto';
import { startOfMonth } from '@/common/time/calendar';

/** One row of the design 2c profile switcher. */
export interface ProfileSummary {
  id: string;
  name: string;
  kind: ProfileKind;
  initials: string;
  avatarColor: string;
  role: ProfileRole;
  isDefault: boolean;
  /** Other members' names - drives "Shared with Meera". */
  sharedWith: string[];
  monthSpendMinor: number;
  accountCount: number;
  pendingReviewCount: number;
  /** Populated in Phase 7; null until allowances exist. */
  allowanceRemainingMinor: number | null;
}

export interface DeleteImpact {
  profileId: string;
  name: string;
  accounts: number;
  transactions: number;
  reviewItems: number;
  /** False when this is the user's last profile - the spec forbids that. */
  deletable: boolean;
  reason?: string;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a profile and its owning membership in one transaction.
   *
   * A profile with no members is unreachable - no user could ever access it,
   * and it would sit in the database forever. The two writes must not be able
   * to come apart.
   */
  async create(
    userId: string,
    dto: CreateProfileDto,
    options: { isDefault?: boolean; initialsSeed?: string } = {},
  ): Promise<Profile> {
    const existingColors = await this.colorsUsedBy(userId);
    const seed = options.initialsSeed ?? dto.name;

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.create({
        data: {
          name: dto.name,
          kind: dto.kind ?? ProfileKind.PERSONAL,
          initials: deriveInitials(seed),
          avatarColor: pickAvatarColor(seed, existingColors),
          isDefault: options.isDefault ?? false,
          ...(dto.locale ? { locale: dto.locale } : {}),
          ...(dto.currency ? { currency: dto.currency } : {}),
        },
      });

      await tx.profileMember.create({
        data: {
          profileId: profile.id,
          userId,
          role: ProfileRole.OWNER,
        },
      });

      return profile;
    });
  }

  /**
   * The switcher payload.
   *
   * Counts are aggregated in grouped queries rather than per profile, so
   * adding a profile doesn't add round trips. Spend and review counts are
   * genuinely computed now even though both tables are empty until Phase 2 -
   * the shape is what the frontend codes against, and a hardcoded zero would
   * quietly stay zero once real data arrived.
   */
  async listForUser(userId: string): Promise<ProfileSummary[]> {
    const memberships = await this.prisma.profileMember.findMany({
      where: { userId },
      include: {
        profile: {
          include: {
            members: {
              include: {
                user: { select: { id: true, displayName: true, email: true } },
              },
            },
          },
        },
      },
      orderBy: [{ profile: { isDefault: 'desc' } }, { joinedAt: 'asc' }],
    });

    if (memberships.length === 0) return [];

    const profileIds = memberships.map((m) => m.profileId);
    const [spend, accounts, reviews] = await Promise.all([
      this.spendThisMonth(profileIds),
      this.countByProfile('account', profileIds),
      this.pendingReviewCounts(profileIds),
    ]);

    return memberships.map(({ profile, role }) => ({
      id: profile.id,
      name: profile.name,
      kind: profile.kind,
      initials: profile.initials,
      avatarColor: profile.avatarColor,
      role,
      isDefault: profile.isDefault,
      sharedWith: profile.members
        .filter((member) => member.userId !== userId)
        .map((member) => member.user.displayName ?? member.user.email),
      monthSpendMinor: spend.get(profile.id) ?? 0,
      accountCount: accounts.get(profile.id) ?? 0,
      pendingReviewCount: reviews.get(profile.id) ?? 0,
      allowanceRemainingMinor: null,
    }));
  }

  async findById(profileId: string): Promise<Profile> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  async update(profileId: string, dto: UpdateProfileDto): Promise<Profile> {
    const data: Prisma.ProfileUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
      // Initials follow a rename, but the colour deliberately does not - the
      // design uses colour as the profile's stable identity, and having it
      // shift under the user on a rename would break that.
      data.initials = deriveInitials(dto.name);
    }
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.avatarColor !== undefined) data.avatarColor = dto.avatarColor;

    await this.findById(profileId);

    return this.prisma.profile.update({ where: { id: profileId }, data });
  }

  /**
   * What deleting this profile would destroy.
   *
   * The spec requires showing the user what they're about to lose ("X
   * accounts, Y transactions") before they confirm.
   */
  async deleteImpact(userId: string, profileId: string): Promise<DeleteImpact> {
    const profile = await this.findById(profileId);

    const [accounts, transactions, reviewItems, ownedCount] = await Promise.all(
      [
        this.prisma.account.count({ where: { profileId } }),
        this.prisma.transaction.count({
          where: { profileId, deletedAt: null },
        }),
        this.prisma.reviewQueueItem.count({ where: { profileId } }),
        this.prisma.profileMember.count({ where: { userId } }),
      ],
    );

    const isLast = ownedCount <= 1;

    return {
      profileId,
      name: profile.name,
      accounts,
      transactions,
      reviewItems,
      deletable: !isLast,
      ...(isLast ? { reason: 'You cannot delete your only profile' } : {}),
    };
  }

  async remove(userId: string, profileId: string): Promise<void> {
    const impact = await this.deleteImpact(userId, profileId);

    if (!impact.deletable) {
      throw new BadRequestException(impact.reason);
    }

    const membership = await this.prisma.profileMember.findUnique({
      where: { profileId_userId: { profileId, userId } },
      select: { role: true },
    });

    if (membership?.role !== ProfileRole.OWNER) {
      throw new ForbiddenException('Only the owner can delete a profile');
    }

    const wasDefault = (await this.findById(profileId)).isDefault;

    await this.prisma.$transaction(async (tx) => {
      // Cascades handle members, accounts, transactions and review items.
      await tx.profile.delete({ where: { id: profileId } });

      if (!wasDefault) return;

      // Deleting the default would otherwise leave the user with no default,
      // and the switcher has nothing to pre-select.
      const next = await tx.profileMember.findFirst({
        where: { userId },
        orderBy: { joinedAt: 'asc' },
        select: { profileId: true },
      });

      if (next) {
        await tx.profile.update({
          where: { id: next.profileId },
          data: { isDefault: true },
        });
      }
    });
  }

  // ─── Aggregation helpers ───────────────────────────────────────────────────

  private async colorsUsedBy(userId: string): Promise<string[]> {
    const rows = await this.prisma.profileMember.findMany({
      where: { userId },
      select: { profile: { select: { avatarColor: true } } },
    });
    return rows.map((row) => row.profile.avatarColor);
  }

  private async spendThisMonth(
    profileIds: string[],
  ): Promise<Map<string, number>> {
    const start = startOfMonth();

    const rows = await this.prisma.transaction.groupBy({
      by: ['profileId'],
      where: {
        profileId: { in: profileIds },
        direction: 'DEBIT',
        deletedAt: null,
        date: { gte: start },
      },
      _sum: { amountMinor: true },
    });

    return new Map(
      rows.map((row) => [row.profileId, Number(row._sum.amountMinor ?? 0n)]),
    );
  }

  private async countByProfile(
    model: 'account',
    profileIds: string[],
  ): Promise<Map<string, number>> {
    const rows = await this.prisma[model].groupBy({
      by: ['profileId'],
      where: { profileId: { in: profileIds } },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.profileId, row._count._all]));
  }

  private async pendingReviewCounts(
    profileIds: string[],
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.reviewQueueItem.groupBy({
      by: ['profileId'],
      where: { profileId: { in: profileIds }, status: 'PENDING' },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.profileId, row._count._all]));
  }
}
