import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  ProfileKind,
  ProfileRole,
  type ProfileInvite,
  type ProfileMember,
} from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { MailerService } from '@/infra/mailer/mailer.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import { addDuration } from '@/modules/auth/token.service';
import type { AppConfig } from '@/config/configuration';

import type { InviteMemberDto, ChangeRoleDto } from './dto/family.dto';

/** Long enough to reach someone who checks email weekly. */
const INVITE_TTL = '7d';

export interface MemberView {
  id: string;
  userId: string;
  role: ProfileRole;
  name: string | null;
  email: string;
  joinedAt: Date;
  /** True for the caller, so the UI can render "you". */
  isYou: boolean;
}

@Injectable()
export class FamilyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('Family');
  }

  async members(profileId: string, callerId: string): Promise<MemberView[]> {
    const members = await this.prisma.profileMember.findMany({
      where: { profileId },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      role: member.role,
      name: member.user.displayName,
      email: member.user.email,
      joinedAt: member.joinedAt,
      isYou: member.userId === callerId,
    }));
  }

  /**
   * Invites someone to a profile.
   *
   * The invite records the *role* the inviter chose, so accepting cannot
   * escalate it - a CHILD invite stays a CHILD invite however the acceptance
   * request is shaped.
   */
  async invite(
    profileId: string,
    invitedByUserId: string,
    dto: InviteMemberDto,
  ): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();

    // An OWNER inviting a second OWNER is legitimate (two parents), but
    // nothing may invite at a role above the inviter's own - otherwise ADULT
    // could be granted the ability to remove the OWNER who invited them.
    const inviter = await this.prisma.profileMember.findUnique({
      where: { profileId_userId: { profileId, userId: invitedByUserId } },
      select: { role: true },
    });

    if (inviter?.role !== ProfileRole.OWNER) {
      throw new ForbiddenException('Only an owner can invite members');
    }

    const existing = await this.prisma.profileMember.findFirst({
      where: { profileId, user: { email } },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('That person is already a member');
    }

    // Any outstanding invite to the same address is superseded, so a resend
    // leaves exactly one usable link rather than a growing set.
    await this.prisma.profileInvite.updateMany({
      where: { profileId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('base64url');

    const invite = await this.prisma.profileInvite.create({
      data: {
        profileId,
        email,
        role: dto.role ?? ProfileRole.ADULT,
        tokenHash: hashToken(rawToken),
        invitedByUserId,
        expiresAt: addDuration(INVITE_TTL),
      },
      include: { profile: { select: { name: true } } },
    });

    const webUrl = this.config.get<AppConfig['webUrl']>('webUrl') ?? '';

    await this.mailer.send({
      to: email,
      subject: `You've been invited to ${invite.profile.name} on ExpenseIQ`,
      text:
        `You've been invited to join "${invite.profile.name}" as ` +
        `${(dto.role ?? ProfileRole.ADULT).toLowerCase()}.\n\n` +
        `${webUrl}/invite/${rawToken}\n\n` +
        `This link expires in 7 days.`,
    });

    this.logger.log('Invite sent', { profileId, role: invite.role });

    // Deliberately not revealing whether the address has an account - the
    // same reasoning as signup.
    return { message: 'Invitation sent' };
  }

  async listInvites(profileId: string): Promise<ProfileInvite[]> {
    return this.prisma.profileInvite.findMany({
      where: { profileId, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(profileId: string, inviteId: string): Promise<void> {
    const invite = await this.prisma.profileInvite.findUnique({
      where: { id: inviteId },
    });

    if (invite?.profileId !== profileId) {
      throw new NotFoundException('Invite not found');
    }

    await this.prisma.profileInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Accepts an invite, joining the caller to the profile.
   *
   * The invited email must match the accepting account. Without that check an
   * intercepted link would let anyone join a family's finances - the token
   * alone cannot be the only credential for something this sensitive.
   */
  async acceptInvite(
    rawToken: string,
    user: { id: string; email: string },
  ): Promise<ProfileMember> {
    const invite = await this.prisma.profileInvite.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { profile: { select: { id: true, name: true, kind: true } } },
    });

    if (!invite || invite.revokedAt) {
      throw new BadRequestException('This invitation is no longer valid');
    }

    if (invite.acceptedAt) {
      throw new BadRequestException('This invitation has already been used');
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This invitation has expired');
    }

    if (invite.email !== user.email.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }

    const already = await this.prisma.profileMember.findUnique({
      where: {
        profileId_userId: { profileId: invite.profileId, userId: user.id },
      },
    });

    if (already) {
      await this.prisma.profileInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return already;
    }

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.profileMember.create({
        data: {
          profileId: invite.profileId,
          userId: user.id,
          role: invite.role,
        },
      });

      await tx.profileInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      // A profile that gains a second member is no longer personal, and a
      // profile with a CHILD is a child profile. Design 2c renders these
      // differently ("Shared with Meera", the "Limited" badge), so the kind
      // has to keep up with reality rather than being set once at creation.
      const memberCount = await tx.profileMember.count({
        where: { profileId: invite.profileId },
      });

      if (invite.role === ProfileRole.CHILD) {
        await tx.profile.update({
          where: { id: invite.profileId },
          data: { kind: ProfileKind.CHILD },
        });
      } else if (
        memberCount > 1 &&
        invite.profile.kind === ProfileKind.PERSONAL
      ) {
        await tx.profile.update({
          where: { id: invite.profileId },
          data: { kind: ProfileKind.SHARED },
        });
      }

      this.logger.log('Invite accepted', {
        profileId: invite.profileId,
        role: invite.role,
      });

      return member;
    });
  }

  async changeRole(
    profileId: string,
    memberId: string,
    callerId: string,
    dto: ChangeRoleDto,
  ): Promise<ProfileMember> {
    const member = await this.findMember(profileId, memberId);

    if (member.userId === callerId) {
      // Otherwise the last owner could demote themselves and lock everyone
      // out of a profile nobody can then administer.
      throw new BadRequestException('You cannot change your own role');
    }

    await this.assertNotLastOwner(profileId, member, dto.role);

    return this.prisma.profileMember.update({
      where: { id: memberId },
      data: { role: dto.role },
    });
  }

  async removeMember(
    profileId: string,
    memberId: string,
    callerId: string,
  ): Promise<void> {
    const member = await this.findMember(profileId, memberId);

    if (member.userId === callerId) {
      throw new BadRequestException(
        'You cannot remove yourself. Transfer ownership first, or delete the profile.',
      );
    }

    await this.assertNotLastOwner(profileId, member, null);

    await this.prisma.profileMember.delete({ where: { id: memberId } });

    const remaining = await this.prisma.profileMember.count({
      where: { profileId },
    });

    if (remaining <= 1) {
      await this.prisma.profile.update({
        where: { id: profileId },
        data: { kind: ProfileKind.PERSONAL },
      });
    }
  }

  /**
   * A profile must always have at least one owner.
   *
   * Without this, demoting or removing the last owner leaves a profile with
   * live financial data that nobody can administer, invite to, or delete -
   * recoverable only by direct database access.
   */
  private async assertNotLastOwner(
    profileId: string,
    member: ProfileMember,
    newRole: ProfileRole | null,
  ): Promise<void> {
    if (member.role !== ProfileRole.OWNER) return;
    if (newRole === ProfileRole.OWNER) return;

    const owners = await this.prisma.profileMember.count({
      where: { profileId, role: ProfileRole.OWNER },
    });

    if (owners <= 1) {
      throw new BadRequestException(
        'This is the only owner. Promote someone else first.',
      );
    }
  }

  private async findMember(
    profileId: string,
    memberId: string,
  ): Promise<ProfileMember> {
    const member = await this.prisma.profileMember.findUnique({
      where: { id: memberId },
    });

    if (member?.profileId !== profileId) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
