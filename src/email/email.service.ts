import { Injectable, Logger } from "@nestjs/common";
import { BrevoEmailService } from "./brevo-email.service";
import { NodemailerService } from "./nodemailer.service";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly brevo: BrevoEmailService,
    private readonly nodemailer: NodemailerService,
  ) {}

  async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    senderName?: string;
    senderEmail?: string;
    from?: string;
  }): Promise<void> {
    try {
      await this.brevo.sendEmail({
        to: options.to,
        subject: options.subject,
        htmlContent: options.html,
        senderName: options.senderName,
        senderEmail: options.senderEmail,
      });
    } catch (brevoErr) {
      this.logger.warn(
        `Brevo failed, falling back to Nodemailer: ${brevoErr.message}`,
      );
      await this.nodemailer.sendMail({
        to: options.to,
        subject: options.subject,
        html: options.html,
        from: options.from || options.senderEmail,
      });
    }
  }
}
