import { Module } from '@nestjs/common';

import { AccessModule } from '@/modules/access/access.module';
import {
  LlmRegistryController,
  LlmSettingsController,
} from './llm-settings.controller';
import { LlmSettingsService } from './llm-settings.service';
import { LlmResolver } from './llm-resolver.service';

/**
 * Bring-your-own-key.
 *
 * ExpenseIQ is open source and self-hostable, so depending on the hosted
 * platform's provider quota should be a convenience, not a requirement.
 */
@Module({
  imports: [AccessModule],
  controllers: [LlmRegistryController, LlmSettingsController],
  providers: [LlmSettingsService, LlmResolver],
  exports: [LlmSettingsService, LlmResolver],
})
export class LlmSettingsModule {}
