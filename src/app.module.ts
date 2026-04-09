import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { join } from "path";
import { AuthModule } from "./auth/auth.module";
import { GroundOwnerAccount } from "./auth/entities/ground-owner.entity";
import { UserAccount } from "./auth/entities/user.entity";

function getDatabaseConfig(configService: ConfigService) {
  const host =
    configService.get<string>("DB_HOST") ??
    configService.get<string>("PGHOST") ??
    "localhost";
  const port = Number(
    configService.get<string>("DB_PORT") ??
      configService.get<string>("PGPORT") ??
      "5432",
  );
  const username =
    configService.get<string>("DB_USERNAME") ??
    configService.get<string>("PGUSER") ??
    "postgres";
  const password =
    configService.get<string>("DB_PASSWORD") ??
    configService.get<string>("PGPASSWORD") ??
    "postgres";
  const database =
    configService.get<string>("DB_NAME") ??
    configService.get<string>("PGDATABASE") ??
    "hellofutsal";

  const sslMode =
    configService.get<string>("DB_SSLMODE")?.toLowerCase() ??
    configService.get<string>("PGSSLMODE")?.toLowerCase() ??
    "disable";
  const channelBinding =
    (
      configService.get<string>("DB_CHANNEL_BINDING") ??
      configService.get<string>("PGCHANNELBINDING")
    )?.toLowerCase() === "require";

  return {
    host,
    port,
    username,
    password,
    database,
    ssl:
      sslMode === "require" ||
      sslMode === "verify-ca" ||
      sslMode === "verify-full"
        ? { rejectUnauthorized: false }
        : undefined,
    extra: channelBinding ? { enableChannelBinding: true } : undefined,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = getDatabaseConfig(configService);

        return {
          type: "postgres",
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          ssl: dbConfig.ssl,
          extra: dbConfig.extra,
          entities: [UserAccount, GroundOwnerAccount],
          autoLoadEntities: true,
          migrations: [join(__dirname, "migrations", "*{.ts,.js}")],
          migrationsRun:
            configService.get<string>("DB_MIGRATIONS_RUN", "true") === "true",
          synchronize:
            configService.get<string>("DB_SYNCHRONIZE", "false") === "true",
        };
      },
    }),
    AuthModule,
  ],
})
export class AppModule {}
