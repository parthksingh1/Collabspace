import { createTransport, Transporter } from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

const EMAIL_TEMPLATES: Record<string, { subject: (title: string) => string; html: (title: string, body: string) => string }> = {
  comment: {
    subject: (title) => `New comment: ${title}`,
    html: (title, body) => emailLayout(title, body, '#3b82f6'),
  },
  mention: {
    subject: (title) => `You were mentioned: ${title}`,
    html: (title, body) => emailLayout(title, body, '#8b5cf6'),
  },
  assignment: {
    subject: (title) => `Task assigned: ${title}`,
    html: (title, body) => emailLayout(title, body, '#22c55e'),
  },
  status_change: {
    subject: (title) => `Status update: ${title}`,
    html: (title, body) => emailLayout(title, body, '#f59e0b'),
  },
  invitation: {
    subject: (title) => `Invitation: ${title}`,
    html: (title, body) => emailLayout(title, body, '#6366f1'),
  },
  ai_suggestion: {
    subject: (title) => `AI Suggestion: ${title}`,
    html: (title, body) => emailLayout(title, body, '#ec4899'),
  },
  system: {
    subject: (title) => `CollabSpace: ${title}`,
    html: (title, body) => emailLayout(title, body, '#64748b'),
  },
};

function emailLayout(title: string, body: string, accentColor: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
      <div style="background:${accentColor};padding:4px 0;"></div>
      <div style="padding:24px 32px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <div style="width:32px;height:32px;border-radius:8px;background:#4f46e5;color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;">CS</div>
          <span style="font-size:14px;font-weight:600;color:#1e293b;">CollabSpace</span>
        </div>
        <h2 style="margin:0 0 12px;font-size:18px;color:#0f172a;">${title}</h2>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">${body}</p>
        <a href="${config.appUrl}" style="display:inline-block;padding:10px 20px;background:${accentColor};color:#fff;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;">View in CollabSpace</a>
      </div>
      <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">You received this because of your notification settings. <a href="${config.appUrl}/settings" style="color:#6366f1;">Manage preferences</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export class EmailService {
  private transporter: Transporter;
  private retryQueue: Array<{ to: string; subject: string; html: string; attempts: number }> = [];

  constructor() {
    this.transporter = createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });

    // Process retry queue every 30 seconds
    setInterval(() => this.processRetryQueue(), 30_000);
  }

  async sendNotificationEmail(to: string, title: string, body: string, type: string): Promise<void> {
    const template = EMAIL_TEMPLATES[type] || EMAIL_TEMPLATES.system;

    try {
      await this.transporter.sendMail({
        from: `"CollabSpace" <${config.smtpFrom}>`,
        to,
        subject: template.subject(title),
        html: template.html(title, body),
      });

      logger.info('Email sent', { to, type });
    } catch (error) {
      logger.error('Email send failed, queuing for retry', { to, error: (error as Error).message });
      this.retryQueue.push({ to, subject: template.subject(title), html: template.html(title, body), attempts: 0 });
    }
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    await this.transporter.sendMail({
      from: `"CollabSpace" <${config.smtpFrom}>`,
      to,
      subject: 'Welcome to CollabSpace!',
      html: emailLayout(
        `Welcome, ${name}!`,
        'Your account is ready. Start collaborating with your team using AI-powered docs, code editing, whiteboards, and project management.',
        '#6366f1'
      ),
    });
  }

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    await this.transporter.sendMail({
      from: `"CollabSpace" <${config.smtpFrom}>`,
      to,
      subject: 'Reset your password',
      html: emailLayout(
        'Password Reset',
        `Click the button below to reset your password. This link expires in 1 hour. If you didn't request this, you can safely ignore this email. <br/><br/><a href="${config.appUrl}/reset-password?token=${resetToken}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;">Reset Password</a>`,
        '#ef4444'
      ),
    });
  }

  private async processRetryQueue(): Promise<void> {
    const toRetry = this.retryQueue.splice(0, 10);
    for (const item of toRetry) {
      if (item.attempts >= 3) {
        logger.error('Email permanently failed after 3 retries', { to: item.to });
        continue;
      }

      try {
        await this.transporter.sendMail({
          from: `"CollabSpace" <${config.smtpFrom}>`,
          to: item.to,
          subject: item.subject,
          html: item.html,
        });
      } catch {
        item.attempts++;
        this.retryQueue.push(item);
      }
    }
  }
}
