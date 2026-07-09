import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Global app configuration shared by main.ts and the e2e test harness,
 * so tests exercise the exact same pipeline as production.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
