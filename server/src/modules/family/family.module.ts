import { Module } from '@nestjs/common';
import { DashboardModule } from '@/modules/dashboard/dashboard.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { FamilyController, FamilyInviteController } from './family.controller';
import { FamilyService } from './family.service';
import { SpendLimitsService } from './spend-limits.service';
import { AllowancesService } from './allowances.service';
import { GoalsService } from './goals.service';
import { FamilyDashboardService } from './family-dashboard.service';

@Module({
  imports: [DashboardModule, NotificationsModule],
  controllers: [FamilyInviteController, FamilyController],
  providers: [
    FamilyService,
    SpendLimitsService,
    AllowancesService,
    GoalsService,
    FamilyDashboardService,
  ],
  exports: [SpendLimitsService, AllowancesService],
})
export class FamilyModule {}
