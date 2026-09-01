import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { UsersService } from '../users/users.service';
import {
  AiProvider,
  ProviderName,
} from '../ai-router/providers/ai-provider.interface';
import { OpenAiService } from '../ai-router/providers/openai.service';
import { AnthropicService } from '../ai-router/providers/anthropic.service';

export interface ByokKeySummary {
  provider: ProviderName;
  /** Last four characters, so a person can tell which key is stored. */
  hint: string;
  createdAt: Date;
}

@Injectable()
export class ByokService {
  private readonly providers: Record<ProviderName, AiProvider>;

  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private users: UsersService,
    openai: OpenAiService,
    anthropic: AnthropicService,
  ) {
    this.providers = { openai, anthropic };
  }

  /** BYOK is a signed-in feature; the PRD gives anonymous users no access. */
  private async assertSignedIn(userId: string): Promise<void> {
    if (await this.users.isAnonymous(userId)) {
      throw new ForbiddenException('Sign in to connect your own API keys.');
    }
  }

  async list(userId: string): Promise<ByokKeySummary[]> {
    await this.assertSignedIn(userId);

    const keys = await this.prisma.byokKey.findMany({
      where: { userId },
      // The encrypted key is deliberately not selected: nothing outside
      // decryptFor has a reason to load it.
      select: { provider: true, keyMetadata: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return keys.map((key) => ({
      provider: key.provider as ProviderName,
      hint: (key.keyMetadata as { hint?: string } | null)?.hint ?? '',
      createdAt: key.createdAt,
    }));
  }

  async upsert(
    userId: string,
    provider: ProviderName,
    apiKey: string,
  ): Promise<ByokKeySummary> {
    await this.assertSignedIn(userId);

    const trimmed = apiKey.trim();

    // Checked before storing, so an invalid key is refused at the settings
    // screen rather than surfacing later as a failed prompt.
    if (!(await this.providers[provider].validateKey(trimmed))) {
      throw new BadRequestException(
        `That key was rejected by ${provider}. Check it and try again.`,
      );
    }

    const hint = trimmed.slice(-4);
    const record = await this.prisma.byokKey.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        provider,
        encryptedKey: this.encryption.encrypt(trimmed),
        keyMetadata: { hint },
      },
      update: {
        encryptedKey: this.encryption.encrypt(trimmed),
        keyMetadata: { hint },
      },
    });

    return { provider, hint, createdAt: record.createdAt };
  }

  async remove(userId: string, provider: ProviderName): Promise<void> {
    await this.assertSignedIn(userId);

    const deleted = await this.prisma.byokKey.deleteMany({
      where: { userId, provider },
    });

    if (deleted.count === 0) {
      throw new NotFoundException(`No ${provider} key is connected.`);
    }
  }

  /**
   * The plaintext key for a request, or undefined to fall back to the Nutch
   * key. A record that fails to decrypt is treated as absent rather than
   * breaking the prompt.
   */
  async decryptFor(
    userId: string,
    provider: ProviderName,
  ): Promise<string | undefined> {
    const record = await this.prisma.byokKey.findUnique({
      where: { userId_provider: { userId, provider } },
      select: { encryptedKey: true },
    });

    if (!record) return undefined;

    try {
      return this.encryption.decrypt(record.encryptedKey);
    } catch {
      return undefined;
    }
  }

  async providersWithKeys(userId: string): Promise<Set<ProviderName>> {
    const keys = await this.prisma.byokKey.findMany({
      where: { userId },
      select: { provider: true },
    });
    return new Set(keys.map((k) => k.provider as ProviderName));
  }
}
