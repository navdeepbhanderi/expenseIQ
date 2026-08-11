-- Partial unique indexes for the nullable-scope rows.
--
-- Prisma's @@unique([profileId, name]) becomes a plain composite index, and in
-- Postgres a composite unique index does NOT constrain rows where one column
-- is NULL - because NULL is never equal to NULL. So every "global" or
-- "overall" row in these four tables was silently unconstrained:
--
--   categories   profileId IS NULL  → two system "Groceries" could coexist
--   merchants    profileId IS NULL  → duplicate global merchants, meaning the
--                                     normalisation cache misses and we pay
--                                     for an LLM call we already made
--   budgets      categoryId IS NULL → two overall budgets for the same month,
--                                     making "₹15,790 left of ₹80,000"
--                                     depend on row order
--   spend_limits categoryId IS NULL → two overall limits on one child profile
--
-- Prisma's schema language can't express a partial index, so these are
-- declared here and must be preserved through future migrations.

CREATE UNIQUE INDEX "categories_system_name_key"
  ON "categories" ("name")
  WHERE "profileId" IS NULL;

CREATE UNIQUE INDEX "merchants_global_normalizedName_key"
  ON "merchants" ("normalizedName")
  WHERE "profileId" IS NULL;

CREATE UNIQUE INDEX "budgets_overall_profileId_month_key"
  ON "budgets" ("profileId", "month")
  WHERE "categoryId" IS NULL;

CREATE UNIQUE INDEX "spend_limits_overall_profileId_key"
  ON "spend_limits" ("profileId")
  WHERE "categoryId" IS NULL;

-- Same NULL semantics on the ingestion idempotency constraint. A NULL
-- sourceRefId is legitimate (manual and voice entries have no external id),
-- so uniqueness must apply only where a reference actually exists - otherwise
-- the constraint is dead weight for exactly the EMAIL/SMS rows it exists for.
CREATE UNIQUE INDEX "review_queue_source_ref_key"
  ON "review_queue_items" ("source", "sourceRefId")
  WHERE "sourceRefId" IS NOT NULL;
