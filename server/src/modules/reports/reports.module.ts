import { Module } from '@nestjs/common';
import { DashboardModule } from '@/modules/dashboard/dashboard.module';
import { BudgetsModule } from '@/modules/budgets/budgets.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [DashboardModule, BudgetsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
