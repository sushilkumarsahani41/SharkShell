import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DatabaseService } from './database/database.service';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Global prefix for all routes
    app.setGlobalPrefix('api');

    // CORS
    app.enableCors({
        origin: '*',
        credentials: true,
    });

    // Socket.IO adapter
    app.useWebSocketAdapter(new IoAdapter(app));

    // Initialize database tables
    const dbService = app.get(DatabaseService);
    await dbService.initDB();

    const port = parseInt(process.env.PORT || '3002', 10);
    await app.listen(port, '0.0.0.0');
    console.log(`\n  🚀 SharkShell Backend running at http://0.0.0.0:${port}\n`);
}
bootstrap();
