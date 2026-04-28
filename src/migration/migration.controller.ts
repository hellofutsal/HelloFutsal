import { Controller, Post, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

@Controller('migration')
export class MigrationController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  async runMigrations() {
    const shouldRun = this.configService.get<string>('RUN_MIGRATION') === 'true';
    
    if (!shouldRun) {
      return {
        success: false,
        message: 'Migration is disabled. Set RUN_MIGRATION=true to enable.',
      };
    }

    try {
      await this.dataSource.runMigrations();
      return {
        success: true,
        message: 'Migrations completed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  @Get('status')
  async getMigrationStatus() {
    try {
      const pendingMigrations = await this.dataSource.showMigrations();
      const hasPendingMigrations = Array.isArray(pendingMigrations) ? pendingMigrations.length > 0 : false;
      return {
        success: true,
        pendingMigrations: pendingMigrations,
        message: !hasPendingMigrations 
          ? 'All migrations are up to date' 
          : `${Array.isArray(pendingMigrations) ? pendingMigrations.length : 0} pending migrations`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to check migration status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
