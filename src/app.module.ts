import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { readFileSync } from "fs";
import { join } from "path";
import { AuthModule } from "./auth/auth.module";
import { GroundOwnerAccount } from "./auth/entities/ground-owner.entity";
import { UserAccount } from "./auth/entities/user.entity";
import { Field } from "./fields/entities/field.entity";
import { FieldsModule } from "./fields/fields.module";

function resolveSslConfig(configService: ConfigService, sslMode: string) {
  if (sslMode === "disable" || sslMode === "allow" || sslMode === "prefer") {
    return undefined;
  }

  if (sslMode === "require") {
    return { rejectUnauthorized: false };
  }

  if (sslMode === "verify-ca" || sslMode === "verify-full") {
    const sslRootCertPath =
      configService.get<string>("DB_SSLROOTCERT") ??
      configService.get<string>("PGSSLROOTCERT");
    const sslRootCertBase64 = configService.get<string>(
      "DB_SSLROOTCERT_BASE64",
    );

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
    ssl: resolveSslConfig(configService, sslMode),
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
          entities: [UserAccount, GroundOwnerAccount, Field],
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
    FieldsModule,
  ],
})
export class AppModule {}
