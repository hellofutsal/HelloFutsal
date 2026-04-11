import "dotenv/config";
import { readFileSync } from "fs";
import { DataSource } from "typeorm";
import { GroundOwnerAccount } from "./auth/entities/ground-owner.entity";
import { UserAccount } from "./auth/entities/user.entity";
import { FieldRuleBook } from "./fields/entities/field-rule-book.entity";
import { Field } from "./fields/entities/field.entity";
import { FieldScheduleSettings } from "./fields/entities/field-schedule-settings.entity";
import { FieldSlot } from "./fields/entities/field-slot.entity";
import { join } from "path";

function resolveSslConfig(sslMode: string) {
  if (sslMode === "disable" || sslMode === "allow" || sslMode === "prefer") {
    return undefined;
  }

  if (sslMode === "require") {
    return { rejectUnauthorized: false };
  }

  if (sslMode === "verify-ca" || sslMode === "verify-full") {
    const sslRootCertPath =
      process.env.DB_SSLROOTCERT ?? process.env.PGSSLROOTCERT;
    const sslRootCertBase64 = process.env.DB_SSLROOTCERT_BASE64;

    const ca = sslRootCertBase64
      ? Buffer.from(sslRootCertBase64, "base64").toString("utf8")
      : sslRootCertPath
        ? readFileSync(sslRootCertPath, "utf8")
        : undefined;

    if (!ca) {
      throw new Error(
        `SSL mode ${sslMode} requires DB_SSLROOTCERT (path) or DB_SSLROOTCERT_BASE64`,
      );
    }

    return {
      rejectUnauthorized: true,
      ca,
    };
  }

  throw new Error(`Unsupported DB_SSLMODE/PGSSLMODE value: ${sslMode}`);
}

const databasePort = Number(
  process.env.DB_PORT ?? process.env.PGPORT ?? "5432",
);
const sslMode =
  process.env.DB_SSLMODE?.toLowerCase() ??
  process.env.PGSSLMODE?.toLowerCase() ??
  "disable";
const channelBindingRequired =
  (
    process.env.DB_CHANNEL_BINDING ?? process.env.PGCHANNELBINDING
  )?.toLowerCase() === "require";

export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? process.env.PGHOST ?? "localhost",
  port: databasePort,
  username: process.env.DB_USERNAME ?? process.env.PGUSER ?? "postgres",
  password: process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? "postgres",
  database: process.env.DB_NAME ?? process.env.PGDATABASE ?? "hellofutsal",
  ssl: resolveSslConfig(sslMode),
  extra: channelBindingRequired ? { enableChannelBinding: true } : undefined,
  entities: [
    UserAccount,
    GroundOwnerAccount,
    Field,
    FieldScheduleSettings,
    FieldRuleBook,
    FieldSlot,
  ],
  migrations: [join(__dirname, "migrations", "*{.ts,.js}")],
});
