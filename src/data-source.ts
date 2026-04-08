import "dotenv/config";
import { DataSource } from "typeorm";
import { GroundOwnerAccount } from "./auth/entities/ground-owner.entity";
import { UserAccount } from "./auth/entities/user.entity";
import { join } from "path";

const databasePort = Number(process.env.DB_PORT ?? "5432");

export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: databasePort,
  username: process.env.DB_USERNAME ?? "postgres",
  password: process.env.DB_PASSWORD ?? "postgres",
  database: process.env.DB_NAME ?? "hellofutsal",
  entities: [UserAccount, GroundOwnerAccount],
  migrations: [join(__dirname, "migrations", "*{.ts,.js}")],
});
