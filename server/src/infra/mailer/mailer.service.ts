import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '@/common/logger/app-logger.service';
import type { AppConfig } from '@/config/configuration';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Mail delivery, behind one interface.
 *
 * With no provider key configured it logs the message instead of sending —
 * including the verification link, so the whole signup flow is exercisable
 * locally with no third-party account and no network. That's a real
 * development affordance, not a stub: the alternative is every contributor
 * needing an API key before they can sign up once.
 */
@Injectable()
export class MailerService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('Mailer');
  }

  async send(email: Email): Promise<void> {
    const mail = this.config.get<AppConfig['mail']>('mail');

    if (!mail?.resendApiKey) {
      this.logger.log('Email not sent — no provider configured', {
        to: email.to,
        subject: email.subject,
        // The body carries the verification link, which is the entire point
        // of surfacing it in development.
        body: email.text,
      });
      return;
    }

    await this.deliver(mail, email);
  }

  private async deliver(
    mail: NonNullable<AppConfig['mail']>,
    email: Email,
  ): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mail.resendApiKey ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mail.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      // Logged, not thrown: a signup must not fail because the mail provider
      // is having a bad day. The user still exists and can request a resend.
      this.logger.error('Email delivery failed', undefined, {
        to: email.to,
        status: response.status,
        body,
      });
      return;
    }

    this.logger.log('Email sent', { to: email.to, subject: email.subject });
  }
}
