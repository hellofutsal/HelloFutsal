import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { join } from "path";
import { AuthModule } from "./auth/auth.module";
import { GroundOwnerAccount } from "./auth/entities/ground-owner.entity";
import { UserAccount } from "./auth/entities/user.entity";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        host: configService.get<string>("DB_HOST", "localhost"),
        port: Number(configService.get<string>("DB_PORT", "5432")),
        username: configService.get<string>("DB_USERNAME", "postgres"),
        password: configService.get<string>("DB_PASSWORD", "postgres"),
        database: configService.get<string>("DB_NAME", "hellofutsal"),
        entities: [UserAccount, GroundOwnerAccount],
        autoLoadEntities: true,
        migrations: [join(__dirname, "migrations", "*{.ts,.js}")],
        migrationsRun:
          configService.get<string>("DB_MIGRATIONS_RUN", "true") === "true",
        synchronize:
          configService.get<string>("DB_SYNCHRONIZE", "false") === "true",
      }),
    }),
    AuthModule,
  ],
})
export class AppModule {}
