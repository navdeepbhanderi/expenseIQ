-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('OPEN', 'PAID', 'OVERDUE');

-- DropIndex
DROP INDEX "transactions_transferGroupId_idx";

-- CreateTable
CREATE TABLE "card_statements" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "statementDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "minimumDueMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "status" "StatementStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_statements_accountId_status_idx" ON "card_statements"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "card_statements_accountId_statementDate_key" ON "card_statements"("accountId", "statementDate");

-- AddForeignKey
ALTER TABLE "card_statements" ADD CONSTRAINT "card_statements_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
