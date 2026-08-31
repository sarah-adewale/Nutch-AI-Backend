import { Global, Module } from '@nestjs/common';
import { LimitsService } from './limits.service';
import { UsageService } from './usage.service';

@Global()
@Module({
  providers: [LimitsService, UsageService],
  exports: [LimitsService, UsageService],
})
export class LimitsModule {}
