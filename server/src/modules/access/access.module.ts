import { Global, Module } from '@nestjs/common';
import { ProfileAccessGuard } from './profile-access.guard';

@Global()
@Module({
  providers: [ProfileAccessGuard],
  exports: [ProfileAccessGuard],
})
export class AccessModule {}
