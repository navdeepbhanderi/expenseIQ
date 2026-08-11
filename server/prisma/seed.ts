import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * System categories, seeded once with `profileId: null`.
 *
 * Monograms and tints come straight from design 2f. The design deliberately
 * chose two-letter monograms over an icon set - there's no icon library to
 * maintain and it scales to whatever custom categories a user invents, which
 * an icon picker can't. The tints are the exact hex values used in the
 * category tag row.
 */
const SYSTEM_CATEGORIES = [
  { name: 'Groceries', monogram: 'GR', tint: '#E7F0EA', isIncome: false },
  { name: 'Eating out', monogram: 'EA', tint: '#F6E5E1', isIncome: false },
  { name: 'Travel', monogram: 'TR', tint: '#EAE9F2', isIncome: false },
  { name: 'Utilities', monogram: 'UT', tint: '#FBEEDA', isIncome: false },
  { name: 'Health', monogram: 'HE', tint: '#E4EEF4', isIncome: false },
  { name: 'EMI & loans', monogram: 'EM', tint: '#FBEEDA', isIncome: false },
  { name: 'Fuel', monogram: 'FU', tint: '#F1EBE0', isIncome: false },
  { name: 'Shopping', monogram: 'SH', tint: '#F6E5E1', isIncome: false },
  { name: 'Entertainment', monogram: 'EN', tint: '#EAE9F2', isIncome: false },
  { name: 'Rent', monogram: 'RE', tint: '#E4EEF4', isIncome: false },
  { name: 'Education', monogram: 'ED', tint: '#E7F0EA', isIncome: false },
  { name: 'Other', monogram: 'OT', tint: '#F1EBE0', isIncome: false },
  { name: 'Income', monogram: 'IN', tint: '#E7F0EA', isIncome: true },
] as const;

async function main(): Promise<void> {
  console.log('Seeding system categories…');

  for (const [index, category] of SYSTEM_CATEGORIES.entries()) {
    // Not `upsert`: the identifying column is `profileId IS NULL`, and Prisma
    // rightly refuses a null in a compound unique lookup because SQL can't
    // match on it. Uniqueness here is enforced by the partial index
    // `categories_system_name_key` rather than by the composite constraint.
    const existing = await prisma.category.findFirst({
      where: { profileId: null, name: category.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: {
          monogram: category.monogram,
          tint: category.tint,
          isIncome: category.isIncome,
          sortOrder: index,
        },
      });
    } else {
      await prisma.category.create({
        data: {
          profileId: null,
          name: category.name,
          monogram: category.monogram,
          tint: category.tint,
          isIncome: category.isIncome,
          isSystem: true,
          sortOrder: index,
        },
      });
    }
  }

  const count = await prisma.category.count({ where: { isSystem: true } });
  console.log(`✔ ${count} system categories ready`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
