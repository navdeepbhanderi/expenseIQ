import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import { hint, keyFrom, open, seal } from '@/common/crypto/secret-box';
import { findProvider, isKnownModel } from './provider-registry';
import type { SetLlmCredentialDto } from './dto/llm-settings.dto';

/** What the API is willing to say about a stored credential. */
export interface LlmCredentialView {
  /** False when the profile is on the platform's own provider. */
  configured: boolean;
  provider: string | null;
  model: string | null;
  /** "gsk_…NCwF". Never the key. */
  keyHint: string | null;
  /** Null until a call with this key has actually succeeded. */
  lastUsedAt: string | null;
  /** The last provider error, so a key that stopped working says why. */
  lastError: string | null;
}

@Injectable()
export class LlmSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('LlmSettings');
  }

  async get(profileId: string): Promise<LlmCredentialView> {
    const row = await this.prisma.llmCredential.findUnique({
      where: { profileId },
    });

    if (!row) {
      return {
        configured: false,
        provider: null,
        model: null,
        keyHint: null,
        lastUsedAt: null,
        lastError: null,
      };
    }

    /*
     * Every field except the three that hold the secret.
     *
     * Selected explicitly rather than by deleting keys from the row: a
     * `delete row.ciphertext` is one refactor away from silently stopping, and
     * the failure mode is publishing everyone's API keys.
     */
    return {
      configured: true,
      provider: row.provider,
      model: row.model,
      keyHint: row.keyHint,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      lastError: row.lastError,
    };
  }

  async set(
    profileId: string,
    dto: SetLlmCredentialDto,
  ): Promise<LlmCredentialView> {
    const provider = findProvider(dto.provider);

    if (!provider) {
      throw new BadRequestException(`Unknown provider: ${dto.provider}`);
    }

    if (!isKnownModel(dto.provider, dto.model)) {
      throw new BadRequestException(
        `${provider.label} has no model "${dto.model}" in the supported list`,
      );
    }

    /*
     * Shape-checked before anything is stored.
     *
     * A key pasted from the wrong provider is the commonest mistake, and
     * without this it is only discovered at the next parse - several seconds
     * later, as an opaque 401 from a provider the user has to work out they
     * are even talking to.
     */
    const apiKey = dto.apiKey.trim();
    if (!provider.keyPattern.test(apiKey)) {
      throw new BadRequestException(
        `That does not look like a ${provider.label} key - they start with "${provider.keyPlaceholder.replace('…', '')}"`,
      );
    }

    const sealed = seal(apiKey, this.encryptionKey());

    const row = await this.prisma.llmCredential.upsert({
      where: { profileId },
      create: {
        profileId,
        provider: dto.provider,
        model: dto.model,
        keyHint: hint(apiKey),
        ...sealed,
      },
      update: {
        provider: dto.provider,
        model: dto.model,
        keyHint: hint(apiKey),
        // Cleared on every save: a new key has not failed yet, and leaving the
        // old error would report a key that was just replaced as broken.
        lastError: null,
        lastUsedAt: null,
        ...sealed,
      },
    });

    // Note what changed, never what was stored. The key must not reach the
    // logs by any route, including a well-meaning debug line.
    this.logger.log('LLM credential saved', {
      profileId,
      provider: row.provider,
      model: row.model,
    });

    return this.get(profileId);
  }

  async remove(profileId: string): Promise<void> {
    const deleted = await this.prisma.llmCredential.deleteMany({
      where: { profileId },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('This profile has no key of its own');
    }

    this.logger.log('LLM credential removed', { profileId });
  }

  /**
   * The decrypted key, for the moment of a call.
   *
   * The only place plaintext exists, and it is never returned to a controller
   * - `LlmResolver` hands it straight to an adapter and lets it go.
   */
  async reveal(
    profileId: string,
  ): Promise<{ provider: string; model: string; apiKey: string } | null> {
    const row = await this.prisma.llmCredential.findUnique({
      where: { profileId },
    });

    if (!row) return null;

    try {
      return {
        provider: row.provider,
        model: row.model,
        apiKey: open(row, this.encryptionKey()),
      };
    } catch (error) {
      /*
       * Undecryptable means the row was tampered with or the encryption key
       * has changed. Neither is recoverable here, and falling back to the
       * platform provider keeps the product working while the user is told to
       * re-enter their key.
       */
      this.logger.error(
        'Stored LLM credential could not be decrypted',
        undefined,
        {
          profileId,
          error: error instanceof Error ? error.message : String(error),
        },
      );

      await this.noteFailure(
        profileId,
        'Stored key could not be read - please enter it again',
      );

      return null;
    }
  }

  /** Records that a call with this key worked, for the "last used" line. */
  async noteSuccess(profileId: string): Promise<void> {
    await this.prisma.llmCredential.updateMany({
      where: { profileId },
      data: { lastUsedAt: new Date(), lastError: null },
    });
  }

  async noteFailure(profileId: string, message: string): Promise<void> {
    await this.prisma.llmCredential.updateMany({
      where: { profileId },
      // Truncated: a provider error can carry a long body, and this is shown
      // in a settings panel rather than read as a log.
      data: { lastError: message.slice(0, 300) },
    });
  }

  private encryptionKey(): Buffer {
    return keyFrom(this.config.get<string>('credentialEncryptionKey'));
  }
}
