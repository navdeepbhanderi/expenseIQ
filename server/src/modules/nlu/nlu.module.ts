import { Module } from '@nestjs/common';
import { NluController } from './nlu.controller';
import { NluService } from './nlu.service';

import { LlmSettingsModule } from '@/modules/llm-settings/llm-settings.module';

@Module({
  imports: [LlmSettingsModule],
  controllers: [NluController],
  providers: [NluService],
  exports: [NluService],
})
export class NluModule {}
