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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Profile } from '@prisma/client';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/common/types/express';
import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import { CreateProfileDto, UpdateProfileDto } from './dto/profile.dto';
import {
  ProfilesService,
  type DeleteImpact,
  type ProfileSummary,
} from './profiles.service';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ApiOperation({
    summary: 'Profiles the caller belongs to',
    description:
      'Returns the full switcher payload from design 2c: monogram, tint, ' +
      'role, who it is shared with, spend this month, account count and ' +
      'pending review count.',
  })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ProfileSummary[]> {
    return this.profiles.listForUser(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a profile; the caller becomes its OWNER' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProfileDto,
  ): Promise<Profile> {
    return this.profiles.create(user.id, dto);
  }

  // Every route below is profile-scoped, so ProfileAccessGuard resolves the
  // caller's membership and role before the handler runs. Without a
  // membership it answers 404, not 403 — see the guard for why.
  @Get(':id')
  @UseGuards(ProfileAccessGuard)
  @RequireAction('profile:view')
  @ApiOperation({ summary: 'One profile' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Profile> {
    return this.profiles.findById(id);
  }

  @Patch(':id')
  @UseGuards(ProfileAccessGuard)
  @RequireAction('profile:edit')
  @ApiOperation({ summary: 'Rename or restyle a profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<Profile> {
    return this.profiles.update(id, dto);
  }

  @Get(':id/delete-impact')
  @UseGuards(ProfileAccessGuard)
  @RequireAction('profile:view')
  @ApiOperation({
    summary: 'What deleting this profile would destroy',
    description:
      'The spec requires showing the user what they are about to lose before ' +
      'they confirm, and refuses deletion of a last remaining profile.',
  })
  deleteImpact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteImpact> {
    return this.profiles.deleteImpact(user.id, id);
  }

  @Delete(':id')
  @UseGuards(ProfileAccessGuard)
  @RequireAction('profile:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a profile and everything in it' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.profiles.remove(user.id, id);
  }
}
