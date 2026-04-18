import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./shared/filters/api-exception.filter";
import { ApiResponseInterceptor } from "./shared/interceptors/api-response.interceptor";
import { RequestLoggingInterceptor } from "./shared/interceptors/request-logging.interceptor";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(
    new RequestLoggingInterceptor(),
    new ApiResponseInterceptor(),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
