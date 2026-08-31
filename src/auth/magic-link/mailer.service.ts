import { Injectable, Logger } from '@nestjs/common';

export interface MagicLinkEmail {
  to: string;
  link: string;
  expiresInMinutes: number;
}

/**
 * Delivery for sign-in links.
 *
 * No mail provider is chosen yet, so this logs the link instead of sending it,
 * which keeps local sign-in usable. Swap the body of `send` for a provider
 * call; nothing else needs to change.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  async send(email: MagicLinkEmail): Promise<void> {
    this.logger.log(
      `Magic link for ${email.to} (valid ${email.expiresInMinutes}m): ${email.link}`,
    );
  }
}
