import "dotenv/config";
import { DataSource } from "typeorm";
import { GroundOwnerAccount } from "./auth/entities/ground-owner.entity";
import { UserAccount } from "./auth/entities/user.entity";
import { join } from "path";

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
  ssl:
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
      ? { rejectUnauthorized: false }
      : undefined,
  extra: channelBindingRequired ? { enableChannelBinding: true } : undefined,
  entities: [UserAccount, GroundOwnerAccount],
  migrations: [join(__dirname, "migrations", "*{.ts,.js}")],
});
