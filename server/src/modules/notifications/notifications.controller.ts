import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Notification } from '@prisma/client';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/notification.dto';

/** Backs the banners in design 6e. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('profiles/:profileId/notifications')
@UseGuards(ProfileAccessGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequireAction('profile:view')
  @ApiOperation({ summary: 'Banners for this profile' })
  list(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: ListNotificationsDto,
  ): Promise<Notification[]> {
    return this.notifications.list(profileId, {
      unreadOnly: query.unreadOnly ?? false,
      limit: query.limit,
    });
  }

  @Get('unread-count')
  @RequireAction('profile:view')
  @ApiOperation({ summary: 'Badge count' })
  async unreadCount(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<{ unread: number }> {
    return { unread: await this.notifications.unreadCount(profileId) };
  }

  @Post(':notificationId/read')
  @RequireAction('profile:view')
  @ApiOperation({ summary: 'Dismiss one banner' })
  markRead(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<Notification> {
    return this.notifications.markRead(profileId, notificationId);
  }

  @Post('read-all')
  @RequireAction('profile:view')
  @ApiOperation({ summary: 'Dismiss everything' })
  markAllRead(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<{ marked: number }> {
    return this.notifications.markAllRead(profileId);
  }
}
