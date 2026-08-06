import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Category } from '@prisma/client';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('profiles/:profileId/categories')
@UseGuards(ProfileAccessGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Built-in and custom categories',
    description:
      'System categories are shared rather than copied per profile, so a fix ' +
      'to a monogram or tint reaches everyone.',
  })
  list(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<Category[]> {
    return this.categories.list(profileId);
  }

  @Post()
  @RequireAction('category:manage')
  @ApiOperation({ summary: 'Create a custom category' })
  create(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: CreateCategoryDto,
  ): Promise<Category> {
    return this.categories.create(profileId, dto);
  }

  @Patch(':categoryId')
  @RequireAction('category:manage')
  @ApiOperation({ summary: 'Rename or restyle a custom category' })
  update(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categories.update(profileId, categoryId, dto);
  }

  @Get(':categoryId/usage')
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'How many transactions use this category',
    description: 'Shown before archiving, so the user knows what it affects.',
  })
  async usage(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<{ transactions: number }> {
    return { transactions: await this.categories.usage(profileId, categoryId) };
  }

  @Delete(':categoryId')
  @RequireAction('category:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archive a custom category',
    description:
      'Archives rather than deletes — transactions reference categories, and ' +
      'a hard delete would either orphan historical spend or cascade it away.',
  })
  archive(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<void> {
    return this.categories.archive(profileId, categoryId);
  }
}
