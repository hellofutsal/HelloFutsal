// eslint-disable-next-line @typescript-eslint/no-var-requires
const SibApiV3Sdk = require("sib-api-v3-sdk");
import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class BrevoEmailService {
  private readonly logger = new Logger(BrevoEmailService.name);
  private readonly apiInstance: any;

  constructor() {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      this.logger.error("BREVO_API_KEY is not set in environment variables");
      throw new Error("BREVO_API_KEY is required");
    }
    SibApiV3Sdk.ApiClient.instance.authentications["api-key"].apiKey = apiKey;
    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  }

  async sendEmail({
    to,
    subject,
    htmlContent,
    senderName,
    senderEmail,
  }: {
    to: string;
    subject: string;
    htmlContent: string;
    senderName?: string;
    senderEmail?: string;
  }): Promise<void> {
    const sender = {
      name: senderName || "HelloFutsal",
      email: senderEmail || "no-reply@hellofutsal.com",
    };
    const receivers = [{ email: to }];
    try {
      await this.apiInstance.sendTransacEmail({
        sender,
        to: receivers,
        subject,
        htmlContent,
      });
      this.logger.log(`Email sent to ${to} via Brevo`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw error;
    }
  }
}
