import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MigrationController } from './migration.controller';

@Module({
  imports: [TypeOrmModule, ConfigModule],
  controllers: [MigrationController],
})
export class MigrationModule {}
