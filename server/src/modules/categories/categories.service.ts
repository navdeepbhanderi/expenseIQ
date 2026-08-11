import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Category } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { deriveInitials } from '@/modules/profiles/domain/avatar';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

/** Default tint for a custom category, matching the neutral chip in design 2f. */
const DEFAULT_TINT = '#F1EBE0';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * System categories plus this profile's own, in one list.
   *
   * System rows carry `profileId: null` and are shared by every profile
   * rather than copied into each on creation. Copying would mean a fix to a
   * monogram or tint never reaches existing users, and would multiply one row
   * by the number of profiles for no benefit - nothing about a system category
   * is per-profile.
   */
  async list(profileId: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: {
        OR: [{ profileId: null }, { profileId }],
        archivedAt: null,
      },
      orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(profileId: string, dto: CreateCategoryDto): Promise<Category> {
    const name = dto.name.trim();

    // Checked explicitly rather than leaning on the unique constraint, because
    // the constraint only covers this profile's own rows - it cannot see the
    // system categories, which live under profileId: null.
    const clash = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        OR: [{ profileId: null }, { profileId }],
      },
      select: { id: true, isSystem: true },
    });

    if (clash) {
      throw new BadRequestException(
        clash.isSystem
          ? `"${name}" already exists as a built-in category`
          : `You already have a category called "${name}"`,
      );
    }

    return this.prisma.category.create({
      data: {
        profileId,
        name,
        // Same rule as profile monograms, so a custom category is visually
        // indistinguishable from a built-in one.
        monogram: dto.monogram?.toUpperCase() ?? deriveInitials(name),
        tint: dto.tint ?? DEFAULT_TINT,
        isIncome: dto.isIncome ?? false,
        isSystem: false,
      },
    });
  }

  async update(
    profileId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findOwned(profileId, categoryId);

    return this.prisma.category.update({
      where: { id: category.id },
      data: {
        ...(dto.name !== undefined
          ? { name: dto.name.trim(), monogram: deriveInitials(dto.name) }
          : {}),
        ...(dto.monogram !== undefined
          ? { monogram: dto.monogram.toUpperCase() }
          : {}),
        ...(dto.tint !== undefined ? { tint: dto.tint } : {}),
        ...(dto.isIncome !== undefined ? { isIncome: dto.isIncome } : {}),
      },
    });
  }

  /**
   * Archives rather than deletes.
   *
   * Transactions reference categories. A hard delete would either orphan
   * historical spend or cascade it away - both lose ledger history the user
   * did not ask to lose. Archiving hides the category from pickers while
   * leaving past transactions correctly categorised.
   */
  async archive(profileId: string, categoryId: string): Promise<void> {
    const category = await this.findOwned(profileId, categoryId);

    await this.prisma.category.update({
      where: { id: category.id },
      data: { archivedAt: new Date() },
    });
  }

  async usage(profileId: string, categoryId: string): Promise<number> {
    return this.prisma.transaction.count({
      where: { profileId, categoryId, deletedAt: null },
    });
  }

  private async findOwned(
    profileId: string,
    categoryId: string,
  ): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.isSystem || category.profileId === null) {
      throw new ForbiddenException(
        'Built-in categories cannot be changed. Create your own instead.',
      );
    }

    // A category belonging to another profile is not this caller's to touch,
    // and answering 404 keeps it from confirming the id exists at all.
    if (category.profileId !== profileId) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }
}
