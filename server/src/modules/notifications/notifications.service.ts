import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationSeverity, type Notification } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';

/** The banner kinds design 6e renders. */
export const NOTIFICATION_KINDS = {
  dueSoon: 'due.soon',
  overdue: 'due.overdue',
  reviewWaiting: 'review.waiting',
  budgetApproaching: 'budget.approaching',
  budgetExceeded: 'budget.exceeded',
  integrationConnected: 'integration.connected',
  receiptFailed: 'receipt.failed',
} as const;

export type NotificationKind =
  (typeof NOTIFICATION_KINDS)[keyof typeof NOTIFICATION_KINDS];

export interface CreateNotification {
  profileId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  severity?: NotificationSeverity;
  payload?: Record<string, unknown>;
  /**
   * Makes the notification unique. A second create with the same key is
   * ignored rather than stacking a duplicate banner — "HDFC Card due in 7
   * days" must appear once, however many times the scan runs.
   */
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a banner, or does nothing if one with the same key already exists.
   *
   * Deduplication is checked against *unread* notifications only. Once the
   * user has seen and dismissed "your bill is due", a later cycle legitimately
   * raises it again — the key repeats across cycles by design, and only the
   * unread window should suppress it.
   */
  async raise(input: CreateNotification): Promise<Notification | null> {
    if (input.dedupeKey) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          profileId: input.profileId,
          kind: input.kind,
          readAt: null,
          payload: { path: ['dedupeKey'], equals: input.dedupeKey },
        },
        select: { id: true },
      });

      if (existing) return null;
    }

    return this.prisma.notification.create({
      data: {
        profileId: input.profileId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        severity: input.severity ?? NotificationSeverity.INFO,
        payload: {
          ...(input.payload ?? {}),
          ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
        },
      },
    });
  }

  async list(
    profileId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: {
        profileId,
        ...(options.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
    });
  }

  async unreadCount(profileId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { profileId, readAt: null },
    });
  }

  async markRead(
    profileId: string,
    notificationId: string,
  ): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (notification?.profileId !== profileId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(profileId: string): Promise<{ marked: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { profileId, readAt: null },
      data: { readAt: new Date() },
    });

    return { marked: result.count };
  }
}
