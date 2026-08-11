import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';
import { Public } from '@/common/decorators/public.decorator';
import {
  LlmSettingsService,
  type LlmCredentialView,
} from './llm-settings.service';
import { publicRegistry } from './provider-registry';
import { SetLlmCredentialDto } from './dto/llm-settings.dto';

@ApiTags('llm-settings')
@Controller('llm')
export class LlmRegistryController {
  @Public()
  @Get('providers')
  @ApiOperation({
    summary: 'Providers and models a user may choose',
    description:
      'Public because the signup and marketing pages describe what the ' +
      'product supports, and because nothing here is specific to an account.',
  })
  providers() {
    return publicRegistry();
  }
}

@ApiTags('llm-settings')
@ApiBearerAuth()
@Controller('profiles/:profileId/llm-credential')
@UseGuards(ProfileAccessGuard)
export class LlmSettingsController {
  constructor(private readonly settings: LlmSettingsService) {}

  @Get()
  @RequireAction('profile:view')
  @ApiOperation({
    summary: 'Which provider this profile uses',
    description:
      'Never returns the key. Only whether one is set, which provider and ' +
      'model it is for, and a four-character hint - there is no endpoint that ' +
      'returns a stored key, by design, including to the person who saved it.',
  })
  get(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<LlmCredentialView> {
    return this.settings.get(profileId);
  }

  @Put()
  @RequireAction('profile:edit')
  @ApiOperation({
    summary: 'Use your own provider key',
    description:
      'Encrypted with AES-256-GCM before it is stored. The server must ' +
      'decrypt it to call the provider, so this is encryption at rest rather ' +
      'than zero-knowledge - what it protects against is a leaked dump, a ' +
      'stray backup or a support query, not someone with the server itself.',
  })
  set(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: SetLlmCredentialDto,
  ): Promise<LlmCredentialView> {
    return this.settings.set(profileId, dto);
  }

  @Delete()
  @RequireAction('profile:edit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Go back to the platform provider' })
  remove(@Param('profileId', ParseUUIDPipe) profileId: string): Promise<void> {
    return this.settings.remove(profileId);
  }
}
