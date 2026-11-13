import { Resend } from 'resend';
import { Logger } from '@nestjs/common';
import { Mail } from '../../application/common/ports';
export class ResendMail implements Mail {
  private readonly logger = new Logger(ResendMail.name);
  constructor(
    private readonly key: string,
    private readonly from: string,
    private readonly appUrl: string,
  ) {}
  private async send(
    to: string,
    subject: string,
    html: string,
    idempotencyKey?: string,
  ) {
    if (!this.key || !this.from) {
      this.logger.error({ code: 'EMAIL_NOT_CONFIGURED' });
      throw new Error('EMAIL_NOT_CONFIGURED');
    }
    const resend = new Resend(this.key);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await resend.emails.send(
          {
            from: this.from,
            to,
            subject,
            html: `<html lang="ar" dir="rtl"><body style="direction:rtl;text-align:right;font-family:Arial">${html}</body></html>`,
          },
          idempotencyKey ? { idempotencyKey } : undefined,
        );
        if (result.error) throw new Error('EMAIL_DELIVERY_FAILED');
        return;
      } catch {
        if (attempt === 2) {
          this.logger.error({ code: 'EMAIL_DELIVERY_FAILED' });
          throw new Error('EMAIL_DELIVERY_FAILED');
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
      }
    }
  }
  async reset(email: string, token: string) {
    void this.send(
      email,
      'إعادة تعيين كلمة المرور',
      `<p>لإعادة تعيين كلمة المرور خلال 30 دقيقة:</p><p><a href="${this.appUrl}/reset-password?token=${encodeURIComponent(token)}">إعادة تعيين كلمة المرور</a></p><p>إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>`,
    ).catch(() => {
      /* Failure is already logged; delivery never blocks password recovery. */
    });
  }
  async reminder(email: string, name: string, end: Date) {
    const escaped = name.replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]!,
    );
    const date = new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(end);
    await this.send(
      email,
      'تذكير بانتهاء الاشتراك',
      `<p>مرحباً ${escaped}</p><p>ينتهي اشتراكك في ${date} بتوقيت القاهرة. تواصل مع المدرب لتجديد الاشتراك.</p>`,
      `access-end/${email}/${end.toISOString()}`,
    );
  }
}
