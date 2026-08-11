-- Both halves of a movement between the user's own accounts.
--
-- Paying a card bill is not spending: the expense was recorded when the card
-- was swiped. Every spend aggregate filters on isTransfer = false so a
-- payment cannot inflate the month's total, the budgets or the norms.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "isTransfer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "transferGroupId" TEXT;

-- The pair is always fetched together.
CREATE INDEX IF NOT EXISTS "transactions_transferGroupId_idx" ON "transactions"("transferGroupId");
