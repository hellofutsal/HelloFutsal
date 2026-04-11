import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import http from "node:http";
import https from "node:https";

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);

  @Cron("*/8 * * * *")
  async pingActiveEndpointEveryEightMinutes(): Promise<void> {
    const enabled = process.env.KEEP_ALIVE_SELF_PING_ENABLED === "true";
    if (!enabled) {
      return;
    }

    const targetUrl = this.resolveTargetUrl();
    this.logger.log(`Keep-alive cron triggered. Target=${targetUrl}`);

    try {
      await this.ping(targetUrl);
      this.logger.log(`Keep-alive ping succeeded: ${targetUrl}`);
    } catch (error) {
      this.logger.warn(
        `Keep-alive ping failed for ${targetUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private resolveTargetUrl(): string {
    const configuredUrl = process.env.KEEP_ALIVE_TARGET_URL?.trim();
    if (configuredUrl) {
      return configuredUrl;
    }

    const port = Number(process.env.PORT ?? 3000);
    return `http://127.0.0.1:${port}/system/active`;
  }

  private ping(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const requestFn = url.startsWith("https://") ? https.get : http.get;

      const req = requestFn(url, (res) => {
        res.resume();

        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 200 && statusCode < 300) {
          resolve();
          return;
        }

        reject(new Error(`Unexpected status code: ${statusCode}`));
      });

      req.setTimeout(5000, () => {
        req.destroy(new Error("Keep-alive request timed out"));
      });

      req.on("error", reject);
    });
  }
}
