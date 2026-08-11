-- AlterTable
ALTER TABLE "recurring_rules" ADD COLUMN     "endsOn" DATE,
ADD COLUMN     "maxOccurrences" INTEGER,
ADD COLUMN     "occurrenceCount" INTEGER NOT NULL DEFAULT 0;
