import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * Standalone worker process — NestJS in application-context mode, no HTTP
 * server. The BullMQ worker registered in WorkerModule keeps the event loop
 * alive; SIGTERM/SIGINT drain via Nest shutdown hooks.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  new Logger('Bootstrap').log('AI worker started — consuming submission-review queue');
}

void bootstrap();
