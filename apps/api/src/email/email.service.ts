import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * Transactional email via Resend. When RESEND_API_KEY is not configured
 * (local dev, CI) the service degrades to logging the email instead of
 * sending — invites keep working end-to-end without a provider account.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.client = apiKey ? new Resend(apiKey) : null;
    this.from =
      config.get<string>('EMAIL_FROM') ?? 'Construct Coordinator <onboarding@resend.dev>';
    if (!this.client) {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged, not sent');
    }
  }

  async sendInviteEmail(
    to: string,
    projectName: string,
    inviterName: string,
    inviteLink: string,
  ): Promise<void> {
    const subject = `${inviterName} invited you to "${projectName}" on Construct Coordinator`;
    const html = `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <h2>You've been invited to a project</h2>
        <p><strong>${escapeHtml(inviterName)}</strong> invited you to join
        <strong>${escapeHtml(projectName)}</strong> on Construct Coordinator —
        the app their team uses to coordinate field work.</p>
        <p style="margin: 28px 0;">
          <a href="${inviteLink}"
             style="background: #1d6ef5; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none;">
            Open the project
          </a>
        </p>
        <p style="color: #667; font-size: 13px;">
          If you don't have the app yet, the link above will show you where to get it.
        </p>
      </div>`;

    if (!this.client) {
      this.logger.log(
        `[email:dev] To: ${to} | Subject: ${subject} | Link: ${inviteLink}`,
      );
      return;
    }

    const { error } = await this.client.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });
    if (error) {
      // Throw so the BullMQ job retries — never reaches the invite response.
      throw new Error(`Resend rejected the email: ${error.message}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
