import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('migration/run')
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

  @Get('migration/status')
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

  @Get()
  root() {
    return {
      message: "Server is alive",
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
