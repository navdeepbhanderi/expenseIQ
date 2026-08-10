-- AlterTable
ALTER TABLE "recurring_rules" ADD COLUMN     "label" TEXT,
ADD COLUMN     "onMonthEnd" BOOLEAN NOT NULL DEFAULT false;
