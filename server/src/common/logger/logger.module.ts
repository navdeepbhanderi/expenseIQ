import { Global, Module } from '@nestjs/common';
import { AppLogger } from './app-logger.service';

/**
 * Global so every module can inject AppLogger without importing this.
 * AppLogger is TRANSIENT-scoped, so each consumer receives its own instance
 * and setContext('MyService') doesn't leak across modules.
 */
@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggerModule {}
